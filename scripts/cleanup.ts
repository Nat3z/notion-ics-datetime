import { Client, isFullPage } from '@notionhq/client';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const intervalMs: number = 48 * 60 * 60 * 1000;

export interface CleanupConfig {
	dataSourceId: string;
	statusProperty: string;
	doneStatus: string;
}

interface ScheduleState {
	nextRunAt: number;
}

export async function cleanup(
	notion: Client,
	config: CleanupConfig,
	dryRun: boolean,
	record: (pageId: string) => Promise<void>
): Promise<number> {
	const metadata = await notion.dataSources.retrieve({ data_source_id: config.dataSourceId });
	if (!('properties' in metadata)) throw new Error('Source metadata is unavailable');
	const status = metadata.properties[config.statusProperty];
	if (status?.type !== 'status' || !status.status.options.some((option) => option.name === config.doneStatus)) {
		throw new Error('Configured Done status does not exist; refusing cleanup');
	}

	// Collect every page before trashing so mutations cannot invalidate pagination.
	const candidates: string[] = [];
	let cursor: string | undefined;
	do {
		const result = await notion.dataSources.query({
			data_source_id: config.dataSourceId,
			filter: { property: config.statusProperty, status: { equals: config.doneStatus } },
			page_size: 100,
			start_cursor: cursor
		});
		for (const page of result.results) {
			if (isFullPage(page) && !page.in_trash && !page.archived) candidates.push(page.id);
		}
		if (result.has_more && !result.next_cursor) throw new Error('Missing pagination cursor');
		cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
	} while (cursor);
	if (dryRun) return candidates.length;

	let cleared: number = 0;
	for (const pageId of candidates) {
		const page = await notion.pages.retrieve({ page_id: pageId });
		if (!isFullPage(page) || page.in_trash || page.archived) continue;
		const status = page.properties[config.statusProperty];
		const belongsToSource: boolean = page.parent.type === 'data_source_id' &&
			page.parent.data_source_id.replaceAll('-', '') === config.dataSourceId.replaceAll('-', '');
		if (!belongsToSource || status?.type !== 'status' || status.status?.name !== config.doneStatus) continue;
		// Persist a recovery record before the write; a failed write leaves the item untouched.
		await record(pageId);
		await notion.pages.update({ page_id: pageId, in_trash: true });
		cleared++;
		console.log(JSON.stringify({ event: 'homework_trashed', pageId, at: new Date().toISOString() }));
		await sleep(350);
	}
	return cleared;
}

export async function loadSchedule(statePath: string, now: number): Promise<ScheduleState> {
	try {
		const state: ScheduleState = JSON.parse(await readFile(statePath, 'utf8'));
		if (!Number.isSafeInteger(state.nextRunAt) || state.nextRunAt <= 0) {
			throw new Error('Invalid cleanup schedule; refusing to reset it');
		}
		return state;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		const state: ScheduleState = { nextRunAt: now + intervalMs };
		await saveSchedule(statePath, state);
		return state;
	}
}

async function saveSchedule(statePath: string, state: ScheduleState): Promise<void> {
	await writeFile(`${statePath}.tmp`, JSON.stringify(state) + '\n', { mode: 0o600 });
	await rename(`${statePath}.tmp`, statePath);
}

async function main(): Promise<void> {
	const config: CleanupConfig = {
		dataSourceId: process.env.CLEANUP_DATA_SOURCE_ID ?? '',
		statusProperty: process.env.CLEANUP_STATUS_PROPERTY || 'Status',
		doneStatus: process.env.CLEANUP_DONE_STATUS || 'Done'
	};
	if (!config.dataSourceId || !process.env.NOTION_TOKEN) throw new Error('Cleanup source and token are required');
	const notion = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: '2025-09-03' });
	if (process.argv.includes('--dry-run')) {
		const matched = await cleanup(notion, config, true, async () => {});
		console.log(JSON.stringify({ event: 'cleanup_preview', matched, writes: 0 }));
		return;
	}
	const stateDir: string = process.env.CLEANUP_STATE_DIR || '/app/state';
	await mkdir(stateDir, { recursive: true });
	const statePath: string = join(stateDir, 'schedule.json');
	const state: ScheduleState = await loadSchedule(statePath, Date.now());
	console.log(JSON.stringify({ event: 'cleanup_scheduled', nextRunAt: new Date(state.nextRunAt).toISOString() }));
	while (true) {
		await sleep(Math.max(0, state.nextRunAt - Date.now()));
		try {
			const cleared = await cleanup(notion, config, false, async (pageId: string) => {
				await appendFile(join(stateDir, 'recovery.jsonl'), JSON.stringify({
					pageId, dataSourceId: config.dataSourceId, attemptedAt: new Date().toISOString()
				}) + '\n', { mode: 0o600 });
			});
			const nextState: ScheduleState = { nextRunAt: Date.now() + intervalMs };
			await saveSchedule(statePath, nextState);
			state.nextRunAt = nextState.nextRunAt;
			console.log(JSON.stringify({ event: 'cleanup_complete', cleared, nextRunAt: new Date(state.nextRunAt).toISOString() }));
		} catch {
			console.error('Cleanup failed; check Notion access and Update content capability. Retrying in 15 minutes.');
			await sleep(15 * 60 * 1000);
		}
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(() => {
		console.error('Cleanup startup failed; check configuration and persisted schedule.');
		process.exitCode = 1;
	});
}

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@notionhq/client';
import { cleanup, intervalMs, loadSchedule } from '../scripts/cleanup';
import type { CleanupConfig } from '../scripts/cleanup';

const config: CleanupConfig = { dataSourceId: 'source', statusProperty: 'Status', doneStatus: 'Done' };
const metadata = {
	object: 'data_source',
	properties: { Status: { type: 'status', status: { options: [{ name: 'Done' }] } } }
};

function page(id: string, status: string = 'Done', source: string = 'source') {
	return {
		object: 'page', id, url: 'https://notion.so/' + id, archived: false, in_trash: false,
		parent: { type: 'data_source_id', data_source_id: source },
		properties: { Status: { type: 'status', status: { name: status } } }
	};
}

function client(handle: (path: string, method: string, body: Record<string, unknown>) => unknown): Client {
	return new Client({
		auth: 'test',
		fetch: async (input, init) => new Response(JSON.stringify(handle(
			new URL(String(input)).pathname,
			init?.method ?? 'GET',
			JSON.parse(String(init?.body ?? '{}'))
		)), { headers: { 'Content-Type': 'application/json' } })
	});
}

test('dry run paginates all Done items without writes', async () => {
	let queries: number = 0;
	const notion = client((path, method, body) => {
		if (path === '/v1/data_sources/source') return metadata;
		assert.equal(path, '/v1/data_sources/source/query');
		assert.equal(method, 'POST');
		assert.deepEqual(body.filter, { property: 'Status', status: { equals: 'Done' } });
		queries++;
		return queries === 1
			? { results: [page('a')], has_more: true, next_cursor: 'cursor' }
			: (assert.equal(body.start_cursor, 'cursor'), { results: [page('b')], has_more: false, next_cursor: null });
	});
	assert.equal(await cleanup(notion, config, true, async () => assert.fail('No audit write expected')), 2);
	assert.equal(queries, 2);
});

test('only unchanged Done items in the configured source are trashed after recording recovery IDs', async () => {
	const recorded: string[] = [];
	const trashed: string[] = [];
	const notion = client((path, method, body) => {
		if (path === '/v1/data_sources/source') return metadata;
		if (path.endsWith('/query')) return { results: [page('done'), page('reopened'), page('moved')], has_more: false };
		const id: string = path.split('/').at(-1)!;
		if (method === 'GET') return page(id, id === 'reopened' ? 'In progress' : 'Done', id === 'moved' ? 'other' : 'source');
		assert.deepEqual(body, { in_trash: true });
		assert.ok(recorded.includes(id));
		trashed.push(id);
		return page(id);
	});
	assert.equal(await cleanup(notion, config, false, async (id: string) => { recorded.push(id); }), 1);
	assert.deepEqual(trashed, ['done']);
});

test('invalid status configuration and failed recovery logging prevent trash writes', async () => {
	const invalid = client(() => ({ properties: {} }));
	await assert.rejects(cleanup(invalid, config, false, async () => {}), /refusing cleanup/);
	const notion = client((path, method) => {
		assert.notEqual(method, 'PATCH');
		if (path === '/v1/data_sources/source') return metadata;
		if (path.endsWith('/query')) return { results: [page('done')], has_more: false };
		return page('done');
	});
	await assert.rejects(cleanup(notion, config, false, async () => { throw new Error('Disk full'); }), /Disk full/);
});

test('48-hour schedule survives restarts, preserves overdue runs, and refuses corrupted state', async () => {
	const dir: string = await mkdtemp(join(tmpdir(), 'notion-cleanup-'));
	const path: string = join(dir, 'schedule.json');
	try {
		const now: number = Date.now();
		assert.equal((await loadSchedule(path, now)).nextRunAt, now + intervalMs);
		assert.equal((await loadSchedule(path, now + intervalMs * 2)).nextRunAt, now + intervalMs);
		assert.equal(JSON.parse(await readFile(path, 'utf8')).nextRunAt, now + intervalMs);
		await writeFile(path, '{"nextRunAt":null}');
		await assert.rejects(loadSchedule(path, now), /Invalid cleanup schedule/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

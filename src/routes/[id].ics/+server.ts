import ical from 'ical-generator';
import { Client, isFullPage } from '@notionhq/client';
import type {
	DatabaseObjectResponse,
	QueryDataSourceResponse
} from '@notionhq/client/build/src/api-endpoints';

import config from '$lib/config';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const trailingSlash = 'never';

export const GET: RequestHandler = async ({ params, url }) => {
	const secret = url.searchParams.get('secret');
	if (!env.ACCESS_KEY || secret !== env.ACCESS_KEY) {
		return new Response('Forbidden', { status: 403 });
	}
	if (!env.NOTION_TOKEN) {
		return new Response('Notion integration is not configured', { status: 503 });
	}
	const notion = new Client({ auth: env.NOTION_TOKEN, notionVersion: '2025-09-03' });

	const { id } = params;

	const databaseMetadata = (await notion.databases.retrieve({
		database_id: id
	})) as DatabaseObjectResponse;
	const dataSource = databaseMetadata.data_sources[0];
	if (!dataSource) {
		return new Response('Share the original source database with the Notion integration', {
			status: 422
		});
	}

	const databaseEntries: QueryDataSourceResponse['results'] = [];
	let query: QueryDataSourceResponse | { has_more: true; next_cursor: undefined } = {
		has_more: true,
		next_cursor: undefined
	};
	while (query.has_more) {
		query = await notion.dataSources.query({
			data_source_id: dataSource.id,
			page_size: 100,
			start_cursor: query.next_cursor ?? undefined,
			filter: config.filter
		});
		databaseEntries.push(...query.results);
	}

	const filtered: {
		id: string;
		title: string;
		date: { start: string; end: string | null; time_zone: string | null };
	}[] = databaseEntries.flatMap((object) => {
		if (!isFullPage(object)) {
			return [];
		}
		const date = object.properties[env.DATE_PROPERTY || config.dateProperty];
		const title = object.properties[env.TITLE_PROPERTY || config.titleProperty];
		if (date?.type !== 'date' || !date.date || title?.type !== 'title') {
			return [];
		}
		return [
			{
				id: object.id,
				title: title.title.map((part) => part.plain_text).join('') || 'Untitled',
				date: date.date
			}
		];
	});

	const calendar = ical({
		name: dataSource.name,
		prodId: { company: 'Ming', language: 'EN', product: 'notion-ics' }
	});
	filtered.forEach((event) => {
		const allDay: boolean = /^\d{4}-\d{2}-\d{2}$/.test(event.date.start);
		const end: Date | undefined = allDay
			? new Date(event.date.end ?? event.date.start)
			: event.date.end ? new Date(event.date.end) : undefined;
		if (allDay && end) {
			// Notion date ranges are inclusive; ICS all-day end dates are exclusive.
			end.setUTCDate(end.getUTCDate() + 1);
		}
		calendar.createEvent({
			start: new Date(event.date.start),
			end,
			allDay,
			summary: event.title,
			busystatus: config.busy,
			id: event.id
		});
	});

	return new Response(calendar.toString(), {
		status: 200,
		headers: {
			'content-type': 'text/calendar'
		}
	});
};

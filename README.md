# Notion to ICS with Datetime

__Sync__ your __Notion database events__ (including date time) __to__ your own __Google, Apple, or Outlook calendar__ (via ICS feed). 
This fork runs locally with Docker Compose; Railway is not required.

__The pain point__: Notion database events can be shown in Notion Calendar, but, annoyingly, not in your personal Google/Apple/Outlook calendar. This repo completes the circle: it turns your Notion database into an ICS feed so your events sync to your own calendar apps.


## Features

- Convert a Notion database into an `.ics` feed
- Read and transfer Notion **datetime** values into calendar events
- Subscribe to the feed from calendar apps
- Run locally with Docker Compose

## Good fit for

Any situation where the event time matters, such as:
- Planning your own schedule
- Managing content posting dates
- Tracking bookings or appointments

## Example use case

Plan events in Notion, publish them as an ICS feed, and view them in your normal calendar app with the correct date and time.


## What you need

- A Notion integration token
- A Notion database ID
- A Notion database with a title field
- A Notion database with a date field
- Docker with Docker Compose


## Configuring

1. Copy `.env.example` to `.env`.
2. Set `NOTION_TOKEN` to your integration token and `ACCESS_KEY` to a secret generated with `openssl rand -hex 48`. Do not commit `.env` or share your feed URL.
3. Set `DATE_PROPERTY` and `TITLE_PROPERTY` in `.env` if needed. The defaults are `Date` and `Event name`. For a task database, for example, use `DATE_PROPERTY=Due date` and `TITLE_PROPERTY=Task name`. Filters and busy status can be adjusted in `src/lib/config.ts`.
4. Run `sudo docker compose up -d --build`.
5. Open `http://localhost:3210`. Your feed is `http://localhost:3210/<database-id>.ics?secret=<ACCESS_KEY>`.

The service is bound only to this machine's loopback interface and restarts automatically with Docker. After changing `.env`, run `sudo docker compose up -d --force-recreate`; after changing code, add `--build`. View status with `sudo docker compose ps`, logs with `sudo docker compose logs --tail=100`, and stop with `sudo docker compose down`.

Calendar clients must be able to reach this machine to subscribe. Cloud services such as Google Calendar cannot fetch a localhost-only feed. A remote client needs private networking or a separately configured HTTPS endpoint; this setup does not expose the service publicly.

### Private Tailscale access

Run `sudo tailscale serve --bg --https=6684 http://127.0.0.1:3210` on a machine with port 6684 available in its Serve configuration. Port 6684 spells NOTI on a phone keypad. Set `ORIGIN` in `.env` to the HTTPS URL printed by Tailscale, including `:6684`, then run `sudo docker compose up -d --force-recreate`. Use that HTTPS URL instead of localhost for the calendar feed. This endpoint is tailnet-only, not public, so clients need Tailscale connectivity. Google Calendar's cloud servers cannot fetch it.

Inspect existing listeners before configuring Serve with `tailscale serve status --json`. Disable only this listener with `sudo tailscale serve --https=6684 off`; do not reset unrelated services.

### Notion Steps
1. Create a new Notion integration by visiting https://www.notion.so/my-integrations. The feed needs "Read content"; automatic cleanup also needs "Update content". "No user information" is sufficient. This should be an internal integration.
2. Copy your internal integration token into `.env` as `NOTION_TOKEN`.
3. Share the database(s) you want with the integration by opening your database as a page, going to "Share", and selecting your integration.
4. Save your database's ID by copying the database URL and selecting the part between the slash and the question mark. The ID is 32 characters.

Note: For more information on the Notion steps, see the [Notion docs](https://developers.notion.com/docs/getting-started).

### Completed homework cleanup

The separate `cleanup` Compose service moves pages with `Status = Done` to Notion Trash every 48 hours. Set `CLEANUP_DATA_SOURCE_ID` to the original Homework source ID (not a database or view ID). Override `CLEANUP_STATUS_PROPERTY` and `CLEANUP_DONE_STATUS` if your schema differs. The integration needs **Read content** and **Update content** capabilities. No items are permanently deleted.

The first run is 48 hours after activation. The `cleanup-state` volume preserves the next run across restarts; an overdue run executes on startup. Failures retry after 15 minutes. Each candidate is checked again immediately before trashing, and page IDs are written to `/app/state/recovery.jsonl` for recovery. This is a periodic sweep of all currently Done items, not a two-day grace period for each item.

Preview without writes: `sudo docker compose run --rm --no-deps cleanup node --experimental-strip-types scripts/cleanup.ts --dry-run`. View the schedule and results with `sudo docker compose logs --tail=100 cleanup`. Disable cleanup with `sudo docker compose stop cleanup`; to keep it disabled through future Compose updates, run only the `app` service. Do not remove the state volume unless you intend to reset the schedule. Restore removed pages from Notion Trash.

## ☕ Support ☕

I like building small tools that make life a bit simpler. If this project helped you, you can support my work here:

☕ [Buy Me a Coffee](https://buymeacoffee.com/ming.lee) ☕

## Credits

This is an improved fork of [`tctree333/notion-ics`](https://github.com/tctree333/notion-ics), extended for real-world scheduling:
- proper datetime support
- Railway deployment

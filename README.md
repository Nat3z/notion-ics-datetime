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
3. Update `src/lib/config.ts` if needed. The defaults are `Date` and `Event name`.
4. Run `sudo docker compose up -d --build`.
5. Open `http://localhost:3210`. Your feed is `http://localhost:3210/<database-id>.ics?secret=<ACCESS_KEY>`.

The service is bound only to this machine's loopback interface and restarts automatically with Docker. After changing `.env`, run `sudo docker compose up -d --force-recreate`; after changing code, add `--build`. View status with `sudo docker compose ps`, logs with `sudo docker compose logs --tail=100`, and stop with `sudo docker compose down`.

Calendar clients must be able to reach this machine to subscribe. Cloud services such as Google Calendar cannot fetch a localhost-only feed. A remote client needs private networking or a separately configured HTTPS endpoint; this setup does not expose the service publicly.

### Notion Steps
1. Create a new Notion integration by visiting https://www.notion.so/my-integrations. We only need the "Read content" and "No user information" capabilities. This should be an internal integration.
2. Copy your internal integration token into `.env` as `NOTION_TOKEN`.
3. Share the database(s) you want with the integration by opening your database as a page, going to "Share", and selecting your integration.
4. Save your database's ID by copying the database URL and selecting the part between the slash and the question mark. The ID is 32 characters.

Note: For more information on the Notion steps, see the [Notion docs](https://developers.notion.com/docs/getting-started).

## ☕ Support ☕

I like building small tools that make life a bit simpler. If this project helped you, you can support my work here:

☕ [Buy Me a Coffee](https://buymeacoffee.com/ming.lee) ☕

## Credits

This is an improved fork of [`tctree333/notion-ics`](https://github.com/tctree333/notion-ics), extended for real-world scheduling:
- proper datetime support
- Railway deployment




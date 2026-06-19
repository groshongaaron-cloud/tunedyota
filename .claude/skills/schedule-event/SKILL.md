---
name: schedule-event
description: Use when adding, rescheduling, or removing a Tuned Yota tuning event (a city + date that shows on the booking flow at /find-your-exact-tune) — covers the multi-file sync, SEO regeneration, and deploy.
---

# Scheduling a Tuned Yota Event

## Overview

An event's existence is defined in **three files that must agree**, plus a server city registry that gates booking. Update one and miss another and you get a city that 404s on booking, a missing map pin, or stale Event SEO. This skill is the checklist that keeps them in sync.

## Sources of truth — keep in sync

| File | Role | What to set per event |
|---|---|---|
| `netlify/functions/lib/markets.js` | **Server city registry.** `getMarket()` gates booking AND supplies the state used in Event schema. | The city must exist here as `{ city, state, inst }` or booking returns `unknown-city`. |
| `netlify/functions/lib/events-data.js` | **Booking source of truth** (baked schedule), keyed by **lowercase** city. | `{ dateISO: "YYYY-MM-DD", label: "Mon D, YYYY", active: true, event: "<name>", details: "" }` |
| `site/find-your-exact-tune.html` → `const MARKETS` | **Client map + list.** Presence of `date`/`event` = it shows as an event. | `{ city, state, lat, lng, inst, date: "Mon D, YYYY", event: "<name>" }` (new city needs real lat/lng) |
| Google Sheet via `EVENTS_SHEET_ID` (optional) | If **set**, it OVERRIDES `events-data.js`. | Currently **unset** → the baked file is authoritative. If it's set, update the sheet too. |

`inst` is the installer key (`aaron` / `noah` / `cody`) and must match across `markets.js` and the HTML `MARKETS`. The HTML `date` and the `events-data.js` `dateISO` must be the **same calendar day**.

> **The SEO is GENERATED — do not hand-edit it.** The `<!-- SEO:EVENTS -->` JSON-LD block on the booking page and `site/sitemap.xml` are produced by `npm run build:seo` from `events-data.js` + `markets.js`. Editing them by hand is the #1 trap: your edits get overwritten on the next build and won't match the data, which fails `npm test`. You edit the **data** (the table above); the build writes the schema.

## Steps

1. **Pick the installer** (`aaron`/`noah`/`cody`) covering that city — a business call; use the same key everywhere.
2. **New city only:** add `{ city, state, inst }` to `markets.js`, and add a full entry to the HTML `MARKETS` with real `lat`/`lng` (look the coordinates up). Skip for an existing city.
3. **`events-data.js`:** add/update the lowercase-city entry with `dateISO`, `label`, `active: true`, `event`.
4. **HTML `MARKETS`:** set that city's `date:` and `event:` (same date as step 3).
5. **Regenerate SEO:** `npm run build:seo` — rebuilds the Event JSON-LD on the booking page and refreshes `sitemap.xml` from `events-data.js` + `markets.js`.
6. **`npm test`** — must pass. `tests/seo.test.js` asserts the page's Event schema matches `events-data.js`; a failure means you skipped `build:seo` or the city/state is missing from `markets.js`.
7. **Deploy:** commit, **push to `master`** (Netlify auto-deploys — a commit alone does NOT deploy). Confirm the deploy is `ready`, then `curl` the live `/find-your-exact-tune` for the new event.

## First event in a NEW state

If the event is in a state Tuned Yota hasn't served before (e.g. first-ever Kansas event), also:

- **`STATE_ORDER`** in `site/find-your-exact-tune.html` — append the 2-letter code (e.g. `"KS"`) or the market gets no filter tab.
- **`areaServed`** — add the state (`{"@type":"State","name":"Kansas"}`) to the business `areaServed`. The per-page business stub's list lives in `scripts/lib/seo-data.mjs` (`BUSINESS_STUB.areaServed`) — edit it there and `npm run build:seo` propagates it; the homepage `index.html` `AutomotiveBusiness` node and the `Service` blocks carry their own hand-written `areaServed` arrays to update too. Then re-run `build:seo` + `npm test`.

(For a new city in an already-served state, skip this section.)

## Removing or expiring an event

Set `active: false` in `events-data.js` (don't delete the line) and remove `date`/`event` from the HTML `MARKETS`, then `build:seo` → `npm test` → push. Past-dated events are auto-deactivated weekly by the **Event Schedule Freshness** cloud routine, so usually you don't do this by hand.

## Common mistakes

- **Hand-editing the `SEO:EVENTS` JSON-LD block or `sitemap.xml`** instead of running `npm run build:seo` → edits get overwritten on the next build and won't match `events-data.js`, so `npm test` fails. Edit the data, run the build.
- **In `events-data.js` but not `markets.js`** → booking returns `unknown-city` for that city. `markets.js` is the gate.
- **Forgot `npm run build:seo`** → `npm test` fails on Event-schema drift; live schema is stale.
- **HTML `date` label and `events-data.js` `dateISO` disagree** on the actual day.
- **New city missing `lat`/`lng`** → no map pin.
- **Committed but didn't push to `master`** → not deployed.

## Quick reference — existing city, just a new date

`events-data.js` (dateISO + active:true) + HTML `MARKETS` (date + event) → `npm run build:seo` → `npm test` → push `master` → verify live.

Related: the SEO generator is documented in the `seo-generator` project memory.

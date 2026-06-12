# Event Map — Google Sheet Live Source (Design)

**Date:** 2026-06-12
**Status:** Approved, implementing
**Page affected:** `site/find-your-exact-tune.html` (the event map + `MARKETS` data live here)

## Goal
Let Tuned Yota manage which market events appear on the website's event map by
editing a Google Sheet — no redeploy, no developer. Replaces the (infeasible)
idea of scraping Facebook events.

## Why not Facebook
- The public events page is login-walled and JS-rendered; an automated fetch sees
  only an empty shell.
- Facebook deprecated the Graph API Page-events endpoint in 2019; there is no
  supported API to read a Page's events.
- The only remaining path is logged-in headless scraping — against FB Terms,
  fragile, and fails silently. Rejected.

## Approach
Static site reads a published Google Sheet client-side. No backend, no API key.

### Data source
A Google Sheet, link-shared "anyone with the link can view". The site reads it via
the gviz CSV endpoint:
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv`
(Google serves this with permissive CORS; it works from the browser.)

### Sheet columns
| Column   | Required | Notes |
|----------|----------|-------|
| `Market` | yes | Must match a market `city` (case-insensitive), e.g. "Sioux Falls" |
| `Date`   | yes | Free text shown as-is, e.g. "Jul 12" or "July 12, 2026" |
| `Active` | no  | "no"/"false"/"0" hides the row; blank or "yes" shows it |
| `Event`  | no  | Event name shown in the map popup |
| `Details`| no  | Time/venue note shown in the map popup |

### Behavior
- All 15 markets always render as pins (full service area). Rows in the sheet add a
  `date` (+ optional `event`/`details`) to the matching market.
- The date renders in: the market list, the selected-market label, and the map pin
  tooltip. `event`/`details` render in the pin popup.
- **Fallback:** if the fetch fails or `EVENTS_SHEET_ID` is blank, the map uses dates
  baked into `MARKETS` (currently none). The map never errors or breaks.
- **Refresh:** Google caches the published CSV ~5 min; sheet edits appear on the live
  map within minutes, no redeploy.

### Market matching
Markets already carry fixed `lat`/`lng` + assigned `inst` (installer). The sheet only
controls *which* markets have an upcoming event and *when* — coordinates are never
entered by the user. A sheet row whose `Market` matches no known city is ignored
(logged to console). New cities are a code change (rare).

## Implementation
In `site/find-your-exact-tune.html`, near the `MARKETS` block:
1. Add `const EVENTS_SHEET_ID = "";` (set later when the sheet URL is provided).
2. Add a small CSV parser + `loadEvents()` that fetches the gviz CSV, maps rows onto
   markets by city, and sets `date`/`event`/`details`.
3. Call `loadEvents()` during map init; after it resolves, re-render the list and pin
   tooltips/popups. Wrap in try/catch so any failure is a silent no-op (fallback).
4. Add `date` to the marker tooltip and `event`/`details` to a bound popup.

~30–40 lines, no new dependencies.

## Setup (one-time, user)
1. Create the sheet with the columns above (template provided).
2. Share → "Anyone with the link" → Viewer.
3. Send the sheet URL. We extract the ID into `EVENTS_SHEET_ID` and redeploy once.

## Out of scope
- Editing events from the website (the sheet is the editor).
- Auto-importing from Facebook.
- Per-event RSVP/ticketing.

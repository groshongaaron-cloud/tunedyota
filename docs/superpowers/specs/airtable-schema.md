# Airtable Schema — Bookings + Priority Event List

Create one Airtable base (free tier is fine). Add a Personal Access Token with
`data.records:read` + `data.records:write` scoped to this base. Put the token in
`AIRTABLE_TOKEN` and the base id (`appXXXXXXXX`) in `AIRTABLE_BASE_ID` (Netlify env).

Default table names are `Bookings` and `Priority List` (override with
`AIRTABLE_BOOKINGS_TABLE` / `AIRTABLE_PRIORITY_TABLE`).

## Table: `Bookings`
| Field name   | Type               | Notes |
|--------------|--------------------|-------|
| City         | Single line text   | e.g. `Sioux Falls` (matches a market city) |
| Event Date   | **Single line text** | ISO date `YYYY-MM-DD`. Text (not a date field) so formula matching is exact. |
| Slot         | Single select      | One of: 9:00, 9:20, 9:40, 10:00, 10:20, 10:40, 11:00, 11:20, 11:40, 12:00, 12:20, 12:40 |
| Name         | Single line text   | |
| Phone        | Single line text   | |
| Email        | Single line text   | |
| Vehicle      | Single line text   | from the funnel |
| Goals        | Single line text   | from the funnel (may include a "· Note:" suffix) |
| Modifications | Single line text  | customer mods from the booking form (lift, tires, exhaust…) |
| Installer    | Single select      | `aaron` / `noah` / `cody` |
| Status       | Single select      | `Booked` (default), `Completed`, `No-show`, `Cancelled` |
| Source       | Single line text   | `find-your-exact-tune` |
| UTM Source   | Single line text   | optional |
| UTM Medium   | Single line text   | optional |
| UTM Campaign | Single line text   | optional |
| Created      | Created time       | auto |

A slot counts as taken when a row exists for `City + Event Date + Slot` with
`Status` ≠ `Cancelled`. To free a slot, set its row's Status to `Cancelled`.

## Table: `Priority List`
| Field name | Type             | Notes |
|------------|------------------|-------|
| City       | Single line text | |
| Name       | Single line text | |
| Phone      | Single line text | |
| Email      | Single line text | |
| Vehicle    | Single line text | |
| Goals      | Single line text | |
| Modifications | Single line text | customer mods; also set by the post-event rebook sweep |
| Source     | Single line text | intake channel, e.g. `intake:instagram` (from the staff intake form) |
| Installer  | Single select    | `aaron` / `noah` / `cody` |
| Reason     | Single select    | `No event scheduled` / `Event full` / `Rebook — not completed` |
| Event Date | Single line text | set when Reason = Event full |
| Requested Slot | Single select | preferred time picked on a full event (one of the 12 times); blank for no-event |
| Notified   | Checkbox         | your workflow: tick when you've reached out |
| Created    | Created time     | auto |

> `typecast: true` is sent on create, so single-select option values are created
> automatically on first use if you don't pre-add them — but pre-adding the Slot,
> Installer, Status, and Reason options keeps the grid tidy.

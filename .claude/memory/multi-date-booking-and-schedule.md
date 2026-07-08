---
name: multi-date-booking-and-schedule
description: Multi-date-per-city booking rule (LIVE) + the full 2026-27 event calendar now scheduled live
metadata: 
  node_type: memory
  type: project
  originSessionId: 5637dd1d-6d45-474a-8bc9-53825c7f6318
---

**Multi-date-per-city booking — SHIPPED & LIVE 2026-07-06** (merged to master, feature
built via full brainstorm→spec→plan→subagent-TDD flow; spec `docs/superpowers/specs/2026-07-06-multi-date-city-booking-design.md`, plan `docs/superpowers/plans/2026-07-06-multi-date-city-booking.md`).

**The rule:** a city can hold MULTIPLE events. Funnel shows the city's SOONEST upcoming
date; if it doesn't work → **"See next date →"** (that city's next date, soonest-first)
OR **"Join the Priority Wait List."** No more dates left → waitlist only. No cross-city
fallback (owner cut it). Single-date & no-event cities behave exactly as before.

**Architecture:** `netlify/functions/lib/events-data.js` city value is now an OBJECT *or*
an ARRAY of events; `lib/events.js` normalizes via `asArray` and exposes
`getEventsForCity`(future-filtered, soonest-first) / `getCurrentEventForCity` /
`getAllActiveEvents`(flat, ops) / `flattenEvents`. `availability.js` returns `events:[...]`
soonest-first (+ back-compat mirror of the soonest). Funnel posts the shown event's
`dateISO`; `book.js` books that specific date (invalid dateISO → waitlist). Ops
(reminders/roster/reports/SEO) flatten so EACH date gets its own roster/reminders/schema.
`intake.js` still defaults to soonest. See [[held-branches-ship-checklist]], [[funnel-step5-layout-and-verification]].

**Full calendar SCHEDULED LIVE, then REVISED 2026-07-07** (commit 0e31c48): all events in
`docs/events/2026-2027-event-plan.md` are real bookable dates — **42 active events**.
**Owner-approved season revision:** now runs **mid-March → 2nd week of November** (2026
tail extended with an Oct 17→Nov 14 fall-finale run; 2027 opens Mar 13, closes Nov 13). The
**five priority markets — Twin Cities, Omaha, Iowa (Des Moines/Cedar Rapids/Davenport),
Madison, Milwaukee — each run ~3×** and own the cold-shoulder dates (Mar–Apr, Oct–Nov);
smaller markets stay May–Sep. **Lincoln, NE reverted to waitlist-only**; Sioux City stays
(Omaha Jun 26 + Sioux City Jun 27 swing). **Known constraint: Aaron ~13 weekends in 2027**
(owns 3 priority markets + northern tier) → rebalance when the new installer is onboarded
(hand off Fargo/Duluth + the 3 waitlist cities). Home-base optimized, holiday-safe — see
[[installer-home-bases]].

**Duluth Jul-25-2026 reschedule — NOT NEEDED** (owner decision 2026-07-07). A prior
session left a dangling "reschedule Duluth" thread (owner had mentioned not attending);
owner confirmed 2026-07-07 the event stays as-is on **Jul 25, 2026 (Hermantown, MN)**. Do
not resurface this as an open task.

**OPEN — owner action:** venue addresses. As of 2026-07-07, **38 of 42 active events are
"To Be Released"**; only 4 set (Duluth Jul-25 Hermantown, Madison Aug-1, Milwaukee Aug-22
Grafton, Twin Cities Aug-29 Burnsville). The authoritative, self-regenerating checklist is
**`docs/events/owner-action-items.md`** — owner provides an address on demand ("Set the
[city] [date] venue to …") and Claude sets it live. `scripts/send-venue-reminder.cjs`
nudges installers about TBR venues.

---
name: cloud-routines
description: Three scheduled cloud agents (routines) monitor tunedyota.com and post to Slack; manage at claude.ai/code/routines
metadata: 
  node_type: memory
  type: project
  originSessionId: e75d74d1-a76c-483c-83d5-58cb118bc0c4
---

Set up 2026-06-18 via `/schedule`. Three Anthropic-cloud routines run against the connected repo `github.com/groshongaaron-cloud/tunedyota` (model `claude-sonnet-4-6`). Manage/disable/delete at https://claude.ai/code/routines (the RemoteTrigger API can list/get/create/update/run but CANNOT delete).

- **TunedYota — Deploy & Uptime Watch** (`trig_01QLvJCxV1PwoyEMKhRfWKRW`) — daily 13:00 UTC (8am CDT). Read-only: curls 9 live URLs for HTTP 200 + checks sitemap (19 locs), Event/`tf-proof`/`og:title` markup, the `availability` function, and homepage JSON-LD parse. No repo changes.
- **TunedYota — Event Schedule Freshness** (`trig_015HVaAPwEqh8UbBkGXfW9Tc`) — Mondays 13:00 UTC. Flips genuinely past-dated events in `netlify/functions/lib/events-data.js` to `active:false`, runs `npm run build:seo` + `npm test`, opens a PR. No-ops (and still posts) when all events are upcoming.
- **TunedYota — SEO & Booking Smoke Test** (`trig_01CdqTjrADVdTERzwB3g8DFe`) — Thursdays 13:00 UTC. Runs `npm test`, validates live schema/sitemap/OG + the `/services` breadcrumb stays gone, hits `availability`; opens a PR if only SEO drift tests fail. (Booking-backend health is thus checked daily by the uptime watch and weekly here — no separate booking routine.)
- **TunedYota — Monthly GSC Review Reminder** (`trig_014SdCp5ifkJ2hPwmnwgt8gj`) — 1st of month 13:00 UTC. Read-only: runs the public checks it can (sitemap 200/19, robots sitemap line, rich-result markup intact) then Slacks the owner a checklist to do the manual Search Console review (it can't log into GSC). A "Reviews refresh" reminder was considered but NOT created (owner declined).

**Notifications:** OAuth/claude.ai connectors (incl. Slack) do NOT reach headless cron runs, so notifications use a **Slack Incoming Webhook** that each routine's prompt curls (works headlessly). The webhook URL is embedded in each routine's prompt/config — treat it as a secret; rotate it in Slack if leaked (the URL is NOT stored in this memory on purpose). Each agent posts its PASS/FAIL summary on every run, so a *missing* Slack message itself signals a run didn't fire. To re-wire/rotate: update each routine's prompt via RemoteTrigger with the new webhook URL.

To change schedules/prompts, use `/schedule` → Update (or RemoteTrigger `update`). Cron is UTC; CDT = UTC−5 (summer).

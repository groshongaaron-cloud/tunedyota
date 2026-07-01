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
- ~~**TunedYota — Monthly GSC Review Reminder** (`trig_014SdCp5ifkJ2hPwmnwgt8gj`)~~ — **DELETED 2026-07-01.** Replaced by the local search-visibility measurement engine (below). So only 3 cloud routines remain (uptime / event-freshness / SEO smoke).

**Search-visibility measurement runs LOCALLY now, not as a cloud routine.** A cloud `search-visibility-tracker` routine was built + deleted 2026-07-01 (cloud routines can't `git push`/PR — read-only GitHub integration — and `RemoteTrigger` echoes embedded secrets into the transcript). Replaced by a **Windows Task Scheduler** job `TunedYota Search Visibility` (monthly, 1st 08:00) → `~/.tunedyota/run-measure.cmd` → `node scripts/measure/run-local.mjs`, secrets in `~/.tunedyota/measure.config.json`. Pulls GSC + Perplexity → snapshot in `docs/seo/measurements/` → Slack report → local `git push`. See [[search-ai-visibility-program]] Phase 3 + `docs/seo/measurement-local.md`.

**Notifications:** OAuth/claude.ai connectors (incl. Slack) do NOT reach headless cron runs, so notifications use a **Slack Incoming Webhook** that each routine's prompt curls (works headlessly). The webhook URL is embedded in each routine's prompt/config — treat it as a secret; rotate it in Slack if leaked (the URL is NOT stored in this memory on purpose). Each agent posts its PASS/FAIL summary on every run, so a *missing* Slack message itself signals a run didn't fire. To re-wire/rotate: update each routine's prompt via RemoteTrigger with the new webhook URL.

To change schedules/prompts, use `/schedule` → Update (or RemoteTrigger `update`). Cron is UTC; CDT = UTC−5 (summer).

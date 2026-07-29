# Tuned Yota Content-Ops Automation — Design

**Date:** 2026-07-29 · **Status:** Approved by Aaron (Approach A)

## Problem

The NotebookLM content engine (`C:\Users\grosh\TunedYota-NotebookLM\`) is built, but
every hand-off is manual chat ritual: Aaron downloads infographic exports, then has to
remember to tell Claude "infographics are in the output folder," then the publish loop
runs from memory/README instructions. Upstream, trend-scout finds content opportunities
but nothing routes them toward the NotebookLM packs. There is no single command to see
pipeline state.

NotebookLM has **no API** — the generate/download step is permanently Aaron's. Everything
before it (candidate feed) and after it (detect → verify → stage → notify → ship) is
automatable.

## Decisions (made with Aaron)

1. **Scope:** full content-ops loop (candidates → watcher → publish → notify), not just
   the publish step.
2. **Autonomy:** pipeline auto-runs through **staging**; nothing deploys to the live site
   or social without Aaron's explicit "ship it."
3. **Notifications:** Slack for real-time hand-offs, Gmail for the digest layer that
   already exists (trend-scout routines). Transport amended during planning — see
   Component 3: the existing Netlify notify relay, not a new n8n workflow.
4. **Architecture:** Approach A — Claude Code owns files + judgment (skills + local
   watcher cron), the existing notify relay owns messaging, cloud routines own
   scheduled research. n8n is never the brain (it cannot see the local filesystem).

## Components

### 1. `/ty-publish` skill — `~\.claude\skills\ty-publish\SKILL.md`

Encodes the publish loop from `TunedYota-NotebookLM\output\README.md` with three modes:

- **`check`** (watcher entry point): diff `output\*.png` against the manifest
  `output\.processed.json`. No new files → exit silently, no notification. New files →
  run `stage`.
- **`stage`** (default when new exports exist):
  1. Per-pack checklist verification — retail prices vs the July 2026 price file,
     attribution strings (+85 hp claim only with Magnuson attribution + 91-octane,
     Performance Tune tier only), "throttle response controller" never "pedal box",
     six-state territory on public footers, every number traceable to a notebook source.
  2. Optimize: compressed web copies into the site repo's existing image folder under
     `site\` (implementation pins the exact path by following where current page images
     live — do not invent a new folder convention).
  3. Alt text + `ImageObject` JSON-LD; embed on mapped pages (clean URLs only):
     `magnuson-*` → /magnuson-supercharger-guide, /magnuson-supercharger-pricing,
     /magnuson-products · `ott-*` → /ott-tune, /is-the-ott-tune-worth-it,
     /pedal-commander-vs-tune, /toyota-gear-hunting-fix · `amsoil-*` → /amsoil-garage,
     /is-amsoil-worth-it, /amsoil-vs-oem-toyota-lexus-fluids.
  4. `npm run build:seo` if SEO inputs changed, then `npm test` — must be green.
  5. Commit on branch `content/infographics-<YYYYMMDD>`. **Never push to `master`**
     (push = deploy per the ship skill).
  6. Social variants: 1:1 and 9:16 crops + hook-bank captions into `output\social\`,
     calibrator tags per TTN four-state list.
  7. Update `output\.pipeline-state.json` (batch → `staged`) and `.processed.json`.
  8. POST summary to the notify relay → Slack.
- **`ship`** (Aaron-triggered): merge staged branch to `master`, then follow the repo
  **ship skill** exactly (push, confirm Netlify `ready`, curl live pages). Mark batch
  `shipped`, notify Slack.

**Hard guards (non-negotiable, stated in the skill):**
- Files matching `banks-*` or anything under `output\private\` are never staged,
  committed, embedded, cropped, or mentioned in notifications. Banks Power is private
  until Aaron explicitly approves.
- Wholesale pricing never appears in any artifact.
- Any checklist failure or red `npm test` blocks staging; the Slack message says exactly
  which check failed and the batch stays `blocked` in state.
- Files matching `test-*` are processed in dry-run only (no commit, no notification
  beyond the test run's own output).

### 2. Watcher cron (local)

Claude Code cron job, every 30 minutes, headless prompt: run `/ty-publish check`.
Idle runs exit silently. Runs only while the PC is on — acceptable because exports only
appear when Aaron is at the PC. Appends one line per run to `output\.watcher-log.txt`
(timestamp, files seen, action taken).

### 3. Slack notifications — existing Netlify relay (n8n workflow dropped)

**Amended 2026-07-29 during planning.** Implementation discovery: the "Slack" nodes in
the existing n8n workflows hold no Slack credential — they are HTTP calls to the site's
own relay, `https://tunedyota.com/.netlify/functions/notify` (header `x-ty-notify`,
body `{"text": ...}`, Slack webhook held server-side in `SLACK_WEBHOOK_URL`). A new n8n
workflow would add a hop and a failure point while providing nothing the relay doesn't.

So: the skill and the cloud routines POST directly to the relay, messages prefixed
`🖼️ CONTENT-OPS [staged|shipped|blocked|error|candidates]`. n8n is not touched.

Channel routing: `notify.js` gains an optional `topic` field — `"topic": "content-ops"`
uses `SLACK_WEBHOOK_URL_CONTENT_OPS` when that env var is set, falling back to the
default webhook otherwise. Today messages land in the existing owner channel; the day
Aaron wants a dedicated `#ty-content-ops`, he mints one Slack incoming webhook and sets
one env var — no code or skill changes.

The relay token lives in the skill's local config (`~\.claude\skills\ty-publish\config.json`,
never committed to the site repo).

### 4. `/ty-status` skill — `~\.claude\skills\ty-status\SKILL.md`

Command center, read-only by default: pending/blocked/staged batches from
`.pipeline-state.json`, unprocessed files in `output\`, last watcher-log lines, staged
branch existing in the repo. With `full`, additionally fan out to the seo-monitor agent
and merchant-feed check for a one-shot health report.

### 5. Trend-scout candidate feed

Prompt update to the two existing cloud routines (daily 6:57am, Mon 7:03am): score each
opportunity as a potential infographic for one of the four packs (magnuson / ott /
amsoil / banks-power-PRIVATE); qualifying candidates get a "NotebookLM candidates"
section in the existing Gmail digest **and** a POST (`CONTENT-OPS [candidates]`) to the
notify relay for the Slack nudge. Banks Power candidates are flagged private in the digest
and excluded from Slack.

## Data flow

```
trend-scout routines ──candidates──► Gmail digest + notify relay → Slack
Aaron: NotebookLM generate → download → output\
watcher cron (30 min) → /ty-publish check → new files?
  → stage: verify → optimize → embed → test → branch commit → crops
  → state files updated → webhook → Slack "staged, reply ship it"
Aaron: "ship it" → /ty-publish ship → merge+push per ship skill → verify live → Slack "shipped"
```

## State files (all in `TunedYota-NotebookLM\output\`)

- `.processed.json` — manifest: filename → sha256 + processed timestamp (dedupe).
- `.pipeline-state.json` — batches with status `staged | blocked | shipped`, files,
  branch, timestamps.
- `.watcher-log.txt` — append-only watcher run log.

## Error handling

- Pipeline step failure → `event: error` webhook with the failing step; batch marked
  `blocked`; nothing partial is pushed.
- Webhook unreachable → pipeline still completes to staged state (Slack is a
  convenience, not a dependency); failure noted in watcher log and surfaced by
  `/ty-status`.
- Relay returns non-200 → noted in watcher log, surfaced by `/ty-status`; pipeline
  never blocks on notification failure.

## Testing

1. curl the notify relay with a sample `staged` payload → message appears in Slack.
2. Drop `test-magnuson-dryrun-v1.png` in `output\` → run `/ty-publish check` manually →
   verify dry-run behavior (no commit, correct verification output).
3. Force one cron fire → confirm headless run writes the watcher log.
4. End-to-end with the first real Magnuson export: stage → Slack → "ship it" → live
   verification per ship skill.

## Out of scope

- Automating NotebookLM generation (no API — permanently manual).
- YouTube uploads (OAuth pending) and auto-posting social content (crops + captions are
  produced; posting is manual).
- Any Banks Power publishing (private until explicit approval).

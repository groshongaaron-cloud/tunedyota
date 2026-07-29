# TY Content-Ops Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the NotebookLM infographic pipeline end-to-end (watch → verify → stage → notify → ship-on-approval) plus the trend-scout candidate feed, per the approved spec at `docs/superpowers/specs/2026-07-29-ty-content-ops-automation-design.md`.

**Architecture:** Two personal Claude Code skills (`ty-publish`, `ty-status`) hold the pipeline logic; a local 30-minute Claude cron runs `/ty-publish check`; Slack notifications go through the site's existing Netlify relay (`/.netlify/functions/notify`), which gains optional `topic` routing; the two existing cloud routines get a "NotebookLM candidates" prompt addition. No new n8n workflows.

**Tech Stack:** Claude Code skills + cron, Node (`node --test`) for the Netlify function, ImageMagick for image work, existing repo npm chains (`build:seo`, `test`), Netlify relay → Slack.

**Key paths:**
- `OUT` = `C:\Users\grosh\TunedYota-NotebookLM\output`
- `REPO` = `C:\Users\grosh\Documents\tunedyota`
- Personal skills = `C:\Users\grosh\.claude\skills\`

---

### Task 1: `notify.js` topic routing (TDD)

Optional `topic` field routes to a per-topic Slack webhook env var, falling back to the default. Inert until Aaron sets `SLACK_WEBHOOK_URL_CONTENT_OPS`.

**Files:**
- Modify: `netlify/functions/notify.js`
- Test: `tests/notify.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/notify.test.js`:

```js
test("topic content-ops routes to its webhook when configured", async () => {
  let seen;
  const notify = async ({ webhookUrl, text }) => { seen = { webhookUrl, text }; return { ok: true }; };
  const r = await handler(post({ text: "staged", token: "secret", topic: "content-ops" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default",
           SLACK_WEBHOOK_URL_CONTENT_OPS: "https://hooks.slack.test/content" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/content");
});

test("topic falls back to default webhook when topic env not set", async () => {
  let seen;
  const notify = async ({ webhookUrl }) => { seen = { webhookUrl }; return { ok: true }; };
  const r = await handler(post({ text: "staged", token: "secret", topic: "content-ops" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/default");
});

test("unknown topic falls back to default webhook", async () => {
  let seen;
  const notify = async ({ webhookUrl }) => { seen = { webhookUrl }; return { ok: true }; };
  const r = await handler(post({ text: "x", token: "secret", topic: "weird/../thing" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/default");
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `cd C:\Users\grosh\Documents\tunedyota && node --test tests/notify.test.js`
Expected: first new test FAILS (`seen.webhookUrl` is the default, not `/content`); other two pass incidentally.

- [ ] **Step 3: Implement topic routing** in `netlify/functions/notify.js` — replace the line
`const r = await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text, log });` with:

```js
  // Optional per-topic channel: "content-ops" → SLACK_WEBHOOK_URL_CONTENT_OPS, etc.
  // Unset topic env var falls back to the default channel, so topics are safe to send
  // before their webhook exists.
  const topic = (body.topic || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const webhookUrl = (topic && env["SLACK_WEBHOOK_URL_" + topic]) || env.SLACK_WEBHOOK_URL;

  const r = await notify({ fetchImpl, webhookUrl, text, log });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 5: Commit**

```bash
git add tests/notify.test.js netlify/functions/notify.js
git commit -m "feat(notify): optional topic → per-channel Slack webhook routing"
```

Note: do NOT push — push deploys (ship skill). The change is inert until pushed and rides the next approved ship.

---

### Task 2: `/ty-publish` skill + pipeline state files

**Files:**
- Create: `C:\Users\grosh\.claude\skills\ty-publish\SKILL.md`
- Create: `C:\Users\grosh\.claude\skills\ty-publish\config.json`
- Create: `C:\Users\grosh\TunedYota-NotebookLM\output\.processed.json` (content: `{}`)
- Create: `C:\Users\grosh\TunedYota-NotebookLM\output\.pipeline-state.json` (content: `{"batches": []}`)
- Create: `C:\Users\grosh\TunedYota-NotebookLM\output\.watcher-log.txt` (empty)

- [ ] **Step 1: Verify ImageMagick**

Run: `magick -version`
If missing: `winget install ImageMagick.ImageMagick` (then restart shell / verify again).

- [ ] **Step 2: Get the relay token** and write `config.json`:

Run: `cd C:\Users\grosh\Documents\tunedyota && netlify env:get NOTIFY_TOKEN`
If the CLI isn't logged in, ask Aaron to paste the token (it's the same one the cloud routines use). Write:

```json
{
  "notifyUrl": "https://tunedyota.com/.netlify/functions/notify",
  "token": "<value of NOTIFY_TOKEN>",
  "topic": "content-ops"
}
```

Never commit this file to any repo.

- [ ] **Step 3: Write `SKILL.md`** with exactly this content:

````markdown
---
name: ty-publish
description: Use when NotebookLM infographic exports land in the Tuned Yota output folder, when the watcher cron runs its check, when Aaron says "infographics are in the output folder", or when Aaron approves a deploy with "ship it" — runs the TY infographic publish pipeline (verify → optimize → embed → test → stage → social crops) with a hard stop before anything deploys.
---

# TY Publish — NotebookLM infographic pipeline

Paths: `OUT` = `C:\Users\grosh\TunedYota-NotebookLM\output` · `REPO` = `C:\Users\grosh\Documents\tunedyota`.
Config: `config.json` next to this file → `{ notifyUrl, token, topic }`.

Modes: **check** (watcher entry, silent when idle) · **stage** (default when new exports exist) · **ship** (Aaron-approved deploy). Invoked bare or with "infographics are in the output folder" → check, then stage if new files.

## Hard rules (read first, no exceptions)

- Files matching `banks-*` or anything under `OUT\private\` are NEVER verified for publish, staged, committed, embedded, cropped, or named in a notification. If one appears at `OUT\` top level, move it to `OUT\private\` and notify: "moved to private, Banks Power is unreleased."
- Wholesale pricing never appears in any artifact.
- `check` mode ends silently when there is nothing new — no notification, no summary.
- Never push `master` except in **ship** mode, and there only via the REPO ship skill.
- Files matching `test-*` are dry-run only: run verification, print results, touch nothing else.
- A top-level PNG matching no known prefix (`magnuson-` / `ott-` / `amsoil-` / `banks-` / `test-`) is never auto-staged: record it in `.processed.json` so it's reported only once, log it in the watcher log, and notify `[error]` "unrecognized export <name> — rename with a pack prefix or remove." Recognized files in the same run still stage normally.

## Notifications

POST to `notifyUrl`, header `x-ty-notify: <token>`, body:
`{ "text": "🖼️ CONTENT-OPS [<event>] <summary>\n<next action>", "topic": "<topic>" }`
Events: staged · shipped · blocked · error. A failed POST never blocks the pipeline — append the failure to `OUT\.watcher-log.txt` and continue.

## check

1. List `OUT\*.png` (top level only). sha256 each.
2. Diff against `OUT\.processed.json` (`{ "<filename>": { "sha256", "processedAt", "batch" } }`).
3. Nothing new/changed → append `<ISO timestamp> check: idle` to `.watcher-log.txt`, end silently.
4. Otherwise → log the filenames and run **stage** on the new files.

## stage

1. Batch id: `infographics-<YYYYMMDD>` (suffix `-2`, `-3` if it exists already).
2. **Verify each file** against its pack (prefix `magnuson-` / `ott-` / `amsoil-`):
   - Read the image. Read the pack's `prompts.md` review checklist and the brand rules in `C:\Users\grosh\TunedYota-NotebookLM\README.md`.
   - Check: every price matches REPO retail data (`site/magnuson-catalog.js`, AMSOIL price data) · the +85 hp / +85 lb-ft figure appears only with the Magnuson attribution + 91-octane note and only for the Performance Tune tier · "throttle response controller" never "pedal box" · "gear hunting" terminology · territory footer, if present, is IA · MN · NE · ND · SD · WI · colorway/typography per brand rules · no number without a notebook source.
   - Any failure → record batch as `blocked` with the exact failures in `.pipeline-state.json`, notify `[blocked]` listing them, END. Never stage a partial batch.
3. **Optimize**: `magick "OUT\<file>" -resize "1600x>" -strip "REPO\site\images\<line>\<file>"` (`<line>` = magnuson/ott/amsoil; create `site\images\ott\` if needed — per-line folders are the existing convention).
4. **Embed** each infographic on its mapped pages (edit the HTML in `REPO\site\`; internal links clean URLs only, `/foo` never `foo.html`):
   - `magnuson-*` → `magnuson-supercharger-guide.html`, `magnuson-supercharger-pricing.html`, `magnuson-products.html`
   - `ott-*` → `ott-tune.html`, `is-the-ott-tune-worth-it.html`, `pedal-commander-vs-tune.html`, `toyota-gear-hunting-fix.html`
   - `amsoil-*` → `amsoil-garage.html`, `is-amsoil-worth-it.html`, `amsoil-vs-oem-toyota-lexus-fluids.html`
   Insert a `<figure>` at the most contextually relevant section (not blindly at the top): `<img src="/images/<line>/<file>" alt="<factual description with the real data points>" loading="lazy" width/height set>`, plus an `ImageObject` JSON-LD block (`name`, `contentUrl` absolute `https://tunedyota.com/images/...`, `description`, `copyrightHolder` Tuned Yota). Follow the page's existing markup/JSON-LD patterns.
5. **Test**: if any SEO input changed, `npm run build:seo`; then `npm test`. Red → mark batch `blocked`, notify `[blocked]` with the failing output, leave the working tree for inspection, END.
6. **Stage the commit**: from `master`, `git checkout -b content/<batch>`; `git add` only the intended files (never `git add .`); commit `content: embed <n> NotebookLM infographics (<batch>)`; `git checkout master`. NEVER push.
7. **Social variants** into `OUT\social\`:
   - 1:1: `magick "OUT\<file>" -gravity center -crop <side>x<side>+0+0 +repage -resize 1080x1080 "OUT\social\<name>-sq.png"` where `<side>` = min(width,height).
   - 9:16: `magick -size 1080x1920 canvas:"#EDECEB" ( "OUT\<file>" -resize 1000x1780 ) -gravity center -composite "OUT\social\<name>-story.png"`.
   - `OUT\social\<name>-captions.md`: 2–3 caption options from the hook bank (`C:\Users\grosh\TunedYota-Content-Plan.md` §6), calibrator tags per the TTN four-state list (IA/MN/ND/WI). Retail prices only; attribution rules apply to captions too.
8. **Record**: update `.processed.json` (each file → sha256, timestamp, batch) and `.pipeline-state.json`:
   `{ "batches": [{ "id", "status": "staged|blocked|shipped", "files": [], "branch", "stagedAt", "shippedAt", "failures": [] }] }`.
9. **Notify** `[staged]`: files, branch, "npm test green. Reply 'ship it' in Claude to deploy."

## ship

Trigger: Aaron says "ship it" (or `/ty-publish ship`).

1. Newest `staged` batch from `.pipeline-state.json` (none → say so, suggest `/ty-status`).
2. `git checkout master && git merge content/<batch>`.
3. Follow the REPO ship skill EXACTLY (`REPO\.claude\skills\ship\SKILL.md`): build:seo idempotency, `npm test`, push `master`, confirm the Netlify deploy is `ready` (not silently skipped), curl the changed live pages and confirm the new `<figure>` is present.
4. Mark the batch `shipped` (timestamp), notify `[shipped]` with live URLs.
5. Remind Aaron: social crops + captions are in `OUT\social\`, posting is manual.
````

- [ ] **Step 4: Create the three state files** with the initial contents listed above.

- [ ] **Step 5: Dry-run test** — copy any small PNG to `OUT\test-dryrun-v1.png`, then in a fresh context run `/ty-publish check`.
Expected: it detects the file, recognizes `test-*`, runs verification output to console only, makes no repo edits, no state change beyond the watcher log, no Slack post. Delete the test file after.

- [ ] **Step 6: Notify smoke test**

```bash
curl -s -X POST https://tunedyota.com/.netlify/functions/notify \
  -H "content-type: application/json" -H "x-ty-notify: <token>" \
  -d '{"text":"🖼️ CONTENT-OPS [test] pipeline wiring check — ignore","topic":"content-ops"}'
```

Expected: `ok`, and the message appears in the Slack owner channel. (Topic falls back to default until the env var exists — correct.)

---

### Task 3: `/ty-status` skill

**Files:**
- Create: `C:\Users\grosh\.claude\skills\ty-status\SKILL.md`

- [ ] **Step 1: Write `SKILL.md`** with exactly this content:

````markdown
---
name: ty-status
description: Use when Aaron asks for content-ops status, pipeline state, "what's pending", or a Tuned Yota health check — reports NotebookLM pipeline batches, watcher activity, and (with "full") SEO/feed health in one shot.
---

# TY Status — content-ops command center

Paths: `OUT` = `C:\Users\grosh\TunedYota-NotebookLM\output` · `REPO` = `C:\Users\grosh\Documents\tunedyota`.

Default (read-only, no notifications):
1. `OUT\.pipeline-state.json` → list batches by status: staged (awaiting "ship it"), blocked (with failures), recently shipped.
2. `OUT\*.png` not present in `OUT\.processed.json` → "unprocessed exports" (watcher will pick up within 30 min, or offer `/ty-publish` now).
3. Last 5 lines of `OUT\.watcher-log.txt` → when the watcher last ran; flag if the newest entry is older than 24h (cron may be off / PC was off).
4. In REPO: does a `content/*` branch exist that `.pipeline-state.json` doesn't know about? Flag drift.
5. Report as a short table + one recommended next action.

`full` mode: additionally dispatch the seo-monitor agent (`~\.claude\agents\seo-monitor.md`) and include its GSC/feed/plumbing summary. Never run the AEO audit from here (it needs the main session — Perplexity MCP is unavailable to subagents).
````

- [ ] **Step 2: Verify** — in a fresh context run `/ty-status`.
Expected: reports zero staged batches, zero unprocessed files, watcher log from the Task 2 dry-run, no drift.

---

### Task 4: Watcher cron (local, every 30 minutes)

**Files:** none (Claude Code cron registry).

- [ ] **Step 1: Load cron tools** — `ToolSearch` query `select:CronCreate,CronList`.

- [ ] **Step 2: Create the job** — CronCreate with schedule `*/30 * * * *` and prompt:
`Run /ty-publish check. Follow the skill exactly: if there are no new files in the output folder, end silently.`
Name it `ty-content-watcher`.

- [ ] **Step 3: Verify registration** — CronList shows `ty-content-watcher`, schedule `*/30 * * * *`, enabled.

- [ ] **Step 4: Force one fire** (or wait ≤30 min), then check `OUT\.watcher-log.txt` gained a `check: idle` line.
Expected: log line present; no Slack message (idle = silent).

---

### Task 5: Trend-scout candidate feed (cloud routines)

**Files:** none (routine prompts live in the cloud scheduler).

- [ ] **Step 1: Invoke the `/schedule` skill** and list routines; identify the daily 6:57am scan and Monday 7:03am deep-dive.

- [ ] **Step 2: Append to BOTH routine prompts** exactly this block:

```text
NOTEBOOKLM CANDIDATES: After the main digest, score each opportunity as a potential
NotebookLM infographic for one of: magnuson, ott, amsoil, banks-power (PRIVATE). A
qualifying candidate must be data-backed (numbers TY can source from its own briefs/
catalog) and match a pack. Add a "NotebookLM candidates" section to the Gmail digest:
pack, working title, the data that would make it credible, suggested prompt angle.
banks-power candidates: include in the Gmail digest marked PRIVATE — never in Slack.
If there is at least one non-private candidate, also POST to
https://tunedyota.com/.netlify/functions/notify with header x-ty-notify: <token>
(same token the routine already uses for Slack) and body:
{"text":"🖼️ CONTENT-OPS [candidates] <n> NotebookLM candidate(s): <pack: title; ...> — details in today's Gmail digest","topic":"content-ops"}
No candidates → no post.
```

- [ ] **Step 3: Verify** — trigger a manual run of the daily routine (RemoteTrigger via the schedule skill) and confirm: digest draft contains the new section (or explicitly no candidates), and Slack got the candidates post only if there were any.

---

### Task 6: End-to-end verification + handoff

- [ ] **Step 1: Re-run the full local suite** — `cd REPO && npm test` → green.

- [ ] **Step 2: Commit the plan/spec docs** if not already committed.

- [ ] **Step 3: Walk the live path once** with the first real export: Aaron drops `magnuson-fitment-matrix-v1.png` in `OUT\` → watcher stages within 30 min → Slack `[staged]` → Aaron: "ship it" → live verification per ship skill → Slack `[shipped]` → crops in `OUT\social\`.

- [ ] **Step 4: Ship approval** — remind Aaron that two commits are sitting unpushed on `master` (spec/plan docs, notify topic routing) and will deploy with the next approved ship.

- [ ] **Step 5: Update memory** — rewrite `notebooklm-pipeline.md` memory (watcher + skills now exist; "ship it" flow) and add a memory for the content-ops automation (skills, cron name, relay contract). Update `MEMORY.md` index.

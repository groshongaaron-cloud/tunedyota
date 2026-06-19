---
name: ship
description: Use when deploying Tuned Yota changes to production — the correct order of regenerate, test, push-to-master, and live verification so the site never ships stale or silently fails to publish.
---

# Shipping Tuned Yota to Production

## Overview

Deploy = **push to `master`**; the repo is GitHub-connected and Netlify auto-builds from `site/`. There is **no CI step that regenerates the SEO assets** — you generate them locally first — and a push doesn't guarantee a publish (this site has silently skipped deploys before). So the flow is regenerate → test → push → **confirm published** → verify live.

> **Ignore the stale manual-deploy docs.** `README.md` (and the 2026-06-12 spec/plan) say to run `netlify deploy` / `netlify deploy --prod`. That is NOT how this site publishes today — **pushing `master` is the deploy** (verified: every push this project makes triggers a Netlify production build). Do not run `netlify deploy` manually; it's unnecessary and creates a confusing parallel deploy path.

## Steps

1. **If you changed any SEO input** — `events-data.js`, page `<title>`/`<meta description>`/canonical, the page set (`HEAD_PAGES`), review schema, or `areaServed` — run **`npm run build:seo`**. It regenerates the Event JSON-LD, OG/Twitter tags, the per-page business stub, `sitemap.xml`, and the brand images. Skip only for pure copy/CSS edits that touch none of those.
2. **`npm test`** — must be green. `tests/seo.test.js` fails on schema/sitemap drift, which is exactly what catches a forgotten `build:seo`.
3. **Stage specific files** — not `git add .`. The repo has untracked `.claude/` tooling and a `deno.lock` you usually don't want in a content commit; add `.claude/skills/...` deliberately only when *that's* the change.
4. **Commit.** (Committing on `master` is fine for this repo; for larger work, branch + merge back.)
5. **Push to `master`** — this is what triggers the deploy. A commit alone does **not** deploy.
6. **Confirm it published — don't assume.** Check the Netlify deploy for the latest commit shows **`ready`**, not `error`. History: deploys have silently skipped with *"account credit usage exceeded,"* leaving content unpublished while the commit looked fine.
7. **Spot-check live** — `curl` the changed page on `https://tunedyota.com` and confirm the change is actually there (new event/schema/review/text present).

## Repo specifics

- `npm run build:seo` is **idempotent** — a second run should produce no new diff; if it does, you committed un-regenerated output.
- Git's `LF will be replaced by CRLF` warnings are benign.
- The cloud routines (daily uptime, weekly SEO) will also flag a bad publish in Slack — but verify at ship time anyway; don't outsource the check.

## Common mistakes

- **Skipped `npm run build:seo`** after changing SEO inputs → stale sitemap/schema (usually caught by `npm test`).
- **Committed but didn't push to `master`** → not deployed.
- **`git add .`** → drags in `.claude/` / `deno.lock`.
- **Didn't confirm `ready`** → a silently-skipped deploy looks like success.

## Quick reference

(SEO inputs changed? `npm run build:seo`) → `npm test` → commit specific files → push `master` → confirm Netlify `ready` → curl live.

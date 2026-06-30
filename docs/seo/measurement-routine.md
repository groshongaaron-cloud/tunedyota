# search-visibility-tracker — cloud routine

Monthly cloud routine (claude.ai/code/routines) that measures Google + AI-engine
visibility into a versioned snapshot and posts a trend report to Slack. Replaces the
old manual monthly GSC-reminder routine (decommission that one when this goes live).

## Secrets (routine settings)
- `GSC_SA_KEY` — Google Cloud service-account JSON (raw), granted read on the GSC property.
- `GSC_PROPERTY` — `sc-domain:tunedyota.com` (domain property) or `https://tunedyota.com/` (URL-prefix). Confirm which the property is.
- `PERPLEXITY_API_KEY` — Perplexity API key.
- `SLACK_WEBHOOK_URL` — existing webhook.

## Routine prompt
1. Pull GSC: `node scripts/measure/gsc-pull.mjs > /tmp/gsc.json`
2. Probe Perplexity: `node scripts/measure/perplexity-probe.mjs > /tmp/pplx.json`
3. WebSearch probe: read `docs/seo/tracked-queries.json`; for each query, run WebSearch
   and record `{query, present, position, page}` where `present` = does any
   tunedyota.com URL appear in the results, `position` = its rank (1-based) or null,
   `page` = the tunedyota.com URL found. Write the array to `/tmp/web.json`.
4. Assemble + diff: `node scripts/measure/snapshot.mjs /tmp/gsc.json /tmp/web.json /tmp/pplx.json > /tmp/diff.json`
   (this also writes `docs/seo/measurements/<today>.json`).
5. Report: `node scripts/measure/report.mjs docs/seo/measurements/<today>.json /tmp/diff.json`
6. POST the report text to `SLACK_WEBHOOK_URL` as `{ "text": "<report>" }`.
7. Commit the new snapshot: `git add docs/seo/measurements && git commit -m "chore(measure): <today> snapshot" && git push`.

If any step's command exits non-zero, still run steps 4-6 with whatever JSON exists
(`snapshot.mjs` records missing probes in `meta.errors`, and the report surfaces them
loudly). Never skip the Slack post.

## Reading a snapshot
- `summary.ctrOpportunities` — page-1, high-impression queries whose CTR is >30% below
  the position curve. These are the targets for the NEXT Phase 3 round (title/meta rewrites).
- `summary.aiPresenceRate` / `perplexityCiteRate` — AI-visibility baseline to trend.

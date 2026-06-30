# Search + AI-Visibility Phase 3 — Measurement (design)

Date: 2026-06-30
Status: approved (brainstorming) — pending spec review

## Goal

Phase 3 of the search + AI-visibility program. This round is **measurement-first**:
stand up automated tracking of (a) Google search performance and (b) AI-engine
visibility, and capture a **baseline** *before* any on-page changes. The later round
(on-page CTR rewrites + internal linking) is explicitly deferred and will be driven by
the CTR-opportunity flags this engine surfaces.

Scope decided with the owner:
- Measurement before page changes (need a baseline to prove impact against).
- GSC tracking via an automated API pull (rank, impressions, clicks, CTR, position).
- AI-citation tracking via **two** probes: Claude's native WebSearch presence probe
  **and** an external AI-answer API (Perplexity) for cross-engine citations.
- Storage: repo-committed dated JSON snapshots (versioned, diffable, no new service).
- Orchestration: a single new scheduled cloud routine (Approach A), replacing today's
  manual monthly GSC-reminder routine.

Builds on the live technical SEO (`seo-generator`), the Phase 1 content pages, the
Phase 2 state pages, and the existing cloud-routines + Slack wiring.

## Architecture

One new scheduled **cloud routine**, `search-visibility-tracker`. Deterministic API
work lives in tested repo scripts the routine calls; the routine itself adds the
WebSearch probe (only a Claude agent can do that natively) and narrates the Slack
report. Judgment stays in the agent; API plumbing stays in code with tests.

The routine **replaces** the current manual monthly GSC-reminder routine — that routine
is decommissioned once this ships.

### Tracked query set

`docs/seo/tracked-queries.json` — the single source of truth both AI probes and the GSC
tracked-rows filter iterate over. Derived from `docs/seo/query-map.md`. ~15–20
high-intent queries spanning commercial / consideration / objection / local intents.

Each entry:
```json
{ "query": "is an ott tune worth it", "intent": "consideration", "targetPage": "/is-the-ott-tune-worth-it" }
```

### Components (each independently testable)

| Unit | Input → Output | Notes |
|---|---|---|
| `scripts/measure/gsc-pull.mjs` | service-account auth → `{ range, tracked[], topPages[] }` | GSC Search Analytics API, trailing 28 days |
| `scripts/measure/perplexity-probe.mjs` | tracked queries → `[{query, citedUs, ourCitations, competitors}]` | Perplexity `sonar` API, one call per query |
| *(agent)* WebSearch probe | tracked queries → `[{query, present, position, page}]` | Claude native WebSearch — not a script |
| `scripts/measure/snapshot.mjs` | the three blobs → writes dated snapshot, computes diff vs latest prior | versioned baseline + trend |
| `scripts/measure/report.mjs` | snapshot + diff → Slack markdown | movers, CTR-opportunity flags, AI-presence rates |

### Data flow (per cycle)

1. Routine runs `gsc-pull.mjs` → GSC rows for tracked queries + top pages (trailing 28d).
2. Routine runs `perplexity-probe.mjs` → per-query Perplexity citation results.
3. Routine does Claude WebSearch for each tracked query → presence/position/page.
4. Routine hands all three blobs to `snapshot.mjs`, which writes
   `docs/seo/measurements/YYYY-MM-DD.json` and computes the diff vs the most recent
   prior snapshot.
5. `report.mjs` formats the trend; routine posts it to Slack and commits the new
   snapshot to the repo.

First run writes a **baseline** (diff = "baseline established"); later runs trend
against the prior file.

## Snapshot schema

`docs/seo/measurements/YYYY-MM-DD.json`:
```jsonc
{
  "date": "2026-06-30",
  "gsc": {
    "range": { "start": "...", "end": "..." },        // trailing 28d
    "tracked": [ { "query": "", "page": "", "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 } ],
    "topPages": [ { "page": "", "clicks": 0, "impressions": 0, "ctr": 0, "position": 0 } ]
  },
  "ai": {
    "webSearch":  [ { "query": "", "present": false, "position": null, "page": null } ],
    "perplexity": [ { "query": "", "citedUs": false, "ourCitations": [], "competitors": [] } ]
  },
  "summary": {                                          // derived, for fast trending
    "aiPresenceRate": 0.0, "perplexityCiteRate": 0.0,
    "ctrOpportunities": [ "query with high impressions + below-curve CTR" ]
  },
  "meta": { "errors": [] }                              // partial-run flags
}
```

## Report (Slack) contents

Trend vs. the previous snapshot:
- **GSC movers** — queries with the largest position gain/loss; CTR outliers
  (high-impression + below-curve CTR). The CTR outliers become the next round's
  on-page targets.
- **AI presence** — `X/N` queries present in WebSearch, `Y/N` cited by Perplexity, with
  deltas vs last cycle; competitor domains cited where we are not.
- **Headline** — e.g. "AI presence 55% (+10pts), Perplexity cites 30% (flat),
  4 CTR opportunities."

## Error handling

Loud, never silent (matches the email-hardening ethos). If GSC auth or Perplexity
fails, the routine still writes a **partial** snapshot with the failure recorded in
`meta.errors` and posts a clearly-flagged Slack message naming the failed probe. A bad
key degrades the cycle; it never drops it silently.

## Cadence

**Monthly** (matches GSC's data cadence and the reminder routine it replaces), plus
on-demand runs while establishing the first 1–2 baselines. Configurable in the routine.

## Owner setup (one-time)

1. GSC service account (Google Cloud) + grant it read on the `tunedyota.com` GSC
   property; store the JSON key as routine secret `GSC_SA_KEY`.
2. Perplexity API key as routine secret `PERPLEXITY_API_KEY`.
3. Confirm the GSC property identifier (domain property vs. URL-prefix).
4. Reuse the existing `SLACK_WEBHOOK_URL`.

## Testing

- `gsc-pull.mjs` / `perplexity-probe.mjs` — unit-tested with mocked `fetch` (auth
  shape, query construction, response normalization).
- `snapshot.mjs` — diff logic tested with before/after fixtures (baseline case +
  movement case).
- `report.mjs` — formatting tested against a fixture snapshot.
- Mirrors the existing `tests/seo*.test.js` pattern.

## Out of scope this round

- No title/meta rewrites; no internal-link changes. Those are the **next** Phase 3
  round, fed by the CTR-opportunity flags this engine surfaces.
- No extra AI engines beyond WebSearch + Perplexity this round (room to add later).

## Documentation / handoff

- `docs/seo/measurement-routine.md` — the routine prompt, schedule, required secrets,
  and how to read a snapshot/report. Update [[cloud-routines]] and the
  `search-ai-visibility-program` memory to mark Phase 3 measurement live and the old
  GSC-reminder routine retired.

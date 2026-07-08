---
name: webmcp-and-llms
description: llms.txt state + the dormant WebMCP preview endpoint (how to flip it on)
metadata: 
  node_type: memory
  type: project
  originSessionId: 5637dd1d-6d45-474a-8bc9-53825c7f6318
---

**llms.txt** (`site/llms.txt`, STATIC — not build:seo-generated) is in good shape and
serves at https://tunedyota.com/llms.txt (text/plain). 2026-07-07: added the high-intent
"money pages" (ott-tune-cost, is-the-ott-tune-worth-it, tune-warranty-emissions-legality,
magnuson-supercharger-guide) + a Service-areas section linking all 6 state pages, so LLMs
cite them. Edit the file directly; keep it date-agnostic (says "scheduled events", so the
event churn doesn't rot it). AI crawlers explicitly allowed in `site/robots.txt`.

**WebMCP preview — LIVE / ENABLED 2026-07-07** (built dormant @ bb42e5b, flipped on @
76dbd4e; env `WEBMCP_ENABLED=1` set on Netlify, all contexts). Verified live: `GET /mcp`
→ `enabled:true`; `find_tuning_events{state:MN}` returns real upcoming events. A minimal
Model Context Protocol server so agentic browsers can query the site:
- `netlify/functions/mcp.js` — JSON-RPC 2.0 over HTTP (`initialize` / `tools/list` /
  `tools/call`). **READ-ONLY** tools built on existing libs: `find_tuning_events`
  (state/city filter), `check_event_availability` (wraps `getAvailability`),
  `get_tune_pricing` (general guidance + link), and `get_vehicle_pricing` (added @ 15c6a3b —
  per-vehicle OTT/custom/supercharger prices by make/model/+year; catalog fallback). The
  latter's source is `lib/vehicles.json`, which **`npm run build:seo` auto-generates** from
  the funnel's inline `VEHICLES` config (`syncVehicles()` in `scripts/build-seo.mjs`),
  guarded by `tests/vehicles-parity.test.js`. **Editing prices is ONE step:** edit the funnel
  ("Edit prices here") → `npm run build:seo` regenerates the JSON (same as it does for
  schema/sitemap). The parity test fails loudly if build:seo was skipped after a price edit.
- `site/.well-known/mcp.json` — discovery manifest (status "preview").
- `/mcp` → the function via a `site/_redirects` 200-rewrite.
- **GATED by env `WEBMCP_ENABLED`** (now = `1`, all contexts → LIVE). When unset, every RPC
  returns JSON-RPC error -32000 + HTTP 503. **To turn OFF:** `netlify env:unset WEBMCP_ENABLED`
  then redeploy. Env-var changes need a redeploy (push master) to take effect. GET /mcp
  shows `enabled:true/false`.
- **Tests, three layers** (all read-only; no booking/writes exposed):
  - `tests/mcp.test.js` — offline unit tests (mocked deps), part of default `npm test`.
  - `tests/mcp-smoke.mjs` — LIVE end-to-end smoke test via the **official MCP SDK client**
    (StreamableHTTP transport → real initialize/tools/list/tools/call each). Run with
    **`npm run test:smoke`** (7/7 live). Deliberately named `.mjs` (NOT `*.test.js`) so bare
    `node --test` (= `npm test`, stays offline/hermetic at 307) does NOT auto-discover it.
    `MCP_SMOKE_URL` overrides the target (e.g. a Netlify deploy preview). `@modelcontextprotocol/sdk`
    is now a **devDependency** (in package.json/lock).
  - `scripts/mcp-client-check.mjs` — same check but verbose/human-readable for debugging.
  Verified 2026-07-07: real SDK client connects, lists 4 tools, calls each OK, closes clean —
  server is genuinely MCP-compliant (sessionless Streamable HTTP + JSON).
- **CI: `.github/workflows/ci.yml`** (the repo's FIRST GitHub Actions workflow, added
  2026-07-07; repo is public). Two jobs: **unit** (`npm ci` + `npm test`, on push + PR) and
  **smoke** (`npm run test:smoke` vs live `/mcp`, on push-to-master + a **6-hourly schedule**
  = prod monitor + manual dispatch; skipped on PRs since it tests prod, not the PR; a
  wait-for-endpoint step lets a fresh Netlify deploy settle; `workflow_dispatch` input
  `mcp_url` → `MCP_SMOKE_URL` to smoke a deploy preview). First run (commit 7942274) = both
  jobs green. `gh` is NOT authed in the local shell — check runs via the public API
  (`api.github.com/repos/groshongaaron-cloud/tunedyota/actions/runs`) or the Actions tab.
  **`workflow_dispatch` (manual trigger) — CLOSED as not-needed 2026-07-07:** it requires
  interactive `gh auth login` (browser OAuth, can't be automated) and adds nothing over the
  push + 6-hourly-cron triggers that already run CI green. Do not resurface. If owner ever
  wants manual dispatch, they run `! gh auth login` themselves once, then `gh workflow run ci.yml`.
- Rationale: WebMCP is a 2025 emerging convention, not finalized, ~no production
  consumers yet — so it's built + dormant, cheap to enable when the ecosystem matures.
  See [[search-ai-visibility-program]], [[multi-date-booking-and-schedule]].

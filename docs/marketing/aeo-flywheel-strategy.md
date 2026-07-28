# The Tuned Yota Conversation Flywheel

**Date:** 2026-07-27 · **Owner:** Aaron · **Baseline:** `aeo-citation-landscape-2026-07-27.md`

The goal: make Tuned Yota and its parts family (Magnuson superchargers, OTT
tunes, AMSOIL fluids/oil, parts) the cited expert wherever Toyota owners ask —
Reddit threads, AI answer engines, and search — and route that audience into
the existing funnel. AI engines already cite Reddit in 14/15 category queries
and tunedyota.com in 6/15; the flywheel widens both.

## The loop (recurring)

**LISTEN → ENGAGE → PUBLISH → MEASURE → repeat**

### 1. LISTEN — weekly, automated (Monday 7 AM newsletter)

A scheduled cloud agent produces the **TY Weekly Intel** newsletter for the
team: fresh Reddit threads worth engaging (with suggested angles), recurring
question patterns, competitor mentions, and AEO movement. Spec below.

### 2. ENGAGE — weekly, human (30–60 min per installer)

Team members answer the newsletter's queued threads **as disclosed experts**.
Non-negotiables (this is what makes it work instead of backfiring):

- **Disclose affiliation** whenever TY, its services, or its products come up:
  "I install these for a living at Tuned Yota" — Reddit rewards transparent
  experts and destroys astroturfers, and undisclosed self-promotion is an FTC
  problem besides. Undisclosed shilling is banned here, full stop.
- **Answer first.** The value is the complete expert answer; TY gets mentioned
  only when genuinely relevant or when asked. No links unless asked or clearly
  helpful.
- **Same guardrails as the chat AI**: no warranty/emissions/legal claims, no
  custom pricing, no fitment guarantees in public threads.
- Humans post — never agents. Agents draft talking points; a person owns every
  public word.
- Weekly rhythm: each installer picks 1–3 threads from the newsletter queue.
  Aaron owns sensitive threads (engine-failure speculation, warranty topics).

### 3. PUBLISH — monthly, gap-driven

One content page per month aimed at the biggest AEO gap, written in the
customer's question language, each with a funnel hook:

| Priority | Page | Gap it closes | Funnel hook |
|---|---|---|---|
| 1 (queued) | Professional OTT tune installer page | Prompt 14 — KDMax's "installer network" narrative wins; TY invisible | find-your-exact-tune booking |
| 2 | Where to buy AMSOIL / PC program page | Prompt 15 — affiliate microsites own it | AMSOIL hubs + Preferred Customer links |
| 3 | Toyota transfer-case fluid explainer (Toyota 75W, never SVL for 2013+ Tundra) | Prompt 10 — legacy forums own it | AMSOIL garage + booking |
| Defend | Keep Magnuson guide + pricing pages fresh | Prompts 3/6/11/13 — currently winning | already wired |

Reddit patterns feed this list: when the same question recurs three weeks
running (per newsletters), it becomes a page.

### 4. MEASURE — monthly, in-session

Run the `aeo-monitor` agent (local session — it needs Perplexity): re-runs the
15 tracked prompts, diffs all citation sources vs the latest baseline, writes
a new dated baseline to `docs/marketing/`. Movement decides next month's
publish priority. The weekly newsletter summarizes the latest committed
baseline's deltas so the team sees trend without waiting for month-end.

## Funnel capture

Every engagement and page routes to what already exists: booking
(tunedyota.com/find-your-exact-tune), AMSOIL hubs (/amsoil-products + PC
program), the client garage app (retention). Escalated interest lands in the
chat pipeline → dispatcher → installer. Nothing new to build; the flywheel
feeds the machine that's already wired.

## Division of labor

| Actor | Does | Never does |
|---|---|---|
| Cloud newsletter agent (weekly) | Listens, queues threads, drafts angles, reports AEO trend | Posts publicly, sends unreviewed email |
| `reddit-scout` / `aeo-monitor` (on demand) | Deep digs, full Perplexity audits, new baselines | Posts publicly |
| Installers | Engage queued threads as disclosed experts | Undisclosed promotion, guardrail topics |
| Aaron | Sensitive threads, publish approvals, monthly measure | — |

---

## Weekly newsletter operating spec (read by the Monday cloud agent)

**Audience:** Tuned Yota team (Aaron info@tunedyota.com, Cody
cody@tunedyota.com, Noah noah@tunedyota.com). **Length:** under ~800 words.

**Sections:**
1. **Engagement queue** — 3–5 Reddit threads (URL · sub · one-liner · suggested
   angle · suggested owner: Aaron/Cody/Noah). Priority subs: r/ToyotaTacoma,
   r/Tacomaworld, r/4Runner, r/ToyotaTundra, r/tundra, r/Toyota; fluids-only:
   r/Camry, r/COROLLA. Prefer threads <7 days old with active comments.
   **Citable page map** — when a queued thread matches one of these shapes, note
   the matching page in the suggested angle (link etiquette unchanged: answer
   fully first, link only when asked or genuinely helpful, always disclosed):
   professional-tune/installer/mail-in-wary → `/professional-ecu-tune-installer`;
   where-to-buy-AMSOIL / PC-worth-it → `/where-to-buy-amsoil`; transfer-case or
   diff fluid / Tundra 75W → `/toyota-transfer-case-fluid`; gear hunting →
   `/toyota-gear-hunting-fix`; throttle controller vs tune →
   `/pedal-commander-vs-tune`; reversibility/resale → `/toyota-tune-back-to-stock`;
   worth-it → `/is-the-ott-tune-worth-it`; cost → `/ott-tune-cost`; Magnuson →
   `/magnuson-supercharger-guide` + pricing; exact-fit fluids → `/amsoil-garage`.
   Threads matching the three former gap areas (installer, AMSOIL purchase,
   transfer-case fluid) are the highest-value queue items — engagement there
   corroborates the pages shipped 2026-07-28.
2. **Patterns & deltas** — what recurred this week; anything new vs the
   standing patterns (OTT worth-it, supercharger-on-a-daily, oil-after-
   supercharging, keep-the-5.7, tune-vs-regear-for-big-tires).
3. **Competitor watch** — KDMax/Yotawerx/PNW/5 Star or new names seen in
   threads or search results.
4. **AEO trend** — summarize the newest `docs/marketing/aeo-citation-landscape-*.md`
   (TY citation count, open gaps); flag when a monthly re-measure is due
   (baseline older than ~35 days). Optionally spot-check the 3 gap queries via
   web search and note obvious ranking movement — label spot-checks as
   approximate.
5. **This week's ask** — one line per person.

**Delivery:** post the full newsletter to the team's Slack, AND create a Gmail
draft addressed to Cody + Noah (subject "TY Weekly Intel — <date>") so Aaron
can review and hit send. Never auto-send email; never post to Reddit.

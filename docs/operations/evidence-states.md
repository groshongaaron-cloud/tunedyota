# Evidence states — PREPARED / OBSERVED / VERIFIED

Every monitor, pipeline, and automation that reports an outcome names the evidence
state it actually reached — never a stronger one. Adopted 2026-08-04 (framing borrowed
from oh-my-hermes's evidence gates; tailored here).

## The states

| State | Meaning | Examples |
|---|---|---|
| **PREPARED** | Artifact exists locally; nothing external happened | staged content batch, `content/*` branch, draft, proposed fix, price catalog rewritten but not committed |
| **OBSERVED** | An external action was recorded but not independently confirmed | `git push` succeeded, deploy triggered, POST returned, email handed to relay |
| **VERIFIED** | Independently confirmed with evidence from a separate read | Netlify deploy `ready` **and** live curl shows the change; `res.ok` checked and expected content present; API returned the data |
| **UNMEASURED** | The check didn't run or failed — the truth is unknown, not "fine" | Firecrawl fetch blocked, Perplexity call errored, probe skipped |

## Why this exists

The `/notify` relay bug (2026-08-02): scripts POSTed Slack summaries to a short URL
that 404'd, `fetch` doesn't throw on 404, and price-sync reports silently vanished for
weeks. Every step "worked" — the sends were OBSERVED, never VERIFIED. Naming the state
makes that gap visible instead of implicit.

## Where it's applied

- **ty-publish / ty-status skills** (`~\.claude\skills\`): notifications open with the
  state; `staged` = PREPARED, `shipped` = VERIFIED only (live curl), and a push whose
  live check fails becomes `shipped-unverified` = OBSERVED, flagged loudly.
- **seo-monitor / aeo-monitor agents** (`~\.claude\agents\`): every claim tagged
  VERIFIED / UNMEASURED; recommendations are PREPARED so they never read as done.
- **Scheduled monitors** (this repo): `scripts/amsoil/price-drift-check.mjs`,
  `scripts/amsoil/price-sync.mjs`, and `scripts/measure/lib/report.mjs` append an
  `Evidence:` line to their Slack summaries. price-sync notifies **after** the
  commit/push attempt with the actual outcome.

## Rules for new automations

1. Report the state you reached, with the evidence (what was read back, from where).
2. A successful send/push/deploy is OBSERVED until a separate read confirms it.
3. A failed or skipped check is UNMEASURED — say so; never let absence read as zero.
4. Recommendations and staged work are PREPARED — word them so they can't be mistaken
   for completed actions.

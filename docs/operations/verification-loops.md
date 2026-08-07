# Verification loops — TURN / GOAL / TIME / PROACTIVE

Every piece of work runs inside one of four verification loops. Each loop names a
**trigger**, a **cycle** (context → action → check), a **gate** the work must pass before
it counts as done, and who reviews. Adopted 2026-08-06. Pairs with
[evidence-states.md](evidence-states.md): a loop's gate is only satisfied when the check
reaches **VERIFIED**, never a weaker state.

The four form a ladder from "human drives every step" to "no human present." Higher loops
wrap lower ones — a proactive routine still runs the turn-based check inside each agent.

## The loops

| Loop | Trigger | Cycle | Gate (must pass to be "done") | Human |
|---|---|---|---|---|
| **1 · TURN** | A user prompt | context → action → check | Check answers **"did this action satisfy *this prompt*?"** — against the prompt, not my own plan | Reviews every turn |
| **2 · GOAL** | A stated objective + success criteria | many turns, each checked twice | Every turn checks vs prompt **and** vs the persistent goal; done only when the goal's criteria are objectively met | Sets goal, reviews at milestones |
| **3 · TIME** | A clock interval | observe → diff → report | Check answers **"has the watched state drifted from baseline?"**; a skipped/failed probe is UNMEASURED, never "fine" | Reads digests, intervenes on alert |
| **4 · PROACTIVE** | An event or cron, no human present | triage → fix → review → test → close | All of triage/fix/review/test pass **and** the change is inside the autonomy boundary (below); otherwise escalate | Absent; only escalated-to |

## Loop 1 — turn-based (the inner gate every loop inherits)

```
   PROMPT ──► GATHER CONTEXT ──► TAKE ACTION ──► CHECK WORK
      ▲                                             │
      │                          (satisfies the PROMPT? evidence?)
      │                             ┌── NO ◄────────┤
      │                        re-context/re-act    │ YES
      │                                              ▼
      └────────── USER REVIEWS ◄────────── APPROVED RESPONSE
                  writes NEXT PROMPT
```

The check points back to the **original prompt**, which is what stops the classic failure
of verifying "what I decided to do" instead of "what was asked." No approved response
leaves the loop until the check passes with evidence.

## Loop 2 — goal-based (drift guard across turns)

Holds a persistent goal + written success criteria. Each turn passes Loop 1 **and** is
checked against the goal, catching the case where every individual turn passes its own
check but the sequence has wandered off the objective. Done only when the criteria are
met — measured, not asserted.

```
GOAL + success criteria (fixed up front)
   ├─ turn 1: Loop 1 gate  AND  check vs goal
   ├─ turn 2: Loop 1 gate  AND  check vs goal
   └─ ...        ▲                     │
                 └── goal unmet? keep ─┘   criteria met → DONE
```

## Loop 3 — time-based (scheduled drift detection)

Fires on an interval, observes a watched state, diffs against a committed baseline,
reports the evidence state. This is what the existing monitors already are.

## Loop 4 — proactive (autonomous triage → close)

```
  TRIGGER (event or cron) ──► routine ──► dynamic workflow
        │  spawns agents:
        ├─ TRIAGE  what changed / what's wrong
        ├─ FIX     remediate, isolated
        ├─ REVIEW  adversarial check of the fix
        └─ TEST    does it actually pass?
        │
        ├─ all pass + inside boundary ──► CLOSE (log + notify)
        └─ any fail  or outside boundary ──► ESCALATE to human
```

## Autonomy boundary (Loop 4 hard limits)

A no-human loop may **detect and safely remediate**; it may **never autonomously publish**.
These override any perceived efficiency:

1. **Stops before live-facing change.** Triage/fix/review/test run freely. Anything that
   touches the **live site, pricing, or a published claim** halts at the
   stage-then-"ship it" gate and escalates — the loop stages, the human ships. Consistent
   with owner sign-off, the fact-based content rule, and "never fabricate."
2. **Headless-auth honesty.** Routines that need interactively-authenticated tools
   (Perplexity, Gmail) can fail silently when run unattended — the reason the AEO audit
   runs inline, not as a subagent. Loop 4 routines must detect a missing/failed auth and
   report **UNMEASURED + escalate**, never a false "closed."
3. **Explicit workflow opt-in.** The fan-out is authorized in the routine definition, not
   improvised at runtime.
4. **Loud on escalation.** Escalation is a first-class outcome via the notify relay
   (`/.netlify/functions/notify`, check `res.ok`) — silence is never success.

## Where each loop is applied

- **Loop 1** — every interactive Tuned Yota turn. The default.
- **Loop 2** — multi-step work with a fixed objective (site overhauls, launches, migrations).
  Goal + criteria stated up front and checked to close.
- **Loop 3** — Search Visibility, price-sync; the seo-monitor / aeo-monitor agents when
  run on cadence. All PS-hosted hidden tasks.
- **Loop 4 (live pilot)** — `TunedYota AMSOIL Drift Check` (Wed 3:15am): the sentinel
  detector (`price-drift-check.mjs`) escalates on drift, then `drift-triage-sweep.mjs
  --if-drift` auto-stages the full-catalog remediation package to `~/.tunedyota/`. Fix
  stays human — pricing is live-facing, so it halts at the autonomy boundary and escalates
  rather than shipping. The remaining monitors are the next candidates for the same upgrade.

## Rules for new loops

1. Name the loop (1–4) before starting the work; state its gate.
2. The gate is only met at **VERIFIED** — cite the separate read that confirmed it.
3. A skipped or failed check is **UNMEASURED**; say so, escalate, never let absence read
   as zero.
4. Loop 4 respects the autonomy boundary without exception — stage, don't ship.
5. Every loop can escalate to a human; escalation is loud, not silent.

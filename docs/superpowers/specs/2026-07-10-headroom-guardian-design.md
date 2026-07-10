# Headroom Guardian — Design Spec

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation plan
**Author:** Owner + Claude

## Problem

[Headroom](https://github.com/headroomlabs-ai/headroom) is a **lossy** context-compression layer that sits between an agent/script and the LLM. Its dangerous failure mode is not a loud crash — it is **silent quality degradation**: a compressed payload that quietly loses a VIN, a price, an error string, or a required field, so the model answers confidently but wrong. Self-reported traction for the tool is inconsistent (repo star counts of 718 vs 30.7k vs 58.2k across sources) and its "same answers" claim is unverified on our data.

We want a mechanism that, once Headroom is installed, continuously proves it (a) works, (b) actually saves tokens, and (c) **does not corrupt or degrade the content** — and shouts the moment any of that stops being true.

## Scope & assumptions

- **Deployment stance:** Headroom is assumed to run in **standalone / library mode on our data** (compressing JSON / tool-output / prose inside our own scripts), **not** intercepting live Claude Code traffic. If we later proxy it into agents, the same harness extends with live-traffic checks; that is out of scope here.
- **Build-now / activate-on-install:** Headroom is **not yet installed**. The guardian must be committable today and spring to life the moment `pip install "headroom-ai[all]"` happens. When Headroom is absent it reports `not installed — skipped`, never errors.
- **Reuses existing infra:** Windows Task Scheduler + the `/notify` Slack relay + the `~/.tunedyota/*.cmd` launcher pattern, mirroring the `last30days` weekly digest and the local search-visibility engine.
- **Platform:** Windows 11, Python 3.14 (real interpreter `C:\Users\grosh\AppData\Local\Python\pythoncore-3.14-64\python.exe`). Always run with `PYTHONUTF8=1`.

## The four checks (ordered by risk)

### 1. Quality differential — the reason this exists
For each item in a fixed **golden corpus**, compress it, then pose a fixed set of **factual probe questions** to a cheap model (Claude Haiku) against **the original vs. the compressed output** and assert the answers match.

- Corpus items each ship with `probes`: `[{question, expected_substring}]` covering the *critical facts that must survive compression* (e.g. for a booking JSON: VIN, price, city, model year).
- Pass condition: the model's answer from the compressed content contains the same expected fact as from the original. A miss = **silent degradation detected** → fail loudly.
- The probe model call is the only external dependency; it is isolated behind one function so the harness can run **probe-less** (checks 2–4 only) when no API key / offline.

### 2. Reversibility integrity
If Headroom's reversible mode (CCR) is used, `retrieve(compress(x))` must equal `x` **byte-for-byte**. Any drift = data-loss bug → fail.

### 3. Savings sanity band
Count tokens before/after (via the same tokenizer we bill against). Assert reduction sits within a configured band per content type:
- **too little** (e.g. < 5%) → it is not actually working;
- **suspiciously high** (e.g. > configured ceiling) → it is probably dropping real content — flag for review, do not silently celebrate.

### 4. Health + version pin
- Import / `headroom doctor` smoke test.
- **Pin the observed Headroom version.** On any change vs. the pinned version, force a full re-verification and alert — behavior can shift under an auto-update. The pin lives in a small state file.

## Architecture (isolation-first)

Small, independently-testable units:

```
scripts/headroom_guard/
  guard.py            # pure check functions: quality_diff, reversibility,
                      #   savings_band, health_version. Each takes injected
                      #   deps (compressor, probe_fn, tokenizer) → returns a
                      #   structured CheckResult. No I/O, no Headroom import.
  adapter.py          # thin boundary to Headroom: detect install, expose
                      #   compress/retrieve/version/doctor. Returns a sentinel
                      #   "absent" adapter when Headroom is not installed.
  probe.py            # single function: ask Haiku a question against a text
                      #   blob → answer string. Isolated external dependency.
  runner.py           # loads corpus + config, runs all checks over the
                      #   adapter, prints a report, posts a Slack digest via
                      #   /notify, exits nonzero on any failure. Flags:
                      #   --dry-run (no post), --probeless, --json.
  corpus/             # golden payloads + probes (JSON, code, prose samples
                      #   drawn from real TunedYota data, secrets scrubbed)
  state.json          # pinned Headroom version + last-run summary
tests/headroom_guard.test.* (node --test or pytest) — exercise guard.py
                      #   pure functions with a MOCK compressor (lossless
                      #   passthrough + a deliberately-lossy one) to prove the
                      #   checks actually catch degradation.
```

- **`guard.py` is pure** — every check takes its dependencies injected, so tests run with a fake compressor and no Headroom, no network. A deliberately-lossy mock compressor MUST make check 1 and 3 fail — that is how we trust the guardian itself.
- **`adapter.py` is the only place that imports Headroom.** Swapping standalone→proxy later means editing only this file.
- **`probe.py` is the only place that calls an LLM.** `--probeless` skips it entirely.

## Data flow

`runner` → load `corpus/*` + `config` + `state.json` → `adapter.detect()`:
- **absent** → report `skipped: not installed`, exit 0 (green-but-idle), optional quiet Slack line.
- **present** → for each corpus item run checks 1–4 (1 needs `probe.py` unless `--probeless`) → aggregate `CheckResult`s → render report → post pass/fail digest to `/notify` → update `state.json` (version pin + summary) → exit nonzero on any hard failure.

## Run modes

1. **On-demand:** `python scripts/headroom_guard/runner.py` — run right after install and anytime. `--dry-run` to skip Slack.
2. **Weekly watchdog:** Task Scheduler task `TunedYota Headroom Guardian` → `~/.tunedyota/run-headroom-guard.cmd` (sets `PYTHONUTF8=1`, runs master's copy via `git show master:… | python -`, logs to `~/.tunedyota/headroom-guard.log`). Green digest on pass; loud alert on any regression or version drift.
3. **Pre-flight gate (library):** `from scripts.headroom_guard.guard import preflight_ok` — a fast subset (health + one quality probe) a real compression script can call before trusting Headroom; returns `bool` so the script refuses to compress when the guardian is unhappy.

## Error handling

- Headroom absent → skipped, exit 0, no false alarm.
- Probe model / network error → mark check 1 `inconclusive` (not `fail`), still run 2–4, note it in the digest. Never let a flaky API create a false "degradation" alert.
- Any hard check failure (quality miss, reversibility drift, savings out of band) → exit nonzero + **alerting** Slack post.
- Slack post failure → still exit with the check status; log the post error (mirrors `last30days`).
- Corpus payloads are secret-scrubbed; the guardian must never post raw payloads to Slack, only pass/fail + fact labels.

## Testing

- `guard.py` pure functions tested with (a) lossless mock → all checks pass; (b) lossy mock that drops the VIN → check 1 fails, check 3 flags. This proves the guardian detects the exact failure we fear **without** Headroom installed.
- `adapter.detect()` returns the absent sentinel cleanly when the import fails.
- Runner smoke test in `--dry-run --probeless` mode against the absent adapter → exits 0, prints `skipped`.

## Out of scope (YAGNI)

- Live Claude Code / proxy interception monitoring (revisit only if we adopt proxy mode).
- A dashboard/UI — the Slack digest + nonzero exit is the interface.
- Auto-remediation — the guardian *detects and alerts*; a human decides whether to disable Headroom.

---
name: headroom-guardian
description: "stdlib-only harness verifying the Headroom compressor works + catches silent quality loss; ACTIVATED (JSON scope) on master — one open item: set ANTHROPIC_API_KEY to enable the quality check"
metadata: 
  node_type: memory
  type: project
  originSessionId: 56c5c6e5-fce2-43d3-b383-a10758dce877
---

▶ **RESUME (paused 2026-07-10, continue next session): ONE open item** — wire the quality-fidelity check by setting `ANTHROPIC_API_KEY` (a real `sk-ant-` Anthropic **Console** API key, NOT the Claude Code subscription) as a Windows USER env var via clipboard→`Get-Clipboard` (never echo). Owner said "proceed" but the clipboard held a non-key 14-char string, so nothing was set. After setting it: run the guardian `runner.py --dry-run` (quality ON, no Slack) and confirm each JSON item's quality probe = pass, then it's fully done. **Everything else is shipped & verified — nothing broken, no half-done work, all on `origin/master`.**

**Headroom Guardian** — a dependency-free (stdlib-only) Python harness at `scripts/headroom_guard/` that verifies the [Headroom](https://github.com/headroomlabs-ai/headroom) lossy context-compression tool actually works and — above all — **catches silent quality degradation** (compressed payloads that quietly drop a VIN/price/field). Built 2026-07-10 because Headroom's "same answers" claim was unverified and its traction numbers were inconsistent (718 vs 30.7k vs 58.2k stars across sources).

**SHIPPED to `origin/master` (merge commit `e6fa67e`, 2026-07-10).** 22 unittest tests green. Built via subagent-driven TDD in an isolated worktree (per-task implementer + two-stage review + final review).

**Four checks (in `guard.py`, all pure/injected-deps so testable vs mocks with NO Headroom):**
1. Quality-differential (the point): a Haiku probe (`claude-haiku-4-5-20251001`) answers the same critical facts from *compressed vs original*; a miss = fail.
2. Reversibility: `retrieve(compress(x))` must equal `x` byte-for-byte.
3. Savings band: token reduction must sit in a per-type band (flags too-little AND suspiciously-high).
4. Health + version pin: re-verify + alert on any Headroom version change.
Plus a **blind-probe escalation** (added from review): if a probe RAN but returned nothing usable on every item (`probe_blind`), status→fail (don't exit green). Distinct from `--probeless`/no-API-key → quality "unchecked", benign exit 0 but honestly labeled (never a false "ok").

**Isolation:** `adapter.py` is the ONLY module importing Headroom (`HeadroomAdapter`); `probe.py` the only LLM call; `runner.py` orchestrates + posts to the `/notify` Slack relay. Corpus at `corpus/` is synthetic (no real secrets); Slack render posts only statuses/labels, never raw payloads.

**Build-now / activate-on-install:** reports "not installed — skipped" (exit 0, no Slack) until `pip install "headroom-ai[all]"`. Weekly watchdog **Task Scheduler `TunedYota Headroom Guardian`** (Mon 8:30am) → `C:\Users\grosh\.tunedyota\run-headroom-guard.cmd` — **branch-independent** (`git archive origin/master scripts/headroom_guard | tar -x` into a scratch dir, runs that; needed because the shared checkout churns branches — see [[shared-folder-with-amsoil]]). State (version pin) persisted externally at `~/.tunedyota/headroom-guard-state.json` via `HEADROOM_GUARD_STATE` env override so it survives ephemeral runs. Verified end-to-end (exit 0, "skipped", no Slack).

**ACTIVATED 2026-07-10 (JSON scope) — master `a3bb6fb`, 25 tests.** Real-world findings from install:
- `pip install "headroom-ai[all]"` on Python 3.14 builds heavy deps from source (ONNX/HF) — abandoned. **Base `headroom-ai` (0.31.0, an abi3 wheel — installs clean on 3.14) + `httpx` is the working install** (both now in `C:\Users\grosh\AppData\Local\Python\pythoncore-3.14-64`). Base ALONE compresses 0% (SmartCrusher needs `httpx`); adding httpx unlocks JSON.
- **Base compresses JSON only** (SmartCrusher, structural — re-encodes array-of-dicts to compact schema+CSV, content-lossless at these sizes; ~55-60% real reduction). Code/prose need `[all]` and are OUT OF SCOPE (deferred).
- Real API ≠ the plan's assumptions: `headroom.compress(messages=[{"role":"user","content":text}], model=..., compress_user_messages=True, protect_recent=0)` → `CompressResult(.messages, .tokens_before/after, .compression_ratio)`. **No top-level `retrieve`** (base compress is one-way → reversibility check honestly `skipped`; CCR store exists via `SmartCrusher.ccr_get` but isn't wired). Adapter rewritten to this; savings now use Headroom's OWN token counts (accurate). Corpus is now JSON arrays (`bookings.json`/`events.json`); code/prose samples deleted. Tests made install-agnostic (old "absent via detect()" broke once Headroom was installed → now inject `AbsentAdapter`).
- **VERIFIED live via the actual launcher:** `✅ PASS @ v0.31.0`, bookings 59.2% / events 60.2% real savings, version pin persisted at `~/.tunedyota/headroom-guard-state.json`.

**ONE OPEN GAP — the quality-differential check (the star feature) is DORMANT: `ANTHROPIC_API_KEY` is NOT set** anywhere on the machine, so quality shows "unchecked" (savings + health still enforced). To enable fidelity checks: set `ANTHROPIC_API_KEY` as a Windows USER env var (owner-only secret; capture via clipboard→`Get-Clipboard`, never in chat). Owner may not have a raw API key (Claude Code subscription ≠ API key). Cosmetic note: `render()` only shows non-pass flags, so the digest hides the savings % on green runs — could show it as future polish.

Docs on master: spec `docs/superpowers/specs/2026-07-10-headroom-guardian-design.md`, plan `docs/superpowers/plans/2026-07-10-headroom-guardian.md`. Recommendation stance (see prior session): don't wrap live Claude Code with Headroom; use it standalone on JSON/tool-output data first, guarded by this harness. Related token-saving alternatives worth more confidence than Headroom: TOON (JSON encoding), Anthropic prompt caching, mcp-compressor, LLMLingua (prose/RAG).

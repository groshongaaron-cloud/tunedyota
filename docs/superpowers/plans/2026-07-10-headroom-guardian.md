# Headroom Guardian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stdlib-only Python harness that verifies the Headroom compression layer actually works — and, above all, catches *silent quality degradation* — running on-demand, as a weekly Slack watchdog, or as a pre-flight gate.

**Architecture:** Pure check functions (`guard.py`) operate over a `CompressorAdapter` interface, so every check is unit-tested against mock compressors (lossless + deliberately-lossy) with **no Headroom and no network**. A single `adapter.py` is the only code that imports Headroom; a single `probe.py` is the only code that calls an LLM. `runner.py` orchestrates and posts a pass/fail digest to the existing `/notify` Slack relay. The harness reports "not installed — skipped" until Headroom exists.

**Tech Stack:** Python 3.14 (stdlib only: `unittest`, `urllib`, `dataclasses`, `json`), the `/notify` Netlify Slack relay, Windows Task Scheduler. Probe model: `claude-haiku-4-5-20251001` via the Anthropic Messages API.

---

## ⚠️ Commit hazard (read first)

This repo folder is **shared with a separate AMSOIL session that switches branches unpredictably.** Before EVERY commit run `git branch --show-current`. All Guardian commits must land on **master**. If the checkout is not on master, commit via a temporary master worktree:

```bash
git worktree add /c/Users/grosh/ty-wt-master master
# copy/stage the changed files inside /c/Users/grosh/ty-wt-master, commit there, then:
git -C /c/Users/grosh/ty-wt-master push origin master
git worktree remove /c/Users/grosh/ty-wt-master
```

Never `git add -A` — stage only Guardian files by explicit path, to avoid sweeping up the other session's work.

## File Structure

```
scripts/headroom_guard/
  config.py          # thresholds, model id, paths, NOTIFY_URL
  guard.py           # PURE checks + CheckResult + preflight_ok (no I/O, no Headroom)
  adapter.py         # Compressed, CompressorAdapter, AbsentAdapter, HeadroomAdapter, detect()
  probe.py           # ask_model() — the only LLM call (urllib → Anthropic)
  runner.py          # CLI orchestration + Slack digest + exit codes
  corpus/
    manifest.json    # item → type, reversible flag, probe list
    booking.json     # synthetic booking payload (VIN/price/city/year facts)
    code_sample.py   # sample code with a known function/return
    prose_sample.txt # sample prose with known facts
  test_guard.py      # unittest: pure checks vs lossless + lossy mocks
  test_adapter.py    # unittest: detect() returns AbsentAdapter when Headroom absent
  test_probe.py      # unittest: request build + response parse with injected fetch
C:\Users\grosh\.tunedyota\run-headroom-guard.cmd   # launcher (outside repo)
.gitignore           # add scripts/headroom_guard/state.json
```

Run all tests: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest -v`
Real interpreter for the launcher: `C:\Users\grosh\AppData\Local\Python\pythoncore-3.14-64\python.exe`

---

### Task 1: Config module

**Files:**
- Create: `scripts/headroom_guard/config.py`

- [ ] **Step 1: Write the config**

```python
# scripts/headroom_guard/config.py
"""Guardian thresholds and constants. Pure data — no logic."""

PROBE_MODEL = "claude-haiku-4-5-20251001"

# Per content type: (min_reduction_pct, max_reduction_pct).
# Below min = not actually compressing. Above max = probably dropping content.
SAVINGS_BANDS = {
    "json": (20.0, 97.0),
    "code": (5.0, 80.0),
    "prose": (5.0, 85.0),
}

NOTIFY_URL = "https://tunedyota.com/.netlify/functions/notify"
CORPUS_DIRNAME = "corpus"
STATE_FILENAME = "state.json"
```

- [ ] **Step 2: Commit** (check branch first per hazard note)

```bash
git branch --show-current   # must be master (else use worktree)
git add scripts/headroom_guard/config.py
git commit -m "feat(headroom-guard): config thresholds + constants"
```

---

### Task 2: Adapter interface + Compressed + AbsentAdapter + detect()

**Files:**
- Create: `scripts/headroom_guard/adapter.py`
- Test: `scripts/headroom_guard/test_adapter.py`

- [ ] **Step 1: Write the failing test**

```python
# scripts/headroom_guard/test_adapter.py
import unittest
import adapter

class TestDetect(unittest.TestCase):
    def test_absent_when_headroom_not_installed(self):
        # Headroom is not installed in this repo → detect() must degrade gracefully.
        a = adapter.detect()
        self.assertFalse(a.installed)
        self.assertEqual(a.version(), "absent")
        self.assertFalse(a.doctor())

    def test_compressed_dataclass_defaults(self):
        c = adapter.Compressed(text="x")
        self.assertEqual(c.text, "x")
        self.assertIsNone(c.handle)
        self.assertFalse(c.reversible)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_adapter -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'adapter'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/headroom_guard/adapter.py
"""The ONLY module that imports Headroom. Everything else depends on the
CompressorAdapter interface below, so checks are testable without Headroom."""
from dataclasses import dataclass


@dataclass
class Compressed:
    text: str            # what the LLM would actually see
    handle: object = None # opaque token for reversible retrieve()
    reversible: bool = False


class AbsentAdapter:
    """Returned when Headroom is not installed. Never raises."""
    installed = False
    def version(self):
        return "absent"
    def doctor(self):
        return False


class HeadroomAdapter:
    """Wraps the real Headroom package. The three call sites below use Headroom's
    documented library API; VERIFY them against the installed package in Task 9."""
    installed = True
    def __init__(self, mod):
        self._h = mod

    def compress(self, text, content_type):
        res = self._h.compress(text)
        comp_text = getattr(res, "text", None)
        if comp_text is None and isinstance(res, dict):
            comp_text = res.get("text")
        handle = getattr(res, "handle", None)
        if handle is None and isinstance(res, dict):
            handle = res.get("handle")
        return Compressed(text=comp_text if comp_text is not None else str(res),
                          handle=handle, reversible=handle is not None)

    def retrieve(self, compressed):
        return self._h.retrieve(compressed.handle)

    def version(self):
        return str(getattr(self._h, "__version__", "unknown"))

    def doctor(self):
        fn = getattr(self._h, "doctor", None)
        if fn is None:
            return True  # import succeeded; no doctor() to call
        try:
            return bool(fn())
        except Exception:
            return False


def detect():
    """Return a live HeadroomAdapter, or AbsentAdapter if Headroom is missing."""
    try:
        import headroom  # noqa: only import site
        return HeadroomAdapter(headroom)
    except Exception:
        return AbsentAdapter()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_adapter -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/adapter.py scripts/headroom_guard/test_adapter.py
git commit -m "feat(headroom-guard): compressor adapter interface + absent fallback"
```

---

### Task 3: CheckResult + savings-band check

**Files:**
- Create: `scripts/headroom_guard/guard.py`
- Test: `scripts/headroom_guard/test_guard.py`

- [ ] **Step 1: Write the failing test**

```python
# scripts/headroom_guard/test_guard.py
import unittest
import guard
from adapter import Compressed


class TestSavings(unittest.TestCase):
    def test_in_band_passes(self):
        original = "x" * 400          # ~100 tokens
        compressed = "x" * 200        # ~50 tokens → 50% reduction
        r = guard.check_savings(original, compressed, (20.0, 97.0))
        self.assertEqual(r.status, "pass")

    def test_too_little_fails(self):
        r = guard.check_savings("x" * 400, "x" * 396, (20.0, 97.0))
        self.assertEqual(r.status, "fail")
        self.assertIn("too little", r.detail.lower())

    def test_suspiciously_high_flags(self):
        r = guard.check_savings("x" * 400, "x", (20.0, 97.0))
        self.assertEqual(r.status, "fail")
        self.assertIn("suspicious", r.detail.lower())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'guard'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/headroom_guard/guard.py
"""Pure verification checks. No I/O, no Headroom import, no network.
Every dependency (compressor, probe function, token counter) is injected,
so these are fully unit-testable against mocks."""
from dataclasses import dataclass, field


@dataclass
class CheckResult:
    name: str
    status: str            # "pass" | "fail" | "inconclusive" | "skipped"
    detail: str = ""
    data: dict = field(default_factory=dict)

    @property
    def ok(self):
        return self.status in ("pass", "skipped")


def count_tokens(text):
    """Deterministic token estimate (~4 chars/token). Good enough for a band
    check; consistent between original and compressed so ratios are stable."""
    return max(1, len(text) // 4)


def check_savings(original, compressed, band):
    min_pct, max_pct = band
    o, c = count_tokens(original), count_tokens(compressed)
    reduction = (o - c) / o * 100 if o else 0.0
    data = {"orig_tokens": o, "comp_tokens": c, "reduction_pct": round(reduction, 1)}
    if reduction < min_pct:
        return CheckResult("savings", "fail",
                           f"too little: {reduction:.1f}% < {min_pct}%", data)
    if reduction > max_pct:
        return CheckResult("savings", "fail",
                           f"suspiciously high: {reduction:.1f}% > {max_pct}%", data)
    return CheckResult("savings", "pass", f"{reduction:.1f}% reduction", data)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/guard.py scripts/headroom_guard/test_guard.py
git commit -m "feat(headroom-guard): CheckResult + savings-band check"
```

---

### Task 4: Quality-differential check (the core defense)

**Files:**
- Modify: `scripts/headroom_guard/guard.py`
- Modify: `scripts/headroom_guard/test_guard.py`

- [ ] **Step 1: Write the failing test**

```python
# append to scripts/headroom_guard/test_guard.py

class TestQuality(unittest.TestCase):
    # Fake probe: the "model" simply echoes the context, so a fact is "answered"
    # iff it is present in the context. This tests the CHECK logic, not a real LLM.
    @staticmethod
    def echo_probe(question, context):
        return context

    def test_fact_survives_passes(self):
        original = "VIN is 5TFDY5F17MX000123 and price is 4200."
        compressed = "VIN 5TFDY5F17MX000123 price 4200"
        probes = [{"q": "vin?", "expect": "5TFDY5F17MX000123"},
                  {"q": "price?", "expect": "4200"}]
        r = guard.check_quality(self.echo_probe, original, compressed, probes)
        self.assertEqual(r.status, "pass")

    def test_lost_fact_fails(self):
        original = "VIN is 5TFDY5F17MX000123 and price is 4200."
        compressed = "price 4200"           # VIN dropped by compression
        probes = [{"q": "vin?", "expect": "5TFDY5F17MX000123"}]
        r = guard.check_quality(self.echo_probe, original, compressed, probes)
        self.assertEqual(r.status, "fail")
        self.assertIn("5TFDY5F17MX000123", r.detail)

    def test_control_failure_is_inconclusive(self):
        # Fact not even in the original → probe is unreliable, not a compression bug.
        original = "no vin here"
        compressed = "no vin here"
        probes = [{"q": "vin?", "expect": "5TFDY5F17MX000123"}]
        r = guard.check_quality(self.echo_probe, original, compressed, probes)
        self.assertEqual(r.status, "inconclusive")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard.TestQuality -v`
Expected: FAIL with `AttributeError: module 'guard' has no attribute 'check_quality'`

- [ ] **Step 3: Write minimal implementation** (append to `guard.py`)

```python
def check_quality(probe_fn, original, compressed, probes):
    """Differential probe: each expected fact must be recoverable from the
    COMPRESSED text. If a fact is missing even from the ORIGINAL, the probe is
    unreliable (inconclusive), not a compression failure."""
    misses, inconclusive = [], []
    for p in probes:
        exp = p["expect"].lower()
        if exp not in probe_fn(p["q"], original).lower():
            inconclusive.append(p["expect"])   # control failed
            continue
        if exp not in probe_fn(p["q"], compressed).lower():
            misses.append(p["expect"])
    if misses:
        return CheckResult("quality", "fail",
                           f"facts lost after compression: {misses}",
                           {"lost": misses, "inconclusive": inconclusive})
    if inconclusive and len(inconclusive) == len(probes):
        return CheckResult("quality", "inconclusive",
                           f"all probes failed the original-control: {inconclusive}",
                           {"inconclusive": inconclusive})
    return CheckResult("quality", "pass",
                       f"{len(probes) - len(inconclusive)} fact(s) preserved",
                       {"inconclusive": inconclusive})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard -v`
Expected: PASS (all TestQuality + TestSavings)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/guard.py scripts/headroom_guard/test_guard.py
git commit -m "feat(headroom-guard): quality-differential probe check"
```

---

### Task 5: Reversibility + health/version checks + preflight gate

**Files:**
- Modify: `scripts/headroom_guard/guard.py`
- Modify: `scripts/headroom_guard/test_guard.py`

- [ ] **Step 1: Write the failing test**

```python
# append to scripts/headroom_guard/test_guard.py

class _MockAdapter:
    installed = True
    def __init__(self, *, retrieves, version="1.0.0", healthy=True):
        self._retrieves = retrieves      # what retrieve() returns
        self._version = version
        self._healthy = healthy
    def retrieve(self, compressed):
        return self._retrieves
    def version(self):
        return self._version
    def doctor(self):
        return self._healthy


class TestReversibility(unittest.TestCase):
    def test_exact_roundtrip_passes(self):
        a = _MockAdapter(retrieves="ORIGINAL")
        c = Compressed(text="cmp", handle=object(), reversible=True)
        r = guard.check_reversibility(a, "ORIGINAL", c)
        self.assertEqual(r.status, "pass")

    def test_drift_fails(self):
        a = _MockAdapter(retrieves="ORIGIN")   # lost a byte
        c = Compressed(text="cmp", handle=object(), reversible=True)
        r = guard.check_reversibility(a, "ORIGINAL", c)
        self.assertEqual(r.status, "fail")

    def test_non_reversible_skips(self):
        a = _MockAdapter(retrieves="")
        c = Compressed(text="cmp", reversible=False)
        r = guard.check_reversibility(a, "ORIGINAL", c)
        self.assertEqual(r.status, "skipped")


class TestHealthVersion(unittest.TestCase):
    def test_unhealthy_fails(self):
        r = guard.check_health_version(_MockAdapter(retrieves="", healthy=False), "1.0.0")
        self.assertEqual(r.status, "fail")

    def test_same_version_passes(self):
        r = guard.check_health_version(_MockAdapter(retrieves="", version="1.0.0"), "1.0.0")
        self.assertEqual(r.status, "pass")

    def test_version_change_flags_reverify(self):
        r = guard.check_health_version(_MockAdapter(retrieves="", version="2.0.0"), "1.0.0")
        self.assertEqual(r.status, "pass")
        self.assertIn("changed", r.detail.lower())
        self.assertEqual(r.data["version"], "2.0.0")


class TestPreflight(unittest.TestCase):
    def test_absent_adapter_returns_false(self):
        from adapter import AbsentAdapter
        ok = guard.preflight_ok(AbsentAdapter(), TestQuality.echo_probe,
                                "vin 5TFDY5F17MX000123", {"q": "vin?", "expect": "5TFDY5F17MX000123"},
                                "prose")
        self.assertFalse(ok)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard -v`
Expected: FAIL with `AttributeError: module 'guard' has no attribute 'check_reversibility'`

- [ ] **Step 3: Write minimal implementation** (append to `guard.py`)

```python
def check_reversibility(adapter, original, compressed):
    if not compressed.reversible:
        return CheckResult("reversibility", "skipped", "not a reversible payload")
    restored = adapter.retrieve(compressed)
    if restored == original:
        return CheckResult("reversibility", "pass", "byte-exact roundtrip")
    return CheckResult("reversibility", "fail",
                       "retrieve() did not reconstruct the original")


def check_health_version(adapter, pinned_version):
    if not adapter.doctor():
        return CheckResult("health", "fail", "doctor() reported unhealthy",
                           {"version": adapter.version()})
    v = adapter.version()
    if pinned_version and v != pinned_version:
        return CheckResult("health", "pass",
                           f"version changed {pinned_version} -> {v}; re-verify",
                           {"version": v, "changed": True})
    return CheckResult("health", "pass", f"healthy @ {v}", {"version": v})


def preflight_ok(adapter, probe_fn, item_text, one_probe, content_type):
    """Fast subset for scripts: health + one quality probe. Returns bool."""
    if not adapter.installed or not adapter.doctor():
        return False
    comp = adapter.compress(item_text, content_type)
    r = check_quality(probe_fn, item_text, comp.text, [one_probe])
    return r.status == "pass"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard -v`
Expected: PASS (all classes)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/guard.py scripts/headroom_guard/test_guard.py
git commit -m "feat(headroom-guard): reversibility, health/version pin, preflight gate"
```

---

### Task 6: Probe module (Anthropic call, injectable fetch)

**Files:**
- Create: `scripts/headroom_guard/probe.py`
- Test: `scripts/headroom_guard/test_probe.py`

- [ ] **Step 1: Write the failing test**

```python
# scripts/headroom_guard/test_probe.py
import io
import json
import unittest
import probe


class FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class TestProbe(unittest.TestCase):
    def test_builds_request_and_parses_answer(self):
        captured = {}
        def fake_fetch(req, timeout=0):
            captured["url"] = req.full_url
            captured["key"] = req.headers.get("X-api-key")
            body = json.loads(req.data.decode())
            captured["model"] = body["model"]
            return FakeResp(json.dumps(
                {"content": [{"type": "text", "text": "The VIN is 5TFDY5F17MX000123."}]}
            ).encode())

        ans = probe.ask_model("What is the VIN?", "VIN 5TFDY5F17MX000123",
                              api_key="sk-test", fetch=fake_fetch)
        self.assertIn("5TFDY5F17MX000123", ans)
        self.assertEqual(captured["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(captured["key"], "sk-test")

    def test_have_api_key_reads_env(self):
        self.assertIsInstance(probe.have_api_key({"ANTHROPIC_API_KEY": "x"}), bool)
        self.assertTrue(probe.have_api_key({"ANTHROPIC_API_KEY": "x"}))
        self.assertFalse(probe.have_api_key({}))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_probe -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'probe'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/headroom_guard/probe.py
"""The ONLY module that calls an LLM. Isolated so the guardian can run
--probeless when no ANTHROPIC_API_KEY is present."""
import json
import os
import urllib.request

from config import PROBE_MODEL

_ENDPOINT = "https://api.anthropic.com/v1/messages"


def have_api_key(env=None):
    env = os.environ if env is None else env
    return bool(env.get("ANTHROPIC_API_KEY"))


def ask_model(question, context, model=PROBE_MODEL, api_key=None, fetch=None):
    """Answer `question` strictly from `context`. Returns the model's text."""
    api_key = api_key or os.environ["ANTHROPIC_API_KEY"]
    fetch = fetch or urllib.request.urlopen
    body = json.dumps({
        "model": model,
        "max_tokens": 128,
        "messages": [{
            "role": "user",
            "content": (f"Answer ONLY from the context; if absent say 'unknown'.\n"
                        f"Context:\n{context}\n\nQuestion: {question}")
        }],
    }).encode("utf-8")
    req = urllib.request.Request(_ENDPOINT, data=body, headers={
        "content-type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    })
    with fetch(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    return "".join(b.get("text", "") for b in data.get("content", []))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_probe -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/probe.py scripts/headroom_guard/test_probe.py
git commit -m "feat(headroom-guard): isolated Anthropic probe with injectable fetch"
```

---

### Task 7: Golden corpus + manifest

**Files:**
- Create: `scripts/headroom_guard/corpus/manifest.json`
- Create: `scripts/headroom_guard/corpus/booking.json`
- Create: `scripts/headroom_guard/corpus/code_sample.py`
- Create: `scripts/headroom_guard/corpus/prose_sample.txt`

- [ ] **Step 1: Create the manifest**

```json
{
  "items": [
    {
      "file": "booking.json",
      "type": "json",
      "reversible": true,
      "probes": [
        {"q": "What is the vehicle VIN?", "expect": "5TFDY5F17MX000123"},
        {"q": "What is the total order price in US dollars?", "expect": "4200"},
        {"q": "Which city is the install event in?", "expect": "Sioux Falls"},
        {"q": "What is the vehicle model year?", "expect": "2024"}
      ]
    },
    {
      "file": "code_sample.py",
      "type": "code",
      "reversible": false,
      "probes": [
        {"q": "What is the name of the main function?", "expect": "resolve_calibration"},
        {"q": "What does the function return when the tier is unknown?", "expect": "None"}
      ]
    },
    {
      "file": "prose_sample.txt",
      "type": "prose",
      "reversible": false,
      "probes": [
        {"q": "What supercharger brand is named?", "expect": "Magnuson"},
        {"q": "How many horsepower gain is claimed?", "expect": "150"}
      ]
    }
  ]
}
```

- [ ] **Step 2: Create `booking.json`** (synthetic; a redundant history array makes compression meaningful)

```json
{
  "booking_id": "BK-2024-000123",
  "customer": {"name": "Sample Owner", "email": "sample@example.com", "phone": "000-000-0000"},
  "vehicle": {"make": "Toyota", "model": "Tundra", "model_year": 2024, "vin": "5TFDY5F17MX000123"},
  "event": {"city": "Sioux Falls", "date": "2026-08-15", "installer": "Cody"},
  "order": {"tune": "OTT medium", "price_usd": 4200, "status": "confirmed"},
  "history": [
    {"ts": "2026-07-01T10:00:00Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:01Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:02Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:03Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:04Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:05Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:06Z", "action": "created", "by": "system", "note": "lead captured from funnel"},
    {"ts": "2026-07-01T10:00:07Z", "action": "created", "by": "system", "note": "lead captured from funnel"}
  ]
}
```

- [ ] **Step 3: Create `code_sample.py`**

```python
def resolve_calibration(tier):
    table = {"light": 1, "mild": 2, "medium": 3, "spicy": 4}
    if tier not in table:
        return None
    return table[tier]
```

- [ ] **Step 4: Create `prose_sample.txt`**

```
The Magnuson supercharger system for the Toyota Tundra is a positive-displacement
roots-style blower that bolts to the factory engine. On a supported platform it
delivers a claimed gain of roughly 150 horsepower at the crank while keeping the
emissions equipment intact. Installation is handled at a scheduled event by a
certified installer, and every build ships with a serialized certificate.
```

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/corpus/
git commit -m "feat(headroom-guard): golden corpus (booking/code/prose) + manifest"
```

---

### Task 8: Runner orchestration + Slack digest + exit codes

**Files:**
- Create: `scripts/headroom_guard/runner.py`
- Modify: `scripts/headroom_guard/test_guard.py` (runner smoke test)

- [ ] **Step 1: Write the failing test**

```python
# append to scripts/headroom_guard/test_guard.py
import runner

class TestRunnerAbsent(unittest.TestCase):
    def test_absent_run_is_skipped_and_green(self):
        # Headroom absent → run_all reports skipped, no exceptions, exit-code 0.
        report = runner.run_all(probeless=True)
        self.assertEqual(report["status"], "skipped")
        self.assertEqual(runner.exit_code(report), 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard.TestRunnerAbsent -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'runner'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/headroom_guard/runner.py
"""Guardian orchestration: load corpus, run checks over the detected adapter,
render a report, post a Slack digest via /notify, exit nonzero on failure.

Flags: --dry-run (no Slack), --probeless (skip LLM quality check), --json."""
import json
import os
import sys
import urllib.request
from pathlib import Path

import config
import guard
import probe
from adapter import detect

HERE = Path(__file__).resolve().parent
CORPUS = HERE / config.CORPUS_DIRNAME
STATE = HERE / config.STATE_FILENAME


def _load_state():
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"pinned_version": ""}


def _save_state(version):
    STATE.write_text(json.dumps({"pinned_version": version}, indent=2), encoding="utf-8")


def _probe_fn():
    if not probe.have_api_key():
        return None
    return lambda q, ctx: probe.ask_model(q, ctx)


def run_all(probeless=False):
    adapter = detect()
    if not adapter.installed:
        return {"status": "skipped", "reason": "Headroom not installed", "items": []}

    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    state = _load_state()
    probe_fn = None if probeless else _probe_fn()
    results = []

    for item in manifest["items"]:
        text = (CORPUS / item["file"]).read_text(encoding="utf-8")
        comp = adapter.compress(text, item["type"])
        checks = [
            guard.check_savings(text, comp.text, config.SAVINGS_BANDS[item["type"]]),
            guard.check_reversibility(adapter, text, comp),
        ]
        if probe_fn is None:
            checks.append(guard.CheckResult("quality", "inconclusive", "no probe (probeless/no key)"))
        else:
            checks.append(guard.check_quality(probe_fn, text, comp.text, item["probes"]))
        results.append({"file": item["file"], "checks": [c.__dict__ for c in checks]})

    health = guard.check_health_version(adapter, state.get("pinned_version", ""))
    _save_state(health.data.get("version", adapter.version()))

    failed = any(c["status"] == "fail" for it in results for c in it["checks"]) or health.status == "fail"
    return {
        "status": "fail" if failed else "pass",
        "version": adapter.version(),
        "health": health.__dict__,
        "items": results,
    }


def exit_code(report):
    return 1 if report.get("status") == "fail" else 0


def render(report):
    if report["status"] == "skipped":
        return ":shield: *Headroom Guardian* — Headroom not installed; nothing to check."
    icon = ":white_check_mark:" if report["status"] == "pass" else ":rotating_light:"
    lines = [f"{icon} *Headroom Guardian* — {report['status'].upper()} @ v{report['version']}"]
    lines.append(f"health: {report['health']['detail']}")
    for it in report["items"]:
        flags = [f"{c['name']}:{c['status']}" for c in it["checks"] if c["status"] != "pass"]
        summary = "ok" if not flags else " ".join(flags)
        lines.append(f"• `{it['file']}` — {summary}")
    return "\n".join(lines)


def post_to_slack(text):
    token = os.environ.get("TY_NOTIFY_TOKEN")
    if not token:
        print("[guardian] TY_NOTIFY_TOKEN not set; skipping Slack post")
        return
    req = urllib.request.Request(
        config.NOTIFY_URL,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-ty-notify": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        print(f"[guardian] notify: {r.status} {r.read().decode('utf-8', 'replace')}")


def main(argv):
    probeless = "--probeless" in argv
    dry = "--dry-run" in argv
    report = run_all(probeless=probeless)
    if "--json" in argv:
        print(json.dumps(report, indent=2))
    else:
        print(render(report))
    if not dry and report["status"] != "skipped":
        post_to_slack(render(report))
    return exit_code(report)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest test_guard.TestRunnerAbsent -v`
Expected: PASS

- [ ] **Step 5: Run the full suite + a live absent dry-run**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python -m unittest -v`
Expected: all tests PASS
Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python runner.py --dry-run --probeless`
Expected: prints "Headroom not installed; nothing to check", exit 0

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add scripts/headroom_guard/runner.py scripts/headroom_guard/test_guard.py
git commit -m "feat(headroom-guard): runner orchestration + Slack digest + exit codes"
```

---

### Task 9: Gitignore state + launcher + scheduled watchdog

**Files:**
- Modify: `.gitignore`
- Create: `C:\Users\grosh\.tunedyota\run-headroom-guard.cmd`
- Create (Task Scheduler task): `TunedYota Headroom Guardian`

- [ ] **Step 1: Ignore the runtime state file**

Append to `.gitignore`:
```
# Headroom Guardian runtime state (version pin)
scripts/headroom_guard/state.json
```

- [ ] **Step 2: Create the launcher** (branch-independent, mirrors run-last30days.cmd)

```bat
@echo off
REM Headroom Guardian weekly watchdog. Runs master's committed copy regardless
REM of the checked-out branch; posts a pass/fail digest to Slack via /notify.
cd /d "C:\Users\grosh\Documents\tunedyota"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set "LOG=%USERPROFILE%\.tunedyota\headroom-guard.log"
"C:\Users\grosh\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\headroom_guard\runner.py >> "%LOG%" 2>&1
```

Note: unlike last30days, the runner imports sibling modules, so it must run from the real file path (not piped via stdin). It reads master's files only if the checkout is on master; acceptable because the Guardian is idempotent and low-stakes, and the weekly run tolerates an occasional feature-branch checkout. (If this proves flaky, switch to a `git worktree`-backed launcher later.)

- [ ] **Step 3: Register the scheduled task** (PowerShell, weekly Mon 8:30am — 30 min after last30days)

```powershell
$action = New-ScheduledTaskAction -Execute "C:\Users\grosh\.tunedyota\run-headroom-guard.cmd"
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8:30AM
$principal = New-ScheduledTaskPrincipal -UserId "grosh" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "TunedYota Headroom Guardian" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Weekly verification that Headroom compression still works and preserves critical facts." -Force
```

- [ ] **Step 4: Verify the task registered**

Run (PowerShell): `Get-ScheduledTaskInfo -TaskName "TunedYota Headroom Guardian" | Select-Object NextRunTime`
Expected: next Monday 8:30 AM

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add .gitignore
git commit -m "chore(headroom-guard): gitignore runtime state (launcher + task are local)"
```

---

### Task 10: Install-time verification (run only after `pip install headroom-ai`)

**Files:** none (verification task). Do NOT skip when adopting Headroom.

- [ ] **Step 1: Install into a scratch environment**

Run: `pip install "headroom-ai[all]"` (or a venv)
Then: `cd scripts/headroom_guard && PYTHONUTF8=1 python -c "import adapter; a=adapter.detect(); print(a.installed, a.version())"`
Expected: `True <version>` — confirms `detect()` now returns a live `HeadroomAdapter`.

- [ ] **Step 2: Confirm the adapter's assumed API matches the real package**

Run: `PYTHONUTF8=1 python -c "import headroom; print([n for n in dir(headroom) if not n.startswith('_')])"`
Check that `compress` and `retrieve` exist and that `compress()` returns an object/dict exposing the compressed text and (for reversible mode) a handle. If the names or return shape differ, edit ONLY the three call sites in `HeadroomAdapter.compress/retrieve/version` in `adapter.py` to match. Re-run `python -m unittest -v` — the pure-check tests must still pass unchanged.

- [ ] **Step 3: First real run + pin the version**

Run: `cd scripts/headroom_guard && PYTHONUTF8=1 python runner.py --dry-run` (with `ANTHROPIC_API_KEY` set for the quality probe)
Expected: PASS across booking/code/prose; `state.json` now records the pinned version. Investigate any `fail`/`inconclusive` before enabling the weekly Slack post.

- [ ] **Step 4: Commit any adapter adjustments**

```bash
git branch --show-current
git add scripts/headroom_guard/adapter.py
git commit -m "fix(headroom-guard): align adapter with installed Headroom API"
```

---

## Self-Review

**Spec coverage:**
- Quality differential → Task 4 ✓
- Reversibility integrity → Task 5 ✓
- Savings sanity band → Task 3 ✓
- Health + version pin → Task 5 (`check_health_version`) + Task 8 (state persist) ✓
- Isolation (pure guard, single adapter, single probe) → Tasks 2/3/4/5/6 ✓
- Graceful-absent → Task 2 (`detect`) + Task 8 (`run_all` skipped) + Task 8 Step 5 live check ✓
- On-demand / weekly watchdog / pre-flight gate → Task 8 (`main`) / Task 9 (task) / Task 5 (`preflight_ok`) ✓
- Slack via /notify → Task 8 (`post_to_slack`) ✓
- Deliberately-lossy mock proves detection → Task 3 & 4 tests (too-little / lost-fact) ✓
- Secret-scrub / no raw payloads to Slack → Task 7 synthetic corpus + Task 8 `render` posts only labels/statuses ✓

**Placeholder scan:** no TBD/TODO; every code step is complete. The `adapter.py` "VERIFY in Task 9" note is a real, scheduled verification action, not a code placeholder.

**Type consistency:** `CheckResult(name,status,detail,data)` used identically everywhere; `Compressed(text,handle,reversible)` consistent; `probe_fn(q, ctx)->str` consistent across guard + runner + tests; `run_all(probeless=)` / `exit_code(report)` / `render(report)` signatures match the runner test.

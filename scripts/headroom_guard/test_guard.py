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


if __name__ == "__main__":
    unittest.main()

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

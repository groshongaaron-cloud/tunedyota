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

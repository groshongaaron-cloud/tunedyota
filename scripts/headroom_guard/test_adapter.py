# scripts/headroom_guard/test_adapter.py
import unittest
import adapter

class TestDetect(unittest.TestCase):
    def test_absent_adapter_properties(self):
        a = adapter.AbsentAdapter()
        self.assertFalse(a.installed)
        self.assertEqual(a.version(), "absent")
        self.assertFalse(a.doctor())

    def test_detect_returns_usable_adapter(self):
        a = adapter.detect()
        self.assertIn(a.installed, (True, False))
        self.assertTrue(callable(a.version))

    def test_compressed_dataclass_defaults(self):
        c = adapter.Compressed(text="x")
        self.assertEqual(c.text, "x")
        self.assertIsNone(c.handle)
        self.assertFalse(c.reversible)

if __name__ == "__main__":
    unittest.main()

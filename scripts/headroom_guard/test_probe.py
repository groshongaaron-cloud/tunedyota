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

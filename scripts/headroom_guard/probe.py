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

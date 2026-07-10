# scripts/headroom_guard/adapter.py
"""The ONLY module that imports Headroom. Everything else depends on the
CompressorAdapter interface below, so checks are testable without Headroom."""
import json
from dataclasses import dataclass

_COMPRESS_MODEL = "claude-sonnet-4-5-20250929"


@dataclass
class Compressed:
    text: str            # what the LLM would actually see
    handle: object = None # opaque token for reversible retrieve()
    reversible: bool = False
    tokens_before: int = None
    tokens_after: int = None


class AbsentAdapter:
    """Returned when Headroom is not installed. Never raises."""
    installed = False
    def version(self):
        return "absent"
    def doctor(self):
        return False


class HeadroomAdapter:
    """Wraps the real Headroom package using the messages compress() API."""
    installed = True
    def __init__(self, mod):
        self._h = mod

    def compress(self, text, content_type):
        messages = [{"role": "user", "content": text}]
        res = self._h.compress(messages, model=_COMPRESS_MODEL,
                               compress_user_messages=True, protect_recent=0)
        parts = []
        for m in res.messages:
            c = m.get("content")
            parts.append(c if isinstance(c, str) else json.dumps(c))
        return Compressed(text="\n".join(parts), handle=None, reversible=False,
                          tokens_before=getattr(res, "tokens_before", None),
                          tokens_after=getattr(res, "tokens_after", None))

    def retrieve(self, compressed):
        raise NotImplementedError("base headroom compress() is not reversibly retrievable")

    def version(self):
        return str(getattr(self._h, "__version__", "unknown"))

    def doctor(self):
        try:
            self._h.compress([{"role": "user", "content": "healthcheck"}], model=_COMPRESS_MODEL)
            return True
        except Exception:
            return False


def detect():
    """Return a live HeadroomAdapter, or AbsentAdapter if Headroom is missing."""
    try:
        import headroom  # noqa: only import site
        return HeadroomAdapter(headroom)
    except Exception:
        return AbsentAdapter()

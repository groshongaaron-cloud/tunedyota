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

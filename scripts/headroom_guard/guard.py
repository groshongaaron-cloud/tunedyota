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

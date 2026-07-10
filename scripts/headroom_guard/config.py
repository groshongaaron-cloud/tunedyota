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

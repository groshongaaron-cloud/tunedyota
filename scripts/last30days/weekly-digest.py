#!/usr/bin/env python3
"""Tuned Yota weekly research digest.

Runs the full last30days watchlist, builds a weekly briefing, and posts a single
consolidated digest to the /notify Slack relay (raw webhook stays server-side).

Invoked weekly by Windows Task Scheduler. Reads the relay token from the
TY_NOTIFY_TOKEN user env var. Always runs children with PYTHONUTF8=1 so the
Windows cp1252 subprocess-reader bug can't silently drop social content.

Manual run:  python scripts/last30days/weekly-digest.py
Dry run (no Slack post):  python scripts/last30days/weekly-digest.py --dry-run
"""
import json
import os
import sys
import subprocess
import urllib.request
from pathlib import Path

NOTIFY_URL = "https://tunedyota.com/.netlify/functions/notify"
PLUGIN_ROOT = Path.home() / ".claude" / "plugins" / "cache" / "last30days-skill" / "last30days"
MAX_SLACK_CHARS = 3500
# Findings below this relevance_score are dropped from the digest. The tool's
# relevance signal is noisy (scale ~0-45); a floor here removes the clearly
# off-topic 0-band junk (unrelated HN/Reddit that only keyword-matched).
RELEVANCE_FLOOR = 10.0


def _version_key(p: Path):
    parts = []
    for chunk in p.name.split("."):
        parts.append(int(chunk) if chunk.isdigit() else 0)
    return parts


def resolve_scripts_dir() -> Path:
    """Newest installed plugin version's scripts dir (survives plugin updates)."""
    versions = [d for d in PLUGIN_ROOT.glob("*") if (d / "skills/last30days/scripts").is_dir()]
    if not versions:
        sys.exit(f"last30days plugin not found under {PLUGIN_ROOT}")
    newest = max(versions, key=_version_key)
    return newest / "skills" / "last30days" / "scripts"


def run_child(scripts: Path, script: str, *args) -> str:
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.run(
        [sys.executable, str(scripts / script), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        env=env, timeout=1800,
    )
    return proc.stdout


def build_digest(briefing: dict) -> str:
    week = briefing.get("week_of", "this week")
    topics = briefing.get("topics", [])
    # Only topics with fresh activity, hottest first.
    active = [t for t in topics if t.get("this_week_count", 0) > 0]
    active.sort(key=lambda t: t.get("this_week_engagement", 0), reverse=True)

    header = f":mag: *Tuned Yota — weekly tuning radar* (week of {week})"
    if not active:
        return header + "\n_No new chatter across the 20 watched topics this week._"

    lines = [header, ""]
    for t in active:
        cnt = t.get("this_week_count", 0)
        chg = t.get("engagement_change_pct", 0)
        arrow = "▲" if chg > 0 else ("▼" if chg < 0 else "•")
        lines.append(f"*{t['name']}* — {cnt} new  {arrow}{abs(chg)}% engagement")
        relevant = [f for f in (t.get("top_findings") or [])
                    if f.get("relevance_score", 0) >= RELEVANCE_FLOOR]
        for f in relevant[:3]:
            title = (f.get("source_title") or "").strip()[:120]
            url = f.get("source_url") or ""
            src = f.get("source") or ""
            score = f.get("engagement_score")
            meta = " · ".join(x for x in [src, (f"{score}⬆" if score else "")] if x)
            prefix = f" ({meta})" if meta else ""
            if not title:
                continue
            lines.append(f"   • <{url}|{title}>{prefix}" if url else f"   • {title}{prefix}")
    text = "\n".join(lines)
    if len(text) > MAX_SLACK_CHARS:
        text = text[:MAX_SLACK_CHARS].rsplit("\n", 1)[0] + "\n_…truncated; full detail in research.db_"
    return text


def post_to_slack(text: str) -> None:
    token = os.environ.get("TY_NOTIFY_TOKEN")
    if not token:
        sys.exit("TY_NOTIFY_TOKEN not set — cannot post digest.")
    req = urllib.request.Request(
        NOTIFY_URL,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-ty-notify": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        print(f"notify: {resp.status} {resp.read().decode('utf-8', 'replace')}")


def main() -> None:
    dry = "--dry-run" in sys.argv
    no_run = "--no-run" in sys.argv  # skip the sweep; render+post latest stored data
    scripts = resolve_scripts_dir()
    print(f"[weekly-digest] scripts: {scripts}")

    if no_run:
        print("[weekly-digest] --no-run: skipping watchlist run-all.")
    else:
        print("[weekly-digest] running watchlist run-all …")
        run_child(scripts, "watchlist.py", "run-all")

    print("[weekly-digest] generating weekly briefing …")
    raw = run_child(scripts, "briefing.py", "generate", "--weekly")
    briefing = json.loads(raw)
    text = build_digest(briefing)

    print("---- digest ----")
    print(text)
    print("----------------")
    if dry:
        print("[weekly-digest] --dry-run: not posting to Slack.")
        return
    post_to_slack(text)


if __name__ == "__main__":
    main()

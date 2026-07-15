#!/usr/bin/env python3
"""Weekly C2 review-QR activation reminder.

The installer console's "Ask for a review" QR (C2) is fully built and shipped,
but it stays hidden until the Netlify env var GOOGLE_REVIEW_URL is set — which
can't happen until the owner's Google Business Profile is approved (video
verification). This script is the weekly nudge for that one open item.

Each run it checks the live review-qr endpoint:
  - still blocked (GOOGLE_REVIEW_URL unset -> endpoint returns
    "review url not configured") -> post a reminder to the /notify Slack relay.
  - activated (endpoint returns an SVG) -> stay SILENT. The reminder
    self-quiets the moment C2 goes live; no manual teardown needed.

Invoked weekly by Windows Task Scheduler via the run-c2-review-reminder.cmd
launcher (which pipes master's committed copy into Python). Reads the relay
token from the TY_NOTIFY_TOKEN user env var (raw Slack webhook stays
server-side). Stdlib only.
"""
import json
import os
import sys
import urllib.error
import urllib.request

REVIEW_QR = "https://tunedyota.com/.netlify/functions/review-qr"
NOTIFY_URL = "https://tunedyota.com/.netlify/functions/notify"

REMINDER = (
    ":alarm_clock: *Weekly reminder — installer review-QR (C2) is still dark.*\n"
    "The console's \"★ Ask for a review\" QR is built and waiting on ONE thing: "
    "your *Google Business Profile approval* (the Google video verification).\n"
    "As soon as Google approves the page, open it, grab the *\"Ask for reviews\"* "
    "share link (looks like https://g.page/r/…/review), and send it to Claude. "
    "Activation is then ~2 min: `netlify env:set GOOGLE_REVIEW_URL` across contexts "
    "+ a redeploy, and the button goes live for the installers.\n"
    "_This reminder stops on its own once the URL is set._"
)


def fetch_review_qr():
    """Return (status_code, body_text) for the live review-qr endpoint."""
    req = urllib.request.Request(REVIEW_QR, headers={"User-Agent": "ty-c2-reminder"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def post_to_slack(text):
    token = os.environ.get("TY_NOTIFY_TOKEN")
    if not token:
        sys.exit("TY_NOTIFY_TOKEN not set — cannot post reminder.")
    req = urllib.request.Request(
        NOTIFY_URL,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-ty-notify": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        print(f"notify: {resp.status} {resp.read().decode('utf-8', 'replace')}")


def main():
    status, body = fetch_review_qr()
    activated = status == 200 and "<svg" in body.lower()
    if activated:
        print("C2 review-QR is ACTIVE (GOOGLE_REVIEW_URL set) — no reminder needed.")
        return
    print(f"C2 still blocked (HTTP {status}) — posting weekly reminder.")
    post_to_slack(REMINDER)


if __name__ == "__main__":
    main()

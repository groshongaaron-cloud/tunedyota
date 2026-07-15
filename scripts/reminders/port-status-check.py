#!/usr/bin/env python3
"""Daily Twilio port-in status check for the business line +16124067117.

Pings the Twilio Porting API for port-in KW68968cacb3f91b4c6c561a7658fd1354 and
Slacks (via the /notify relay) ONLY when something is actionable:

  - "Waiting for Signature"      -> nudge the owner to sign the LOA (with the
                                    current e-sign link, fetched live).
  - completed / ported           -> loud alert: the number is on Twilio, time to
                                    wire the ported number's webhooks + live-test.
  - canceled / rejected / expired -> alert with the reason so we can re-submit.
  - in review / in progress       -> stay SILENT (no daily spam).

Reads TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN + TY_NOTIFY_TOKEN from env (the
launcher inherits them from the Windows USER environment). Stdlib only.

REMOVE this task once the port completes and the webhooks are wired
(Task Scheduler: "TunedYota Port Status Check").
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

PORT_IN_SID = "KW68968cacb3f91b4c6c561a7658fd1354"
NUMBER = "+16124067117"
TWILIO_URL = "https://numbers.twilio.com/v1/Porting/PortIn/" + PORT_IN_SID
NOTIFY_URL = "https://tunedyota.com/.netlify/functions/notify"


def twilio_get():
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    tok = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not tok:
        sys.exit("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — cannot check port status.")
    auth = base64.b64encode(f"{sid}:{tok}".encode()).decode()
    req = urllib.request.Request(TWILIO_URL, headers={"Authorization": "Basic " + auth})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def notify(text):
    token = os.environ.get("TY_NOTIFY_TOKEN")
    if not token:
        sys.exit("TY_NOTIFY_TOKEN not set — cannot post.")
    req = urllib.request.Request(
        NOTIFY_URL,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-ty-notify": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        print(f"notify: {r.status} {r.read().decode('utf-8', 'replace')}")


def main():
    d = twilio_get()
    status = (d.get("port_in_request_status") or "").strip()
    pn = (d.get("phone_numbers") or [{}])[0]
    pstatus = (pn.get("port_in_phone_number_status") or "").strip()
    low = (status + " " + pstatus).lower()
    target = d.get("target_port_in_date", "?")
    print(f"port status: '{status}' / number: '{pstatus}' / target: {target}")

    if ("complet" in low) or ("ported" in low):
        notify(
            f":tada: *Port COMPLETE* — {NUMBER} is now on Twilio (status: {status}). "
            "ACTION: point the ported number's Voice webhook -> /twilio-voice and "
            "Messaging webhook -> /twilio-sms, then run the live text/call/voicemail "
            "test. Tell Claude: 'the port completed'."
        )
        return

    if any(k in low for k in ("cancel", "reject", "expired", "fail", "action_required", "exception")):
        reason = pn.get("rejection_reason") or d.get("order_cancellation_reason") or "(see Twilio console)"
        notify(
            f":warning: *Port needs attention* — {NUMBER} status: {status} / {pstatus}. "
            f"Reason: {reason}. Bring this to Claude to re-submit."
        )
        return

    if "signature" in low:
        link = d.get("signature_request_url") or ""
        tail = ("Sign here: " + link) if link else "Check mybills18758@gmail.com for the Twilio/HelloSign e-sign email."
        notify(
            f":pen: *Port waiting on your LOA signature* — {NUMBER} will not move until you sign "
            f"(target port date {target}). {tail}"
        )
        return

    # in review / pending / in progress -> no notification (avoid daily spam).
    print(f"in-progress ({status}) — no notification sent.")


if __name__ == "__main__":
    main()

# Tuned Yota — Operations Manual

The standard operating procedures (SOPs) that run Tuned Yota day to day. Written for two
readers — the **Owner/Operator** and the **Installers** — and grounded in exactly how the
live system on `tunedyota.com` actually behaves. Every SOP names the real pages, functions,
Airtable tables, and schedules involved, so a procedure and the software never drift apart.

> **Source of truth.** These SOPs describe the system as built. If code and an SOP ever
> disagree, the code wins — fix the SOP (and tell the Owner). The deep technical diagrams
> live in [`docs/architecture/`](../architecture/); this manual is the operational layer on top.

## The two roles

| Role | Who | Owns |
|------|-----|------|
| **Owner/Operator** | Aaron Groshong (`info@tunedyota.com`) | Marketing, lead tracking, event scheduling, routing, monitoring, reporting, secrets, OTT relationship. Also serves as an installer. |
| **Installer** | Aaron (`info@`), Noah Kreis (`noah@`), Cody Star (`cody@`) | Working assigned events: running the roster, performing the calibration, close-out (VIN + calibration), certificate hand-off. |

Installer regions (server source of truth — `netlify/functions/lib/routing.js` + `markets.js`):

| Installer | Key | Region |
|-----------|-----|--------|
| Aaron Groshong | `aaron` | Minnesota, Iowa, Fargo, Eau Claire & Madison |
| Noah Kreis | `noah` | Wisconsin (except Eau Claire & Madison) |
| Cody Star | `cody` | Sioux Falls, Rapid City & Omaha (+ Sioux City, Lincoln) |

## The SOPs

| # | SOP | Primary owner |
|---|-----|---------------|
| 1 | [Client Marketing](sop-client-marketing.md) | Owner |
| 2 | [Client Lead Tracking](sop-lead-tracking.md) | Owner |
| 3 | [Event Booking](sop-event-booking.md) | Owner (+ Installer inputs) |
| 4 | [Event Close-Out](sop-event-closeout.md) | Installer |
| 5 | [Priority Waitlist Monitoring](sop-priority-waitlist.md) | Owner |
| 6 | [Installer Field Guide](sop-installer-field-guide.md) | Installer |
| 7 | [Event Scheduling](sop-event-scheduling.md) | Owner |
| 8 | [Monitoring & Incident Response](sop-monitoring-incident-response.md) | Owner |
| 9 | [Monthly OTT Calibration Report](sop-monthly-ott-report.md) | Owner |
| 10 | [Data Security & Secrets](sop-data-security-secrets.md) | Owner |

## The business at a glance

```
DISCOVER            CONVERT                 FULFILL                 RETAIN
SEO / social  ->  Find Your Exact Tune  ->  Event day          ->  Review request
GBP / ads         book a slot / lead        VIN + calibration      Priority-list rebook
                  |                          certificate            content -> back to DISCOVER
                  v
              Airtable: Bookings + Priority List + Funnel Events
```

Deploy = **push to `master`** (Netlify auto-builds `site/`). See the [`ship`](../../.claude/skills/ship/SKILL.md)
skill for the regenerate → test → push → verify sequence. Customer-facing copy is governed by
locked brand rules (no "Kevin Whitman", no "Stage 2/3" or "MAF"; turbo tier = "Turbo Performance
Calibration"; emissions-intact positioning) — grep before shipping copy.

## Key surfaces

| Surface | URL / trigger | Access |
|---------|---------------|--------|
| Booking flow | `/find-your-exact-tune` | Public |
| Staff intake (walk-in/phone/DM) | `/intake.html` | Passcode (`INTAKE_SECRET`) |
| Installer console | `/installer.html` | Per-installer passcode (`INSTALLER_TOKENS`) |
| OTT Commission Report console | `/.netlify/functions/ott-report-review?token=` | Owner (token `OTT_APPROVE_SECRET`) |
| Slot availability API | `/.netlify/functions/availability?city=` | Public |
| Airtable | Bookings · Priority List · Funnel Events | Owner |
| Alerts | Slack (via `/notify` relay) | Owner |

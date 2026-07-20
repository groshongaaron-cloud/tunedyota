---
name: installer-dashboard-vin-and-ia-program
description: Field-driven installer-dashboard upgrade (2026-07-15) — VIN photo+Claude-OCR capture + Jobs location/Done tabs. Spec+plan committed to master; NOT yet implemented.
metadata: 
  node_type: memory
  type: project
  originSessionId: a2328f5e-6831-4d5d-8f47-7faee1b1fe19
---

Owner started a field-feedback-driven installer-dashboard improvement session 2026-07-15
(dashboards now in real field use). Three workstreams, all designed with app-parity in mind
(this console is wrapped by the future Tuned Yota native app). Related: [[certificate-v2-dashboard-program]].

**Root cause found (Shannon Conroy, 2020 4Runner walk-in, no cert):** her booking
`reciytsQ4mMdJxBWy` is still `Status=Booked` — never closed out — so no cert fired (certs only
trigger on close-out / the `certificate-dispatch` backstop which only sweeps `Completed`). Her
Email IS on file. Close-out hard-requires a full 17-char VIN + calibration + OTT fields; if the
VIN couldn't be captured on-site the installer was hard-blocked → customer left with no cert.
Missing-cert and the "camera won't trigger" report are the SAME failure.

**Owner decisions (locked):** (1) VIN stays MANDATORY for close-out — make capture bulletproof,
don't relax it; (2) manual VIN typing must ALWAYS be available so the camera never blocks a
close-out; (3) VIN OCR = manual shutter + **Claude vision** (Haiku 4.5), photo transient/not
stored; (4) dashboard IA = Jobs **location tabs + a ✓ Done tab** (completed pulled out of the
active close-out cards to stop mobile bunching). Note the scan overlay ALREADY had a barcode
auto-scanner — the gap was no manual shutter and no way to read a *printed* VIN.

**Status: code Tasks 1-5 SHIPPED LIVE 2026-07-15** (master merge commit `6158165`, subagent-driven
w/ spec+quality+final review, 675 tests green; verified live on tunedyota.com — installer.html serves
the new code, `/.netlify/functions/vin-ocr` returns 401 auth-gated). Spec
`docs/superpowers/specs/2026-07-15-installer-dashboard-vin-and-ia-design.md` + plan
`docs/superpowers/plans/2026-07-15-installer-dashboard-vin-and-ia.md`. Built: (1) `lib/vin-ocr-core.js`
+ tests, (2) `netlify/functions/vin-ocr.js` (auth-gated, dependency-free raw fetch to Claude Messages
API [Haiku 4.5], **fails open to manual** on any error/missing key), (3) installer.html scan-overlay
`● Capture VIN` shutter + confirm, (4) Jobs sub-tabs All/city/✓Done (completed pulled out of active
close-out cards), (5) loud "not closed out — no cert yet" flag on past-dated open rows. Tests via
`node --test`, inject `fetchImpl`. **Task 7 (OPTIONAL end-of-day open-jobs push) DEFERRED** — not built.

**Owner setup STILL OWED (feature degrades gracefully until done):**
1. ~~`ANTHROPIC_API_KEY`~~ **DONE — confirmed SET + VALID in Netlify prod 2026-07-20**
   (arrived with the installer-chat work ~07-17; verified via a live chat-agent probe,
   same key/runtime). VIN OCR is ACTIVE at close-out.
2. Recover Shannon (record `reciytsQ4mMdJxBWy`, still `Booked`) — needs Aaron's VIN/calibration/ECU/
   gear/mileage; close her out through the console so her cert emails. Don't fabricate.
3. Rotate `RESEND_API_KEY` (see [[pending-secret-rotation]]).

**Known product follow-up (non-blocking):** global search still ignores the active city sub-tab
(searches all cities while a city tab is highlighted) — reviewer-flagged as a UX decision to make.

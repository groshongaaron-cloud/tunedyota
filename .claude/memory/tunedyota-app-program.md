---
name: tunedyota-app-program
description: "Native Tuned Yota app program (App Store + Play) — Capacitor wrap, phased; STANDING PRINCIPLE: frictionless no-barrier client purchase + world-class design"
metadata: 
  node_type: memory
  type: project
  originSessionId: fac83f77-352e-4aae-8c26-59e564d408f3
---

Native **Tuned Yota** app for Apple App Store + Google Play. Decided 2026-07-09.

**► STANDING DESIGN PRINCIPLE (owner directive, keep top-of-mind on EVERY app cycle):**
Make the **client experience as easy as possible with NO barriers to purchase**, and design the
app to a **world-class** bar. Concretely for the commerce/client phases: guest checkout (no forced
account before buying), **Apple Pay / Google Pay one-tap**, minimal form fields, deep links
straight to a product, nothing between "want it" and "bought it." Build every earlier phase so it
*enables* this (shell supports native pay sheets, deep links, guest flows). **Why:** owner's
explicit priority is conversion + delight. **How to apply:** whenever a client-facing choice
trades friction for anything else, pick the lower-friction path; treat added purchase steps as bugs.

**Approach = Capacitor wrap** of the existing web (installer console + site) → one codebase, real
store apps, native camera/push. Chosen over React Native/Flutter/native (those re-do what's built).
The bundled web loads instantly + **Capgo OTA** pushes web changes without a store resubmit (only
native-shell changes need re-review).

**Phased (each = its own spec→plan→build):**
- **0 Foundation + 1 Installer app** — CODE BUILT & ON MASTER 2026-07-09 (Tasks 1–5 of Plan 2;
  spec `2026-07-09-tunedyota-app-foundation-installer-design.md`, plans `…-app-push-backend.md` +
  `…-app-capacitor-shell.md`). Shipped: **push backend** (`lib/push.js` FCM + `push-register.js`,
  tested), **new-booking push trigger** in book-background (inert until devices register),
  **Capacitor project** in `app/` (`capacitor.config.ts` appId com.tunedyota.app, `package.json`
  w/ @capacitor-mlkit/barcode-scanning + biometric + push + capgo, `scripts/sync-web.mjs` builds
  `app/www` from site console — app/www gitignored), **guarded native branches** in
  `site/installer.html` (native VIN scan / Face ID lock / push register — ALL `isNative()`-gated
  so the live web console is unaffected; verified live), **Codemagic pipeline** + brand icons
  (`app/resources/`, fox on ink). 350 tests green. **REMAINING = Task 6 (owner+CI-gated):** owner
  does the RUNBOOK (`docs/app/RUNBOOK.md`: Apple/Google/Firebase/Codemagic accounts), then first
  Codemagic build → fix any native-build errors against real CI logs → TestFlight/Play internal →
  on-device verify (scan/FaceID/push) → submit. Native plugin call-shapes (barcode/biometric/push
  globals) are best-effort + confirmed on that first build.
- **2 Client accounts + certificate viewing** — net-new client login; certs are email-only today.
- **3 Commerce** — in-app purchase; **Stripe is intentionally OFF today** → turning it on is this
  phase; physical goods/services can use external pay (Stripe) or Apple/Google Pay with NO 30% cut
  (only digital goods trigger Apple IAP) → use native pay sheets for the frictionless flow above.
- **4+** other features.

**Hard constraints / division of labor:** ~$100/yr (Apple $99 + Google $25). iOS can't build on
the owner's Windows → cloud Mac CI (Codemagic). **Claude delivers repo + CI config + runbook;
OWNER does accounts, Firebase/APNs, signing, and Submit-for-review** (can't be automated from here).
Apple rejects bare website-wrappers → v1 ships real native value (camera/push/biometric).

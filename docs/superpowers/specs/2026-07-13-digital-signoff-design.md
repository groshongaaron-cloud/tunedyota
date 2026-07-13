# Digital Customer Sign-Off — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project B4** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]).

---

## 1. Goal

Capture a **customer satisfaction signature** at close-out as proof the tune was completed and accepted. The customer draws a signature on the installer's device; it is stored on the booking as an internal record. It **never blocks completion** and **never changes the customer's certificate** — it is a proof-of-acceptance trail for Tuned Yota's records only.

## 2. Decisions (locked)

- **Purpose:** confirm satisfaction / proof of delivery & acceptance. NOT authorization, NOT a certificate trigger.
- **Capture:** a **drawn** signature (finger/stylus) on a canvas pad. No typed name.
- **Timing & gating:** prompted at **Mark complete**, but **skippable** — a "Customer unavailable — skip" path completes the job and issues the certificate with no signature. Sign-off is never a gate.
- **Visibility:** **record only** — stored on the booking; the owning installer and admins can view it in the console. Not on the certificate, not emailed.

## 3. Scope

**In:** a dependency-free signature-pad overlay at close-out; an optional `signature` field on the close-out payload; tolerant storage to a new Bookings column; a `signed` marker in the feed; an authed on-demand endpoint to view a stored signature.

**Out:** certificate-template changes; any gating of completion; typed name; a separate timestamp column (acceptance time = the existing close-out time); owner email / report of signatures; customer-side (off-device) signing; e-signature legal ceremony (this is acceptance, not authorization); signature-required enforcement.

## 4. Flow

1. Installer completes the booking card as today (VIN, OTT Calibration, the five OTT fields).
2. Installer taps **Mark complete**. The existing client-side validation runs unchanged (17-char VIN, calibration selected, all five OTT fields, VIN-guard ack if flagged).
3. On validation pass, instead of POSTing immediately, a **signature overlay** opens (reusing the full-screen overlay pattern already in `installer.html` for the review QR):
   - Header: "Confirm the tune" + a one-line summary (`<year> <vehicle> · <calibration>`).
   - A `<canvas>` signature pad (~full width × 160px).
   - Buttons: **Clear** · **✓ Done & complete**. A quiet link: **"Customer unavailable — skip →"**.
4. **✓ Done & complete** → capture `canvas.toDataURL('image/png')` → call `closeout(id, { action:'complete', …, signature })`.
   **Skip** → call the same `closeout` with no `signature`.
   **Both paths complete the booking and issue the certificate exactly as today.**
5. After completion, the card shows a **✍ Signed** marker when a signature was stored.

## 5. Components

### 5.1 `site/installer.html` — signature pad + overlays (front-end)
- **Signature pad:** a dependency-free canvas. Pointer/touch handlers (`pointerdown`/`pointermove`/`pointerup`, with `touch-action:none`) draw strokes; a `dirty` flag tracks whether anything was drawn. **Clear** wipes the canvas. Capture via `toDataURL('image/png')`. Keep the canvas modest (e.g. 600×160 backing store) so the PNG stays small (~5–15 KB).
- **Sign overlay:** opened from the Mark-complete handler after validation passes. Wraps the existing `closeout(...)` call so the current validation logic is unchanged. "✓ Done & complete" passes `signature` (only if the pad is dirty); "skip" passes none. Closing the overlay without choosing cancels completion (no POST).
- **View overlay:** tapping the **✍ Signed** marker on a completed card opens an overlay that renders the stored signature as `<img src="<dataURL>">`, fetched on demand from `installer-signature` (below). Shown for the installer's own bookings and, for admins, any booking.
- **State/markers:** the feed marks a completed booking as signed from a `signed` boolean on the roster booking object (§5.3). The ✍ marker is display-only.

### 5.2 `netlify/functions/installer-closeout.js` — store the signature (back-end)
- Accept an optional `signature` (a `data:image/png;base64,…` string) on the `complete` action.
- When present and non-empty, include it in the record update as the **`Customer Signature`** field, written through the existing **tolerant update** helper so an absent column is silently dropped (feature stays inert until the owner adds the column). When absent, omit the field.
- Basic guard: only accept a string beginning `data:image/png;base64,` and below a sane length cap (e.g. 200 KB) — otherwise ignore it (never fail the completion over a bad signature). The signature must never block or error the close-out.

### 5.3 `netlify/functions/installer-roster.js` — expose a `signed` flag
- For each booking in the roster payload, add `signed: !!(fields["Customer Signature"] && String(fields["Customer Signature"]).trim())`. Do **not** include the signature data itself in the roster (keeps the feed payload light).

### 5.4 `netlify/functions/installer-signature.js` — on-demand view (new, auth)
- Installer-token authed via `resolveInstaller`. Query/body param `id` (a booking record id).
- Fetch that record; return `{ signature: <dataURL> }` only if the caller is authorized for it: the booking's `Installer` equals the caller's key, **or** the caller is an admin (`isAdmin`). Otherwise 403.
- 404 (or `{ signature: null }`) when the record has no signature. Pure core `getSignature(id, deps)` + thin handler for testability.

### 5.5 Airtable — one new column (owner)
- **Bookings → `Customer Signature`** (Long text). Holds the PNG data URL. No other columns; acceptance time is the existing close-out time.

## 6. Data flow

Sign: overlay → `toDataURL` → `closeout` POST with `signature` → `installer-closeout` tolerant-writes `Customer Signature` on the booking. View: feed shows ✍ Signed (from roster `signed`) → tap → `installer-signature?id=` (auth + scope) → render `<img>`.

## 7. Error handling / edge cases

- **Column not yet added:** tolerant update drops the field; completion succeeds; `signed` stays false; no ✍ marker. Fully inert until owner setup — no errors.
- **Customer left / skip:** completion + certificate proceed with no signature.
- **Empty pad + Done:** treated as skip (nothing drawn → no `signature` sent).
- **Oversized/malformed signature:** ignored server-side; completion still succeeds.
- **Overlay dismissed:** completion is cancelled (no POST); installer can tap Mark complete again.
- **View by wrong installer:** 403; a regular installer can only view their own signatures, admins any.
- **Idempotency:** re-completing a booking simply overwrites the same field; the certificate remains idempotent as today.

## 8. Testing

- **`installer-closeout`:** complete WITH a valid signature → `Customer Signature` present in the tolerant update; complete WITHOUT (skip) → field omitted; a malformed/oversized signature → omitted, completion still succeeds; unknown-column tolerance (write doesn't throw).
- **`installer-roster`:** a booking with a non-empty `Customer Signature` → `signed:true`; empty/absent → `signed:false`; the raw signature is NOT in the roster payload.
- **`installer-signature`:** 401 without token; owner installer gets their signature; a different installer gets 403; admin gets any; no signature → 404/null.
- **Front-end (manual/live):** pad draws + clears; Done completes with signature; skip completes without; ✍ marker appears; view overlay renders the image; admin can view across installers.
- Full suite green before ship.

## 9. Owner inputs / rollout

1. Add **one** Airtable **Bookings** column: **`Customer Signature`** (Long text).
- Rollout: build behind tests → owner adds the column → `ship` (touches `site/` + functions; `installer.html` isn't indexed so no `build:seo`, but `npm test` must pass) → on the live console, close out a test booking: sign → confirm ✍ Signed appears and the view overlay renders it; then close out another with **skip** and confirm it completes + issues the certificate normally.
- Until the column exists the feature is inert (signature captured then dropped, no marker) — zero risk to close-out.

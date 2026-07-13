# Mileage Photo + Odometer OCR — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project B3** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]). Third of B's close-out features.

---

## 1. Goal

At close-out the installer taps **📷 Photo mileage**, the app **reads the odometer via Claude vision and pre-fills the Mileage field** (installer can override), and the photo is **attached to the booking row** as OTT-report / warranty evidence. Policy 0009 cleared by the owner (2026-07-13): a functional, records-only odometer photo is fine.

## 2. Scope

**In:** a pure odometer-vision reader (`lib/odometer-vision.js`, Claude Haiku 4.5 via raw HTTP); an auth-gated function (`read-odometer.js`) that resizes/strips EXIF, OCRs, attaches the photo to Airtable, and returns the read mileage; the console capture button + Mileage pre-fill/override; one `Mileage Photo` Airtable attachment column.

**Out:** on-device/native OCR (server-side works in the Capacitor app + web from one codebase); storing anything but the photo + the (installer-confirmed) mileage; batch/retroactive OCR; reading anything other than total mileage.

## 3. Approach

Capture → client-side resize → POST to `read-odometer` → the function (a) sharp-normalizes + strips EXIF, (b) OCRs with Claude vision, (c) uploads the photo to the booking's `Mileage Photo` attachment field, (d) returns `{ mileage, attached }`. The console pre-fills the Mileage input; the installer confirms or **overrides**. **Optional and non-blocking** — the typed mileage remains the source of truth; the guard never gates Mark-complete.

## 4. Components

### 4.1 `netlify/functions/lib/odometer-vision.js` (new, pure; injectable fetch)
- **Signature:** `readOdometer({ imageBase64, mediaType, apiKey, fetchImpl }) -> { mileage: number|null, raw: string }`.
- **Call:** raw HTTP `POST https://api.anthropic.com/v1/messages` (the repo has no Anthropic SDK; all functions use `fetch`, matching `lib/resend.js`/`lib/airtable.js`). Headers: `x-api-key: <apiKey>`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- **Body:**
  ```json
  {
    "model": "claude-haiku-4-5",
    "max_tokens": 64,
    "messages": [{ "role": "user", "content": [
      { "type": "image", "source": { "type": "base64", "media_type": "<mediaType>", "data": "<imageBase64>" } },
      { "type": "text", "text": "This is a photo of a vehicle odometer. Reply with ONLY the total mileage as a plain integer (no commas, no units). Read the main odometer, not the trip meter. If you cannot read it, reply exactly NONE." }
    ]}]
  }
  ```
  (No `thinking`/`effort` — a plain vision message; Haiku 4.5 is the owner-chosen model, ideal for reading digits, cheapest/fastest. `effort`/`max` aren't supported on Haiku and aren't needed.)
- **Parse:** read `resp.content[0].text`; strip non-digits; `NONE`/empty/non-numeric → `mileage: null`. Return `{ mileage, raw }`.
- **Errors:** non-2xx, `stop_reason: "refusal"`, timeout, or unparseable → `{ mileage: null, raw }` (never throws to the caller in a way that blocks; the function treats null as "couldn't read"). Pure — no I/O beyond the injected fetch.

### 4.2 `netlify/functions/read-odometer.js` (new, auth-gated)
- **Auth:** `resolveInstaller(headers, env)` → 401 if unresolved. **Ownership:** load the booking; regular installer only their own, admin any (mirrors `installer-closeout`, normalizing the multi-select `Installer`).
- **Input:** JSON `{ recordId, imageBase64, mediaType }` (client sends a resized image; body stays well under Netlify's ~6MB limit).
- **Normalize:** `sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80 })` — caps size and **strips EXIF/GPS** on re-encode. (`sharp` is already a repo dependency.)
- **OCR:** `readOdometer({ imageBase64: <resized b64>, mediaType: "image/jpeg", apiKey: env.ANTHROPIC_API_KEY, fetchImpl })`.
- **Attach:** `POST https://content.airtable.com/v0/{baseId}/{recordId}/Mileage%20Photo/uploadAttachment` with `Authorization: Bearer <airtable token>` and body `{ contentType: "image/jpeg", file: <resized b64>, filename: "odometer-<recordId>.jpg" }` (Airtable's direct upload-attachment API — no external hosting/Blobs; ≤5MB, satisfied by the resize). Attach failure is non-fatal (still return the OCR result).
- **Return:** `{ ok: true, mileage, attached }` (or `{ ok:false, error }` with 401/403/502 as appropriate). Injectable deps (`get`, `fetchImpl`, `readImpl`) for tests.

### 4.3 `site/installer.html` (modify)
- On the open booking card near the Mileage field, add **📷 Photo mileage** → `<input type="file" accept="image/*" capture="environment">` (opens the camera on mobile + in the Capacitor app).
- On file select: **resize client-side** (canvas → longest edge ~1600px → JPEG ~0.8; this also strips EXIF) → base64 → `POST /.netlify/functions/read-odometer` with `{ recordId, imageBase64, mediaType }` + `x-installer-token`.
- On response: if `mileage` present, **set `mi_<id>`** to it and show *"Photo attached ✓ · read 48,210 mi — edit if wrong."*; if `mileage` null, show *"Photo attached ✓ — enter mileage manually."*; on error, *"Couldn't upload the photo — enter mileage manually."* The Mileage input stays fully editable (**override**). Never gates Mark-complete.

### 4.4 Airtable (Bookings, additive)
- One new column: **`Mileage Photo`** (Attachment). Owner-added.

## 5. Data flow

📷 → client resize → `read-odometer` → sharp normalize/EXIF-strip → Claude Haiku 4.5 OCR → Airtable attach → `{ mileage, attached }` → console pre-fills Mileage (override) → close-out stores the installer-confirmed number as today.

## 6. Error handling

- OCR can't read → `mileage: null`, photo still attaches, manual entry.
- Vision key/API error, timeout, refusal → `mileage: null`, non-blocking.
- Attach fails (missing column / Airtable error) → OCR result still returned; installer told the photo didn't attach; mileage entry proceeds.
- 401 unauth / 403 not-your-booking.
- Oversized image → client resizes first; server caps via sharp.

## 7. Testing

- **`odometer-vision.js`:** builds the correct Messages request (model, base64 image block, prompt) with injected fetch; parses `"48210"`, `"48,210"`, `" 48210 mi"` → 48210; `"NONE"`/empty/garbage → null; non-2xx / refusal → null. No real network.
- **`read-odometer.js`:** auth (missing token → 401); ownership (not owner + not admin → 403); happy path (injected sharp/read + OCR + attach → `{ mileage, attached: true }`); OCR null still attaches; attach failure still returns mileage; injected deps — no real network/sharp/Airtable.
- **Console:** capture → resize → pre-fill verified in-browser (with a stubbed endpoint if needed); Mileage stays editable.
- Full suite green before ship. (During build, validate the Airtable upload-attachment call end-to-end against a transient test record per the testing-airtable-backed-emails pattern.)

## 8. Owner inputs / rollout

1. **Add `ANTHROPIC_API_KEY`** to Netlify env (Anthropic Console key; Haiku 4.5 vision is ~sub-cent per photo).
2. **Add `Mileage Photo`** (Attachment) column to Bookings.
- Rollout: build behind tests → owner adds env + column → `ship` (no SEO inputs; `npm test`, confirm branch, push, verify) → in-browser confirm a real odometer photo pre-fills the mileage and attaches to the row; confirm a garbage image degrades to manual entry without blocking.

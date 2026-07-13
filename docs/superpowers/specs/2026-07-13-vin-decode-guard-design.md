# VIN Decode + Guard — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project B2** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]). Second of B's close-out features.

---

## 1. Goal

At close-out, decode the entered VIN and **warn the installer before completion** when it doesn't match the booking — catching a mistyped VIN or a wrong-vehicle/wrong-year VIN before it prints on the customer's Certificate of Calibration and lands in the OTT commission report. The guard is advisory with a manual override: the installer either fixes the VIN or confirms it's correct, then completes.

## 2. Scope

**In:** a pure VIN comparator (`lib/vin-guard.js`); an auth-gated decode proxy (`vin-decode.js`) over the free NHTSA vPIC API; an inline warning + acknowledgement gate on the close-out card; `modelYear` added to the roster payload so the client can compare.

**Out:** aftermarket forced-induction detection (VINs don't encode a Magnuson supercharger — never checked); storing decode results or the override (advisory only — no Airtable change, no owner setup); a separate flex-fuel warning (Policy 0011's Tundra flex reminder already covers that); VIN decode anywhere but the installer console.

## 3. What the VIN can validate

NHTSA `DecodeVinValues/<VIN>?format=json` → `Results[0]` gives `ModelYear`, `Make`, `Model`, `DisplacementL`, `EngineCylinders`, `FuelTypePrimary`, and an **`ErrorCode`** (a comma list; `"0"` = fully valid; code `"1"` = check-digit failure, the classic typo signal). Year/make/model decode reliably even from the WMI + year position. This drives the three checks in §4.1.

## 4. Components

### 4.1 `netlify/functions/lib/vin-guard.js` (new, pure)
- **Purpose:** compare a decoded VIN against the booking; return warnings.
- **Signature:** `compareVin(decoded, booking) -> { ok: boolean, warnings: string[] }` where `decoded = { modelYear, make, model, errorCode }` and `booking = { vehicle, modelYear }`.
- **Checks (each pushes a plain-English warning; all optional-field-safe):**
  1. **Typo / validity:** `errorCode` contains `"1"` (check-digit fail) → `"This VIN may be mistyped — it fails its check digit."`
  2. **Year:** `booking.modelYear` and `decoded.modelYear` both present and unequal → `"VIN decodes as a <decodedYear>; booking says <bookingYear>."`
  3. **Make/model:** `decoded.make` present and the booking's `vehicle` string (lowercased) doesn't contain it → `"VIN decodes as <Make> <Model>; booking vehicle is \"<vehicle>\"."` (Model checked the same way, normalized by lowercasing + stripping spaces; a single combined warning when make or model is off.)
- `ok = warnings.length === 0`. Missing/blank decoded fields → that check is skipped (never a false warning on absent data). Pure — no I/O.

### 4.2 `netlify/functions/vin-decode.js` (new, auth-gated proxy)
- **Auth:** `resolveInstaller(headers, env)`; 401 if unresolved (same model as the other console endpoints). Gating keeps it from being an open proxy.
- **Input:** `{ vin, vehicle, modelYear }` (query or JSON body). Normalize `vin` → uppercase, strip non-`[A-Z0-9]`; must be 17 chars else `{ ok: true, unavailable: true, warnings: [] }` (nothing to check).
- **Decode:** `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/<vin>?format=json` via injectable `fetchImpl`, with an **8s** `AbortController` timeout. (NHTSA latency measured bimodal — sub-second or 20s+ spikes; 8s catches the fast common case and stays under Netlify's ~10s sync-function limit so a slow call returns a clean `unavailable` rather than a 502. The guard is **best-effort** — it fails open when NHTSA is slow.) Map `Results[0]` → `decoded = { modelYear, make, model, fuel, errorCode }`.
- **Compare:** `compareVin(decoded, { vehicle, modelYear })`.
- **Return:** `{ ok, warnings, decoded, unavailable: false }`.
- **Graceful degradation (never block a close-out on our/NHTSA's outage):** any fetch error, non-2xx, timeout, or unparseable body → `{ ok: true, unavailable: true, warnings: [] }`.
- Pure logic (`processVinDecode(body, deps)`) with injected `fetchImpl`/`now`; thin `handler`. No Airtable.

### 4.3 `netlify/functions/installer-roster.js` (modify)
- Add `modelYear: f["Model Year"] || ""` to the mapped booking object so the console can pass it to the guard. (Test: assert the mapped booking includes `modelYear`.)

### 4.4 `site/installer.html` (modify)
- In `rowCard(b)` open-booking branch: after a **valid 17-char VIN** is present in `vin_<id>` (on input debounce ~500ms, and immediately after a scan sets it), call `POST /.netlify/functions/vin-decode` with `{ vin, vehicle: b.vehicle, modelYear: b.modelYear }` and the `x-installer-token` header.
  - **Warnings present** (`!ok`): render an amber warning box (`#vinwarn_<id>`) listing `warnings`, and show a checkbox `#ackvin_<id>` "✔ I've verified this VIN is correct"; set `STATE.vinBlocked[id] = true`.
  - **ok or `unavailable`**: clear the box; `STATE.vinBlocked[id] = false`.
- **Gate in `complete(id)`:** after the existing field validation, if `STATE.vinBlocked[id]` and the ack checkbox isn't checked → `fail("Double-check the VIN, or tick 'I've verified this VIN is correct'.")` and stop. The ack checkbox is the **manual override**.
- The entered VIN is what's stored/completed as today; the guard only gates the tap, never rewrites the value. If the decode call itself fails (network), treat as unavailable — never block.

## 5. Data flow

Enter/scan VIN → (debounced) `vin-decode` → decode + compare server-side → warnings render inline → installer fixes the VIN (re-checks) or ticks the override → **Mark complete** proceeds → close-out stores the VIN exactly as before.

## 6. Error handling

- NHTSA down / timeout / undecodable / non-17-char → `unavailable`, non-blocking (no gate).
- Auth failure → 401.
- No `Model Year` on the booking → year check skipped (make/model + typo checks still run).
- Repeated keystrokes → debounced so NHTSA isn't spammed; a scan triggers one immediate check.

## 7. Testing

- **`vin-guard.js`:** check-digit warning (`errorCode` "1,3,14"); year mismatch; make/model mismatch; clean match → `ok:true`; missing decoded fields → no false warnings; blank booking modelYear → year check skipped.
- **`vin-decode.js`:** happy path (injected fetch returns a decode → warnings computed); NHTSA error/timeout → `unavailable:true, ok:true`; non-17-char vin → `unavailable`; auth (missing token → 401 via handler). Injected `fetchImpl` — no real network in tests.
- **`installer-roster.js`:** mapped booking includes `modelYear`.
- Console warning + acknowledgement gate verified in-browser.
- Full suite green before ship.

## 8. Owner inputs / rollout

- **None.** No Airtable columns, no new env (NHTSA needs no key). `INSTALLER_TOKENS` already gates the proxy.
- Rollout: build behind tests → `ship` (no SEO inputs; run `npm test`, confirm branch `master`, push, verify) → in-browser confirm the warning fires on a deliberate mismatch and the override unlocks completion.

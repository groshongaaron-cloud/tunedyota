# Installer Dashboard: VIN Capture + Information Architecture — Design

- **Date:** 2026-07-15
- **Status:** Approved design (pending spec review)
- **Author:** Claude (with owner)
- **Scope:** `site/installer.html`, new `netlify/functions/vin-ocr.js`, supporting libs + tests
- **End goal context:** This console is wrapped by the Tuned Yota native app (Capacitor). Every
  choice here should translate to, and be optimized for, that app — mobile-first, offline-tolerant,
  native-camera aware.

---

## 1. Context & problem

Real-world field use (2026-07-15) surfaced three problems:

### 1a. A customer never received her certificate (root cause found)
Aaron added a walk-in for **Shannon Conroy — 2020 Toyota 4Runner** (Twin Cities). She got no
certificate. Investigation of her live Airtable record:

| Field | Value |
|---|---|
| Status | **`Booked`** — never closed out |
| Email | `shannonconroy2003@yahoo.com` (present ✅) |
| OTT Calibration | *(blank)* |
| VIN | *(blank)* |
| Source | `installer:walk-in` |

The walk-in was created correctly, but **the certificate is only triggered on close-out** (and the
daily `certificate-dispatch` backstop only sweeps `Status="Completed"` rows). Her booking is still
`Booked`, so nothing ever fired. Her email is on file — once the booking is closed out with a
calibration, the cert emails to her correctly.

**Why it stalled:** `complete()` in `installer.html` (lines ~947–954) hard-requires a full 17-char
VIN plus calibration/tuning-platform/cal-type/ECU/gear/mileage before "Mark complete" will submit.
If the VIN couldn't be captured on-site (see 1b), the installer was **hard-blocked from finishing** —
so the customer left with no certificate. The missing-cert and the camera problem are the same
failure.

### 1b. VIN camera "won't trigger"
`site/installer.html` already ships a "📷 Scan VIN" button (line ~922) that opens a live camera and
**auto-detects a barcode only** (Code‑39 / Data‑Matrix via `BarcodeDetector`, ZXing fallback). There
is **no manual shutter** and **no way to read a printed VIN** (windshield/dash plate). Pointing at a
non-barcode VIN yields nothing — matching the owner's report: "no push button to take the photo… the
system once seeing the VIN does not auto capture the image." The button also only renders when
`getUserMedia` is exposed.

### 1c. Mobile "bunching"
The Jobs feed is one long vertical column of collapsible event cards (`Needs close-out / Today /
Upcoming / Recent`), and each card interleaves **open close-out forms** with **completed items**. On a
phone, working a single walk-in means the close-out inputs and already-done rows crowd each other.

---

## 2. Goals / non-goals

**Goals**
- Make VIN capture bulletproof: barcode → photo+OCR → **always-available manual entry**. The camera
  must never be the thing that blocks a close-out.
- Reorganize Jobs so active close-out work and completed work are separated, and work can be focused
  by location — mobile-first, native-app-ready.
- Ensure a walk-in that isn't closed out becomes **loud**, not silent, so no customer is dropped again.
- Recover Shannon's certificate immediately.

**Non-goals**
- No relaxing of the VIN requirement — VIN stays mandatory for close-out (owner decision). Capture
  *method* is flexible; the requirement is not.
- No storing of the VIN photo (consistent with the reverted odometer-photo decision). The image is
  transient, used for OCR only.
- No Airtable schema changes. No changes to the certificate template or dispatch logic.

---

## 3. Owner decisions (locked)

1. **VIN stays mandatory** for close-out; capture is made bulletproof rather than gated.
2. **Manual VIN entry is always available** — if the camera/OCR fails in the field, the installer types
   the 17 chars and closes out normally. The camera is a convenience, never a gate.
3. **VIN OCR = manual shutter + Claude vision** (cloud). Photo transient, not persisted.
4. **Dashboard IA = location tabs + a Completed ("Done") tab** under Jobs.

---

## 4. Design

### 4a. VIN capture — barcode + shutter + Claude-vision OCR + always-manual

**Client (`site/installer.html`):**
- The VIN text `<input>` remains exactly as-is and is **always editable** — the primary, always-working
  entry method. Close-out validates a normalized 17-char VIN regardless of how it was entered.
- The scan overlay (`startScan`) keeps the existing **fast barcode auto-detect** (instant, free, no
  photo) and gains a new **`● Capture`** shutter button.
- On shutter: draw the current `<video>` frame to a `<canvas>` → export JPEG (downscaled, ~1024px long
  edge, quality ~0.7 to bound payload) → POST to `/.netlify/functions/vin-ocr` with the installer
  token.
- Response renders an **editable confirm step**: `Read: JTEBU5JR… — use this?` with `Use` / `Retake` /
  `Type it instead`. On `Use`, it fills the VIN field (does **not** auto-submit), and the existing
  NHTSA `vin-guard` advisory check runs as today.
- **Every failure path lands on manual entry:** camera unavailable, OCR low-confidence, OCR
  timeout/error, or no Anthropic key configured → overlay shows "Type the VIN below" and the text input
  is focused. Close-out still succeeds by typing.
- Native (Capacitor) keeps its native `BarcodeScanner` plugin path and gains the same photo+OCR
  fallback via the web canvas path.

**New function `netlify/functions/vin-ocr.js`:**
- Auth: `x-installer-token` (same `installer-auth` as the other console endpoints). Reject otherwise.
- Input: `{ imageBase64, mediaType }` (JPEG data, no `data:` prefix).
- Calls **Claude vision**. Default model **Haiku 4.5** (`claude-haiku-4-5`) — cheap, fast, more than
  enough to read a VIN. **Before coding, confirm the exact model id, request shape, and image-block
  format against the `claude-api` skill** (do not hand-write the request from memory).
- Prompt: extract the 17-character VIN; respond with the VIN only (or an explicit "none"). Server
  normalizes (uppercase, strip non-alphanumeric, reject I/O/Q, must match `^[A-HJ-NPR-Z0-9]{17}$`).
- Output: `{ ok: true, vin }` on a clean 17-char read; `{ ok: false, reason }` otherwise.
- **Fail-open to manual:** on timeout (bounded ~8s like `vin-decode`), API error, missing
  `ANTHROPIC_API_KEY`, or unreadable image → `{ ok:false, reason:"unavailable" }`. The function never
  throws to the client in a way that blocks the console; the UI routes every non-success to manual
  entry.
- **Privacy/cost:** the image is used only for the OCR request and is **not** stored or logged.

**New env var:** `ANTHROPIC_API_KEY` (Netlify). Captured from the owner via clipboard at implementation
time — never echoed in chat. If unset, the OCR button degrades gracefully to manual entry (feature is
additive and safe to ship before the key lands).

### 4b. Dashboard IA — location tabs + Done tab

Within the existing **Jobs** top-tab, add a second, horizontally-scrollable sub-tab strip:

```
[ Jobs ] [ Leads ]
  └ [ All ] [ Twin Cities ² ] [ Cedar Rapids ¹ ] … [ ✓ Done ]
```

- **`All`** (default): the current grouped feed (`Needs close-out / Today / Upcoming / Recent`),
  unchanged — nothing is lost for installers who prefer one list.
- **Location tabs**: one per market the installer actually has bookings/events in (admin sees all; the
  existing admin installer-filter dropdown still composes). Each shows only that city's **active** work.
  A count **badge** and a **red dot** when something in that city needs close-out. `+ Add walk-in` on a
  location tab **pre-fills that city**.
- **`✓ Done` tab**: all `Completed` bookings pulled out of the event cards, grouped by date + location,
  searchable. This is what removes the mobile bunching — completed rows no longer sit inside active
  close-out cards. Each location tab shows a small `3 done ›` pill that deep-links to `Done` filtered to
  that city.
- **Search** still overrides tabs (flat, cross-history results) exactly as today.
- **State:** add `STATE.jobTab` (`'all' | '<city>' | 'done'`). `renderFeed` branches on it; the
  event/booking data source (`buildEvents`) is unchanged. **No API changes** — the roster already
  returns everything; this is a client-side reorganization.
- **Mobile:** sub-tab strip is `overflow-x:auto` with momentum scroll; tap targets ≥44px; active tab
  underline; badges inline. Consistent with `site/site.css` tokens.

### 4c. Certificate safety net (no VIN bypass)

Because VIN stays mandatory, the guard against another silent `Booked` walk-in is to make it **loud**:
- Any booking still open past its event day is flagged **"⚠ Not closed out — customer has no
  certificate yet"** on the card, and rolls into the existing "Needs close-out" surfacing + the
  location-tab red dot.
- **Optional (owner may defer):** an end-of-day **web-push** to the installer (C3 push infra already
  live) listing still-open jobs. Marked as a separable task in the plan so it can be trimmed.

---

## 5. Data model / API changes

- **New:** `netlify/functions/vin-ocr.js` (auth-gated Claude-vision proxy).
- **New env:** `ANTHROPIC_API_KEY` (Netlify) — owner-provided via clipboard.
- **Unchanged:** Airtable schema, certificate template (`lib/certificate.js`), `certificate-dispatch`,
  `installer-closeout`, `installer-walkin`, `vin-decode`, `vin-guard`.
- **Client-only:** `site/installer.html` (scan overlay shutter + confirm step; Jobs sub-tabs + Done
  view; not-closed-out flag).

---

## 6. Testing

- **`vin-ocr` unit tests** (stubbed Anthropic `fetchImpl`): clean 17-char read → `{ok:true,vin}`;
  low-confidence / "none" → `{ok:false}`; timeout & API-error → fail-open `{ok:false,reason}`; missing
  key → graceful `{ok:false}`; bad/oversized image → rejected. Auth-required test.
- **Normalization**: reuse/extend existing VIN normalize coverage.
- **IA**: verify with the existing Playwright harness — tab switch (`All`/location/`Done`), completed
  items appear only under `Done`, walk-in city pre-fill, search override, admin filter composition.
- **Full suite** stays green; ship via the `ship` skill (regenerate → tests → push master → live
  verify).

## 7. Rollout & recovery

1. **First:** recover Shannon — close out her booking properly (VIN + calibration) so her certificate
   emails tonight. Verify `Certificate Sent`.
2. Ship the client IA + scan shutter + `vin-ocr` (safe to ship before the Anthropic key; OCR degrades
   to manual).
3. Owner provides `ANTHROPIC_API_KEY` via clipboard → `netlify env:set` → redeploy → live OCR test.
4. **Rotate `RESEND_API_KEY`** — its value was accidentally printed to a session transcript during this
   design; rotate in Resend + `netlify env:set` and verify a test cert send.

## 8. Owner setup (captured via clipboard, never chat)
- `ANTHROPIC_API_KEY` (Anthropic Console) — enables live VIN OCR.
- Rotate `RESEND_API_KEY` (hygiene follow-up from this session).

## 9. Open questions
- End-of-day push reminder (4c) — in scope now, or fast-follow? (Default: build the loud visual flag
  now; push reminder as a separable, deferrable task.)

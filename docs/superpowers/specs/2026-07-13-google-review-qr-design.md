# Google-Review QR — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project C2** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]).

---

## 1. Goal

Give the installer a one-tap **"Ask for a review"** in the console that shows a full-screen **QR the customer scans to open the Tuned Yota Google review form** at the end of a service. A dashboard feature — explicitly NOT on the certificate (owner directive).

## 2. Scope

**In:** a public `review-qr` function that renders the review URL as an SVG QR (reusing `lib/qr.js`); a top-level review link + full-screen QR overlay in the console; the roster exposing whether the feature is configured.

**Out:** pre-selecting a star rating (Google policy forbids it — the QR opens the review form and the customer picks); putting the QR on the certificate; review tracking/analytics; anything gated behind a specific booking (top-level, always-available button per owner's choice).

## 3. Components

### 3.1 `netlify/functions/review-qr.js` (new, public)
- Returns an inline **SVG QR** of `env.GOOGLE_REVIEW_URL` via `qrSvg(...)` from `lib/qr.js` (the vendored Nayuki encoder already in the repo).
- **Public** (no installer token) — a review link is public information, so the console can load it with a plain `<img src="/.netlify/functions/review-qr">`.
- `200` with `Content-Type: image/svg+xml` when the env is set; **`404`** (plain text) when `GOOGLE_REVIEW_URL` is unset/empty — the console handles this by simply not showing the button.
- Pure core (`buildReviewQr(env)` → `{ ok, svg }`) with the env injected for tests; thin `handler`.

### 3.2 `netlify/functions/installer-roster.js` (modify)
- Add a top-level **`reviewUrl`** to the roster response object: `reviewUrl: (env.GOOGLE_REVIEW_URL || "").trim()`. This tells the console whether to show the button and provides the tappable fallback link. (One line in `buildRoster`'s returned object; it's public config, not per-booking.)

### 3.3 `site/installer.html` (modify)
- When `STATE.reviewUrl` is non-empty, render a **"★ Ask for a review"** link in the header (beside the existing *Calibration reference* / *Log out* links).
- Tapping it opens a **full-screen overlay** (fixed, white, high z-index): a large centered **QR** (`<img src="/.netlify/functions/review-qr" alt="Scan to review Tuned Yota on Google">`, ~70vw, capped), a heading *"Scan to review us on Google ★★★★★"*, a tappable *"or tap here to review →"* link (`STATE.reviewUrl`, `target="_blank"`), and a **Close** button (tap anywhere / Close dismisses it).
- If `STATE.reviewUrl` is empty, the button is not rendered (feature invisible until configured).
- Store `reviewUrl` on `STATE` in `load()` (`STATE.reviewUrl = data.reviewUrl || ""`).

## 4. Data flow

Roster load → `reviewUrl` present ⇒ show the "Ask for a review" link → installer taps → overlay shows the server-rendered QR (encodes the env URL) + tappable link → customer scans → Google review form. Changing `GOOGLE_REVIEW_URL` updates the QR with no redeploy.

## 5. Error handling

- `GOOGLE_REVIEW_URL` unset → `review-qr` returns 404 AND `reviewUrl` is empty → the button never appears (no broken UI).
- QR encodes whatever URL is configured — no validation beyond non-empty (a bad URL is an owner-config issue, visible when they test-scan).
- The overlay is inert chrome — it never blocks close-out or any other console action.

## 6. Testing

- **`review-qr.js`:** `buildReviewQr({ GOOGLE_REVIEW_URL: "https://g.page/r/abc/review" })` → `{ ok: true, svg }` where `svg` starts with `<svg` and contains QR `<rect>` modules; `buildReviewQr({})` → `{ ok: false }`; handler maps ok→200 image/svg+xml, not-ok→404.
- **`installer-roster.js`:** the roster response includes `reviewUrl` from the env (set → the value; unset → `""`).
- **Console:** with a stubbed `STATE.reviewUrl`, the button renders and the overlay opens/closes with the QR `<img>` — verified in-browser.
- Full suite green before ship.

## 7. Owner inputs / rollout

- **One item:** set `GOOGLE_REVIEW_URL` in Netlify env — the Google Business Profile **"Ask for reviews" share link** (e.g. `https://g.page/r/…/review` or `https://search.google.com/local/writereview?placeid=…`).
- Rollout: build behind tests → `ship` (no SEO inputs — a function + `noindex` console page; `npm test`, confirm branch, push, verify) → owner sets the env → in the live console, tap "Ask for a review" and scan the QR to confirm it opens the Tuned Yota review form.

# Certificate v2 — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project A** of the installer-dashboard enhancement program (see [installer dashboard playbook](../../operations/installer-dashboard-playbook.md)). Sub-projects B (smarter close-out), C (dashboard ops), D (identity & users) are separate specs.

---

## 1. Goal

Turn the Certificate of Calibration from an installer-forwarded proof-of-work into a **customer-delivered, dual-purpose document**: page 1 certifies the calibration (unchanged), page 2 is a branded **AMSOIL Maintenance Reference** for the exact vehicle — the fluids, capacities, and severe-service intervals — with a QR that routes the customer into their pre-filtered AMSOIL Garage (a `?zo=`-tagged referral, the recurring-revenue path). Delivery goes **straight to the customer**, and internal copies live in a **searchable repository** instead of cluttering inboxes.

## 2. Scope

**In:** certificate builder changes; per-vehicle AMSOIL fluids lookup; QR encoder; direct-to-customer email delivery + customer-email capture at close-out and walk-in; searchable certificate repository in the dashboard; garage-page landing enhancements (pre-fill, device-local multi-vehicle garage, full-catalog search); canonical design-master update; AMSOIL brand-asset integration.

**Out (later sub-projects):** VIN decode/guard, mileage photo, digital sign-off (B); commission tracker, push, offline PWA (C); account-backed persistent garage + client "users" (D); SMS delivery.

## 3. Components

Each is a small, independently testable unit. Builders stay pure (no I/O); Netlify functions own I/O.

### 3.1 `lib/amsoil-fluids.js` (new, pure)
- **Purpose:** given a vehicle string + model year, return the matching AMSOIL Garage entry (systems + bundle) or `null`.
- **Input:** `(vehicle, modelYear)` — same fields the certificate already receives.
- **Output:** `{ make, model, engine, systems: [{ system, product, stockNo, capacity, unit, factoryInterval, tunedInterval }], bundleUrl }` or `null`.
- **Depends on:** `site/amsoil-garage.json` (read at module load), `site/amsoil-referral.js` (`amsoilUrl` for the bundle deep-link).
- **Matching:** parse make/model from the vehicle string; select the platform row whose year range (`y`, e.g. `2016-2023`, `2024+`, `All years`) contains `modelYear` and whose engine (`e`) best matches. Falls back to the model's first/most-generic row when the year/engine can't be resolved. Reuse the platform-year parsing already in `lib/certificate.js` `formatVehicle` where practical.
- **Resolves** each system's `sku` → product `name` + official stock number + `productPath` from `amsoil-garage.json.products`.

### 3.2 `lib/qr.js` (new, pure, dependency-free)
- **Purpose:** encode a URL string → inline SVG QR markup (string).
- **Why SVG:** the certificate is delivered as an HTML **attachment** opened in a browser and printed to PDF — SVG is crisp at any print size and needs no external request (privacy + no broken-image risk). (Not embedded in an email *body*, where SVG support is poor.)
- **Scope:** byte mode, ECC level **M**, automatic version selection up to ~version 10 (enough for the garage URL). Numeric/alphanumeric modes not required.
- **Testing:** validate output modules against known QR test vectors; assert a scannable result for representative garage URLs. **Risk flag:** this is the most involved new unit (Reed-Solomon + masking). If a from-scratch encoder proves heavy, vendor a small MIT-licensed encoder into `lib/vendor/` — decision recorded in the implementation plan, not here.

### 3.3 `lib/certificate.js` (extend existing pure builder)
- Keep `buildCertificate(...)` signature-compatible; **page 1 is unchanged**.
- Add an optional **page-2 reference zone** rendered when fluids data resolves:
  - AMSOIL red measure bar; eyebrow "AMSOIL MAINTENANCE REFERENCE".
  - Hero: *"A tuned truck deserves the best fluids in the world — AMSOIL."* + the owner-approved paragraph.
  - **Official AMSOIL logo**, unaltered, on a white chip with clear space (brand-guide compliant — see §7).
  - **Fluids table** — columns: **System · AMSOIL Product (description) · Product No. (official AMSOIL stock number) · Capacity · Interval** (tuned interval prominent, factory shown small beneath).
  - **Order block:** QR (from `lib/qr.js`) → pre-filtered garage URL; "Order your exact fluids" + the Preferred-Customer "save up to 25%" pill; the visible URL.
  - Footnote: "confirm capacities against your owner's manual before service · Tuned Yota is an Authorized AMSOIL Dealer."
- **Graceful degradation:** if `amsoil-fluids` returns `null` (unsupported vehicle), page 2 renders a compact version — hero + logo + QR to the general garage — with **no fabricated fluid rows**.
- New builder input: `fluids` (the resolved object) — the function stays pure; the caller does the lookup and passes it in.

### 3.4 `netlify/functions/installer-closeout.js` (modify)
- **Customer email capture:** accept `customerEmail` in the close-out body; persist to the booking's `Email` field (pre-filled in the UI from the booking when present).
- **Direct delivery:** on completion, resolve fluids (`amsoil-fluids`) + build the cert, then send **to the customer** (`Email`) as the primary recipient. `replyTo` = `info@`.
- **No cc clutter:** drop the installer/`info@` cc copies. Records are retrieved from the repository (§3.6) instead.
- **Fallback when no customer email:** send to the **installer** (so they can collect/forward) and set a booking flag `Cert Delivery = installer-fallback`; the dashboard surfaces it (see §3.6). Never silently skip.
- **Store issue metadata** for faithful re-render: `Certificate Issued` (date) + `Certificate Recipient` (the address used). `Certificate Sent` stays the idempotency guard.
- Idempotency + `updateTolerant` behavior preserved (missing columns dropped, completion still persists).

### 3.5 `netlify/functions/certificate-dispatch.js` (modify — backstop)
- Align the daily backstop with §3.4: deliver to the **customer** when an `Email` exists, else installer-fallback; write the same issue metadata; keep "hold if calibration blank" + Slack alert.

### 3.6 Certificate repository (new)
- **New function `installer-certificate.js`:** `GET ?recordId=…`, gated by `installer-auth` (same token/admin model as roster/closeout). Ownership re-checked server-side (admin = any). Re-renders the cert from the stored record via `buildCertificate` + `amsoil-fluids`, using the **stored** issue date + serial so the output is byte-stable. Returns the HTML (with a `Content-Disposition` option for download).
- **Dashboard (`site/installer.html`):** on each **Completed** booking card, add **"View / Download certificate."** The existing all-history search already covers name/VIN/vehicle/date → this makes the completed-booking history the searchable repository. Show the `installer-fallback` flag where set, with a "resend to customer" affordance (re-invokes close-out delivery with a corrected email).

### 3.7 Walk-in email capture (modify)
- `installer-walkin.js`: accept + persist `email` (optional but encouraged).
- `site/installer.html` walk-in forms (both the any-day top-level form and the per-event adder): add an **email** field. Name + phone stay required; email optional but drives direct delivery.

### 3.8 Garage landing page (`site/amsoil-garage.html` + render) (enhance)
The QR's destination must deliver on "pre-filtered + searchable + add vehicles":
- **Deep-link pre-fill:** read `?make=&model=&year=` and pre-select the picker to that vehicle.
- **Device-local "My Garage":** persist added vehicles to `localStorage` (no account yet) so a customer can hold several trucks; "add another vehicle" from the picker. *(Account-backed garage = sub-project D.)*
- **Full-catalog search:** a "Search all AMSOIL products" box that routes to amsoil.com search via `amsoilUrl(...)` with `?zo=` attached (we don't mirror AMSOIL's full catalog; the referral covers everything they sell).

### 3.9 Canonical design master + assets
- Update `docs/brand/tuned-yota-master-certificate.html` to the v2 design (it stays the canonical design to evolve; the DRAFT file is deleted once merged).
- **Logo asset:** `site/images/amsoil/amsoil-logo.png` (already produced from the approved dealer-kit file, unaltered, padded on white). For email/attachment portability the builder references it as an **absolute** `https://tunedyota.com/images/amsoil/amsoil-logo.png` URL (hosted) — or base64-embeds it — so the opened attachment renders without the local server. Decision recorded in the plan.

## 4. Data model changes

**Airtable — Bookings table (additive; `updateTolerant`/`createTolerant` keep writes safe if a column is missing):**
| Field | Type | Purpose |
|-------|------|---------|
| `Email` | email/text | Customer email (exists for bookings; now captured for walk-ins too) |
| `Certificate Issued` | date | Issue date stored for stable re-render |
| `Certificate Recipient` | text | Address the cert was delivered to |
| `Cert Delivery` | single-select | `customer` \| `installer-fallback` |

**`site/amsoil-garage.json` — products:** add an official **`stockNo`** field (the real AMSOIL product number, e.g. `ASMQT`, `EA15K09`, `SVLQT`, `ATLQT`) to each product. The existing `sku` stays our internal key. **Data task:** confirm each `stockNo` against amsoil.com (owner input; several are inferable from `productPath`, but must be verified before print).

## 5. Delivery & recipients (summary)

- **Primary:** customer email → the certificate HTML attachment.
- **Repository:** completed bookings, re-rendered on demand in the dashboard (scoped: installer = own, admin = all). No inbox cc's.
- **Fallback:** no customer email → installer delivery + dashboard flag + resend affordance.
- **Backstop:** daily `certificate-dispatch.js`, same rules; holds on blank calibration.

## 6. QR target

`https://tunedyota.com/amsoil-garage?make=<Make>&model=<Model>&year=<Year>` — lands pre-filtered, shows the same fluids + the PC-savings pitch, then routes to amsoil.com with `?zo=30713116` on order.

## 7. Brand compliance (AMSOIL Style Guide)

- Use the **approved logo asset unaltered** — no recreation, recolor, rotation, effects, or font substitution. On solid **white** (chip), not on the paper texture; maintain clear space.
- Official colors only where AMSOIL-branded: Red PMS 485 `#ed1c24`, Blue PMS 286 `#005baa`, Cool Gray 6 `#bcbec0`, black, white.
- The "The First in Synthetics®" tagline is trademark-governed (font/placement/color) — **omitted** to avoid misuse; "Authorized AMSOIL Dealer" (our own type) is the permitted descriptor.
- `®` accompanies trademarked AMSOIL names on first appearance in customer copy.

## 8. Error handling & edge cases

- Unsupported vehicle → compact page 2, no fake data (§3.3).
- Missing/failed fluids or QR render → the cert **still issues** (page 2 degrades); page 1 never blocked.
- Missing customer email → installer-fallback (§3.4), never silent.
- Re-render must equal the issued document → stored issue date + deterministic serial (§3.4/3.6).
- Airtable column not yet added → tolerant writes drop only the missing optional field.

## 9. Testing

- `lib/amsoil-fluids.js`: matching across year ranges (`2016-2023`, `2024+`, `All years`), engine disambiguation, unsupported → `null`, stockNo/description resolution.
- `lib/qr.js`: known-vector encode; round-trip/scannability check for garage URLs.
- `lib/certificate.js`: page 1 byte-unchanged for existing inputs (regression); page-2 present/absent branches; no fabricated rows on `null` fluids; brand markup present.
- `installer-closeout.js`: customer-primary delivery; installer-fallback path; email persisted; issue metadata written; idempotency; tolerant fields.
- `installer-walkin.js`: email captured + persisted.
- `installer-certificate.js`: auth/ownership (own vs admin vs 401/403); stable re-render.
- Full suite green before ship (project convention).

## 10. Owner inputs / open items

- **AMSOIL `stockNo`** verification for each catalogued product (data task, §4).
- **Logo hosting decision** — absolute URL vs base64 in the attachment (plan-time, §3.9).
- Fluid specs are treated as verified per owner direction (2026-07-13); adjustable later.

## 11. Rollout

Build behind tests → update canonical master → `ship` skill (regenerate/SEO if garage HTML changes, test, push to `master`, verify live). Shared-folder rule: confirm branch before commit. Delete the DRAFT file on merge.

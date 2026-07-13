# Certificate v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branded, per-vehicle AMSOIL Maintenance Reference page + QR to the Certificate of Calibration, deliver certificates directly to the customer, and make completed certificates retrievable from a searchable dashboard repository.

**Architecture:** Pure builders (`amsoil-fluids`, `qr`, `certificate`) do all rendering with no I/O; Netlify functions (`installer-closeout`, `installer-walkin`, `certificate-dispatch`, new `installer-certificate`) own I/O and delivery. The certificate is re-renderable deterministically from the stored booking record, so the "repository" is the completed-bookings history surfaced in `installer.html`.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`, Netlify Functions, Airtable REST (via `lib/airtable.js`), Resend (via `lib/resend.js`). No new npm dependencies — the QR encoder is a vendored MIT single-file library.

**Spec:** `docs/superpowers/specs/2026-07-13-certificate-v2-design.md`

**Conventions:**
- Run one test file: `node --test tests/<file>.test.js`. Run all: `npm test`.
- Tests use `const { test } = require("node:test"); const assert = require("node:assert/strict");`.
- Builders are pure (no `fs`/`fetch`); functions inject deps for testability (see existing `processCloseout`/`dispatchCertificates` patterns).
- Commit after each task. Confirm `git branch --show-current` is `master` before committing (shared-folder rule); if not, land via a temp master worktree.

---

## File Structure

**Create:**
- `netlify/functions/lib/amsoil-fluids.js` — vehicle+year → fluids entry (systems + resolved products/stock numbers + garage URL) or `null`.
- `netlify/functions/lib/vendor/qrcodegen.js` — vendored MIT QR encoder (Nayuki).
- `netlify/functions/lib/qr.js` — thin wrapper: text → inline SVG QR string.
- `netlify/functions/installer-certificate.js` — auth-gated repository endpoint; re-renders a cert from a record.
- Tests: `tests/amsoil-fluids.test.js`, `tests/qr.test.js`, `tests/installer-certificate.test.js`.

**Modify:**
- `site/amsoil-garage.json` — add `stockNo` to each product.
- `netlify/functions/lib/certificate.js` — optional page-2 AMSOIL reference zone.
- `netlify/functions/installer-walkin.js` — capture `email`.
- `netlify/functions/installer-closeout.js` — capture `customerEmail`; deliver to customer; store issue metadata; render page 2.
- `netlify/functions/certificate-dispatch.js` — align backstop delivery with close-out.
- `site/installer.html` — email fields (walk-in + close-out), View/Download certificate, fallback flag.
- `site/amsoil-garage.html` (+ its render script) — deep-link pre-fill, device-local "My Garage", catalog search.
- `docs/brand/tuned-yota-master-certificate.html` — v2 canonical master (then delete the `-DRAFT` file).
- Tests: `tests/certificate.test.js`, `tests/installer-closeout.test.js`, `tests/installer-walkin.test.js`, `tests/certificate-dispatch.test.js`.

**Already produced (from brainstorming):** `site/images/amsoil/amsoil-logo.png` (approved logo, unaltered, padded on white).

---

## Task 1: Add official AMSOIL stock numbers to the catalog

**Files:**
- Modify: `site/amsoil-garage.json` (the `products` map)
- Test: `tests/amsoil-garage-data.test.js` (existing — add a case)

- [ ] **Step 1: Write the failing test**

Add to `tests/amsoil-garage-data.test.js`:

```js
test("every product carries an official AMSOIL stockNo", () => {
  const data = require("../site/amsoil-garage.json");
  for (const [sku, p] of Object.entries(data.products)) {
    assert.ok(typeof p.stockNo === "string" && p.stockNo.trim().length > 0,
      `product ${sku} is missing stockNo`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-garage-data.test.js`
Expected: FAIL — products lack `stockNo`.

- [ ] **Step 3: Add `stockNo` to each product**

In `site/amsoil-garage.json`, add a `"stockNo"` field to every entry in `products`. Use the official AMSOIL quart/each stock number. Seed values (VERIFY against amsoil.com before shipping — owner task):

| sku | stockNo |
|-----|---------|
| SS-0W20-QT | ASMQT |
| SS-5W30-QT | ASLQT |
| SS-5W20-QT | ALMQT |
| EA15K09 / EA15K51 / EA15K02 / EA15K49 / EA15K04 | (same as the filter code, e.g. EA15K09) |
| SVL-QT | SVLQT |
| AGLPK-QT | AGLQT |
| SVG-75W90-QT | SVGQT |
| SVG-75W140-QT | SVOQT |
| ATL-QT | ATLQT |

Example edit for one product:

```json
    "SS-0W20-QT": {
      "sku": "SS-0W20-QT",
      "stockNo": "ASMQT",
      "name": "Signature Series 0W-20 100% Synthetic Motor Oil",
      "productPath": "/p/amsoil-signature-series-0w-20-100-synthetic-motor-oil-asm/",
      "image": "/images/amsoil/ss-0w20.png",
      "retailPrice": 17.99,
      "salePrice": null,
      "priceVerifiedAt": "2026-07-10"
    },
```

Apply the same `"stockNo"` addition to every product in the map.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-garage-data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/amsoil-garage.json tests/amsoil-garage-data.test.js
git commit -m "feat(amsoil): add official stock numbers to garage catalog products"
```

---

## Task 2: `amsoil-fluids.js` — vehicle → fluids lookup

**Files:**
- Create: `netlify/functions/lib/amsoil-fluids.js`
- Test: `tests/amsoil-fluids.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/amsoil-fluids.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

test("matches a Tacoma by engine + year and resolves products", () => {
  const r = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  assert.ok(r, "should resolve");
  assert.equal(r.make, "Toyota");
  assert.equal(r.model, "Tacoma");
  const oil = r.systems.find((s) => s.system === "Engine Oil");
  assert.match(oil.product, /Signature Series 0W-20/);
  assert.equal(oil.stockNo, "ASMQT");
  assert.equal(oil.capacity, 4.8);
  assert.equal(oil.tunedInterval, "7,500 mi");
  assert.match(r.garageUrl, /amsoil-garage\?make=Toyota&model=Tacoma&year=2024/);
});

test("picks the year-appropriate platform row", () => {
  const r = resolveFluids("2019 Toyota Tacoma 3.5L V6", "2019");
  assert.ok(r);
  assert.equal(r.engine, "3.5L V6");
});

test("returns null for an unsupported vehicle", () => {
  assert.equal(resolveFluids("2020 Ford F-150 3.5L V6", "2020"), null);
});

test("prefers the longer model name (Land Cruiser over a stray match)", () => {
  const r = resolveFluids("2021 Toyota Land Cruiser 5.7L V8", "2021");
  assert.ok(r);
  assert.equal(r.model, "Land Cruiser");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-fluids.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/amsoil-fluids.js`:

```js
// netlify/functions/lib/amsoil-fluids.js
// Pure lookup: (vehicle string, model year) -> the AMSOIL Garage fluids entry for
// that platform, with each system's product name + official stock number resolved
// from the catalog, plus the pre-filtered garage URL. Returns null when the vehicle
// isn't in the catalog. No I/O beyond require()-ing the static JSON. Feeds Certificate v2.
const CATALOG = require("../../../site/amsoil-garage.json");

function yearInRange(y, year) {
  if (!y || isNaN(year)) return false;
  if (/all\s*years/i.test(y)) return true;
  let m;
  if ((m = /^(\d{4})\s*\+$/.exec(y))) return year >= +m[1];
  if ((m = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(y))) return year >= +m[1] && year <= +m[2];
  if ((m = /^(\d{4})$/.exec(y))) return year === +m[1];
  return false;
}

// Prefer a row whose engine appears in the vehicle string; within that, one whose
// year range contains the model year; else the first candidate.
function pickRow(rows, vlow, year) {
  if (!rows || !rows.length) return null;
  const byEngine = rows.filter((r) => r.e && vlow.indexOf(String(r.e).toLowerCase()) >= 0);
  const pool = byEngine.length ? byEngine : rows;
  const byYear = pool.filter((r) => yearInRange(r.y, year));
  return (byYear[0] || pool[0]);
}

function garageUrl(make, model, year) {
  const q = "make=" + encodeURIComponent(make) + "&model=" + encodeURIComponent(model) +
    (year ? "&year=" + encodeURIComponent(year) : "");
  return "https://tunedyota.com/amsoil-garage?" + q;
}

function resolveFluids(vehicle, modelYear) {
  const vlow = String(vehicle || "").toLowerCase();
  const year = parseInt(String(modelYear || "").trim(), 10);
  const makes = CATALOG.vehicles || {};
  const products = CATALOG.products || {};
  for (const make of Object.keys(makes)) {
    if (vlow.indexOf(make.toLowerCase()) < 0) continue;
    // Longest model name first so "Land Cruiser" wins before any shorter substring.
    const names = Object.keys(makes[make]).sort((a, b) => b.length - a.length);
    for (const model of names) {
      if (vlow.indexOf(model.toLowerCase()) < 0) continue;
      const row = pickRow(makes[make][model], vlow, year);
      if (!row) return null;
      const systems = (row.systems || []).map((s) => {
        const p = products[s.sku] || {};
        return {
          system: s.system, product: p.name || s.sku, stockNo: p.stockNo || "",
          capacity: s.capacity, unit: s.unit || "",
          factoryInterval: s.factoryInterval || "", tunedInterval: s.tunedInterval || "",
        };
      });
      const yr = !isNaN(year) ? year : (/(\d{4})/.exec(row.y) || [])[1] || "";
      return { make, model, engine: row.e || "", systems, garageUrl: garageUrl(make, model, yr) };
    }
  }
  return null;
}

module.exports = { resolveFluids, yearInRange };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-fluids.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/amsoil-fluids.js tests/amsoil-fluids.test.js
git commit -m "feat(cert): vehicle->AMSOIL fluids lookup for the reference page"
```

---

## Task 3: Vendor the QR encoder + `qr.js` wrapper

**Files:**
- Create: `netlify/functions/lib/vendor/qrcodegen.js`
- Create: `netlify/functions/lib/qr.js`
- Test: `tests/qr.test.js`

- [ ] **Step 1: Vendor the MIT QR library**

Create `netlify/functions/lib/vendor/qrcodegen.js` containing the official **Nayuki "QR Code generator" — TypeScript/JavaScript** single-file library (MIT License), compiled/plain-JS variant, exporting a CommonJS module. Source of truth: the `qrcodegen` reference implementation (Project Nayuki, MIT). **Copy it verbatim**, keep the MIT license header intact, and append at the end:

```js
module.exports = { qrcodegen };
```

Do **not** hand-modify the algorithm. The only addition is the `module.exports` line so Node can require it. Public API used by the wrapper: `qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM)`, then `qr.size` and `qr.getModule(x, y)`.

- [ ] **Step 2: Write the failing test**

Create `tests/qr.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { qrSvg } = require("../netlify/functions/lib/qr.js");

test("renders a deterministic inline SVG QR for a URL", () => {
  const url = "https://tunedyota.com/amsoil-garage?make=Toyota&model=Tacoma&year=2024";
  const svg = qrSvg(url);
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.ok((svg.match(/<rect/g) || []).length > 10, "should have many module rects");
  assert.equal(qrSvg(url), svg, "same input -> identical output (deterministic)");
});

test("throws on empty input", () => {
  assert.throws(() => qrSvg(""));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/qr.test.js`
Expected: FAIL — `qr.js` not found.

- [ ] **Step 4: Write the wrapper**

Create `netlify/functions/lib/qr.js`:

```js
// netlify/functions/lib/qr.js
// Pure: encode a string -> inline SVG QR (crisp in print, zero external requests).
// Wraps the vendored MIT Nayuki encoder. Used on the Certificate v2 reference page,
// which is opened in a browser / printed to PDF (SVG is fine there).
const { qrcodegen } = require("./vendor/qrcodegen.js");

// One black rect per dark module. `size` px per module keeps the SVG integer-clean.
function qrSvg(text, opts = {}) {
  const s = String(text == null ? "" : text);
  if (!s) throw new Error("qrSvg: empty input");
  const px = opts.moduleSize || 4;
  const quiet = opts.quiet == null ? 4 : opts.quiet;      // quiet-zone modules
  const qr = qrcodegen.QrCode.encodeText(s, qrcodegen.QrCode.Ecc.MEDIUM);
  const dim = (qr.size + quiet * 2) * px;
  let rects = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const rx = (x + quiet) * px, ry = (y + quiet) * px;
        rects += `<rect x="${rx}" y="${ry}" width="${px}" height="${px}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `role="img" aria-label="QR code to your AMSOIL Garage" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#191C1E">${rects}</g></svg>`;
}

module.exports = { qrSvg };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/qr.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Manual scan check**

Generate one cert (later tasks) or a scratch HTML with `qrSvg(url)` and scan it with a phone to confirm it opens the garage URL. Record the result in the PR notes.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/lib/vendor/qrcodegen.js netlify/functions/lib/qr.js tests/qr.test.js
git commit -m "feat(cert): vendored QR encoder + SVG wrapper for the reference page"
```

---

## Task 4: Certificate builder — page-2 AMSOIL reference zone

**Files:**
- Modify: `netlify/functions/lib/certificate.js`
- Test: `tests/certificate.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/certificate.test.js`:

```js
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");
const { qrSvg } = require("../netlify/functions/lib/qr.js");

test("page 1 is unchanged when no amsoil context is passed", () => {
  const { html } = buildCertificate({ name: "A", vehicle: "V", calibration: "Medium" });
  assert.ok(!/AMSOIL Maintenance Reference/.test(html), "no page 2 without amsoil context");
});

test("renders the AMSOIL reference page with fluids + stock numbers", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { html } = buildCertificate({
    name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024",
    calibration: "Medium", installer: "Aaron Groshong", calibrationDate: "2026-07-12",
    amsoil: { fluids, qrSvg: qrSvg(fluids.garageUrl) },
  });
  assert.match(html, /AMSOIL Maintenance Reference/);
  assert.ok(html.includes("Signature Series 0W-20"), "product description present");
  assert.ok(html.includes("ASMQT"), "stock number present");
  assert.ok(html.includes("7,500 mi"), "tuned interval present");
  assert.match(html, /amsoil-logo\.png/, "official logo referenced");
  assert.match(html, /<svg[^>]*aria-label="QR code/, "QR svg embedded");
  assert.ok(html.includes("Authorized AMSOIL Dealer"));
});

test("compact reference page when the vehicle has no fluid data", () => {
  const { html } = buildCertificate({
    name: "A", vehicle: "2020 Ford F-150", calibration: "Medium",
    amsoil: { fluids: null, qrSvg: qrSvg("https://tunedyota.com/amsoil-garage") },
  });
  assert.match(html, /AMSOIL Maintenance Reference/);
  assert.ok(!/<table class="fluids"/.test(html), "no fabricated fluids table");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/certificate.test.js`
Expected: FAIL — `amsoil` context not yet rendered.

- [ ] **Step 3: Implement the page-2 zone**

In `netlify/functions/lib/certificate.js`:

(a) Add the page-2 CSS to the existing `<style>` block (paste the `--amsoil*` vars into `:root`, and the `.ref*`, `.amsoil-*`, `table.fluids`, `.stockno`, `.order`, `.qr`, `.ref-fine` rules, plus the `@media print .ref{page-break-before:always;}` rule) — copy them verbatim from `docs/brand/tuned-yota-master-certificate-v2-DRAFT.html`.

(b) Add a helper that renders the reference page:

```js
const AMSOIL_LOGO = "https://tunedyota.com/images/amsoil/amsoil-logo.png";

function fluidsRows(fluids) {
  if (!fluids || !fluids.systems || !fluids.systems.length) return "";
  const rows = fluids.systems.map((s) => `
        <tr>
          <td><span class="sys">${esc(s.system)}</span></td>
          <td><div class="prod">${esc(s.product)}</div>${s.stockNo ? `<div class="stockno">Stock No. <b>${esc(s.stockNo)}</b></div>` : ""}</td>
          <td class="num"><span class="cap">${esc(s.capacity)}</span> ${esc(s.unit)}</td>
          <td class="num intv"><span class="t">${esc(s.tunedInterval)}</span>${s.factoryInterval ? `<span class="f">${esc(s.factoryInterval)}</span>` : ""}</td>
        </tr>`).join("");
  return `
      <table class="fluids">
        <thead><tr><th>System</th><th>AMSOIL product</th><th class="num">Capacity</th><th class="num">Interval</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
}

function amsoilPage(amsoil, vehicleDisplay) {
  const fluids = amsoil.fluids;
  const qr = amsoil.qrSvg || "";
  const url = (fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage";
  const veh = esc(vehicleDisplay || "");
  return `
  <div class="cert ref">
    <div class="measure"></div>
    <div class="pad">
      <div class="ref-head">
        <div>
          <div class="ref-eyebrow">AMSOIL Maintenance Reference</div>
          <h2>A tuned truck deserves the best fluids in the world — <span class="amsoil-red">AMSOIL</span>.</h2>
          ${veh ? `<div class="ref-veh">${veh}</div>` : ""}
        </div>
        <div class="amsoil-lockup">
          <span class="amsoil-chip"><img src="${AMSOIL_LOGO}" alt="AMSOIL"></span>
          <div class="amsoil-dealer">Authorized AMSOIL Dealer</div>
        </div>
      </div>
      <p class="lede">Tuned Yota has organized your vehicle&rsquo;s necessary fluids, fluid capacities, and service intervals! We hope you enjoy this quick reference list of AMSOIL products for your vehicle.</p>
      ${fluidsRows(fluids)}
      <div class="order">
        <span class="qr">${qr}</span>
        <div class="pitch">
          <h3>Order your exact fluids</h3>
          <p>Scan to open <strong>your AMSOIL Garage</strong>${fluids ? " — pre-loaded with these products for your " + esc(fluids.model) + "" : ""}. Add other vehicles, or search the full AMSOIL catalog.</p>
          <span class="save">Enroll free as a Preferred Customer — save up to 25%</span>
          <div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div>
        </div>
      </div>
    </div>
    <div class="ref-fine">Fluids &amp; capacities are a maintenance reference for your vehicle — confirm capacities against your owner&rsquo;s manual before service. &middot; Tuned Yota is an Authorized AMSOIL Dealer. &middot; tunedyota.com/amsoil-garage</div>
  </div>`;
}
```

Note: the `.qr` wrapper here is a `<span class="qr">` holding the SVG; adjust the DRAFT's `.qr` CSS (it targeted an `<svg class="qr">`) to `.qr{...}` on the span and `.qr svg{width:100%;height:auto;display:block;}`.

(c) In `buildCertificate`, accept `amsoil` in the destructured params and append the page before `</body>`:

```js
function buildCertificate({ name, vehicle, modelYear, vin, calibration, installer, installerRegion, calibrationDate, certNo, issueDate, amsoil } = {}) {
```

Find the closing of the first `.cert` div + `</body>` and insert `${amsoil ? amsoilPage(amsoil, vehicleDisplay) : ""}` between the end of the page-1 `.cert` block and `</body>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/certificate.test.js`
Expected: PASS — including the existing page-1 regression tests.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/certificate.js tests/certificate.test.js
git commit -m "feat(cert): render AMSOIL maintenance reference page (fluids + QR)"
```

---

## Task 5: Walk-in email capture (server)

**Files:**
- Modify: `netlify/functions/installer-walkin.js`
- Test: `tests/installer-walkin.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/installer-walkin.test.js`:

```js
test("persists a customer email when provided", async () => {
  const created = [];
  const out = await processWalkin(
    { city: "Sioux Falls", name: "Pat R", phone: "6055551212", email: "pat@example.com", vehicle: "2021 Tundra" },
    { key: "cody", create: async (a) => { created.push(a.fields); return { id: "rec1" }; } });
  assert.equal(out.status, "booked");
  assert.equal(created[0].Email, "pat@example.com");
});
```

(Use a city that routes to `cody` per `lib/markets.js`; adjust if needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/installer-walkin.test.js`
Expected: FAIL — `Email` not written.

- [ ] **Step 3: Implement**

In `netlify/functions/installer-walkin.js`, read and persist the email:

```js
const email = String(d.email || "").trim();
```

Add `Email: email` to the `fields` object (only meaningful when non-empty; Airtable accepts an empty string). Keep `createTolerant(..., ["Source"])` — add `"Email"` to the tolerant drop-list so a base missing the column still books:

```js
rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", "Email"]);
```

Also add `email` to the returned `booking` object so the UI can show it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/installer-walkin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-walkin.js tests/installer-walkin.test.js
git commit -m "feat(walkin): capture customer email for direct certificate delivery"
```

---

## Task 6: Close-out — customer delivery + issue metadata + page 2

**Files:**
- Modify: `netlify/functions/installer-closeout.js`
- Test: `tests/installer-closeout.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/installer-closeout.test.js`:

```js
function baseDeps(overrides = {}) {
  const sent = [];
  const updated = [];
  return {
    sent, updated,
    deps: {
      key: "aaron", admin: false,
      get: async () => ({ id: "recX", fields: {
        Installer: "aaron", Name: "Marcus Bell", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
        "Model Year": "2024", Email: "marcus@example.com", "Event Date": "2026-07-12", Status: "Booked" } }),
      update: async (a) => { updated.push(a.fields); return { id: a.id }; },
      create: async () => ({ id: "wrec" }),
      send: async (a) => { sent.push(a); },
      ...overrides,
    },
  };
}

test("delivers the certificate to the customer, not cc'd to the installer", async () => {
  const { sent, deps } = baseDeps();
  const out = await processCloseout(
    { recordId: "recX", action: "complete", calibration: "Medium", vin: "3TMLB5JN1RM123456",
      customerEmail: "marcus@example.com" }, deps);
  assert.equal(out.status, "completed");
  assert.equal(sent[0].to, "marcus@example.com");
  assert.equal(sent[0].cc, undefined, "no installer/info cc");
  assert.match(sent[0].attachments[0].content, /./);
});

test("stores issue metadata and marks delivery = customer", async () => {
  const { updated, deps } = baseDeps();
  await processCloseout({ recordId: "recX", action: "complete", calibration: "Medium",
    vin: "3TMLB5JN1RM123456", customerEmail: "marcus@example.com" }, deps);
  const all = Object.assign({}, ...updated);
  assert.ok(all["Certificate Issued"], "issue date stored");
  assert.equal(all["Certificate Recipient"], "marcus@example.com");
  assert.equal(all["Cert Delivery"], "customer");
});

test("falls back to the installer when no customer email exists", async () => {
  const { sent, updated, deps } = baseDeps({
    get: async () => ({ id: "recX", fields: {
      Installer: "aaron", Name: "No Email", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
      "Event Date": "2026-07-12", Status: "Booked" } }) });
  await processCloseout({ recordId: "recX", action: "complete", calibration: "Medium",
    vin: "3TMLB5JN1RM123456" }, deps);
  assert.ok(sent[0].to && sent[0].to !== "", "sent to installer fallback");
  const all = Object.assign({}, ...updated);
  assert.equal(all["Cert Delivery"], "installer-fallback");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/installer-closeout.test.js`
Expected: FAIL — current code cc's `info@` and doesn't write the new fields.

- [ ] **Step 3: Implement**

In `netlify/functions/installer-closeout.js`, in the `complete` branch:

(a) After computing `calibrationDate`, capture the customer email (body override wins, else the record's):

```js
const customerEmail = String(d.customerEmail || f.Email || "").trim();
```

(b) Resolve fluids + QR and pass as `amsoil`:

```js
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");
// ...inside the try that builds the cert:
const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
const { subject, html } = buildCertificate({ /* existing args */, amsoil });
```

(c) Delivery — replace the `send({...})` recipient block:

```js
const toCustomer = !!customerEmail;
const to = toCustomer ? customerEmail : inst.email;
await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to,
  replyTo: OWNER, subject,
  text: toCustomer
    ? `Attached is your Tuned Yota Certificate of Calibration and AMSOIL maintenance reference for your ${f.Vehicle || "vehicle"}.`
    : `Attached is the Certificate of Calibration for ${f.Name || "your customer"} — no customer email on file; please forward it to them.`,
  attachments: [{ filename: "certificate.html", content: Buffer.from(html).toString("base64") }] });
```

(d) Persist customer email + issue metadata. Extend `completeFields` before the update:

```js
if (customerEmail) completeFields.Email = customerEmail;
completeFields["Certificate Issued"] = issueDate;
completeFields["Certificate Recipient"] = to;
completeFields["Cert Delivery"] = toCustomer ? "customer" : "installer-fallback";
```

Add these to the `updateTolerant` drop-list: `["VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", "Email", "Certificate Issued", "Certificate Recipient", "Cert Delivery"]`. Keep the separate `Certificate Sent: true` write after a successful send (idempotency guard unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/installer-closeout.test.js`
Expected: PASS (including existing tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-closeout.js tests/installer-closeout.test.js
git commit -m "feat(closeout): deliver certificate to customer + AMSOIL page + issue metadata"
```

---

## Task 7: Align the daily backstop with customer delivery

**Files:**
- Modify: `netlify/functions/certificate-dispatch.js`
- Test: `tests/certificate-dispatch.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/certificate-dispatch.test.js`:

```js
test("backstop sends to the customer email when present, no cc", async () => {
  const sent = [];
  const r = await dispatchCertificates({
    list: async () => ([{ id: "rec1", fields: {
      Status: "Completed", "OTT Calibration": "Medium", Name: "C", Installer: "aaron",
      Vehicle: "2024 Toyota Tacoma 2.4L-T I4", Email: "cust@example.com", "Calibration Date": "2026-07-12" } }]),
    update: async () => ({}), send: async (a) => { sent.push(a); }, notify: async () => {},
    env: { RESEND_API_KEY: "x" },
  });
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, "cust@example.com");
  assert.equal(sent[0].cc, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: FAIL — still sends to installer with cc.

- [ ] **Step 3: Implement**

In `certificate-dispatch.js`, mirror Task 6: require `resolveFluids`/`qrSvg`, build `amsoil`, pass to `buildCertificate`, and compute recipient:

```js
const customerEmail = String(f.Email || "").trim();
const to = customerEmail || inst.email;
```

Replace the `to`/`cc` in the `send({...})` call with `to,` and drop `cc`. Update the `text` to the customer-facing wording when `customerEmail`, else the forward-please wording. On success, also write `"Cert Delivery": customerEmail ? "customer" : "installer-fallback"`, `"Certificate Issued": issueDate`, `"Certificate Recipient": to` alongside `"Certificate Sent": true` (single `update` call with all fields).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/certificate-dispatch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/certificate-dispatch.js tests/certificate-dispatch.test.js
git commit -m "feat(cert): backstop delivers to customer + AMSOIL page, consistent with closeout"
```

---

## Task 8: Certificate repository endpoint

**Files:**
- Create: `netlify/functions/installer-certificate.js`
- Test: `tests/installer-certificate.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/installer-certificate.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderCertificate } = require("../netlify/functions/installer-certificate.js");

const rec = { id: "recX", fields: {
  Installer: "aaron", Name: "Marcus Bell", Vehicle: "2024 Toyota Tacoma 2.4L-T I4",
  "Model Year": "2024", VIN: "3TMLB5JN1RM123456", "OTT Calibration": "Medium",
  "Calibration Date": "2026-07-12", "Certificate Issued": "2026-07-12", Status: "Completed" } };

test("renders a stored certificate for its owner", async () => {
  const out = await renderCertificate("recX", { key: "aaron", admin: false,
    get: async () => rec });
  assert.equal(out.status, "ok");
  assert.match(out.html, /Certificate of<\/span> Calibration/);
  assert.match(out.html, /AMSOIL Maintenance Reference/);
  assert.match(out.html, /Marcus Bell/);
});

test("refuses a booking the caller doesn't own", async () => {
  const out = await renderCertificate("recX", { key: "noah", admin: false, get: async () => rec });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("an admin may render any booking", async () => {
  const out = await renderCertificate("recX", { key: "aaron", admin: true, get: async () => rec });
  assert.equal(out.status, "ok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/installer-certificate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `netlify/functions/installer-certificate.js`:

```js
// netlify/functions/installer-certificate.js
// Auth-gated certificate repository: re-render a completed booking's Certificate of
// Calibration on demand, deterministically from the stored record (stable serial +
// stored issue date). Ownership re-checked server-side; admins may view any.
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { keyToInstaller } = require("./lib/routing.js");
const { buildCertificate, certSerial } = require("./lib/certificate.js");
const { resolveFluids } = require("./lib/amsoil-fluids.js");
const { qrSvg } = require("./lib/qr.js");

async function renderCertificate(recordId, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false,
          get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!recordId) return { status: "error", error: "missing-record" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId }); }
  catch { return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = Array.isArray(f.Installer) ? f.Installer[0] : f.Installer;
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };
  const inst = keyToInstaller(owner);
  const calibrationDate = String(f["Calibration Date"] || f["Event Date"] || "").slice(0, 10);
  const issueDate = String(f["Certificate Issued"] || calibrationDate).slice(0, 10);
  const certNo = certSerial(recordId, calibrationDate, issueDate);
  const fluids = resolveFluids(f.Vehicle, f["Model Year"]);
  const amsoil = { fluids, qrSvg: qrSvg((fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage") };
  const { html } = buildCertificate({
    name: f.Name, vehicle: f.Vehicle, modelYear: f["Model Year"], vin: f.VIN,
    calibration: f["OTT Calibration"], installer: inst.name, installerRegion: inst.region,
    calibrationDate, certNo, issueDate, amsoil });
  return { status: "ok", html };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const recordId = (event.queryStringParameters || {}).recordId || "";
  const out = await renderCertificate(recordId, { key, admin: isAdmin(key, process.env) });
  if (out.status !== "ok") {
    const code = out.error === "not-yours" ? 403 : out.error === "missing-record" ? 400 : 502;
    return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
  }
  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: out.html };
}
module.exports = { handler, renderCertificate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/installer-certificate.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/installer-certificate.js tests/installer-certificate.test.js
git commit -m "feat(cert): auth-gated certificate repository endpoint"
```

---

## Task 9: Installer console — email fields, View/Download cert, fallback flag

**Files:**
- Modify: `site/installer.html`

No unit test (static page); verify by loading the console locally against the harness used in prior installer work, or by inspection. Keep changes minimal and match existing patterns in the file.

- [ ] **Step 1: Walk-in email fields**

In `anydayWalkForm()` add an email input after the phone field:

```js
var em = mkInput('Customer email (for their certificate)'); em.type='email';
```

Include it in the appended elements and pass to `addWalkin`. In `walkAdder(e)` add the same `em` input. Update `addWalkin(evt, vals)` to read `vals.email` and include `email` in the POST body to `installer-walkin`.

- [ ] **Step 2: Close-out email field**

In `rowCard(b)` for open bookings, add an email input pre-filled from `b.email`:

```js
'<input id="cem_'+b.id+'" type="email" autocomplete="off" placeholder="Customer email (for their certificate)" value="'+esc(b.email||'')+'" style="margin:5px 0">'+
```

In `complete(id)`, read it and send it:

```js
var cem = val('cem_'+id);
closeout(id,{action:'complete', calibration:cal, vin:vin, tuningPlatform:tp, calibrationType:ct, ecuId:ecu, gearSize:gear, mileage:mi, customerEmail:cem});
```

- [ ] **Step 3: View/Download certificate on completed rows**

In `rowCard(b)` for the `Completed` branch, append a link and a handler that fetches with the token header and opens the HTML as a blob (a plain link can't send `x-installer-token`):

```js
c.innerHTML = head + '<div class="done">✓ Completed'+/* existing */'</div>' +
  '<a href="#" class="link" id="cert_'+b.id+'">View / download certificate</a>';
c.querySelector('#cert_'+b.id).onclick = async function(e){
  e.preventDefault();
  var res = await fetch('/.netlify/functions/installer-certificate?recordId='+encodeURIComponent(b.id), { headers:{ 'x-installer-token':tok() } });
  if(!res.ok){ fail('Could not load certificate.'); return; }
  var html = await res.text();
  var url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  window.open(url, '_blank');
};
```

- [ ] **Step 4: Delivery fallback flag**

When a booking has `deliveryFallback` (add `certDelivery: f["Cert Delivery"]` to the roster mapping in `installer-roster.js` and surface it on the completed card), show a small notice + a "resend to customer" affordance that re-opens the email field and calls `closeout` with a corrected `customerEmail`. (Roster change: add `certDelivery: f["Cert Delivery"] || ""` to the mapped booking object in `netlify/functions/installer-roster.js`.)

- [ ] **Step 5: Commit**

```bash
git add site/installer.html netlify/functions/installer-roster.js
git commit -m "feat(console): customer email capture + view/download certificate + delivery fallback"
```

---

## Task 10: AMSOIL Garage landing — pre-fill, My Garage, catalog search

**Files:**
- Modify: `site/amsoil-garage.html` (and its render/build script if the picker is generated — check `scripts/build-amsoil-pages.mjs`)

Read the current picker implementation first. Keep the tool logic intact; add behavior only.

- [ ] **Step 1: Deep-link pre-fill**

On load, read `?make=&model=&year=` and pre-select the picker to that vehicle (dispatch the same change handler the picker already uses so the fluids render). If a param doesn't match, ignore it and leave the picker default.

- [ ] **Step 2: Device-local "My Garage"**

Add a "＋ Add this vehicle to my garage" control that appends the current make/model/year to a `localStorage` list (`ty_amsoil_garage`), and render saved vehicles as quick-select chips on load. No accounts (that's sub-project D). De-dupe by make|model|year.

- [ ] **Step 3: Full-catalog search**

Add a "Search all AMSOIL products" input that, on submit, opens amsoil.com search with the referral attached:

```html
<script src="/amsoil-referral.js"></script>
<script>
  document.getElementById('ag-search-btn').onclick = function(){
    var q = document.getElementById('ag-search').value.trim(); if(!q) return;
    window.open(window.amsoilUrl('/search?q=' + encodeURIComponent(q)), '_blank');
  };
</script>
```

- [ ] **Step 4: Verify**

Load `/amsoil-garage?make=Toyota&model=Tacoma&year=2024` locally; confirm it pre-selects, "add to garage" persists across reload, and search opens amsoil.com with `?zo=30713116`.

- [ ] **Step 5: Regenerate + commit**

If the page is generated, run `npm run build:amsoil` then `npm run build:seo` (per the SEO generator convention). Then:

```bash
git add site/amsoil-garage.html scripts/build-amsoil-pages.mjs
git commit -m "feat(amsoil-garage): deep-link pre-fill, my-garage, and full-catalog search"
```

---

## Task 11: Canonical master + cleanup

**Files:**
- Modify: `docs/brand/tuned-yota-master-certificate.html`
- Delete: `docs/brand/tuned-yota-master-certificate-v2-DRAFT.html`

- [ ] **Step 1: Fold v2 into the canonical master**

Update `docs/brand/tuned-yota-master-certificate.html` to the approved v2 design (page 1 unchanged; add the page-2 reference zone markup + CSS from the DRAFT, using the official logo path `/images/amsoil/amsoil-logo.png`). This file stays the canonical design to evolve.

- [ ] **Step 2: Delete the DRAFT**

```bash
git rm docs/brand/tuned-yota-master-certificate-v2-DRAFT.html
```

- [ ] **Step 3: Commit**

```bash
git add docs/brand/tuned-yota-master-certificate.html
git commit -m "docs(brand): fold Certificate v2 into the canonical master; drop draft"
```

---

## Task 12: Full suite + ship

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests PASS (existing + new).

- [ ] **Step 2: Ship**

Use the `ship` skill: regenerate SEO if any `site/` HTML changed (`npm run build:seo`), run `npm test`, confirm branch is `master` (shared-folder rule), push, and verify live. Confirm `site/images/amsoil/amsoil-logo.png` is committed and resolves at `https://tunedyota.com/images/amsoil/amsoil-logo.png`.

- [ ] **Step 3: Post-ship verification**

- Complete a real close-out (or a safe test booking) → confirm the customer receives the two-page certificate and the QR opens the pre-filtered garage.
- Open View/Download certificate from the dashboard for that booking → identical render.
- Confirm no cc copies landed in the installer/`info@` inbox.

---

## Owner inputs (tracked, non-blocking to build)

0. **Add 3 Airtable columns to the Bookings table** (manual — the metadata API is unusable here; the tolerant writes silently drop missing columns, so live persistence needs them): `Certificate Issued` (Date), `Certificate Recipient` (Single line text), `Cert Delivery` (Single select: `customer`, `installer-fallback`). `Email` already exists. Do this before/at ship (Task 12) — tests pass without it (deps are injected), but production won't persist the fields until the columns exist.
1. **Verify AMSOIL stock numbers** (Task 1 seed values) against amsoil.com before public print.
2. **Logo delivery** — plan uses a hosted absolute URL (`/images/amsoil/amsoil-logo.png`). If offline-attachment rendering matters, switch to a base64 data-URI via a generated `lib/assets/amsoil-logo.js` (pure) — noted, not built.
3. Fluid specs treated as verified per owner direction (2026-07-13); adjustable later by editing `site/amsoil-garage.json`.

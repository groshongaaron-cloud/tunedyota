# Dealer Partner Kit (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the branded, print-ready Dealer Partner Kit — six leave-behind artifacts that "sell certainty, not performance" — plus a guardrail test and an HTML→PDF renderer.

**Architecture:** Self-contained HTML files in `docs/marketing/dealer-kit/`, each linking a shared `kit.css` (US-Letter print styling + brand tokens). A CommonJS `render.js` (mirroring `ad-templates/render.js`'s Chrome discovery, but `--print-to-pdf`) exports each to gitignored `assets-source/dealer-kit-exports/`. A `node --test` guardrail scans the HTML for brand-rule violations. Owner-input values are explicit `{{OWNER: …}}` tokens; the two legal artifacts carry a `DRAFT — COUNSEL-REVIEW-REQUIRED` watermark.

**Tech Stack:** HTML/CSS, headless Chrome print-to-PDF, `node:test`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-07-dealer-network-partnership-design.md` (Part A).

**Copy guardrails (must hold in every artifact):** emissions-intact throughout; turbo tier labeled only "Turbo Performance Calibration"; NO "Stage 2"/"Stage 3", NO "MAF" tune, NO "COBB"/"Accessport", NO "Kevin Whitman". These are enforced by the Task 2 test.

---

## File Structure

- **Create** `docs/marketing/dealer-kit/kit.css` — shared print styling + brand tokens + `.owner-input` + `.draft` watermark.
- **Create** `docs/marketing/dealer-kit/render.js` — HTML→PDF renderer (US Letter).
- **Create** `docs/marketing/dealer-kit/00-cover.html` — kit cover / index + legitimacy block.
- **Create** `docs/marketing/dealer-kit/01-compliance-statement.html` — Emissions-Intact Compliance Statement (counsel-review draft).
- **Create** `docs/marketing/dealer-kit/02-warranty-magnuson-moss.html` — Magnuson-Moss warranty education one-pager (counsel-review draft).
- **Create** `docs/marketing/dealer-kit/03-process-logistics.html` — Process & Logistics sheet (owner-input fields).
- **Create** `docs/marketing/dealer-kit/04-scope-boundary.html` — Scope-Boundary sheet.
- **Create** `docs/marketing/dealer-kit/walkthrough.md` — internal 15-minute talk-track.
- **Create** `tests/dealer-kit-guardrails.test.js` — brand-rule scanner.
- **Modify** `.gitignore` — ensure `assets-source/` is ignored (verify; likely already).
- **Modify** `package.json` — add `"render:dealer-kit"` script.

---

## Task 1: Shared kit stylesheet + renderer

**Files:**
- Create: `docs/marketing/dealer-kit/kit.css`
- Create: `docs/marketing/dealer-kit/render.js`
- Modify: `package.json`

- [ ] **Step 1: Write `kit.css`**

```css
/* Tuned Yota Dealer Partner Kit — shared US-Letter print styling.
   Brand tokens mirror the site (sage green + charcoal). One artifact per page. */
:root{
  --sage:#4a5d4f; --sage-d:#2f3d33; --ink:#1c2320; --line:#d7ddd6;
  --paper:#ffffff; --accent:#8a6d3b; --muted:#5c665e; --wash:#f4f6f3;
}
@page{ size:Letter; margin:0.6in; }
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; background:var(--paper); color:var(--ink);
  font:15px/1.55 "Segoe UI",-apple-system,Helvetica,Arial,sans-serif; }
.page{ padding:0.1in 0; max-width:7.3in; margin:0 auto; }
.eyebrow{ text-transform:uppercase; letter-spacing:.14em; font-size:11px;
  color:var(--sage); font-weight:700; }
h1{ font-size:27px; line-height:1.15; margin:6px 0 10px; color:var(--sage-d); }
h2{ font-size:17px; margin:20px 0 8px; color:var(--sage-d);
  border-bottom:2px solid var(--line); padding-bottom:4px; }
h3{ font-size:14px; margin:14px 0 4px; color:var(--ink); }
p,li{ font-size:13.5px; }
ul{ margin:6px 0 6px 18px; padding:0; } li{ margin:3px 0; }
.lead{ font-size:15px; color:var(--muted); }
table{ border-collapse:collapse; width:100%; margin:10px 0; font-size:12.5px; }
th,td{ border:1px solid var(--line); padding:6px 9px; text-align:left; vertical-align:top; }
th{ background:var(--wash); color:var(--sage-d); }
.brandbar{ display:flex; justify-content:space-between; align-items:baseline;
  border-bottom:3px solid var(--sage); padding-bottom:8px; margin-bottom:14px; }
.brandbar .wordmark{ font-weight:800; letter-spacing:.02em; color:var(--sage-d); font-size:18px; }
.brandbar .tag{ font-size:11px; color:var(--muted); }
.callout{ background:var(--wash); border-left:4px solid var(--sage); padding:10px 14px; margin:12px 0; }
.owner-input{ background:#fff3cd; border:1px dashed var(--accent); padding:0 6px;
  border-radius:3px; font-weight:600; color:#6b4e18; }
.foot{ margin-top:22px; border-top:1px solid var(--line); padding-top:8px;
  font-size:10.5px; color:var(--muted); }
/* Draft watermark for counsel-review artifacts */
body.draft::before{ content:"DRAFT — COUNSEL REVIEW REQUIRED"; position:fixed;
  top:46%; left:50%; transform:translate(-50%,-50%) rotate(-24deg);
  font-size:46px; font-weight:800; color:rgba(180,60,60,.10);
  letter-spacing:.06em; white-space:nowrap; pointer-events:none; z-index:0; }
.draft-banner{ background:#f8d7da; border:1px solid #d9534f; color:#842029;
  font-weight:700; font-size:12px; padding:7px 12px; border-radius:4px; margin-bottom:12px; }
.page{ position:relative; z-index:1; }
```

- [ ] **Step 2: Write `render.js`**

```js
#!/usr/bin/env node
// Render every Dealer Partner Kit HTML artifact to a US-Letter PDF via headless Chrome.
//   node docs/marketing/dealer-kit/render.js
// Output → assets-source/dealer-kit-exports/ (gitignored). No dependencies.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "../../..");
const OUT = path.join(ROOT, "assets-source", "dealer-kit-exports");
fs.mkdirSync(OUT, { recursive: true });

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const CHROME = CHROMES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome/Edge found. Edit CHROMES in render.js."); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => /^\d.*\.html$/.test(f));
let n = 0;
for (const f of files) {
  const out = path.join(OUT, f.replace(/\.html$/, ".pdf"));
  try {
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
      "--virtual-time-budget=6000", `--print-to-pdf=${out}`,
      "file:///" + path.join(DIR, f).replace(/\\/g, "/"),
    ], { stdio: "ignore" });
    console.log(`✓ ${path.basename(out)}`);
    n++;
  } catch (e) {
    console.error("✗ failed:", f, e.message);
  }
}
console.log(`\nRendered ${n} artifact(s) → ${OUT}`);
```

- [ ] **Step 3: Add npm script** — in `package.json` `"scripts"`, add:

```json
    "render:dealer-kit": "node docs/marketing/dealer-kit/render.js",
```

- [ ] **Step 4: Verify `assets-source/` is gitignored**

Run: `git check-ignore assets-source/dealer-kit-exports/x.pdf`
Expected: prints the path (ignored). If it prints nothing, add `assets-source/` to `.gitignore` and commit that.

- [ ] **Step 5: Commit**

```bash
git add docs/marketing/dealer-kit/kit.css docs/marketing/dealer-kit/render.js package.json
git commit -m "feat(dealer-kit): shared print stylesheet + HTML->PDF renderer"
```

---

## Task 2: Brand-guardrail test (write BEFORE authoring content)

**Files:**
- Create: `tests/dealer-kit-guardrails.test.js`

- [ ] **Step 1: Write the test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const KIT = path.join(__dirname, "..", "docs", "marketing", "dealer-kit");
// Forbidden substrings (case-insensitive). "MAF" uses word boundaries to avoid
// false hits inside unrelated words.
const FORBIDDEN = [
  { re: /stage\s*2/i, label: "Stage 2" },
  { re: /stage\s*3/i, label: "Stage 3" },
  { re: /\bMAF\b/i, label: "MAF" },
  { re: /\bCOBB\b/i, label: "COBB" },
  { re: /accessport/i, label: "Accessport" },
  { re: /kevin\s+whitman/i, label: "Kevin Whitman" },
];

function kitFiles() {
  if (!fs.existsSync(KIT)) return [];
  return fs.readdirSync(KIT).filter((f) => f.endsWith(".html") || f.endsWith(".md"))
    .map((f) => path.join(KIT, f));
}

test("dealer-kit content contains no brand-rule violations", () => {
  for (const file of kitFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const { re, label } of FORBIDDEN) {
      assert.ok(!re.test(text), `Forbidden term "${label}" found in ${path.basename(file)}`);
    }
  }
});

test("emissions-intact positioning is present in the compliance statement", () => {
  const f = path.join(KIT, "01-compliance-statement.html");
  if (!fs.existsSync(f)) return; // skip until authored
  assert.match(fs.readFileSync(f, "utf8"), /emissions[-\s]intact/i);
});

test("both legal artifacts carry the counsel-review draft flag", () => {
  for (const name of ["01-compliance-statement.html", "02-warranty-magnuson-moss.html"]) {
    const f = path.join(KIT, name);
    if (!fs.existsSync(f)) continue; // skip until authored
    assert.match(fs.readFileSync(f, "utf8"), /class="draft"/, `${name} missing body.draft`);
    assert.match(fs.readFileSync(f, "utf8"), /COUNSEL[-\s]REVIEW/i, `${name} missing counsel banner`);
  }
});
```

- [ ] **Step 2: Run test to verify it passes on an empty kit**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS (3 tests — the two file-specific ones skip while files are absent; the first passes over just `kit.css`-less HTML, i.e. no HTML yet).

- [ ] **Step 3: Commit**

```bash
git add tests/dealer-kit-guardrails.test.js
git commit -m "test(dealer-kit): brand-rule guardrail scanner"
```

---

## Task 3: Cover / index artifact

**Files:**
- Create: `docs/marketing/dealer-kit/00-cover.html`

- [ ] **Step 1: Write `00-cover.html`**

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Tuned Yota — Dealer Partner Kit</title>
<link rel="stylesheet" href="kit.css"></head>
<body><div class="page">
  <div class="brandbar"><span class="wordmark">TUNED YOTA</span>
    <span class="tag">Emissions-Intact Toyota &amp; Lexus Calibration</span></div>
  <div class="eyebrow">Dealer Partner Kit</div>
  <h1>The most documented, compliant, and de-risked calibration partner in the aftermarket.</h1>
  <p class="lead">This kit exists to answer one question before you have to ask it:
  <em>does partnering with Tuned Yota create a problem you'll have to answer for?</em>
  Our answer is paperwork, not promises. Everything we do is emissions-intact,
  warranty-aware, and documented job-by-job.</p>

  <h2>What's inside</h2>
  <table>
    <tr><th>#</th><th>Document</th><th>What it settles</th></tr>
    <tr><td>1</td><td>Emissions-Intact Compliance Statement</td><td>Exactly which emissions systems we never touch — no defeat devices.</td></tr>
    <tr><td>2</td><td>Warranty &amp; Magnuson-Moss (education)</td><td>How federal warranty law actually treats professional calibration.</td></tr>
    <tr><td>3</td><td>Process &amp; Logistics</td><td>Scheduling, service-area model, payment/revenue share, turnaround.</td></tr>
    <tr><td>4</td><td>Scope Boundary</td><td>What we do and don't do — complementary to your service drive, not competitive.</td></tr>
  </table>

  <h2>Why Tuned Yota is a safe name to stand next to</h2>
  <div class="callout"><ul>
    <li><strong>OTT Authorized Installer</strong> — calibrations by Overland Tailor Tuning, applied and documented by trained installers.</li>
    <li><strong>Insured</strong> — general and professional liability; Certificate of Insurance available on request. <span class="owner-input">{{OWNER: attach COI}}</span></li>
    <li><strong>Documented</strong> — every job is logged and issued a serialized Certificate of Calibration, auto-delivered on completion.</li>
    <li><strong>Emissions-intact</strong> — our positioning across every market and every vehicle; nothing that would embarrass a Toyota franchise.</li>
  </ul></div>

  <div class="foot">Tuned Yota · <span class="owner-input">{{OWNER: contact name / phone / email}}</span> · tunedyota.com &nbsp;|&nbsp;
  Partner kit — share with sales, F&amp;I, and service leadership.</div>
</div></body></html>
```

- [ ] **Step 2: Run the guardrail test**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/00-cover.html
git commit -m "feat(dealer-kit): cover / index artifact"
```

---

## Task 4: Emissions-Intact Compliance Statement (counsel-review draft)

**Files:**
- Create: `docs/marketing/dealer-kit/01-compliance-statement.html`

- [ ] **Step 1: Write `01-compliance-statement.html`** (note `body class="draft"`)

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Emissions-Intact Compliance Statement — Tuned Yota</title>
<link rel="stylesheet" href="kit.css"></head>
<body class="draft"><div class="page">
  <div class="brandbar"><span class="wordmark">TUNED YOTA</span>
    <span class="tag">Emissions-Intact Compliance</span></div>
  <div class="draft-banner">DRAFT — COUNSEL REVIEW REQUIRED before this document is placed on letterhead or shared externally. Educational summary; not legal advice.</div>
  <div class="eyebrow">Compliance Statement</div>
  <h1>What our calibration does — and what it never touches.</h1>
  <p class="lead">Tuned Yota installs emissions-intact calibrations. Our position is
  simple: performance calibration and factory emissions compliance are not in conflict
  when the emissions hardware and its monitors are left in place and functional.</p>

  <h2>Systems we do NOT modify, remove, or defeat</h2>
  <ul>
    <li>Catalytic converters and all factory exhaust after-treatment.</li>
    <li>Oxygen / air-fuel sensors and their diagnostic monitors.</li>
    <li>Evaporative emissions (EVAP) system.</li>
    <li>Onboard diagnostics (OBD-II) readiness monitors and reporting.</li>
    <li>Any factory emissions control component or its function.</li>
  </ul>
  <div class="callout"><strong>No defeat devices.</strong> We do not sell, install, or
  enable any device or calibration whose purpose is to bypass, disable, or defeat an
  emissions control. A vehicle leaves our care with its emissions systems intact and
  its monitors reporting normally.</div>

  <h2>What the calibration changes</h2>
  <p>Our calibrations refine engine and drivability parameters within the factory
  hardware envelope — throttle response, transmission behavior, and midrange power.
  Forced-induction packages (Magnuson supercharger) and our Turbo Performance
  Calibration are matched to the installed hardware, again with emissions systems intact.</p>

  <h2>State emissions programs</h2>
  <p>Emissions testing and requirements vary by state. Where a customer's state has a
  specific program, we advise confirming applicability for that vehicle and state before
  service. <span class="owner-input">{{OWNER + COUNSEL: exact CARB/state-specific wording and any EO references — leave general until blessed}}</span></p>

  <div class="foot">Educational summary prepared for dealer partners. Final wording subject to legal review. Tuned Yota · tunedyota.com</div>
</div></body></html>
```

- [ ] **Step 2: Run the guardrail test**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS (emissions-intact present; draft flag + counsel banner present; no forbidden terms).

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/01-compliance-statement.html
git commit -m "feat(dealer-kit): emissions-intact compliance statement (counsel-review draft)"
```

---

## Task 5: Warranty / Magnuson-Moss education one-pager (counsel-review draft)

**Files:**
- Create: `docs/marketing/dealer-kit/02-warranty-magnuson-moss.html`

- [ ] **Step 1: Write `02-warranty-magnuson-moss.html`** (note `body class="draft"`)

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Warranty & Magnuson-Moss — Tuned Yota</title>
<link rel="stylesheet" href="kit.css"></head>
<body class="draft"><div class="page">
  <div class="brandbar"><span class="wordmark">TUNED YOTA</span>
    <span class="tag">Warranty — What the Law Actually Says</span></div>
  <div class="draft-banner">DRAFT — COUNSEL REVIEW REQUIRED. This is customer/partner education, NOT a warranty, guarantee, or indemnity of any kind. Have counsel approve exact wording before external use.</div>
  <div class="eyebrow">Warranty Education</div>
  <h1>Professional calibration and the factory warranty.</h1>
  <p class="lead">The most common dealer concern is "does this void the warranty?"
  The honest, careful answer starts with federal law.</p>

  <h2>The Magnuson-Moss Warranty Act, in plain terms</h2>
  <p>Under the federal Magnuson-Moss Warranty Act, a manufacturer generally
  <strong>cannot void a vehicle's entire warranty simply because an aftermarket part
  or service was used.</strong> If a warranty claim is denied, the burden is on the
  warrantor to show that the specific aftermarket modification actually
  <em>caused</em> the specific failure being claimed.</p>
  <div class="callout">This reframes the risk: not "a tune voids the warranty," but
  "a warrantor would have to tie a particular failure to the calibration" — and only
  the components demonstrably affected are ever in question, if any.</div>

  <h2>Why emissions-intact calibration lowers the risk further</h2>
  <p>Because our calibrations leave emissions hardware and monitors in place and
  change parameters within the factory hardware envelope, the surface area for a
  causation argument is narrow and documented. Every vehicle receives a serialized
  Certificate of Calibration recording exactly what was applied.</p>

  <h2>Who stands behind the calibration</h2>
  <p>The calibration itself is authored by Overland Tailor Tuning (OTT) and applied by
  Tuned Yota's authorized installers. <span class="owner-input">{{OWNER: reproduce OTT's written calibration warranty / support terms verbatim and accurately here}}</span></p>

  <div class="callout"><strong>What this document is not.</strong> This is educational
  information to reduce uncertainty — it is not legal advice, not a warranty, and not a
  promise that any particular claim will be paid. Customers should review their own
  vehicle warranty terms.</div>

  <div class="foot">Educational summary for dealer partners. Final wording subject to legal review. Tuned Yota · tunedyota.com</div>
</div></body></html>
```

- [ ] **Step 2: Run the guardrail test**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/02-warranty-magnuson-moss.html
git commit -m "feat(dealer-kit): Magnuson-Moss warranty education one-pager (counsel-review draft)"
```

---

## Task 6: Process & Logistics sheet

**Files:**
- Create: `docs/marketing/dealer-kit/03-process-logistics.html`

- [ ] **Step 1: Write `03-process-logistics.html`**

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Process & Logistics — Tuned Yota</title>
<link rel="stylesheet" href="kit.css"></head>
<body><div class="page">
  <div class="brandbar"><span class="wordmark">TUNED YOTA</span>
    <span class="tag">How a Partnership Actually Works</span></div>
  <div class="eyebrow">Process &amp; Logistics</div>
  <h1>Zero capex, zero training, one point of contact.</h1>
  <p class="lead">You stock nothing and train no one. We bring the OTT authorization,
  tooling, and the mobile / service-area model to your customers.</p>

  <h2>How it flows</h2>
  <table>
    <tr><th>Step</th><th>What happens</th></tr>
    <tr><td>1. Referral</td><td>Your sales, F&amp;I, or service team flags an interested Toyota/Lexus owner.</td></tr>
    <tr><td>2. Schedule</td><td>The customer books through Tuned Yota; we coordinate around your calendar. Turnaround: <span class="owner-input">{{OWNER: typical turnaround}}</span>.</td></tr>
    <tr><td>3. Service</td><td>Work is performed <span class="owner-input">{{OWNER: where — mobile at dealer / at customer / at event}}</span>, emissions intact.</td></tr>
    <tr><td>4. Document</td><td>Serialized Certificate of Calibration issued and emailed on completion.</td></tr>
    <tr><td>5. Settle</td><td>Revenue share / referral fee reconciled per the agreed schedule.</td></tr>
  </table>

  <h2>Commercials</h2>
  <ul>
    <li>Referral fee / revenue share: <span class="owner-input">{{OWNER: T1 referral economics}}</span></li>
    <li>F&amp;I menu placement (Tier 2): <span class="owner-input">{{OWNER: rev-share on menu sales}}</span></li>
    <li>Payment flow: <span class="owner-input">{{OWNER: how/when the dealer is paid}}</span></li>
  </ul>

  <h2>Coverage &amp; contact</h2>
  <p>We cover Minnesota, Iowa, Wisconsin, North Dakota, South Dakota, and Nebraska
  through a regional installer network. Your dealer contact:
  <span class="owner-input">{{OWNER: rep name + phone + email}}</span>.</p>

  <div class="foot">Insurance (COI) available on request. Tuned Yota · tunedyota.com</div>
</div></body></html>
```

- [ ] **Step 2: Run the guardrail test**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/03-process-logistics.html
git commit -m "feat(dealer-kit): process & logistics sheet"
```

---

## Task 7: Scope-Boundary sheet

**Files:**
- Create: `docs/marketing/dealer-kit/04-scope-boundary.html`

- [ ] **Step 1: Write `04-scope-boundary.html`**

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Scope Boundary — Tuned Yota</title>
<link rel="stylesheet" href="kit.css"></head>
<body><div class="page">
  <div class="brandbar"><span class="wordmark">TUNED YOTA</span>
    <span class="tag">Complementary, Not Competitive</span></div>
  <div class="eyebrow">Scope Boundary</div>
  <h1>We fill a gap your service drive isn't set up for.</h1>
  <p class="lead">Calibration is specialized work your technicians are not authorized or
  equipped to do. Partnering keeps those dollars in-network instead of walking to a
  random shop — without touching your existing revenue.</p>

  <table>
    <tr><th>Tuned Yota does</th><th>Tuned Yota does NOT</th></tr>
    <tr>
      <td><ul>
        <li>Emissions-intact engine &amp; drivability calibration (OTT).</li>
        <li>Magnuson supercharger sales, install, and matched calibration.</li>
        <li>Turbo Performance Calibration for supported platforms.</li>
        <li>Serialized documentation and certificates.</li>
      </ul></td>
      <td><ul>
        <li>Compete with your parts, accessories, or service menu.</li>
        <li>Perform factory warranty or recall work.</li>
        <li>Touch or defeat emissions hardware or monitors.</li>
        <li>Sell products that would jeopardize your franchise standing.</li>
      </ul></td>
    </tr>
  </table>

  <div class="callout">The result: a new enthusiast-facing profit line on truck
  deliveries and in the service lane, with none of the operational or compliance
  overhead on your side.</div>

  <div class="foot">Tuned Yota · tunedyota.com</div>
</div></body></html>
```

- [ ] **Step 2: Run the guardrail test**

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/04-scope-boundary.html
git commit -m "feat(dealer-kit): scope-boundary sheet"
```

---

## Task 8: 15-minute walkthrough talk-track

**Files:**
- Create: `docs/marketing/dealer-kit/walkthrough.md`

- [ ] **Step 1: Write `walkthrough.md`**

```markdown
# Dealer Partner Kit — 15-Minute Walkthrough (internal)

Rep talk-track for dropping the kit. Goal of the visit: leave the folder, book a
follow-up, and start ONE low-commitment referral (Tier 1). You are selling certainty,
not horsepower. If their first impression is "these people are more organized about
compliance than we are," you've done the job.

## Before you walk in
- Know which department you're pitching (Sales/F&I moves fastest; then Service; then Used).
- Have the COI and a serialized sample certificate ready to show.
- If this is a multi-store group, ask for the group-level decision-maker, not just the store.

## The 15 minutes
1. **(2 min) Frame.** "I'm not here to sell you horsepower. I'm here to show you the most
   documented, compliant way your truck buyers can get a professional calibration — with
   the paperwork that keeps it off your desk as a problem." Hand over the **cover**.
2. **(3 min) Disarm the big fear.** Walk the **Compliance Statement** — the list of what we
   never touch, no defeat devices — then the **Magnuson-Moss** page. Stress: education, not
   a guarantee; emissions intact narrows the risk.
3. **(3 min) Show it's real.** COI, OTT Authorized Installer, and a **sample certificate**.
   "Every single job looks like this and is retrievable."
4. **(3 min) Make it easy.** Walk the **Process** sheet: zero capex, zero training, one
   contact, revenue share. Then the **Scope Boundary**: complementary, never competitive.
5. **(2 min) The small ask.** "Start at referral. Point me at a couple of interested truck
   owners, I document every one, and I bring you a one-page recap: jobs, revenue, zero
   comebacks. That recap decides whether we do more."
6. **(2 min) Close the loop.** Book the follow-up. Leave the folder.

## Objection quick-reference
- *"Corporate wouldn't like it."* — Acknowledge it's real; emphasize emissions-intact and
  documented; offer to start at referral only. (Family/independent stores own this decision.)
- *"Does it void the warranty?"* — The Magnuson-Moss page. Burden is on the warrantor to tie
  a failure to the mod; emissions intact; education, not a promise.
- *"Who backs the tune?"* — OTT authors it; we apply and document it; point to OTT's terms.
- *"Where's the work done?"* — The Process sheet's service-area/mobile model. Be concrete.

## After the visit
- Log the dealer's stage in the pipeline (Prospect → Contacted → Kit Sent → Pilot → Active).
- One champion per zone, then prove ROI before expanding.
```

- [ ] **Step 2: Run the guardrail test** (walkthrough.md is scanned too)

Run: `node --test tests/dealer-kit-guardrails.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/dealer-kit/walkthrough.md
git commit -m "feat(dealer-kit): 15-minute walkthrough talk-track"
```

---

## Task 9: Render + full-suite verification

- [ ] **Step 1: Render the kit to PDFs**

Run: `npm run render:dealer-kit`
Expected: `✓ 00-cover.pdf` … `✓ 04-scope-boundary.pdf` and `Rendered 5 artifact(s) → …dealer-kit-exports`.
(If no Chrome/Edge is present, note it — the HTML sources are still the source of truth and render on any machine with Chrome.)

- [ ] **Step 2: Eyeball one PDF**

Open `assets-source/dealer-kit-exports/01-compliance-statement.pdf` and confirm: US-Letter, the diagonal DRAFT watermark, the red counsel banner, and highlighted `{{OWNER: …}}` tokens are all visible.

- [ ] **Step 3: Run the whole repo suite**

Run: `npm test`
Expected: all tests pass, including `dealer-kit-guardrails` (now over all 6 artifacts).

- [ ] **Step 4: Commit** (no code change if clean, but confirm nothing is uncommitted)

```bash
git status
```
Expected: clean working tree (PDF exports are gitignored). If `.gitignore` needed a change in Task 1, it was already committed there.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** cover/index (Task 3) · compliance statement (Task 4) · Magnuson-Moss draft with watermark (Task 5) · process sheet with owner-input fields (Task 6) · scope boundary (Task 7) · walkthrough (Task 8) · branded HTML→PDF via existing render pattern (Task 1) · brand guardrails enforced (Task 2). All Part A spec sections map to a task.
- **Owner-input discipline:** every unknown value is a literal, highlighted `{{OWNER: …}}` token — nothing fabricated (rev-share, turnaround, contact, COI, OTT warranty terms, CARB wording).
- **Legal safety:** artifacts 1 and 2 carry `body.draft` + the counsel banner, asserted by the Task 2 test; copy is framed as education, never guarantee/indemnity.
- **Guardrails:** the Task 2 scanner runs after every content task, so a forbidden term can never slip into a later commit.
```

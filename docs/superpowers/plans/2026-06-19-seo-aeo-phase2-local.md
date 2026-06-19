# Phase 2 — Local Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Win local/geo queries ("Toyota/Lexus engine tuning in <state>") with 6 distinct state landing pages + local schema + on-page reframes, plus two off-site playbooks the owner executes (Google Business Profile + reviews/citations).

**Architecture:** Static HTML site. Each state page reuses the Phase-1 content-page chrome and AEO structure, differentiated by real cities + installer from `netlify/functions/lib/markets.js`. Pages register in `HEAD_PAGES` so `build:seo` injects OG/business-stub + sitemap and `tests/seo.test.js` validates them. Two `docs/seo/` markdown playbooks cover the off-site work. Built on the `seo-aeo-pages` branch (carries the OG-encode fix the `&`-in-title state pages need).

**Tech Stack:** Static HTML + inline JSON-LD; `scripts/build-seo.mjs`; `node:test`.

---

## File Structure

- `docs/seo/gbp-setup.md` — **new.** Google Business Profile setup checklist (owner executes).
- `docs/seo/local-playbook.md` — **new.** Reviews / citations / NAP / community playbook (owner executes).
- `site/toyota-lexus-tuning-{minnesota,iowa,wisconsin,north-dakota,south-dakota,nebraska}.html` — **new (6).** State landing pages (I draft, owner verifies facts).
- `scripts/lib/seo-data.mjs` — **edit.** Add the 6 slugs to `HEAD_PAGES`.
- `site/index.html` — **edit.** Add a "Where we tune" section linking the 6 state pages.
- `site/toyota-tundra-ott-tune.html` — **edit.** Reframe sentence + links (the worked example for the geo-query gap; peers optional).
- `site/sitemap.xml` — **regenerated.**

**Per-state data (the differentiator — from `markets.js`):**

| Slug suffix | State | Cities | Installer(s) |
|---|---|---|---|
| minnesota | Minnesota | Duluth, Twin Cities, Mankato, Rochester | Aaron Groshong |
| wisconsin | Wisconsin | Eau Claire, Green Bay, Madison, Milwaukee | Aaron Groshong & Noah Kreis |
| iowa | Iowa | Des Moines, Cedar Rapids, Davenport | Aaron Groshong |
| north-dakota | North Dakota | Fargo | Aaron Groshong |
| south-dakota | South Dakota | Rapid City, Sioux Falls | Cody Star |
| nebraska | Nebraska | Omaha | Cody Star |

---

### Task 1: Off-site playbooks (ship immediately, no dependency)

**Files:** Create `docs/seo/gbp-setup.md`, `docs/seo/local-playbook.md`

- [ ] **Step 1: Write `docs/seo/gbp-setup.md`**

```markdown
# Google Business Profile — setup (service-area business)

This is the single biggest lever for "...in <state>" geo queries. Tuned Yota has no
storefront, so set it up as a **service-area business** (no address shown publicly).

## Create / claim
1. google.com/business → **Add your business** → name **Tuned Yota**.
2. Business type: **Service business** (no storefront). When asked for an address,
   enter the operating address but **check "I deliver goods/services to customers"**
   and set it to **hide the address**.
3. **Service areas:** add your event cities — Duluth, Twin Cities, Mankato, Rochester,
   Eau Claire, Green Bay, Madison, Milwaukee, Des Moines, Cedar Rapids, Davenport,
   Fargo, Rapid City, Sioux Falls, Omaha.

## Fill out (match the website exactly — NAP consistency)
- **Name:** Tuned Yota · **Phone:** (612) 406-7117 · **Email:** info@tunedyota.com · **Site:** https://tunedyota.com
- **Primary category:** Auto tuning service (or "Car repair and maintenance" if unavailable).
- **Secondary:** Auto parts store / Auto repair shop as relevant.
- **Services:** OTT Tune calibration; Magnuson supercharger sales/install/calibration; custom calibration.
- **Description:** reuse the homepage description (Toyota & Lexus OTT tuning + Magnuson supercharger, VFTuner PRO Tuner, Upper Midwest, emissions-intact).
- **Hours:** "By appointment" / event-based.
- **Photos:** logo, installer headshots (already on site), event/install photos, vehicle results.

## Verify
- Complete Google's verification (postcard/phone/video as offered). Until verified, the profile won't rank.

## Reviews (do this every event)
- After each event, text/email the customer your review link. Aim for steady, recent reviews mentioning the **vehicle + city** ("Tundra tuned in Madison").
- Respond to every review.

## Maintain
- Post updates (event dates, new platforms). Re-check NAP matches the site after any change.
```

- [ ] **Step 2: Write `docs/seo/local-playbook.md`**

```markdown
# Local + AI-visibility playbook (off-site)

On-site pages make you *eligible*; off-site corroboration is what makes Google rank
you locally and AI engines *name* you. These are owner/team actions.

## NAP consistency (do first)
Use the exact same Name / Phone / Email everywhere: **Tuned Yota · (612) 406-7117 ·
info@tunedyota.com**. Inconsistent NAP splits your local signal.

## Reviews (highest leverage)
- Google Business Profile reviews are the top local ranking + AI-trust signal.
- Ask at every event; make it one tap (saved review link). Target vehicle + city context.
- Also seed/keep Facebook recommendations.

## Citations / listings
- List consistently on: Bing Places, Apple Business Connect, Yelp, and 2-3 reputable
  auto/performance directories. Same NAP, same description.

## Community presence (the AI-citation driver)
- The questions you want to win ("improve 4Runner off-road performance", "Tundra tuning
  in WI") are answered by AI from forums, Reddit, and YouTube. Be present, helpfully:
  - Your **Midwest Tuning Group** (FB) — post results, before/after, event recaps.
  - Toyota / overland forums and r/4Runner, r/ToyotaTacoma — answer questions genuinely
    (no spam); a real expert presence is what gets cited.
  - **YouTube** — title videos as the questions ("Toyota Tundra OTT tune — before/after"),
    since AI and Google pull video.

## Measure
- Monthly, run your target prompts in ChatGPT / Perplexity / Gemini and Google, note
  whether Tuned Yota appears and for which queries. (Phase 3 can automate this.)
```

- [ ] **Step 3: Commit**

```bash
git add docs/seo/gbp-setup.md docs/seo/local-playbook.md
git commit -m "docs(seo): off-site playbooks — GBP setup + reviews/citations/community"
```

---

### Task 2: Build the 6 state landing pages

Each page reuses the **exact chrome** from a Phase-1 content page (`site/ott-tune-cost.html`): copy its `<head>` styles, Meta Pixel, `<header class="snav">`, the FAQ-toggle `<script>`, and `<footer class="sfoot">` **byte-identical**. Only the head meta + 3 JSON-LD blocks + the `.lp` body differ. Do NOT hand-add the `SEO:OG`/`SEO:BUSINESS` blocks — `build:seo` injects them.

**Head (per state — `<STATE>`, slug `<SLUG>`):**
- `<title>Toyota & Lexus Engine Tuning in <STATE> | Tuned Yota</title>`
- `<meta name="description" content="Professional Toyota & Lexus engine tuning across <STATE> — <CITIES>. In-person OTT calibration and Magnuson supercharger work by a licensed VFTuner PRO Tuner. See pricing and book.">`
- `<link rel="canonical" href="https://tunedyota.com/<SLUG>">`
- **Service** JSON-LD: `@id` `…/<SLUG>#service`, `serviceType` "Toyota & Lexus OTT Tune Calibration in <STATE>", `provider` `{"@id":"https://tunedyota.com/#business"}`, `areaServed` = `[{"@type":"State","name":"<STATE>"}, {"@type":"City","name":"<City1>"}, …]`, `offers` `{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":"400","highPrice":"950"}`, description naming the cities + installer.
- **FAQPage** JSON-LD mirroring the visible accordion (below).
- **BreadcrumbList**: Home → `/ott-tune` "OTT Tune" → "<STATE>".

**Body (`.lp`):**
```html
<div class="lp">
  <div class="lp-eyebrow">Toyota & Lexus Tuning · <STATE></div>
  <h1>Toyota &amp; Lexus Engine Tuning in <STATE></h1>
  <div class="lp-answer">Tuned Yota brings professional Toyota and Lexus engine tuning to <STATE> — in person at events in <CITIES>. Every OTT calibration is built by a licensed VFTuner PRO Tuner, keeps factory emissions fully intact, and starts from $400. Your <STATE> installer is <INSTALLER>.</div>
  <div class="lp-cta">
    <a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a>
    <a class="btn outline" href="tel:+16124067117">Call / Text (612) 406-7117</a>
  </div>

  <h2>Where we tune in <STATE></h2>
  <p style="font-size:15px;line-height:1.65">Tuned Yota runs in-person tuning events across <STATE>: <CITIES>. Pick your city and the next event date in <a href="find-your-exact-tune.html" style="color:var(--brown);font-weight:700">Find Your Exact Tune</a>.</p>

  <h2>What we tune</h2>
  <ul class="lp-bul" style="list-style:none;display:grid;gap:9px;margin-top:6px;font-size:14.5px;line-height:1.5">
    <li>OTT Tune calibration for supported Toyota &amp; Lexus platforms (drivability, shifting, gear hunting, towing, larger tires)</li>
    <li>Magnuson supercharger sales, install, and calibration on supported platforms</li>
    <li>Custom calibration and factory-turbo performance tuning where supported</li>
  </ul>

  <h2>Your <STATE> installer</h2>
  <p style="font-size:14.5px;line-height:1.6"><strong><INSTALLER></strong> covers <STATE>. <INSTALLER_LINE></p>

  <div class="lp-book">
    <h2>Get your <STATE> price</h2>
    <p>Find Your Exact Tune shows your exact starting price and the next event near you. Prefer to talk? Call or text (612) 406-7117.</p>
    <a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a>
  </div>

  <h2><STATE> tuning FAQ</h2>
  <!-- 4 lp-fq blocks mirroring the FAQPage schema below -->

  <div class="lp-links">
    <strong>Explore:</strong><br>
    <a href="ott-tune.html">What is the OTT Tune?</a><a href="ott-tune-cost.html">OTT Tune cost</a><a href="is-the-ott-tune-worth-it.html">Is it worth it?</a><a href="find-your-exact-tune.html">Find Your Exact Tune</a>
  </div>
  <div class="lp-final"><a class="btn primary" href="find-your-exact-tune.html">Find Your Exact Tune →</a></div>
  <p class="lp-disc">In-person tuning at scheduled events; dates and availability vary — confirm in Find Your Exact Tune. Supported years, engines, and features vary by platform. All vehicles must retain fully intact, federally compliant emissions systems.</p>
</div>
```

**FAQ (4 Q&A, visible accordion + FAQPage schema identical), per state:**
- "Where can I get my Toyota or Lexus tuned in <STATE>?" → "Tuned Yota runs in-person tuning events across <STATE>, including <CITIES>. Pick your city and date in Find Your Exact Tune."
- "Which <STATE> cities do you serve?" → "<CITIES>."
- "How much does an OTT Tune cost in <STATE>?" → "From $400 depending on platform; see the cost page or Find Your Exact Tune for your exact price."
- "Is the tune emissions-legal?" → "Yes. Factory emissions systems stay fully intact and every calibration is 5-gas verified, EPA-compliant in every state."

`<INSTALLER_LINE>` (drafted, owner verifies) — pull a one-line bio from `site/team.html` for that installer; e.g. Aaron = "Founder of Tuned Yota and a licensed VFTuner PRO Tuner."; Noah = "Licensed VFTuner PRO Tuner with 8 years across EcoBoost, LS, and BMW platforms."; Cody = "Toyota master technician and licensed VFTuner PRO Tuner."

- [ ] **Step 1:** Create `site/toyota-lexus-tuning-wisconsin.html` from the template with the Wisconsin row (cities: Eau Claire, Green Bay, Madison, Milwaukee; installers: Aaron Groshong & Noah Kreis — name both in the installer section). Verify the visible FAQ text matches the FAQPage JSON-LD verbatim.
- [ ] **Step 2:** Repeat for `minnesota`, `iowa`, `north-dakota`, `south-dakota`, `nebraska` using their rows from the data table. Each must use its **real cities + installer** (not boilerplate with the state swapped).
- [ ] **Step 3:** Commit.

```bash
git add site/toyota-lexus-tuning-*.html
git commit -m "feat(seo): 6 state tuning landing pages (local geo-query targets)"
```

---

### Task 3: Wire the pages in

**Files:** Modify `scripts/lib/seo-data.mjs`, `site/index.html`, `site/toyota-tundra-ott-tune.html`

- [ ] **Step 1: Register in `HEAD_PAGES`.** In `scripts/lib/seo-data.mjs`, add to the `HEAD_PAGES` array:

```js
  "toyota-lexus-tuning-minnesota.html","toyota-lexus-tuning-iowa.html","toyota-lexus-tuning-wisconsin.html","toyota-lexus-tuning-north-dakota.html","toyota-lexus-tuning-south-dakota.html","toyota-lexus-tuning-nebraska.html",
```

- [ ] **Step 2: Add the homepage "Where we tune" section.** In `site/index.html`, after the `#guides` section's closing `</section>`, add:

```html
  <section class="sec" id="where-we-tune">
    <h2>Where we tune</h2>
    <p class="lead">In-person Toyota &amp; Lexus tuning at events across the Upper Midwest.</p>
    <div class="v-grid"><a class="v-card" href="toyota-lexus-tuning-minnesota.html"><span class="vm">Minnesota</span><span class="vp">MN</span></a><a class="v-card" href="toyota-lexus-tuning-wisconsin.html"><span class="vm">Wisconsin</span><span class="vp">WI</span></a><a class="v-card" href="toyota-lexus-tuning-iowa.html"><span class="vm">Iowa</span><span class="vp">IA</span></a><a class="v-card" href="toyota-lexus-tuning-north-dakota.html"><span class="vm">North Dakota</span><span class="vp">ND</span></a><a class="v-card" href="toyota-lexus-tuning-south-dakota.html"><span class="vm">South Dakota</span><span class="vp">SD</span></a><a class="v-card" href="toyota-lexus-tuning-nebraska.html"><span class="vm">Nebraska</span><span class="vp">NE</span></a></div>
  </section>
```

- [ ] **Step 3: Reframe the Tundra page.** In `site/toyota-tundra-ott-tune.html`, inside the booking/"How to book" paragraph (or the intro), add a sentence and link: `Looking for professional Toyota Tundra engine tuning in Wisconsin or the wider Upper Midwest? See <a href="toyota-lexus-tuning-wisconsin.html">Toyota &amp; Lexus tuning in Wisconsin</a> and <a href="ott-tune-cost.html">OTT Tune pricing</a>.` (Place it in the `.lp-book` or `.lp-links` area; keep it natural.)

- [ ] **Step 4: Commit.**

```bash
git add scripts/lib/seo-data.mjs site/index.html site/toyota-tundra-ott-tune.html
git commit -m "feat(seo): register state pages in HEAD_PAGES + homepage 'Where we tune' + Tundra reframe"
```

---

### Task 4: Generate, validate, verify

- [ ] **Step 1: Run the generator.**

Run: `npm run build:seo`
Expected: `seo build complete`; the 6 state slugs appear in `site/sitemap.xml` (`grep -c 'toyota-lexus-tuning' site/sitemap.xml` → 6); OG titles single-encoded (the `&` fix).

- [ ] **Step 2: Full suite.**

Run: `npm test`
Expected: all pass — `tests/seo.test.js` validates each new page (canonical, OG, single `#business`, breadcrumb resolves to `/ott-tune`, JSON-LD parses).

- [ ] **Step 3: Idempotency + spot-check.**

Run: `npm run build:seo` again → `git status --short` shows no new tracked changes. Spot-check `site/toyota-lexus-tuning-wisconsin.html` has the business stub + OG injected and the breadcrumb points at `/ott-tune` (not `/services`).

- [ ] **Step 4: Owner verify + ship.**

The state pages are drafted; the owner verifies the installer lines and any local claims, then ship via the `ship` skill (push `master`, confirm Netlify `ready`, Rich Results Test on one state page). Hand the owner `docs/seo/gbp-setup.md` and `docs/seo/local-playbook.md`.

---

## Self-Review

**Spec coverage:**
- 6 distinct state pages (cities + installer per `markets.js`) → Task 2 + data table. ✓
- Local schema (`Service`/`FAQPage`/`BreadcrumbList`, `areaServed` cities) → Task 2 head. ✓
- On-page reframes + "Where we tune" internal links → Task 3. ✓
- `HEAD_PAGES`/sitemap registration + validation → Tasks 3–4 (seo.test.js auto-validates). ✓
- GBP checklist + reviews/citations playbook → Task 1. ✓
- No hardcoded event dates (link finder) → Task 2 body/FAQ. ✓
- Owner-verify content model → Task 4 step 4. ✓

**Placeholder scan:** `<STATE>`/`<CITIES>`/`<INSTALLER>`/`<SLUG>`/`<INSTALLER_LINE>` are explicit template tokens filled from the data table + the team-bio note — not gaps. Every off-site doc and the page template have complete content.

**Type/name consistency:** `HEAD_PAGES`, the `#business` `@id`, the 6 slugs, `Service`/`FAQPage`/`BreadcrumbList`, and the `/ott-tune` breadcrumb match the existing `seo-data.mjs`/`seo.test.js`/`build-seo.mjs` conventions and the Phase-1 pages.

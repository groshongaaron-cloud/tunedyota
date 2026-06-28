---
name: add-dyno-proof
description: Use when adding a dyno chart or real performance proof (stock-vs-OTT or supercharger HP/torque results) to a Tuned Yota page — a vehicle OTT-tune page, the Magnuson supercharger guide, or the "is it worth it" page.
---

# Adding Dyno Proof to a Page

## Overview

Real Dynojet charts are Tuned Yota's strongest conversion asset — proof out-converts
claims. The raw charts live in the **gitignored `assets-source/`** media library (per
platform, split `NA/` vs `SC/`); only the specific chart you feature gets curated into the
**published** `site/images/dyno/`. The job: pick the chart, **confirm the numbers**, embed
it with `ImageObject` schema, and ship — without the four traps below.

## The traps that bite

1. **FAQ / schema desync.** If you put a number in a visible FAQ answer, you MUST update the
   matching `FAQPage` JSON-LD in `<head>` verbatim. Mismatched FAQ markup is a Google
   penalty. Easiest safe path: **don't touch the FAQ accordions** — put numbers in the
   answer-first, a table, or a "Real dyno results" section instead.
2. **Dumping the raw library.** Everything under `site/` publishes. The `assets-source/`
   library (videos, competitor "Truth Be Told" sheets, other platforms) must stay
   gitignored and out of `site/`. **Copy only the one chart** you feature.
3. **Publishing unconfirmed numbers.** A dyno graph reads imprecisely and the figures become
   public performance claims. **Get owner sign-off on the exact numbers + framing first**,
   and always include "results vary by build, fuel & mods."
4. **Committing build:seo churn.** `npm run build:seo` bumps every `sitemap.xml` lastmod and
   rewrites the state pages (line-endings). Stage **only** your page + the new dyno image.

## Steps

1. **Pick the chart** from `assets-source/<Vehicle (Gen)>/{NA,SC}/…png`. Read the image and
   pull peak HP/torque for each curve (stock vs OTT, or stock vs supercharged). For
   supercharger charts, **confirm the blower brand** (Magnuson vs other) before labeling —
   the Magnuson guide is Magnuson-specific.
   - **No `assets-source/` folder for this model?** Do NOT fabricate. Check whether its
     engine is a **shared platform** with a model that does have a chart (e.g. Sequoia /
     Land Cruiser **5.7L V8 = 2G Tundra**; the **4.0L V6** is shared across Tacoma / 4Runner
     / FJ Cruiser). If so, reuse that chart, **label it honestly everywhere** ("5.7L V8 ·
     Sequoia/Tundra shared platform · pull run on a Tundra"), name the copied file for *this*
     model (`sequoia-5.7-stock-vs-ott-dyno.png`), and **surface the reuse for owner sign-off**.
     If no shared chart exists either, skip and tell the owner — never invent a chart.
2. **Confirm with the owner** the exact numbers and how to frame them. NA OTT tunes show
   *modest peak HP* — lead with **torque / midrange / drivability**, not a small HP delta.
   Apply [[brand-rules-locked]] (no "Stage 2/3"/"MAF"; turbo tier = "Turbo Performance
   Calibration"; emissions-intact).
3. **Curate** the chosen chart into `site/images/dyno/` with a clean kebab name:
   `<vehicle>-<engine>-<na|stock-vs-ott|magnuson|supercharged>-dyno.png` (e.g.
   `tundra-5.7-magnuson-dyno.png`). `cp` it; leave the rest of `assets-source/` untouched.
4. **Embed** a `<figure>` near the relevant section: `<img src="images/dyno/<name>.png">`
   with **descriptive alt text** (vehicle + the before→after numbers), a `<figcaption>` that
   ends with **`· Dynojet, SAE5 · results vary by build, fuel & mods`** (the "results vary"
   disclaimer is required, not optional), and inline brand styles (`border:1.5px solid
   var(--line)`, radius, shadow). Fill any gain table; lead the answer-first/section with the
   headline number.
5. **Add `ImageObject` JSON-LD** in `<head>` (after the breadcrumb block):
   `{"@context":"https://schema.org","@type":"ImageObject","contentUrl":"https://tunedyota.com/images/dyno/<name>.png","caption":"…","creditText":"Overland Tailor Tuning"}`
   (use a `@graph` array for multiple charts).
6. **If you did edit a FAQ answer** — update its `FAQPage` JSON-LD entry to match exactly.
7. **Preview** (open the page locally or render) before shipping public claims.
8. **`npm run build:seo`** then confirm it did **not** alter your page beyond your edits
   (no meta change → no OG change). **`npm test`** (must stay green).
9. **Revert churn** — `git checkout -- site/sitemap.xml site/links.html site/toyota-lexus-tuning-*.html` — then stage only the page + the dyno image. Commit, **push `master`** (see [[ship]]). _(For a preview/validation run that is NOT shipping, leave the churn in place and flag it for the reviewer instead of reverting.)_
10. **Verify live** — `curl` the page for the new number, and confirm the image serves
    `HTTP 200` at `https://tunedyota.com/images/dyno/<name>.png`.

## Common mistakes

- **Edited an FAQ answer but not its `FAQPage` JSON-LD** → mismatched schema. Update both, or keep numbers out of the FAQ.
- **Copied a whole `assets-source/` subfolder into `site/`** → publishes videos/competitor sheets. Copy one file.
- **Published numbers without owner sign-off** or without "results vary" → overclaim risk.
- **Labeled a non-Magnuson supercharger chart "Magnuson"** on the Magnuson guide → inaccurate.
- **Fabricated a chart/numbers for a model with no `assets-source/` folder** → check for a shared-platform chart (e.g. Sequoia = Tundra 5.7 V8) and label it honestly, or skip. Never invent.
- **`git add .` after build:seo** → drags in sitemap/state-page churn. Stage only your two files.
- **Framed a modest NA peak-HP gain as a power claim** → underwhelms; lead with torque/drivability.

## Quick reference

pick chart (`assets-source/…`) → read + **confirm numbers/framing** → `cp` to `site/images/dyno/<clean-name>.png` → embed `<figure>` + alt + `ImageObject` schema (FAQ untouched, or sync both) → `npm run build:seo` → `npm test` → revert sitemap/state churn → stage page + image → push `master` → curl live + image 200.

Related: deploy flow in the [[ship]] skill; copy guardrails in the [[brand-rules-locked]] memory; the `assets-source/` library + curation rationale in the [[advertising-graphics-project]] memory.

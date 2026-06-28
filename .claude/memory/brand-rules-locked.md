---
name: brand-rules-locked
description: "Locked Tuned Yota copy/brand guardrails — no \"Kevin Whitman\", no \"Stage 2/3\" or \"MAF\" in customer-facing copy, turbo tier is \"Turbo Performance Calibration\", positioning stays emissions-intact"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e5319100-6ade-4bc9-95a6-c9423d101c2c
---

Owner-locked brand/copy rules (from `docs/seo/gbp-setup.md`, set 2026-06-28). Apply to
**all customer-facing copy and assets** — site pages, ad templates, GBP, social, emails,
certificates:

1. **No "Kevin Whitman"** anywhere (no name, photo, caption, or tag).
2. **No "Stage 2 / Stage 3" and no "MAF" terminology** in any customer-facing copy.
3. The turbo top tier is labeled **"Turbo Performance Calibration"** (not Stage 2/3).
4. Positioning stays **emissions-intact** (factory emissions fully intact, 5-gas verified,
   EPA-compliant; no CEL defeat — consistent with [[search-ai-visibility-program]] and the
   warranty page).
5. The OTT calibration is **"installed by Tuned Yota"**, never just **"by Tuned Yota"** —
   Overland Tailor Tuning (OTT) *authors* the calibration; Tuned Yota is the authorized
   *installer*. So titles/H1/schema read "… OTT Tune **installed by** Tuned Yota". EXCEPTION:
   **supercharger** copy keeps "by Tuned Yota" (Tuned Yota genuinely sells/installs/calibrates
   Magnuson as the authorized dealer). Applied site-wide 2026-06-28; the state-page generator
   (`build-state-pages.mjs`) was fixed too so regeneration doesn't revert it.

**Why:** owner-designated brand guardrails; violating them is off-brand and (for the
emissions framing) a compliance/credibility risk.

**How to apply:** before shipping any copy/graphic, grep for these terms. Verified
2026-06-28 the repo (site, vehicle pages, ad templates, docs) has **zero violations** —
keep it that way. Note: vehicle pages already use "factory-turbo performance calibration",
which is compliant.

---
name: advertising-graphics-project
description: Ad-graphics template system in docs/marketing/ad-templates/ (HTML→Chrome-screenshot). Owner did a full curation review 2026-07-15: keepers/winners noted, 4 families deleted, copy prefs set. Master plan at docs/marketing/master-advertising-plan.md
metadata: 
  node_type: memory
  type: project
  originSessionId: e5319100-6ade-4bc9-95a6-c9423d101c2c
---

Owner kicked this off 2026-06-27. **Master plan WRITTEN:**
`docs/marketing/master-advertising-plan.md` — the umbrella across all channels
(website, IG, FB + Midwest Tuning Group, **YouTube**, **TikTok**, GBP, email/SMS,
Reddit/forums, paid), the **ad-graphics template system** (brand tokens + 5 format
sizes + 10 template families), the shoot-once repurposing engine, the event-driven
campaign calendar (tied to `docs/events/2026-2027-event-plan.md`), measurement via the
existing UTM→Pixel→Funnel stack, and a 4-phase roadmap. It unifies (does not duplicate)
`docs/instagram-content-kit.md`, `docs/instagram-optimization.md`,
`docs/lead-generation-playbook.md`, `docs/seo/gbp-setup.md`.

**Template system BUILT (2026-06-29, commit 8c3db00):** all 10 families from the plan §3 now
exist as HTML→Chrome-screenshot templates in `docs/marketing/ad-templates/` — dyno-card,
event-flyer, vehicle-spotlight, testimonial (built earlier) + before-after, supercharger,
emissions-intact, where-we-tune, find-your-tune, countdown (added this session), each in 3
sizes (square 1080×1080 / story 1080×1920 / wide 1080×565) plus a youtube-thumbnail 1280×720.
Render with `node docs/marketing/ad-templates/render.js` → PNGs land in the gitignored
`assets-source/ad-exports/` (31 total). Also added `scripts/TUNEDYOTA_SHORTFORM_SCRIPT_PACK.md`
(7 VO + text-overlay short-form scripts). The Canva brand kit remains the owner-editable
companion to the HTML data-card generator. **Next:** owner inputs below; optional 1600×900
wide-hero size if needed for email/web banners.

## 2026-07-15 — owner curation review (full pass over the rendered library)
Owner reviewed every family and gave disposition. Applied in-session (edits + re-render). See also [[brand-rules-locked]].

**DELETED (source HTML + PNG both removed):**
- `youtube-thumbnail` — **NEVER produce this style again** (explicit).
- `testimonial` ×3 — later phase; will rebuild better.
- `supercharger` ×3 — rebuild later w/ proper Magnuson supercharger-lineup alignment. See [[magnuson-pricing-integration]].
- `emissions-intact` ×3 — removed entirely.

**KEEPERS — owner-approved styles for FUTURE campaigns (NOT the Carlson event):**
- `where-we-tune` ×3 — **WINNER**, reuse as-is in future.
- `vehicle-spotlight` ×3 — keeper; EDITED "emissions intact"→"real, drivable power".
- `dyno-card` ×3 — keeper for **specialty/future** use; improve later.
- `before-after` ×3 — like the concept; improve to pop more / drive clicks later. Left UNEDITED per owner.
- `find-your-tune` ×3 — great start; EDITED "Pick your rig"→"Pick your vehicle".
- `event-flyer` ×3 — EDITED (emissions chip→"Real, drivable power"/"Real power · sharper throttle"; rig→vehicle).
- `countdown` ×3 — kept + **REDESIGNED bolder/more urgent** per owner: added `--hot:#E85D2A` orange accent (pill eyebrow badge, glowing days number, solid-orange "roster filling" badge + hot CTA pill).

**Carlson event graphics** (`carlson-event-square/story`, one-off for Coon Rapids Jul 18) — owner LOVES them, "proceed to execution." Kept their "100% Emissions intact" chip (only place emissions chip survives). NOTE: live Meta campaigns use the PROVEN "Tacos & Tacomas" graphic instead (couldn't upload the new PNG — Meta's Ads Manager tool no longer accepts local file uploads via claude-in-chrome); owner can manually upload the carlson PNGs if they want them live. See [[carlson-toyota-meta-campaign]].

**COPY PREFERENCES (apply going forward):** (1) never use "rig" → always "**vehicle**"; (2) moving away from an explicit "Emissions intact" *chip/callout* as a lead — keep emissions-intact as brand positioning but replace the chip with benefit-forward statements ("Real, drivable power", "Real power · sharper throttle"). Brand rules still LOCKED — see [[brand-rules-locked]].

Seed/idea assets now live in `assets-source/Advertisement Ideas/` (1080×1920 + 1080×565
drafts for 3G Tacoma, 5G/6G 4Runner, Tundra, plus `5g4r Graphics` PNGs). The whole
`assets-source/` library is **gitignored and out of the published site** (moved there
2026-06-27 during the dyno-proof curation) — only curated, web-ready images go in
`site/images/`. Open owner inputs: channel set (stand up TikTok/YouTube now?), template
tool (Canva vs HTML-generated), who captures content at events, starting paid budget.

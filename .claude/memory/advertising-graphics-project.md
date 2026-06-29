---
name: advertising-graphics-project
description: IN PROGRESS — master advertising/content plan written (docs/marketing/master-advertising-plan.md); next is producing the ad-graphics templates. Source assets in assets-source/Advertisement Ideas
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

Seed/idea assets now live in `assets-source/Advertisement Ideas/` (1080×1920 + 1080×565
drafts for 3G Tacoma, 5G/6G 4Runner, Tundra, plus `5g4r Graphics` PNGs). The whole
`assets-source/` library is **gitignored and out of the published site** (moved there
2026-06-27 during the dyno-proof curation) — only curated, web-ready images go in
`site/images/`. Open owner inputs: channel set (stand up TikTok/YouTube now?), template
tool (Canva vs HTML-generated), who captures content at events, starting paid budget.

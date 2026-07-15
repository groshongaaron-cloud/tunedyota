# Tuned Yota — Ad-Graphic Templates

On-brand, editable HTML/CSS templates for the channels in
`docs/marketing/master-advertising-plan.md` (§3). Real proof on the data cards, the
**Tuned Yota fox** as the prominent brand anchor, brand tokens matched to `site/site.css`.
No AI imagery — real charts/photos + the brand's topographic motif.

## Template families
| File(s) | Purpose |
|---|---|
| `dyno-card*` | Dyno proof card — the live dyno results as a shareable graphic (specialty / future use) |
| `event-flyer*` | Event promo — city, date, slots, live QR to the booking URL |
| `vehicle-spotlight*` | Vehicle feature — real vehicle photo + "from $X" + proof |
| `before-after*` | Drivability before→after — gear hunting / throttle lag / busy shifts → fixed (no numbers, claims only) |
| `where-we-tune*` | 6-state footprint (MN·IA·WI·ND·SD·NE) + editable "next up" event cities (owner-favorite style) |
| `find-your-tune*` | Easy-CTA funnel — pick your vehicle → see your price → book, with live QR (no fabricated prices) |
| `countdown*` | Event-urgency card — bold orange urgency accent + "X days out" + city + date + roster-filling badge |
| `carlson-event-*` | One-off event graphic (Carlson Toyota · Coon Rapids · Jul 18) — partner co-brand + booking QR |

Owner curation (2026-07-15) removed the `testimonial`, `supercharger`, `emissions-intact`, and
`youtube-thumbnail` families (rebuild later, or never for youtube-thumbnail — per owner). Copy rules:
never "rig" → use "vehicle"; the "Emissions intact" chip is retired as a lead callout in favor of
benefit-forward lines (emissions-intact stays as brand positioning). Each remaining family ships in
three sizes below; the Canva brand kit remains the owner-editable companion.

## Sizes (suffix → dimensions)
- *(none)* / `-square` → **1080×1080** (IG/FB feed)
- `-story` → **1080×1920** (Story / Reel / TikTok / printable flyer)
- `-wide` → **1080×565** (link previews, FB shared link, website)
- `youtube-thumbnail` → **1280×720**

## Editing
Open any file — every changeable spot is marked `<!-- data: ... -->` (city, date, numbers,
vehicle photo, installer). Swap the `<img src>` to any real photo in `site/images/` or a
customer shot. The event-flyer QR is a live, scannable code — change the `data=` URL param
per city/UTM.

## Export to PNG (one command, headless Chrome)
```bash
node docs/marketing/ad-templates/render.js          # renders every template to assets-source/ad-exports/
```
…or screenshot the `.canvas` element in Chrome, or rebuild in Canva from these as the spec.
Exports land in `assets-source/` (gitignored) — only commit final picks you intend to publish.

## Rules of the system
- Fox mark is the anchor — header lockup + watermark/seal. Blue line-art (`#B3D0D9`).
- Fonts: Spectral (headlines), Spectral SC (eyebrows), Lato (body/900 bold).
- Dyno claims always carry "results vary by build, fuel & mods."
- Keep real proof real; the topo motif is the only "abstract" element.

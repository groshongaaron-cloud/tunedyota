# Tuned Yota — Ad-Graphic Templates

On-brand, editable HTML/CSS templates for the channels in
`docs/marketing/master-advertising-plan.md` (§3). Real proof on the data cards, the
**Tuned Yota fox** as the prominent brand anchor, brand tokens matched to `site/site.css`.
No AI imagery — real charts/photos + the brand's topographic motif.

## Template families
| File(s) | Purpose |
|---|---|
| `dyno-card*` | Dyno proof card — the live dyno results as a shareable graphic |
| `event-flyer*` | Event promo — city, date, slots, live QR to the booking URL |
| `vehicle-spotlight*` | Vehicle feature — real rig photo + "from $X" + proof |
| `youtube-thumbnail.html` | 1280×720 YouTube thumbnail |

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

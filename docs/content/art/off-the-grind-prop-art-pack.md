# Off the Grind — Prop & Character Art Production Pack

**Purpose:** Reusable, on-brand art for the service video series — the **product-prop layer** (build once, reuse everywhere) plus **topic-specific Rocky & Octane pose prompts**, matched to the established character style.
**Built:** 2026-08-06
**Character source (do not restyle):** `docs/brand/cast-bible.md`, `docs/brand/rocky/` , `docs/brand/octane/` (character briefs + concept-prompt-pack). Characters come from the established rig — props composite into their hands.

---

## 1. Shared Style Tokens (every asset must match)
Pulled from the character briefs so props sit in-frame with the characters:
- **Render:** bold clean outline, **flat cel shading**, Pixar-quality-but-grounded; professional master-tech energy, not a children's cartoon.
- **Palette:** TY orange `#E85D2A` · off-white `#F3EFEA` · earth/sage `#99A08E` / `#7c8472` · dark earth `#3A2E26` / `#2a221c` · UI blue `#B3D0D9`. (Rocky body = Lunar Rock 6X3 swatch-match; Octane body = Solar Octane 4W5 — never eyeball those two.)
- **Lighting:** soft key from upper-left, light fill from right (same on props so they composite cleanly).
- **Background:** **white** (or transparent) for every prop and character cutout.
- **Scale discipline:** props drawn to realistic in-hand scale so the same prop PNG drops into any video without resizing surprises.

---

## 2. Reusable Product Props (build ONCE, reuse across the series)
Each is a standalone cartoon object on white, no character. Render once, drop into any relevant video. **Trade-dress note:** these depict real AMSOIL products TY sells — render as a *stylized cartoon that reads as the product*, then **owner verifies the label/trade dress is recognizable and not misrepresented before use** (fact-based rule; confirm the SKU is actually stocked/linkable).

| ID | Prop | Used in | Generation prompt (white bg, flat cel, matches §1) |
|---|---|---|---|
| `prop-oil-ss0w20` | AMSOIL Signature Series 0W-20 motor oil bottle | Oil change | "Flat cartoon illustration of a quart bottle of AMSOIL Signature Series synthetic motor oil, dark bottle with a red cap and a predominantly red-and-white label reading 'AMSOIL', bold clean outline, flat cel shading, soft key light upper-left, white background, realistic hand-scale, no text distortion" |
| `prop-brakefluid` | AMSOIL DOT 3 & DOT 4 Synthetic Brake Fluid | Brake job | "Flat cartoon illustration of a small AMSOIL DOT 3/DOT 4 synthetic brake fluid bottle, dark bottle with yellow-capped spout and AMSOIL label, bold outline, flat cel shading, upper-left key light, white background, hand-scale" |
| `prop-severegear-9090` | AMSOIL SEVERE GEAR 75W-90 | Diff / gear fluid | "Flat cartoon illustration of an AMSOIL SEVERE GEAR 75W-90 synthetic gear lube bottle, dark bottle with an easy-pack style flexible spout, AMSOIL label, bold outline, flat cel shading, upper-left key, white background" |
| `prop-severegear-140` | AMSOIL SEVERE GEAR 75W-140 | Diff / gear fluid (LSD/tow) | Same as above, label reads 75W-140 |
| `prop-grease` | AMSOIL synthetic grease (cartridge) | Slide pins / chassis | "Flat cartoon grease cartridge tube, AMSOIL label, bold outline, flat cel shading, white background, hand-scale" |
| `prop-oilfilter` | AMSOIL EA oil filter | Oil change | "Flat cartoon spin-on oil filter canister, AMSOIL blue/white label, bold outline, flat cel shading, upper-left key, white background" |
| `prop-brakepad` | Brake pad (generic) | Brake job | "Flat cartoon disc-brake pad, steel backing plate with friction lining, bold clean outline, flat cel shading, upper-left key light, white background, hand-scale" |
| `prop-rotor` | Brake rotor/disc (generic) | Brake job | "Flat cartoon vented brake rotor/disc, front three-quarter angle, bold outline, flat cel shading, white background" |
| `prop-torquewrench` | Torque wrench | All service | "Flat cartoon click-type torque wrench with a socket, TY-orange handle accent (#E85D2A), bold outline, flat cel shading, upper-left key, white background" |
| `prop-fillpump` | Fluid fill/transfer pump | Gear/transfer/coolant | "Flat cartoon hand fluid-transfer pump, bold outline, flat cel shading, white background" |
| `prop-funnel` | Funnel | Fluids | "Flat cartoon funnel, TY-orange accent, bold outline, flat cel shading, white background" |

> The AMSOIL EA oil filter and all fluids are genuine TY-sold AMSOIL products (TY is an AMSOIL dealer). Brake pad/rotor are generic illustrative props — **do not** imply TY sells a specific pad SKU unless confirmed.

---

## 3. Topic-Specific Character Poses — Brake Pilot
On-model Rocky/Octane poses for `tundra-2nd-gen-front-brakes`. Prompts extend the existing concept-prompt-pack style; **render from the rig / hand to the character artist** (keep characters on-model — do not let a generic model invent a new fox).

| Scene | Prompt (append to the standard Rocky/Octane character description in `docs/brand/rocky|octane/concept-prompt-pack.md`) |
|---|---|
| 3D cold open | Rocky, confident master-tech hero pose, holding a **brake pad** (`prop-brakepad`) up in one paw like a presenter; Octane beside him a touch smaller, holding a torque wrench, eager expression. Both facing camera. |
| 2D body — parts intro | Rocky three-quarter, **brake pad** in one paw and **AMSOIL DOT 3/DOT 4 brake fluid** (`prop-brakefluid`) in the other, gesturing as if explaining. |
| 2D body — torque step | Octane focused, both paws on a **torque wrench** (`prop-torquewrench`) set on a caliper bolt; small "click" motion lines. |
| 2D body — fluid/bleed step | Octane at the brake reservoir holding **`prop-brakefluid`**, mid "Socket" gag beat. |
| 3D outro | Rocky + Octane, Rocky gesturing to a floating product card showing **`prop-brakefluid`** with "Order at TunedYota.com"; Octane gives a thumbs-up (always drawn smaller — "little buddy" rule). |

**Reusable pose set to commission for the whole series** (so future videos need only a prop swap): Rocky "presenter — holding [prop]", Rocky "explainer — two-hand gesture", Octane "wrenching on [component]", Octane "holding [fluid] at fill point", Duo "outro CTA with floating product card". Each renders once per prop via composition.

---

## 4. How to Render
Image generation uses Gemini (`gemini-2.5-flash-image`) via the design skill's `scripts/logo/generate.py --prompt "..."` (outputs to white background). **Blocker:** `GEMINI_API_KEY` is **not set** in this environment (`google-genai` IS installed). To render:

```bash
export GEMINI_API_KEY="<key from https://aistudio.google.com/apikey>"
# then, per prop:
python ~/.claude/skills/design/scripts/logo/generate.py \
  --prompt "<prop prompt from §2>" --style flat
```

Once a key is available, tell me and I'll batch-render all §2 props to `docs/content/art/props/` and iterate. Alternatively this pack hands directly to your 2D/3D artist — the prompts double as art-direction briefs.

---

## 5. Owner Decisions
- [ ] Provide `GEMINI_API_KEY` for in-house render, OR route this pack to the character artist.
- [ ] Confirm AMSOIL product renders are trade-dress-accurate enough (or supply reference photos of each bottle for the artist).
- [ ] Confirm which props map to TY-orderable SKUs (all AMSOIL fluids/filter = yes; brake pad/rotor = decide).

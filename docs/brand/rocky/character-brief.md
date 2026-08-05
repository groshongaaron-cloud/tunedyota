# Rocky — 3D Character Build Brief

**For:** 3D artist / AI concept tool operator
**Status:** Awaiting owner sign-off (see checklist at bottom)
**Related spec:** `docs/superpowers/specs/2026-08-05-rocky-fox-mascot-design.md`

---

## Identity

**Name:** Rocky
**Form:** Stylized 3D red fox — Pixar-ish proportions, expressive but grounded. Not a cartoon mascot; not hyper-realistic. Lands in the "confident, tech-savvy character" zone.
**Role:** Calm master-tech mentor. The tech who has done this job 500 times and makes it feel manageable. Never goofy, never condescending, never wide-eyed or clumsy.
**Program:** Host of Tuned Yota's AI how-to video series. Appears on-camera narrating procedure steps while accurate exploded-view diagrams appear on screen.

---

## Color of Record

**Body (primary fur):** Toyota Lunar Rock — paint code **6X3** (alt/sub-code 2QU; PPG reference 953058).

> **Texturing instruction:** Do NOT eyeball a hex for the body. Color-match off a physical Lunar Rock swatch or pull the PPG 953058 chip before applying the body fur texture. The exact working hex will be recorded from that swatch during asset build.

**Accent colors** — all pulled from the live TY brand palette, no invention:

| Area | Color | Hex |
|------|-------|-----|
| Ear insides, tail tip | TY orange | `#E85D2A` |
| Belly / chest | Off-white | `#F3EFEA` |
| Secondary fur / shadow tones | Earth sage | `#99A08E` / `#7c8472` |
| Deep shadow / trim accent | Dark earth | `#3A2E26` |
| UI lower-thirds, eye highlight | Light blue | `#B3D0D9` |

**Rationale:** The orange accents (ear insides + tail tip) let a gray-green Lunar Rock fox still read immediately as a fox at thumbnail size and pop on mobile screens. The belly off-white softens the contrast. Earth/sage tones support without competing. UI blue carries into on-screen text and lower-thirds.

---

## Wardrobe

- **Top:** TY shop shirt or shop apron — whichever layers cleaner over the fur for the shot. TY orange is the shirt/apron accent color; the TY wordmark appears on the chest.
- **Cap:** TY cap, worn forward. Fox ears should protrude through or around the cap in a natural-looking way (do not flatten them).
- **Hand prop slot:** Rocky holds one hand prop that changes per episode (torque wrench, trim panel tool, oil drain wrench, etc.). The prop is swappable — design the rig so the hand grip pose is a pose library entry, not baked into the base model.
- **No loose accessories** beyond cap + shirt/apron + hand prop. Keep the silhouette clean for small-screen legibility.

---

## Rig Requirements

The rigged model is the single durable asset reused across all episodes. Build it once, use it for years.

**Facial rig (lip-sync priority):**
- Full viseme set for TTS Ava-voice lip-sync. At minimum: A, E, I, O, U, M/B/P bilabial, F/V labiodental, TH, CH/SH, neutral/rest.
- Brow raise, brow furrow, brow independent L/R.
- Squint/eye narrow (explaining focus), wide eye (emphasis).
- Ear position controls (forward = engaged / alert; back = emphasis).

**Expression targets (minimum 6, see Expression Sheet):**
1. Neutral / idle (rest between lines)
2. Explain (slight head tilt, focused brow, mid-gesture)
3. Reassure ("you've got this" — soft brow, small nod)
4. Emphasis / confirm ("this is the critical step" — direct gaze, firm brow)
5. Caution / warning (before a safety note — slight brow furrow, eye contact)
6. CTA close (friendly, light smile, slight lean toward camera)

**Body / gesture poses (keyframe library entries, not baked):**
- Neutral A-pose (for turnaround renders — arms relaxed at sides, tool in non-dominant hand)
- Pointing at diagram (arm extended, finger or tool tip toward off-screen graphic)
- Holding tool upright to camera (demonstrating the tool / part)
- Light approving nod (loopable idle)
- Hands-together / explaining pose

**Technical rig spec:**
- Clean bone hierarchy, clearly labeled, with clear L/R naming.
- Facial controls accessible via a rig UI or clearly documented control objects.
- Export-friendly: deliverable in at minimum one of Blender native (.blend), FBX, or glTF/GLB with embedded rig.
- No baked-in cloth sim for the apron/shirt — use a lightweight secondary bone setup or a cloth simulation the artist can adjust per episode if needed.

---

## Deliverables

The following are required before the owner sign-off gate and before any episode production begins:

1. **Rigged model file** — the fully rigged Rocky in the chosen 3D toolchain format (at minimum: Blender .blend or FBX with skeleton + shape keys/morph targets intact).
2. **5-view turnaround render** — front, back, left, right, and 3/4 front-left — neutral A-pose, consistent studio lighting, transparent or white background. Delivered as 2000×2000 px minimum PNG per view.
3. **Expression sheet** — minimum 6 expressions rendered from the front in consistent lighting. Labels below each (Neutral, Explain, Reassure, Emphasis, Caution, CTA Close). Delivered as a single composite image (3000×2000 px minimum).
4. **Phone-legibility render** — Rocky from roughly chest-up, in the Explain pose, rendered at **1080×1920 px** (vertical / Reel-format). Used to verify the character reads and the face is expressive at real playback size on a phone screen.
5. **Color swatch record** — document the hex value derived from the 6X3 / PPG 953058 match so future artists can reference it without pulling the physical chip again.

---

## On-Model Owner Sign-Off Checklist

Complete this checklist against the delivered turnaround + expression sheet before any episode goes into production. Owner initials each item.

| # | Check | Pass / Fail | Owner initials |
|---|-------|-------------|----------------|
| 1 | Silhouette reads as a fox at 200×200 px thumbnail size | | |
| 2 | Body color matches Lunar Rock 6X3 — not orange, not gray, not generic tan | | |
| 3 | TY orange (`#E85D2A`) is present on ear insides and tail tip only | | |
| 4 | Off-white belly (`#F3EFEA`) is present and visible from front | | |
| 5 | TY shop wardrobe visible: shirt/apron + TY cap | | |
| 6 | Character does NOT look goofy, cartoonish, or incompetent | | |
| 7 | Character does NOT read as a copy/likeness of an existing mascot or real person | | |
| 8 | At least 6 distinct expressions are deliverable from the rig | | |
| 9 | Lip-sync viseme shapes are present and plausible at playback | | |
| 10 | 1080×1920 phone render: face is readable and expressive | | |
| 11 | Hand prop slot is swappable (not baked into base model) | | |

**Sign-off:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (owner) | Date: \_\_\_\_\_\_\_\_\_\_

> All items must pass before asset is used in production. If any item fails, note the specific issue and return to the artist with this checklist annotated.

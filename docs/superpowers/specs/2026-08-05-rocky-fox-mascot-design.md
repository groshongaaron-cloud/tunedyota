# Rocky — The Tuned Yota Fox Mascot & AI How-To Video Program — Design

Date: 2026-08-05
Status: Approved (brainstormed with owner), pending implementation plan

## Overview

Stand up **Rocky**, the Tuned Yota fox brought to life as a stylized-3D mascot,
and the AI-produced how-to video program he hosts. Rocky re-delivers the
knowledge from the scraped Viktor G Automotive Toyota repair library (148
guides) as TY-branded, AI-animated, AI-voiced episodes — each conveying the same
procedure, steps, and message as its source guide, but as **original TY media**
(original 3D animation, original TTS audio, TY's own on-screen wording).

Rocky is a natural extension of the existing brand identity: TY already uses a
**fox lockup and embossed fox seal** on the master certificate. This program
turns that static mark into an on-camera host.

Owner decision on record: the repair knowledge and procedures are not
proprietary; the owner controls final say. The build re-creates the *knowledge
and message* under TY's own expression rather than re-posting the source
creator's clips, voice, or verbatim scripts.

## Goals

1. **A durable, on-model mascot** — one Rocky, built once, identical across every
   video and reusable for years across TY marketing (not just video).
2. **Accurate how-to content at scale** — re-create the 148-guide knowledge base
   as branded episodes without ever inventing a part location or fabricating a
   spec.
3. **Wire into the existing machine** — reuse the locked A/V spec, the
   unlisted-until-approved gate, and the content-ops publish pipeline.
4. **Convert** — every episode ties to the matching TY parts SKU / booking CTA.

## Non-goals (YAGNI)

- Not building all 148 episodes in this work — Phase 0 is a single approved
  pilot; scaling is later phases.
- No re-posting, re-voicing, or verbatim re-scripting of the source creator's
  videos — knowledge only, original expression.
- No new voice talent — reuse the locked Ava education voice.
- No live-action shoot pipeline in this work (diagrams-from-reference format was
  chosen over filming each job).
- No new publishing/social infrastructure — reuse content-ops + the @tunedyota
  channel tooling.

## Locked decisions (from owner brainstorm 2026-08-05)

| Dimension | Decision |
|-----------|----------|
| Name | **Rocky** (plays off the Lunar Rock color) |
| Species / style | Stylized 3D red-fox mascot (Pixar-ish) |
| Body color | **Toyota Lunar Rock — paint code 6X3** (alt/sub-code 2QU; PPG 953058) |
| Personality | Calm, precise **master-tech mentor** — never goofy, never condescending |
| Voice | Locked **Ava education** register + TY caption / "re-gear" pronunciation rules |
| Wardrobe | **Shop tech** — TY shop shirt/apron + TY cap, holding the job's actual tool |
| On-screen format | Rocky hosts; procedure shown as **accurate exploded-view diagrams + part callouts traced from real reference frames** |
| Production method | **Build one real rigged 3D model once** (+ turnaround sheet + pose/expression library), reuse forever — zero drift |
| Content sourcing | Re-create knowledge/steps/message; original animation + TTS + wording |
| Pilot episode | **2007–2021 Tundra Front Brake Pads & Rotors** |

## Character bible

- **Name:** Rocky. **Form:** stylized 3D red fox, expressive but grounded.
- **Colorway (built from real TY brand colors, not invented):**
  - Body: Toyota Lunar Rock 6X3 — **color-matched off a real swatch / PPG 953058
    during asset build**, not an eyeballed hex.
  - Fox warmth accent: TY orange `#E85D2A` (ear insides, tail tip) so a
    gray-green fox still reads as a *fox* and pops on a phone.
  - Earth/sage support tones from the TY palette (`#99A08E`, `#7c8472`,
    `#3A2E26`), off-white belly (`#F3EFEA`), light-blue `#B3D0D9` for UI/lower-thirds.
- **Personality:** the tech who's done this 500 times and makes it feel easy.
  Patient, exact, reassuring.
- **Wardrobe/props:** TY shop shirt or apron + TY cap; holds the job's actual
  tool (torque wrench, trim tool) as a prop that reinforces the step on screen.
- **Voice:** Ava education register per the locked A/V spec; "re-gear" TTS
  spelling and TY caption rules applied.

## Episode anatomy

Maps to the existing **OFF THE GRIND** structure and caption spec. Target: short,
phone-first, with a longer YouTube cut.

1. **Cold open** — Rocky states the exact job + vehicle/years verbatim
   ("2007–2021 Tundra front brake pads and rotors").
2. **Parts & tools card** — links to the matching TY SKU(s).
3. **The fix** — Rocky narrates and gestures while the screen shows
   **accurate exploded-view diagrams and part callouts** traced from real
   reference frames (source video ID → extracted frames). The diagram carries
   the "where"; Rocky carries the "why/how".
4. **Torque / spec + safety beat** — owner/FSM-sourced, quoted verbatim; standard
   DIY safety disclaimer.
5. **CTA** — shop TY parts / book service / subscribe.

Every export: burned-in captions + `.srt` sidecar, per the locked spec.

## Production pipeline

### Build-once (Phase 0, one time)
- One rigged 3D Rocky model + turnaround sheet + expression/pose library +
  lip-sync setup. This is the durable asset every episode reuses. Color-matched
  to 6X3.

### Per-episode (repeatable)
1. **Source** the guide row from the enriched dataset (`Page URL`, `Title`,
   `Model`, `Year Range`, `Procedure`, `YouTube Video ID`).
2. **Extract reference frames** from the source video ID (accuracy anchor — the
   "verify media before scripting" discipline).
3. **Script** re-written in TY voice; **every spec re-verified** owner/FSM-sourced.
4. **Diagram assets** built/traced from the reference frames (never
   AI-invented part locations).
5. **Animate** Rocky + lip-sync from the locked rig.
6. **Voice** via the Ava AI VO register.
7. **Captions/`.srt`** generated.
8. **Branded export** (TY colorway, lower-thirds, endcard).
9. **Unlisted → owner approval gate.**
10. **Publish** through the content-ops watcher (YouTube + Reel/Short cut + site
    embed on the matching parts page).

## Dataset & marketing integration (feeds Sub-project 1)

- Source of truth: the enriched 148-row Toyota table
  (`viktorgautomotive-toyota-guides.{csv,json,xlsx}`), columns: Page URL ·
  Year Range · Model · Procedure · Title · YouTube Video ID · YouTube Watch URL ·
  Thumbnail.
- **Prioritization roadmap:** by model volume (Tundra 56; Sienna 35 + Sienna
  Hybrid 28 = 63; Prius/Prime 14; Camry 14; Tacoma 1) and by evergreen,
  conversion-linked jobs (brakes, oil, coolant) first.
- **Distribution:** each episode → YouTube + Reel/Short + site embed; playlists by
  model; cross-link to TY store SKUs (where how-to content converts).
- **SEO:** title patterns modeled on what already ranks in the segment.

## Accuracy & brand guardrails

- Diagrams **anchored to real reference frames** — never AI-invented geometry or
  part locations.
- Specs/torque values **owner or FSM-sourced, quoted verbatim** — never
  fabricated (per `spec-claim-rules`).
- Standard DIY safety disclaimer on every episode.
- Rocky stays **on-model** via the single rigged asset — no per-video
  re-generation.
- Ships original TY media only (animation/VO/wording) — not the source creator's
  clips, voice likeness, or verbatim scripts.

## Rollout (de-risk before scaling)

- **Phase 0 — Pilot:** build Rocky (rig + turnaround + palette match), then
  produce ONE full episode: **2007–2021 Tundra Front Brake Pads & Rotors**
  (high search, evergreen, converts to TY parts). Get it perfect and owner-approved.
- **Phase 1:** lock the episode template from the approved pilot; batch-produce
  the top ~15 Tundra/Sienna evergreen jobs.
- **Phase 2:** scale toward the full 148, model by model.

## Open items / deferred

- Exact working hex derived from the 6X3 / PPG 953058 match — set during asset
  build, verified against a swatch.
- Which 3D toolchain builds/rigs Rocky — implementation-plan detail.
- Sub-project 1 (full content-strategy roadmap) and Sub-project 3 (pipeline
  automation/tooling) get their own specs after the pilot proves the format.

## Related

- `docs/superpowers/specs/` — house spec pattern.
- Locked A/V spec, `@tunedyota` YouTube/Reels strategy, content-ops publish
  pipeline (memory: video-style-spec, youtube-campaign, ty-content-ops-automation).
- Enriched dataset: `viktorgautomotive-toyota-guides.{csv,json,xlsx}` (user home).
- Brand fox lockup / seal: `docs/brand/tuned-yota-master-certificate.html`.

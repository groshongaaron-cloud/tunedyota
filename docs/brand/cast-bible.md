# Tuned Yota — Cast & Brand Bible

Date: 2026-08-05
Status: Living reference for the Tuned Yota mascot cast

The Tuned Yota cast fronts the AI how-to video program and the brand's social
presence. Characters are an **original stylized-3D cartoon-mascot** style: bold
clean dark outline, flat cel shading, clean readable silhouettes.

## Naming & color system
Every character is **named and colored from the Toyota paint deck.** This is the
ownable device — clean, on-brand, and infinitely expandable.

| Character | Role | Toyota color | Code |
|-----------|------|--------------|------|
| **Rocky** | Master technician / mentor / host | Lunar Rock | **6X3** (alt 2QU; PPG 953058) |
| **Octane** | Eager apprentice / little buddy | Solar Octane Pearl | **4W5** (touch-up 00258-004W5-21) |
| _future_ | TBD | Cavalry Blue ("Cav"), Barcelona Red ("Barca")… | — |

Body colors are **matched off a real swatch / paint code — never an eyeballed hex.**

## Rocky
- **Role:** calm, precise master-tech mentor — "done this 500 times." Never goofy.
- **Voice:** locked **Ava education** register (TY caption + "re-gear" rules).
- **Body:** Lunar Rock 6X3; off-white muzzle/chest/tail-tip; dark boots/paws;
  **orange (`#E85D2A`) inner-ears** as the only warm accent.
- **Wardrobe:** dark Tuned Yota **hoodie** (fox-head logo + "Tuned Yota" script);
  states = **cap / no-cap / hood-up**.
- **Master:** `assets/rocky/canonical-concept-v2.png`
- **Kit:** `assets/rocky/wardrobe/rocky-hoodie-{nocap,hoodup}.png`,
  `assets/rocky/turnaround/{rocky-front,rocky-side-3q,rocky-back}.png`,
  `assets/rocky/expression-sheet.png`, plus the hosting pose set in `assets/rocky/poses/`.
- Full spec: `docs/superpowers/specs/2026-08-05-rocky-fox-mascot-design.md`,
  `docs/brand/rocky/concept-prompt-pack.md`, `docs/brand/rocky/character-brief.md`.

## Octane
- **Role:** eager, over-eager rookie apprentice; the **viewer-surrogate** who asks
  the questions so Rocky teaches. Never dumb — just green and excited.
- **Signature gag:** always grabs the **wrong-size socket** ("Socket") until Rocky
  hands him the right one.
- **Body:** Solar Octane 4W5 orange; off-white muzzle/chest; **tan tail tip**; dark paws.
- **Wardrobe:** junior Tuned Yota hoodie/tee + **backwards** cap; states = **cap / no-cap**.
- **RULES (owner):** **NO hood-up** for Octane. **Scale:** he is Rocky's *little*
  buddy — in any shared shot he is **noticeably smaller** (~chest height), never a
  same-height peer.
- **Master:** `assets/octane/octane-master-v1.png`
- **Kit:** `assets/octane/wardrobe/octane-nocap.png`,
  `assets/octane/turnaround/octane-{front,side,back}.png`,
  `assets/octane/expression-sheet.png`.
- Full brief: `docs/brand/octane/character-brief.md`.

## The dynamic
Two-hander: **Octane asks, Rocky teaches.** The banter carries the lesson and
doubles the short-form/skit material. Octane's over-eagerness (wrong socket,
over-torquing) is the comedy; Rocky's calm correction is the trust-builder.

## Shared production rules
1. **Derive from the master, never re-prompt from scratch.** Every turnaround,
   expression, pose, 3D sculpt, and episode asset conditions on the locked master
   image(s) so the characters never drift.
2. **Same art family** across the cast (outline weight, cel shading, proportions
   of the world — Octane younger/rounder, Rocky taller/leaner).
3. **Never fabricate** brand facts (colors, specs) — owner/swatch/FSM-sourced.
4. Render pipeline: Gemini **Nano Banana Pro** (`gemini-3-pro-image-preview`),
   image-conditioned on the masters. One-off generators live in the user home
   (`gen-*.py`); the Tuned Yota Google project is billing-enabled for image gen.

## Brand palette (real TY hexes)
Lunar Rock body (6X3, swatch-matched) · Solar Octane body (4W5, swatch-matched) ·
orange accent `#E85D2A` · off-white `#F3EFEA` · earth/sage `#3A2E26` `#5B4B42`
`#99A08E` `#7c8472` · UI blue `#B3D0D9`. Fox mark: `site/fox.svg` / `site/logo.png`.

## Cast art
- Duo lineup (master cast shot): `assets/cast/rocky-octane-lineup.png`
- Channel art: `assets/cast/channel/youtube-banner.png` (2560×1440),
  `youtube-avatar.png`. **Wordmark font is a placeholder** pending the official
  brand wordmark/font.

## Open / future
- Official **wordmark font** to replace the banner placeholder.
- Possible **third cast member** (Cav / Barca) once a role justifies it.
- Video pilot (Rocky, Tundra front brakes) pending owner spec-fill
  (`docs/brand/rocky/pilot-verify-checklist.md`) + 3D build/animation.

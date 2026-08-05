# Pilot Episode — Owner Verification Checklist

**Episode:** 2007–2021 Toyota Tundra — Front Brake Pads & Rotors
**Purpose:** fill these from FSM / owner source so the `⟨VERIFY⟩` markers in
`pilot-tundra-front-brakes-script.md` can be replaced with real values (plan
Task 11) and the VO render is unblocked. **Nothing here is guessed — leave blank
until verified.**

| # | Spec needed | Where it's used | Value (fill in) |
|---|-------------|-----------------|-----------------|
| 1 | Caliper (guide-pin) bolt — **size** | tools card, Step 4 VO | ____ |
| 2 | Caliper (guide-pin) bolt — **torque (ft-lb)** | Step 8 VO + spec card | ____ |
| 3 | Caliper bracket (mounting) bolt — **torque (ft-lb)** | Step 3 + Step 6 VO + spec card | ____ |
| 4 | Lug nut — **torque (ft-lb)** | Step 9 VO + spec card | ____ |
| 5 | Lug nut — **socket size** | tools card | ____ |
| 6 | Rotor **retaining screw** present on this generation? (Y/N; size if Y) | Steps 5 & 7 VO | ____ |
| 7 | **Highest torque** in the procedure (tool-selection callout) | tools card | ____ (derive from 2–4) |
| 8 | TY **front-brake-kit SKU slug** | parts card + CTA | ____ |

Once filled, I replace the 10 markers in the script, generate the Ava VO, and the
episode moves to the render/animation stage.

## Remaining pilot steps (still owner/artist/tools — not code)
- **Task 10:** build & rig the 3D Rocky from the reference set
  (`assets/rocky/turnaround/*`, `assets/rocky/expression-sheet.png`,
  `assets/rocky/canonical-concept-v2.png`) → owner sign-off on the on-model checklist.
- **Task 11:** trace exploded-view diagrams from the reference pack, render the Ava
  VO from the verified script, animate Rocky, burn captions + `.srt`.
- **Task 12:** unlisted → owner approval → publish via content-ops.

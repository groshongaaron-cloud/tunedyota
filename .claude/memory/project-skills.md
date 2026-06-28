---
name: project-skills
description: "Tuned Yota repo has 5 project skills in .claude/skills/ for recurring multi-file workflows (schedule-event, new-vehicle-page, update-routing, add-review, ship)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e75d74d1-a76c-483c-83d5-58cb118bc0c4
---

The repo carries **project skills** in `.claude/skills/` (auto-surfaced in this repo) that codify recurring, error-prone, multi-file workflows. Built 2026-06-18 TDD-style (baseline agent without the skill → write skill to close the gaps → verify). Invoke via the Skill tool when the trigger matches.

- **`schedule-event`** — add/reschedule/remove a tuning event. Sync: `markets.js` (server city registry + state), `events-data.js` (booking source of truth, lowercase city), booking-page `MARKETS` (map). Then `npm run build:seo` (don't hand-edit the generated `SEO:EVENTS` block or sitemap) + `npm test` + push. New state also needs `STATE_ORDER`, `areaServed`, footer "Serving…" copy, `llms.txt`.
- **`new-vehicle-page`** — add a Toyota/Lexus OTT landing page. Silent trap: register the filename in `HEAD_PAGES` (`scripts/lib/seo-data.mjs`) or `build:seo` skips it and tests never check it (orphaned from search). Also add to the `VEHICLES` booking finder (else not bookable) and the homepage `v-card`; keep price equal across 4 places.
- **`update-routing`** — add an installer or reassign a market. Sync four: `routing.js` INSTALLERS, `markets.js` `inst`, booking-page INSTALLERS + `MARKETS` `inst` (+ Airtable Installer single-select option, + `team.html`). Traps: bookings route server-side (`markets.js`) while legacy leads route client-side, so a half-update splits a market; an unknown installer key silently falls back to Aaron (`FALLBACK_KEY`).
- **`add-review`** — add a verified review. Three surfaces must mirror: `index.html` schema `review[]` (+ bump `aggregateRating.reviewCount`), `index.html` visible `.rev` cards ("What owners say"), and the booking-page `REVIEWS` array. Keep count parity (unguarded by tests); no em-dashes in copy (`cfb0cd5` convention); reviews must be real/verbatim.
- **`ship`** — production deploy flow: (build:seo if SEO inputs changed) → `npm test` → push `master` → confirm Netlify `ready` → curl live. **Deploy = push to master (GitHub-connected auto-build).** NOTE: `README.md` still shows stale `netlify deploy` commands — that is NOT the live workflow.

All five built 2026-06-18 TDD-style. They complement the [[seo-generator]] (`npm run build:seo`) and the [[cloud-routines]] monitoring agents.

To add more project skills, follow `superpowers:writing-skills` (TDD for docs: watch a baseline agent fail first).

# Common client questions — transcript mining, August 2026

Mined from 74 real conversations (SMS threads, Facebook Messenger, Instagram DMs,
web chat) in the Chat Sessions table on 2026-08-02. Aggregated themes only — no
customer PII in this doc. Re-run the mining with
`npx netlify dev:exec node scripts/smoke/dump-questions.cjs` (output stays local).

## Themes, by frequency

| # | Theme | ~Count | Agent can answer today? |
|---|-------|-------|------------------------|
| 1 | Scheduling/location: "when are you in [city]", "are you coming through X", "upcoming events" | 10+ | **NOW YES** — upcoming-events schedule added to the system prompt (2026-08-02) |
| 2 | Model coverage: "do you tune 4Runners/Tacomas/Tundras/LX570?" | 9+ | Yes — pricing summary lists every application |
| 3 | Pricing: "how much", "ballpark", "what makes the price go up" | 6+ | Yes — published base prices; custom pricing correctly guarded → transfer |
| 4 | Talk to a human / AI frustration | 6+ | **NOW FASTER** — frustration rule added: second ask or visible frustration → immediate transfer |
| 5 | Broken links in texted replies | 5 | **BUG, NOW MITIGATED** — link-hygiene rule added (URL on its own line, no trailing punctuation). Watch whether reports stop; if not, the URL itself is at fault. |
| 6 | Post-install service: high idle, drivability, dealer warranty work vs the tune, E85 later, "is my truck already tuned (VIN)?" | 6+ | Partially — correctly transfers; these are existing-customer service motions |
| 7 | Warranty: "does it void my warranty?" | 3 | Guardrail → transfer (correct). **Aaron decision open:** an approved one-line warranty stance would let the agent answer honestly without a transfer round-trip |
| 8 | What the tune does: "HP gains or just consistent power?", "fuel curves and shift points?", process ("OBD at home with a laptop?") | 4+ | **NOW PARTIALLY** — approved measured example added (+40 whp tune-alone, shop-truck 5.7L, results-vary framing). Deep technical → transfer (correct) |
| 9 | Mod-interaction: intercooler vs turbo inlet, retune after parts, blend calibrations | 4 | Guardrail → transfer (correct — fitment guardrail) |
| 10 | Weekday/off-event availability ("weekends impossible for me") | 3 | Partially — books to events; flexible scheduling is an installer conversation |
| 11 | Emissions | 1 | Guardrail → transfer (correct) |
| 12 | Military discount | 1 | Pricing guardrail → transfer. **Aaron decision open:** stated policy would answer this autonomously |

## What changed on 2026-08-02 (lib/chat-agent.js)

1. **Upcoming-events schedule** in the system prompt (deploy-baked events-data;
   city, date, address). The single biggest unanswerable theme is now answerable.
2. **Link hygiene rule** — URLs on their own line, no surrounding punctuation
   (5 of 74 conversations reported a broken link; trailing punctuation in SMS/
   Messenger link parsing is the likely cause).
3. **Frustration fast-track** — second human-ask or visible frustration skips
   the playbook and transfers immediately.
4. **Early first-name capture** — every contact is a CRM record; the harvest
   (chat-harvest.js) upgrades placeholder names when a real one appears.
5. **Approved measured-gains example** — +40 whp tune-alone on the shop truck's
   otherwise-stock 5.7L calibration (owner-approved figure), always with
   results-vary framing and a transfer offer.

## Aaron decisions — RESOLVED 2026-08-02 (all wired into lib/chat-agent.js)

- **Warranty stance (approved copy):** warranties are subjective; Tuned Yota has
  never had a warranty issue and can't promise one may or may not occur — nuanced
  cases go to a phone conversation. Encouraging facts the agent may state: the OTT
  calibration reads as a stock calibration ID; OTT has SEMA-certified engine
  calibrations (EPA Tampering Policy compliance under the Clean Air Act) and
  CARB-certified engine platforms (often tougher than federal standards).
  Guardrail 4 now scopes to this stance instead of forcing every warranty
  question into a transfer.
- **Military discount:** only when the client brings it up — "Yes, thank you for
  your service, we really appreciate it. As a token of our gratitude we discount 10%."
- **Supercharger dyno figures:** quote only numbers published at
  overlandtailor.com; factory/base output figures from magnusonsuperchargers.com.
  Never invent or estimate.

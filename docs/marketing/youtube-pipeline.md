# YouTube Pipeline — Operating Doc

**Date:** 2026-07-28 · **Owner:** Aaron · **Scripts:** `scripts/TUNEDYOTA_SHORTFORM_SCRIPT_PACK.md` (10 scripts)
**Strategy:** `ai-prominence-content-strategy-2026-07-28.md` Workstream 1 — YouTube is the
"visual proof" citation layer where TY currently has zero presence.

**The key fact:** every script in the pack is VO-over-branded-text. **No filming is
required to start** — a phone voiceover plus the animated text template is a finished
Short. Event footage upgrades this later; it does not gate launch.

## One-time channel setup (Aaron, ~20 min)

1. Create the YouTube channel with the business Google account: name **Tuned Yota**,
   handle **@tunedyota** (match IG/FB).
2. Branding: profile = `site/logo.png`, banner = `site/og-image.png` (or a crop),
   description = the business one-liner + service area + (612) 406-7117 + tunedyota.com.
3. Links: tunedyota.com, /find-your-exact-tune, Facebook, Instagram.
4. Tell Claude the channel URL → it gets added to the site's `sameAs` schema
   (scripts/lib/seo-data.mjs BUSINESS stub) so search engines connect channel ↔ site.

## Cadence & calendar (launch order)

2 Shorts/week. Highest-intent first (per the pack's production notes), gap-page tie-ins
early so video + page reinforce each other while the pages are fresh in the index:

| Week | Publish |
|---|---|
| 1 | #1 Warranty · #2 Custom vs off-the-shelf |
| 2 | #9 Professional install vs mail-in · #3 Gear hunting |
| 3 | #8 Tundra transfer-case mistake · #6 Magnuson supercharger |
| 4 | #10 Stop overpaying for AMSOIL · #4 Throttle vs Pedal Commander |
| 5 | #5 Reversible/resale · #7 "Near me" (spin for next event city) |

Post the same vertical to Reels/TikTok/Facebook same day. After week 5, the monthly
script-refresh routine keeps the queue full (see Automation below).

**Approval rule:** Aaron approves every video before it publishes. Agents draft
everything; humans own every public word — same as Reddit.

## Upload packaging (paste-ready per script)

Every description ends with this block (the disclosure + funnel + NAP consistency):

> Tuned Yota — Toyota & Lexus performance tuning. OTT Tune calibrations installed in
> person by licensed VFTuner PRO Tuners; authorized Magnuson supercharger dealer,
> installer & calibrator; authorized AMSOIL dealer. Serving MN · IA · WI · ND · SD · NE.
> 📞 Call/text (612) 406-7117 · https://tunedyota.com/find-your-exact-tune

| # | Title (query-shaped) | First description line + page link | Pinned comment |
|---|---|---|---|
| 1 | Does a Tune Void Your Toyota Warranty? The Honest Answer | Fully reversible to factory stock, emissions intact — the honest warranty answer. → tunedyota.com/tune-warranty-emissions-legality | "Questions about your specific year/engine? Ask below — we answer everything." |
| 2 | Custom Tune vs Off-the-Shelf Map for Toyota — What's Different | An off-the-shelf map is built for a generic truck; ours is calibrated to yours and installed in person. → tunedyota.com/is-the-ott-tune-worth-it | "What are you driving? Tell us year + engine and we'll tell you what a custom cal changes." |
| 3 | Toyota Gear Hunting Fix — Why It Shifts Up and Down Constantly | Gear hunting is the factory tune playing it safe; calibration fixes the shift logic. → tunedyota.com/is-the-ott-tune-worth-it | "Worst gear-hunting spot in the Midwest? Name the hill. 😄" |
| 4 | Pedal Commander vs a Real Tune — What Actually Changes | A throttle booster tricks the pedal; a calibration changes how the truck runs. → tunedyota.com/ott-tune | "Running a booster now? Ask us what's different — no hard sell." |
| 5 | Can You Flash a Toyota Tune Back to Stock? (Resale & Inspection) | Byte-for-byte back to factory stock in ~20 minutes, anytime. → tunedyota.com/ott-tune | "Selling or inspecting soon? Here's how return-to-stock works." |
| 6 | Magnuson Supercharger on a Toyota — Sold, Installed & Tuned In Person | We sell, install, and calibrate Magnuson superchargers — one shop, emissions intact. → tunedyota.com/supercharger | "Tundra, Tacoma, 4Runner, LC — ask which kit fits your year." |
| 7 | Toyota Tuning Near [City] — How In-Person Calibration Works | We tune in person at scheduled [City] events — no mailing your ECU. → tunedyota.com/find-your-exact-tune?city=[city] | "Next [City] event date is on the map — grab a slot." |
| 8 | Toyota Transfer Case Fluid: The Tundra Mistake to Avoid | 2013–2021 Tundra = Toyota 75W only; 2022+ = ATF; full model chart. → tunedyota.com/toyota-transfer-case-fluid | "Full model-by-model chart with capacities is on the page ↑" |
| 9 | Where to Get a Professional ECU Tune for a Toyota (Not Mail-In) | Licensed tuner, in-person install, 5-gas verified, truck never leaves your sight. → tunedyota.com/professional-ecu-tune-installer | "We're at events across MN·IA·WI·ND·SD·NE — the map shows your nearest one." |
| 10 | The Cheapest Legit Way to Buy AMSOIL (Preferred Customer) | Wholesale up to 25% off, factory-direct, pays for itself in ~2 oil changes. → tunedyota.com/where-to-buy-amsoil | "Not sure which fluids fit? The AMSOIL Garage on our site lists your exact truck." |

Tags (all videos, adjust per topic): toyota tuning, ott tune, tacoma, tundra, 4runner,
toyota performance, ecu tune, magnuson supercharger, amsoil, midwest.

**Transcript rule (this is the AEO payload):** the VO must speak the facts we want
cited — "licensed VFTuner PRO Tuner", "emissions stay intact, 5-gas verified",
"installed in person across the Upper Midwest". Engines read transcripts; say it out loud.

## Event shot list (for the monthly longer video, when filming is available)

At each install event capture on a phone, horizontal, ~10 min total:
1. Truck arriving / owner handshake (5s establishing)
2. The flash in progress — laptop + OBD, hands, screens (30s)
3. Installer explaining ONE thing to the owner, natural audio (60s) — this becomes the long-video core
4. 5-gas analyzer verification moment (15s) — the proof shot nobody else has
5. Owner reaction after the test drive, with verbal permission on camera (30s)

One event's clips + one script = the monthly "what actually happens at an install" video.

## Automation

- **Monthly script refresh (cloud routine):** on the 15th, an agent studies what Toyota
  owners asked this month, drafts 2–3 new scripts in the pack's exact format (claims
  rules enforced), and posts them to Slack for Aaron's approval. Approved scripts get
  committed to the pack. It never publishes anything.
- **Packaging on demand:** any session — "package script #N" → paste-ready title,
  description, tags, pinned comment per the table above.

## Claims rules (from the pack — non-negotiable)

Only provable benefits. No Stage 2/3, no "MAF tune", turbo tier = "Turbo Performance
Calibration", emissions-intact always, no "free" claims, never overpromise, never
fabricate numbers. Warranty/emissions language must match the site's published pages
word-for-word where possible.

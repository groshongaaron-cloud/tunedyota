# AMSOIL Commercial B2B — Launch Kit (September 2026)

**Why this exists:** Tier 2 ($30K/mo by year-end) does not pencil on retail alone
(forecast: `amsoil-outrank-review-2026-07-20.md`). The commercial lane closes the
gap: **2-4 active accounts at $2-3K/mo each**, and commercial accounts are the
stickiest revenue AMSOIL offers — a fleet that standardizes on AMSOIL reorders
for years. None of the prominent Midwest AMSOIL dealers work this lane visibly.
Built 2026-07-20 from AMSOIL's Commercial Products dealer brief + our own edge;
**launch window: first week of September** (landscapers exit peak season, ag
pre-harvest maintenance, snow contractors prep).

## How the money works (and why it's compliant by design)

AMSOIL **Commercial Accounts** (businesses that USE product: fleets, landscapers,
ag) and **Retail/Installer Accounts** (shops that resell or install it) register
under our dealer number, buy at commercial pricing **directly from AMSOIL**, and
AMSOIL ships direct. We earn commissions on everything they ever order. No
inventory burden, no cart, no invoicing — this is AMSOIL's own sanctioned B2B
program, so the entire online-sales policy question never arises.

## Target segments (priority order, all six states)

1. **Lawn & landscape / snow contractors** — the proven playbook. Door-opener:
   SABER Professional 2-stroke at the 100:1 SABER Ratio **cuts their two-stroke
   oil cost 50%+** while equipment starts easier and lasts longer. Their top
   pains (per industry surveys AMSOIL cites): labor, fuel costs, low-ball
   competitors — so the pitch is cost + uptime, never brand romance. In MN/WI
   these same companies run snow removal: a **year-round account**. Timing:
   early morning or off-season; enter through the **maintenance person in the
   garage**, not the owner.
2. **Construction / excavation / trades fleets** — diesel oils, hydraulic fluid,
   grease, and their pickup fleets (many run Tundras/Tacomas — our home turf).
3. **Ag operations** (IA/SD/NE especially) — diesel, hydraulic, grease; harvest
   downtime is catastrophic, which is the AMSOIL uptime story verbatim.
4. **Independent repair shops & quick lubes** — Installer accounts: they buy at
   account pricing and put AMSOIL in customer vehicles. Every shop that services
   Toyotas can also hand customers OUR tune card — cross-pollination with the
   core business.
5. **Toyota work-truck fleets** (utilities, surveyors, municipalities running
   Tacomas/Tundras/Sequoias) — nobody else can walk in with **verified year-split
   capacities and a per-vehicle fluid schedule** for their exact trucks. This is
   the segment where Tuned Yota is structurally unbeatable.

## Our unique offer: the Free Fleet Fluid Audit

The door-opener that no generic dealer has: *"Give me your equipment list and
I'll hand you back a one-page fluid schedule — exact products, capacities, and
severe-service intervals for every unit, free."* It's the AMSOIL Garage concept
applied to a fleet, built on our verified-data credibility. It costs us an hour,
it forces a real conversation about their actual equipment, and the deliverable
itself demonstrates the expertise. The audit closes into an account signup.

## The sales process (AMSOIL's four stages, our scripts)

1. **Create curiosity** (2 minutes, in person or phone): "Do you have a couple
   minutes for me to show you how I help outfits like yours cut two-stroke oil
   costs 50% or more while your equipment lasts longer?" Goal is NOT a sale —
   it's permission for a later meeting. Multiple visits are normal.
2. **Discover needs** (the earned meeting): open questions about *their* pains —
   "How often are you replacing trimmers and blowers?" "What does a truck or
   mower being down for a day cost you?" "Who handles fluid buying now, and
   what's the annual spend?"
3. **Assessment** (present the fix): match products to the stated pains only.
   SABER Pro for 2-stroke cost/uptime; Small-Engine Oil (200-hr/1-yr drains) for
   mowers; Hydrostatic Fluid (2× OEM life) for zero-turns; diesel/grease/hydraulic
   for heavy iron; the fleet fluid audit for pickups. Don't over-literature:
   one catalog, one handout.
4. **Ongoing service**: agree the cadence at signup (monthly check-in vs
   quarterly). The account's reorders are the revenue — service protects them.

**Objection handles (from the brief, in our voice):**
- *"I'm busy."* → "Two minutes now, or I'll swing by Wednesday early — I'll show
  you the 50% number and be gone before your crew rolls."
- *"Happy with our current supplier."* → Never trash them. "They're good
  products. Worth 15 minutes to confirm you're still getting the best value —
  and it never hurts to have a second supply line for shortages."
- *"I can buy cheaper."* → "Cheaper per quart, sure. At 100:1 you use half the
  oil, your equipment starts when it's -10°, and drains stretch — total cost is
  the number that matters. Let me show you the math on your own fleet."

## The outreach sequence (5 touches, ~3 weeks per target)

Touch 1 — **in person** (the brief is explicit: this lane is won face-to-face;
email supports, it doesn't lead). Garage entrance, maintenance person, curiosity
script, leave ONE handout with our card.
Touch 2 — **email, day 2** (subject: "The 50% two-stroke number from yesterday"):
recap the claim, one testimonial line, offer the Wednesday meeting.
Touch 3 — **call, day 7**: book the discovery meeting.
Touch 4 — **email, day 14** (subject: "Free fluid schedule for your fleet"): the
Fleet Fluid Audit offer — equipment list in, one-page schedule back, no cost.
Touch 5 — **visit/call, day 21**: audit delivery IS the closing meeting — walk
the schedule, open the account on the spot (registration is minutes).
Then quarterly ongoing-service cadence, or park the target for next season.
Full email copy drafts live at the bottom of this doc — keep them personal,
short, and number-led; no blast tooling, these are 1:1 sends from Aaron.

## Tracking & accountability

- Targets and progress live in the lead tracker: source **`commercial`**, one
  lead per business, stage notes per touch. Reserve/PC metrics stay separate.
- Weekly: 5 new Touch-1 visits per active territory (Aaron / Noah / Cody
  regions), tallied like install attach.
- Monthly checkpoint adds two numbers: **audits delivered** and **accounts
  opened**; account volume shows up in the dealer-zone report.
- Goal line: **first account opened by Sept 30; 2-4 accounts at ~$2-3K/mo by
  Dec 31.**

## September launch checklist

- [ ] Order materials from the Dealer Zone: Commercial Program Catalog (G3563),
      SABER Professional Handout (G3564), a few SABER samples for demos.
- [ ] Build the first target list: 20 businesses per territory (landscape/snow
      first), from GBP maps + the Midwest Tuning Group network + event-city
      drive-bys. Log each as a `commercial` lead before the first visit.
- [ ] Print 10 blank Fleet Fluid Audit capture forms:
      `node scripts/amsoil-fleet-audit.mjs --blank` → open the HTML, print.
      Finished audits: capture the fleet on the form, transcribe to an
      equipment JSON (shape in the script header), run
      `node scripts/amsoil-fleet-audit.mjs equipment.json` → branded one-pager;
      Toyota/Lexus units carry ✓-verified capacities + stock numbers.
- [ ] Walk Noah and Cody through this kit (30 minutes) — same scripts, same
      tallies as SOP 11.
- [ ] Week 1: 5 Touch-1 visits per territory. That's the whole week's goal.

## Guardrails

Accounts buy from AMSOIL directly — we never invoice, stock, or cart their
product (dealer-policy boundary, same as retail). No prices posted online for
account pricing. Brand rules apply. Don't promise specific savings percentages
beyond AMSOIL's own published claims (SABER 50%+ at 100:1 is AMSOIL's claim —
citable; invented fleet numbers are not).

---

## Email drafts (1:1, from Aaron — personalize the bracketed bits)

**Touch 2 — "The 50% two-stroke number from yesterday"**
> [Name] — good meeting you at [business] yesterday. The short version of what I
> do: outfits like yours running [trimmers/blowers/saws] typically cut two-stroke
> oil spend 50%+ switching to AMSOIL SABER Professional at its 100:1 ratio — and
> the equipment starts easier and carbons up less, which your crew feels every
> morning. Duluth Lawn Care and Timberline Landscaping both run it fleet-wide.
> Worth 15 minutes Wednesday? I'll bring the numbers for your fleet size.
> — Aaron Groshong, Tuned Yota · Authorized AMSOIL Dealer · (612) 406-7117

**Touch 4 — "Free fluid schedule for your fleet"**
> [Name] — offer, no strings: send me a list of your equipment (trucks, mowers,
> handhelds — year/make/model is plenty) and I'll send back a one-page fluid
> schedule: exact product, fill quantity, and change interval for every unit,
> the same verified data we publish for the trucks we calibrate. Takes you five
> minutes; saves your crew guessing at the parts counter. If it's useful, I'll
> show you what an AMSOIL commercial account does to the pricing.
> — Aaron

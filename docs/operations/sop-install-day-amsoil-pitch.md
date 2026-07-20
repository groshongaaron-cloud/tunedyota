# SOP 11 — Install-Day AMSOIL Pitch (Full Fluid Refresh)

**Owner:** every Installer (Aaron, Noah, Cody) · **When:** every install, at the
certificate hand-off · **Why:** attach rate on installs is the single
highest-leverage number in the AMSOIL revenue plan
(`docs/marketing/amsoil-outrank-review-2026-07-20.md`): at ~40 installs/mo,
the difference between pitching nothing and pitching the **~$350 Full Fluid
Refresh** at 40% attach is ≈ **$6-7K/month** — the anchor of the $15K Tier-1 goal.

## The offer: "Tuned-Truck Full Fluid Refresh"

Engine oil + Ea filter + front/rear differential + transfer case (where the
truck has one) — the exact AMSOIL products and **verified quantities** from the
customer's garage page. Not an oil change: a *severe-service reset for a truck
that just got more capable*. ATF is quoted separately (sealed overflow fill —
never quote a number from memory).

## Before the event (5 minutes)

Run the stocking list and bring exactly what the day's trucks need:

```
netlify dev:exec node scripts/amsoil-event-stock.mjs --date YYYY-MM-DD
```

It prints, per event: the aggregate stock to bring (summed quantities by stock
number), each truck's kit, any capacity that still needs the owner's manual,
and any vehicle not in the garage catalog (quote those manually).

## The pitch (at the certificate hand-off — peak pride, ~30 seconds)

> "One more thing while you're here — this calibration asks more of your fluids
> than stock, so we put your truck's exact severe-service kit together:
> [oil] with the right filter, plus diffs and transfer case, all AMSOIL, all the
> verified capacities. It's about $[X] and we've got it right here — want me to
> set it with your certificate? And if you enroll as a Preferred Customer while
> we ring it up, you'll pay about 25% less on this and every order after."

Rules: say it to **every** customer; quote from the garage page or stocking
list, never memory; **always** pair it with the Preferred-Customer enrollment
(that's the compounding revenue — a PC reorders for years on our dealer number).

## Objections (honest answers only)

- **"I just changed my oil."** — "Perfect, then just the driveline: diffs and
  transfer are fill-and-forget for 30k, and almost nobody's ever done them.
  That's the half that tows."
- **"That's a lot."** — "Enroll as a Preferred Customer first — about 25% off
  today and every future order. And the kit is one purchase a year for most."
- **"I'll think about it."** — "No pressure — your certificate has a QR that
  opens your exact kit, and you can reserve it for our next event here so it's
  waiting." (That's the Reserve flow — it lands as a lead; whoever owns the
  lead follows up same-day.)

## Payment & logging

- **Payment:** Elavon card-present at the event/location; until the terminal is
  live, personal invoice or reserve-for-next-event. Never take AMSOIL payment
  through the website (dealer-policy boundary — see
  `docs/operations/online-payments-go-live.md`).
- **Log the attach:** at close-out, note kit sold / PC enrolled in the day's
  close-out notes. The owner tallies **attach rate + PC signups per event** —
  the two numbers reviewed at each monthly revenue checkpoint (Aug/Sep/Oct).

## Don'ts

Brand rules apply (no Stage 2/3, no MAF, emissions-intact). Don't discount —
PC pricing IS the discount and it's AMSOIL's own program. Don't quote ATF or
any unverified capacity as fact. Don't push past two asks — the QR and the
follow-up email continue the conversation automatically.

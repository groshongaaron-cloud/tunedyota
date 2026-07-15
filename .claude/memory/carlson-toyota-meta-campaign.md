---
name: carlson-toyota-meta-campaign
description: "How the $200 Meta ad campaign for the Carlson Toyota (Coon Rapids) Jul 18 2026 event was built — account/pixel facts, the owner's proven Event-Response playbook, the 50/50 A/B structure, and hard tool-limitation lessons for driving Meta Ads Manager via claude-in-chrome."
metadata: 
  node_type: memory
  type: project
  originSessionId: a76b91ec-4cdb-4c40-9642-9a6c68ca8df4
---

Built 2026-07-14 for the **3rd Annual "Tacos and Tacomas" w/Carlson Toyota** event = Carlson Toyota, 12880 Riverdale Dr NW, Coon Rapids MN, **Sat Jul 18 2026, 10:30 AM–1:00 PM**. FB event `1570697924399761`. (The owner's "Carlson event" and "Tacos and Tacomas" are the SAME event.)

⚠ **2026-07-15 emergency fix (master @ b16516c, LIVE+verified):** the ad QR/campaign drove clients to `tunedyota.com/find-your-exact-tune` to book, but the Carlson event was NEVER in the booking funnel → clients couldn't book. Added **Coon Rapids** as a bookable event across all 3 sources of truth (markets.js/events-data.js/find-your-exact-tune.html MARKETS) — new **aaron** market (Twin Cities suburb), event name "Carlson Toyota Tacos & Tacomas — Coon Rapids, MN OTT Event", venue = the Carlson address, map pin lat 45.1889/lng -93.3402. Same push also corrected a mislabel: **Sep 19 2026 is the Rapid City fall event, not Omaha** — moved Sep 19 Omaha→Rapid City; Omaha's next event is now Oct 31. 624 tests green (market count 20→21). See [[multi-date-booking-and-schedule]] + the schedule-event skill.

**2026-07-15 follow-up (master @ 705b9be, LIVE+verified):** (1) map pin moved to the EXACT dealership via geocode — Coon Rapids lat 45.2057 / lng -93.3594 (12880 Riverdale Dr NW). (2) NEW reusable funnel deep-link: `find-your-exact-tune?city=<name>` (hyphens/underscores treated as spaces) preselects that market at the book step (added `S.presetCity` capture + auto-`selectMarket` in `prepBooking`); the funnel is vehicle-first, so this preselects the market at the END step, not a full skip. (3) Carlson event graphics (square 1080×1080 + story 1080×1920): QR retargeted from the bare funnel to `?city=coon-rapids` (+ existing UTMs) so a scan lands on the Coon Rapids booking, and the hero title changed "Coon Rapids, MN" → "Carlson Toyota" (address line kept). Re-rendered via render.js (PNG exports are gitignored → **owner must re-upload the new creative to the Meta ads**; published ads still carry the old QR/title). Then (master @ c9fc6b8) the "100% Emissions intact" chip was replaced with a benefit-forward "Smoother throttle & shifts" chip on both flyers per the [[advertising-graphics-project]] copy pref — re-rendered (owner still re-uploads creative to Meta).

**Meta account facts (reuse):**
- Ad account `act=1038948997523733` ("Tuned Yota"), FB page "Tuned Yota", IG "tunedyota".
- Meta Pixel `1307227328237229` is live site-wide; fires `Schedule` on a completed booking ("Tune Booking") and `Lead` on the tune-finder/waitlist. Booking funnel `tunedyota.com/find-your-exact-tune` captures UTMs (utm_source/medium/campaign) via a Netlify `/track` beacon.
- **Owner's proven playbook = Event Response** (now under the **Engagement** objective) with a **lifetime** budget. Account has ~36 such "Event: <City> OTT Tune Event" campaigns. The past **Carlson "Tacos and Tacomas"** ad was the account's **best performer ever: $0.72 / event-response on just $100** (16k impressions). Event Response is cheap + reliable here; use it. Conversion-optimization won't get enough signal at $100–200 (needs ~50 conv/wk to exit learning).

**What was built (owner-directed true 50/50 split, both $100 lifetime, both Jul 14→Jul 18 10:30 AM CDT, identical audience+creative so only OBJECTIVE differs):**
- **Campaign A** "Event: Carlson Toyota - Coon Rapids | Jul 18 2026 (A: Event Response)" — Engagement/Event-Response, duplicated from the proven Tacos winner (inherits proven setup + carried-over social proof/reactions), promotes the FB event.
- **Campaign B** "…(B: Traffic)" — Traffic → Website → optimize **Landing Page Views**, drives to the booking funnel with **Book Now** + tracked link `…/find-your-exact-tune?utm_source=facebook&utm_medium=paid_social&utm_campaign=carlson_coonrapids_traffic`.
- Both: audience **Minneapolis +50 mi · Men · 18–63** (the proven $0.72 targeting), same "Tacos & Toyotas · JULY 18" creative from the account library.
- **Measurement:** compare cost-per-result + CTR in Ads Manager, but the real read is **booked bays by UTM** — B's bookings tag `carlson_coonrapids_traffic`; A's come via FB event RSVP + reminders.
- **STATUS: PUBLISHED & LIVE 2026-07-15** (owner clicked Publish). Campaign A = "Preparing" (proven Tacos creative + carried social proof); Campaign B = "In review" with the **NEW Carlson creative** (square feed + story vertical) — owner manually uploaded both PNGs into B's ad while I drove Ads Manager to the media library ("Change selections" → owner clicks Upload → native file dialog is theirs → I finish). B briefly showed "No ads" until its media edit was published. A kept the Tacos graphic (owner opted not to risk A's social proof). Both run through Jul 18 10:30 AM, $100 each.
- **POST-EVENT: owner will report bookings + walk-ins from event day** so we can judge Event-Response (A) vs Traffic (B) by real tunes booked. B's funnel bookings tag `carlson_coonrapids_traffic`.

**HARD TOOL LESSONS (claude-in-chrome × Meta Ads Manager):**
- The tool CAN drive Ads Manager, but it's an **unstable SPA**: frequent `Page.captureScreenshot timed out` and tiled/garbled render glitches. Recovery = **navigate/reload the page** (drafts persist server-side); then retry. (Unlike the GSC SPA which can't be driven at all — see [[gsc-indexing-migration]].)
- **Segmented time inputs** (schedule start/end): typing digits often silently fails. Use **arrow keys** — click the hour segment, `Up`/`Down` to change value, `Right` to move to minute→AM/PM. The `repeat` param on the key action helps (e.g. Up ×19).
- **`file_upload` NO LONGER accepts host filesystem paths** ("must pass contents via `files`") → **cannot upload local creative** to Meta via automation. Workaround: pick an existing image from the Meta media library, or have the owner upload manually. (This is why the live ads use the proven Tacos graphic, not the new `carlson-event-*` PNGs — see [[advertising-graphics-project]].)
- The campaigns **list "Ends" column is unreliable for drafts** (shows the start date / "Ongoing") — verify schedule in the ad-set editor, not the list.
- Duplicating a campaign: legacy objectives are retired → must "Duplicate using **simplified objective**" (Event Response → Engagement). Keep "show existing reactions/comments" checked to carry social proof.

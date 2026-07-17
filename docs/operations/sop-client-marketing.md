# SOP 1 — Client Marketing

**Owner:** Owner/Operator · **Cadence:** Continuous + a per-event campaign cycle
**Goal:** Fill every event's 12 slots and grow the Priority List, at a predictable cost per booking.

Marketing exists to drive traffic to `tunedyota.com`, where the *Find Your Exact Tune* flow
turns a visitor into a **booking** or a **Priority List lead**. Every tuned truck then becomes
proof (dyno, testimonial, review) that feeds the top of the funnel — the flywheel.

---

## 1. Channels & where they live

| Channel | Purpose | Assets / reference |
|---------|---------|--------------------|
| **SEO / AEO pages** | Get found for "OTT tune", vehicle + state queries | `site/*-ott-tune.html`, state pages, guides; governed by `new-vehicle-page` & `add-dyno-proof` skills |
| **Google Business Profile** | Local "near me" + reviews | [`docs/seo/gbp-setup.md`](../seo/gbp-setup.md) |
| **Social** (IG, FB, YouTube, TikTok) | Build/education/proof; Midwest Tuning Group | [`docs/instagram-content-kit.md`](../instagram-content-kit.md), [`docs/marketing/master-advertising-plan.md`](../marketing/master-advertising-plan.md) |
| **Paid** (Meta / TikTok) | Event geo-rings, retargeting via Pixel | [`docs/marketing/meta-ads-copy.md`](../marketing/meta-ads-copy.md) |
| **Ad graphics** | Flyers, dyno cards, countdowns, recaps | [`docs/marketing/ad-templates/`](../marketing/ad-templates/) — HTML → screenshot, 3 sizes |
| **Forums / Reddit** | Organic reach; lead-radar cloud routine | [`docs/lead-generation-playbook.md`](../lead-generation-playbook.md) |

**Rule:** every link out carries a **UTM** (`utm_source`, `utm_medium`, `utm_campaign`) so
attribution lands in Funnel Events. No UTM = invisible in the monthly report.

---

## 2. The per-event campaign cycle

Run this rhythm for **every active city** in [`docs/events/2026-2027-event-plan.md`](../events/2026-2027-event-plan.md).
Full diagram: [`docs/architecture/event-campaign-lifecycle.md`](../architecture/event-campaign-lifecycle.md).

| When | Action | Asset |
|------|--------|-------|
| **T−6 weeks** | Announce + open paid geo-ring around the venue | Event flyer (per-city UTM), where-we-tune map |
| **T−4 weeks** | Education + proof push | Dyno cards, before/after reels |
| **T−2 weeks** | "Slots filling" + email the region | Countdown card, email to region list |
| **Event week** | Daily countdown; roster nudges | `event-reminders.js` auto-fires installer rosters (see SOP 3) |
| **Event day** | Live stories/reels, dyno pulls, reactions — **shoot once, use everywhere** | — |
| **+1 week** | Recap, testimonials, **review requests**, "next stop" rebook | Recap card; [`add-review`](../../.claude/skills/add-review/SKILL.md) skill |

The +1-week captured content recycles into the next city's T−6 announce.

---

## 3. Review requests (the local-ranking lever)

1. After an event, ask completed customers for a Google review (GBP link).
2. When a strong verified review comes in, add it with the **`add-review`** skill — it keeps
   the on-page social proof **and** the homepage review schema (`aggregateRating`) in sync and truthful.
3. Never fabricate or paraphrase a review into a claim the customer didn't make.

---

## 4. Inbound-response workflow — drafted replies (live 2026-07-17)

Every customer email to `info@tunedyota.com` now gets a reply draft written automatically and
saved in Gmail for Aaron to review. Nothing is ever auto-sent. This cuts inbox labor while keeping
every outbound message on-brand and NEPQ-aligned.

**How it works:**

- `inbox-sweep` (`netlify/functions/inbox-sweep.js`) runs every 15 minutes. When it sees an
  unprocessed customer inquiry or thread reply, it calls Claude Sonnet (`claude-sonnet-4-6`) to
  draft a reply, then saves that draft **in the same Gmail thread** via `drafts.create`
  (`lib/gmail.js`). The message receives the Gmail label `ty-drafted`.
- **Nothing auto-sends.** Aaron opens Gmail, reads the draft, edits if needed, and hits Send.
  This is a labor-reduction tool, not an automation shortcut.

**NEPQ governs every draft:**

The drafting engine (`lib/email-draft.js`) is grounded in two owner-editable files:
- `docs/sales/nepq-playbook.md` — the governing sales framework (strategy): diagnose before
  quoting, never lead with a bare price, every reply ends with exactly ONE question, mirror the
  customer's words, neutral low-pressure language, 3-option quotes when presenting pricing,
  never block a ready-to-book buyer.
- `docs/email-voice.md` — tone guide: short, direct, overlander-to-overlander, zero AI-speak.

Updating either file retunes every future draft without a code deploy.

**Sensitive emails get immediate attention:**

Complaints, warranty/refund/legal topics, and any low-confidence classification are labeled
`ty-flagged` AND Slack-notified to Aaron immediately — they don't wait for the next digest.

**3× daily batch review instead of all-day inbox monitoring:**

`inbox-digest` (`netlify/functions/inbox-digest.js`) fires at **8am / noon / 7pm CT** and sends
Aaron an email listing pending `ty-drafted` threads (sender, subject, gist) plus a Slack
one-liner. Zero drafts = zero digest noise. This creates 3 predictable review windows instead of
continuous inbox monitoring. The digest counts only `ty-drafted` threads — pre-existing manual
drafts do not pollute the count.

**What the draft checks before saving (`checkDraftShape` in `lib/email-draft.js`):**
- Ends with exactly one question or one micro-commitment (1–3 question marks).
- No banned pressure phrases (from the NEPQ playbook's non-negotiables list).
- Carries Aaron's sign-off, and isn't too short.

If the shape check fails, one retry then `ty-flagged` for manual handling. The
"never a bare price to a cold 'how much?'" rule is enforced upstream in the draft
**prompt** (the NEPQ deflect-with-purpose instruction), not by the shape validator.

---

## 5. Brand guardrails (LOCKED — applies to ALL copy)

- No "Kevin Whitman". No "Stage 2/3". No "MAF".
- Turbo tier is **"Turbo Performance Calibration"**.
- Emissions-**intact** positioning only.
- Pricing you don't have a number for → **"Call for pricing"** (Magnuson/custom/supercharger).
- **Grep the repo for banned terms before shipping any copy.**

---

## 6. Definition of done

- [ ] Asset carries the correct per-city UTM.
- [ ] Copy passes the brand-guardrail grep.
- [ ] Any new/edited SEO page: ran `npm run build:seo`, tests green, verified live (see `ship`).
- [ ] Spend and bookings are attributable in Funnel Events for the monthly report (SOP 9 / measurement).

**Related:** [SOP 2 Lead Tracking](sop-lead-tracking.md) · [SOP 3 Booking](sop-event-booking.md) · [SOP 7 Event Scheduling](sop-event-scheduling.md)

# Review-Request Email — full copy + drop-in builder

For **Workflow 2** (post-event review request + referral) in
[additive-workflows-draft.md](additive-workflows-draft.md). Voice matches the existing
`netlify/functions/lib/templates.js` customer emails; brand-safe per [[brand-rules-locked]]
(no "free", honest drivability claims, emissions-intact positioning, no banned terms).

**Merge fields** (from the Airtable `Bookings` record + resolved installer):
`{First}` (first word of Name) · `{Vehicle}` · `{City}` · `{Installer}` (name) · `{Phone}` ·
`{ReviewURL}` (Google "write a review" link — from GBP setup) · `{FindTuneURL}`
(`https://tunedyota.com/find-your-exact-tune?utm_source=email&utm_medium=review-request&utm_campaign=referral`).

---

## Subject (pick one — A/B candidates)
- **A.** `How's your {Vehicle} driving, {First}?`
- **B.** `How's the {Vehicle} feeling after your tune?`
- **C.** `Quick favor about your {Vehicle}?`

## Preheader
`Two minutes to tell us how it's driving — and help another Toyota owner find us.`

---

## Body copy (customer-ready)

> Hi {First},
>
> It's been a little while since **{Installer}** dialed in your **{Vehicle}** at our **{City}**
> event — we hope it's been a different truck to drive ever since. Sharper throttle, smoother
> shifts, and the right gear when you actually want it.
>
> If it's living up to that, would you take two minutes to share it? A quick **Google review**
> is the single biggest way you can help other Toyota and Lexus owners find honest, in-person
> tuning — and it genuinely means a lot to a small crew like ours.
>
> **[ Leave a Google review → ]**  *(button → {ReviewURL})*
>
> Know someone whose Toyota or Lexus deserves the same? Send them our way — they can find
> their exact tune and the next event near them in under two minutes.
>
> **[ Find Your Exact Tune → ]**  *(button → {FindTuneURL})*
>
> And if anything isn't driving the way you expected, just reply to this email or call
> **{Installer}** at **{Phone}** — we'd rather hear from you and make it right.
>
> Thanks for trusting us with your build.
>
> — Tuned Yota · Undeniable Performance

---

## Plain-text version (for the email `text` part)

```
Hi {First},

It's been a little while since {Installer} dialed in your {Vehicle} at our {City} event —
we hope it's been a different truck to drive ever since. Sharper throttle, smoother shifts,
and the right gear when you actually want it.

If it's living up to that, would you take two minutes to share it? A quick Google review is
the single biggest way you can help other Toyota and Lexus owners find honest, in-person
tuning — and it genuinely means a lot to a small crew like ours.

Leave a Google review: {ReviewURL}

Know someone whose Toyota or Lexus deserves the same? Send them our way — they can find
their exact tune and the next event near them in under two minutes:
{FindTuneURL}

And if anything isn't driving the way you expected, just reply to this email or call
{Installer} at {Phone} — we'd rather hear from you and make it right.

Thanks for trusting us with your build.

— Tuned Yota · Undeniable Performance
```

---

## Drop-in builder (matches templates.js house style)

Reusable whether we implement Workflow 2 as an n8n **Code** node or add it to
`templates.js`. Uses the same `esc()` helper and inline-style conventions as the other
builders; brand button styled with the site's blue (`#B3D0D9`) on ink.

```js
// buildReviewRequestEmail(booking, inst, opts) -> { subject, html, text }
//   booking: an Airtable Bookings record's `fields` (Name, Vehicle, City, ...)
//   inst:    resolved installer { name, phone }
//   opts:    { reviewUrl, findTuneUrl }
function buildReviewRequestEmail(booking, inst, opts = {}) {
  const first = (booking.Name || "there").split(" ")[0];
  const vehicle = booking.Vehicle || "Toyota";
  const city = booking.City || "your area";
  const reviewUrl = opts.reviewUrl || "https://search.google.com/local/writereview"; // set from GBP
  const findTuneUrl = opts.findTuneUrl ||
    "https://tunedyota.com/find-your-exact-tune?utm_source=email&utm_medium=review-request&utm_campaign=referral";

  const subject = `How's your ${vehicle} driving, ${first}?`;

  const text =
    `Hi ${first},\n\n` +
    `It's been a little while since ${inst.name} dialed in your ${vehicle} at our ${city} ` +
    `event — we hope it's been a different truck to drive ever since. Sharper throttle, ` +
    `smoother shifts, and the right gear when you actually want it.\n\n` +
    `If it's living up to that, would you take two minutes to share it? A quick Google ` +
    `review is the single biggest way you can help other Toyota and Lexus owners find ` +
    `honest, in-person tuning — and it genuinely means a lot to a small crew like ours.\n\n` +
    `Leave a Google review: ${reviewUrl}\n\n` +
    `Know someone whose Toyota or Lexus deserves the same? Send them our way — they can ` +
    `find their exact tune and the next event near them in under two minutes:\n${findTuneUrl}\n\n` +
    `And if anything isn't driving the way you expected, just reply to this email or call ` +
    `${inst.name} at ${inst.phone} — we'd rather hear from you and make it right.\n\n` +
    `Thanks for trusting us with your build.\n\n— Tuned Yota · Undeniable Performance\n`;

  const btn = (href, label, bg, color) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${color};` +
    `font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;` +
    `font-size:15px;margin:6px 0">${esc(label)}</a>`;

  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px;line-height:1.5">` +
    `<h2 style="color:#5B4B42">How's it driving, ${esc(first)}?</h2>` +
    `<p>It's been a little while since <strong>${esc(inst.name)}</strong> dialed in your ` +
    `<strong>${esc(vehicle)}</strong> at our <strong>${esc(city)}</strong> event — we hope ` +
    `it's been a different truck to drive ever since. Sharper throttle, smoother shifts, and ` +
    `the right gear when you actually want it.</p>` +
    `<p>If it's living up to that, would you take two minutes to share it? A quick Google ` +
    `review is the single biggest way you can help other Toyota and Lexus owners find honest, ` +
    `in-person tuning — and it genuinely means a lot to a small crew like ours.</p>` +
    `<p>${btn(reviewUrl, "Leave a Google review →", "#B3D0D9", "#23303a")}</p>` +
    `<p>Know someone whose Toyota or Lexus deserves the same? Send them our way — they can ` +
    `find their exact tune and the next event near them in under two minutes.</p>` +
    `<p>${btn(findTuneUrl, "Find Your Exact Tune →", "#5B4B42", "#ffffff")}</p>` +
    `<p>And if anything isn't driving the way you expected, just reply to this email or call ` +
    `<strong>${esc(inst.name)}</strong> at <strong>${esc(inst.phone)}</strong> — we'd rather ` +
    `hear from you and make it right.</p>` +
    `<p>Thanks for trusting us with your build.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p>` +
    `</div>`;

  return { subject, html, text };
}
```

## Notes / owner inputs
- **`{ReviewURL}`** comes out of your **GBP setup** — use the Google "write a review" short
  link (Business Profile → Ask for reviews → copy link). Until it exists, the builder falls
  back to a generic Google review URL placeholder.
- Send **once per booking** — Workflow 2 stamps `Review Requested = true` on the record after
  sending so nobody gets it twice (see the workflow draft).
- Timing: **2 days after the event** reads as genuine (tune has been driven) without feeling
  automated. Adjustable in the schedule/filter.
- A **+7-day second nudge** for non-openers is drafted below.

---

# +7-Day Second Nudge (non-openers)

A single follow-up sent ~7 days after the first review request, **only to people who didn't
open it**. Shorter, lighter, one ask. Same brand guardrails; sent once.

## Who gets it — targeting logic

The honest definition of "non-opener" needs **Resend open tracking**. Two ways to wire it,
pick based on whether open-tracking is on:

**Option 1 — true non-openers (recommended).** When Workflow 2 sends the first email, save
the Resend message id to the booking (new field **`Review Email ID`**) and enable Resend
open tracking. Either (a) subscribe an n8n **Webhook** to Resend's `email.opened` event and
stamp **`Review Opened = true`**, or (b) in this workflow, GET the message status from Resend
by id. Then the nudge targets:
```
Review Requested = TRUE  AND  Review Opened != TRUE  AND  Reviewed != TRUE
AND  Review Nudged != TRUE  AND  (today − first-request date) >= 7 days
```

**Option 2 — simplest (no open tracking).** Nudge anyone who hasn't reviewed yet (practically
the same goal, just not open-gated). Drop the `Review Opened` clause; keep `Reviewed != TRUE`
(owner ticks `Reviewed` when a review lands) + `Review Nudged != TRUE` + the 7-day window.

Either way, stamp **`Review Nudged = true`** after sending so it goes out **once**.
*(New Airtable checkbox columns the owner adds: `Review Opened` and/or `Review Nudged`,
and text field `Review Email ID` if using Option 1a/b.)*

## Subject (A/B candidates)
- **A.** `Still loving the {Vehicle}? (30 seconds)`
- **B.** `One quick thing, {First}`
- **C.** `No rush — just checking in on your {Vehicle}`

## Preheader
`If the tune's treating you right, a quick review goes a long way.`

## Body copy (customer-ready)

> Hi {First},
>
> Just circling back — if your **{Vehicle}** has been driving the way you hoped since
> **{Installer}** tuned it, a quick **Google review** would mean a lot. It takes about 30
> seconds, and it's the best way to help the next Toyota or Lexus owner find honest, in-person
> tuning.
>
> **[ Leave a quick review → ]**  *(button → {ReviewURL})*
>
> No pressure at all — and if anything isn't quite right, just reply here or call
> **{Installer}** at **{Phone}** and we'll make it right.
>
> Thanks again,
> — Tuned Yota · Undeniable Performance

## Plain-text version

```
Hi {First},

Just circling back — if your {Vehicle} has been driving the way you hoped since {Installer}
tuned it, a quick Google review would mean a lot. It takes about 30 seconds, and it's the
best way to help the next Toyota or Lexus owner find honest, in-person tuning.

Leave a quick review: {ReviewURL}

No pressure at all — and if anything isn't quite right, just reply here or call {Installer}
at {Phone} and we'll make it right.

Thanks again,
— Tuned Yota · Undeniable Performance
```

## Drop-in builder

```js
// buildReviewNudgeEmail(booking, inst, opts) -> { subject, html, text }
// Shares the esc() helper + house style with buildReviewRequestEmail. Single CTA (review).
function buildReviewNudgeEmail(booking, inst, opts = {}) {
  const first = (booking.Name || "there").split(" ")[0];
  const vehicle = booking.Vehicle || "Toyota";
  const reviewUrl = opts.reviewUrl || "https://search.google.com/local/writereview"; // set from GBP

  const subject = `Still loving the ${vehicle}? (30 seconds)`;

  const text =
    `Hi ${first},\n\n` +
    `Just circling back — if your ${vehicle} has been driving the way you hoped since ` +
    `${inst.name} tuned it, a quick Google review would mean a lot. It takes about 30 ` +
    `seconds, and it's the best way to help the next Toyota or Lexus owner find honest, ` +
    `in-person tuning.\n\n` +
    `Leave a quick review: ${reviewUrl}\n\n` +
    `No pressure at all — and if anything isn't quite right, just reply here or call ` +
    `${inst.name} at ${inst.phone} and we'll make it right.\n\n` +
    `Thanks again,\n— Tuned Yota · Undeniable Performance\n`;

  const btn = (href, label, bg, color) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${color};` +
    `font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;` +
    `font-size:15px;margin:6px 0">${esc(label)}</a>`;

  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px;line-height:1.5">` +
    `<h2 style="color:#5B4B42">Still loving the ${esc(vehicle)}, ${esc(first)}?</h2>` +
    `<p>Just circling back — if your <strong>${esc(vehicle)}</strong> has been driving the ` +
    `way you hoped since <strong>${esc(inst.name)}</strong> tuned it, a quick Google review ` +
    `would mean a lot. It takes about 30 seconds, and it's the best way to help the next ` +
    `Toyota or Lexus owner find honest, in-person tuning.</p>` +
    `<p>${btn(reviewUrl, "Leave a quick review →", "#B3D0D9", "#23303a")}</p>` +
    `<p>No pressure at all — and if anything isn't quite right, just reply here or call ` +
    `<strong>${esc(inst.name)}</strong> at <strong>${esc(inst.phone)}</strong> and we'll ` +
    `make it right.</p>` +
    `<p>Thanks again,</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p>` +
    `</div>`;

  return { subject, html, text };
}
```

## Nudge notes
- **One nudge only** — no third email. Two touches is the polite ceiling for a review ask.
- Drops the referral CTA on purpose: a nudge converts best with a **single** ask.
- If you skip open-tracking (Option 2), this still works great — it just nudges anyone who
  hasn't reviewed rather than strictly non-openers.

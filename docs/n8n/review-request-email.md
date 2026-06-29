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
- If you later want a **second nudge** (e.g. +7 days to non-openers), we add a follow-up step
  gated on the same flag — say the word and I'll draft that variant too.

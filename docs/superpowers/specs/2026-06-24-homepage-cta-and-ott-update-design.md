# Homepage CTA buttons + "Free OTT Update" funnel intent — Design

**Date:** 2026-06-24
**Status:** Draft for owner review

## Goal

Add two prominent, near-top calls-to-action on the homepage and wire the second
into the existing booking funnel so existing customers can request a free
re-flash that is visibly distinguished from a new-customer tune.

- **Button 1 — "Book Event Time Slot NOW"** → new customers → existing booking
  funnel (`find-your-exact-tune.html`).
- **Button 2 — "Schedule my FREE OTT Update"** → existing customers (free
  re-flash) → same funnel with an `?intent=update` flag that reframes the copy
  and tags the resulting lead/booking as an OTT Update.

## Placement (approach A2 — keep existing CTA + add a dedicated band)

Keep the hero CTA (`Find Your Exact Tune →`) and the existing mid-page `.band`
untouched. Insert a **new dedicated `.band`** immediately after the trust strip
(`.tstrip`, `site/index.html:170`) and before the "Why Tuned Yota" section — the
top of the scrollable body, satisfying "within immediate reach."

New band reuses existing `.band`, `.cta-row`, and `.btn` styles:

```html
<div class="band">
  <h2>Ready when you are.</h2>
  <p>Book your spot at an upcoming event — or, if you're already tuned, grab your free OTT calibration update.</p>
  <div class="cta-row">
    <a class="btn p" href="find-your-exact-tune.html">Book Event Time Slot NOW</a>
    <a class="btn o" href="find-your-exact-tune.html?intent=update">Schedule my FREE OTT Update</a>
  </div>
</div>
```

Copy is adjustable during review. Button labels are the owner's exact requested
strings.

## Funnel behavior: `?intent=update` (`site/find-your-exact-tune.html`)

1. **Read the flag on load** (alongside the existing `ATTR` block):
   `S.intent = new URLSearchParams(location.search).get('intent')`.
2. **Reframe step 0** when `S.intent === 'update'`:
   - eyebrow → `Free OTT Update`
   - h1 → `Schedule your free OTT update.`
   - sub → `Already running a Tuned Yota calibration? Pick your vehicle and we'll get you re-flashed to the latest at an event near you.`
3. **Tag the submission** so re-flashes are distinguishable:
   - Booking payload (`$("#fSubmit")` handler): add
     `source: S.intent === 'update' ? 'OTT Update' : 'find-your-exact-tune'`.
   - Legacy Netlify lead payload (`submitNetlifyLead`): set its `source` field to
     `OTT Update` when `intent=update` (client-only, no server change).

## Server changes (minimal — corrects an earlier "no server change" note)

- **`netlify/functions/book.js`**: replace the hardcoded
  `Source: "find-your-exact-tune"` (booking record) with
  `Source: d.source || "find-your-exact-tune"`. Backward compatible; existing
  callers omit `source` and keep the old value. Apply the same `d.source`
  fallback to the Priority List record so full/no-event update requests are
  tagged too.
- **`netlify/functions/lib/templates.js`**: in `buildBookingInstallerEmail` and
  `buildPriorityInstallerEmail`, when `d.source === 'OTT Update'`, prepend a row
  `Request type: Free OTT Update (existing customer re-flash)` so the installer
  sees it at a glance, not just in Airtable.

## Testing

- Add a `tests/book.test.js` case: a booking submitted with `source: 'OTT Update'`
  creates an Airtable record with `Source === 'OTT Update'` and an installer
  email whose text contains `Free OTT Update`.
- Existing book tests stay green (the `|| "find-your-exact-tune"` fallback
  preserves current behavior).
- `tests/booking-ui.test.js` / templates tests updated if they assert on the
  installer email body.

## Out of scope (YAGNI)

- No new Netlify function, no new standalone page, no slot deep-linking (the
  funnel still starts at vehicle selection — Button 1's "NOW" is framing, not a
  one-click-to-slot).
- Email **delivery** depends on the separate Resend domain-verification fix
  (`send.tunedyota.events`); these changes don't touch that and won't deliver
  notifications until that DNS step lands.

## Deploy

Per the `ship` skill: run `npm test`, run `npm run build:seo` (confirm it does
not overwrite the hand-edited `index.html` body; it injects schema/OG/sitemap),
then push to `master`. Verify the live homepage shows both buttons and that
`find-your-exact-tune.html?intent=update` reframes correctly.

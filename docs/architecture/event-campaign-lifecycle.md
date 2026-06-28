# Tuned Yota — Per-Event Campaign Lifecycle

A deeper zoom into stages ①+④+⑤ of the [end-to-end workflow](tuned-yota-workflow.md): the
repeatable rhythm that runs for **every event city** in
[`docs/events/2026-2027-event-plan.md`](../events/2026-2027-event-plan.md), syncing graphics,
organic posts, email, and paid — and recycling the captured content into the next event.
This is the operational form of §8 of the
[master advertising plan](../marketing/master-advertising-plan.md). Regenerate the PNG with
`node docs/architecture/render-workflow.js`.

![Tuned Yota per-event campaign lifecycle](event-campaign-lifecycle.png)

```mermaid
flowchart TD
  A["T−6 weeks · Announce + open paid geo-ring<br/>event flyer · where-we-tune map"]
  B["T−4 weeks · Education + proof push<br/>dyno cards · before/after reels"]
  C["T−2 weeks · 'Slots filling' + email the region<br/>countdown card · email"]
  D["Event week · Daily countdown · SMS roster nudge<br/>↳ event-reminders.js rosters 30/15/10/2/0d"]
  E["Event day · Live stories/reels · dyno pulls · reactions<br/>capture everything — shoot once"]
  F["+1 week · Recap · testimonials · review requests<br/>'next stop' → Priority List rebook"]
  A --> B --> C --> D --> E --> F
  F -. captured content recycles into the next event .-> A
```

## Where the pieces come from
- **Graphics** → the [ad-template kit](../marketing/ad-templates/) (event flyer per city/UTM,
  dyno cards, countdown, testimonial, recap).
- **Roster automation** → `event-reminders.js` already fires installer rosters + customer
  notices on its own schedule; the campaign rides alongside it.
- **Email/SMS** → the region's Airtable list (booked + Priority List).
- **Review engine** → the +1-week step is where Google reviews get asked for (the local-ranking
  lever) and testimonials get filmed → both recycle to the top of the funnel.

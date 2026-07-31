# Multi-truck exception: one booking per client per event, with a granted second

Date: 2026-07-30 · Status: awaiting Aaron's review · Owner: booking funnel + installer console

## Rule (Aaron, 2026-07-30)

**One booking per client per event.** A client may book other events (another
vehicle, another date) freely — the rule is per event. A second vehicle at the
*same* event is an exception: **the client requests it, the installer grants it**,
and the granted slot should be **back-to-back** with the client's existing slot
when one is open.

Today nothing enforces the rule: `book.js` checks slot availability, not client
uniqueness. So this feature is two halves — the default guard, then the
exception path.

## Design principle

Reuse the machinery that shipped 2026-07-30/31. A blocked duplicate becomes a
**Priority List row** (the same path `priority()` in `book.js` already uses for
"Event full" / "No event scheduled"), which the console already renders under
the ⏳ Waitlist tab with a Reason badge. The installer's *grant* is the existing
**convert** action. The client's existing booking is already visible on that
lead card via the match-suggestion strip (same phone/email). No new endpoints,
no new console subsystem.

## Funnel guard (`netlify/functions/book.js`)

- When listing the event's taken slots (the existing `filterByFormula` read),
  also request `Name`, `Phone`, `Email` fields.
- Before the slot-conflict check: if any non-Cancelled booking for this
  city+date shares the requester's normalized phone or email
  (`normalizePhone`/`normalizeEmail` from `lib/leads.js`), do **not** create a
  second booking. Instead:
  - Create a Priority List row via the existing `priority()` helper with
    **`Reason: "Multi-truck request"`** (new select option; `typecast: true`
    auto-adds it), `Event Date` = the event, and — the back-to-back preference —
    **`Requested Slot` = the open slot adjacent to the client's existing slot**
    (existing slot index ±1 within the event's open list; prefer the later
    neighbor; blank when neither neighbor is open). `book.js` holds both the
    client's current slot and `open` at this moment, so the computation is a
    few lines and costs nothing later.
  - Fire the existing `book-background` notification with the reason, so the
    installer's Slack/email names it a multi-truck request (not generic
    waitlist copy).
  - Return a new status: `{ status: "multi-truck", existingSlot, suggestedSlot }`.
- The guard applies only to the public funnel. Console-created bookings
  (convert, walk-in) are deliberate installer actions and stay unrestricted.

## Funnel UI (`site/find-your-exact-tune.html` booking step)

New `multi-truck` status renders a friendly confirmation, not an error:

> "You're already booked for this event (10:20). Bringing a second truck?
> We've flagged it for [installer first name] — he'll confirm a back-to-back
> slot (10:40 looks open) and you'll get a confirmation."

Copy adapts when `suggestedSlot` is blank ("he'll find the closest slot").

## Console (no new code expected)

Multi-truck request rows arrive as leads and already get, from the shipped
lead-connections work:

- the ⏳ **Waitlist** sub-tab + badge — reading "⏳ Waitlist — Multi-truck
  request · 2026-08-01 · wanted 10:40";
- the 🔗 **match strip** showing the client's existing booking ("Looks booked
  already: Eli Soetenga — Madison · Aug 1 · 10:20") — the anchor the installer
  grants against. **Do not tap Link on these** — linking is for duplicate leads;
  this lead represents a second, separate booking-to-be. (Accepted UX risk;
  revisit if mislinks happen.)
- **Grant = the existing convert flow**: date pre-filled by the event quick-pick,
  time = the requested/back-to-back slot, creating the second Bookings record.
  Decline = "Not now" stage, with a courtesy text via the card's chat button.

The only console change worth making: when a lead's `Reason` is
"Multi-truck request", the waitlist badge label swaps "wanted" for
"back-to-back:" so the suggested slot reads as the plan, not a preference.

## Edge cases

- Same client, different event/date/city → allowed, untouched.
- The adjacent slot gets taken between request and grant → installer sees the
  roster; convert writes whatever time they choose (owner-freedom rule; convert
  has never slot-checked).
- Client with neither phone nor email match (different contact info for truck
  #2) → guard can't see them; they book normally. Acceptable — the guard is a
  capacity courtesy, not a security boundary.
- Two requests for a third truck → each is its own request row; the installer
  sees the pattern in the match strip.

## Testing (tests first)

- `book.js`: duplicate phone (formatted `+1…` vs bare) at same event → status
  `multi-truck`, Priority row created with Reason + adjacent `Requested Slot`;
  duplicate email likewise; same phone at a *different* event date → books
  normally; no neighbor open → `Requested Slot` blank, `suggestedSlot` empty;
  slot-adjacency math (first slot, last slot, both neighbors taken).
- Funnel: status rendering incl. blank `suggestedSlot` (manual/live smoke, repo
  practice).
- Console badge label swap: covered by the installer-roster/lead view tests if
  practical, else live smoke.

## Rollout

1. Ship guard + funnel copy + badge tweak; tests green → commit → push.
2. Live smoke: attempt a duplicate booking for a real upcoming event with a
   test contact that matches an existing booking's phone; confirm no second
   Bookings row, the request row lands with the adjacent slot, the installer
   notification names it, and the console Waitlist tab shows it correctly.
3. Convert the smoke request from the console; confirm the second booking lands
   back-to-back and the lead flips to Booked.

## Out of scope

- Client self-serve second bookings (rejected: capacity stays installer-gated).
- Auto-linking the two bookings of one client (customer 360 already shows them
  together by phone).
- Enforcing the one-per-event rule on console-created bookings.

# Tuned Yota — Website

Fresh, standalone marketing site for Tuned Yota (Toyota & Lexus performance tuning).
Static HTML — no build step. The deployable site lives in [`site/`](site/);
`site/index.html` is the home page.

- **18 pages:** home, interactive tune finder, FAQ, OTT explainer, team, + 13 vehicle pages.
- **Self-contained:** installer photos are bundled in `site/images/`. The only
  external dependencies are Google Fonts, the Leaflet map library + OpenStreetMap
  tiles, YouTube review embeds, and social links — nothing depends on Wix.
- **Lead capture:** the tune finder submits to the Netlify `tune-lead` form,
  which routes each lead to the assigned installer (CC info@) and auto-replies
  to the customer via Resend. If the submit fails it falls back to opening the
  customer's email app to info@tunedyota.com. See
  [Lead capture](#lead-capture-one-time-setup) below for one-time setup.

## Contact
(612) 406-7117 · info@tunedyota.com

## Deploy

`tunedyota.com` is live on Netlify, and the repo is **GitHub-connected: every push
to `master` auto-builds and publishes.** `git push origin master` *is* the deploy —
you do not run `netlify deploy` manually.

There is no Netlify build command (`netlify.toml` just sets publish dir `site/` and
functions in `netlify/functions/`), so the SEO assets are generated **locally before
you push** if you changed any SEO input:

```sh
npm run build:seo   # only if you changed events, page title/description, the page set, or reviews
npm test            # must pass — includes the SEO/structure checks
git push origin master
```

Then confirm the Netlify dashboard shows the latest commit **Published** (deploys have
occasionally been skipped on account billing limits — don't assume), and spot-check the
live page. The full procedure is captured in the `ship` skill (`.claude/skills/ship/`).

The Netlify CLI (`netlify deploy` / `netlify deploy --prod`) still works as a manual
preview/fallback, but it is **not** the normal workflow.

## Lead capture (one-time setup)
Tune-finder leads POST to the Netlify form **`tune-lead`** (stored under
**Netlify → Forms**) and trigger `netlify/functions/submission-created.js`,
which routes each lead to the assigned installer (CC info@) and sends the
customer an auto-reply via [Resend](https://resend.com).

1. **Resend:** create an account, **verify the `tunedyota.com` domain** (add the
   SPF/DKIM DNS records Resend shows) so mail can send from
   `info@tunedyota.com`. Create an API key.
2. **Netlify env var:** set `RESEND_API_KEY` in **Site settings → Environment
   variables**, then redeploy.
3. **Backstop:** in **Netlify → Forms → Form notifications**, keep an email
   notification to `info@tunedyota.com` enabled — if Resend or the function ever
   fails, you still get the raw lead and it stays in the dashboard.

Installer routing lives in `netlify/functions/lib/routing.js` (keyed by
`MARKETS[i].inst`). Unknown/empty keys fall back to Aaron / info@.

## Tests
`npm test` runs the lead-routing unit tests (`node --test`, no dependencies).

## Editing data
All site data lives in the `<script>` block of `site/find-your-exact-tune.html`:
`VEHICLES` (years/engines/prices), `INSTALLERS` (bios/photos/contact),
`MARKETS` (event cities + coordinates; add a `date:` field for event dates).
Lead delivery is handled by the Netlify form + function described above.

## Event booking (time slots + Priority List)
The tune finder's booking step offers **live time slots** (12 per city per event
date: 9:00–12:40, 3/hour) and rolls overflow / unscheduled cities to a **Priority
Event List**. See the design + plan in
[`docs/superpowers/specs/2026-06-17-event-booking-slots-design.md`](docs/superpowers/specs/2026-06-17-event-booking-slots-design.md)
and [`docs/superpowers/plans/2026-06-17-event-booking-slots.md`](docs/superpowers/plans/2026-06-17-event-booking-slots.md).

**Functions:** `netlify/functions/availability.js` (live open slots) and
`netlify/functions/book.js` (reserve a slot or add to the Priority List, then send
email + `.ics` calendar invite + optional SMS). Shared logic is in
`netlify/functions/lib/` and unit-tested with `npm test`.

**Setup (one-time):**
1. **Event dates:** set `EVENTS_SHEET_ID` to your published event sheet and give at
   least one active city a parseable ISO date (e.g. `2026-07-12`). Until then every
   city falls back to the Priority List.
2. **Airtable:** create the base per
   [`docs/superpowers/specs/airtable-schema.md`](docs/superpowers/specs/airtable-schema.md),
   then set `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID`.
3. **SMS (optional):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
   after completing A2P 10DLC registration. SMS is skipped (no error) until then.

See [`.env.example`](.env.example) for the full variable list. A booked slot is one
with `Status` ≠ `Cancelled`; free a slot by setting its Airtable row to `Cancelled`.

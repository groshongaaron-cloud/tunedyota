# Tuned Yota — Website

Fresh, standalone marketing site for Tuned Yota (Toyota & Lexus performance tuning).
Static HTML — no build step. The deployable site lives in [`site/`](site/);
`site/index.html` is the home page.

- **18 pages:** home, interactive tune finder, FAQ, OTT explainer, team, + 13 vehicle pages.
- **Self-contained:** installer photos are bundled in `site/images/`. The only
  external dependencies are Google Fonts, the Leaflet map library + OpenStreetMap
  tiles, YouTube review embeds, and social links — nothing depends on Wix.
- **Lead capture:** the tune finder opens the customer's email app to
  info@tunedyota.com (`LEAD_ENDPOINT` in `site/find-your-exact-tune.html` is blank).
  Paste a Formspree endpoint there later for dashboard capture.

## Contact
(612) 406-7117 · info@tunedyota.com

## Deploy (Netlify CLI)

Deploys are driven by `netlify.toml` (publish dir `site/`, functions in
`netlify/functions/`) — no `--dir` flag needed.

```sh
# one-time
npm i -g netlify-cli
netlify login

# preview deploy (private URL, safe to test — includes functions)
netlify deploy

# go live on the Netlify subdomain
netlify deploy --prod
```

Connect `tunedyota.com` in **Netlify → Site settings → Domain management**
only when ready — that cutover replaces the current live Wix site.

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

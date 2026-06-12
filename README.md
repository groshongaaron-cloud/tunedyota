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

```sh
# one-time
npm i -g netlify-cli
netlify login

# preview deploy (private URL, safe to test)
netlify deploy --dir=site

# go live on the Netlify subdomain
netlify deploy --dir=site --prod
```

Connect `tunedyota.com` in **Netlify → Site settings → Domain management**
only when ready — that cutover replaces the current live Wix site.

## Editing data
All site data lives in the `<script>` block of `site/find-your-exact-tune.html`:
`VEHICLES` (years/engines/prices), `INSTALLERS` (bios/photos/contact),
`MARKETS` (event cities + coordinates; add a `date:` field for event dates),
`LEAD_ENDPOINT` (Formspree URL).

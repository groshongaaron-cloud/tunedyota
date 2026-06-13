# Spec A — Lead Capture + Territory Routing

**Date:** 2026-06-12
**Status:** Approved design — ready for implementation plan
**Part of:** Funnel upgrade (decomposed into A: lead capture/routing, B: urgency blocks, C: measurement layer). This is Spec A, the foundation.

## Problem

The tune finder (`site/find-your-exact-tune.html`) already runs the full funnel —
Make → Model → Year/Engine → Goals → public-priced Result → Book — and already
ties every event market to an installer via `MARKETS[i].inst`. But lead delivery
is a stub: `LEAD_ENDPOINT` is blank, so a submission only opens the customer's
mail app addressed to `info@tunedyota.com`. Consequences:

- Nothing lands in a durable dashboard.
- Leads are **not** routed to the assigned installer — Noah and Cody never
  receive their own leads; everything funnels to info@ manually.
- No record of what the customer was quoted, what they wanted, or where they
  came from (no marketing attribution).

## Goal

Capture every lead in a shared dashboard and route it server-side to the
assigned installer (CC info@), send the customer an instant branded
confirmation, and enrich each lead with goals, quoted prices, and marketing
attribution — without losing the existing mailto fallback.

Out of scope (separate specs): urgency blocks (B), funnel-step measurement (C).
This spec stops at: lead captured, routed, both parties emailed.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Capture + routing mechanism | Netlify Forms (single form) + `submission-created` Netlify Function |
| Email sender | Resend (free tier) |
| From address | `info@tunedyota.com` (Resend domain-verified) |
| Routing rule | Per-market via existing `inst:` data, fallback to info@ / Aaron |
| Notifications | Installer + info@ CC'd, **plus** customer auto-reply |
| Extra lead data | Selected goals, quoted prices, attribution (referrer + utm_*) |
| Backstop | Keep Netlify's built-in form notification to info@ enabled |

## Architecture & data flow

A single Netlify form captures every lead into one shared dashboard
(app.netlify.com). A `submission-created` function does routing server-side, so
no secrets touch the client and no extra round-trip is needed.

1. Customer completes the funnel and submits.
2. JS builds a form-encoded payload and `POST`s it to `/` with
   `form-name=tune-lead`.
3. Netlify records the submission (central dashboard) and runs spam filtering
   (honeypot `bot-field` + Akismet).
4. On a clean (non-spam) submission, the `submission-created` function fires
   automatically, looks up the installer's email by key, and sends via Resend:
   - **Lead email** → assigned installer, **CC `info@tunedyota.com`**.
     `Reply-To` set to the customer's email so the installer can reply directly.
   - **Auto-reply** → the customer ("Thanks — [installer] will reach out…",
     branded). `Reply-To` set to `info@tunedyota.com`.
5. The page shows the existing on-page success screen.
6. **If the POST fails** (network / Netlify error), the page falls back to the
   current mailto behavior so a lead is never lost.

## Components / files

### `site/find-your-exact-tune.html` (modify)

- Add a **hidden, Netlify-detectable** form so Netlify registers `tune-lead` at
  deploy time:
  - `name="tune-lead"`, `data-netlify="true"`, `netlify-honeypot="bot-field"`.
  - Hidden `<input>` for every field we submit (Netlify only stores fields it
    saw at build time): `name`, `phone`, `email`, `market`, `installer_key`,
    `installer_name`, `vehicle`, `goals`, `quote_base`, `quote_custom`,
    `quote_sc`, `message`, `source`, `referrer`, `utm_source`, `utm_medium`,
    `utm_campaign`, plus the honeypot `bot-field`.
- On page load, read `document.referrer` and parse `utm_*` from
  `location.search` into module state (persist to `sessionStorage` so they
  survive step navigation).
- Rewrite the `#fSubmit` handler:
  - Build a `URLSearchParams` body including `form-name=tune-lead`,
    `installer_key` (the `m.inst` key: `aaron`/`noah`/`cody`), `goals`
    (comma-joined labels), `quote_base/custom/sc` (from the selected `cfg`),
    and the attribution fields.
  - `POST` to `/` with `Content-Type: application/x-www-form-urlencoded`.
  - On `res.ok` → `showSuccess(false)`. On failure → `openMail(payload)` +
    `showSuccess(true)` (existing fallback path).
- Keep the existing Meta Pixel `Lead` event fire in `showSuccess`.

### `netlify/functions/submission-created.js` (new)

- Triggered automatically by Netlify on every verified (non-spam) submission of
  any form; guard on `payload.form_name === "tune-lead"`.
- Routing table (installer key → display name + email), mirroring `INSTALLERS`:
  - `aaron` → `info@tunedyota.com`
  - `noah` → `noah@tunedyota.com`
  - `cody` → `cody@tunedyota.com`
  - Fallback (unknown/missing key) → `aaron` / `info@tunedyota.com`.
- Read fields from `payload.data`. Send two emails via Resend REST API
  (`https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}`):
  1. **Installer notification** — to installer email, `cc: info@tunedyota.com`,
     `reply_to: <customer email>`, from `Tuned Yota <info@tunedyota.com>`.
     Body: vehicle, market, goals, quoted prices, message, attribution, contact.
  2. **Customer auto-reply** — to customer email, from
     `Tuned Yota <info@tunedyota.com>`, `reply_to: info@tunedyota.com`.
     Branded confirmation naming the assigned installer + phone, with a "call to
     book faster" line.
- Pure routing logic (`keyToInstaller(key)`) extracted so it is unit-testable
  without network. Email-template builders also pure (take data → return
  `{subject, html, text}`).
- Resilience: wrap each Resend call in try/catch; log failures (the lead is
  already safe in the Netlify dashboard + the built-in backstop notification).
  A failed send must not throw the function (avoid retry storms).

### `netlify.toml` (new, repo root)

```toml
[build]
  publish = "site"
  functions = "netlify/functions"
```

### Netlify dashboard (manual, one-time — documented in README)

- Set env var `RESEND_API_KEY`.
- Keep the built-in **form-submission email notification** to
  `info@tunedyota.com` enabled (backstop if Resend/function fails).

### Resend (manual, one-time — documented in README)

- Create account; **verify `tunedyota.com`** by adding the DNS records Resend
  provides (SPF/DKIM), so mail can send from `info@tunedyota.com`.

### `README.md` (modify)

- Update deploy: `netlify deploy --prod` now driven by `netlify.toml` (functions
  ship automatically; `--dir=site` no longer needed).
- Document the `RESEND_API_KEY` env var, Resend domain verification, and the
  backstop notification setting.

## Routing logic detail

The page already resolves the installer in `selectMarket()` from
`MARKETS[i].inst`. We additionally submit that **key** (`aaron`/`noah`/`cody`)
as `installer_key`. The function maps key → email. No changes to `MARKETS` or
`INSTALLERS` data. Current resulting coverage (unchanged):

- Eau Claire & Madison WI, all Iowa, Fargo ND, all Minnesota → **Aaron / info@**
- Green Bay & Milwaukee WI (rest of WI) → **Noah**
- Sioux Falls, Rapid City, Omaha → **Cody**
- No market selected / unknown key → **Aaron / info@** (fallback)

## Error handling / resilience

| Failure | Behavior |
|---|---|
| Client POST to `/` fails | Fall back to `mailto:` (existing UX); success screen notes "we opened your email". |
| Submission is spam | Netlify drops it; `submission-created` never fires. No email noise. |
| Unknown / missing `installer_key` | Function routes to Aaron / info@. |
| Resend API error | Caught + logged; lead is still in the Netlify dashboard AND the built-in backstop notification still emailed info@. Function does not throw. |
| `RESEND_API_KEY` unset | Function logs and exits cleanly; backstop notification still delivers the lead. |

## Testing

- **Local:** `netlify dev` serves the form + functions locally. Submit a test
  lead per installer market and confirm the function selects the right
  recipient (inspect logs / Resend dashboard in test mode).
- **Unit:** `keyToInstaller()` and the template builders are pure — test
  routing (each key + unknown → fallback) and that templates include the key
  fields, with no network.
- **Spam:** fill the `bot-field` honeypot → assert no `submission-created` fires.
- **Fallback:** simulate a failed POST → assert the mailto path opens and the
  success screen shows the mail-fallback copy.
- **Attribution:** load the page with `?utm_source=meta&utm_campaign=test`,
  submit, and confirm the values reach the dashboard + installer email.

## Cost

Stays within free tiers at current volume: Netlify Forms (100 submissions/mo),
Resend (3,000 emails/mo, 100/day), Netlify Functions (ample free invocations).

## Privacy

Lead PII is stored in Netlify Forms (US region) and transits Resend for email
delivery. No new third parties beyond these two. The auto-reply and installer
email both originate from `info@tunedyota.com`.

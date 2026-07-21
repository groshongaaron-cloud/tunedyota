# Meta DM Feeder — Activation Runbook (Messenger + Instagram)

Code is live and dormant (spec `2026-07-20-meta-dm-feeder-design.md`): the webhook
fails closed until the env vars below exist. Owner does the Meta clicks; each
"→ Claude" line is the handoff.

## Phase A — Facebook Messenger (works in Development Mode, ~1 sitting)

1. **Create the app:** developers.facebook.com → My Apps → Create App → type
   **Business** → name "Tuned Yota DM". (Log in with the account that admins the
   Tuned Yota Facebook Page.)
2. **App secret:** App Settings → Basic → App Secret → Show. → **Claude:** set as
   Netlify env `META_APP_SECRET` (clipboard flow — never in chat).
3. **Verify token:** invent a random string (or ask Claude to generate one). →
   **Claude:** set as `META_VERIFY_TOKEN`.
4. **Add Messenger:** Dashboard → Add Product → **Messenger** → Set up.
5. **Page token:** Messenger → Messenger API Settings → Generate token for the
   Tuned Yota Page (grants `pages_messaging`, `pages_manage_metadata`). →
   **Claude:** set as `META_PAGE_TOKEN`. (Redeploy after env changes — stale-deploy gotcha.)
6. **Webhook:** same Messenger settings → Configure webhooks →
   Callback URL `https://tunedyota.com/.netlify/functions/meta-dm`, Verify token =
   the string from step 3 → Verify and save (the GET handshake must pass — env
   must be set FIRST). Subscribe the Page to the **messages** field.
7. **Data deletion callback (Meta requires it):** App Settings → Basic → **User
   data deletion** → choose "Data deletion callback URL" and paste
   `https://tunedyota.com/.netlify/functions/meta-data-deletion`
   The endpoint (shipped 2026-07-21, `tests/meta-data-deletion.test.js`) verifies
   Meta's `signed_request` against `META_APP_SECRET`, deletes every `fb:`/`ig:`
   Chat Sessions row for that user, and returns the `{ url, confirmation_code }`
   JSON the spec requires; the same URL doubles as the user-facing status page.
   A store failure answers 500 and Slack-notifies, so Meta retries.
8. **Smoke test:** from a personal account, PM the Page. Expect: AI answer in
   Messenger within seconds · Slack "New facebook DM" ping · ask for a human +
   give contact/vehicle/city → escalation SMS/push → session in the console
   Chats tab → reply from the console → reply appears in Messenger.

## Phase B — Instagram DMs (Meta-gated, days-to-weeks)

Prereq (already true per owner): IG account is Business/Creator AND linked to the
Facebook Page.

1. **Add product:** Dashboard → Add Product → **Instagram** → set up Instagram
   messaging with the linked account.
2. **App Review:** request **Advanced Access** for `instagram_manage_messages`
   (+ `instagram_basic`, `pages_manage_metadata`). Meta wants a screencast: record
   the Phase-A Messenger flow (DM → AI reply → human handoff) and describe the
   identical IG use. Business Verification may be requested — follow their steps
   (business documents for Tuned Yota LLC).
3. **On approval:** Webhooks → **Instagram** object → subscribe **messages** with
   the same callback URL + verify token. No code changes, no new env.
4. **Smoke test:** DM the IG account; same expectations as Phase A step 7.

## Env registry
| Var | What |
|---|---|
| `META_APP_SECRET` | App Settings → Basic (webhook HMAC auth) |
| `META_VERIFY_TOKEN` | invented string (webhook handshake) |
| `META_PAGE_TOKEN` | Page access token (send API + profile lookup, both platforms) |
| `META_GRAPH_VERSION` | optional, default v22.0 |

Inbound keeps working (leads never lost) even if `META_PAGE_TOKEN` is missing —
only outbound replies pause, with a Slack alert.

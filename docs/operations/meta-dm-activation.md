# Meta DM Feeder — Activation Runbook (Messenger + Instagram)

Code is live and dormant (spec `2026-07-20-meta-dm-feeder-design.md`): the webhook
fails closed until the env vars below exist. Owner does the Meta clicks; each
"→ Claude" line is the handoff.

## Phase A — Facebook Messenger (works in Development Mode, ~1 sitting)

> **STATUS 2026-07-21: COMPLETE — full smoke passed with real traffic** (DM → AI reply →
> escalation → CRM lead channel=facebook → console reply back into Messenger). Gotchas
> hit, for the record: the Page must be POST-subscribed to the `messages` field
> (`/me/subscribed_apps` — the dashboard checkbox alone had never been set); dev mode
> only delivers DMs from app-role accounts; installer-turn delivery had to be awaited
> (Lambda freezes fire-and-forget work — commit 252428c). **Still dev-mode: real
> customers can't reach the bot until App Review (pages_messaging Advanced Access) +
> Live mode.**

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

## Phase A→Public — App Review for `pages_messaging` (real customers can DM)

Dev mode only delivers DMs from app-role accounts. Going public = Business
Verification + Advanced Access on `pages_messaging` + Live mode. Checked against
Meta's process 2026-07-21; expect a few business days to ~2 weeks of review.
Submit **Messenger only** — Instagram gets its own submission after its dev-mode
smoke (an undemonstrable permission risks the whole review).

> **STATUS 2026-08-03: REJECTED — screencast only.** Verdict: "your app's use
> case is allowed" but the screencast "does not show a message being sent from
> your app UI and the same message appearing in the native client." This is the
> exact beat that was cut from the 07-22 phone recording (accepted risk at
> submission). Nothing about testability or credentials was raised — the
> no-tester-account gamble held. **Fix = re-record only**; use case text,
> permission scope, and Business Verification all stand. See
> **Resubmission #2** below.

### Resubmission #2 — re-record + resubmit (2026-08-03 plan)

Reviewer's three required shots, verbatim: **(1) asset selection (Page
visible), (2) a live send action from your app, (3) the delivered message in
the native client.** Plus general rules: English UI, captions/tool-tips
explaining buttons, and — because ours is a **server-to-server app** (webhook +
Page token, no user-facing Facebook Login) — the submission must SAY so, which
excuses the "complete Meta login flow" requirement.

**Recording setup (no phone-filming this time):**
- Use the **Windows 11 Snipping Tool screen recorder** (Win+Shift+R → record a
  region) — NOT Game Bar (Win+Alt+R records a single app window; beats 3–4
  need two windows in frame). Record at least 1080p region, landscape.
- Arrange for beats 3–4: installer console (tunedyota.com console, Chats tab)
  and **messenger.com in a second browser window side-by-side** so the send
  and the native-client delivery appear in the SAME frame with no cut.
- Record clean (no narration needed). Drop the raw file in `Downloads\` —
  Claude burns in timed English captions with ffmpeg and encodes to
  Meta-friendly MP4 (≤3 min target).
- DM from a role account (dev mode only delivers those) — Aaron's personal
  account with a Tester/Admin role is fine.

**Shot list (one continuous recording, ~2–3 min):**
1. **Asset selection (~15s):** App Dashboard → Messenger → Messenger API
   Settings, showing the **Tuned Yota Page** connected as the token'd Page.
   ⚠️ Do NOT click "Show" on the token. Caption: "Server-to-server app — our
   webhook receives Page messages; the Page admin generated this Page access
   token here. No user-facing Facebook Login exists in the product."
2. **Inbound + AI reply:** messenger.com → DM the Tuned Yota Page
   "Do you tune 4Runners?" → AI answer arrives. Caption: "Customer messages
   our Page; our app receives it via webhook and replies (pages_messaging
   send)."
3. **Escalation:** "Can I talk to a real person?" → answer the bot's
   name/phone/city/vehicle questions → handoff confirmation. Caption: "The
   assistant collects contact details and notifies our staff."
4. **THE MONEY SHOT — live send from app UI:** side-by-side windows. In the
   installer console Chats tab, open the conversation, type a **visibly unique
   reply** so the reviewer can match it in both frames — e.g.
   `TY staff reply · demo 4RUNNER-7788` (any unique, legible string works; avoid
   generic "Sure, we can help"). Click **Send** — caption pointing at the button:
   "Staff replies from our app UI — this Send uses the pages_messaging Send API."
   The reply then pops into the messenger.com thread in the adjacent window.
   Caption: "Same message delivered in the native Messenger client." Keep BOTH
   the console send and the Messenger arrival on screen together, no cut.
5. **Close (~5s):** linger on the Messenger thread showing the full
   conversation.

**Submission changes:**
- Attach the new screencast.
- Use-case description: same as below PLUS the server-to-server paragraph
  (added 2026-08-03) — Meta's rejection text explicitly asks server-to-server
  apps to say so.
- "0 of 1 API calls" check: the recording itself fires fresh Send API calls;
  verify the permission page shows ≥1 call (up to 24h lag) before submitting.
- Tester account: not required by this verdict, but adding one (any willing
  real account as Tester in App Roles) removes the last known rejection vector
  — Aaron's call, he declined last round.

**After approval:** unchanged — re-smoke from a NON-role account; Page FAQ
automation already OFF (2026-07-22). Then Phase B (IG) reusing this playbook.

1. **Business Verification (start FIRST — it gates Advanced Access):**
   business.facebook.com → Settings → **Security Centre → Start Verification**.
   Verify the business (legal entity: **1st Minnesota Lending, LLC** — "Tuned
   Yota" is its DBA; use legal name + address as on formation docs; a utility
   bill / bank statement / EIN letter matching them works). COMPLETED 2026-07-21.
2. **Switch the app Live:** App Dashboard top bar → toggle **App Mode: Live**.
   (Reviewers must be able to test during review. Public DMs still won't flow
   until the permission is granted — expected.)
3. **Record the screencast** (phone screen-record is fine, 1–3 min, no cuts):
   a. Open facebook.com/&lt;TunedYotaPage&gt; → tap **Message**.
   b. Send "Do you tune 4Runners?" → show the AI answer arriving.
   c. Send "Can I talk to a real person?" → answer the bot's questions
      (name/phone/city/vehicle) → show the handoff confirmation message.
   d. Show the installer console Chats tab (tunedyota.com console) with the
      conversation, type a reply → show it arriving in the Messenger thread.
4. **Submit:** App Dashboard → **App Review → Permissions and Features** →
   `pages_messaging` → **Request Advanced Access** → attach the screencast +
   paste the two texts below.
   Form gotchas learned 2026-07-21:
   - **Trim the request cart to `pages_messaging` ONLY.** The dashboard flow
     had auto-collected 7 extra permissions (oEmbed ×2, Marketing API tier,
     pages_show_list, pages_manage_metadata, pages_utility_messaging,
     business_management, pages_read_engagement) — each demands its own
     screencast/test-call/justification and none is needed: we admin our own
     Page, standard access covers everything except public messaging.
   - **"0 of 1 API calls":** the form requires ≥1 successful Send API call,
     registering with up to 24h lag. Any live bot reply counts; a manual
     `POST /me/messages` into an open thread also works.
   - **Tester account for the reviewer:** add a REAL Facebook account (not a
     generated test user) as Tester in App Roles and put its login in the
     form's test-credentials field, so the reviewer can DM the Page while the
     app is in dev mode.
5. **After approval:** re-run the §7 smoke from a NON-role account (borrow a
   friend's) — that's the real proof customers can reach the bot.

**Use-case description (paste):**
> Tuned Yota (tunedyota.com) is a Toyota/Lexus vehicle-calibration business.
> Our app connects our Facebook Page's Messenger to our website's existing
> customer-service assistant. When a customer messages our Page, the app
> receives the message via webhook and replies in Messenger with answers about
> our services (supported vehicles, pricing, appointment questions). If the
> customer asks for a human, the assistant collects their contact details and
> hands the conversation to one of our installers, who replies from our staff
> console; the app delivers that reply back into the same Messenger thread.
> pages_messaging is required to receive customers' messages to our Page and
> send these replies. We message only users who message our Page first, within
> the standard messaging window. Data handling: conversation transcripts are
> stored in our CRM; users can request deletion via our registered data
> deletion callback. Privacy policy: https://tunedyota.com/privacy
>
> Note for the reviewer: this is a SERVER-TO-SERVER app. There is no
> user-facing Facebook Login flow anywhere in the product — the app receives
> Page messages via webhook and sends replies using a Page access token that
> the Page admin generated in the App Dashboard (Messenger API Settings). The
> screencast therefore shows the Page asset selection in the App Dashboard in
> place of a login flow, per the App Review guidance for server-to-server
> apps. The screencast then shows the end-to-end flow: a customer message to
> our Page, the app's automated reply, a staff member sending a reply from our
> app UI (staff console), and that same message delivered in the native
> Messenger client, side-by-side with no cuts.

**Reviewer test instructions (paste) — honest / screencast-only (2026-08-04):**
> This is a server-to-server app (webhook + Page access token; no user-facing
> Facebook Login). Because the app is currently in Development Mode, the Page's
> automated replies are delivered only to accounts that have a role on this app —
> a reviewer messaging the Page from a non-role account will not receive an
> automated reply. The complete end-to-end flow is therefore demonstrated in the
> attached screencast rather than via live hands-on testing:
> 1. A customer message to our Page ("Do you tune 4Runners?") and the app's
>    automated reply — receive + send on pages_messaging.
> 2. The assistant escalating to a human and collecting name, phone, city, and
>    vehicle.
> 3. A staff member typing and sending a reply from our app UI (staff console),
>    and that exact message appearing in the native Messenger client,
>    side-by-side with no cuts.

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

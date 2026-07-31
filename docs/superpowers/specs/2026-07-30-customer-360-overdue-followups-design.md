# Customer 360 view · Overdue leads tab · Follow-up messages — design

Date: 2026-07-30
Status: approved (brainstorming) — proceeding to plan + build

Three console features that close the CRM gap identified in the 2026-07-30 audit: the
console had world-class *action* surfaces (roster, chats, calls, leads) but no unified
*customer* surface, overdue follow-ups cluttered the active lead stages, and a follow-up
reminder couldn't carry the message the installer intended to send. One data spine ties
all three together: the customer's phone number (normalized to its last 10 digits).

## 1. Customer detail view ("Customer 360")

**Entry points.** Tapping the customer's name anywhere it appears — booking card, lead
card, chat thread header, call row — calls `openCustomerView({phone, name, email})`.
Names become tappable; everything else on the cards stays as-is.

**UI.** Full-screen overlay (reviewov pattern, scrollable like the AMSOIL one):
- Header: name, vehicle, phone; the standard contact actions (Call / Text / Call as TY /
  💬 Open chat / Email) reusing the exact flows the Leads tab already has.
- One chronological timeline (newest first) merging four record types:
  - 🔧 Bookings (all-time, incl. past events): date, city, status, calibration,
    cert-sent, "view signature" link when present.
  - 🧲 Lead: stage, channel, next follow-up, and the full activity log.
  - 💬 Chat sessions: channel badge, last activity, snippet; tapping jumps to the
    thread in the Chats tab (closes the overlay).
  - 📞 Calls: direction, date, duration, missed highlighting.
- Loading/error states match house style: bounded fetch (15s abort), explicit
  "couldn't load" with retry, 401 clears the token and reloads.

**Server: `netlify/functions/customer-view.js`** (GET `?phone=…&email=…`, installer
token auth, fail-closed). Phone matching is done in JS on normalized last-10-digits
(`normalizePhone` from lib/leads.js) because stored phone formats are free text —
`filterByFormula` can't be trusted for this. Email (lowercased) is a secondary matcher
for leads only. Fetches in parallel:
- **Bookings**: `listAllRecords` on the Bookings table, matched by phone. Non-admin →
  only rows with `Installer === key`; admin → all. Fields limited to what the timeline
  shows (no wholesale record dump).
- **Leads**: `listAllRecords` on Priority List, matched by phone or email, scoped with
  the existing `scopeLeads` rule.
- **Chat sessions**: the phone-matching session lookup that already exists in
  lib/chat-store.js (Session ID prefix / Phone field), same visibility the Chats tab
  grants.
- **Calls**: two Twilio queries (`Calls.json?To=+1<digits>` and `?From=+1<digits>`,
  PageSize 50 each), deduped by sid, mapped to the same row shape call-log.js returns.
  Calls are business-line-wide, exactly as the Calls tab already exposes them.
Response: `{ status:"ok", bookings:[…], leads:[…], chats:[…], calls:[…] }` — grouped
arrays; the client merges and sorts. Any single source failing degrades to an empty
array with a `partial:true` flag rather than failing the whole view.

## 2. Overdue sub-tab in Leads

The Leads tab gets a sub-tab strip (same visual pattern as the Jobs sub-tabs):
**Active | ⏰ Overdue (n)**.

- Overdue = active-stage lead (`New/Contacted/Qualified/Following up`) with
  `nextFollowup <= today` — the rule `renderTabs` already uses for the badge.
- Overdue leads render **only** in the Overdue list, removed from the stage lists, so
  Active stays uncluttered (owner decision 2026-07-30).
- Overdue list sorts most-overdue first. Each card is a focused reminder: name,
  vehicle, "⏰ N days overdue", the saved follow-up message preview (italic quote), and
  one primary **💬 Send follow-up** button. The full lead card (stages, convert,
  notes) stays reachable by expanding the card — close-out powers aren't lost, the
  default view is just focused.
- The Leads main-tab badge continues to show the overdue count (unchanged rule, now
  consistent with a dedicated place to act on it).

## 3. Follow-up with a message

**Setting.** The follow-up row on a lead card keeps the quick-picks (Today / Tomorrow /
+3d / +1wk) and gains a custom `<input type="date">` plus an optional
"Message to send (optional)" textarea. Setting a follow-up stores both.

**Storage.** New Airtable long-text field **`Follow-up Message`** on Priority List.
All writes go through `updateTolerant` with the field in `optionalKeys`, so a base
missing the column degrades gracefully (date still saves). Deploy step adds the column
(Meta API if the token has schema scope, else a note for the owner).

**Server.** `applyLeadUpdate` changes in lib/leads.js:
- `setFollowup` accepts `{date, message}`; message is trimmed, capped at 500 chars,
  cleared when the date is cleared. Activity line: `follow-up set 2026-08-02 — "msg…"`.
- New action `followupSent` `{note}`: sets `Last Contact = today`, clears
  `Next Follow-up` + `Follow-up Message`, logs `follow-up sent: "…"`. Used by the UI
  after a successful send from a reminder.
- `toLeadView` exposes `followupMessage`.
lead-update.js passes both actions through (tolerant keys extended).

**Sending (approved flow: prefilled draft, one tap to send).** **💬 Send follow-up** on
a reminder card runs the existing `openSms` chat flow and sets `STATE.chatPrefill` to
the saved message (fallback: the standard personal prefill). The installer lands in
the thread with the message in the composer — glance, edit, send. A pending-followup
marker (`STATE.followupPending = {leadId, sessionId}`) survives the navigation; when
the chat reply succeeds **for that session**, the client fires
`leadUpdate(leadId, {action:'followupSent', note})` and clears the marker. Navigating
away without sending leaves the follow-up untouched (it stays overdue). Chats are
online-only, so follow-up sends are too — the offline queue is not involved.

## Out of scope

- No cross-installer data exposure: non-admins never see another installer's bookings
  or leads in the 360 view, even for a shared customer.
- No customer merge/dedupe UI; matching is by normalized phone (+ email for leads).
- No email-channel timeline entries (Gmail is not integrated).
- No auto-send of follow-up messages (explicitly rejected in brainstorming).

## Testing

- `customer-view`: auth 401; phone normalization matches formatted/spaced numbers;
  non-admin scoping (own bookings/leads only, 0 leakage); admin sees all; email
  matches leads; Twilio calls deduped by sid; single-source failure → partial result.
  All deps injected (`listImpl`, `fetchImpl`).
- `leads`: setFollowup with message stores + logs; message cap; clear-date clears
  message; followupSent sets Last Contact, clears both fields, logs the note.
- Page static wiring: customer-view endpoint referenced with `x-installer-token`;
  Overdue sub-tab markup present; Send follow-up wired to openSms; followupSent wired
  to the chat reply success path.

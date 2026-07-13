# AMSOIL Attach — 3-Day Follow-Up — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project B1** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]). First of B's four close-out features.

---

## 1. Goal

Turn every completed tune into a tracked AMSOIL opportunity and a **proactive, tailored customer touch**: three days after the tune, email the customer their exact AMSOIL fluids + a Preferred-Customer ("save up to 25%") pitch with the dealer-referral (`?zo=`) link — driving the first fluids order / PC enrollment. The certificate already gives them the fluids passively at close-out; this is the active follow-up that converts.

## 2. Scope

**In:** a pure AMSOIL follow-up **email builder**; a daily **scheduled sweep** that sends it ~3 days post-tune to every completed booking with a customer email; a **backfill floor** so first run doesn't email historical customers; a **reply-based opt-out** honored via an Airtable checkbox; idempotency + failure alerting consistent with `certificate-dispatch`.

**Out (later / other sub-projects):** VIN decode, mileage photo, digital sign-off (rest of B); a dedicated AMSOIL-Leads CRM table with a status pipeline; a hosted one-click unsubscribe endpoint + suppression list (deferred hardening — see §7); tracking actual AMSOIL conversions (AMSOIL owns the sale data via `?zo=` device attribution; our measurable = emails sent).

## 3. Approach

**The opportunity IS the completed booking.** The prospect list is simply `Bookings` where `Status=Completed` and `Email` is present — the customer, vehicle, installer, and date are already on the record, and the AMSOIL bundle is derivable via `resolveFluids(vehicle, modelYear)`. So there is **no new table and no close-out code change** — only a downstream sender + a guard column. (A dedicated leads table with statuses was considered and deferred as overkill.)

## 4. Components

### 4.1 `netlify/functions/lib/amsoil-email.js` (new, pure)
- **Purpose:** build the follow-up email `{ subject, html, text }`.
- **Input:** `{ name, vehicle, modelYear, fluids }` where `fluids` is a `resolveFluids(...)` result (or null).
- **Output — email-client-safe HTML** (inline styles, table-free-or-simple, images by absolute URL — no reliance on `<style>` or SVG): a branded header with the **official AMSOIL logo** (`https://tunedyota.com/images/amsoil/amsoil-logo.png`, unaltered per brand guide), a short "keep your tuned `<vehicle>` healthy" lede, the vehicle's **fluids list** (system · AMSOIL product · stock number · capacity · severe-service interval), a prominent **"Shop your exact fluids / Enroll & save up to 25%"** button → the pre-filtered garage URL (`fluids.garageUrl`, already `?zo=`-routed on order), and a **footer opt-out line**: "You're receiving this because Tuned Yota tuned your `<vehicle>`. Reply UNSUBSCRIBE to stop AMSOIL emails." No QR (email links are clickable).
- **Depends on:** `resolveFluids` output only (caller resolves). Pure — no I/O.

### 4.2 `netlify/functions/amsoil-followup.js` (new, scheduled)
- **Pattern:** mirrors `certificate-dispatch.js` — `runAmsoilFollowup(deps)` with injected `env`, `now`, `list`, `update`, `send`, `notify`, `log`; thin `handler`.
- **Query (`filterByFormula`):** `AND({Status}="Completed", NOT({AMSOIL Email Sent}), NOT({AMSOIL Opt-Out}), {Email}!="")`.
- **In-JS window filter** (date math with injected `now`, so it's testable):
  - `floor` = `env.AMSOIL_FOLLOWUP_START` (ISO date). Skip any booking whose `Calibration Date` < floor (**backfill guard** — no emailing pre-launch customers).
  - `dueBy` = `now − 3 days`. Send only when `Calibration Date` ≤ `dueBy` (a catch-up `≤`, not `==`, so a missed run self-heals). Skip anything more recent than 3 days.
- **Per row:** `resolveFluids(f.Vehicle, f["Model Year"])`; if null → **skip, leave unmarked** (rare non-catalog vehicle; self-heals if the catalog grows; they still got the cert QR). Else build via `amsoil-email`, `send` (Resend, `from` = `Tuned Yota <events@send.tunedyota.events>`, `replyTo` = `info@tunedyota.com`), then `update` the booking `{"AMSOIL Email Sent": <today ISO>}`.
- **Idempotency:** the `AMSOIL Email Sent` stamp + the `NOT({AMSOIL Email Sent})` filter guarantee one send per booking.
- **Failure handling:** per-row try/catch → `log.error` + a Slack alert via `notify` (same relay/webhook pattern as `certificate-dispatch`); one row failing never blocks the rest. Returns `{ ok, sent, skipped, found }`.

### 4.3 `netlify.toml`
Add: `[functions."amsoil-followup"]  schedule = "0 15 * * *"` (15:00 UTC ≈ 10am Central — staggered an hour after `certificate-dispatch` at `0 14 * * *`).

## 5. Data model (Airtable — Bookings, additive)

| Field | Type | Purpose |
|-------|------|---------|
| `AMSOIL Email Sent` | Date | Idempotency guard + "emails sent" measurement |
| `AMSOIL Opt-Out` | Checkbox | Owner ticks it when a customer replies UNSUBSCRIBE; the sweep skips it |

Both **owner-added manually** (Airtable metadata API unusable here). Writes are made directly (not via a booking that could pre-date the columns) — but the sweep should still be resilient: if `AMSOIL Email Sent` doesn't exist yet, the send would repeat, so **the columns must exist before the function is scheduled/enabled** (gate rollout on it — §9).

## 6. Data flow

Tune completed → (Cert v2) cert emailed immediately → **3 days later** the daily sweep matches the booking → tailored AMSOIL email sent → `AMSOIL Email Sent` stamped. Owner's prospect list = a Bookings view `Status=Completed AND Email present` (build it in Airtable; the bundle per row is derivable).

## 7. Opt-out & compliance

This is a marketing email → CAN-SPAM applies. **v1:** a clear reply-based opt-out ("Reply UNSUBSCRIBE to stop") landing at `info@` (via `replyTo`), honored by the owner ticking `AMSOIL Opt-Out` on the customer's booking(s); the sweep excludes opted-out rows. **Limitation:** opt-out is per-booking — a repeat customer with multiple bookings needs each ticked (rare; acceptable for v1). **Deferred hardening:** a hosted one-click unsubscribe link + an email-keyed suppression list (honors opt-out across all of a customer's bookings automatically) — its own small spec if/when volume warrants.

## 8. Error handling & edge cases

- Unresolvable vehicle (no catalog match) → skip, leave unmarked (self-heals).
- No customer email → excluded by the query.
- Opted-out → excluded by the query.
- Too recent (< 3 days) or pre-floor → skipped by the JS window.
- Send failure → logged + Slack alert; row left unmarked so the next run retries.
- Missing columns → must be added before enabling (rollout gate).

## 9. Testing

- **`amsoil-email.js`:** subject + html include the vehicle, fluids rows (product + stock number + interval), the shop/enroll button with the `?zo=` garage URL, the opt-out line; null-fluids handled (builder is only called with resolved fluids, but assert it degrades safely).
- **`amsoil-followup.js`:** sends + marks for an in-window completed booking; **skips** pre-floor, too-recent (<3d), already-sent, opted-out, and no-email rows; unresolvable vehicle skipped-unmarked; idempotent across two runs; send failure → row unmarked + notify called. All via injected `now`/deps (no network).
- Full suite green before ship.

## 10. Owner inputs / rollout

1. **Add 2 Airtable Bookings columns:** `AMSOIL Email Sent` (Date), `AMSOIL Opt-Out` (Checkbox) — **before** the function is scheduled.
2. **Set `AMSOIL_FOLLOWUP_START`** (Netlify env, ISO date = go-live day) — the backfill floor.
3. `RESEND_API_KEY` + `SLACK_WEBHOOK_URL` already configured (reused).
- Rollout: build behind tests → add columns + env → add the `netlify.toml` schedule → deploy via `ship` (confirm branch, push, verify) → confirm the first eligible send after 3 days (or verify with a transient test row per the testing-airtable-backed-emails pattern).

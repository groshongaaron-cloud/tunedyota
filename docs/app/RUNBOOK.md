# Tuned Yota App — Owner Runbook

The account/service setup **only you can do** (identity, banking, store submission). These are
the **long-lead items** — Apple verification alone can take days — so start them now, in parallel
with the app code. Nothing here needs a Mac. When a step says "→ tell Claude," send me the value
and I'll wire it in.

**Costs:** Apple Developer **$99/yr**, Google Play **$25 one-time**. Firebase + Codemagic have
free tiers that cover us. ≈ **$125 to start.**

Do them in this order (roughly slowest-to-verify first).

---

## 1. Apple Developer Program  ✅ DONE
> **STATUS 2026-08-02: ENROLLMENT COMPLETE** — Aaron confirmed the entity-corrected
> enrollment is live. Historical detail below kept for the paper trail.
> **STATUS 2026-07-21:** LEGAL ENTITY CORRECTED — the business's legal entity is
> **1st Minnesota Lending, LLC** ("Tuned Yota" is its DBA; a separate "Tuned Yota LLC"
> does not exist). D-U-N-S **03-502-7760** arrived 2026-07-21 for 1st Minnesota Lending.
> The enrollment (Team ID `YR2H93A5X7`, already wired into the live AASA) was started
> under the incorrect name "Tuned Yota LLC" → entity-correction request FILED with Apple
> Developer Support 2026-07-21, **case ID 102948524602**; on Apple's confirmation,
> complete the enrollment with this D-U-N-S.
> Note: the App Store *seller* line will show the LLC name (Apple displays the D&B legal
> name for Organizations); the app itself still displays as "Tuned Yota". If seller-line
> branding matters, D&B can add "Tuned Yota" as a tradestyle on the D-U-N-S record.
1. Go to **developer.apple.com/programs** → Enroll. Sign in with the Apple ID you want to own the app.
2. Choose account type:
   - **Individual** — fastest (published as your personal name). Recommended to start.
   - **Organization** — publishes as "Tuned Yota LLC," but requires a free **D‑U‑N‑S number**
     (apple.com/DUNS) which can add days. Only if you want the company name on the listing.
3. Pay the $99. Apple verifies identity (can take 24–48h+).
4. → **Tell Claude** when it's active (I don't need credentials — just the go-ahead + the Team ID
   shown in your account).

## 2. Google Play Developer  ⏳ (usually same-day) — THE REMAINING BIG ONE
1. **play.google.com/console** → create a developer account, pay $25, verify identity.
   **Register as an ORGANIZATION** (reuse D-U-N-S 03-502-7760): personal accounts
   created since late 2023 must run a 12-tester closed test for 14 days before any
   public release; organization accounts skip that gate.
2. → **Tell Claude** when active.
> Not a blocker for Cody's phone: the Codemagic `tunedyota-android` workflow already
> produces a sideloadable debug APK with no Play account at all.

## 3. Firebase project (for push notifications)  🆓
1. **console.firebase.google.com** → Add project → name it "Tuned Yota".
2. Add an **Android app** (package name `com.tunedyota.app`) and an **iOS app** (bundle ID
   `com.tunedyota.app`). Download the config files if prompted (I'll place them).
3. **iOS push key:** in your Apple Developer account → Certificates, Identifiers & Profiles → Keys
   → create an **APNs Auth Key** (.p8). In Firebase → Project Settings → Cloud Messaging → upload
   that .p8 (with its Key ID + your Team ID). *(This is what lets iOS receive push.)*
4. **Service account:** Firebase → Project Settings → Service accounts → **Generate new private
   key** → downloads a JSON file. **Keep it secret.**
5. → **Give Claude:** the Firebase **project_id** (not secret) and **paste the service-account
   JSON to your clipboard** so I can set it as a secret (see step 4) without it landing in chat.

## 4. Netlify + Airtable wiring  (I do most; you provide access)
1. **Netlify env secret** `FCM_SERVICE_ACCOUNT` = the entire service-account JSON from step 3.4.
   → I'll set this via `netlify env:set` from your clipboard (never printed in chat).
2. ✅ DONE 2026-08-02 — **Airtable "Push Devices" table** created via the Meta API
   (`tblHOLLcBUl5IjnJ7`: Installer / Token / Platform, matching `push-register.js`).
   *(The old "metadata API can't create these" note was wrong — the token in Netlify
   has schema-write scope.)*

## 5. Codemagic (cloud build — compiles iOS without a Mac)  ✅ DONE 2026-08-02
Account created, repo connected, yaml read off `master`. The pipeline is split:
- **`tunedyota-android`** — zero config, manual start, produces a sideloadable debug
  APK + unsigned release .aab. Native projects are committed (72b56e8), so builds
  compile rather than scaffold.
- **`tunedyota-ios`** — needs the Developer Portal integration named exactly
  **`tunedyota-asc`** (hyphens); then it signs itself and publishes to TestFlight.
- **No automatic triggering by design** — daily content pushes must not burn build
  minutes. Start builds from the Codemagic UI, or hand Claude a Codemagic API token
  (avatar → Settings → Integrations → Codemagic API) to trigger/monitor from the CLI.
Play publishing + upload-key signing get wired in the Codemagic UI once step 2 exists.

## 6. Store listings + submit  (after the first build)
When the app builds and lands in TestFlight / Play internal testing:
1. In **App Store Connect** and **Play Console**, fill the listing from
   `docs/app/store-listing.md` (paste-ready): name, description, category, contact. **Privacy
   policy URL is live: https://tunedyota.com/privacy** (review with counsel before relying on it).
   Screenshots: I'll generate templates once the app builds.
   **Put a demo installer passcode in the App Review notes** so reviewers get past sign-in.
2. Add yourself/installers as internal testers → verify on real phones (camera, Face ID, push).
3. **Submit for review.** Apple's first review is the pickiest; our native features (camera scan,
   push, biometric) are the defense against a "just a website" rejection.

---

### What Claude handles (no action from you)
The Capacitor app scaffold, native plugin wiring, the push backend (already built), OTA updates,
brand icons/splash, `codemagic.yaml`, the privacy-policy page, and step-by-step help on every
click above.

### The one-line status you can send me to move forward
"Apple: active · Google: active · Firebase project_id: `xxx` (JSON on clipboard) · Push Devices
table: created · Codemagic: repo connected" — as each becomes true.

## 7. Universal links (deep links into the app)
Two placeholder files ship on the site and must be completed before store submission:
1. ✅ DONE 2026-07-20 — `site/.well-known/apple-app-site-association` carries Team ID `YR2H93A5X7`.
2. `site/.well-known/assetlinks.json` — replace the fingerprint with the **SHA-256 of the Play App Signing key** (Play Console → Setup → App signing) once step 2 is done.
→ Tell Claude the fingerprint and I'll wire + deploy it.

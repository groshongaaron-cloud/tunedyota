# Tuned Yota App — Owner Runbook

The account/service setup **only you can do** (identity, banking, store submission). These are
the **long-lead items** — Apple verification alone can take days — so start them now, in parallel
with the app code. Nothing here needs a Mac. When a step says "→ tell Claude," send me the value
and I'll wire it in.

**Costs:** Apple Developer **$99/yr**, Google Play **$25 one-time**. Firebase + Codemagic have
free tiers that cover us. ≈ **$125 to start.**

Do them in this order (roughly slowest-to-verify first).

---

## 1. Apple Developer Program  ⏳ (days — start FIRST)
> **STATUS 2026-07-20:** Enrollment started as **Organization** ("Tuned Yota LLC"); Team ID
> `YR2H93A5X7` already wired into the live AASA. **Blocked on the D-U-N-S / Dun & Bradstreet
> report** Apple requested — the rest of this runbook resumes when it arrives. If D&B stalls
> past ~2 weeks, apple.com/DUNS has an expedite path, or the Individual account type remains
> the fast fallback (listing shows a personal name; can migrate to Organization later).
1. Go to **developer.apple.com/programs** → Enroll. Sign in with the Apple ID you want to own the app.
2. Choose account type:
   - **Individual** — fastest (published as your personal name). Recommended to start.
   - **Organization** — publishes as "Tuned Yota LLC," but requires a free **D‑U‑N‑S number**
     (apple.com/DUNS) which can add days. Only if you want the company name on the listing.
3. Pay the $99. Apple verifies identity (can take 24–48h+).
4. → **Tell Claude** when it's active (I don't need credentials — just the go-ahead + the Team ID
   shown in your account).

## 2. Google Play Developer  ⏳ (usually same-day)
1. **play.google.com/console** → create a developer account, pay $25, verify identity.
2. → **Tell Claude** when active.

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
2. **Airtable "Push Devices" table:** in the same base as Bookings, create a table named
   **`Push Devices`** with columns: **Installer** (Single line text), **Token** (Single line text),
   **Platform** (Single line text). *(The metadata API can't create these for us — 2-minute manual
   add.)* → **Tell Claude** when it exists.

## 5. Codemagic (cloud build — compiles iOS without a Mac)  🆓 tier
1. **codemagic.io** → sign up with GitHub → authorize the `tunedyota` repo.
2. Later (once the Plan 2 scaffold + `codemagic.yaml` are in the repo) you'll connect **App Store
   Connect** and **Play** publishing + code-signing in Codemagic's UI — I'll give you the exact
   click-path then.

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

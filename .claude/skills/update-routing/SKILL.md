---
name: update-routing
description: Use when adding or removing a Tuned Yota installer, or reassigning which installer covers a market/city — keeps the client booking page and the server lead/booking email routing in sync.
---

# Updating Installer / Market Routing

## Overview

Installer identity lives in **two** files and market→installer assignment in **two more**. The server decides who gets the **booking** email; the client decides who gets the **legacy lead** email and which installer card the customer sees. If they disagree, a market's bookings and leads go to **different people** — and an unknown installer key **silently falls back to Aaron**. Keep all four in sync.

## Sources of truth

| File | Role | Shape |
|---|---|---|
| `netlify/functions/lib/routing.js` → `INSTALLERS` | **Server installer registry.** `keyToInstaller()` resolves the key to route **booking** emails. An unknown key **silently falls back to `FALLBACK_KEY` (aaron)**. | `key:{ key, name, email, phone }` |
| `netlify/functions/lib/markets.js` → `MARKETS[].inst` | **Server market→installer.** `getMarket(city).inst` drives **booking** email routing. | `{ city, state, inst }` |
| `site/find-your-exact-tune.html` → `INSTALLERS` | **Client installer card** ("Meet your installer") + needs a photo asset. | `key:{ name, phone, email, region, photo:"images/<name>.jpg", bio }` |
| `site/find-your-exact-tune.html` → `MARKETS[].inst` | **Client market→installer.** Shows the card AND sets the `installer_key` that routes legacy **lead** emails. | `{ city, state, lat, lng, inst, … }` |

Installer **keys** (`aaron` / `noah` / `cody` / …) must be identical across all four.

## Steps

**Add an installer:**
1. `routing.js` `INSTALLERS`: add `<key>: { key: "<key>", name, email, phone }`. **Required** — without it, any market assigned to the key routes bookings to Aaron.
2. `find-your-exact-tune.html` `INSTALLERS`: add `<key>: { name, phone, email, region, photo: "images/<key-or-name>.jpg", bio }`, and drop the photo at `site/images/`.
3. `setup-airtable.mjs` → `INSTALLERS` array: add the key. **AND** add the matching option to the live Airtable "Installer" single-select (Bookings + Priority List tables) **by hand in the Airtable UI** — editing the script does NOT patch an existing base, and `book.js`/`submission-created.js` writing `Installer:"<key>"` to a single-select that lacks the option can be **rejected/dropped**.
4. `site/team.html`: add the installer's bio card + `Person` schema, and add their name to the page's meta/intro "Aaron … Noah … Cody" name list (grep the existing names to catch every spot). Decorative, but must not contradict the site.

**Reassign a market:**
5. `markets.js`: set that market's `inst` to the key (server → **booking** email).
6. `find-your-exact-tune.html` `MARKETS`: set the **same** market's `inst` to the **same** key (client → card + **lead** email).
7. Fix the **displaced** installers' region copy so it stays truthful — the `region` strings in the booking-page `INSTALLERS` and the `tm-reg` lines in `team.html`.

**Then:**
8. `npm test` — `tests/routing.test.js` sanity-checks `keyToInstaller`, but it does **not** verify client/server parity, so a green run does NOT prove the files agree. Eyeball them, e.g.:
   `node -e "const{getMarket}=require('./netlify/functions/lib/markets.js');const{keyToInstaller}=require('./netlify/functions/lib/routing.js');['Milwaukee','Madison'].forEach(c=>{const m=getMarket(c);console.log(c,m&&m.inst,keyToInstaller(m&&m.inst).email)})"`
9. **Deploy:** push to `master`. Verify by booking a slot in that market (or curl the booking flow) and confirming the email reaches the new installer, and that the booking page shows their card.

## The mismatch trap

- **`markets.js` changed but client `MARKETS` not** → bookings go to the new installer, but the page shows the old one and legacy leads still route to the old one.
- **New key used in a `MARKETS` but missing from `routing.js`** → `keyToInstaller` silently falls back to **Aaron**; that market's bookings never reach the intended installer. Always add to `routing.js` first.
- **New key not added to the live Airtable "Installer" single-select** → `book.js`/`submission-created.js` writes that value and Airtable rejects/drops it. Add the option in the Airtable UI, not just `setup-airtable.mjs`.
- **`team.html` left stale** → the team page contradicts who actually covers a market (and its `Person` schema is wrong).
- **Photo missing** at `site/images/<name>.jpg` → broken installer card image.

## Quick reference

add installer: `routing.js` + client `INSTALLERS` (+ photo) + Airtable choice + `team.html`. reassign market: `markets.js` `.inst` **and** client `MARKETS` `.inst` (same key) + displaced region copy. → `npm test` → push `master` → verify booking email + card.

Related: event scheduling sets a market's `inst` too — see the `schedule-event` skill.

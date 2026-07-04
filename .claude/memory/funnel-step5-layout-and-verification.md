---
name: funnel-step5-layout-and-verification
description: find-your-exact-tune step-5 booking layout is deliberately form-first (booking form above installer card); plus how to drive/verify the funnel in a browser
metadata: 
  node_type: memory
  type: project
  originSessionId: 5dc65e6b-44f7-4e23-afad-16cc858aa763
---

**Step-5 ("Book at an event") layout is intentionally FORM-FIRST** as of 2026-07-04 (master @ 2393974, verified live). Block order inside `section[data-step="5"]`: intro → **map** (must stay above the form — it feeds `#fLoc`/slots) → **booking form (`#leadForm`)** → **review (`#proofBook`)** → **divider (`.tf-or`)** → **installer card (`#instCard`)** → **call buttons (`.tf-call`)**. Design intent: prioritize booking over installer contact — do NOT revert the installer card back above the form. Divider copy is `.tf-or` = "or reach your installer directly" (CSS `text-transform:uppercase` → displays "OR REACH YOUR INSTALLER DIRECTLY"). Step-5 intro sub + `.tf-mapcap` copy were reworded to match this order ("send your details" / "Select a market above, then send your details below"). This is a pure DOM/copy reorder — no id/class/handler/form-action changed, so the JS (all id-based) is unaffected.

**How to drive + verify the funnel in a browser (reusable):**
- Funnel state (`S`, `MARKETS`, `BOOK`) is **closure-scoped, NOT on `window`** — only `go` is global. So you can't set state directly; drive it with real `.click()` on the visible `.tf-opt`/button elements.
- Path to reach step 5: click `Toyota` → a model (e.g. `Tacoma`) → first year/engine option → `See my recommendation →` → `Book at an Event →`. Then click a market tile in `#mktList`/`#mktBar`.
- **Slots come from a LIVE backend**: clicking a market fires `fetch('/.netlify/functions/availability?city=…')` → `renderSlots` fills `#tfSlots`. So a local `file://` open CANNOT populate slots — the market→slot check only works against the deployed production URL. Pick an upcoming dated market (past-dated ones won't yield slots).
- Verified-good signals: `#fLoc` value = "Duluth, MN (July 25, 2026)", `#fVeh` = the chosen vehicle, `#tfSlots` display:block with N slot buttons.
- claude-in-chrome caveat: `resize_window` changes the OS window but NOT Chrome's render viewport width, so the ≤480px mobile media query can't be forced this way — verify mobile stacking order/overflow via `getBoundingClientRect`, not by pixel-inspecting a phone-width render.

Deploy = git push to master (see [[funnel-roadmap-and-lead-setup]]); Netlify siteId `47fd6491-fd07-4f6b-9e1e-20a83e164d36`.

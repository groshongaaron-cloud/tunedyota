# Tuned Yota — Screen-Reader Manual-Test Checklist

A short, repeatable pass to confirm the site sounds right with a real screen reader.
The automated accessibility-tree checks (June 2026) already verified roles, names, and
states — this human pass confirms the *reading flow and feel*. Budget ~20 minutes.

Each item lists **what to do** and **what you should hear** (paraphrased — exact wording
varies by screen reader and verbosity settings). Mark Pass / Fail / Note.

---

## 0. Setup

### NVDA (Windows — free)
- Download & install from nvaccess.org, then press **Ctrl+Alt+N** to start.
- Browse in **Chrome or Firefox**. NVDA reads as you go.
- Keys you need:
  - **Tab / Shift+Tab** — move between interactive controls (links, buttons, fields)
  - **H** — jump to next heading · **D** — next landmark · **K** — next link · **F** — next form field · **B** — next button
  - **Enter / Space** — activate the focused control
  - **Down Arrow** — read the next line (continuous reading)
  - **Insert+F7** — open the Elements List (all headings / links / landmarks)
  - **Ctrl** — stop talking · Quit NVDA: **Insert+Q**
- Tip: turn the **NVDA key** (Insert) volume up; set speech to a comfortable speed.

### VoiceOver (Mac — built in)
- Turn on with **Cmd+F5** (or triple-press Touch ID). Browse in **Safari**.
- "VO" = **Control+Option** (hold both).
- Keys you need:
  - **VO+Right / VO+Left** — move through every item in order
  - **Tab** — next interactive control · **VO+Space** — activate it
  - **VO+U** — open the Rotor; arrow through Headings / Links / Form Controls / Landmarks
  - **VO+A** — read the whole page from here · **Control** — pause
- iPhone (optional, for true mobile): Settings → Accessibility → VoiceOver. Swipe right
  = next item, double-tap = activate, two-finger swipe up = read from top.

---

## 1. Global chrome (test on the homepage, applies to every page)

| # | Do | Expect to hear | P/F |
|---|----|----------------|-----|
| 1.1 | Load `tunedyota.com`, press **Tab** once | "Skip to content, link" — it must be the **first** thing focused | |
| 1.2 | With skip-link focused, press **Enter**, then **Tab** | Focus jumps **past the whole menu** to the first page content (the "Find Your Exact Tune" button) | |
| 1.3 | Open the landmarks list (NVDA **D** repeatedly / VO Rotor → Landmarks) | A **banner** (top), a **navigation**, and a **contentinfo** (footer) | |
| 1.4 | Open the headings list (NVDA **Insert+F7** → Headings / VO Rotor → Headings) | One **heading level 1** ("Undeniable performance…"), then level 2s and 3s — **no skipped levels** (never 1→3) | |
| 1.5 | Tab through the top menu | Each item announced as a link with a clear name (Home, Find Your Tune, Vehicles, OTT Tune, Supercharger, FAQ, Team, "Call / Text") | |
| 1.6 | Tab onto any vehicle card | Reads the model **and** price, e.g. "Toyota Tacoma from $450, link" | |
| 1.7 | While tabbing, watch/listen for the **focus outline** | Every focused control shows a visible ring (sighted check that pairs with SR) | |

## 2. FAQ accordion (`/faq`)

| # | Do | Expect to hear | P/F |
|---|----|----------------|-----|
| 2.1 | Tab to the first question ("What is an OTT Tune?") | "What is an OTT Tune?, **button, collapsed**" (NVDA may say "not expanded") | |
| 2.2 | Press **Enter** (or Space) | State changes to "**expanded**"; the answer text is then readable | |
| 2.3 | Press **Enter** again | Returns to "collapsed"; answer no longer announced as you read on | |
| 2.4 | Tab through several questions | Each is a button with its question as the name; only buttons land in tab order (not the answer text when collapsed) | |
| 2.5 | Tab to a category filter ("All", "Tuning & Drivability"…) | Announced as a button; activating it filters the list | |

## 3. Tune-finder wizard (`/find-your-exact-tune`) — the most important flow

> Goal: complete a booking **start to finish without a mouse**.

| # | Do | Expect to hear | P/F |
|---|----|----------------|-----|
| 3.1 | Load the page | Focus stays at the **top** (you should be able to Tab to the skip-link first — focus is **not** dumped mid-page) | |
| 3.2 | Tab to "Toyota" | "Toyota, **button**" (NVDA may add "not pressed") | |
| 3.3 | Press **Enter** | Advances to the model step; focus moves to the new step's heading and it's read aloud | |
| 3.4 | Tab to a model (e.g. "Tacoma"), **Enter** | Announced as a button; advances to the year/config step | |
| 3.5 | Tab to a config (e.g. "2025+ …"), **Enter** | Announced as a button (reads year + engine + price); advances to goals | |
| 3.6 | Tab to a goal chip (e.g. "More power & torque"), press **Space** | Toggles to "**pressed**"; press Space again → "not pressed" | |
| 3.7 | Continue (the "See my results"/continue button), **Enter** | Native button; advances to the result/price summary | |
| 3.8 | Proceed to booking; Tab through the **market list** | Each city is a button; **Enter** selects it and it reads as "pressed" | |
| 3.9 | If a time-slot grid appears, Tab through it | Each time is a button; taken times announce as "**dimmed/unavailable**" (disabled) | |

**Fail signal for §3:** if Tab skips straight over the make/model/goal options to the
footer (you can't reach them, or pressing Enter/Space does nothing), that's a fail —
report which step.

## 4. Booking form + validation (end of the wizard)

| # | Do | Expect to hear | P/F |
|---|----|----------------|-----|
| 4.1 | Tab into the form fields | Each field announces its **label**: "Name, edit", "Phone, edit", "Email, edit", "Your vehicle", "Anything else?", "Selected market" — **no "edit text, blank"** with no label | |
| 4.2 | On a phone, focus Phone / Email | The correct keyboard appears (number pad for phone, @ for email) | |
| 4.3 | Leave Name/Phone empty and activate **"Send My Request"** | The error is **announced automatically** without moving there ("Please add your name and a phone or email…") | |
| 4.4 | Right after the error | Focus lands on the **Name** field so you can fix it immediately | |

## 5. General reading flow (any content page, e.g. `/ott-tune`, `/team`)

| # | Do | Expect to hear | P/F |
|---|----|----------------|-----|
| 5.1 | Read top-to-bottom (NVDA **Down Arrow** / VO **VO+A**) | Logical order, no big jumps; nothing read twice | |
| 5.2 | Team page headshots | Each image has a name ("Aaron Groshong"), not "image" or a filename | |
| 5.3 | Any data table (cost / warranty pages) | Reads as a table with the vehicle and price together; on a narrow window it scrolls rather than clipping | |
| 5.4 | Phone / text / email links | Announced as links that will call / message / email | |

---

## What to report
For any **Fail**, note: the **page**, the **step #** above, what you **did**, and what you
**heard** (or didn't). A short screen recording with audio is ideal. Send to the dev with
the screen reader + browser used (e.g. "NVDA + Chrome" or "VoiceOver + Safari").

## Known limitation (already documented, not a bug to report)
The decorative small-caps labels (the "TOYOTA & LEXUS PERFORMANCE TUNING" eyebrow text)
use a low-contrast sage color by design; this is a visual contrast note, not a screen-reader
issue. See `docs/ux-audit-2026-06.md`.

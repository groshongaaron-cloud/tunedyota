# Tuned Yota — UX/UI Audit (June 2026)

Read-only audit of the live static site (31 inline-CSS HTML pages). Scored against the
ui-ux-pro-max priority framework (P1 Accessibility & Touch = CRITICAL → P3 = polish).
No site files were changed. Evidence is cited with file/selector/measured values.

---

## Executive summary

The site is genuinely well-crafted: a cohesive earthy design system (`:root` tokens shared
across all pages), Spectral/Lato pairing, tasteful motion with a real `prefers-reduced-motion`
fallback, descriptive `alt` text, clean heading hierarchy, and a sophisticated multi-step
tune-finder with proper loading/disabled states and graceful network fallback. This is a strong
baseline — the findings below are **refinements, not a rescue**.

The single highest-leverage theme: **keyboard & screen-reader accessibility**. The visual layer
is polished; the assistive layer has consistent, fixable gaps. Three of them (focus rings, form
label association, error announcement) are quick and high-confidence.

One structural constraint shapes everything: **CSS is hand-duplicated inline across ~29 pages**
(the `:root` tokens + `.snav`/`.sfoot` chrome are copy-pasted). Any global fix (e.g. focus rings)
must be applied 29× by hand, or the shared chrome should first be extracted to a linked
`site.css`. This is the most important maintainability decision the fixes depend on.

---

## P1 — CRITICAL (Accessibility & Touch)

### 1.1 No visible focus states anywhere — *highest priority*
Custom buttons/links/cards use `border:none` and define `:hover`/`:active` but **no `:focus` or
`:focus-visible`**. Keyboard users get only the browser default outline (often invisible against
the beige/dark surfaces). Affects every interactive element on every page: `.btn`, `.snav-links a`,
`.snav-call`, `.v-card`, `.tf-opt`, `.tf-chip`, `.fq-q`/`.lp-fqq` accordion triggers, footer links.
- **Exception (good):** the tune-finder form inputs *do* have a focus style
  (`find-your-exact-tune.html:176` → `border-color:var(--sage)` + 3px ring). That same treatment
  should be generalized to all interactive elements.
- **Fix:** one global rule —
  `:focus-visible{outline:2px solid var(--sage-d);outline-offset:2px;border-radius:inherit}` plus a
  ring variant for pill buttons. Low visual risk, fully on-brand.

### 1.2 Form labels not programmatically associated
In the lead form, labels are siblings, not linked: `<label>Name</label><input id="fName">`
(`find-your-exact-tune.html:452-457`). No `for`/`id` pairing → clicking the label doesn't focus the
field, and screen readers may not announce the label. **Fix:** add `for="fName"` etc. (8 fields).

### 1.3 Validation errors are not announced or focused
`#fErr` (`:459`) is a single generic message toggled via `display` with **no `role="alert"` /
`aria-live`**, so screen readers never hear it. On error the JS (`:923`) does not move focus to the
offending field. Error *color* is fine (measured `#9b4a3a` on `#EDECEB` = **5.18:1**, passes).
- **Fix:** add `role="alert"` to `#fErr`; on validation failure `.focus()` the first empty field.

### 1.4 Step transitions don't move focus
`go(n)` (`:650`) does `scrollIntoView` but never focuses the new step's heading. Keyboard/SR users
stay on the now-hidden previous step. **Fix:** make `.tf-h` focusable (`tabindex="-1"`) and
`.focus()` it on advance (WCAG focus-on-route-change).

### 1.5 Touch targets below 44px (mobile)
Measured heights under the 44×44 minimum:
| Element | File / selector | Padding · font | ~Height |
|---|---|---|---|
| Nav links | `.snav-links a` | `8px 11px` · 13px | ~31px |
| Call/Text pill | `.snav-call` | `9px 16px` · 13px | ~31px |
| Vehicle/guide CTA | `.btn` (vehicle pages) | `14px 24px` · 14.5px | ~42px |
| FAQ filter chips | `.fq-chip` | `8px 16px` | ~32px tall |
| Team action links | `.tm-acts a` | `9px 15px` · 13px | ~33px |

Most-used on a sticky mobile nav, so it matters even though it's desktop-styled. **Fix:** raise
vertical padding (~12px) or add `min-height:44px` + `min-width:44px` on these touch targets. The
homepage hero `.btn` (`15px 28px`, ~50px) is already fine — this is the others.

---

## P2 — HIGH (semantics, navigation, structure)

### 2.1 Accordion ARIA incomplete
FAQ and the supercharger / "is it worth it" accordions use JS-driven divs with
`aria-expanded` set ✓ but **no `aria-controls`** linking trigger → panel, and `aria-expanded` is
not always toggled in sync by the JS. **Fix:** add `aria-controls`/`id` pairs, or migrate to native
`<details>/<summary>` (removes JS, gets keyboard + a11y for free).

### 2.2 No skip-to-content link
No `<a class="skip" href="#main">` on any page; keyboard users must tab the whole nav on every page.
**Fix:** one visually-hidden-until-focus link + `id="main"` on the primary `<section>`.

### 2.3 FAQ active-filter state is color-only
`.fq-chip.on` signals the active category by background color alone. Contrast is fine but it relies
on color. **Fix:** add `aria-pressed`/`aria-current` and a non-color cue (weight or check).

---

## P3 — MEDIUM (contrast polish, content)

### 3.1 Secondary text below the 4.5:1 AA floor (measured)
Body/secondary text is small (12.5–15.5px), so AA-normal (4.5:1) applies — several fall short:
| Token / use | Measured | Verdict |
|---|---|---|
| `.fq-sub` subtitle (`opacity:.75`) | **3.87:1** | fails AA-normal |
| Hero `p` (`opacity:.8`) | **4.33:1** | just under |
| `.eyebrow` sage-d label | **3.30:1** | fails (small caps) |
| `.vp` price sage-d on card | **3.70:1** | fails |
| Footer `.fcopy` (`opacity:.55`) | **3.73:1** | borderline |
Primary text is excellent (`#5D4B40` on bg = **6.99:1**). **Fix:** nudge secondary tokens darker /
reduce reliance on `opacity` for text, or bump the affected sizes ≥18.66px. Low effort, real gain.

### 3.2 Pricing/guide tables can overflow narrow phones
Guide tables are `width:100%` with no horizontal-scroll wrapper (`ott-tune-cost.html`). **Fix:**
wrap in `overflow-x:auto` or stack to label/value rows under ~480px.

### 3.3 Minor
- Hero image lacks intrinsic `width`/`height`/`aspect-ratio` (it's absolutely positioned so CLS is
  contained, but adding `aspect-ratio` future-proofs it).
- Some pages omit the motion-polish block present on others — animation rhythm is slightly
  inconsistent page-to-page (a symptom of the CSS duplication below).

---

## Cross-cutting: maintainability (gates the fixes above)

`:root` tokens + `.snav`/`.sfoot` chrome + motion rules are **copy-pasted inline in ~29 pages**
(~130 lines/page on vehicle pages). Consequences:
- A global fix (focus rings, touch padding, contrast tweak) is a 29-file edit, or risks drift.
- Some pages already diverge (missing motion-polish block).

**Recommendation:** extract shared chrome/tokens/motion into a single linked `site.css` (or have
`build:seo` inject a shared block) **before** the P1 fixes. Then every accessibility fix is one edit,
applied everywhere, forever. This is the unlock for everything else.

---

## What's already strong (keep)
Cohesive token system · Spectral/Lato pairing · real `prefers-reduced-motion` support · descriptive
`alt` text · clean heading hierarchy · funnel loading/disabled/`disabled` states + network fallback ·
focused funnel with no nav escape · semantic `tel:`/`sms:`/`mailto:` links · honeypot spam guard.

---

## Recommended sequencing
1. **Extract shared CSS to `site.css`** (maintainability unlock; no visual change).
2. **P1 accessibility quick-wins:** global `:focus-visible`, form `for`/`id`, `role="alert"` +
   focus-first-invalid, step-advance focus. (Highest confidence, lowest visual risk.)
3. **P1 touch targets:** min-height/padding on nav, chips, team/vehicle CTAs.
4. **P2 semantics:** accordion `aria-controls` (or native `<details>`), skip link.
5. **P3 contrast polish + table overflow.**

Steps 1–2 deliver most of the value and are safe to ship to a live site.

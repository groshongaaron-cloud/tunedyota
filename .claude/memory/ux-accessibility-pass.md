---
name: ux-accessibility-pass
description: "Shared site.css now centralizes nav/footer/tokens; UX audit + accessibility pass (June 2026) — what's done and what remains"
metadata: 
  node_type: memory
  type: project
  originSessionId: 25deb8a3-f0e9-49ee-b94f-bb4d69e7df41
---

June 2026 ui-ux-pro-max audit + fixes (audit doc: `docs/ux-audit-2026-06.md`).

**Architecture change:** the nav (`.snav`), footer (`.sfoot`), `:root` design tokens, motion
polish, and global `:focus-visible` rules were extracted from per-page inline `<style id="site-chrome">`
blocks into a single linked **`site/site.css`** (linked on all 29 chrome pages; not `links.html`
or the Google-verify stub). **Edit shared chrome/tokens/focus/touch rules in `site.css` once** — no
longer copy-paste across pages. `build:seo` is unaffected (it only touches head SEO markers).

**Shipped in this pass (all live-safe, verified: 113/113 tests + build:seo clean):**
- Global `:focus-visible` rings (dark ink on light surfaces, blue inside dark footer/trust strip).
- Skip-to-content link + `<a id="main" tabindex="-1">` target on every chrome page.
- Touch targets ≥44px under `@media (pointer:coarse)` (nav, chips, team/vehicle CTAs) — desktop stays compact.
- Funnel (`find-your-exact-tune.html`): label `for`/`id`, `inputmode`, `role="alert"`, focus-first-invalid, step-heading focus on `go(n)`.
- Accordion ARIA: `aria-controls`/`id` wired at runtime; `lp-fq` (24 pages) now syncs `aria-expanded` (FAQ already did).
- Contrast lifted to AA: footer `.fcopy` opacity .55→.8, hero `p` →.9, `.fq-sub` →.9. Guide tables wrapped in `.tbl-wrap` (overflow-x).

**Not done (deliberately out of scope):** the decorative small-caps `.eyebrow`/`.v-sub` labels
(var(--sage-d) ≈3.3:1) were left as-is to avoid changing the brand accent — revisit only if AA on
labels is required.

**Shipped 2026-06-25** — three commits to master, all Netlify-published & verified live via
headless-Chrome/CDP keyboard tests:
- `b532976` — site.css extraction + Steps 1–5 (focus, skip-link, touch, forms, ARIA, contrast, tables)
- `0003595` — fix: funnel `go()` no longer steals focus to the step heading on initial page load
  (was stranding keyboard focus past the skip-link/nav); guard with `go._started`.
- `9143ae4` — feat: tune-finder fully keyboard-operable. The make/model/config options (.tf-opt),
  goal chips (.tf-chip) and market rows (.tf-mkt) were clickable `<div>`s; a MutationObserver now
  gives each `role="button"`+`tabindex=0`+`aria-pressed` as it renders, plus delegated Enter/Space
  activation. Native `<button>` widgets (.tf-slot, market bar, breadcrumbs) already worked.
  Verified live: Enter advances each step, Space toggles chips, observer covers dynamic re-renders.

See [[funnel-roadmap-and-lead-setup]] (deploy = git push to master).

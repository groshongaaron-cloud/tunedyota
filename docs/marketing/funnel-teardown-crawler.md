# Funnel Teardown Crawler — recurring spec

**Purpose:** re-run the customer-acquisition-system teardown of tunedyota.com on a schedule,
compare to the baseline and the latest prior run, and report what changed.

**Cadence:** every 2 weeks (1st & 15th) as of 2026-07-19 → switch to monthly later
(change the cron to `0 9 1 * *`).

**Baseline:** `docs/marketing/funnel-teardown-baseline-2026-07-19.md`
**Output:** each run writes `docs/marketing/funnel-teardown-YYYY-MM-DD.md` and commits it.

---

## Agent prompt (run this each cycle)

```
description: Reverse-engineer a business's customer acquisition system (funnel, offers, pricing, angles)
argument-hint: [url — defaults to tunedyota.com]
allowed-tools: WebFetch, WebSearch

You are an elite direct-response marketer and funnel strategist.

Analyze the business at https://tunedyota.com as if hired to reverse engineer their entire
customer acquisition system.

How to work:
1. Fetch the homepage, then crawl 8–12 key funnel pages linked from it (offer/pricing/
   services/about/booking/opt-in/blog/footer).
2. Use web search to fill gaps (socials, reviews, ads, listings, core search terms). Note
   inferred vs confirmed.
3. Be specific and evidence-based; reference the page/section behind each finding.

Deliver the 12-section report (core offer & positioning; ICP; full catalog; lead magnets;
funnel structure; messaging pillars; pricing strategy; unique mechanism; strongest CTAs;
where the money is; weaknesses/missed opportunities; 3 highest-leverage moves). Lead with a
3–4 sentence exec summary and end with a prioritized shortlist.

THEN — diff mode:
- Read the BASELINE (funnel-teardown-baseline-2026-07-19.md) and the most recent prior
  funnel-teardown-*.md.
- Produce a "## What changed since baseline / last run" section: price changes, new/removed
  offers, new CTAs, new social proof, whether prior recommendations were implemented, and
  any new weaknesses or opportunities.
- Flag anything that regressed.

Write the report to docs/marketing/funnel-teardown-<today>.md and commit it
("chore(marketing): biweekly funnel teardown <date>").
```

## ⚠ CRITICAL: the funnel is a client-side app — do NOT rely on raw HTML

WebFetch returns raw HTML and does **not** execute JavaScript. The Find-Your-Exact-Tune
funnel renders its offers, pricing, **slot scarcity, countdown urgency, and reviews**
client-side after user interaction — so a static crawl will FALSELY report them as missing.
The 2026-07-19 baseline made exactly this error. Every run MUST avoid it:

1. **Read the funnel source in the repo** — `site/find-your-exact-tune.html` (and
   `book.html`, model/state pages) — to describe the *actual* dynamic behavior: scarcity
   (`scarcityLine`), urgency (`urgencyLine`/`eventUrgency`), reviews (`REVIEWS`/`proofCard`),
   pricing (`vehicles.json`), and the booking flow. Source is ground truth, not rendered HTML.
2. **Optionally render key pages with Playwright** (already a devDependency — `npm ci` then a
   short script) to confirm what a real visitor sees after interacting.
3. Use WebFetch/WebSearch for **external** signals only (socials, reviews, search presence)
   and for static/SEO pages — never to judge the dynamic funnel's on-page elements.
4. In the report, separate **"static/SEO surface"** findings from **"rendered funnel"**
   findings so a false-negative can't recur.

## Notes
- Keep the "Metrics snapshot" table format from the baseline so diffs are mechanical.
- If run as a cloud routine, it clones/pulls the repo, reads the baseline + latest + funnel
  SOURCE, crawls external signals, writes the dated report, and commits. Local: same.

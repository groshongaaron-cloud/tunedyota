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

## Notes
- Keep the "Metrics snapshot" table format from the baseline so diffs are mechanical.
- If run as a cloud routine, it clones/pulls the repo, reads the baseline + latest, crawls,
  writes the dated report, and commits. Local runs: same, against the working tree.

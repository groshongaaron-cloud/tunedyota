---
name: last30days-research-tool
description: last30days Claude Code plugin — installed + 20 Toyota-tuning watchlist topics configured for weekly social/web research digests
metadata: 
  node_type: memory
  type: project
  originSessionId: 56c5c6e5-fce2-43d3-b383-a10758dce877
---

Installed the **last30days** research plugin (mvanhorn/last30days-skill, v3.11.1, MIT) on 2026-07-09 via `claude plugin marketplace add mvanhorn/last30days-skill` + `claude plugin install last30days@last30days-skill` (user scope). It researches any topic across Reddit/HN/Polymarket/GitHub/Bluesky (free, no keys), YouTube (needs `yt-dlp`), X (needs browser cookies or XAI/Xquik key), TikTok/IG/LinkedIn (needs ScrapeCreators key), and web (Brave/Perplexity keys) — ranking by real engagement, cross-source clustering, citation anchoring.

**Scripts live at** `~/.claude/plugins/cache/last30days-skill/last30days/3.11.1/skills/last30days/scripts/` (`last30days.py`, `watchlist.py`, `briefing.py`, `store.py`). **Watchlist SQLite store:** `~/.local/share/last30days/research.db`. Direct-research briefs default to `~/Documents/Last30Days/`.

**Preflight (key-free) works:** reddit, hackernews, polymarket, github, web grounding. Unavailable until installed/keyed: yt-dlp (YouTube), ScrapeCreators sources, X, arxiv/digg/techmeme CLIs.

**20 weekly watchlist topics configured** (Mondays 8am schedule metadata) — all Toyota/Lexus tuning + Magnuson supercharger + AMSOIL + brand/competitor terms (Tundra/Tacoma/4Runner/Sequoia/Land Cruiser/Lexus GX tune + superchargers, iForce Max/V35A, tune worth-it/warranty, OTT, AMSOIL Toyota, Tuned Yota brand, Toyota tuner). Manage via `watchlist.py add|remove|list|delta|run-one|run-all`.

**WINDOWS GOTCHA (important):** plain `python watchlist.py run-*` throws a `UnicodeDecodeError` (cp1252) in a subprocess reader thread — non-fatal but silently drops source output containing emoji/curly-quotes (i.e. most social content). **ALWAYS run with `PYTHONUTF8=1` set.** Verified: with `PYTHONUTF8=1` the crash is gone.

**Delta = the digest.** `watchlist.py delta "<topic>"` needs ≥2 completed runs per topic to compute week-over-week new items. Smoke test passed: "Tundra tune" run stored 11 items (23s, free sources).

**WEEKLY AUTOMATION — DONE & VERIFIED (2026-07-09).** Fully wired end-to-end:
- **Wrapper:** `scripts/last30days/weekly-digest.py` — COMMITTED ON MASTER (commit `86c5991`, 2026-07-09; NOT on the `amsoil-garage` feature branch — it was briefly committed there then moved to master via cherry-pick + rebase-excise, local-only branch so safe). Resolves newest plugin version dir dynamically, runs `watchlist.py run-all` then `briefing.py generate --weekly`, parses the JSON, builds a consolidated Slack digest (topics with fresh activity, hottest first, top-3 findings each as `<url|title> (source · score⬆)`), posts ONE message. Flags: `--dry-run` (no post), `--no-run` (skip sweep, render+post latest stored data). Reads argv, not `__file__`, so it runs fine piped via stdin.
- **Launcher:** `C:\Users\grosh\.tunedyota\run-last30days.cmd` (local, mirrors `run-measure.cmd`). **Branch-independent:** pipes `git show master:scripts/last30days/weekly-digest.py` into `python -` so the task always runs master's canonical copy regardless of which branch is checked out (avoids the file being absent when `amsoil-garage` is active). Sets PYTHONUTF8=1; logs to `%USERPROFILE%\.tunedyota\last30days-weekly.log`. Verified under cmd.exe. (Do NOT use PowerShell `>` to stage the script — it writes UTF-16+BOM that Python can't parse; the pipe avoids this.)
- **Scheduled task:** `TunedYota Last30Days Digest` — weekly Mondays 8:00 AM, principal grosh/Interactive/Limited (no stored password), StartWhenAvailable, 1h limit. Next run Mon 2026-07-13 8am.
- **Slack delivery VERIFIED:** posts to `https://tunedyota.com/.netlify/functions/notify` with header `x-ty-notify: <token>` + body `{text}` (same as [[cloud-routines]] `/notify` relay). Live test returned `notify: 200 ok`. Token stored in Windows USER env var `TY_NOTIFY_TOKEN` (34 chars, captured from Netlify `NOTIFY_TOKEN`, never echoed). NOTE: newly-set user env vars aren't visible to already-running shells — read from `HKCU:\Environment` for immediate use; Task Scheduler gets it fresh at launch.
- **yt-dlp installed** (winget) → YouTube transcripts available to new shells.

**KNOWN QUALITY CAVEAT (signal vs noise):** engagement-ranked broad keyword queries pull off-topic false positives. Mitigations applied: (a) `RELEVANCE_FLOOR = 10.0` in the wrapper drops the 0-band junk; (b) fixed the worst query — "Tuned Yota" brand → single-token `tunedyota` (was matching "fine-**tuned**" LLM/HN content with high scores). Residual: bare-"tune" vehicle queries still let some general-Toyota-news through; the tool's `relevance_score` (scale ~0-45) is NOT a clean separator (e.g. "432 Hz music" scored 37). Real value grows once each topic has ≥2 weekly runs so the week-over-week DELTA (new only) shrinks the noise. Tighten queries after reviewing 1-2 real weekly digests.

Complements [[search-ai-visibility-program]] (search demand side) and the community-radar routine (voice-of-customer). Follows [[prefer-automation-over-handoffs]].

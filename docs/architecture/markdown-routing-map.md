# Markdown → Scripts Routing Map

> Verified 2026-08-06 via the superpowers verification standard (run → read output → conclude).
> Every count below came from a live `find`/`grep`/`git` run, not memory. Re-verify before trusting;
> the skills/agents trees drift as plugins update.

This documents every place a Markdown file drives executable code across the two worlds this
setup spans: the Claude Code control plane (`~/.claude/`) and the site repo
(`C:\Users\grosh\Documents\tunedyota`).

## The five trees

| # | Tree | Location | Markdown | Scripts | Routes to |
|---|------|----------|----------|---------|-----------|
| 1 | **Local skills** | `~/.claude/skills/` | 6 `SKILL.md` | **0 bundled** | *outward* → repo npm scripts + repo skills |
| 2 | **Plugin skills** | `~/.claude/plugins/cache/` | see below | see below | self-contained |
| 3 | **Agents** | `~/.claude/agents/` | 4 `*.md` | 0 | *tools* (frontmatter `tools:` line) |
| 4 | **Memory** | `~/.claude/projects/C--Users-grosh/memory/` | `MEMORY.md` + 41 facts | 0 | nothing (knowledge index) |
| 5 | **Site repo** | `tunedyota/` | 213 `docs/*.md` + 8 repo skills | ~103 execs | the real execution layer |

### Tree 1 — Local skills (route outward)
`app-launch`, `messaging-clients`, `reverse_engineer`, `stop-slop`, `ty-publish`, `ty-status`.
Zero co-located scripts. The `SKILL.md` body points at repo code, e.g.:
- `ty-publish/SKILL.md` → `npm run build:seo`, `npm test`, and defers deploy to `REPO\.claude\skills\ship\SKILL.md`
- `app-launch/SKILL.md` → `app/scripts/patch-mlkit-privacy.mjs`

### Tree 2 — Plugin skills (per plugin)
| Plugin | SKILL.md | Scripts | Notes |
|--------|---------:|--------:|-------|
| claude-plugins-official | 14 | 39 | superpowers etc. |
| **ecc** (`ecc-universal` v2.0.0) | **881** | **5,362** | **DISABLED** (`settings.json: "ecc@ecc": false`), 192 MB dormant cache. Third-party (`affaan-m/everything-claude-code`). |
| last30days-skill | 1 | 261 | |
| n8n-mcp-skills | 15 | 12 | |
| obsidian-skills | 5 | 0 | pure prose |
| ui-ux-pro-max-skill | 13 | 57 | |

### Tree 3 — Agents (route to tools, not scripts)
`aeo-monitor`, `reddit-scout`, `seo-monitor`, `trend-scout`. Each `*.md` is a system prompt whose
frontmatter `tools:` line declares its reach (e.g. seo-monitor: `ToolSearch, WebFetch, Read, Write,
Grep, Glob, Bash`). Scripts are reached only indirectly when the agent runs `Bash` against this repo.

### Tree 4 — Memory (no execution)
`MEMORY.md` is the session-loaded index; 41 sibling fact files, one fact each. Nothing runs here.

### Tree 5 — Site repo (the execution layer)
- **`docs/` = 213 md** — runbooks/architecture/marketing. Reference specs, not executors.
- **`.claude/skills/` = 8 repo skills**: `add-dyno-proof`, `add-review`, `design-taste-frontend`,
  `emil-design-eng`, `new-vehicle-page`, `schedule-event`, **`ship`**, `update-routing`.
- **`package.json` scripts (~20)** — the routing hub. `build:seo` fans out to
  `build-seo.mjs → build-redirects.mjs → build-product-schema.mjs → build-merchant-feed.mjs`.
- **`scripts/` = ~103 executables**: 73 `.mjs`, 11 `.cjs`, 6 `.js`, 13 `.py`.

## The routing chain

```
Memory .md ───────► nothing (knowledge index only)
Agent .md ────────► tools (frontmatter: Bash / WebFetch / MCP …)
Local skill .md ──► npm scripts + repo skills ─┐
Repo skill .md ───► npm scripts ───────────────┼──► tunedyota/scripts/*.mjs (~103 execs)
docs/*.md (213) ──► reference only (specs)      ┘
```

## External routers (why "orphan" ≠ dead)
A script with **zero in-repo references is NOT dead** — ~103 scripts, only ~20 npm entries. The rest
are invoked from outside the repo. An in-repo grep alone will mislabel live scripts (proven: 
`scripts/measure/ga4-funnel.mjs` = 0 in-repo refs but is the live GA4 funnel tool per memory).

External routers:
1. **Windows Task Scheduler — 11 active `TunedYota *` tasks** (all `Ready`): AMSOIL Drift Check,
   AMSOIL Price Sync, C2 Review-URL Reminder, Headroom Guardian, Indexing Recheck, Last30Days Digest,
   Port Status Check, Review Watch, Rich Results Check, Search Visibility, TY-Content-Watcher.
   These drive `scripts/reminders/*.py`, `scripts/headroom_guard/*`, `scripts/measure/*`, etc.
2. **Netlify functions** — call scripts/shared libs at deploy/runtime.
3. **Agent `Bash` calls** — the 4 agents run scripts ad hoc.
4. **Manual one-offs** — migrations/backfills (`migrate-events-to-airtable`, `resend-confirmations-backfill`),
   `youtube/auth.mjs` (run-once OAuth).

Rule: before deleting any script, cross-check Task Scheduler + Netlify + manual-tool status.

## Verification results (2026-08-06)
- **`npm test`: 1701 pass / 0 fail** (10.9 s).
- **`build:seo` is fully idempotent** — two consecutive runs produced byte-identical output
  (og-image 33488 B both; sitemap hash `ad68802…` both).
- **Artifact drift (cosmetic):** committed `site/sitemap.xml` + `site/og-image.png` differ from
  current generator output. Sitemap = pure reorder (identical 949-URL set, no SEO impact); og-image =
  byte re-encode. Harmless but produces commit noise on the next build-before-deploy.
- **`core.autocrlf=true`** generates phantom LF↔CRLF `M` entries in `git status` — repo-hygiene nit.

## Resolved 2026-08-07
- **ecc plugin — RECLAIMED.** Removed from `installed_plugins.json`, `known_marketplaces.json`,
  and `settings.json` (all validated as parseable); 192 MB cache deleted. Backups at
  `~/.claude/plugins/*.bak-pre-ecc-removal` + `settings.json.bak-pre-ecc-removal`. Reinstall from
  `affaan-m/everything-claude-code` if ever wanted.
- **indexnow duplicate — REMOVED.** Kept `scripts/indexnow-submit.mjs` (wired to `npm run indexnow`;
  reads key file dynamically, `--sitemap` support, validation — the better code) and enhanced its
  header with the AEO angle. Deleted the orphaned `scripts/submit-indexnow.mjs` (hardcoded API key;
  already un-tracked in commit `a40c7f5`). Recover via `git show 414b67a:scripts/submit-indexnow.mjs`.

## Standing follow-ups (optional, not churn-critical)
- **Artifact resync** — regenerate + commit `site/sitemap.xml` + `site/og-image.png` to clear the
  cosmetic drift, so the next deploy build shows no surprise diff.
- **`.gitattributes`** with `* text=auto eol=lf` to end the `core.autocrlf=true` phantom-diff noise.

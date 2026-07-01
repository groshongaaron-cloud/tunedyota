# search-visibility measurement — local runner

The measurement engine runs **locally** (Windows Task Scheduler → `node`), not as a cloud
routine. This keeps the GSC service-account key on the owner's machine and lets `git push`
persist snapshots with the owner's own credentials. Replaces the cloud
`search-visibility-tracker` routine and the old manual GSC-reminder routine.

## Config (secrets live here, never in git)
`~/.tunedyota/measure.config.json`:
```json
{
  "gscKeyFile": "C:\\Users\\grosh\\Downloads\\tunedyota-*.json",
  "gscProperty": "https://tunedyota.com/",
  "perplexityApiKey": "pplx-...",
  "slackWebhookUrl": "https://hooks.slack.com/services/..."
}
```
- `gscKeyFile` — path to the GSC service-account JSON key (read-only, single property).
- `perplexityApiKey` — optional; omit/empty to skip the Perplexity probe.
- `slackWebhookUrl` — optional; omit/empty to skip the Slack post (report still prints + commits).

## Run it
```
node scripts/measure/run-local.mjs
```
It pulls GSC (trailing 28d), probes Perplexity (if configured), assembles a dated snapshot
in `docs/seo/measurements/`, diffs vs the prior snapshot, prints + Slacks the report, and
commits + pushes the snapshot.

The **WebSearch presence probe is cloud-agent-only and is skipped locally** — GSC already
gives exact Google positions, so the report simply omits the WebSearch stat and reports
GSC movers/CTR-opportunities + Perplexity citations.

## Schedule (Windows Task Scheduler)
Registered task `TunedYota Search Visibility` runs monthly (1st, 08:00). Re-create with:
```
schtasks /Create /TN "TunedYota Search Visibility" /SC MONTHLY /D 1 /ST 08:00 ^
  /TR "cmd /c cd /d C:\Users\grosh\Documents\tunedyota && node scripts\measure\run-local.mjs >> %USERPROFILE%\.tunedyota\measure.log 2>&1" /F
```
Logs append to `~/.tunedyota/measure.log`.

## Reading a snapshot
- `summary.ctrOpportunities` — page-1, high-impression queries whose CTR is >30% below the
  position curve → targets for the next on-page (title/meta + internal-link) round.
- `summary.perplexityCiteRate` — share of tracked queries where Perplexity cited us.

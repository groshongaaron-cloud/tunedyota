# scripts/headroom_guard/runner.py
"""Guardian orchestration: load corpus, run checks over the detected adapter,
render a report, post a Slack digest via /notify, exit nonzero on failure.

Flags: --dry-run (no Slack), --probeless (skip LLM quality check), --json."""
import json
import os
import sys
import urllib.request
from pathlib import Path

import config
import guard
import probe
from adapter import detect

HERE = Path(__file__).resolve().parent
CORPUS = HERE / config.CORPUS_DIRNAME


def _state_path():
    """State lives next to the package by default, or at HEADROOM_GUARD_STATE
    (used by the scheduled launcher so the version-pin survives ephemeral runs)."""
    override = os.environ.get("HEADROOM_GUARD_STATE")
    return Path(override) if override else (HERE / config.STATE_FILENAME)


def _load_state():
    p = _state_path()
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"pinned_version": ""}


def _save_state(version):
    _state_path().write_text(json.dumps({"pinned_version": version}, indent=2), encoding="utf-8")


def _probe_fn():
    if not probe.have_api_key():
        return None
    return lambda q, ctx: probe.ask_model(q, ctx)


def run_all(probeless=False, adapter=None, probe_fn=None):
    adapter = adapter if adapter is not None else detect()
    if not adapter.installed:
        return {"status": "skipped", "reason": "Headroom not installed",
                "probe_blind": False, "items": []}

    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    state = _load_state()
    if probeless:
        probe_fn = None
    elif probe_fn is None:
        probe_fn = _probe_fn()

    results = []
    quality_statuses = []
    for item in manifest["items"]:
        text = (CORPUS / item["file"]).read_text(encoding="utf-8")
        comp = adapter.compress(text, item["type"])
        checks = [
            guard.check_savings(text, comp.text, config.SAVINGS_BANDS[item["type"]]),
            guard.check_reversibility(adapter, text, comp),
        ]
        if probe_fn is None:
            q = guard.CheckResult("quality", "unchecked", "no probe (probeless or no API key)")
        else:
            q = guard.check_quality(probe_fn, text, comp.text, item["probes"])
        checks.append(q)
        quality_statuses.append(q.status)
        results.append({"file": item["file"], "checks": [c.__dict__ for c in checks]})

    health = guard.check_health_version(adapter, state.get("pinned_version", ""))
    _save_state(health.data.get("version", adapter.version()))

    hard_fail = (any(c["status"] == "fail" for it in results for c in it["checks"])
                 or health.status == "fail")
    # Blind-probe escalation: a probe was available but produced no definitive
    # result on any item -> quality net is blind; must not exit green.
    probe_blind = (probe_fn is not None and bool(quality_statuses)
                   and all(s == "inconclusive" for s in quality_statuses))

    return {
        "status": "fail" if (hard_fail or probe_blind) else "pass",
        "version": adapter.version(),
        "health": health.__dict__,
        "probe_blind": probe_blind,
        "items": results,
    }


def exit_code(report):
    return 1 if report.get("status") == "fail" else 0


def render(report):
    if report["status"] == "skipped":
        return ":shield: *Headroom Guardian* — Headroom not installed; nothing to check."
    icon = ":white_check_mark:" if report["status"] == "pass" else ":rotating_light:"
    lines = [f"{icon} *Headroom Guardian* — {report['status'].upper()} @ v{report['version']}"]
    lines.append(f"health: {report['health']['detail']}")
    if report.get("probe_blind"):
        lines.append(":rotating_light: quality probe returned no usable result on ANY item — fidelity UNVERIFIED, investigate the probe.")
    for it in report["items"]:
        flags = [f"{c['name']}:{c['status']}" for c in it["checks"] if c["status"] != "pass"]
        summary = "ok" if not flags else " ".join(flags)
        lines.append(f"• `{it['file']}` — {summary}")
    return "\n".join(lines)


def post_to_slack(text):
    token = os.environ.get("TY_NOTIFY_TOKEN")
    if not token:
        print("[guardian] TY_NOTIFY_TOKEN not set; skipping Slack post")
        return
    req = urllib.request.Request(
        config.NOTIFY_URL,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-ty-notify": token},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        print(f"[guardian] notify: {r.status} {r.read().decode('utf-8', 'replace')}")


def main(argv):
    probeless = "--probeless" in argv
    dry = "--dry-run" in argv
    report = run_all(probeless=probeless)
    if "--json" in argv:
        print(json.dumps(report, indent=2))
    else:
        print(render(report))
    if not dry and report["status"] != "skipped":
        post_to_slack(render(report))
    return exit_code(report)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

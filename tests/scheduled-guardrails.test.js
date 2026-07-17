const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Guardrail: these side-effecting functions have NO auth gate of their own — they
// are safe only because Netlify blocks public-URL invocation of scheduled
// functions (403 in production). If a schedule line is ever removed from
// netlify.toml, the function becomes publicly invokable; this test makes that
// removal loud. Add a gate (x-ty-task, like event-roster-run.js) before
// un-scheduling any of these.
const UNGATED_SIDE_EFFECTING = [
  "submissions-report",   // emails owner report + contacts CSV
  "certificate-dispatch", // re-sends customer-facing certificate emails
  "amsoil-followup",      // emails customers
  "rebook-report",        // emails owner backlog
  "email-health",         // sends canary email
  "gmail-lead-poll",      // reads Gmail, posts leads to lead-ingest
];

function scheduledFunctions() {
  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  const names = new Set();
  for (const m of toml.matchAll(/\[functions\."([^"]+)"\]\s*\r?\n\s*schedule\s*=/g)) names.add(m[1]);
  return names;
}

test("every ungated side-effecting function is declared scheduled in netlify.toml", () => {
  const scheduled = scheduledFunctions();
  for (const name of UNGATED_SIDE_EFFECTING) {
    assert.ok(scheduled.has(name), `${name} is not scheduled in netlify.toml — it is publicly invokable; add an x-ty-task gate or restore its schedule`);
  }
});

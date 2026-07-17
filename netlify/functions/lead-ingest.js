// netlify/functions/lead-ingest.js
// The single normalized write path for leads. Auth: an installer token (manual UI) OR
// the internal task secret (server-to-server channel adapters). Fail-closed.
const { processLeadIngest } = require("./lib/leads.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { secretEquals } = require("./lib/secrets.js");

function taskAuthed(headers, env) {
  const s = env && env.INTERNAL_TASK_SECRET;
  const got = (headers["x-ty-task"] || headers["X-Ty-Task"] || "").toString();
  return secretEquals(got, s);
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const processImpl = ctx.processImpl || processLeadIngest;
  const headers = event.headers || {};
  const key = resolveInstaller(headers, env);
  const viaTask = taskAuthed(headers, env);
  if (!key && !viaTask) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processImpl(body, { env, key: key || "", admin: key ? isAdmin(key, env) : false });
  const code = out.status !== "error" ? 200 : (out.error === "store-unavailable" ? 502 : 400);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, taskAuthed };

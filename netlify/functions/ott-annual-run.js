// On-demand annual OTT rollup (Track C) — token-gated HTTP endpoint. Generates the
// private Tuned Yota rollup for any year (?year=YYYY, default = current YTD) and
// emails it to info@tunedyota.com only. The Jan-1 automatic run lives in
// ott-annual.js (scheduled). Shares runAnnual so both paths are identical.
const { runAnnual } = require("./ott-annual.js");

const OWNER = "info@tunedyota.com";

async function runOnDemand(params, deps = {}) {
  const env = deps.env || process.env;
  if (!env.OTT_APPROVE_SECRET || String(params.token || "") !== env.OTT_APPROVE_SECRET) {
    return { status: "error", code: 401, error: "unauthorized" };
  }
  const year = /^\d{4}$/.test(String(params.year || "")) ? +params.year : new Date().getUTCFullYear();
  const r = await runAnnual(year, deps);
  return { status: "ok", code: 200, ...r };
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#3A2E26"><h1 style="color:#5B4B42">${title}</h1>${body}</div>`;
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const out = await runOnDemand({ year: q.year, token: q.token }, {});
  const html = out.status === "ok"
    ? page("Annual rollup sent ✓", `<p>${out.count} calibration(s) for <strong>${out.year}</strong> ($${out.total}) — emailed privately to ${OWNER}.${out.unresolved ? ` ${out.unresolved} need a confirmed commission.` : ""}</p>`)
    : page("Not authorized", "<p>This link is invalid or the token is missing.</p>");
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, runOnDemand };

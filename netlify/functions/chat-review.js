// netlify/functions/chat-review.js
// Weekly chat-quality review (owner directive 2026-08-02): constantly assess
// incoming chats — how the AI and the INSTALLERS engaged clients, how tailored
// the responses were, and where we improve. The NEPQ playbook is the standard;
// the review grades the week's real conversations against it and emails the
// owner exemplars, coaching notes, and systemic fixes. Read-only over the
// Chat Sessions table; one Messages API call per week.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const WINDOW_DAYS = 7;
const MAX_SESSIONS = 40;
const MAX_CHARS_PER_SESSION = 2400;
const SLOW_REPLY_MS = 4 * 3600 * 1000;

const ROLE_LABEL = { user: "customer", assistant: "AI", installer: "installer", system: "system" };

// Compact, speaker-labeled bundle of the week's conversations. Installer reply
// lag is computed here (the LLM can't do time math reliably) and annotated
// inline so the review can judge responsiveness.
function buildBundle(records, now) {
  const cut = now.getTime() - WINDOW_DAYS * 86400000;
  const sessions = records.filter((r) => {
    const f = r.fields || {};
    if (/smoke/i.test(String(f["Session ID"] || ""))) return false;
    const t = Date.parse(f["Last Activity"] || "");
    return !isNaN(t) && t >= cut;
  }).slice(0, MAX_SESSIONS);

  const parts = sessions.map((r, i) => {
    const f = r.fields || {};
    const sid = String(f["Session ID"] || r.id);
    const channel = sid.startsWith("fb:") ? "facebook" : sid.startsWith("ig:") ? "instagram" : sid.startsWith("sms:") ? "sms" : "web";
    let turns = [];
    try { turns = JSON.parse(f.Transcript || "[]"); } catch {}
    if (!Array.isArray(turns)) turns = [];
    let lastCustomerAt = 0;
    const lines = turns.map((t) => {
      const role = ROLE_LABEL[t.role] || t.role || "?";
      let lag = "";
      if (t.role === "user") lastCustomerAt = t.at || 0;
      if (t.role === "installer" && lastCustomerAt && t.at && t.at - lastCustomerAt >= SLOW_REPLY_MS) {
        lag = ` (replied ~${Math.round((t.at - lastCustomerAt) / 3600000)}h later)`;
      }
      return `${role}: ${String(t.text || "").replace(/\s+/g, " ").slice(0, 300)}${lag}`;
    });
    const header = `[#${i + 1} channel=${channel} status=${f.Status || "ai"} installer=${f.Installer || "-"} name=${f["Customer Name"] || "-"}]`;
    let body = lines.join("\n");
    if (body.length > MAX_CHARS_PER_SESSION) body = "…" + body.slice(-MAX_CHARS_PER_SESSION);
    return header + "\n" + body;
  });
  return { count: sessions.length, text: parts.join("\n\n") };
}

function reviewPrompt(bundle) {
  return [
    "You are Tuned Yota's chat-quality reviewer. Tuned Yota is a Toyota/Lexus performance-tuning business with a world-class, best-in-class standard for every customer conversation. Below are this week's real conversations across SMS, Facebook Messenger, Instagram, and web chat. Speakers: 'customer', 'AI' (the automated agent), 'installer' (a live human — Aaron/Cody/Noah).",
    "",
    "The standard is the NEPQ method: diagnose before prescribing, mirror the customer's own words, one question at a time, tailor every reply to what THIS customer said, advance toward a booking or a live transfer, never hard-sell. Capture discipline matters: name, contact, vehicle, city should be collected naturally. Installer responsiveness matters: slow replies are annotated inline.",
    "",
    "Write the weekly review in markdown with EXACTLY these sections:",
    "## Scorecard — one line each: capture discipline, tailoring/NEPQ adherence, installer responsiveness & engagement, AI quality, outcomes. Grade each ✅ strong / ⚠ mixed / ❌ needs work, with a number or example.",
    "## What world-class looked like — 2-3 short quoted exemplars (AI or installer) and why each worked.",
    "## Coaching — the 3 highest-impact improvements for the INSTALLERS' engagement, each anchored to a real moment (quote it). Be direct and specific; no filler.",
    "## Fix the system — up to 3 improvements to the AI agent or process suggested by repeated patterns.",
    "## Follow up now — any conversation with live buying intent that was dropped or left hanging (name/channel + what to do). Say 'None' if none.",
    "Keep the whole review under 600 words. Judge only what is in the transcripts; never invent details.",
    "",
    `=== THIS WEEK'S CONVERSATIONS (${bundle.count}) ===`,
    bundle.text,
  ].join("\n");
}

async function defaultLlm(prompt, { env, fetchImpl = fetch }) {
  const res = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500,
      messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const j = await res.json();
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function runChatReview(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const send = deps.send || ((a) => sendEmail(a));
  const notify = deps.notify || ((a) => notifyOwner(a));
  const llm = deps.llm || ((p) => defaultLlm(p, { env }));
  if (!env.ANTHROPIC_API_KEY) return { dormant: true };
  const c = cfg(env);

  let recs = [];
  try { recs = await list({ token: c.token, baseId: c.baseId, table: env.AIRTABLE_CHAT_TABLE || "Chat Sessions" }); }
  catch (e) { return { error: "store-unavailable" }; }
  const bundle = buildBundle(recs, now);
  if (!bundle.count) return { skipped: "no-sessions" };

  let review;
  try { review = await llm(reviewPrompt(bundle)); }
  catch (e) { return { error: "review-failed", detail: e.message }; }

  const today = now.toISOString().slice(0, 10);
  let emailFailed = false;
  try {
    await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
      subject: `Tuned Yota — weekly chat quality review (${today}, ${bundle.count} conversations)`,
      text: review,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;white-space:pre-wrap">${review
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/^## (.*)$/gm, "<h3 style='margin:16px 0 4px'>$1</h3>")}</div>` });
  } catch (e) { emailFailed = true; }
  try {
    await notify({ webhookUrl: env.SLACK_WEBHOOK_URL,
      text: `*TY chat quality review*: ${bundle.count} conversations assessed${emailFailed ? " — EMAIL FAILED" : " → info@"}` });
  } catch (e) { /* best-effort */ }
  return { reviewed: bundle.count, emailFailed };
}

async function handler() {
  const out = await runChatReview({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runChatReview, buildBundle, reviewPrompt };

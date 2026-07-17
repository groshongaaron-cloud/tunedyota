// netlify/functions/lib/email-classify.js
// Content-based inbox classification + OTT lead field extraction (Claude Haiku, raw
// fetch — pattern: lib/vin-ocr-core.js). Fails toward humans: anything unparseable,
// low-confidence, or unconfigured classifies as "sensitive".
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const BUCKETS = ["ott-lead", "inquiry", "thread-reply", "automated", "spam", "sensitive"];

async function askClaude(prompt, { fetchImpl = fetch, apiKey, model = MODEL, maxTokens = 400 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchImpl(ANTHROPIC_URL, { method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }) });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    return ((j.content || []).find((c) => c.type === "text") || {}).text || "";
  } finally { clearTimeout(timer); }
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function classifyPrompt(msg) {
  return [
    "You triage the inbox of Tuned Yota, a Toyota/Lexus performance-tuning business.",
    "Classify the email below into exactly one bucket:",
    '- "ott-lead": a customer lead forwarded by Overland Tailor Tuning (OTT) or their systems (info@overlandtailor.com); usually labeled fields (Name/Phone/City/Vehicle...) or an OTT retailer referral note.',
    '- "inquiry": a customer asking about tuning, pricing, events, their vehicle, booking, or post-tune support (new thread).',
    '- "thread-reply": a customer replying within an existing conversation.',
    '- "automated": machine-generated (receipts, alerts, notifications, newsletters, calendars).',
    '- "spam": unsolicited marketing/scam/link-farm.',
    '- "sensitive": angry customer, refund/warranty dispute, legal threat, or anything you are unsure about.',
    "Also estimate the NEPQ conversation stage: one of connect|situation|problem|solution|consequence|qualifying|transition|commit (best guess; \"connect\" for cold).",
    'Respond ONLY with JSON: {"bucket":"...","stage":"...","confidence":0.0-1.0,"summary":"<one line: who + what they want>"}',
    "", `From: ${msg.headers.from}`, `Subject: ${msg.headers.subject}`, "", String(msg.textBody || "").slice(0, 6000),
  ].join("\n");
}

async function classifyEmail(msg, deps = {}) {
  const sensitive = (why) => ({ bucket: "sensitive", stage: "connect", confidence: 0, summary: why });
  if (!deps.apiKey) return sensitive("classifier unconfigured");
  let text;
  try { text = await askClaude(classifyPrompt(msg), deps); } catch (e) { return sensitive(`classifier error: ${e.message}`); }
  const j = parseJson(text);
  if (!j || !BUCKETS.includes(j.bucket)) return sensitive("unparseable classification");
  if (Number(j.confidence || 0) < 0.6) return sensitive(`low confidence (${j.confidence}): ${j.summary || ""}`);
  return { bucket: j.bucket, stage: String(j.stage || "connect"), confidence: Number(j.confidence), summary: String(j.summary || "") };
}

function extractPrompt(msg) {
  return [
    "Extract the customer lead from this email (a lead forwarded to a tuning shop).",
    'Respond ONLY with JSON: {"name":"","phone":"","email":"","city":"","state":"","vehicle":"<year make model>","goals":"","mods":"","ghlLink":""} — empty string for anything absent. Never invent values.',
    "", `From: ${msg.headers.from}`, `Subject: ${msg.headers.subject}`, "", String(msg.textBody || "").slice(0, 6000),
  ].join("\n");
}

async function extractLeadFields(msg, deps = {}) {
  if (!deps.apiKey) return null;
  let text;
  try { text = await askClaude(extractPrompt(msg), deps); } catch { return null; }
  const j = parseJson(text);
  if (!j || (!String(j.phone || "").trim() && !String(j.email || "").trim())) return null;
  const city = String(j.city || "");
  const state = String(j.state || "");
  const modsRaw = String(j.mods || "");
  const modsPart = modsRaw && !/^none?$/i.test(modsRaw) ? `Mods ${modsRaw}` : "";
  const goals = [String(j.goals || "").trim(), [city, state].filter(Boolean).join(", "), modsPart].filter(Boolean).join(" · ");
  return { name: String(j.name || "OTT National Lead"), phone: String(j.phone || ""), email: String(j.email || ""),
    city, state, vehicle: String(j.vehicle || ""),
    goals,
    ghlLink: String(j.ghlLink || ""), channel: "ott-national", source: "ott-national:email",
    message: "OTT lead (LLM-extracted)", threadId: msg.threadId || "", messageIdHeader: (msg.headers || {}).messageId || "",
    replyTo: ((String((msg.headers || {}).replyTo || (msg.headers || {}).from || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0]) || "" };
}

module.exports = { classifyEmail, extractLeadFields, BUCKETS, parseJson, askClaude };

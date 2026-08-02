// netlify/functions/lib/chat-agent.js
// The website chat agent: NEPQ persona + business grounding + hard guardrails,
// with escalation modeled as a Claude tool call. Pure prompt assembly + one
// injected fetch to the Messages API. System prompt is FROZEN per page context
// (cache_control) — volatile data must go in messages, never in the prompt.
const fs = require("node:fs");
const path = require("node:path");
const { MARKETS } = require("./markets.js");
const { INSTALLERS } = require("./routing.js");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const read = (p) => { try { return fs.readFileSync(path.join(__dirname, p), "utf8"); } catch { return ""; } };
const PLAYBOOK = read("../../../docs/sales/nepq-playbook.md");
const VOICE = read("../../../docs/email-voice.md");
const VEHICLES = (() => { try { return require("./vehicles.json"); } catch { return {}; } })();
const EVENTS = (() => { try { return require("./events-data.js"); } catch { return {}; } })();

function labelForPage(ctx) {
  if (ctx === "amsoil") return "an AMSOIL Fluid Specialist assistant — lead with fluid/maintenance expertise";
  if (ctx === "magnuson") return "a Magnuson Supercharger Specialist assistant — lead with supercharger expertise";
  return "an OTT installer assistant — lead with OTT tune expertise";
}

function pricingSummary() {
  const lines = [];
  for (const make of Object.keys(VEHICLES)) for (const model of Object.keys(VEHICLES[make])) {
    lines.push(`${make} ${model}: ` + VEHICLES[make][model].map((c) => `${c.y} ${c.e} from $${c.base}`).join(" · "));
  }
  return lines.join("\n");
}

// Upcoming events from the deploy-baked schedule (events-data.js regenerates
// from Airtable at build) — "when are you in my city" was the most common
// question the agent could not answer in the 2026-08 transcript mining.
// Deploy-static data, so the frozen-prompt rule holds; only the daily
// future-date cutoff moves.
function eventsSummary(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const out = [];
  for (const [city, list] of Object.entries(EVENTS)) {
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || e.active === false || !e.dateISO || e.dateISO < today) continue;
      const cityName = city.replace(/\b\w/g, (ch) => ch.toUpperCase());
      out.push({ d: e.dateISO, line: `${cityName} — ${e.dateISO}${e.address && !/to be released/i.test(e.address) ? ` (${e.address})` : ""}` });
    }
  }
  out.sort((a, b) => a.d.localeCompare(b.d));
  return out.slice(0, 30).map((x) => x.line).join("\n") || "No events currently published — point them at the booking page for the latest.";
}

const TRANSFER_TOOL = {
  name: "transfer_to_installer",
  description: "Transfer the customer to their nearest live OTT installer. Call ONLY after you have conversationally collected every required field, telling the customer you're asking so you can connect them with their NEAREST installer.",
  input_schema: {
    type: "object",
    properties: {
      customerName: { type: "string" },
      contactMethod: { type: "string", enum: ["phone", "email"] },
      contactValue: { type: "string", description: "The phone number or email address" },
      vehicleMake: { type: "string" }, vehicleModel: { type: "string" }, modelYear: { type: "string" },
      engineSize: { type: "string", description: "Engine displacement like \"3.5L\" or \"5.7L\" — required to pick the flash protocol at the install. \"unknown\" only if the customer genuinely doesn't know after being asked." },
      city: { type: "string" }, state: { type: "string" },
      questionSummary: { type: "string", description: "One-sentence summary of what they need" },
      reason: { type: "string", enum: ["asked-for-human", "guardrail", "no-answer"] },
    },
    required: ["customerName", "contactMethod", "contactValue", "vehicleMake", "vehicleModel", "modelYear", "engineSize", "city", "state", "questionSummary", "reason"],
  },
};

function buildSystemPrompt(pageContext) {
  return [
    `You are Tuned Yota's website chat agent — ${labelForPage(pageContext)}. Tuned Yota is a Toyota/Lexus performance-tuning business (OTT tunes, Magnuson superchargers, AMSOIL fluids) serving the upper Midwest via scheduled events.`,
    "OTT stands for Overland Tailor Tuning — the ECU calibration provider whose tunes Tuned Yota's certified installers flash at events. Never expand OTT as anything else.",
    "The chat window has already greeted the customer with: \"Thank you for using Tuned Yota's chat agent.\" — do NOT repeat that greeting; answer their first message directly.",
    "Style: chat, not email. 1-3 short sentences per reply. Follow the NEPQ method below — mirror the customer's words, ask one question at a time, advance toward either the booking page (https://tunedyota.com/find-your-exact-tune) or a live-installer transfer. Never hard-sell.",
    "Early in every conversation, naturally get their first name (\"Happy to help — who am I talking with?\") and use it. Every person who reaches out is a client record; a name makes the record real.",
    "LINK HYGIENE (customers reported broken links): when you send any URL, put it on its own line with NOTHING before or after it on that line — no period, comma, parentheses, or closing punctuation. SMS and Messenger clients swallow trailing punctuation into the link and it 404s.",
    "FRUSTRATION RULE: if the customer asks for a human/real person a second time, or shows frustration with the AI (\"what even is this\", swearing at the bot), stop the playbook and switch to TRANSFER MODE immediately with whatever fields you have — do not ask another discovery question first.",
    "Measured performance example you may share when asked about gains (never as a promise): on Tuned Yota's own 5.7L Tundra shop truck, the tune alone measured +40 whp on an otherwise-stock calibration. Results vary by vehicle, fuel, and mods — offer a live installer transfer for expectations on THEIR truck.",
    "For SUPERCHARGER dyno/gain figures: quote only numbers published at overlandtailor.com, and factory/base power output figures from magnusonsuperchargers.com. Point the customer at those sources; NEVER invent or estimate a number.",
    "",
    "== APPROVED STANCES (owner-approved 2026-08-02 — say these; add nothing beyond them) ==",
    "WARRANTY (when asked): Warranties are subjective by nature — Tuned Yota has never had a warranty issue, and we can't promise one may or may not occur in the future; these are better conversations to have over the phone because there's a lot of nuance (offer the transfer). What should be encouraging: the OTT calibration shows up as a stock calibration ID on the vehicle — nothing overtly says the calibration was updated. And OTT has engine calibrations certified by SEMA — an industry-standard credential program that lets specialty aftermarket manufacturers prove compliance with the EPA's Tampering Policy under the Clean Air Act — plus engine platforms that are CARB certified, meeting the California Air Resources Board's emission limits, which are often tougher than federal standards.",
    "MILITARY DISCOUNT (ONLY if the client brings it up — never volunteer it): \"Yes — thank you for your service, we really appreciate it. As a token of our gratitude we discount 10%.\"",
    "",
    "== HARD GUARDRAILS (no exceptions — offer a live installer transfer instead) ==",
    "1. NEVER quote custom, negotiated, or bundle pricing. Published per-vehicle base prices below are OK to state.",
    "2. NEVER guarantee fitment or that a specific mod combo is safe/supported. Typical compatibility is OK to discuss; specifics go to the installer.",
    "3. NEVER book, move, or cancel appointments. Link to the booking page instead.",
    "4. NEVER make warranty, legal, or emissions-compliance claims beyond the owner-approved stance in the APPROVED STANCES section below — deliver that stance verbatim in substance, add nothing to it, and still offer a live conversation for specifics.",
    "5. NEVER state or confirm any address, location, or meeting spot other than the published event addresses on the booking page. If a customer asks where to come, says they are coming to you, or claims an in-person meeting was arranged outside a listed event, do NOT keep deflecting — switch to TRANSFER MODE immediately with whatever fields you already have.",
    "When a guardrail applies OR the customer asks for a live person OR you cannot answer properly, switch to TRANSFER MODE. In transfer mode the one-question-at-a-time rule is OFF: send ONE message asking for everything still missing as a single compact list — name, best way to reach them (phone or email; if they're texting, offer to just use this number), that phone/email, vehicle year/make/model AND engine size (like 3.5L or 5.7L — booking requires it because the engine picks the flash protocol; if they don't know it after you ask, pass \"unknown\" and the installer will confirm), and city/state. Explain you're asking so you can connect them with their NEAREST OTT installer. Only ask for what the conversation hasn't already given you; the moment every required field is known, call transfer_to_installer immediately — no extra confirmation round.",
    "",
    "== NEPQ PLAYBOOK ==", PLAYBOOK.slice(0, 12000),
    "== VOICE ==", VOICE.slice(0, 3000),
    "== MARKETS (city → installer) ==",
    MARKETS.map((m) => `${m.city}, ${m.state} → ${(INSTALLERS[m.inst] || INSTALLERS.aaron).name}`).join("\n"),
    "== UPCOMING EVENTS (published schedule — dates are bookable via the booking page) ==",
    eventsSummary().slice(0, 2500),
    "== PUBLISHED PRICING ==", pricingSummary().slice(0, 4000),
  ].join("\n");
}

// turns: [{role:"user"|"assistant"|"installer", text}] → Messages API messages.
// Installer turns become user-role context blocks so the model knows what the
// live installer already told the customer.
function toMessages(turns) {
  return (turns || []).map((t) => t.role === "installer"
    ? { role: "user", content: `[Live installer message to the customer]: ${t.text}` }
    : { role: t.role, content: t.text });
}

async function runChat({ turns, pageContext }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 500,
        system: [{ type: "text", text: buildSystemPrompt(pageContext), cache_control: { type: "ephemeral" } }],
        tools: [TRANSFER_TOOL],
        messages: toMessages(turns),
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = await res.json();
    const textBlocks = (j.content || []).filter((c) => c.type === "text").map((c) => c.text);
    const tool = (j.content || []).find((c) => c.type === "tool_use" && c.name === "transfer_to_installer");
    return { reply: textBlocks.join(" ").trim(), transfer: tool ? tool.input : null };
  } finally { clearTimeout(timer); }
}

module.exports = { buildSystemPrompt, labelForPage, runChat, toMessages, TRANSFER_TOOL, MODEL };

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
      city: { type: "string" }, state: { type: "string" },
      questionSummary: { type: "string", description: "One-sentence summary of what they need" },
      reason: { type: "string", enum: ["asked-for-human", "guardrail", "no-answer"] },
    },
    required: ["customerName", "contactMethod", "contactValue", "vehicleMake", "vehicleModel", "modelYear", "city", "state", "questionSummary", "reason"],
  },
};

function buildSystemPrompt(pageContext) {
  return [
    `You are Tuned Yota's website chat agent — ${labelForPage(pageContext)}. Tuned Yota is a Toyota/Lexus performance-tuning business (OTT tunes, Magnuson superchargers, AMSOIL fluids) serving the upper Midwest via scheduled events.`,
    "Your FIRST message in every conversation begins exactly: \"Thank you for using Tuned Yota's chat agent.\"",
    "Style: chat, not email. 1-3 short sentences per reply. Follow the NEPQ method below — mirror the customer's words, ask one question at a time, advance toward either the booking page (https://tunedyota.com/find-your-exact-tune) or a live-installer transfer. Never hard-sell.",
    "",
    "== HARD GUARDRAILS (no exceptions — offer a live installer transfer instead) ==",
    "1. NEVER quote custom, negotiated, or bundle pricing. Published per-vehicle base prices below are OK to state.",
    "2. NEVER guarantee fitment or that a specific mod combo is safe/supported. Typical compatibility is OK to discuss; specifics go to the installer.",
    "3. NEVER book, move, or cancel appointments. Link to the booking page instead.",
    "4. NEVER make warranty, legal, or emissions-compliance claims.",
    "When a guardrail applies OR the customer asks for a live person OR you cannot answer properly: collect name, best contact (phone preferred), vehicle make/model/year, and city/state — explain you're asking so you can connect them with their NEAREST OTT installer — then call transfer_to_installer.",
    "",
    "== NEPQ PLAYBOOK ==", PLAYBOOK.slice(0, 12000),
    "== VOICE ==", VOICE.slice(0, 3000),
    "== MARKETS (city → installer) ==",
    MARKETS.map((m) => `${m.city}, ${m.state} → ${(INSTALLERS[m.inst] || INSTALLERS.aaron).name}`).join("\n"),
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

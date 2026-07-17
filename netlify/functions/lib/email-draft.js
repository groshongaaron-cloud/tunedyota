// netlify/functions/lib/email-draft.js
// NEPQ-governed reply drafting. Strategy: docs/sales/nepq-playbook.md. Tone:
// docs/email-voice.md. Grounding: markets.js (nearest installer), vehicles.json
// (pricing), events (next date). Pure prompt-assembly + shape checks; the model
// call is injected/overridable. NOTHING here sends email — drafts only.
const fs = require("node:fs");
const path = require("node:path");
const { getMarket, MARKETS } = require("./markets.js");
const { keyToInstaller } = require("./routing.js");

const read = (p) => { try { return fs.readFileSync(path.join(__dirname, p), "utf8"); } catch { return ""; } };
const PLAYBOOK = read("../../../docs/sales/nepq-playbook.md");
const VOICE = read("../../../docs/email-voice.md");
const VEHICLES = (() => { try { return require("./vehicles.json"); } catch { return {}; } })();

const BANNED = [/act now/i, /best on the market/i, /make an informed decision/i,
  /i hope this (email )?finds you well/i, /as an ai/i, /do not hesitate/i, /delve/i];

// Find the model the customer named and return its pricing block as compact text.
function pricingFor(text) {
  const t = String(text || "").toLowerCase();
  for (const make of Object.keys(VEHICLES)) {
    for (const model of Object.keys(VEHICLES[make])) {
      if (t.includes(model.toLowerCase())) {
        return `${make} ${model}: ` + VEHICLES[make][model]
          .map((c) => `${c.y} ${c.e} from $${c.base}`).join(" · ");
      }
    }
  }
  return "";
}

function groundingFor({ city, state, text }) {
  const market = getMarket(city) || null;
  const installerName = market ? keyToInstaller(market.inst).name : "";
  const stateCities = !market && state
    ? MARKETS.filter((m) => m.state === String(state).toUpperCase()).map((m) => m.city).join(", ") : "";
  return { market, installerName, stateCities, pricing: pricingFor(text), nextEvent: "" };
}

function buildDraftPrompt({ message, classification, grounding, threadContext }) {
  const g = grounding || {};
  return [
    "Draft a reply email for Aaron at Tuned Yota (Toyota/Lexus performance tuning).",
    "Follow the NEPQ playbook below EXACTLY. Non-negotiables:",
    "- End with exactly ONE question or one micro-commitment. Never zero, never several.",
    "- NEVER give a bare price/number to a cold price ask — deflect-with-purpose per the playbook.",
    "- If the customer shows explicit booking intent, go straight to calm, low-friction scheduling.",
    "- Mirror the customer's exact words. Neutral language. 3-6 sentences.",
    "- Sign off: — Aaron @ Tuned Yota · (612) 406-7117",
    "Output ONLY the email body text (no subject, no commentary).",
    "", "== NEPQ PLAYBOOK ==", PLAYBOOK.slice(0, 14000),
    "", "== VOICE ==", VOICE.slice(0, 4000),
    "", "== FACTS YOU MAY USE ==",
    g.market ? `Their market: ${g.market.city} — installer ${g.installerName}.` : "Their location is unknown — the reply must ask where they're located.",
    g.stateCities ? `Cities we serve in their state: ${g.stateCities}.` : "",
    g.pricing ? `Pricing (use ONLY per the playbook's proposal rules): ${g.pricing}` : "",
    "Booking: https://tunedyota.com/find-your-exact-tune · Phone/text: (612) 406-7117",
    "", `== CLASSIFICATION == bucket=${classification.bucket} stage=${classification.stage} summary=${classification.summary}`,
    threadContext ? `== EARLIER IN THIS THREAD ==\n${String(threadContext).slice(0, 3000)}` : "",
    "", "== CUSTOMER EMAIL ==", `From: ${message.headers.from}`, `Subject: ${message.headers.subject}`,
    "", String(message.textBody || "").slice(0, 5000),
  ].filter((x) => x !== "").join("\n");
}

function checkDraftShape(text) {
  const t = String(text || "").trim();
  const problems = [];
  const questions = (t.match(/\?/g) || []).length;
  if (questions < 1) problems.push("no question");
  if (questions > 3) problems.push("too many questions");
  for (const re of BANNED) if (re.test(t)) problems.push(`banned phrase: ${re}`);
  if (t.length < 40) problems.push("too short");
  return { ok: problems.length === 0, problems };
}

module.exports = { groundingFor, buildDraftPrompt, checkDraftShape, pricingFor };

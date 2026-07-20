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
  /i hope this (email )?finds you well/i, /as an ai/i, /do not hesitate/i, /delve/i,
  /furthermore/i, /i understand your concern/i,
  /\b(?:tune|tuning|calibration)\s+packages?\b/i];   // it's a calibration, never a "package"

// Model year the customer stated, if any. Adjacent-to-model 4-digit first, then
// any 4-digit year, then a 2-digit year adjacent to the model ("23 tacoma").
// Guards: no digit may precede/follow the 2-digit form ("gx470" is not '47),
// and 2-digit values 40-89 are treated as not-a-year.
function statedYear(t, modelEsc) {
  const Y4 = "(19[89]\\d|20[0-3]\\d)";
  let m = t.match(new RegExp(Y4 + "\\s+" + modelEsc)) || t.match(new RegExp(modelEsc + "\\s+'?" + Y4 + "(?!\\d)"));
  if (m) return Number(m[1]);
  m = t.match(new RegExp("(?<!\\d)" + Y4 + "(?!\\d)"));
  if (m) return Number(m[1]);
  m = t.match(new RegExp("(?<!\\d)'?(\\d{2})\\s+" + modelEsc)) || t.match(new RegExp(modelEsc + "\\s+'?(\\d{2})(?!\\d)"));
  if (m) { const n = Number(m[1]); return n >= 90 ? 1900 + n : n <= 39 ? 2000 + n : null; }
  return null;
}

// Does a vehicles.json year range ("2016-2023", "2024+", "2023") cover the year?
function coversYear(y, range) {
  const m = String(range).match(/^(\d{4})(?:-(\d{4})|(\+))?$/);
  return !!m && y >= Number(m[1]) && y <= (m[2] ? Number(m[2]) : m[3] ? 9999 : Number(m[1]));
}

// Find the model the customer named and return its pricing block as compact text.
// When the customer also stated a model year, narrow to the engines actually
// offered that year — a '23 Tacoma must never be offered the 2024+ 2.4L turbo.
// A year matching no known range falls back to the full list (drafter will ask).
function pricingFor(text) {
  const t = String(text || "").toLowerCase();
  for (const make of Object.keys(VEHICLES)) {
    for (const model of Object.keys(VEHICLES[make])) {
      const esc = model.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + esc + "(\\b|(?=[0-9]))");
      if (re.test(t)) {
        const combos = VEHICLES[make][model];
        const line = (list) => list.map((c) => `${c.y} ${c.e} from $${c.base}`).join(" · ");
        const year = statedYear(t, esc);
        const fit = year == null ? [] : combos.filter((c) => coversYear(year, c.y));
        if (fit.length) {
          return `${make} ${model} (${year}): ` + line(fit)
            + ` — the ONLY engines offered for a ${year}; never mention engines from other model years.`;
        }
        return `${make} ${model}: ` + line(combos);
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

// Compact "earlier in this thread" block for the drafter. Prior messages only —
// the current message is already in the prompt; keep the 6 most recent, bodies
// truncated, so the block stays inside buildDraftPrompt's 3000-char slice budget.
function formatThreadContext(messages, currentId) {
  const prior = (Array.isArray(messages) ? messages : []).filter((m) => m && m.id !== currentId);
  return prior.slice(-6).map((m) => {
    const from = (m.headers && m.headers.from) || "";
    const date = (m.headers && m.headers.date) || "";
    const body = String(m.textBody || "").trim().slice(0, 600);
    return `From: ${from}${date ? ` · ${date}` : ""}\n${body}`;
  }).join("\n---\n");
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
    "- When engines come up, offer ONLY engines valid for their stated model year per the pricing facts — never an engine from a different generation.",
    "- Call our tune a 'calibration' (or 'OTT calibration'/'tune') — NEVER a 'package'.",
    "- NEVER offer remote or mail-in tuning. Drive every path to an IN-PERSON decision: booking an event, or scheduling in person with a live Tuned Yota installer.",
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
  if (!/aaron @ tuned yota/i.test(t)) problems.push("missing sign-off");
  return { ok: problems.length === 0, problems };
}

module.exports = { groundingFor, buildDraftPrompt, checkDraftShape, pricingFor, formatThreadContext };

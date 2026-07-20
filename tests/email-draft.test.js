const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDraftPrompt, checkDraftShape, groundingFor, formatThreadContext } = require("../netlify/functions/lib/email-draft.js");

test("groundingFor matches a known market city and pulls pricing for the named model", () => {
  const g = groundingFor({ city: "Fargo", text: "I have a 2019 Tundra that falls on its face towing" });
  assert.equal(g.market && g.market.city, "Fargo");
  assert.ok(g.installerName, "installer name resolved");
  assert.ok(g.pricing && /Tundra/.test(g.pricing), "Tundra pricing block found");
});
test("groundingFor with unknown city yields no market (draft must ask)", () => {
  const g = groundingFor({ city: "", text: "how much for a tune?" });
  assert.equal(g.market, null);
});
test("buildDraftPrompt embeds playbook rules, voice, stage, and grounding", () => {
  const p = buildDraftPrompt({ message: { headers: { from: "jo@x.com", subject: "tune?" }, textBody: "how much for a tune" },
    classification: { bucket: "inquiry", stage: "connect", summary: "cold price ask" },
    grounding: { market: null, installerName: "", pricing: "", nextEvent: "" }, threadContext: "" });
  assert.match(p, /NEPQ/i);
  assert.match(p, /exactly ONE question/i);
  assert.match(p, /never give a bare price/i);
});
test("checkDraftShape enforces the one-question ending and banned phrases", () => {
  assert.equal(checkDraftShape("Happy to help. What year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117").ok, true);
  assert.equal(checkDraftShape("Here is all the info. Thanks!").ok, false, "no question");
  assert.equal(checkDraftShape("Act now! What year? A? B? C? D?").ok, false, "pressure + too many questions");
  assert.equal(checkDraftShape("I hope this email finds you well. What year?").ok, false, "AI-speak");
});
test("checkDraftShape: missing sign-off fails", () => {
  const r = checkDraftShape("Happy to help. What year is your Tundra?");
  assert.equal(r.ok, false, "should fail without sign-off");
  assert.ok(r.problems.some((p) => /sign-off/i.test(p)), `expected missing sign-off problem, got: ${r.problems}`);
});
test("checkDraftShape: 'furthermore' is a banned phrase", () => {
  const r = checkDraftShape("Furthermore, what year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117");
  assert.equal(r.ok, false, "furthermore should be banned");
  assert.ok(r.problems.some((p) => /banned phrase/i.test(p)), `expected banned phrase problem, got: ${r.problems}`);
});
test("checkDraftShape: 'i understand your concern' is a banned phrase", () => {
  const r = checkDraftShape("I understand your concern. What year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117");
  assert.equal(r.ok, false, "i understand your concern should be banned");
  assert.ok(r.problems.some((p) => /banned phrase/i.test(p)), `expected banned phrase problem, got: ${r.problems}`);
});
test("pricingFor: 'sequoias are big trees' does NOT match Sequoia pricing", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("sequoias are big trees");
  assert.equal(result, "", `expected no pricing for plural 'sequoias', got: ${result}`);
});
test("pricingFor: 'my gx470' matches GX pricing", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("my gx470 needs a tune");
  assert.ok(result && /GX/.test(result), `expected GX pricing for 'gx470', got: ${result}`);
});
const TMSG = (id, from, body, date = "") => ({ id, headers: { from, date, subject: "s" }, textBody: body });

test("formatThreadContext renders prior messages, excluding the current one", () => {
  const out = formatThreadContext([
    TMSG("m1", "jo@x.com", "how much for a tune?", "Mon, 13 Jul 2026 10:00:00 -0500"),
    TMSG("m2", "info@tunedyota.com", "What year is your Tundra?"),
    TMSG("m3", "jo@x.com", "it's a 2019, crewmax"),
  ], "m3");
  assert.match(out, /jo@x\.com/);
  assert.match(out, /how much for a tune\?/);
  assert.match(out, /What year is your Tundra\?/);
  assert.ok(!out.includes("crewmax"), "current message must be excluded — it's already in the prompt");
});
test("formatThreadContext returns '' for a single-message thread", () => {
  assert.equal(formatThreadContext([TMSG("m1", "jo@x.com", "how much?")], "m1"), "");
  assert.equal(formatThreadContext([], "m1"), "");
  assert.equal(formatThreadContext(null, "m1"), "");
});
test("formatThreadContext keeps only the most recent prior messages and truncates long bodies", () => {
  const msgs = Array.from({ length: 9 }, (_, i) => TMSG("m" + i, "jo@x.com", `message number ${i} ` + "x".repeat(1200)));
  msgs.push(TMSG("current", "jo@x.com", "latest"));
  const out = formatThreadContext(msgs, "current");
  assert.ok(!out.includes("message number 0"), "oldest messages dropped");
  assert.ok(out.includes("message number 8"), "most recent prior message kept");
  assert.ok(out.length < 4500, `total stays bounded, got ${out.length}`);
});

test("pricingFor: '2019 Tundra' matches Tundra pricing", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("2019 Tundra that falls on its face");
  assert.ok(result && /Tundra/.test(result), `expected Tundra pricing, got: ${result}`);
});

// Model-year narrowing: a stated year must limit the engines the drafter can offer.
// Regression: a "23 tacoma" lead was drafted a 2.4L-turbo option (2024+ only).
test("pricingFor: '23 tacoma' narrows to 2016-2023 engines and excludes the 2024+ turbo", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("Howdy, I have a 23 tacoma. I was wondering about doing a tune to it.");
  assert.ok(/3\.5L V6/.test(result), `expected 3.5L V6, got: ${result}`);
  assert.ok(/2\.7L I4/.test(result), `expected 2.7L I4, got: ${result}`);
  assert.ok(!/2\.4L/.test(result), `2.4L turbo is 2024+ and must be excluded, got: ${result}`);
  assert.ok(/ONLY engines/i.test(result), `expected the only-engines guard note, got: ${result}`);
});
test("pricingFor: '2025 Tacoma' narrows to the 2024+ turbo only", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("just bought a 2025 Tacoma, can you tune it?");
  assert.ok(/2\.4L-T/.test(result), `expected 2.4L-T, got: ${result}`);
  assert.ok(!/3\.5L V6/.test(result), `3.5L V6 ended in 2023 and must be excluded, got: ${result}`);
});
test("pricingFor: no stated year still lists every generation", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("thinking about tuning my tacoma");
  assert.ok(/2\.4L-T/.test(result) && /3\.5L V6/.test(result) && /4\.0L V6/.test(result),
    `expected all generations when no year stated, got: ${result}`);
});
test("pricingFor: year outside all known ranges falls back to the full list", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("I have a 1999 tacoma");
  assert.ok(/3\.5L V6/.test(result) && /2\.4L-T/.test(result),
    `expected full list for an unmatched year, got: ${result}`);
});
test("pricingFor: 'my gx470' does not misread the 47 in gx470 as a model year", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("my gx470 needs a tune");
  assert.ok(/GX/.test(result), `expected GX pricing, got: ${result}`);
  assert.ok(!/ONLY engines/i.test(result), `must not narrow without a real year, got: ${result}`);
});
test("buildDraftPrompt states the model-year engine guard as a non-negotiable", () => {
  const p = buildDraftPrompt({ message: { headers: { from: "jo@x.com", subject: "tune?" }, textBody: "23 tacoma tune?" },
    classification: { bucket: "inquiry", stage: "connect", summary: "tacoma inquiry" },
    grounding: { market: null, installerName: "", pricing: "", nextEvent: "" }, threadContext: "" });
  assert.match(p, /ONLY engines valid for/i);
});

test("checkDraftShape: calling the calibration a 'package' is banned", () => {
  const r = checkDraftShape("Our tune package is great. What year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117");
  assert.equal(r.ok, false, "'tune package' should be banned");
  assert.ok(r.problems.some((p) => /banned phrase/i.test(p)));
  assert.equal(checkDraftShape("The calibration package fixes it. What year?\n— Aaron @ Tuned Yota · (612) 406-7117").ok, false, "'calibration package' banned");
});
test("checkDraftShape: a legit Magnuson 'supercharger package' is NOT falsely banned", () => {
  const r = checkDraftShape("The Magnuson supercharger package is a separate build. What year is your Tundra?\n— Aaron @ Tuned Yota · (612) 406-7117");
  assert.equal(r.ok, true, `should not ban 'supercharger package': ${JSON.stringify(r.problems)}`);
});
test("buildDraftPrompt encodes the calibration-not-package and in-person-only rules", () => {
  const p = buildDraftPrompt({ message: { headers: { from: "x@y.com", subject: "hi" }, textBody: "hi" },
    classification: { bucket: "b", stage: "s", summary: "z" }, grounding: {}, threadContext: "" });
  assert.match(p, /NEVER a 'package'/i);
  assert.match(p, /NEVER offer remote or mail-in tuning/i);
});

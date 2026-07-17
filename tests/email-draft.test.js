const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildDraftPrompt, checkDraftShape, groundingFor } = require("../netlify/functions/lib/email-draft.js");

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
test("pricingFor: '2019 Tundra' matches Tundra pricing", () => {
  const { pricingFor } = require("../netlify/functions/lib/email-draft.js");
  const result = pricingFor("2019 Tundra that falls on its face");
  assert.ok(result && /Tundra/.test(result), `expected Tundra pricing, got: ${result}`);
});

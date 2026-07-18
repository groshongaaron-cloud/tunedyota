const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemPrompt, labelForPage, runChat, TRANSFER_TOOL } = require("../netlify/functions/lib/chat-agent.js");

test("labelForPage maps page context to persona line", () => {
  assert.match(labelForPage("amsoil"), /AMSOIL Fluid Specialist/);
  assert.match(labelForPage("magnuson"), /Magnuson Supercharger Specialist/);
  assert.match(labelForPage("default"), /OTT installer/);
});

test("system prompt carries greeting, guardrails, and NEPQ material", () => {
  const p = buildSystemPrompt("default");
  assert.match(p, /Thank you for using Tuned Yota's chat agent\./);
  assert.match(p, /never quote custom/i);
  assert.match(p, /never guarantee fitment/i);
  assert.match(p, /never make warranty/i);
  assert.match(p, /never book, move, or cancel/i);
  assert.match(p, /NEPQ/);
});

test("runChat returns text reply from a text response", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "Great question — ..." }] }) });
  const out = await runChat({ turns: [{ role: "user", text: "hi" }], pageContext: "default" },
    { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(out.reply, "Great question — ...");
  assert.equal(out.transfer, null);
});

test("runChat surfaces transfer_to_installer tool call", async () => {
  const input = { customerName: "Ty", contactMethod: "phone", contactValue: "5075550100",
    vehicleMake: "Toyota", vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN",
    questionSummary: "supercharger fitment", reason: "no-answer" };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [
    { type: "text", text: "Connecting you now." },
    { type: "tool_use", id: "tu1", name: "transfer_to_installer", input }] }) });
  const out = await runChat({ turns: [{ role: "user", text: "get me a person" }], pageContext: "default" },
    { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.deepEqual(out.transfer, input);
});

test("runChat sends installer turns as user-role context", async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "ok" }] }) }; };
  await runChat({ turns: [
    { role: "user", text: "q" }, { role: "assistant", text: "a" },
    { role: "installer", text: "Aaron here" }, { role: "user", text: "thanks" }],
    pageContext: "default" }, { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(body.messages.length, 4);
  assert.equal(body.messages[2].role, "user");
  assert.match(body.messages[2].content, /^\[Live installer/);
  assert.equal(body.max_tokens, 500);
  assert.equal(body.model, "claude-sonnet-4-6");
  assert.equal(body.tools[0].name, "transfer_to_installer");
});

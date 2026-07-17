const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyEmail, extractLeadFields, BUCKETS } = require("../netlify/functions/lib/email-classify.js");

const stubText = (text) => async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });
const MSG = { headers: { from: "OTT <info@overlandtailor.com>", subject: "OTT" }, textBody: "Name: Q\nPhone: 555\nCity: Fargo" };

test("classifyEmail parses a clean JSON verdict", async () => {
  const out = await classifyEmail(MSG, { apiKey: "k", fetchImpl: stubText('{"bucket":"ott-lead","stage":"situation","confidence":0.97,"summary":"OTT lead: Q, Fargo"}') });
  assert.equal(out.bucket, "ott-lead");
  assert.equal(out.summary, "OTT lead: Q, Fargo");
});
test("garbage / low-confidence / unknown bucket all fall to sensitive", async () => {
  for (const raw of ["not json", '{"bucket":"weird"}', '{"bucket":"inquiry","confidence":0.2}']) {
    const out = await classifyEmail(MSG, { apiKey: "k", fetchImpl: stubText(raw) });
    assert.equal(out.bucket, "sensitive", raw);
  }
});
test("no api key classifies as sensitive (degrade to human)", async () => {
  const out = await classifyEmail(MSG, { apiKey: "" });
  assert.equal(out.bucket, "sensitive");
});
test("extractLeadFields maps LLM JSON to the lead-ingest shape", async () => {
  const out = await extractLeadFields(MSG, { apiKey: "k",
    fetchImpl: stubText('{"name":"Quinn","phone":"+1920","email":"q@x.com","city":"Green Bay","state":"WI","vehicle":"2006 Lexus GX470","mods":"None","ghlLink":""}') });
  assert.equal(out.name, "Quinn");
  assert.equal(out.channel, "ott-national");
});
test("extraction without phone AND email returns null (flag, don't ingest junk)", async () => {
  const out = await extractLeadFields(MSG, { apiKey: "k", fetchImpl: stubText('{"name":"Quinn"}') });
  assert.equal(out, null);
});

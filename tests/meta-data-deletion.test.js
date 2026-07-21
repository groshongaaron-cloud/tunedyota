// tests/meta-data-deletion.test.js
// Meta user-data-deletion callback: POST signed_request -> delete the sender's
// fb:/ig: Chat Sessions rows -> JSON { url, confirmation_code }; GET = status page.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { handler, parseSignedRequest, confirmationCode } = require("../netlify/functions/meta-data-deletion.js");

const SECRET = "shh";
const ENV = { META_APP_SECRET: SECRET, AIRTABLE_TOKEN: "tok", AIRTABLE_BASE_ID: "base1", URL: "https://tunedyota.com" };

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function makeSignedRequest(payload, secret = SECRET) {
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(payloadB64).digest());
  return `${sig}.${payloadB64}`;
}

// Airtable fetch stub: GET list -> `records`; DELETE -> ok, ids recorded.
function airtableStub(records) {
  const deleted = [];
  const listUrls = [];
  const fetchImpl = async (url, opts = {}) => {
    if ((opts.method || "GET") === "DELETE") {
      deleted.push(url.split("/").pop());
      return { ok: true, json: async () => ({ deleted: true }) };
    }
    listUrls.push(url);
    return { ok: true, json: async () => ({ records }) };
  };
  return { fetchImpl, deleted, listUrls };
}

test("parseSignedRequest returns the payload for a valid signature, null otherwise", () => {
  const payload = { algorithm: "HMAC-SHA256", user_id: "U77", issued_at: 1 };
  const good = parseSignedRequest(makeSignedRequest(payload), SECRET);
  assert.equal(good.user_id, "U77");
  assert.equal(parseSignedRequest(makeSignedRequest(payload, "wrong-secret"), SECRET), null);
  assert.equal(parseSignedRequest("not-a-signed-request", SECRET), null);
  assert.equal(parseSignedRequest("", SECRET), null);
  assert.equal(parseSignedRequest(makeSignedRequest(payload), ""), null);
});

test("POST deletes every fb:/ig: session for the user and returns url + confirmation_code", async () => {
  const { fetchImpl, deleted, listUrls } = airtableStub([
    { id: "recA", fields: { "Session ID": "fb:U77" } },
    { id: "recB", fields: { "Session ID": "fb:U77:1784600000000" } },
    { id: "recC", fields: { "Session ID": "ig:U77" } },
  ]);
  const body = new URLSearchParams({ signed_request: makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "U77" }) }).toString();
  const res = await handler({ httpMethod: "POST", body }, { env: ENV, fetchImpl });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/json");
  const j = JSON.parse(res.body);
  const code = confirmationCode("U77", SECRET);
  assert.equal(j.confirmation_code, code);
  assert.ok(j.url.startsWith("https://tunedyota.com/"), j.url);
  assert.ok(j.url.includes(code), j.url);
  assert.deepEqual(deleted.sort(), ["recA", "recB", "recC"]);
  // The lookup is scoped to this user's fb:/ig: ids (exact or ":"-suffixed).
  const formula = decodeURIComponent(listUrls[0]);
  assert.ok(formula.includes('"fb:U77"') && formula.includes('"ig:U77"'), formula);
});

test("POST with a bad signature is a 400 and deletes nothing", async () => {
  const { fetchImpl, deleted } = airtableStub([{ id: "recA", fields: { "Session ID": "fb:U77" } }]);
  const body = new URLSearchParams({ signed_request: makeSignedRequest({ user_id: "U77" }, "wrong-secret") }).toString();
  const res = await handler({ httpMethod: "POST", body }, { env: ENV, fetchImpl });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(deleted, []);
  const missing = await handler({ httpMethod: "POST", body: "" }, { env: ENV, fetchImpl });
  assert.equal(missing.statusCode, 400);
});

test("POST with no matching sessions still returns a confirmation", async () => {
  const { fetchImpl, deleted } = airtableStub([]);
  const body = new URLSearchParams({ signed_request: makeSignedRequest({ user_id: "GHOST" }) }).toString();
  const res = await handler({ httpMethod: "POST", body }, { env: ENV, fetchImpl });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).confirmation_code, confirmationCode("GHOST", SECRET));
  assert.deepEqual(deleted, []);
});

test("store failure returns 500 (Meta retries) and Slack-notifies", async () => {
  const notes = [];
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "down" });
  const notify = async (text) => { notes.push(text); };
  const body = new URLSearchParams({ signed_request: makeSignedRequest({ user_id: "U77" }) }).toString();
  const res = await handler({ httpMethod: "POST", body }, { env: ENV, fetchImpl, notify });
  assert.equal(res.statusCode, 500);
  assert.equal(notes.length, 1);
  assert.ok(/deletion/i.test(notes[0]), notes[0]);
});

test("GET renders a status page that echoes the confirmation code", async () => {
  const res = await handler({ httpMethod: "GET", queryStringParameters: { code: "abc123" } }, { env: ENV });
  assert.equal(res.statusCode, 200);
  assert.ok(/text\/html/.test(res.headers["Content-Type"]));
  assert.ok(res.body.includes("abc123"));
  assert.ok(/complete/i.test(res.body));
});

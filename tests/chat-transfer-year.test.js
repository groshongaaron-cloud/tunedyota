// tests/chat-transfer-year.test.js
// A3: verify modelYear threads from chat transfer and OTT email into the ingest body.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { escalate } = require("../netlify/functions/chat.js");
const { parseOttLeadEmail } = require("../netlify/functions/lib/ott-email.js");
const { runSweep } = require("../netlify/functions/inbox-sweep.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", ANTHROPIC_API_KEY: "k" };

// ── chat transfer → ingest body ───────────────────────────────────────────────

test("escalate: modelYear from transfer lands as its own field in the ingest body", async () => {
  let capturedBody;
  await escalate({
    transfer: {
      customerName: "Sam", contactMethod: "phone", contactValue: "6125550100",
      vehicleMake: "Toyota", vehicleModel: "Tundra", modelYear: "2019",
      city: "Minneapolis", state: "MN", questionSummary: "supercharger fitment", reason: "no-answer",
    },
    sess: { id: "s1", turns: [], pageContext: "default" },
  }, {
    env: ENV, log: { error: () => {} },
    ingest: async (b) => { capturedBody = b; return { ok: true }; },
    sms: async () => ({}),
    push: async () => ({}),
    logEscalation: async () => {},
  });
  assert.equal(capturedBody.modelYear, "2019", "modelYear field must equal the transfer value");
});

test("escalate: modelYear 'unknown' (invalid year) maps to empty string in the ingest body", async () => {
  let capturedBody;
  await escalate({
    transfer: {
      customerName: "Sam", contactMethod: "phone", contactValue: "6125550100",
      vehicleMake: "Toyota", vehicleModel: "Tundra", modelYear: "unknown",
      city: "Minneapolis", state: "MN", questionSummary: "q", reason: "no-answer",
    },
    sess: { id: "s1", turns: [], pageContext: "default" },
  }, {
    env: ENV, log: { error: () => {} },
    ingest: async (b) => { capturedBody = b; return { ok: true }; },
    sms: async () => ({}),
    push: async () => ({}),
    logEscalation: async () => {},
  });
  assert.equal(capturedBody.modelYear, "", "non-year value must produce empty string");
});

// ── OTT email → parseOttLeadEmail → ingest body ──────────────────────────────

test("parseOttLeadEmail: Vehicle Year line produces modelYear field on returned object", () => {
  const msg = {
    headers: { from: "OTT <info@overlandtailor.com>", replyTo: "" },
    threadId: "t-ott1",
    textBody: [
      "Name: Dana Tuned", "Phone: +16125550101", "Email: dana@example.com",
      "City: Duluth", "State: MN",
      "Vehicle Year: 2021", "Vehicle Make: Toyota", "Vehicle Model: Tacoma",
      "Engine Size: 2.7", "Transmission Type: automatic_",
      "Engine modifications: None",
    ].join("\n"),
  };
  const p = parseOttLeadEmail(msg);
  assert.equal(p.modelYear, "2021", "modelYear must equal the Vehicle Year field");
  assert.equal(p.vehicle, "2021 Toyota Tacoma", "combined vehicle string unchanged");
});

test("parseOttLeadEmail: email with no Vehicle Year yields empty modelYear", () => {
  const msg = {
    headers: { from: "OTT <info@overlandtailor.com>", replyTo: "" },
    threadId: "t-ott2",
    textBody: "Name: Test\nPhone: +16125550102\nEmail: test@example.com",
  };
  const p = parseOttLeadEmail(msg);
  assert.equal(p.modelYear, "", "modelYear must be empty string when no Vehicle Year present");
});

// ── inbox-sweep → posted body carries modelYear ───────────────────────────────

test("inbox-sweep: OTT lead post body carries modelYear when Vehicle Year is present in email", async () => {
  const posted = [];
  const deps = {
    env: {
      GMAIL_REFRESH_TOKEN: "r", ANTHROPIC_API_KEY: "k",
      INTERNAL_TASK_SECRET: "s", URL: "https://tunedyota.com", SLACK_WEBHOOK_URL: "https://x",
    },
    gmail: {
      listMessages: async () => [{ id: "m-ott", threadId: "t-ott" }],
      getMessage: async () => ({
        id: "m-ott", threadId: "t-ott",
        headers: { from: "OTT <info@overlandtailor.com>", subject: "New Lead", messageId: "<lead@x>", replyTo: "" },
        textBody: [
          "Name: River Lead", "Phone: +16125550103", "Email: river@example.com",
          "City: St. Paul", "State: MN",
          "Vehicle Year: 2019", "Vehicle Make: Toyota", "Vehicle Model: Tundra",
          "Engine Size: 5.7", "Transmission Type: automatic_",
          "Engine modifications: None",
        ].join("\n"),
      }),
      addLabel: async () => {},
    },
    classify: async () => ({ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }),
    postImpl: async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ status: "lead" }) }; },
    notify: async () => {},
    log: { error() {} },
  };
  await runSweep(deps);
  assert.equal(posted.length, 1, "one lead must have been posted");
  assert.equal(posted[0].modelYear, "2019", "posted body must carry modelYear");
  // OTT email puts engine size into goals, not vehicle — vehicle is Year + Make + Model only
  assert.equal(posted[0].vehicle, "2019 Toyota Tundra", "combined vehicle string is Year Make Model only for OTT email");
  assert.match(posted[0].goals, /Engine 5\.7/, "engine size goes into goals for OTT emails");
});

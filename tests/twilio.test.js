// tests/twilio.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../netlify/functions/lib/twilio.js");

// Official twilio-node documented test vector.
const VEC_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const VEC_PARAMS = { CallSid: "CA1234567890ABCDE", Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212" };
const VEC_TOKEN = "12345";
const VEC_SIG = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

test("validateTwilioSignature accepts Twilio's documented vector", () => {
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, VEC_SIG), true);
});

test("validateTwilioSignature rejects a tampered param", () => {
  const tampered = { ...VEC_PARAMS, Digits: "9999" };
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, tampered, VEC_SIG), false);
});

test("validateTwilioSignature fail-closed on missing token or signature", () => {
  assert.equal(T.validateTwilioSignature("", VEC_URL, VEC_PARAMS, VEC_SIG), false);
  assert.equal(T.validateTwilioSignature(VEC_TOKEN, VEC_URL, VEC_PARAMS, ""), false);
});

test("decodeBody parses urlencoded form params", () => {
  const p = T.decodeBody({ body: "From=%2B16125551234&Body=Need+a+tune" });
  assert.equal(p.From, "+16125551234");
  assert.equal(p.Body, "Need a tune");
});

test("decodeBody handles base64-encoded bodies", () => {
  const raw = "From=%2B16125551234&Body=hi";
  const p = T.decodeBody({ body: Buffer.from(raw, "utf-8").toString("base64"), isBase64Encoded: true });
  assert.equal(p.From, "+16125551234");
  assert.equal(p.Body, "hi");
});

test("formatPhone renders a US 10-digit number, passes odd input through", () => {
  assert.equal(T.formatPhone("+16125551234"), "612-555-1234");
  assert.equal(T.formatPhone("weird"), "weird");
});

test("displayName prefixes the formatted number", () => {
  assert.equal(T.displayName("Text", "+16125551234"), "Text 612-555-1234");
});

test("parseForwardNumbers splits CSV, trims, drops blanks", () => {
  assert.deepEqual(T.parseForwardNumbers({ TWILIO_FORWARD_NUMBERS: " +1612, ,+1651 " }), ["+1612", "+1651"]);
  assert.deepEqual(T.parseForwardNumbers({}), []);
});

test("webhookUrl uses rawUrl, or TWILIO_PUBLIC_BASE override", () => {
  assert.equal(T.webhookUrl({ rawUrl: "https://x/.netlify/functions/twilio-sms" }, {}, "twilio-sms"),
    "https://x/.netlify/functions/twilio-sms");
  assert.equal(T.webhookUrl({ rawUrl: "ignored" }, { TWILIO_PUBLIC_BASE: "https://p/" }, "twilio-voice"),
    "https://p/.netlify/functions/twilio-voice");
});

test("escapeXml escapes the five XML entities", () => {
  assert.equal(T.escapeXml(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&apos;");
});

test("smsReplyTwiml wraps an escaped Message", () => {
  const x = T.smsReplyTwiml("Thanks & welcome");
  assert.match(x, /^<\?xml/);
  assert.match(x, /<Response><Message>Thanks &amp; welcome<\/Message><\/Response>/);
});

test("dialTwiml rings every number with timeout + action + callerId", () => {
  const x = T.dialTwiml(["+1612", "+1651"], { timeout: 20, action: "https://a/x", callerId: "+1999" });
  assert.match(x, /timeout="20"/);
  assert.match(x, /action="https:\/\/a\/x"/);
  assert.match(x, /callerId="\+1999"/);
  assert.match(x, /<Number>\+1612<\/Number><Number>\+1651<\/Number>/);
});

test("screenTwiml with a caller number speaks the digits before press-1", () => {
  const x = T.screenTwiml({ action: "https://a/x", caller: "+16125551234" });
  assert.match(x, /Tuned Yota customer call from 6 1 2\. 5 5 5\. 1 2 3 4\. Press 1 to accept\./);
});

test("screenTwiml with a non-US caller falls back to plain spaced digits", () => {
  const x = T.screenTwiml({ action: "https://a/x", caller: "+4420719460" });
  assert.match(x, /from 4 4 2 0 7 1 9 4 6 0\. Press 1 to accept\./);
});

test("screenTwiml without a caller keeps the generic prompt", () => {
  assert.match(T.screenTwiml({ action: "https://a/x" }), /Tuned Yota customer call\. Press 1 to accept\./);
});

test("voicemailTwiml says the greeting in a Polly voice then records with transcription", () => {
  const x = T.voicemailTwiml({ greeting: T.GREETING, transcribeCallback: "https://a/t" });
  assert.match(x, /<Say voice="Polly\.Matthew-Neural">/);
  assert.match(x, /Tuned Yota/);
  assert.match(x, /<Record transcribe="true" transcribeCallback="https:\/\/a\/t" maxLength="120" playBeep="true"\/>/);
});

test("hangupTwiml returns a bare Hangup", () => {
  assert.match(T.hangupTwiml(), /<Response><Hangup\/><\/Response>/);
});

test("GREETING includes the leave-a-message cue and the text-in alternative", () => {
  assert.match(T.GREETING, /after the tone/i);
  assert.match(T.GREETING, /612-406-7117/);
});

test("parseInboundSms maps From/Body to an sms lead", () => {
  const lead = T.parseInboundSms({ From: "+16125551234", Body: "  Want an OTT tune  " });
  assert.deepEqual(lead, { name: "Text 612-555-1234", phone: "+16125551234", channel: "sms",
    source: "twilio:sms", goals: "Want an OTT tune", message: "Want an OTT tune" });
});

test("parseInboundSms falls back to a message note when Body is empty", () => {
  const lead = T.parseInboundSms({ From: "+16125551234", Body: "" });
  assert.equal(lead.message, "inbound text");
});

test("parseInboundCall maps From to a phone lead with the given note", () => {
  const lead = T.parseInboundCall({ From: "+16125551234" }, "call answered by installer");
  assert.deepEqual(lead, { name: "Caller 612-555-1234", phone: "+16125551234", channel: "phone",
    source: "twilio:call", message: "call answered by installer" });
});

test("parseInboundCall defaults the note to 'inbound call'", () => {
  assert.equal(T.parseInboundCall({ From: "+16125551234" }).message, "inbound call");
});

test("parseTranscription folds transcript + recording url into the message", () => {
  const lead = T.parseTranscription({ From: "+16125551234", TranscriptionText: "hi it's Sam about my Tundra", RecordingUrl: "https://rec/1" });
  assert.equal(lead.channel, "phone");
  assert.equal(lead.phone, "+16125551234");
  assert.equal(lead.goals, "hi it's Sam about my Tundra");
  assert.match(lead.message, /^voicemail: hi it's Sam about my Tundra — https:\/\/rec\/1$/);
});

test("ingestLead posts to lead-ingest with the task secret and returns ok", async () => {
  const calls = [];
  const post = async (url, opts) => { calls.push({ url, opts }); return { ok: true }; };
  const out = await T.ingestLead({ name: "Text 612-555-1234", phone: "+16125551234", channel: "sms" },
    { env: { INTERNAL_TASK_SECRET: "sekret", LEAD_INGEST_URL: "https://x/lead-ingest" }, post });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls[0].url, "https://x/lead-ingest");
  assert.equal(calls[0].opts.headers["x-ty-task"], "sekret");
  assert.equal(JSON.parse(calls[0].opts.body).phone, "+16125551234");
});

test("ingestLead swallows a thrown post error -> ok:false", async () => {
  const out = await T.ingestLead({ phone: "x" }, { env: {}, post: async () => { throw new Error("down"); } });
  assert.equal(out.ok, false);
});

test("ingestLead returns ok:false when lead-ingest responds not-ok (e.g. 500)", async () => {
  const out = await T.ingestLead({ phone: "x" }, { env: { LEAD_INGEST_URL: "https://x/lead-ingest" }, post: async () => ({ ok: false, status: 500 }) });
  assert.equal(out.ok, false);
});

test("formatPhone truncates a non-US E.164 to last 10 (documented US-only behavior)", () => {
  // US-only formatter: a non-US number is not specially handled.
  assert.equal(T.formatPhone("+441234567890"), "123-456-7890");
});

test("parseTranscription with no TranscriptionText yields the no-transcription note", () => {
  const lead = T.parseTranscription({ From: "+16125551234", RecordingUrl: "https://rec/1" });
  assert.match(lead.message, /voicemail \(no transcription\) — https:\/\/rec\/1/);
});

test("webhookUrl returns empty string when neither rawUrl nor TWILIO_PUBLIC_BASE is present", () => {
  assert.equal(T.webhookUrl({}, {}, "twilio-sms"), "");
});

test("webhookUrl rewrites last path segment to fnName", () => {
  assert.equal(
    T.webhookUrl({ rawUrl: "https://x/.netlify/functions/twilio-voice" }, {}, "twilio-voice-transcription"),
    "https://x/.netlify/functions/twilio-voice-transcription"
  );
});

test("webhookUrl preserves the query string (Twilio signs the full URL)", () => {
  assert.equal(T.webhookUrl({ rawUrl: "https://x/.netlify/functions/twilio-voice?attempt=2" }, {}, "twilio-voice"),
    "https://x/.netlify/functions/twilio-voice?attempt=2");
  assert.equal(T.webhookUrl({ rawUrl: "https://x/.netlify/functions/twilio-voice?attempt=2" }, { TWILIO_PUBLIC_BASE: "https://p" }, "twilio-voice"),
    "https://p/.netlify/functions/twilio-voice?attempt=2");
});

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

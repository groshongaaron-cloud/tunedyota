const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readVinFromImage, normalizeVin } = require("../netlify/functions/lib/vin-ocr-core.js");

const IMG = "aGVsbG8="; // any non-empty base64
// Build a stub Anthropic fetch that returns the given assistant text.
const stubOk = (text) => async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });

test("normalizeVin accepts a clean 17-char VIN and rejects I/O/Q and wrong length", () => {
  assert.equal(normalizeVin("jtebu5jr4k5601234"), "JTEBU5JR4K5601234");
  assert.equal(normalizeVin("JTEBU5JR4K560123"), "");      // 16 chars
  assert.equal(normalizeVin("JTEBU5JR4K5601234X"), "");    // 18 chars
  assert.equal(normalizeVin("IOQEBU5JR4K5601234"), "");    // 18 chars AND I/O/Q
  assert.equal(normalizeVin("JTEBU5JR4K560123I"), "");     // exactly 17 chars but ends in I (isolates the I/O/Q rule)
});

test("returns unconfigured when no apiKey is present (feature degrades to manual)", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "" });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unconfigured");
});

test("returns no-image when the image is blank", async () => {
  const out = await readVinFromImage({ imageBase64: "", mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: stubOk("X") });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no-image");
});

test("reads a VIN and normalizes surrounding whitespace/case", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" },
    { apiKey: "k", fetchImpl: stubOk("  jtebu5jr4k5601234 \n") });
  assert.equal(out.ok, true);
  assert.equal(out.vin, "JTEBU5JR4K5601234");
});

test("strips a data: URL prefix from the image before sending", async () => {
  let sentBody;
  const fetchImpl = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "JTEBU5JR4K5601234" }] }) }; };
  await readVinFromImage({ imageBase64: "data:image/jpeg;base64,AAAA", mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl });
  assert.equal(sentBody.messages[0].content[0].source.data, "AAAA");
});

test("treats a NONE / unreadable answer as no-vin", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: stubOk("NONE") });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no-vin");
});

test("fails open (unavailable) on a non-200 from the API", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unavailable");
});

test("fails open (unavailable) when the fetch throws (timeout/network)", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" }, { apiKey: "k", fetchImpl: async () => { throw new Error("aborted"); } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unavailable");
});

test("fails open (unavailable) when the 200 response body is not valid JSON", async () => {
  const out = await readVinFromImage({ imageBase64: IMG, mediaType: "image/jpeg" },
    { apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "unavailable");
});

test("sanitizes an unexpected media type to image/jpeg", async () => {
  let sentBody;
  const fetchImpl = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ content: [{ type: "text", text: "JTEBU5JR4K5601234" }] }) }; };
  await readVinFromImage({ imageBase64: IMG, mediaType: "image/tiff" }, { apiKey: "k", fetchImpl });
  assert.equal(sentBody.messages[0].content[0].source.media_type, "image/jpeg");
});

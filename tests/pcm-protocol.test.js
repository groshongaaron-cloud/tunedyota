// tests/pcm-protocol.test.js — spot checks against the OTT Protocol Selection Guide
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pcmProtocol } = require("../netlify/functions/lib/pcm-protocol.js");

const cases = [
  ["2016-2023 Toyota Tacoma 3.5L V6", "2019", "[46]", "FID 27"],
  ["2016-2023 Toyota Tacoma 2.7L I4", "2018", "[46]", "FID 28"],
  ["2005-2015 Toyota Tacoma 4.0L V6", "2012", "[35]", "FID 24"],
  ["2024+ Toyota Tacoma 2.4L-T I4", "2024", "[95]", ""],
  ["2007-2017 Toyota Tundra 5.7L V8", "2015", "[35]", "FID 24"],
  ["2018-2021 Toyota Tundra 5.7L V8", "2021", "[46]", "FID 28"],
  ["2010-2024 Lexus GX460", "2020", "[35]", "FID 24"],
  ["2007-2014 Toyota FJ Cruiser 4.0L", "2011", "[35]", "FID 24"],
];
for (const [veh, yr, pcm, fid] of cases) {
  test(`${yr} ${veh.replace(/^[\d+-]+ /, "")} -> ${pcm}${fid ? " " + fid : ""}`, () => {
    const r = pcmProtocol(veh, yr);
    assert.ok(r, "expected a match");
    assert.equal(r.pcm, pcm);
    if (fid) assert.equal(r.fid, fid);
  });
}

test("2013-2019 4Runner carries the separate-TCM note", () => {
  const r = pcmProtocol("2010-2019 Toyota 4Runner 4.0L V6", "2016");
  assert.equal(r.pcm, "[35]");
  assert.match(r.note, /TCM flashed separately/);
});

test("2012 4Runner (pre-2013) has no TCM note", () => {
  const r = pcmProtocol("2010-2019 Toyota 4Runner 4.0L V6", "2012");
  assert.equal(r.note, "");
});

test("Gen 4 turbo platforms require the ECU direct-connect cable note", () => {
  const r = pcmProtocol("2024+ Toyota Land Cruiser 250 2.4L-T", "2024");
  assert.equal(r.pcm, "[95]");
  assert.match(r.note, /direct-connect cable/);
  assert.match(r.software, /VFTuner/);
});

test("2003-2004 GX470 is K-Line with the CUW warning", () => {
  const r = pcmProtocol("Lexus GX470", "2003");
  assert.equal(r.pcm, "[35] K-Line");
  assert.match(r.note, /CUW/);
});

test("2019 Tundra without a readable engine lists both candidates for on-site confirmation", () => {
  const r = pcmProtocol("Toyota Tundra", "2019");
  assert.match(r.pcm, /\[35\].*\[46\]|\[46\].*\[35\]/);
  assert.match(r.pcm, /confirm engine/);
});

test("non-guide vehicles and empty input return null", () => {
  assert.equal(pcmProtocol("2020 Toyota Camry 2.5L", "2020"), null);
  assert.equal(pcmProtocol("", ""), null);
});

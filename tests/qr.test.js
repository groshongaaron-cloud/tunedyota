const { test } = require("node:test");
const assert = require("node:assert/strict");
const { qrSvg } = require("../netlify/functions/lib/qr.js");

test("renders a deterministic inline SVG QR for a URL", () => {
  const url = "https://tunedyota.com/amsoil-garage?make=Toyota&model=Tacoma&year=2024";
  const svg = qrSvg(url);
  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.ok((svg.match(/<rect/g) || []).length > 10, "should have many module rects");
  assert.equal(qrSvg(url), svg, "same input -> identical output (deterministic)");
});

test("throws on empty input", () => {
  assert.throws(() => qrSvg(""));
});

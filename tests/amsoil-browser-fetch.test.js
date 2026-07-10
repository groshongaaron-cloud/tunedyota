// tests/amsoil-browser-fetch.test.js
// Tests for the pure isBlocked guard only — no browser launch.
const { test } = require("node:test");
const assert = require("node:assert/strict");
let B;
test.before(async () => { B = await import("../scripts/amsoil/lib/browser-fetch.mjs"); });

test("403 is blocked", () => { assert.equal(B.isBlocked(403, "x".repeat(50000), "AMSOIL"), true); });
test("tiny challenge page is blocked even at 200", () => { assert.equal(B.isBlocked(200, "x".repeat(5000), "Just a moment..."), true); });
test("large real product page is not blocked", () => { assert.equal(B.isBlocked(200, "x".repeat(600000), "AMSOIL Signature Series 0W-20 | ASM - AMSOIL"), false); });
test("empty html is blocked", () => { assert.equal(B.isBlocked(200, "", "AMSOIL"), true); });
test("block title is blocked even if html somehow large", () => { assert.equal(B.isBlocked(200, "x".repeat(50000), "Attention Required! | Cloudflare"), true); });

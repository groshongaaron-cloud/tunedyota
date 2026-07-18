const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processGetPrefs, processSetPrefs, THEMES } = require("../netlify/functions/installer-prefs.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

test("theme whitelist matches the console's three layouts", () => {
  assert.deepEqual(THEMES, ["night", "field", "heritage"]);
});

test("GET returns the saved theme for the installer", async () => {
  const out = await processGetPrefs({ env, key: "aaron",
    list: async () => [{ id: "p1", fields: { Installer: "aaron", Theme: "field" } }] });
  assert.equal(out.status, "ok");
  assert.equal(out.theme, "field");
});

test("GET returns an empty theme when the installer has no record yet", async () => {
  const out = await processGetPrefs({ env, key: "noah", list: async () => [] });
  assert.equal(out.status, "ok");
  assert.equal(out.theme, "");
});

test("GET normalizes an unknown stored theme to empty (never ships junk to the client)", async () => {
  const out = await processGetPrefs({ env, key: "aaron",
    list: async () => [{ id: "p1", fields: { Theme: "hotdog" } }] });
  assert.equal(out.theme, "");
});

test("GET fails soft when the prefs table is missing or Airtable is down", async () => {
  const out = await processGetPrefs({ env, key: "aaron",
    list: async () => { throw new Error("airtable list 404"); } });
  assert.equal(out.status, "error");
  assert.equal(out.error, "store-unavailable");
});

test("POST rejects a theme outside the whitelist", async () => {
  const out = await processSetPrefs({ theme: "hotdog" }, { env, key: "aaron",
    list: async () => [], create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "invalid-theme");
});

test("POST creates a prefs record scoped to the installer when none exists", async () => {
  let created;
  const out = await processSetPrefs({ theme: "night" }, { env, key: "cody",
    list: async () => [], create: async (a) => { created = a; return { id: "p9" }; }, update: async () => ({}) });
  assert.equal(out.status, "ok");
  assert.equal(out.theme, "night");
  assert.equal(created.fields.Installer, "cody");
  assert.equal(created.fields.Theme, "night");
});

test("POST updates (does not duplicate) an existing prefs record", async () => {
  let updated, created = false;
  const out = await processSetPrefs({ theme: "heritage" }, { env, key: "aaron",
    list: async () => [{ id: "existing1", fields: { Installer: "aaron", Theme: "night" } }],
    create: async () => { created = true; return {}; },
    update: async (a) => { updated = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(updated.id, "existing1");
  assert.equal(updated.fields.Theme, "heritage");
  assert.equal(created, false);
});

test("the installer key is escaped in the lookup formula", async () => {
  let formula;
  await processGetPrefs({ env, key: 'a"x', list: async (a) => { formula = a.filterByFormula; return []; } });
  assert.equal(formula, '{Installer}="a\\"x"');
});

test("POST fails soft when the store is unavailable — the console keeps its local theme", async () => {
  const out = await processSetPrefs({ theme: "field" }, { env, key: "aaron",
    list: async () => { throw new Error("airtable list 503"); }, create: async () => ({}), update: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "store-unavailable");
});

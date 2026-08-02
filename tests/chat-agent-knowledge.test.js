// Chat-agent knowledge upgrades from the 2026-08 transcript mining (74 real
// conversations): the questions customers actually ask, answered accurately —
// and the failure modes they actually hit, fixed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemPrompt } = require("../netlify/functions/lib/chat-agent.js");

const prompt = buildSystemPrompt("");

test("prompt carries the UPCOMING EVENTS schedule — 'when are you in my city' was the top unanswerable ask", () => {
  assert.match(prompt, /== UPCOMING EVENTS/);
  // at least one active future event line with a city and an ISO date
  assert.match(prompt, /\d{4}-\d{2}-\d{2}/, "event dates present");
});

test("prompt teaches SMS link hygiene — 5 of 74 conversations reported broken links", () => {
  assert.match(prompt, /own line/i);
  assert.match(prompt, /punctuation|parenthes/i);
});

test("prompt fast-tracks frustrated customers to a human — 'can I talk to a real person' recurs", () => {
  assert.match(prompt, /second time|twice|frustrat/i);
});

test("prompt asks for the first name early — every contact is a CRM data point", () => {
  assert.match(prompt, /first name/i);
});

test("measured-gains example is framed as measured, with results-vary caveat", () => {
  assert.match(prompt, /\+40/, "approved tune-alone whp figure");
  assert.match(prompt, /vary/i, "no blanket promise");
});

// Aaron's approved stances, 2026-08-02 — these unlock autonomous answers the
// guardrails previously forced into a transfer round-trip.

test("approved warranty & emissions stance: SEMA, CARB, stock calibration ID, never-had-an-issue, phone nuance", () => {
  assert.match(prompt, /SEMA/, "SEMA-certified calibrations");
  assert.match(prompt, /CARB/, "CARB-certified platforms");
  assert.match(prompt, /Clean Air Act/);
  assert.match(prompt, /stock calibration ID/i, "OTT cal reads as stock ID");
  assert.match(prompt, /never had a warranty issue/i);
  assert.match(prompt, /phone/i, "nuanced cases still go to a live conversation");
  // the hard guardrail still exists, now scoped to the approved stance
  assert.match(prompt, /never make warranty/i);
});

test("military discount: 10%, thank-them wording, only when the client brings it up", () => {
  assert.match(prompt, /thank you for your service/i);
  assert.match(prompt, /10%/);
  assert.match(prompt, /brings it up|client raises|asks about/i, "never volunteered unprompted");
});

test("supercharger dyno figures come from the approved sources, never invented", () => {
  assert.match(prompt, /overlandtailor\.com/);
  assert.match(prompt, /magnusonsuperchargers\.com/);
});

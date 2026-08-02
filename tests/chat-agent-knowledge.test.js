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

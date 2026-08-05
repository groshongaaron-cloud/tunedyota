// tests/rocky-manifest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifest, MANIFEST_STATUSES } from "../scripts/rocky/lib/episode-manifest.mjs";

const COMPLETE = {
  id: "tundra-front-brakes-2007-2021",
  sourceUrl: "https://www.viktorgautomotive.com/toyota/2007-2021-toyota-tundra-front-brake-pads-and-rotors-replacement-instructions-sequoia-lx570-lc200",
  videoId: "REPLACE_WITH_REAL_ID",
  model: "Tundra",
  yearRange: "2007-2021",
  procedure: "Front Brake Pads And Rotors Replacement",
  scriptPath: "docs/brand/rocky/pilot-tundra-front-brakes-script.md",
  status: "draft",
};

test("validateManifest accepts a complete manifest", () => {
  const { ok, errors } = validateManifest(COMPLETE);
  assert.deepEqual(errors, []);
  assert.equal(ok, true);
});

test("validateManifest reports missing fields and invalid status", () => {
  const { ok, errors } = validateManifest({ id: "x", status: "bogus" });
  assert.equal(ok, false);
  assert.equal(errors.some((e) => e.includes("missing required field: videoId")), true);
  assert.equal(errors.some((e) => e.includes("invalid status: bogus")), true);
});

test("shipped-unverified is a valid status (matches ty-publish convention)", () => {
  assert.equal(MANIFEST_STATUSES.includes("shipped-unverified"), true);
});

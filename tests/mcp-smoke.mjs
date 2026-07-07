// tests/mcp-smoke.mjs
// LIVE smoke test — drives the deployed WebMCP endpoint through the OFFICIAL MCP SDK
// client (real initialize handshake → tools/list → tools/call for every tool).
//
// Intentionally NOT named `*.test.js`, so the default hermetic `npm test`
// (`node --test`) does NOT auto-discover it — this keeps the unit suite offline and
// non-flaky. Run it explicitly as its own suite entry:
//     npm run test:smoke
// Point it elsewhere with an env override:
//     MCP_SMOKE_URL=https://deploy-preview--tunedyota.netlify.app/mcp npm run test:smoke
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TARGET = new URL(process.env.MCP_SMOKE_URL || "https://tunedyota.com/mcp");
const EXPECTED_TOOLS = ["find_tuning_events", "check_event_availability", "get_tune_pricing", "get_vehicle_pricing"];
const parse = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");

test(`WebMCP smoke: real MCP client end-to-end @ ${TARGET.href}`, { timeout: 45000 }, async (t) => {
  const client = new Client({ name: "tunedyota-mcp-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(TARGET));
  try {
    await t.test("initialize handshake identifies the server", () => {
      const info = client.getServerVersion?.() || {};
      assert.equal(info.name, "tunedyota-webmcp");
    });
    await t.test("tools/list returns exactly the four tools", async () => {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((x) => x.name).sort(), [...EXPECTED_TOOLS].sort());
    });
    await t.test("find_tuning_events returns upcoming events for a state", async () => {
      const d = parse(await client.callTool({ name: "find_tuning_events", arguments: { state: "MN" } }));
      assert.ok(d.count >= 1, "expected at least one upcoming MN event");
      assert.ok(d.events.every((e) => e.state === "MN"));
    });
    await t.test("check_event_availability returns dates + slot counts", async () => {
      const d = parse(await client.callTool({ name: "check_event_availability", arguments: { city: "Twin Cities" } }));
      assert.equal(d.hasEvent, true);
      assert.ok(d.events.length >= 1 && typeof d.events[0].openSlots === "number");
    });
    await t.test("get_tune_pricing returns pricing guidance", async () => {
      const d = parse(await client.callTool({ name: "get_tune_pricing", arguments: {} }));
      assert.match(d.ottTuneFrom, /\$400/);
    });
    await t.test("get_vehicle_pricing returns an exact per-vehicle config", async () => {
      const d = parse(await client.callTool({ name: "get_vehicle_pricing", arguments: { make: "Toyota", model: "Tacoma", year: 2021 } }));
      assert.equal(d.supported, true);
      assert.ok(d.options.some((o) => o.engine === "3.5L V6" && o.ottTuneFrom === 500));
    });
  } finally {
    await client.close();
  }
});

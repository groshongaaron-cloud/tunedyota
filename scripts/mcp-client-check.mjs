// scripts/mcp-client-check.mjs
// End-to-end check of the live WebMCP endpoint using the OFFICIAL MCP SDK client —
// full initialize handshake, tools/list, and tools/call for every tool.
// Requires the SDK on the machine: `npm install --no-save @modelcontextprotocol/sdk`.
// Usage: node scripts/mcp-client-check.mjs [baseUrl]   (default https://tunedyota.com/mcp)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const target = new URL(process.argv[2] || "https://tunedyota.com/mcp");
const client = new Client({ name: "tunedyota-mcp-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(target);

const parse = (r) => { try { return JSON.parse(r.content?.[0]?.text ?? "{}"); } catch { return r; } };
const head = (obj, n = 16) => JSON.stringify(obj, null, 2).split("\n").slice(0, n).join("\n");

await client.connect(transport);
const info = client.getServerVersion?.() || {};
console.log(`✓ connected + initialized — server: ${info.name || "?"} ${info.version || ""}`);

const { tools } = await client.listTools();
console.log(`✓ tools/list (${tools.length}): ${tools.map((t) => t.name).join(", ")}`);

const calls = [
  ["find_tuning_events", { state: "MN" }],
  ["check_event_availability", { city: "Twin Cities" }],
  ["get_tune_pricing", {}],
  ["get_vehicle_pricing", { make: "Toyota", model: "Tacoma", year: 2021 }],
];
for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n▶ ${name}(${JSON.stringify(args)})  isError=${!!res.isError}`);
  console.log(head(parse(res)));
}

await client.close();
console.log("\n✓ done — closed cleanly");

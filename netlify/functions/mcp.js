// netlify/functions/mcp.js
// WebMCP preview — a minimal Model Context Protocol server over HTTP (JSON-RPC 2.0)
// that exposes READ-ONLY public info (upcoming Toyota/Lexus OTT tuning events,
// per-city availability, and pricing guidance) so agentic browsers can answer
// "where/when can I get tuned + what does it cost" and cite tunedyota.com.
//
// Ships DORMANT: every request is refused with a JSON-RPC error unless the
// WEBMCP_ENABLED env var is set — so it's "ready to flip on" after review.
// Read-only only; no booking/writes are exposed here.
const { getMarket } = require("./lib/markets.js");
const { getAllActiveEvents } = require("./lib/events.js");
const EVENTS = require("./lib/events-data.js");
const { getAvailability } = require("./availability.js");
const { priceVehicle } = require("./lib/vehicle-pricing.js");

const SERVER = { name: "tunedyota-webmcp", version: "0.1.0" };
const PROTOCOL_VERSION = "2025-06-18";

function todayISO(now) { const d = now || new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
const title = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

const TOOLS = [
  {
    name: "find_tuning_events",
    description: "List upcoming Tuned Yota in-person Toyota/Lexus OTT tuning events across the Upper Midwest (MN, IA, WI, ND, SD, NE). Optionally filter by 2-letter US state or by city.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "2-letter US state code to filter by, e.g. \"MN\"." },
        city: { type: "string", description: "City/market name to filter by, e.g. \"Twin Cities\"." },
      },
    },
  },
  {
    name: "check_event_availability",
    description: "For a given city/market, return that market's upcoming event dates and how many booking slots are open at each. If none are scheduled, returns the Priority Wait List link.",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string", description: "City/market name, e.g. \"Sioux Falls\"." } },
      required: ["city"],
    },
  },
  {
    name: "get_tune_pricing",
    description: "Get Tuned Yota OTT Tune pricing guidance and the link to see an exact, vehicle-specific price.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_vehicle_pricing",
    description: "Get the exact OTT Tune starting price (plus custom and supercharger/turbo prices where offered) for a specific Toyota or Lexus. Give make + model, and optionally the model year to pin the exact engine/config. With no model it returns the supported-vehicle catalog.",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: "\"Toyota\" or \"Lexus\"." },
        model: { type: "string", description: "Model, e.g. \"Tacoma\", \"4Runner\", \"GX\"." },
        year: { type: "integer", description: "Model year, e.g. 2021 — narrows to the exact engine/config." },
      },
    },
  },
];

async function findEvents(args, deps) {
  const events = await getAllActiveEvents({ fetchImpl: deps.fetchImpl, sheetId: deps.env.EVENTS_SHEET_ID, baked: EVENTS, log: deps.log });
  const today = todayISO(deps.now);
  const st = args.state ? String(args.state).toUpperCase() : null;
  const city = args.city ? String(args.city).trim().toLowerCase() : null;
  const rows = events
    .filter((e) => e.dateISO >= today)
    .map((e) => { const m = getMarket(title(e.city)) || {}; return { city: title(e.city), state: m.state || "", installer: m.inst || "", date: e.label, dateISO: e.dateISO, event: e.event, address: e.address || "To Be Released" }; })
    .filter((r) => (!st || r.state === st) && (!city || r.city.toLowerCase() === city))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return { count: rows.length, bookAt: "https://tunedyota.com/find-your-exact-tune", events: rows };
}

async function checkAvailability(args, deps) {
  const cityArg = args.city && String(args.city).trim();
  if (!cityArg) return { error: "city is required" };
  const a = await getAvailability(cityArg, { fetchImpl: deps.fetchImpl, env: deps.env, log: deps.log, now: deps.now });
  if (a.error === "unknown-city") return { city: cityArg, hasEvent: false, error: "unknown-city", markets: "https://tunedyota.com/find-your-exact-tune" };
  if (!a.hasEvent) return { city: a.city || cityArg, hasEvent: false, message: "No upcoming event scheduled here — join the Priority Wait List at https://tunedyota.com/find-your-exact-tune and we'll notify you." };
  return {
    city: a.city, hasEvent: true, bookAt: "https://tunedyota.com/find-your-exact-tune",
    events: (a.events || []).map((e) => ({ date: e.eventLabel, dateISO: e.dateISO, openSlots: (e.openSlots || []).length, full: !!e.full, address: e.address || "To Be Released" })),
  };
}

function getPricing() {
  return {
    ottTuneFrom: "$400–$550 depending on platform",
    custom: "Custom calibration and forced-induction (supercharger/turbo) paths are priced higher.",
    exactPrice: "See your exact, vehicle-specific price instantly at https://tunedyota.com/find-your-exact-tune",
    compliance: "Every calibration keeps factory emissions fully intact (5-gas verified, EPA-compliant), built by a licensed VFTuner PRO Tuner.",
  };
}

async function callTool(name, args, deps) {
  args = args || {};
  if (name === "find_tuning_events") return await findEvents(args, deps);
  if (name === "check_event_availability") return await checkAvailability(args, deps);
  if (name === "get_tune_pricing") return getPricing();
  if (name === "get_vehicle_pricing") return priceVehicle(args, (deps.now || new Date()).getFullYear());
  throw new Error(`Unknown tool: ${name}`);
}

// Handle one JSON-RPC message. Returns a response object, or null for notifications.
async function rpc(msg, deps) {
  const id = msg && "id" in msg ? msg.id : null;
  const method = msg && msg.method;
  const params = (msg && msg.params) || {};
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER } };
  }
  if (typeof method === "string" && method.startsWith("notifications/")) return null; // no response for notifications
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const nm = params.name;
    const args = params.arguments || {};
    try {
      const data = await callTool(nm, args, deps);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: false } };
    } catch (e) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: e && e.message ? e.message : String(e) }], isError: true } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function handleRequest(body, deps) {
  if (!deps.env.WEBMCP_ENABLED) {
    const id = body && !Array.isArray(body) && "id" in body ? body.id : null;
    return { status: 503, json: { jsonrpc: "2.0", id, error: { code: -32000, message: "WebMCP preview is not enabled. Set WEBMCP_ENABLED to turn it on." } } };
  }
  if (Array.isArray(body)) {
    const out = [];
    for (const m of body) { const r = await rpc(m, deps); if (r) out.push(r); }
    return { status: 200, json: out };
  }
  const r = await rpc(body, deps);
  return { status: 200, json: r || {} };
}

async function handler(event) {
  const deps = { fetchImpl: fetch, env: process.env, log: console, now: new Date() };
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ server: SERVER, transport: "http/jsonrpc-2.0", enabled: !!process.env.WEBMCP_ENABLED, endpoint: "/mcp", manifest: "/.well-known/mcp.json", tools: TOOLS.map((t) => t.name) }),
    };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await handleRequest(body, deps);
  return { statusCode: out.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(out.json) };
}

module.exports = { handler, rpc, callTool, handleRequest, findEvents, checkAvailability, getPricing, TOOLS, SERVER, PROTOCOL_VERSION };

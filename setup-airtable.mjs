// One-time Airtable schema setup/verify for Tuned Yota booking.
// Creates (or completes) the "Bookings" and "Priority List" tables with the
// EXACT field names + types the booking functions require. Safe to re-run.
//
// Requires a Personal Access Token with scopes:
//   schema.bases:read, schema.bases:write, data.records:read, data.records:write
//   (access scoped to this one base)
//
// Run:
//   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node setup-airtable.mjs
// (PowerShell: $env:AIRTABLE_TOKEN="pat..."; $env:AIRTABLE_BASE_ID="app..."; node setup-airtable.mjs)

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!TOKEN || !BASE) { console.error("Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID env vars."); process.exit(1); }

const META = `https://api.airtable.com/v0/meta/bases/${BASE}/tables`;
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const txt = (name) => ({ name, type: "singleLineText" });
const sel = (name, choices) => ({ name, type: "singleSelect", options: { choices: choices.map((c) => ({ name: c })) } });
const chk = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });
const num = (name) => ({ name, type: "number", options: { precision: 0 } });
const multiline = (name) => ({ name, type: "multilineText" });

const SLOTS = ["9:00","9:20","9:40","10:00","10:20","10:40","11:00","11:20","11:40","12:00","12:20","12:40"];
const INSTALLERS = ["aaron", "noah", "cody"];

// First field becomes the primary field. Event Date is TEXT on purpose.
const SCHEMA = {
  "Bookings": [
    txt("Name"), txt("City"), txt("Event Date"), sel("Slot", SLOTS),
    txt("Phone"), txt("Email"), txt("Vehicle"), txt("Goals"), txt("Modifications"),
    sel("Installer", INSTALLERS), sel("Status", ["Booked", "Completed", "No-show", "Cancelled"]),
    txt("Source"), txt("UTM Source"), txt("UTM Medium"), txt("UTM Campaign"),
  ],
  "Priority List": [
    txt("Name"), txt("City"), txt("Phone"), txt("Email"), txt("Vehicle"), txt("Goals"), txt("Modifications"), txt("Source"),
    sel("Installer", INSTALLERS), sel("Reason", ["No event scheduled", "Event full"]),
    txt("Event Date"), sel("Requested Slot", SLOTS), chk("Notified"),
  ],
  // First-party funnel-step beacons written by netlify/functions/track.js.
  // Session is the primary field; Step is the numeric funnel index (0-6).
  "Funnel Events": [
    txt("Session"), num("Step"), txt("Step Name"),
    txt("UTM Source"), txt("UTM Medium"), txt("UTM Campaign"),
  ],
  // Owner-editable event schedule read by lib/events.js (Airtable wins over the
  // baked list per city). Date is TEXT on purpose — ISO or "September 26, 2026"
  // both parse; Label (optional) overrides the customer-facing date text.
  "Events": [
    txt("Market"), txt("Date"), txt("Label"), chk("Active"),
    txt("Event"), txt("Details"), txt("Address"),
  ],
  // Chat widget sessions (lib/chat-store.js). Transcript is a JSON array of
  // {role:"user"|"assistant"|"installer", text, at} kept in a long-text field.
  "Chat Sessions": [
    txt("Session ID"), sel("Status", ["ai", "escalated", "closed"]), txt("Page Context"),
    txt("Customer Name"), txt("Phone"), txt("Vehicle"), txt("City"),
    sel("Installer", INSTALLERS), multiline("Transcript"), txt("Created"), txt("Last Activity"),
  ],
  // Questions the AI couldn't answer — the owner mines these to grow its knowledge.
  "Chat Escalations": [
    txt("Question"), sel("Reason", ["asked-for-human", "guardrail", "no-answer"]),
    txt("Page Context"), txt("Session ID"), txt("Date"), sel("Status", ["New", "Answer added"]),
  ],
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  const existing = (await api(META, { headers: H })).tables || [];
  const byName = Object.fromEntries(existing.map((t) => [t.name, t]));

  for (const [tableName, fields] of Object.entries(SCHEMA)) {
    const t = byName[tableName];
    if (!t) {
      await api(META, { method: "POST", headers: H, body: JSON.stringify({ name: tableName, fields }) });
      console.log(`✓ created table "${tableName}" with ${fields.length} fields`);
      continue;
    }
    console.log(`• table "${tableName}" exists — checking fields`);
    const have = Object.fromEntries(t.fields.map((f) => [f.name, f]));
    for (const f of fields) {
      const cur = have[f.name];
      if (!cur) {
        await api(`${META}/${t.id}/fields`, { method: "POST", headers: H, body: JSON.stringify(f) });
        console.log(`  + added field "${f.name}" (${f.type})`);
      } else if (f.name === "Event Date" && cur.type !== "singleLineText") {
        console.log(`  ⚠ "Event Date" is type "${cur.type}" but MUST be "singleLineText" (single line text). Delete it and re-run, or change its type, or booking will overbook.`);
      } else {
        console.log(`  ✓ "${f.name}" ok`);
      }
    }
  }
  console.log("\nDone. You can delete any leftover default table (e.g. \"Table 1\").");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });

// One-off backfill: re-send an UPDATED booking confirmation (now including the venue
// street address) to every FUTURE, non-cancelled booking that originally received a
// confirmation. Only web bookings (book.js) send confirmations — intake/walk-in/no-show
// records never did, so they're excluded. Same email path as book-background.js.
//
// Modes:  dry (default — list + counts, sends nothing)
//         preview (send ONE sample to info@, marks nothing)
//         send    (send to all eligible customers, tolerant-marks each)
// Run:  AIRTABLE_TOKEN=.. AIRTABLE_BASE_ID=.. RESEND_API_KEY=.. node scripts/resend-confirmations-backfill.js <mode>
const { cfg, listRecords, updateRecord, updateTolerant } = require("../netlify/functions/lib/airtable.js");
const { sendEmail } = require("../netlify/functions/lib/resend.js");
const { buildBookingCustomerEmail } = require("../netlify/functions/lib/templates.js");
const { getMarket } = require("../netlify/functions/lib/markets.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");
const { formatSlot } = require("../netlify/functions/lib/slots.js");
const { getAllActiveEvents } = require("../netlify/functions/lib/events.js");
const EVENTS = require("../netlify/functions/lib/events-data.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";   // matches book-background.js
const OWNER = "info@tunedyota.com";
const MODE = process.argv[2] || "dry";
const MARK_FIELD = "Address Confirmation Sent";             // tolerant — dropped if the column doesn't exist
const has = (v) => String(v == null ? "" : v).trim().length > 0;
const dOnly = (s) => String(s == null ? "" : s).slice(0, 10);
const realAddr = (a) => (has(a) && !/to be released/i.test(a) ? String(a).trim() : "");
// A confirmation was only ever sent by the public booking flow; ops-created records
// (intake:* / installer:* / owner:*) never emailed the customer.
const isOpsSource = (s) => /walk-in|no-show|intake:|installer:|owner:/i.test(String(s || ""));

(async () => {
  const env = process.env;
  const c = cfg(env);
  const today = new Date().toISOString().slice(0, 10);
  const update = (a) => updateRecord({ fetchImpl: fetch, ...a });

  // Address/label lookup: city|dateISO -> event (baked has the real addresses).
  const evList = await getAllActiveEvents({ fetchImpl: fetch, sheetId: env.EVENTS_SHEET_ID, baked: EVENTS, log: console });
  const evByKey = {};
  for (const e of evList) if (e && e.city && e.dateISO) evByKey[`${String(e.city).toLowerCase()}|${e.dateISO}`] = e;

  const rows = await listRecords({ token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Status}!="Cancelled",{Status}!="No-show")` });

  const eligible = rows.filter((r) => {
    const f = r.fields || {};
    return has(f.Email) && !isOpsSource(f.Source) && dOnly(f["Event Date"]) >= today && has(f["Event Date"]);
  }).sort((a, b) => dOnly((a.fields || {})["Event Date"]).localeCompare(dOnly((b.fields || {})["Event Date"])));

  function buildFor(row) {
    const f = row.fields || {};
    const city = f.City || "";
    const market = getMarket(city) || { city, state: "" };
    const ownerKey = Array.isArray(f.Installer) ? f.Installer[0] : (f.Installer || market.inst);
    const inst = keyToInstaller(ownerKey);
    const ev = evByKey[`${String(city).toLowerCase()}|${dOnly(f["Event Date"])}`] || {};
    const event = { dateISO: dOnly(f["Event Date"]), label: ev.label || "", address: ev.address || "" };
    const d = { name: f.Name, email: String(f.Email).trim(), phone: f.Phone, vehicle: f.Vehicle,
      modelYear: f["Model Year"], slot: f.Slot ? formatSlot(f.Slot) : "" };
    const m = buildBookingCustomerEmail(d, inst, market, event);
    const first = (f.Name || "there").split(" ")[0];
    const noteText = `Hi ${first}, quick update to your existing booking — we've added the exact venue address (below). Nothing else has changed and you do NOT need to re-book.\n\n`;
    const noteHtml = `<div style="font-family:Arial,sans-serif;max-width:560px;background:#f4f1ea;border-radius:8px;padding:12px 14px;margin:0 0 14px;color:#3A2E26"><strong>Address added.</strong> Quick update to your existing booking — we've added the exact venue address below. Nothing else has changed, and you don't need to re-book.</div>`;
    return {
      subject: `Address added — your Tuned Yota ${market.city} tune (${d.slot})`,
      text: noteText + m.text,
      html: noteHtml + m.html,
      hasAddr: !!realAddr(event.address),
    };
  }

  async function sendOne(row, toEmail, subjPrefix) {
    const { subject, html, text } = buildFor(row);
    await sendEmail({ apiKey: env.RESEND_API_KEY, from: FROM, to: toEmail, replyTo: OWNER,
      subject: (subjPrefix || "") + subject, html, text });
  }

  const withAddr = eligible.filter((r) => buildFor(r).hasAddr);
  const tbd = eligible.filter((r) => !buildFor(r).hasAddr);

  if (MODE === "dry") {
    eligible.forEach((r, i) => {
      const f = r.fields || {}; const b = buildFor(r);
      console.log(`${String(i + 1).padStart(2)}. [${b.hasAddr ? "ADDR" : "TBD "}] ${dOnly(f["Event Date"])}  ${f.City}  ${f.Name} <${f.Email}>  ${f.Slot || ""}`);
    });
    console.log(`\neligible (future, confirmed, non-cancelled): ${eligible.length}`);
    console.log(`  with a real address: ${withAddr.length}   still To-Be-Released: ${tbd.length}`);
    console.log(`\n(dry run — nothing sent. 'preview' sends ONE sample to ${OWNER}; 'send' emails customers.)`);
    return;
  }
  if (MODE === "preview") {
    if (!eligible.length) { console.log("no eligible bookings"); return; }
    const sample = (withAddr[0] || eligible[0]); const f = sample.fields || {};
    await sendOne(sample, OWNER, "[PREVIEW — do not forward] ");
    console.log(`PREVIEW sent to ${OWNER}: updated confirmation for ${f.Name} (${f.City} ${dOnly(f["Event Date"])}). Nothing marked.`);
    return;
  }
  if (MODE === "send" || MODE === "send-all") {
    // Default 'send' = only bookings whose venue address is actually known (the point
    // of the backfill). 'send-all' also emails the still-TBD venues.
    const targets = MODE === "send-all" ? eligible : withAddr;
    let ok = 0, fail = 0, skip = 0;
    for (const row of targets) {
      const f = row.fields || {};
      if (has(f[MARK_FIELD])) { skip++; console.log(`skip (already sent): ${f.Name} <${f.Email}>`); continue; }
      try {
        await sendOne(row, String(f.Email).trim(), "");
        await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id: row.id,
          fields: { [MARK_FIELD]: today } }, [MARK_FIELD]);
        ok++; console.log(`sent: ${f.Name} <${f.Email}> (${f.City} ${dOnly(f["Event Date"])})`);
      } catch (e) { fail++; console.log(`FAIL: ${f.Name} <${f.Email}> — ${e.message}`); }
    }
    console.log(`\nDONE — sent ${ok}, skipped ${skip}, failed ${fail}, of ${targets.length} eligible`);
    return;
  }
  console.log("unknown mode:", MODE);
})().catch((e) => { console.error("fatal:", e.message); process.exit(1); });

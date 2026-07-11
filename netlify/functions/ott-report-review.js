// OTT Commission Report — the owner's always-on review console (token-gated).
// Open it any time to see, for a reporting month:
//   ① Completed calibrations = the submission to OTT. Commission auto-fills from
//      the price sheet and is EDITABLE; edits save to the booking's Commission
//      Override (Airtable) so they persist and flow into the monthly draft too.
//   ② Overdue / incomplete bookings — events past due that an installer hasn't
//      closed out yet (the chase list). Informational, never sent.
// Then Download the .xlsx or Finalize & Send to OTT (ott-report-send.js).
//
//   GET  ?month=YYYY-MM&token=…            → review page (defaults to prior month)
//   GET  ?month=YYYY-MM&token=…&format=xlsx → downloads the OTT workbook
//   POST { month, token, overrides:{recId:amount|null} } → save commission edits
const { cfg, listAllRecords, updateRecord } = require("./lib/airtable.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { keyToInstaller } = require("./lib/routing.js");
const { monthFromKey, priorMonth, buildSubmissionRows, buildOpenBookings, renderOttXlsx, subTable, totalCommission, unresolved, recipients } = require("./lib/ott-report.js");

const OVERRIDE_FIELD = "Commission Override";

function base(env) { return env.SITE_URL || "https://tunedyota.com"; }
function reviewUrl(env, monthKey) {
  return `${base(env)}/.netlify/functions/ott-report-review?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font-family:-apple-system,Arial,sans-serif;max-width:1040px;margin:36px auto;padding:0 20px;color:#3A2E26}` +
    `table{border-collapse:collapse;font-size:13px;width:100%}th{text-align:left;border-bottom:2px solid #3A2E26;padding:5px 10px 5px 0}` +
    `td{padding:4px 10px 4px 0;border-bottom:1px solid #eee}h1{color:#5B4B42}h2{color:#5B4B42;margin-top:34px}` +
    `.btn{display:inline-block;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:700;cursor:pointer;border:0;font-size:14px}` +
    `.btn-send{background:#5B4B42;color:#fff}.btn-dl{background:#efeae4;color:#3A2E26;border:1px solid #d8d0c6}.btn-save{background:#1F3A2E;color:#fff}` +
    `input.comm{width:84px;padding:5px 6px;font:inherit;text-align:right;border:1px solid #cbc4ba;border-radius:5px}` +
    `input.comm.need{border-color:#c0392b;background:#fdecea}.muted{color:#7c8472}.warn{color:#8a2a2a}.over{color:#1F3A2E;font-weight:700}` +
    `.grp{margin:8px 0 4px;font-weight:700;color:#5B4B42}</style>` +
    `<body><h1>${esc(title)}</h1>${body}</body>`;
}

function completedSection(subRows, month, env) {
  const tok = encodeURIComponent(env.OTT_APPROVE_SECRET || "");
  const xlsxUrl = `${base(env)}/.netlify/functions/ott-report-review?month=${month.key}&token=${tok}&format=xlsx`;
  const sendUrl = `${base(env)}/.netlify/functions/ott-report-send?month=${month.key}&token=${tok}`;
  const to = recipients(env), total = totalCommission(subRows), u = unresolved(subRows).length;
  let h = `<p class="muted">${esc(month.label)} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong id="tot">$${total}</strong></p>`;
  h += `<p><strong>Nothing has been sent to OTT yet.</strong> Adjust any commission below, <strong>Save</strong>, then download or send.</p>`;
  if (u) h += `<p class="warn"><strong>${u} row(s) need a commission</strong> — the amount was ambiguous or the platform was bench (BB). Type it in and Save.</p>`;
  h += `<table><tr><th>Date</th><th>Customer</th><th>VIN</th><th>Vehicle</th><th>Platform</th><th>Cal Type</th><th>Commission&nbsp;($)</th></tr>`;
  for (const r of subRows) {
    const veh = [r.vehicleYear, r.vehicleType, r.engineSize].filter(Boolean).join(" ") || "—";
    const need = r.commission == null;
    const val = r.commission == null ? "" : r.commission;
    const flag = r._overridden ? ` <span class="over" title="Manually set">✎</span>` : "";
    h += `<tr><td>${esc(r.dateCalibrationApplied)}</td><td>${esc(r.customer)}</td><td>${esc(r.vin || "—")}</td>`
      + `<td>${esc(veh)}</td><td>${esc(r.tuningPlatform || "—")}</td><td>${esc(r.calibrationType || "—")}</td>`
      + `<td><input class="comm${need ? " need" : ""}" type="number" min="0" step="1" inputmode="numeric" `
      + `data-rec="${esc(r.recordId)}" data-auto="${r._autoCommission == null ? "" : r._autoCommission}" value="${val}">${flag}</td></tr>`;
  }
  h += `</table>`;
  h += `<div style="margin:22px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center">`
    + `<button class="btn btn-save" id="save">Save commissions</button>`
    + `<a class="btn btn-dl" href="${xlsxUrl}">⬇ Download Excel (.xlsx)</a>`
    + `<a class="btn btn-send" href="${sendUrl}" onclick="return confirm('Send the ${esc(month.label)} OTT submission to ${esc(to.join(', '))}? This emails OTT the workbook.')">Finalize &amp; Send to OTT →</a>`
    + `<span id="saveMsg" class="muted"></span></div>`;
  h += `<p class="muted" style="font-size:13px">Save your edits before downloading or sending — the workbook is rebuilt from saved data. Sending emails ${esc(to.join(", "))} (CC you).</p>`;
  return h;
}

function openSection(openRows) {
  if (!openRows.length) return `<h2>Overdue / incomplete bookings</h2><p class="muted">None — every past event has been closed out. 🎉</p>`;
  let h = `<h2>Overdue / incomplete bookings <span class="muted">(${openRows.length} awaiting close-out)</span></h2>`;
  h += `<p class="muted">Past events not yet marked complete by the installer. Not part of the submission — chase these to close them out.</p>`;
  let curKey = null;
  for (const r of openRows) {
    if (r.installerKey !== curKey) {
      if (curKey !== null) h += `</table>`;
      curKey = r.installerKey;
      const inst = keyToInstaller(curKey) || {};
      const label = inst.name ? `${inst.name}${inst.region ? ` · ${inst.region}` : ""}` : (curKey || "Unassigned");
      h += `<div class="grp">${esc(label)}</div><table><tr><th>Event date</th><th>Overdue</th><th>Customer</th><th>Vehicle</th><th>City</th><th>Status</th></tr>`;
    }
    const od = r.daysOverdue === "" ? "—" : `${r.daysOverdue}d`;
    h += `<tr><td>${esc(r.eventDate)}</td><td class="warn">${esc(od)}</td><td>${esc(r.customer)}</td><td>${esc(r.vehicle || "—")}</td><td>${esc(r.city || "—")}</td><td>${esc(r.status)}</td></tr>`;
  }
  h += `</table>`;
  return h;
}

function saveScript(env, month) {
  const tok = env.OTT_APPROVE_SECRET || "";
  return `<script>
  var SAVE_URL="${base(env)}/.netlify/functions/ott-report-review";
  document.getElementById('save').addEventListener('click',function(){
    var msg=document.getElementById('saveMsg'); msg.textContent='Saving…'; msg.className='muted';
    var overrides={};
    document.querySelectorAll('input.comm').forEach(function(i){
      var v=i.value.trim(); overrides[i.dataset.rec]=(v===''?null:Number(v));
    });
    fetch(SAVE_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({month:'${month.key}',token:${JSON.stringify(tok)},overrides:overrides})})
    .then(function(r){return r.json();}).then(function(o){
      if(o.ok){ msg.textContent='Saved '+o.saved+' commission'+(o.saved===1?'':'s')+' ✓ — you can download or send now.'; msg.className='over';
        var t=0; document.querySelectorAll('input.comm').forEach(function(i){ i.classList.remove('need'); if(i.value.trim()!=='')t+=Number(i.value); });
        var tot=document.getElementById('tot'); if(tot)tot.textContent='$'+t;
      } else if(o.error==='missing-column'){ msg.className='warn';
        msg.innerHTML='Add a Number field named <b>${OVERRIDE_FIELD}</b> to the Airtable Bookings table, then Save again.';
      } else { msg.textContent='Save failed: '+(o.error||'unknown'); msg.className='warn'; }
    }).catch(function(e){ msg.textContent='Save failed: '+e.message; msg.className='warn'; });
  });
  </script>`;
}

function reviewPageHtml(subRows, openRows, month, env) {
  const body = completedSection(subRows, month, env) + openSection(openRows) + saveScript(env, month);
  return page(`OTT Commission Report — ${month.label}`, body);
}

async function loadMonth(params, deps) {
  const { env = process.env, now = new Date(), fetchImpl = fetch,
          listAll = (a) => listAllRecords({ fetchImpl, ...a }) } = deps;
  const month = params.month ? monthFromKey(params.month) : priorMonth(now);
  if (!month) return { error: "bad-month" };
  const c = cfg(env);
  const recs = flattenRecords(await listAll({ token: c.token, baseId: c.baseId, table: c.bookings }));
  return { month, subRows: buildSubmissionRows(recs, month, { retailer: env.OTT_RETAILER }), openRows: buildOpenBookings(recs, now) };
}

// GET — page or xlsx.
async function review(params, deps) {
  const { env = process.env } = deps;
  if (!env.OTT_APPROVE_SECRET || String(params.token || "") !== env.OTT_APPROVE_SECRET) return { status: "error", code: 401, error: "unauthorized" };
  const r = await loadMonth(params, deps);
  if (r.error) return { status: "error", code: 400, error: r.error };
  if (String(params.format || "").toLowerCase() === "xlsx") {
    if (!r.subRows.length) return { status: "empty", code: 200, month: r.month };
    return { status: "xlsx", code: 200, month: r.month, buffer: renderOttXlsx(r.subRows) };
  }
  return { status: "page", code: 200, ...r };
}

// POST — persist commission overrides to Airtable. Detects a not-yet-added
// column explicitly so the page can tell the owner to create it.
async function saveOverrides(params, deps) {
  const { env = process.env, fetchImpl = fetch, update = (a) => updateRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!env.OTT_APPROVE_SECRET || String(params.token || "") !== env.OTT_APPROVE_SECRET) return { status: "error", code: 401, error: "unauthorized" };
  const overrides = params.overrides && typeof params.overrides === "object" ? params.overrides : {};
  const c = cfg(env);
  let saved = 0;
  for (const [recordId, raw] of Object.entries(overrides)) {
    if (!recordId) continue;
    const val = raw == null || raw === "" ? null : Number(raw);
    if (val != null && !Number.isFinite(val)) continue;              // ignore junk
    try {
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId, fields: { [OVERRIDE_FIELD]: val } });
      saved++;
    } catch (e) {
      if (/unknown[_ ]field/i.test(e.message) && new RegExp(OVERRIDE_FIELD, "i").test(e.message)) return { status: "error", code: 200, error: "missing-column" };
      if (log.error) log.error("ott override", e.message);
      return { status: "error", code: 502, error: "save-failed", detail: e.message };
    }
  }
  return { status: "ok", code: 200, ok: true, saved };
}

async function handler(event) {
  if (event && event.httpMethod === "POST") {
    let b = {}; try { b = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
    const out = await saveOverrides({ month: b.month, token: b.token, overrides: b.overrides }, {});
    return { statusCode: out.code || 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out.ok ? out : { ok: false, error: out.error, detail: out.detail }) };
  }
  const q = (event && event.queryStringParameters) || {};
  const out = await review({ month: q.month, token: q.token, format: q.format }, {});
  if (out.status === "xlsx") {
    return { statusCode: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ott-commissions-${out.month.key}.xlsx"` },
      body: out.buffer.toString("base64"), isBase64Encoded: true };
  }
  const html =
    out.status === "page" && out.subRows.length ? reviewPageHtml(out.subRows, out.openRows, out.month, process.env)
    : out.status === "page" ? page(`OTT Commission Report — ${out.month.label}`, `<p class="muted">No completed calibrations for <strong>${esc(out.month.label)}</strong>.</p>` + openSection(out.openRows))
    : out.status === "empty" ? page(`OTT Commission Report — ${out.month.label}`, `<p>No completed calibrations to download for ${esc(out.month.label)}.</p>`)
    : out.error === "unauthorized" ? page("Not authorized", "<p>This link is invalid or the token is missing.</p>")
    : page("Bad request", "<p>Missing or invalid month.</p>");
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, review, saveOverrides, reviewPageHtml, reviewUrl, OVERRIDE_FIELD };

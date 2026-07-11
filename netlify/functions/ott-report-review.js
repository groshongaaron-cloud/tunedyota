// OTT Commission Report — the owner's always-on review + edit console (token-gated).
// For a reporting month:
//   ① Completed calibrations = the submission. Commission auto-fills from the price
//      sheet and is EDITABLE; edits save to the booking's Commission Override.
//   ② Overdue / incomplete bookings (ANY installer) — the owner can close these out
//      inline: set the calibration + OTT fields + commission and Complete, and it
//      joins the submission for that event's month.
//   ③ Add a walk-in — manually enter a completed calibration that wasn't booked.
// Then Download the .xlsx or Finalize & Send to OTT (ott-report-send.js).
//
//   GET  ?month=YYYY-MM&token=…             → review page (defaults to prior month)
//   GET  ?month=YYYY-MM&token=…&format=xlsx → downloads the OTT workbook
//   POST { token, op, ... }                 → op: "overrides" | "complete" | "walkin"
const { cfg, listAllRecords, updateRecord, createRecord, updateTolerant, createTolerant } = require("./lib/airtable.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { keyToInstaller, INSTALLERS } = require("./lib/routing.js");
const { CAL_OPTIONS } = require("./lib/certificate.js");
const { monthFromKey, priorMonth, buildSubmissionRows, buildOpenBookings, renderOttXlsx, totalCommission, unresolved, recipients } = require("./lib/ott-report.js");

const OVERRIDE_FIELD = "Commission Override";
// OTT report picklists (Policy 0012).
const TP_OPTIONS = ["VFT", "HPT", "PCM", "BB", "COBB"];
const CT_OPTIONS = ["9.2 New", "9.2 Update", "CARB New", "CARB Update", "Custom", "SEMA CE", "Basic", "TCM Update", "Supercharger", "THR Adjust"];
const INSTALLER_KEYS = Object.keys(INSTALLERS);
const OPT_FIELDS = ["VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", OVERRIDE_FIELD];

const authOk = (env, token) => !!env.OTT_APPROVE_SECRET && String(token || "") === env.OTT_APPROVE_SECRET;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
function base(env) { return env.SITE_URL || "https://tunedyota.com"; }
function reviewUrl(env, monthKey) {
  return `${base(env)}/.netlify/functions/ott-report-review?month=${monthKey}&token=${encodeURIComponent(env.OTT_APPROVE_SECRET || "")}`;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sel(cls, options, ph, cur) {
  return `<select class="${cls}"><option value="">${esc(ph)}</option>` +
    options.map((o) => `<option${String(cur) === String(o) ? " selected" : ""}>${esc(o)}</option>`).join("") + `</select>`;
}
function inp(cls, ph, attrs) { return `<input class="${cls}" placeholder="${esc(ph)}" ${attrs || ""}>`; }

// The OTT report fields, gathered from a booking-completion / walk-in payload into
// an Airtable fields object. Only sets what's present so a partial entry still saves.
function reportFields(d) {
  const f = {};
  const vin = String(d.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (vin) f.VIN = vin;
  const tp = String(d.tuningPlatform || "").trim().toUpperCase(); if (tp) f["Tuning Platform"] = tp;
  const ct = String(d.calibrationType || "").trim(); if (ct) f["Calibration Type"] = ct;
  const ecu = String(d.ecuId || "").trim().toUpperCase(); if (ecu) f["ECU ID"] = ecu;
  const gear = String(d.gearSize || "").trim(); if (gear) f["Gear Size"] = gear;
  const mi = String(d.mileage == null ? "" : d.mileage).replace(/[^0-9]/g, ""); if (mi) f.Mileage = Number(mi);
  const comm = d.commission;
  if (comm != null && comm !== "" && Number.isFinite(Number(comm))) f[OVERRIDE_FIELD] = Number(comm);
  return f;
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font-family:-apple-system,Arial,sans-serif;max-width:1040px;margin:36px auto;padding:0 20px;color:#3A2E26}` +
    `table{border-collapse:collapse;font-size:13px;width:100%}th{text-align:left;border-bottom:2px solid #3A2E26;padding:5px 10px 5px 0}` +
    `td{padding:4px 10px 4px 0;border-bottom:1px solid #eee}h1{color:#5B4B42}h2{color:#5B4B42;margin-top:34px}` +
    `.btn{display:inline-block;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:700;cursor:pointer;border:0;font-size:14px}` +
    `.btn-send{background:#5B4B42;color:#fff}.btn-dl{background:#efeae4;color:#3A2E26;border:1px solid #d8d0c6}.btn-save{background:#1F3A2E;color:#fff}` +
    `.btn-sm{padding:8px 12px;font-size:13px}input.comm{width:84px;padding:5px 6px;font:inherit;text-align:right;border:1px solid #cbc4ba;border-radius:5px}` +
    `input.comm.need{border-color:#c0392b;background:#fdecea}.muted{color:#7c8472}.warn{color:#8a2a2a}.over{color:#1F3A2E;font-weight:700}` +
    `.grp{margin:14px 0 4px;font-weight:700;color:#5B4B42}` +
    `.ob,.wk{border:1px solid #e0dacf;border-radius:9px;padding:10px 12px;margin:8px 0;background:#fbfaf7}` +
    `.obf,.wkf{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}` +
    `.obf select,.obf input,.wkf select,.wkf input{padding:6px 7px;font:inherit;border:1px solid #cbc4ba;border-radius:6px}` +
    `.obf input,.wkf input{width:110px}.wkf input.wide{width:170px}</style>` +
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
    const need = r.commission == null, val = r.commission == null ? "" : r.commission;
    const flag = r._overridden ? ` <span class="over" title="Manually set">✎</span>` : "";
    h += `<tr><td>${esc(r.dateCalibrationApplied)}</td><td>${esc(r.customer)}</td><td>${esc(r.vin || "—")}</td>`
      + `<td>${esc(veh)}</td><td>${esc(r.tuningPlatform || "—")}</td><td>${esc(r.calibrationType || "—")}</td>`
      + `<td><input class="comm${need ? " need" : ""}" type="number" min="0" step="1" inputmode="numeric" `
      + `data-rec="${esc(r.recordId)}" value="${val}">${flag}</td></tr>`;
  }
  h += `</table>`;
  h += `<div style="margin:22px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center">`
    + `<button class="btn btn-save" id="save">Save commissions</button>`
    + `<a class="btn btn-dl" href="${xlsxUrl}">⬇ Download Excel (.xlsx)</a>`
    + `<a class="btn btn-send" href="${sendUrl}" onclick="return confirm('Send the ${esc(month.label)} OTT submission to ${esc(to.join(', '))}? This emails OTT the workbook.')">Finalize &amp; Send to OTT →</a>`
    + `<span id="saveMsg" class="muted"></span></div>`;
  h += `<p class="muted" style="font-size:13px">Save your edits before downloading or sending — the workbook is rebuilt from saved data.</p>`;
  return h;
}

// The inline OTT-field editor used by both "complete" rows and the walk-in form.
function editorFields(prefix) {
  return sel(`${prefix}-cal`, CAL_OPTIONS, "OTT Calibration…")
    + sel(`${prefix}-tp`, TP_OPTIONS, "Platform…")
    + sel(`${prefix}-ct`, CT_OPTIONS, "Cal Type…")
    + inp(`${prefix}-comm`, "$ Comm", 'type="number" min="0" step="1" style="width:80px"')
    + inp(`${prefix}-vin`, "VIN", 'maxlength="17" style="text-transform:uppercase"')
    + inp(`${prefix}-ecu`, "ECU ID") + inp(`${prefix}-gear`, "Gear") + inp(`${prefix}-mi`, "Mileage");
}

function openSection(openRows) {
  let h = `<h2>Overdue / incomplete bookings${openRows.length ? ` <span class="muted">(${openRows.length})</span>` : ""}</h2>`;
  if (!openRows.length) return h + `<p class="muted">None — every past event has been closed out. 🎉</p>`;
  h += `<p class="muted">Past events not yet closed out (any installer). Set the calibration + OTT fields and <strong>Complete</strong> — it joins the submission for that event's month.</p>`;
  let curKey = null;
  for (const r of openRows) {
    if (r.installerKey !== curKey) {
      curKey = r.installerKey;
      const inst = keyToInstaller(curKey) || {};
      h += `<div class="grp">${esc(inst.name ? `${inst.name}${inst.region ? ` · ${inst.region}` : ""}` : (curKey || "Unassigned"))}</div>`;
    }
    const od = r.daysOverdue === "" ? "" : ` · ${r.daysOverdue}d overdue`;
    h += `<div class="ob" data-rec="${esc(r.recordId)}" data-event="${esc(r.eventDate)}">`
      + `<div><strong>${esc(r.customer || "—")}</strong> · ${esc(r.vehicle || "—")} · ${esc(r.city || "")} · ${esc(r.eventDate)}${od} <span class="warn">(${esc(r.status)})</span></div>`
      + `<div class="obf">${editorFields("ob")}<button class="btn btn-save btn-sm ob-go">Complete →</button><span class="ob-msg muted"></span></div>`
      + `</div>`;
  }
  return h;
}

function walkinSection() {
  return `<h2>Add a walk-in</h2>`
    + `<p class="muted">Manually enter a completed calibration that wasn't booked. It's recorded as completed and joins the submission for the date's month.</p>`
    + `<div class="wk">`
    + `<div class="wkf">${inp("wk-name", "Customer name", 'class="wk-name wide"')}${inp("wk-veh", "Vehicle (e.g. 2021 Toyota Tacoma 2.7L)", 'class="wk-veh wide"')}`
    + inp("wk-city", "City", 'class="wk-city"') + inp("wk-date", "Event date", 'class="wk-date" type="date"')
    + sel("wk-inst", INSTALLER_KEYS.map((k) => `${k} — ${INSTALLERS[k].name}`), "Installer…") + `</div>`
    + `<div class="wkf">${editorFields("wk")}<button class="btn btn-send btn-sm" id="wk-go">Add walk-in</button><span id="wk-msg" class="muted"></span></div>`
    + `</div>`;
}

function consoleScript(env, month) {
  const tok = env.OTT_APPROVE_SECRET || "";
  return `<script>
  var URL_="${base(env)}/.netlify/functions/ott-report-review", MONTH_='${month.key}', TOKEN_=${JSON.stringify(tok)};
  function post_(payload, msgEl, okCb){ msgEl.textContent='Saving…'; msgEl.className='muted';
    payload.token=TOKEN_;
    fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){return r.json();}).then(function(o){
        if(o.ok){ okCb(o); } else if(o.error==='missing-column'){ msgEl.className='warn';
          msgEl.innerHTML='Add a Number field named <b>${OVERRIDE_FIELD}</b> to Airtable Bookings, then retry.';
        } else { msgEl.textContent=(o.error||'failed'); msgEl.className='warn'; }
      }).catch(function(e){ msgEl.textContent=e.message; msgEl.className='warn'; });
  }
  function fields_(scope, p){
    var q=function(c){var el=scope.querySelector('.'+p+'-'+c);return el?el.value.trim():'';};
    return { calibration:q('cal'), tuningPlatform:q('tp'), calibrationType:q('ct'), commission:q('comm'),
      vin:q('vin'), ecuId:q('ecu'), gearSize:q('gear'), mileage:q('mi') };
  }
  var save=document.getElementById('save');
  if(save) save.addEventListener('click',function(){
    var msg=document.getElementById('saveMsg'), overrides={};
    document.querySelectorAll('input.comm').forEach(function(i){ var v=i.value.trim(); overrides[i.dataset.rec]=(v===''?null:Number(v)); });
    post_({op:'overrides',month:MONTH_,overrides:overrides}, msg, function(o){
      msg.textContent='Saved '+o.saved+' ✓ — you can download or send now.'; msg.className='over';
      var t=0; document.querySelectorAll('input.comm').forEach(function(i){ i.classList.remove('need'); if(i.value.trim()!=='')t+=Number(i.value); });
      var tot=document.getElementById('tot'); if(tot)tot.textContent='$'+t;
    });
  });
  document.querySelectorAll('.ob').forEach(function(ob){
    ob.querySelector('.ob-go').addEventListener('click',function(){
      var b=fields_(ob,'ob'); if(!b.calibration){ ob.querySelector('.ob-msg').textContent='Pick an OTT Calibration'; ob.querySelector('.ob-msg').className='ob-msg warn'; return; }
      b.recordId=ob.dataset.rec; b.eventDate=ob.dataset.event;
      post_({op:'complete',booking:b}, ob.querySelector('.ob-msg'), function(){ location.reload(); });
    });
  });
  var wk=document.getElementById('wk-go');
  if(wk) wk.addEventListener('click',function(){
    var scope=wk.closest('.wk'), msg=document.getElementById('wk-msg');
    var b=fields_(scope,'wk');
    b.name=scope.querySelector('.wk-name').value.trim(); b.vehicle=scope.querySelector('.wk-veh').value.trim();
    b.city=scope.querySelector('.wk-city').value.trim(); b.dateISO=scope.querySelector('.wk-date').value.trim();
    var iv=scope.querySelector('.wk-inst').value; b.installer=iv?iv.split(' — ')[0]:'';
    if(!b.name){ msg.textContent='Enter a customer name'; msg.className='warn'; return; }
    if(!b.calibration){ msg.textContent='Pick an OTT Calibration'; msg.className='warn'; return; }
    post_({op:'walkin',booking:b}, msg, function(){ location.reload(); });
  });
  </script>`;
}

function reviewPageHtml(subRows, openRows, month, env) {
  return page(`OTT Commission Report — ${month.label}`,
    completedSection(subRows, month, env) + openSection(openRows) + walkinSection() + consoleScript(env, month));
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
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const r = await loadMonth(params, deps);
  if (r.error) return { status: "error", code: 400, error: r.error };
  if (String(params.format || "").toLowerCase() === "xlsx") {
    if (!r.subRows.length) return { status: "empty", code: 200, month: r.month };
    return { status: "xlsx", code: 200, month: r.month, buffer: renderOttXlsx(r.subRows) };
  }
  return { status: "page", code: 200, ...r };
}

// POST op:overrides — persist commission overrides. Detects a not-yet-added column.
async function saveOverrides(params, deps) {
  const { env = process.env, fetchImpl = fetch, update = (a) => updateRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const overrides = params.overrides && typeof params.overrides === "object" ? params.overrides : {};
  const c = cfg(env);
  let saved = 0;
  for (const [recordId, raw] of Object.entries(overrides)) {
    if (!recordId) continue;
    const val = raw == null || raw === "" ? null : Number(raw);
    if (val != null && !Number.isFinite(val)) continue;
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

// POST op:complete — owner closes out ANY installer's booking (no ownership check;
// the token IS the owner). Calibration Date = the event day so it reports correctly.
async function completeBooking(params, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          update = (a) => updateRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const d = params.booking || {};
  const id = String(d.recordId || "").trim();
  if (!id) return { status: "error", code: 400, error: "missing-record" };
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", code: 400, error: "bad-calibration" };
  const calDate = isDate(d.eventDate) ? d.eventDate : now.toISOString().slice(0, 10);
  const fields = { Status: "Completed", "OTT Calibration": calibration, "Calibration Date": calDate, ...reportFields(d) };
  const c = cfg(env);
  try {
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.bookings, id, fields }, OPT_FIELDS);
  } catch (e) {
    if (/unknown[_ ]field/i.test(e.message) && new RegExp(OVERRIDE_FIELD, "i").test(e.message)) return { status: "error", code: 200, error: "missing-column" };
    if (log.error) log.error("ott complete", e.message);
    return { status: "error", code: 502, error: "save-failed", detail: e.message };
  }
  return { status: "ok", code: 200, ok: true, completed: id };
}

// POST op:walkin — owner adds a completed calibration that was never booked.
async function addWalkin(params, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          create = (a) => createRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const d = params.booking || {};
  const name = String(d.name || "").trim();
  if (!name) return { status: "error", code: 400, error: "missing-name" };
  const calibration = String(d.calibration || "").trim();
  if (!CAL_OPTIONS.includes(calibration)) return { status: "error", code: 400, error: "bad-calibration" };
  const dateISO = isDate(d.dateISO) ? d.dateISO : now.toISOString().slice(0, 10);
  const installer = String(d.installer || "").trim().toLowerCase();
  const fields = {
    City: String(d.city || "").trim(), "Event Date": dateISO, Name: name, Vehicle: String(d.vehicle || "").trim(),
    Status: "Completed", "Calibration Date": dateISO, "OTT Calibration": calibration,
    Source: "owner:walk-in", ...(INSTALLERS[installer] ? { Installer: installer } : {}), ...reportFields(d),
  };
  const c = cfg(env);
  try {
    const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.bookings, fields }, ["Source", ...OPT_FIELDS]);
    return { status: "ok", code: 200, ok: true, created: rec && rec.id };
  } catch (e) {
    if (log.error) log.error("ott walkin", e.message);
    return { status: "error", code: 502, error: "save-failed", detail: e.message };
  }
}

async function dispatchPost(b, deps) {
  if (b.op === "complete") return completeBooking({ token: b.token, booking: b.booking }, deps);
  if (b.op === "walkin") return addWalkin({ token: b.token, booking: b.booking }, deps);
  return saveOverrides({ token: b.token, overrides: b.overrides }, deps);
}

async function handler(event) {
  if (event && event.httpMethod === "POST") {
    let b = {}; try { b = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
    const out = await dispatchPost(b, {});
    return { statusCode: out.code || 500, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(out.ok ? out : { ok: false, error: out.error, detail: out.detail }) };
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
    out.status === "page" ? reviewPageHtml(out.subRows, out.openRows, out.month, process.env)
    : out.status === "empty" ? page(`OTT Commission Report — ${out.month.label}`, `<p>No completed calibrations to download for ${esc(out.month.label)}.</p>`)
    : out.error === "unauthorized" ? page("Not authorized", "<p>This link is invalid or the token is missing.</p>")
    : page("Bad request", "<p>Missing or invalid month.</p>");
  return { statusCode: out.code || 500, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
}

module.exports = { handler, review, saveOverrides, completeBooking, addWalkin, reviewPageHtml, reviewUrl, OVERRIDE_FIELD };

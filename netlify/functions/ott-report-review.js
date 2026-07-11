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
const { cfg, listAllRecords, updateRecord, createRecord, updateTolerant, createTolerant, getRecord, deleteRecord } = require("./lib/airtable.js");
const { flattenRecords } = require("./lib/report-sources.js");
const { keyToInstaller, INSTALLERS } = require("./lib/routing.js");
const { CAL_OPTIONS } = require("./lib/certificate.js");
const { ecuCandidates, defaultGear } = require("./lib/ecu-ids.js");
const { commissionCandidates, resolveCommission } = require("./lib/ott-commission.js");
const { monthFromKey, priorMonth, buildSubmissionRows, buildOpenBookings, renderOttXlsx, totalCommission, unresolved, recipients } = require("./lib/ott-report.js");

const OVERRIDE_FIELD = "Commission Override";
// OTT report picklists (Policy 0012).
const TP_OPTIONS = ["VFT", "HPT", "PCM", "BB"];   // no COBB — Tuned Yota doesn't do COBB
const CT_OPTIONS = ["9.2 New", "9.2 Update", "CARB New", "CARB Update", "Custom", "SEMA CE", "Basic", "TCM Update", "Supercharger", "THR Adjust"];
const GEAR_OPTIONS = ["3.90", "3.58", "3.73", "4.10", "4.30", "4.88", "5.29", "Stock"];   // Policy 0012
const INSTALLER_KEYS = Object.keys(INSTALLERS);
const OPT_FIELDS = ["Model Year", "VIN", "Tuning Platform", "Calibration Type", "ECU ID", "Gear Size", "Mileage", OVERRIDE_FIELD];

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
// A select that always keeps the current value selectable (even if it's not a
// standard option) so editing never silently drops a stored value.
function selCur(cls, options, cur) {
  const c = String(cur == null ? "" : cur);
  const opts = c && !options.includes(c) ? [c, ...options] : options;
  return `<select class="${cls}"><option value="">—</option>` +
    opts.map((o) => `<option${String(o) === c ? " selected" : ""}>${esc(o)}</option>`).join("") + `</select>`;
}

// The OTT report fields, gathered from a booking-completion / walk-in payload into
// an Airtable fields object. Only sets what's present so a partial entry still saves.
function reportFields(d) {
  const f = {};
  const my = String(d.modelYear || "").trim(); if (/^(?:19|20)\d{2}$/.test(my)) f["Model Year"] = my;
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
    `.obf input,.wkf input{width:110px}.wkf input.wide{width:170px}` +
    `.tblwrap{overflow-x:auto}input.ecu{width:78px;text-transform:uppercase;padding:5px 6px;border:1px solid #cbc4ba;border-radius:5px;font:inherit}` +
    `input.gear{width:56px;padding:5px 6px;border:1px solid #cbc4ba;border-radius:5px;font:inherit}` +
    `input.auto{color:#7c8472;font-style:italic;background:#f7f5f1}select.ecu-pick,select.gear-pick,select.comm-pick{margin-left:3px;padding:5px 2px;border:1px solid #cbc4ba;border-radius:5px;font-size:12px}` +
    `.btn-del{background:none;border:0;color:#8a2a2a;cursor:pointer;font-size:13px;padding:4px 6px;border-radius:5px}.btn-del:hover{background:#fdecea}` +
    `.ns-l{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:#8a5a12;cursor:pointer}.ns-l input{margin:0}` +
    `input.f,select.f{padding:5px 6px;border:1px solid #cbc4ba;border-radius:5px;font:inherit;font-size:12.5px}input.f{width:112px}` +
    `input.f-vin{width:150px}input.f-vt{width:96px}input.f-eng{width:62px}input.f-my{width:56px}input.f-mi{width:78px}input.f-date{width:130px}#ctab td{vertical-align:top}</style>` +
    `<body><h1>${esc(title)}</h1>${body}</body>`;
}

function completedSection(subRows, month, env) {
  const tok = encodeURIComponent(env.OTT_APPROVE_SECRET || "");
  const xlsxUrl = `${base(env)}/.netlify/functions/ott-report-review?month=${month.key}&token=${tok}&format=xlsx`;
  const sendUrl = `${base(env)}/.netlify/functions/ott-report-send?month=${month.key}&token=${tok}`;
  const to = recipients(env), total = totalCommission(subRows), u = unresolved(subRows).length;
  let h = `<p class="muted">${esc(month.label)} · ${subRows.length} completed calibration${subRows.length === 1 ? "" : "s"} · commission total <strong id="tot">$${total}</strong></p>`;
  h += `<p><strong>Nothing has been sent to OTT yet.</strong> Every field below is editable — change anything, then <strong>Save</strong>. <span class="muted">Italic values are auto-filled suggestions; Save to lock them.</span></p>`;
  if (u) h += `<p class="warn"><strong>${u} row(s) need a commission</strong> — the amount was ambiguous or the platform was bench (BB). Type it in and Save.</p>`;
  h += `<div class="tblwrap"><table id="ctab"><tr><th>Date</th><th>Customer</th><th>VIN</th><th>Model&nbsp;Yr</th><th>Vehicle&nbsp;Type</th><th>Engine</th><th>Platform</th><th>Cal&nbsp;Type</th><th>ECU&nbsp;ID</th><th>Gear</th><th>Mileage</th><th>Commission&nbsp;($)</th><th></th></tr>`;
  for (const r of subRows) {
    const rec = esc(r.recordId);
    const need = r.commission == null, val = r.commission == null ? "" : r.commission;
    const flag = r._overridden ? ` <span class="over" title="Manually set">✎</span>` : "";
    let ecuCell = `<input class="ecu${r._ecuAuto ? " auto" : ""}" value="${esc(r.ecuId || "")}"${r._ecuAuto ? ' title="auto-filled from model+year — Save to lock"' : ""}>`;
    if (r._ecuCandidates && r._ecuCandidates.length) {
      ecuCell += `<select class="ecu-pick"${r._is3gt ? ' data-gt="1"' : ""}><option value="">↕</option>`
        + r._ecuCandidates.map((c) => `<option value="${esc(c.id)}" data-trans="${esc(c.transmission)}">${esc(c.label)}</option>`).join("") + `</select>`;
    }
    const gearCell = `<input class="gear${r._gearAuto ? " auto" : ""}" value="${esc(r.gearSize || "")}">`
      + `<select class="gear-pick"><option value="">↕</option>` + GEAR_OPTIONS.map((g) => `<option>${g}</option>`).join("") + `</select>`;
    let commCell = `<input class="comm${need ? " need" : ""}" type="number" min="0" step="1" inputmode="numeric" value="${val}">${flag}`;
    if (r._commCandidates && r._commCandidates.length) {
      commCell += `<select class="comm-pick"><option value="">↕</option>`
        + r._commCandidates.map((c) => `<option value="${c.amount}">${esc(c.label)} · $${c.amount}</option>`).join("") + `</select>`;
    }
    h += `<tr data-rec="${rec}" data-vt="${esc(r.vehicleType || "")}" data-eng="${esc(r.engineSize || "")}">`
      + `<td><input type="date" class="f f-date" value="${esc(r.dateCalibrationApplied || "")}"></td>`
      + `<td><input class="f f-name" value="${esc(r.customer || "")}"></td>`
      + `<td><input class="f f-vin" style="text-transform:uppercase" value="${esc(r.vin || "")}"></td>`
      + `<td><input class="f f-my" value="${esc(r.vehicleYear || "")}"></td>`
      + `<td><input class="f f-vt" value="${esc(r.vehicleType || "")}"></td>`
      + `<td><input class="f f-eng" value="${esc(r.engineSize || "")}"></td>`
      + `<td>${selCur("f f-tp", TP_OPTIONS, r.tuningPlatform)}</td>`
      + `<td>${selCur("f f-ct", CT_OPTIONS, r.calibrationType)}</td>`
      + `<td>${ecuCell}</td><td>${gearCell}</td>`
      + `<td><input class="f f-mi" value="${r.mileage === "" || r.mileage == null ? "" : esc(r.mileage)}"></td>`
      + `<td>${commCell}</td>`
      + `<td><button class="btn-del row-del" data-rec="${rec}" title="Delete this entry">✕</button></td></tr>`;
  }
  h += `</table></div>`;
  h += `<div style="margin:22px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center">`
    + `<button class="btn btn-save" id="save">Save</button>`
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
  h += `<p class="muted">Past events not yet closed out (any installer). Pick the <strong>model year</strong> and <strong>platform</strong> — the ECU, gear, cal type, and commission auto-fill. Set the calibration, then <strong>Complete</strong> — it joins the submission for that event's month.</p>`;
  let curKey = null;
  for (const r of openRows) {
    if (r.installerKey !== curKey) {
      curKey = r.installerKey;
      const inst = keyToInstaller(curKey) || {};
      h += `<div class="grp">${esc(inst.name ? `${inst.name}${inst.region ? ` · ${inst.region}` : ""}` : (curKey || "Unassigned"))}</div>`;
    }
    const od = r.daysOverdue === "" ? "" : ` · ${r.daysOverdue}d overdue`;
    const yrs = (r.yearLo && r.yearHi) ? Array.from({ length: r.yearHi - r.yearLo + 1 }, (_, i) => r.yearHi - i) : [];
    const yearSel = yrs.length
      ? `<select class="ob-year"><option value="">Model year…</option>` + yrs.map((y) => `<option${String(r.modelYear) === String(y) ? " selected" : ""}>${y}</option>`).join("") + `</select>`
      : `<input class="ob-year" placeholder="Model year" value="${esc(r.modelYear || "")}" style="width:100px">`;
    h += `<div class="ob" data-rec="${esc(r.recordId)}" data-event="${esc(r.eventDate)}" data-vt="${esc(r.vehicleType || "")}" data-eng="${esc(r.engine || "")}">`
      + `<div><strong>${esc(r.customer || "—")}</strong> · ${esc(r.vehicle || "—")} · ${esc(r.city || "")} · ${esc(r.eventDate)}${od} <span class="warn">(${esc(r.status)})</span></div>`
      + `<div class="obf">${yearSel}${editorFields("ob")}<button class="btn btn-save btn-sm ob-go">Complete →</button>`
      + `<label class="ns-l"><input type="checkbox" class="ob-noshow"> No-show → waitlist</label>`
      + `<button class="btn-del ob-del" title="Delete this booking">✕ Delete</button><span class="ob-msg muted"></span></div>`
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
  // Rebuild a Vehicle string from the editable type/engine/year (so Vehicle Type,
  // Engine, and Vehicle Year are all directly editable and round-trip on save).
  function mkVeh(vt,eng,my){
    if(!(vt||eng||my)) return '';
    var make=/^(gx|lx|rx|ls|es)/i.test(vt)?'Lexus':'Toyota';
    var e=/^\d\.\d$/.test(eng)?eng+'L':(eng==='2.4T'?'2.4L-T':(eng==='2.4TH'?'2.4L-TH':eng));
    return ((my?my+' ':'')+make+' '+vt+(e?' '+e:'')).replace(/\s+/g,' ').trim();
  }
  // Every completed row (#ctab tr) is fully editable. Gather its fields:
  function rowFields(tr){
    var q=function(sel){ var el=tr.querySelector(sel); return el?el.value.trim():''; };
    var comm=q('input.comm');
    return { commission:(comm===''?null:Number(comm)), ecu:q('input.ecu'), gear:q('input.gear'),
      date:q('input.f-date'), name:q('input.f-name'), vin:q('input.f-vin'),
      vehicle:mkVeh(q('input.f-vt'),q('input.f-eng'),q('input.f-my')),
      modelYear:q('input.f-my'), platform:q('select.f-tp'), calType:q('select.f-ct'), mileage:q('input.f-mi') };
  }
  // platform / cal type / model year / type / engine change → re-resolve ECU/gear/commission.
  function resolveRow(tr){
    var gv=function(sel){var el=tr.querySelector(sel);return el?el.value:'';};
    var veh={ vehicleType:gv('input.f-vt'), engine:gv('input.f-eng'), year:gv('input.f-my'),
      tuningPlatform:gv('select.f-tp'), calibrationType:gv('select.f-ct') };
    fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'resolve',token:TOKEN_,veh:veh})})
      .then(function(r){return r.json();}).then(function(o){ if(!o||!o.ok) return;
        // Only fill ECU/gear when empty (don't clobber a value already on the row);
        // commission always re-resolves since it depends on platform + cal type.
        var e=tr.querySelector('input.ecu'); if(e && o.ecu && !e.value.trim()) e.value=o.ecu;
        var g=tr.querySelector('input.gear'); if(g && o.gear && !g.value.trim()) g.value=o.gear;
        var c=tr.querySelector('input.comm'); if(c && o.commission!=null && o.commission!=='') { c.value=o.commission; c.classList.remove('need'); }
      }).catch(function(){});
  }
  var ctab=document.getElementById('ctab');
  if(ctab){
    ['input','change'].forEach(function(ev){ ctab.addEventListener(ev,function(e){ var tr=e.target.closest('tr[data-rec]'); if(tr) tr.dataset.dirty='1'; }); });
    ctab.querySelectorAll('tr[data-rec]').forEach(function(tr){
      var ep=tr.querySelector('select.ecu-pick'); if(ep) ep.addEventListener('change',function(){
        var opt=ep.options[ep.selectedIndex]; var ei=tr.querySelector('input.ecu'); if(ei&&ep.value){ei.value=ep.value;ei.classList.remove('auto');}
        if(ep.dataset.gt&&opt&&opt.dataset.trans){var gi=tr.querySelector('input.gear'); if(gi){gi.value=(opt.dataset.trans==='Manual'?'4.30':'3.90');gi.classList.remove('auto');}}
      });
      var gp=tr.querySelector('select.gear-pick'); if(gp) gp.addEventListener('change',function(){var gi=tr.querySelector('input.gear'); if(gi&&gp.value){gi.value=gp.value;gi.classList.remove('auto');}});
      var cp=tr.querySelector('select.comm-pick'); if(cp) cp.addEventListener('change',function(){var ci=tr.querySelector('input.comm'); if(ci&&cp.value){ci.value=cp.value;ci.classList.remove('need');}});
      var tp=tr.querySelector('select.f-tp'); if(tp) tp.addEventListener('change',function(){var ct=tr.querySelector('select.f-ct'); if(ct&&!ct.value&&(tp.value==='VFT'||tp.value==='PCM'))ct.value='Basic'; resolveRow(tr);});
      var ct=tr.querySelector('select.f-ct'); if(ct) ct.addEventListener('change',function(){resolveRow(tr);});
      var my=tr.querySelector('input.f-my'); if(my) my.addEventListener('change',function(){resolveRow(tr);});
      var vt=tr.querySelector('input.f-vt'); if(vt) vt.addEventListener('change',function(){resolveRow(tr);});
      var eng=tr.querySelector('input.f-eng'); if(eng) eng.addEventListener('change',function(){resolveRow(tr);});
    });
  }
  var save=document.getElementById('save');
  if(save) save.addEventListener('click',function(){
    var msg=document.getElementById('saveMsg'), overrides={}, n=0;
    document.querySelectorAll('#ctab tr[data-dirty="1"]').forEach(function(tr){ overrides[tr.dataset.rec]=rowFields(tr); n++; });
    if(!n){ msg.textContent='No changes to save.'; msg.className='muted'; return; }
    post_({op:'overrides',month:MONTH_,overrides:overrides}, msg, function(o){
      msg.textContent='Saved '+o.saved+' ✓ — you can download or send now.'; msg.className='over';
      document.querySelectorAll('#ctab tr[data-dirty]').forEach(function(tr){ tr.removeAttribute('data-dirty'); });
      document.querySelectorAll('input.auto').forEach(function(i){ i.classList.remove('auto'); });
      var t=0; document.querySelectorAll('#ctab input.comm').forEach(function(i){ i.classList.remove('need'); if(i.value.trim()!=='')t+=Number(i.value); });
      var tot=document.getElementById('tot'); if(tot)tot.textContent='$'+t;
    });
  });
  document.querySelectorAll('.ob').forEach(function(ob){
    var ys=ob.querySelector('.ob-year'), tp=ob.querySelector('.ob-tp'), ct=ob.querySelector('.ob-ct');
    // Ask the server for the fields we can derive from the current selections
    // (ECU + gear from model/year; commission once platform + cal type are set).
    function resolveOb(){
      var veh={ vehicleType:ob.dataset.vt, engine:ob.dataset.eng, year:(ys&&ys.value)||'',
        tuningPlatform:tp?tp.value:'', calibrationType:ct?ct.value:'' };
      fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'resolve',token:TOKEN_,veh:veh})})
        .then(function(r){return r.json();}).then(function(o){ if(!o||!o.ok) return;
          var e=ob.querySelector('.ob-ecu'); if(e && o.ecu) e.value=o.ecu;
          var g=ob.querySelector('.ob-gear'); if(g && o.gear) g.value=o.gear;
          var c=ob.querySelector('.ob-comm'); if(c && o.commission!=null && o.commission!=='') c.value=o.commission;
        }).catch(function(){});
    }
    if(ys) ys.addEventListener('change',resolveOb);
    if(tp) tp.addEventListener('change',function(){
      if(ct && !ct.value && (tp.value==='VFT'||tp.value==='PCM')) ct.value='Basic';   // default cal type
      resolveOb();
    });
    if(ct) ct.addEventListener('change',resolveOb);
    ob.querySelector('.ob-go').addEventListener('click',function(){
      var b=fields_(ob,'ob'); if(!b.calibration){ ob.querySelector('.ob-msg').textContent='Pick an OTT Calibration'; ob.querySelector('.ob-msg').className='ob-msg warn'; return; }
      b.recordId=ob.dataset.rec; b.eventDate=ob.dataset.event; b.modelYear=ys?(ys.value||'').trim():'';
      post_({op:'complete',booking:b}, ob.querySelector('.ob-msg'), function(){ location.reload(); });
    });
  });
  // Delete an entry (completed row or overdue booking).
  document.querySelectorAll('.row-del,.ob-del').forEach(function(btn){ btn.addEventListener('click',function(){
    if(!confirm('Delete this entry permanently? This removes the booking record.')) return;
    var ob=btn.closest('.ob'); var rec=(btn.dataset.rec)||(ob&&ob.dataset.rec);
    var msg=ob?ob.querySelector('.ob-msg'):document.getElementById('saveMsg');
    post_({op:'delete',recordId:rec}, msg, function(){ location.reload(); });
  }); });
  // No-show checkbox → mark No-show + add to the priority waitlist.
  document.querySelectorAll('.ob-noshow').forEach(function(cb){ cb.addEventListener('change',function(){
    if(!cb.checked) return;
    if(!confirm('Mark as No-show and add the customer to the priority waitlist?')){ cb.checked=false; return; }
    var ob=cb.closest('.ob');
    post_({op:'noshow',recordId:ob.dataset.rec}, ob.querySelector('.ob-msg'), function(){ location.reload(); });
  }); });
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
    // Value is an object {commission, ecu, gear}; a bare number is back-compat commission.
    const v = raw && typeof raw === "object" ? raw : { commission: raw };
    const fields = {};
    if ("commission" in v) {
      const n = v.commission == null || v.commission === "" ? null : Number(v.commission);
      if (n == null || Number.isFinite(n)) fields[OVERRIDE_FIELD] = n;
    }
    if ("ecu" in v) fields["ECU ID"] = String(v.ecu || "").trim().toUpperCase() || null;
    if ("gear" in v) fields["Gear Size"] = String(v.gear || "").trim() || null;
    // Full-row edits from the completed table.
    if ("date" in v && isDate(v.date)) fields["Calibration Date"] = v.date;
    if ("name" in v) fields.Name = String(v.name || "");
    if ("vin" in v) fields.VIN = String(v.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
    if ("vehicle" in v) fields.Vehicle = String(v.vehicle || "");
    if ("modelYear" in v) { const my = String(v.modelYear || "").trim(); fields["Model Year"] = /^(?:19|20)\d{2}$/.test(my) ? my : null; }
    if ("platform" in v) fields["Tuning Platform"] = String(v.platform || "").trim().toUpperCase();
    if ("calType" in v) fields["Calibration Type"] = String(v.calType || "").trim();
    if ("mileage" in v) { const mi = String(v.mileage == null ? "" : v.mileage).replace(/[^0-9]/g, ""); fields.Mileage = mi ? Number(mi) : null; }
    if (!Object.keys(fields).length) continue;
    try {
      await update({ token: c.token, baseId: c.baseId, table: c.bookings, id: recordId, fields });
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

// POST op:delete — permanently remove a booking record (owner-initiated).
async function deleteBooking(params, deps) {
  const { env = process.env, fetchImpl = fetch, del = (a) => deleteRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const id = String(params.recordId || "").trim();
  if (!id) return { status: "error", code: 400, error: "missing-record" };
  const c = cfg(env);
  try { await del({ token: c.token, baseId: c.baseId, table: c.bookings, id }); return { status: "ok", code: 200, ok: true, deleted: id }; }
  catch (e) { if (log.error) log.error("ott delete", e.message); return { status: "error", code: 502, error: "delete-failed", detail: e.message }; }
}

// POST op:noshow — mark a booking No-show and add the customer to the Priority
// waitlist (mirrors the installer console's no-show flow).
async function noShow(params, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          get = (a) => getRecord({ fetchImpl, ...a }), update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }), log = console } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const id = String(params.recordId || "").trim();
  if (!id) return { status: "error", code: 400, error: "missing-record" };
  const c = cfg(env);
  let f = {};
  try { f = (await get({ token: c.token, baseId: c.baseId, table: c.bookings, id })).fields || {}; }
  catch (e) { if (log.error) log.error("ott noshow get", e.message); return { status: "error", code: 502, error: "store-unavailable" }; }
  try { await update({ token: c.token, baseId: c.baseId, table: c.bookings, id, fields: { Status: "No-show" } }); }
  catch (e) { if (log.error) log.error("ott noshow", e.message); return { status: "error", code: 502, error: "save-failed", detail: e.message }; }
  let waitlisted = false;
  try {
    const inst = Array.isArray(f.Installer) ? f.Installer[0] : (f.Installer || "");
    const fields = { City: f.City || "", Name: f.Name || "", Phone: f.Phone || "", Email: f.Email || "",
      Vehicle: f.Vehicle || "", Modifications: f.Modifications || "", Installer: inst,
      Reason: `No-show — ${f.City || ""} ${String(f["Event Date"] || "").slice(0, 10)}`.trim(), Source: "owner:no-show" };
    await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields }, ["Modifications", "Source"]);
    waitlisted = true;
  } catch (e) { if (log.error) log.error("ott noshow waitlist", e.message); }
  return { status: "ok", code: 200, ok: true, noshow: id, waitlisted };
}

// POST op:resolve — given the current overdue-form selections, return the fields
// we can derive: ECU (most-likely for model+year), gear default, and commission
// (once platform + cal type are known). No writes.
function resolveFields(params, deps) {
  const { env = process.env } = deps;
  if (!authOk(env, params.token)) return { status: "error", code: 401, error: "unauthorized" };
  const v = params.veh || {};
  const veh = { vehicleType: v.vehicleType, engine: v.engine, year: v.year };
  const ecu = ecuCandidates(veh), comm = commissionCandidates(veh);
  const commission = comm.length ? comm[0].amount
    : (v.tuningPlatform && v.calibrationType ? resolveCommission({ ...veh, tuningPlatform: v.tuningPlatform, calibrationType: v.calibrationType }) : null);
  return { status: "ok", code: 200, ok: true,
    ecu: ecu[0] ? ecu[0].id : "", gear: v.year ? defaultGear(veh) : "", commission };
}

async function dispatchPost(b, deps) {
  if (b.op === "resolve") return resolveFields({ token: b.token, veh: b.veh }, deps);
  if (b.op === "complete") return completeBooking({ token: b.token, booking: b.booking }, deps);
  if (b.op === "walkin") return addWalkin({ token: b.token, booking: b.booking }, deps);
  if (b.op === "delete") return deleteBooking({ token: b.token, recordId: b.recordId }, deps);
  if (b.op === "noshow") return noShow({ token: b.token, recordId: b.recordId }, deps);
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

module.exports = { handler, review, saveOverrides, completeBooking, addWalkin, deleteBooking, noShow, resolveFields, reviewPageHtml, reviewUrl, OVERRIDE_FIELD };

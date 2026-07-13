// Pure builder: the Tuned Yota Master Certificate ("Certificate of Calibration"),
// rendered from booking data. Canonical design source of truth:
// docs/brand/tuned-yota-master-certificate.html. No I/O.

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The choosable OTT Calibration values (single tiers + adjacent combos).
const CAL_OPTIONS = ["Light", "Mild", "Medium", "Spicy", "SS", "Light and Mild", "Mild and Medium", "Medium and Spicy", "Spicy and SS"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? "" : iso));
  if (!m) return esc(iso);
  return `${MONTHS[+m[2] - 1] || ""} ${+m[3]}, ${m[1]}`;
}

// Deterministic per-booking serial: TY-{year}-{record-id suffix}.
function certSerial(recordId, dateISO, issueISO) {
  const y = (/^(\d{4})/.exec(String(dateISO || issueISO || "")) || [])[1] || "0000";
  const suffix = String(recordId || "").replace(/[^a-z0-9]/gi, "").slice(-5).toUpperCase() || "00000";
  return `TY-${y}-${suffix}`;
}

// Once dispatched, the OTT Calibration is LOCKED: the value chosen in Airtable
// renders as static, non-editable text (no dropdown). The choosable picker lives
// only in the design master, docs/brand/tuned-yota-master-certificate.html.

// Render the vehicle line as the EXACT model year + platform, nothing else.
// The stored vehicle string carries the platform year RANGE plus the customer's
// "What are you after?" selections (joined with " · "), e.g.
// "2016-2023 Toyota Tacoma 2.7L I4  ·  Better shifting, Larger tires". Neither
// belongs on the certificate: drop the selections, and when the exact model year
// was captured at booking, swap it in for the range → "2021 Toyota Tacoma 2.7L I4".
// Without a captured year we keep the platform range (goals still dropped).
function formatVehicle(vehicle, modelYear) {
  if (!vehicle) return "";
  const base = String(vehicle).split(/\s*·\s*/)[0].trim();
  const year = String(modelYear == null ? "" : modelYear).trim();
  if (!year) return base;
  // Strip a leading platform year token ("2016-2023", "2024+", "All years") so
  // the exact year replaces it rather than stacking two years.
  const platform = base
    .replace(/^all\s+years\s+/i, "")
    .replace(/^(?:19|20)\d{2}\s*(?:[-–—]\s*(?:(?:19|20)\d{2})?|\+)?\s+/, "");
  return `${year} ${platform}`;
}

// ---- Page 2 — AMSOIL Maintenance Reference helpers ----

const AMSOIL_LOGO = "https://tunedyota.com/images/amsoil/amsoil-logo.png";

function fluidsRows(fluids) {
  if (!fluids || !fluids.systems || !fluids.systems.length) return "";
  const rows = fluids.systems.map((s) => `
        <tr>
          <td><span class="sys">${esc(s.system)}</span></td>
          <td><div class="prod">${esc(s.product)}</div>${s.stockNo ? `<div class="stockno">Stock No. <b>${esc(s.stockNo)}</b></div>` : ""}</td>
          <td class="num"><span class="cap">${esc(s.capacity)}</span> ${esc(s.unit)}</td>
          <td class="num intv"><span class="t">${esc(s.tunedInterval)}</span>${s.factoryInterval ? `<span class="f">${esc(s.factoryInterval)}</span>` : ""}</td>
        </tr>`).join("");
  return `
      <table class="fluids">
        <thead><tr><th>System</th><th>AMSOIL product</th><th class="num">Capacity</th><th class="num">Interval</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
}

function amsoilPage(amsoil, vehicleDisplay) {
  const fluids = amsoil.fluids;
  const qr = amsoil.qrSvg || "";
  const url = (fluids && fluids.garageUrl) || "https://tunedyota.com/amsoil-garage";
  const veh = esc(vehicleDisplay || "");
  return `
  <div class="cert ref">
    <div class="measure"></div>
    <div class="pad">
      <div class="ref-head">
        <div>
          <div class="ref-eyebrow">AMSOIL Maintenance Reference</div>
          <h2>A tuned truck deserves the best fluids in the world — <span class="amsoil-red">AMSOIL</span>.</h2>
          ${veh ? `<div class="ref-veh">${veh}</div>` : ""}
        </div>
        <div class="amsoil-lockup">
          <span class="amsoil-chip"><img src="${AMSOIL_LOGO}" alt="AMSOIL"></span>
          <div class="amsoil-dealer">Authorized AMSOIL Dealer</div>
        </div>
      </div>
      <p class="lede">Tuned Yota has organized your vehicle&rsquo;s necessary fluids, fluid capacities, and service intervals! We hope you enjoy this quick reference list of AMSOIL products for your vehicle.</p>
      ${fluidsRows(fluids)}
      <div class="order">
        <span class="qr">${qr}</span>
        <div class="pitch">
          <h3>Order your exact fluids</h3>
          <p>Scan to open <strong>your AMSOIL Garage</strong>${fluids ? " — pre-loaded with these products for your " + esc(fluids.model) : ""}. Add other vehicles, or search the full AMSOIL catalog.</p>
          <span class="save">Enroll free as a Preferred Customer — save up to 25%</span>
          <div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div>
        </div>
      </div>
    </div>
    <div class="ref-fine">Fluids &amp; capacities are a maintenance reference for your vehicle — confirm capacities against your owner&rsquo;s manual before service. &middot; Tuned Yota is an Authorized AMSOIL Dealer. &middot; tunedyota.com/amsoil-garage</div>
  </div>`;
}

function buildCertificate({ name, vehicle, modelYear, vin, calibration, installer, installerRegion, calibrationDate, certNo, issueDate, amsoil } = {}) {
  const vehicleDisplay = formatVehicle(vehicle, modelYear);
  const subject = `Tuned Yota — Certificate of Calibration${name ? ` for ${name}` : ""}${vehicleDisplay ? ` · ${vehicleDisplay}` : ""}`;
  // Installer row shows the installer's NAME only — no cities/region.
  const installerLine = esc(installer || "");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Certificate of Calibration — Tuned Yota</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#F7F5F1;
    --ink:#191C1E;
    --steel:#5B6066;
    --faint:#8A8F94;
    --hair:#D9D5CC;
    --hair2:#E7E3DA;
    --ember:#C04A1B;
    --ember-tint:#F3E4DA;
    --seal:#1F3A2E;
    --brand-brown:#5B4B42;
    --fox-blue:#B3D0D9;
    --fox-blue-deep:#7FA6B2;
    --sage:#99A08E;
    --sand:#DFC4B5;
    --mono: "SFMono-Regular", ui-monospace, "DejaVu Sans Mono", "Menlo", "Consolas", monospace;
    --sans: "Lato", "Helvetica Neue", Arial, sans-serif;
    /* Official AMSOIL brand colors (Style Guide): Red PMS 485 #ed1c24, Blue PMS 286 #005baa, Cool Gray 6 #bcbec0 */
    --amsoil:#ed1c24; --amsoil-deep:#b3141b; --amsoil-brand:#ed1c24; --amsoil-blue:#005baa; --amsoil-gray:#bcbec0;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background:#E4E1DA;
    font-family:var(--sans);
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
    padding:32px 16px;
    line-height:1.5;
  }
  .cert{
    position:relative;
    width:100%;
    max-width:760px;
    margin:0 auto;
    background:var(--paper);
    border:1px solid var(--hair);
    box-shadow:0 18px 50px rgba(25,28,30,.16);
    overflow:hidden;
  }
  .measure{
    height:8px;
    background:
      repeating-linear-gradient(90deg,
        var(--ink) 0, var(--ink) 1px,
        transparent 1px, transparent 12px);
    opacity:.85;
  }
  .pad{ padding:44px 52px; }
  .head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:24px;
    padding-bottom:22px;
    border-bottom:1.5px solid var(--ink);
  }
  .brand-lockup{ display:flex; align-items:center; gap:14px; }
  .brand-lockup .fox-icon{ width:46px; height:46px; flex:0 0 46px; }
  .brand-lockup .fox-icon path{ fill:var(--fox-blue); fill-rule:evenodd; }
  .brand-mark{
    font-family:var(--sans);
    font-weight:900;
    font-size:25px;
    letter-spacing:.13em;
    text-transform:uppercase;
    line-height:1;
    color:var(--brand-brown);
  }
  .brand-sub{
    margin-top:8px;
    font-family:var(--mono);
    font-size:10.5px;
    letter-spacing:.04em;
    color:var(--steel);
    text-transform:uppercase;
  }
  .doc-id{ text-align:right; font-family:var(--mono); font-size:10.5px; color:var(--steel); }
  .doc-id .k{ color:var(--faint); }
  .doc-id .v{ color:var(--ink); }
  .doc-id div{ margin-bottom:3px; }
  .eyebrow{
    margin:30px 0 6px;
    font-family:var(--mono);
    font-size:11px;
    letter-spacing:.42em;
    text-transform:uppercase;
    color:var(--ember);
  }
  h1{
    margin:28px 0 0;
    font-size:40px;
    font-weight:800;
    letter-spacing:-.01em;
    line-height:1.02;
  }
  h1 .thin{ font-weight:300; color:var(--steel); }
  .title-rule{ width:56px; height:3px; background:var(--ember); border-radius:2px; margin:12px 0 0; }
  .attest{
    margin:22px 0 30px;
    font-size:15px;
    color:var(--steel);
    text-align:justify;
    text-justify:inter-word;
  }
  .attest strong{ color:var(--ink); font-weight:700; }
  .readout{
    border:1px solid var(--hair);
    background:#FBFAF7;
  }
  .readout-h{
    display:flex; justify-content:space-between; align-items:center;
    padding:9px 16px;
    background:var(--ink);
    color:var(--paper);
    font-family:var(--mono);
    font-size:10px;
    letter-spacing:.22em;
    text-transform:uppercase;
  }
  .readout-h .live{ color:#7FB89B; }
  .row{
    display:grid;
    grid-template-columns:170px 1fr;
    border-bottom:1px solid var(--hair2);
  }
  .row:last-child{ border-bottom:0; }
  .row .label{
    padding:13px 16px;
    font-family:var(--mono);
    font-size:10px;
    letter-spacing:.14em;
    text-transform:uppercase;
    color:var(--faint);
    border-right:1px solid var(--hair2);
    background:#F4F2ED;
    display:flex; align-items:center;
  }
  .row .value{
    padding:13px 16px;
    font-family:var(--mono);
    font-size:14px;
    color:var(--ink);
    display:flex; align-items:center;
  }
  .row .value.hot{ color:var(--ember); font-weight:600; letter-spacing:.01em; }
  .foot{
    display:flex;
    justify-content:flex-end;
    align-items:flex-end;
    gap:28px;
    margin-top:34px;
    padding-top:24px;
    border-top:1px solid var(--hair);
  }
  .stamp{
    flex:0 0 142px;
    width:142px; height:142px;
    transform:rotate(-6deg);
    filter:
      drop-shadow(-0.6px -0.6px 0 rgba(255,255,255,.9))
      drop-shadow(0.8px 1px 0.6px rgba(91,75,66,.30))
      drop-shadow(0 2px 4px rgba(91,75,66,.12));
    opacity:.95;
  }
  .stamp svg{ width:100%; height:100%; display:block; }
  .stamp .ring{ fill:none; stroke:var(--fox-blue-deep); }
  .stamp .ring-outer{ stroke-width:2.2; }
  .stamp .ring-inner{ stroke-width:1.1; opacity:.7; }
  .stamp .curve-text{
    fill:var(--fox-blue-deep);
    font-family:var(--sans);
    font-weight:700;
    font-size:11px;
    letter-spacing:2.6px;
  }
  .stamp .star{ fill:var(--fox-blue-deep); }
  .stamp .fox-mark path{ fill:var(--fox-blue-deep); fill-rule:evenodd; }
  .fine{
    padding:18px 52px 30px;
    border-top:1px solid var(--hair2);
    font-family:var(--mono);
    font-size:9.5px;
    line-height:1.7;
    letter-spacing:.02em;
    color:var(--faint);
    text-align:center;
  }
  .fine a{ color:var(--steel); text-decoration:none; }
  /* ---- Page 2 — AMSOIL reference styles ---- */
  .ref .pad{padding:40px 52px 30px;}
  .ref .measure{background:repeating-linear-gradient(90deg,var(--amsoil) 0,var(--amsoil) 1px,transparent 1px,transparent 12px);opacity:.85;}
  .ref-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1.5px solid var(--ink);padding-bottom:18px;}
  .ref-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.36em;text-transform:uppercase;color:var(--amsoil);margin-bottom:8px;}
  .ref-head h2{margin:0;font-size:27px;font-weight:800;letter-spacing:-.01em;line-height:1.08;}
  .ref-head h2 .thin{font-weight:300;color:var(--steel);}
  .ref-veh{font-family:var(--mono);font-size:11px;color:var(--steel);margin-top:8px;text-transform:uppercase;letter-spacing:.06em;}
  .amsoil-red{color:var(--amsoil-brand);}
  /* Official approved AMSOIL logo — used UNALTERED on a solid white chip with clear
     space, per the AMSOIL Brand Style Guide (no recreation, recolor, or textured bg). */
  .amsoil-lockup{flex:0 0 auto;text-align:right;}
  .amsoil-chip{display:inline-block;background:#fff;border:1px solid var(--hair);border-radius:10px;padding:13px 17px;}
  .amsoil-chip img{display:block;width:178px;height:auto;}
  .amsoil-dealer{margin-top:8px;font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);}
  .lede{margin:18px 0 20px;font-size:14px;color:var(--steel);}
  .lede strong{color:var(--ink);}
  table.fluids{width:100%;border-collapse:collapse;font-size:13px;}
  table.fluids thead th{text-align:left;font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);padding:0 12px 8px;border-bottom:1.5px solid var(--ink);}
  table.fluids thead th.num{text-align:right;}
  table.fluids tbody td{padding:11px 12px;border-bottom:1px solid var(--hair2);vertical-align:top;}
  table.fluids tbody tr:last-child td{border-bottom:0;}
  .sys{font-weight:800;color:var(--ink);}
  .prod{color:var(--steel);font-size:12px;}
  .stockno{font-family:var(--mono);font-size:10.5px;color:var(--faint);letter-spacing:.02em;margin-top:3px;}
  .stockno b{color:var(--amsoil-brand);font-weight:700;letter-spacing:.03em;}
  .num{text-align:right;font-family:var(--mono);white-space:nowrap;}
  .num .cap{font-weight:700;color:var(--ink);}
  .intv .t{font-weight:700;color:var(--amsoil-deep);}
  .intv .f{display:block;font-size:11px;color:var(--faint);}
  .order{display:flex;gap:22px;align-items:center;margin:24px 0 6px;background:#FBFAF7;border:1px solid var(--hair);border-radius:14px;padding:20px 22px;}
  .qr{flex:0 0 132px;width:132px;height:132px;border:1px solid var(--hair);border-radius:10px;background:#fff;padding:8px;display:block;}
  .qr svg{width:100%;height:auto;display:block;}
  .order .pitch{flex:1;}
  .order .pitch h3{margin:0 0 6px;font-size:17px;font-weight:800;}
  .order .pitch p{margin:0 0 10px;font-size:13px;color:var(--steel);}
  .order .save{display:inline-block;background:var(--ember-tint);color:var(--amsoil-deep);font-weight:800;font-size:12px;padding:4px 10px;border-radius:20px;letter-spacing:.02em;}
  .order .url{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:10px;word-break:break-all;}
  .ref-fine{padding:16px 52px 30px;border-top:1px solid var(--hair2);font-family:var(--mono);font-size:9.5px;line-height:1.7;color:var(--faint);text-align:center;}
  @media (max-width:560px){
    .pad{ padding:30px 24px; }
    h1{ font-size:30px; }
    .head{ flex-direction:column; }
    .doc-id{ text-align:left; }
    .row{ grid-template-columns:120px 1fr; }
    .foot{ flex-direction:column; align-items:stretch; }
    .fine{ padding:18px 24px 26px; }
    .ref .pad{padding:30px 24px;}
    .ref-head{flex-direction:column;}
    .order{flex-direction:column;text-align:center;}
    .qr{margin:0 auto;}
    .ref-fine{padding:18px 24px 26px;}
  }
  @media print{
    body{ background:#fff; padding:0; }
    .cert{ box-shadow:none; border:none; max-width:none; margin:0; }
    .ref{page-break-before:always;}
  }
</style>
</head>
<body>
  <div class="cert">
    <div class="measure"></div>
    <div class="pad">
      <div class="head">
        <div>
          <div class="brand-lockup">
            <svg class="fox-icon" viewBox="3.879 5.098 40.002 39.316" xmlns="http://www.w3.org/2000/svg">
              <path d="M23.881,44.414L3.879,29.408l5.022-7.53V5.098L19.837,18.77h8.094L38.86,5.098v16.78l5.021,7.53L23.881,44.414z M7.037,28.869l16.844,12.638l16.85-12.638l-4.189-6.287V11.726l-7.5,9.36H18.72l-7.493-9.36v10.857L7.037,28.869z"/>
            </svg>
            <div class="brand-mark">Tuned Yota</div>
          </div>
          <div class="brand-sub">Authorized OTT &middot; Overland Tailor Tuning Installer</div>
        </div>
        <div class="doc-id">
          <div><span class="k">CERT&nbsp;NO&nbsp;</span><span class="v">${esc(certNo || "")}</span></div>
          <div><span class="k">ISSUED&nbsp;&nbsp;&nbsp;</span><span class="v">${esc(issueDate || "")}</span></div>
          <div><span class="k">STATUS&nbsp;&nbsp;</span><span class="v" style="color:var(--ember);">VERIFIED</span></div>
        </div>
      </div>
      <h1><span class="thin">Certificate of</span> Calibration</h1>
      <div class="title-rule"></div>
      <p class="attest">
        This certifies that the vehicle below received a professional ECU
        calibration performed by Tuned&nbsp;Yota, an authorized Overland&nbsp;Tailor&nbsp;Tuning
        installer. The calibration was written, road-verified,
        and confirmed for daily operation. Retain this record with the
        vehicle&rsquo;s documentation — it confirms the work performed for
        <strong>${esc(name || "your customer")}</strong>.
      </p>
      <div class="readout">
        <div class="readout-h">
          <span>// Calibration Record</span>
          <span class="live">&#9679; CONFIRMED</span>
        </div>
        <div class="row">
          <div class="label">Owner</div>
          <div class="value">${esc(name || "")}</div>
        </div>
        <div class="row">
          <div class="label">Vehicle</div>
          <div class="value">${esc(vehicleDisplay)}</div>
        </div>
        <div class="row">
          <div class="label">VIN</div>
          <div class="value">${esc(String(vin || "").toUpperCase()) || "&mdash;"}</div>
        </div>
        <div class="row">
          <div class="label">OTT Calibration</div>
          <div class="value hot">${esc(calibration) || "—"}</div>
        </div>
        <div class="row">
          <div class="label">Installer</div>
          <div class="value">${installerLine}</div>
        </div>
        <div class="row">
          <div class="label">Date Calibrated</div>
          <div class="value">${longDate(calibrationDate)}</div>
        </div>
      </div>
      <div class="foot">
        <div class="stamp">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <path id="topArc" d="M 26 100 A 74 74 0 0 1 174 100" />
              <path id="botArc" d="M 18 100 A 82 82 0 0 0 182 100" />
            </defs>
            <circle class="ring ring-outer" cx="100" cy="100" r="94"/>
            <circle class="ring ring-inner" cx="100" cy="100" r="62"/>
            <text class="curve-text">
              <textPath href="#topArc" startOffset="50%" text-anchor="middle">
                AUTHORIZED OTT INSTALLER
              </textPath>
            </text>
            <text class="curve-text">
              <textPath href="#botArc" startOffset="50%" text-anchor="middle">
                CALIBRATION VERIFIED
              </textPath>
            </text>
            <polygon class="star" points="20,93 22,98.5 28,99 23.5,102.5 25,108 20,104.5 15,108 16.5,102.5 12,99 18,98.5"/>
            <polygon class="star" points="180,93 182,98.5 188,99 183.5,102.5 185,108 180,104.5 175,108 176.5,102.5 172,99 178,98.5"/>
            <g class="fox-mark" transform="translate(100,98) scale(2.5) translate(-23.88,-24.756)">
              <path d="M23.881,44.414L3.879,29.408l5.022-7.53V5.098L19.837,18.77h8.094L38.86,5.098v16.78l5.021,7.53L23.881,44.414z M7.037,28.869l16.844,12.638l16.85-12.638l-4.189-6.287V11.726l-7.5,9.36H18.72l-7.493-9.36v10.857L7.037,28.869z"/>
            </g>
          </svg>
        </div>
      </div>
    </div>
    <div class="fine">
      <span>tunedyota.com &middot; Toyota &amp; Lexus performance calibration</span>
    </div>
  </div>
${amsoil ? amsoilPage(amsoil, vehicleDisplay) : ""}
</body>
</html>`;
  return { subject, html };
}
module.exports = { buildCertificate, certSerial, CAL_OPTIONS };

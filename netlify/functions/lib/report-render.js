function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function bar(pct) { const n = Math.round(pct / 100 * 12); return "▓".repeat(n) + "░".repeat(12 - n); }
function sign(n) { return (n > 0 ? "+" : "") + n; }

function renderSlack(r) {
  const ro = r.rollup;
  const lines = [];
  lines.push(`*Tuned Yota — Submissions Digest* (${r.generatedFor.monthLabel}, week of ${r.generatedFor.now.slice(0, 10)})`);
  lines.push(`MTD submissions: *${ro.mtdTotal}* (Δwk ${sign(ro.deltaVsPriorWeek)}, Δmo ${sign(ro.deltaVsLastMonth)}) · Slots ${ro.slotsFilled}/${ro.totalCapacity} · Won ${ro.won} / Lost ${ro.lost} / Open ${ro.open} (${ro.conversionPct}% conv)`);
  for (const e of r.events) {
    lines.push(`• ${e.city} ${e.label} [${bar(e.fillPct)}] ${e.booked}/${e.capacity} (${e.fillPct}%) ${e.past ? "past" : e.daysUntil + "d"} ${e.pace.toUpperCase()}${e.waitlist ? ` · wl ${e.waitlist}` : ""}${e.newThisWeek ? ` · +${e.newThisWeek} wk` : ""}`);
  }
  if (r.actionItems.length) { lines.push("*Action items:*"); for (const a of r.actionItems.slice(0, 5)) lines.push(`  – ${a}`); }
  lines.push(`Contacts on file: ${r.contacts.length}${r.contactsEmailFailed ? " (CSV email failed — domain pending)" : " (full report + contacts.csv emailed)"}`);
  return lines.join("\n");
}

function table(rows) { return `<table style="border-collapse:collapse;font-size:14px;margin:6px 0">${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:3px 12px 3px 0">${c}</td>`).join("")}</tr>`).join("")}</table>`; }
function h2(t) { return `<h2 style="font-family:Arial;color:#5B4B42;margin:18px 0 4px">${t}</h2>`; }

function renderEmailHtml(r) {
  const ro = r.rollup;
  let html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">`;
  html += `<h1 style="color:#3A2E26">Tuned Yota — Submissions Digest</h1>`;
  html += `<p style="color:#7c8472">${esc(r.generatedFor.monthLabel)} · week of ${esc(r.generatedFor.now.slice(0, 10))}</p>`;
  html += h2("Month-to-date");
  html += table([
    ["Submissions", `${ro.mtdTotal} (Δwk ${sign(ro.deltaVsPriorWeek)}, Δmo ${sign(ro.deltaVsLastMonth)})`],
    ["Slots filled", `${ro.slotsFilled} / ${ro.totalCapacity}`],
    ["Won / Lost / Open", `${ro.won} / ${ro.lost} / ${ro.open} (${ro.conversionPct}% conversion)`],
    ["Avg days to calibration", ro.avgDaysToCalibration == null ? "—" : String(ro.avgDaysToCalibration)],
  ]);
  if (r.priorMonthClose) html += `<p><strong>${esc(r.priorMonthClose.monthLabel)} final:</strong> ${r.priorMonthClose.total} submissions · Won ${r.priorMonthClose.won} / Lost ${r.priorMonthClose.lost}</p>`;
  html += h2("Events");
  for (const e of r.events) {
    html += `<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;margin:8px 0">`;
    html += `<strong>${esc(e.city)}, ${esc(e.state)} · ${esc(e.label)} · ${esc(e.installer)}</strong> — ${e.past ? "past" : e.daysUntil + " days"} · <strong>${esc(e.pace)}</strong><br>`;
    html += `Fill ${e.booked}/${e.capacity} (${e.fillPct}%) · ${e.open} open · +${e.newThisWeek} this week · waitlist ${e.waitlist}<br>`;
    html += `Post-event: Completed ${e.statusBreakdown.completed} · No-show ${e.statusBreakdown.noshow} · Cancelled ${e.statusBreakdown.cancelled}<br>`;
    html += `Vehicles: ${esc(e.vehicles.map((v) => `${v.count} ${v.name}`).join(" · ") || "—")} · Top source: ${esc(e.topSource || "—")}`;
    html += `</div>`;
  }
  html += h2("Closed this period");
  html += r.closedRoster.length ? table(r.closedRoster.map((c) => [esc(c.name), esc(c.installer), esc(c.calibrationDate), esc(c.vehicle)])) : "<p>—</p>";
  html += h2("By market / installer / vehicle");
  html += table([
    ["Markets", esc(r.byMarket.map((x) => `${x.name} (${x.count})`).join(" · "))],
    ["Installers", esc(r.byInstaller.map((x) => `${x.name} (${x.count})`).join(" · "))],
    ["Vehicles", esc(r.byVehicle.map((x) => `${x.name} (${x.count})`).join(" · "))],
  ]);
  html += h2("Latent demand");
  html += r.latentDemand.length ? table(r.latentDemand.map((x) => [esc(x.city), `${x.count} waiting`])) : "<p>—</p>";
  html += h2("Action items");
  html += r.actionItems.length ? `<ul>${r.actionItems.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "<p>None 🎉</p>";
  html += `<p style="color:#7c8472;margin-top:18px">Contacts attached: contacts.csv (${r.contacts.length} rows).</p>`;
  html += `</div>`;
  return html;
}

function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function renderContactsCsv(r) {
  const head = ["Created Date", "Name", "Phone", "Email", "City", "State", "Vehicle", "Goals", "Source", "UTM Source", "UTM Medium", "UTM Campaign", "Installer", "Outcome", "Calibration Date"];
  const lines = [head.join(",")];
  for (const c of r.contacts) {
    lines.push([c.createdDate, c.name, c.phone, c.email, c.city, c.state, c.vehicle, c.goals, c.source, c.utmSource, c.utmMedium, c.utmCampaign, c.installer, c.outcome, c.calibrationDate].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

module.exports = { renderSlack, renderEmailHtml, renderContactsCsv };

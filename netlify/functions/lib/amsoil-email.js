// netlify/functions/lib/amsoil-email.js
// Pure builder for the 3-day post-tune AMSOIL follow-up email. Email-client-safe
// HTML: inline styles, absolute image URL, no <style>/SVG. Consumes a resolveFluids()
// result (or null). No I/O.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const LOGO = "https://tunedyota.com/images/amsoil/amsoil-logo.png";
const GARAGE = "https://tunedyota.com/amsoil-garage";
// Links route through the /amsoil-go tracker (source=email, per-customer via c=<id>),
// which logs the click then 302s to amsoil.com with the dealer ?zo= so the 30-day
// referral cookie still sets on landing. Absolute URL — email clients need it.
const TRACK = "https://tunedyota.com/.netlify/functions/amsoil-go";
function trackUrl(to, bookingId) {
  return TRACK + "?to=" + to + "&s=email" + (bookingId ? "&c=" + encodeURIComponent(bookingId) : "");
}

function firstName(name) { return name ? esc(String(name).trim().split(/\s+/)[0]) : "there"; }

function buildAmsoilEmail({ name, vehicle, modelYear, fluids, bookingId, accountUrl } = {}) {
  const hasFluids = !!(fluids && fluids.systems && fluids.systems.length);
  const veh = esc(fluids && fluids.model
    ? (fluids.make + " " + fluids.model + (fluids.engine ? " " + fluids.engine : ""))
    : (vehicle || "your vehicle"));
  // Primary CTA → tracked dealer-attributed AMSOIL shop; PC CTA → tracked registration.
  const url = trackUrl("shop", bookingId);
  const pcUrl = trackUrl("pc", bookingId);
  const subject = `Keep your ${fluids && fluids.model ? esc(fluids.model) : "tuned Toyota"} running strong - your AMSOIL fluids`;
  const th = 'padding:6px 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a8f94;';
  const td = 'padding:8px 10px;border-bottom:1px solid #e7e3da;';
  const rows = hasFluids ? fluids.systems.map(function (s) {
    return `<tr>
      <td style="${td}font-weight:700;color:#191c1e;">${esc(s.system)}</td>
      <td style="${td}color:#5b6066;">${esc(s.product)}${s.stockNo ? ` <span style="color:#ed1c24;font-weight:700;">(${esc(s.stockNo)})</span>` : ""}</td>
      <td style="${td}color:#191c1e;white-space:nowrap;">${esc(s.capacity)} ${esc(s.unit)}</td>
      <td style="${td}color:#b3141b;font-weight:700;white-space:nowrap;">${esc(s.tunedInterval)}</td>
    </tr>`;
  }).join("") : "";
  const table = hasFluids ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><th align="left" style="${th}">System</th><th align="left" style="${th}">AMSOIL product</th><th align="left" style="${th}">Capacity</th><th align="left" style="${th}">Interval</th></tr>
    ${rows}</table>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f2ed;">
  <div style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#191c1e;">
    <div style="padding:24px 28px;border-bottom:3px solid #ed1c24;text-align:center;">
      <img src="${LOGO}" alt="AMSOIL" width="200" style="display:inline-block;max-width:200px;height:auto;">
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:16px;margin:0 0 12px;">Hi ${firstName(name)},</p>
      <p style="font-size:15px;line-height:1.5;color:#5b6066;margin:0 0 8px;">Your ${veh} is dialed in. A tuned truck asks more of its fluids &mdash; here are the exact <strong>AMSOIL</strong> synthetic fluids, capacities, and severe-service intervals for your vehicle, from Tuned&nbsp;Yota, your Authorized AMSOIL Dealer.</p>
      ${table}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${url}" style="display:inline-block;background:#191c1e;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:8px;">Shop your fluids &amp; save up to 25% &#9658;</a>
      </div>
      <p style="font-size:13px;color:#8a8f94;text-align:center;margin:8px 0 0;"><a href="${pcUrl}" style="color:#8a8f94;text-decoration:underline;">Become a Preferred Customer under Tuned Yota</a> and save up to 25% for life on every future order.</p>
      <p style="font-size:13px;color:#8a8f94;text-align:center;margin:8px 0 0;"><a href="${accountUrl || "https://tunedyota.com/account"}" style="color:#8a8f94;text-decoration:underline;">View your certificates &amp; AMSOIL garage</a></p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #e7e3da;font-size:11px;color:#8a8f94;line-height:1.5;">
      You&rsquo;re receiving this because Tuned Yota tuned your ${veh}. Reply <strong>UNSUBSCRIBE</strong> to stop AMSOIL emails.<br>
      Tuned Yota &middot; Authorized AMSOIL Dealer &middot; tunedyota.com/amsoil-garage
    </div>
  </div></body></html>`;
  const text = `Hi ${name ? String(name).trim().split(/\s+/)[0] : "there"},\n\n` +
    `Your ${fluids && fluids.model ? fluids.make + " " + fluids.model : "tuned vehicle"} is dialed in. ` +
    `Here are the exact AMSOIL synthetic fluids for your vehicle - shop and save up to 25% as a Preferred Customer: ${url}\n\n` +
    `Reply UNSUBSCRIBE to stop AMSOIL emails.\nTuned Yota - Authorized AMSOIL Dealer`;
  return { subject, html, text };
}
module.exports = { buildAmsoilEmail };

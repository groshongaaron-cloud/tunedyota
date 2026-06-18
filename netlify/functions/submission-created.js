// Netlify event function: fires automatically after a verified (non-spam)
// form submission. Routes tune-finder leads to the assigned installer and
// sends a customer auto-reply via Resend.
const { keyToInstaller } = require("./lib/routing.js");
const { buildInstallerEmail, buildCustomerEmail } = require("./lib/templates.js");
const { sendEmail } = require("./lib/resend.js");

// Sender must be on the Resend-verified domain (send.tunedyota.events).
// The mailbox (events@) is arbitrary — Resend sends from it without an inbox.
// Replies still route to the real info@ inbox via replyTo/OWNER below.
const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function processSubmission(payload, deps) {
  const { sendEmail: send, apiKey, log = console } = deps;
  if (!payload || payload.form_name !== "tune-lead") return { skipped: true };

  const d = payload.data || {};
  const inst = keyToInstaller(d.installer_key);

  if (!apiKey) {
    log.warn("RESEND_API_KEY unset — relying on Netlify backstop notification");
    return { sent: 0, reason: "no-api-key" };
  }

  let sent = 0;

  // 1. Installer notification (CC owner unless the installer already is owner).
  try {
    const m = buildInstallerEmail(d, inst);
    await send({
      fetchImpl: deps.fetchImpl, apiKey, from: FROM,
      to: inst.email,
      cc: inst.email === OWNER ? undefined : OWNER,
      replyTo: d.email || undefined,
      subject: m.subject, html: m.html, text: m.text,
    });
    sent++;
  } catch (e) {
    log.error("installer email failed:", e.message);
  }

  // 2. Customer auto-reply (only if we have their email).
  if (d.email) {
    try {
      const m = buildCustomerEmail(d, inst);
      await send({
        fetchImpl: deps.fetchImpl, apiKey, from: FROM,
        to: d.email, replyTo: OWNER,
        subject: m.subject, html: m.html, text: m.text,
      });
      sent++;
    } catch (e) {
      log.error("customer email failed:", e.message);
    }
  }

  return { sent };
}

async function handler(event) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 200, body: "ignored: bad json" };
  }
  await processSubmission(body.payload, {
    sendEmail,
    apiKey: process.env.RESEND_API_KEY,
  });
  return { statusCode: 200, body: "ok" };
}

module.exports = { handler, processSubmission };

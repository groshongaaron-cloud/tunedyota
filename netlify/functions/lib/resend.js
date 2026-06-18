// Thin wrapper over the Resend REST API. fetchImpl is injectable for tests;
// defaults to the global fetch (Node 18+).
async function sendEmail({
  fetchImpl = fetch, apiKey, from, to, cc, replyTo, subject, html, text, attachments,
}) {
  const body = {
    from,
    to: [].concat(to),
    subject, html, text,
  };
  if (cc) body.cc = [].concat(cc);
  if (replyTo) body.reply_to = [].concat(replyTo);
  if (attachments && attachments.length) body.attachments = attachments;

  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  return res.json();
}

module.exports = { sendEmail };

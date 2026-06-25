// Resend-independent owner alert: POSTs a plain Slack message. Never throws —
// alerting must not break the caller. Returns {ok}|{skipped}|{ok:false,error}.
async function notifyOwner({ fetchImpl = fetch, webhookUrl, text, log = console }) {
  if (!webhookUrl) {
    if (log.warn) log.warn("SLACK_WEBHOOK_URL unset — alert skipped:", text);
    return { skipped: true };
  }
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { ok: !!res.ok };
  } catch (e) {
    if (log.error) log.error("slack alert failed:", e.message);
    return { ok: false, error: e.message };
  }
}
module.exports = { notifyOwner };

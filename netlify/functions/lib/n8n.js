// Fire-and-forget ping to an n8n webhook. Additive automation only — this must
// NEVER break the booking flow. No-op until N8N_BOOKING_WEBHOOK_URL is set, so it
// ships dark and the owner flips it on by setting the env var. Swallows every error.
async function pingN8n({ fetchImpl = fetch, url, payload, log = console }) {
  if (!url) return { skipped: true };       // no-op until the env var is set
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: !!res.ok };
  } catch (e) {
    if (log.error) log.error("n8n ping failed:", e.message);
    return { ok: false, error: e.message };  // swallow — never break booking
  }
}
module.exports = { pingN8n };

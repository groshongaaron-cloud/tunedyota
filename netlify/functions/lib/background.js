// Hand slow, best-effort work (emails, webhook pings) to a Netlify *background*
// function over HTTP, so it can neither block nor be killed alongside the
// synchronous request that scheduled it. Background functions ACK with 202
// immediately, so this resolves fast regardless of the target's own cold start.
// Never throws — scheduling a side job must not break the caller's response.
async function triggerBackground({ fetchImpl = fetch, env = process.env, name, payload, log = console }) {
  const base = env.URL || env.DEPLOY_PRIME_URL || env.DEPLOY_URL;
  if (!base) {
    if (log.error) log.error(`triggerBackground: no site URL env set — ${name} not invoked`);
    return { skipped: true };
  }
  const url = `${base.replace(/\/$/, "")}/.netlify/functions/${name}`;
  try {
    const headers = { "Content-Type": "application/json" };
    // Optional shared secret so the public background endpoint only acts on
    // jobs we scheduled. Enforced by the target only when the env var is set.
    if (env.INTERNAL_TASK_SECRET) headers["x-ty-task"] = env.INTERNAL_TASK_SECRET;
    const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return { ok: !!(res && (res.ok || res.status === 202)) };
  } catch (e) {
    if (log.error) log.error(`triggerBackground ${name} failed:`, e.message);
    return { ok: false, error: e.message };
  }
}
module.exports = { triggerBackground };

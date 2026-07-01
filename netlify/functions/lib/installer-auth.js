// netlify/functions/lib/installer-auth.js
// Maps an x-installer-token header to an installer key using the INSTALLER_TOKENS
// JSON env map {"aaron":"…","noah":"…","cody":"…"}. Fail-closed.
function resolveInstaller(headers, env) {
  const raw = env && env.INSTALLER_TOKENS;
  if (!raw) return null;
  let map;
  try { map = JSON.parse(raw); } catch { return null; }
  const got = (headers["x-installer-token"] || headers["X-Installer-Token"] || "").toString();
  if (!got) return null;
  for (const [key, secret] of Object.entries(map)) {
    if (secret && got === secret) return key;
  }
  return null;
}
module.exports = { resolveInstaller };

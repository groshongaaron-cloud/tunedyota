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

// An admin installer sees + acts across ALL installers (roster, walk-ins, close-out).
// Membership is env-driven (INSTALLER_ADMINS, comma-separated keys) so onboarding a
// new admin is a config change, not a code change. Fail-closed when unset.
function isAdmin(key, env) {
  if (!key) return false;
  const raw = (env && env.INSTALLER_ADMINS) || "";
  const admins = String(raw).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(String(key).toLowerCase());
}
module.exports = { resolveInstaller, isAdmin };

// Maps a market's installer key (MARKETS[i].inst in the tune finder) to the
// person who should receive the lead. Mirrors INSTALLERS in
// site/find-your-exact-tune.html. Keep in sync if installer contacts change.
const INSTALLERS = {
  aaron: { key: "aaron", name: "Aaron Groshong", email: "info@tunedyota.com", phone: "(612) 406-7117", region: "Minnesota, Iowa, Fargo, Eau Claire & Madison" },
  noah:  { key: "noah",  name: "Noah Kreis",     email: "noah@tunedyota.com", phone: "(920) 860-7050", region: "Wisconsin (except Eau Claire & Madison)" },
  cody:  { key: "cody",  name: "Cody Star",      email: "cody@tunedyota.com", phone: "(605) 214-1335", region: "Sioux Falls, Rapid City & Omaha" },
};

const FALLBACK_KEY = "aaron";

function keyToInstaller(key) {
  return INSTALLERS[key] || INSTALLERS[FALLBACK_KEY];
}

// Normalize an Airtable Installer field value to a canonical key. The live base's
// Installer column is a multi-select whose options include both canonical keys
// ("noah") and legacy long labels ("Noah - Milwaukee, Green Bay, Kohler, "), so a
// value can arrive as a string or array of either form. Returns "" when nothing
// matches, so callers keep their own fallback semantics.
function normalizeInstallerKey(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!s) return "";
  if (INSTALLERS[s]) return s;
  const first = (s.match(/^([a-z]+)/) || [])[1];
  return INSTALLERS[first] ? first : "";
}

// Where to SMS an installer, and which inbound number identifies them. The
// public INSTALLERS phone can be the Twilio line itself (it forwards), so
// INSTALLER_SMS_NUMBERS ({"key":"+1..."}) overrides with the real cell.
function parseSmsOverrides(env) {
  try { const v = JSON.parse((env && env.INSTALLER_SMS_NUMBERS) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch { return {}; }
}
function smsNumberFor(key, env) {
  const over = parseSmsOverrides(env)[key];
  if (over) return String(over);
  const digits = String((INSTALLERS[key] || {}).phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : String((INSTALLERS[key] || {}).phone || "");
}

module.exports = { INSTALLERS, FALLBACK_KEY, keyToInstaller, normalizeInstallerKey, parseSmsOverrides, smsNumberFor };

// Maps a market's installer key (MARKETS[i].inst in the tune finder) to the
// person who should receive the lead. Mirrors INSTALLERS in
// site/find-your-exact-tune.html. Keep in sync if installer contacts change.
const INSTALLERS = {
  aaron: { key: "aaron", name: "Aaron Groshong", email: "info@tunedyota.com", phone: "(612) 406-7117" },
  noah:  { key: "noah",  name: "Noah Kreis",     email: "noah@tunedyota.com", phone: "(920) 860-7050" },
  cody:  { key: "cody",  name: "Cody Star",      email: "cody@tunedyota.com", phone: "(605) 214-1335" },
};

const FALLBACK_KEY = "aaron";

function keyToInstaller(key) {
  return INSTALLERS[key] || INSTALLERS[FALLBACK_KEY];
}

module.exports = { INSTALLERS, FALLBACK_KEY, keyToInstaller };

// netlify/functions/lib/consent.js
// A2P marketing-consent disclosure shown in the close-out signature overlay.
// The stored `Consent Version` on the client record points at this exact copy —
// NEVER edit CONSENT_TEXT without bumping CONSENT_VERSION (tests enforce the
// console shows it verbatim). Decline never blocks completion or the cert.
const CONSENT_VERSION = "a2p-2026-08";
const CONSENT_TEXT = "I agree to receive service updates and occasional parts & maintenance offers for my vehicle from Tuned Yota by text message and email. Message frequency varies. Message & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase or service. Terms & privacy: tunedyota.com";
module.exports = { CONSENT_VERSION, CONSENT_TEXT };

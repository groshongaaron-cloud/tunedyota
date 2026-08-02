// netlify/functions/lib/cors.js
// Shared CORS policy for endpoints the native app calls cross-origin.
// WebView origins: capacitor://localhost (iOS), https://localhost (Android —
// Capacitor's default androidScheme since v4; http://localhost kept for any
// build that overrides it). Unknown origins fall back to the site so a CORS
// header is always present and never reflects an arbitrary Origin.
const ALLOWED_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost",
  "https://tunedyota.com", "https://www.tunedyota.com"];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://tunedyota.com",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-token",
    "Access-Control-Expose-Headers": "x-renewed-token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

module.exports = { corsHeaders, ALLOWED_ORIGINS };

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

// Wrap a handler so it speaks CORS for the app origins: answers preflight
// before auth/method checks, and merges CORS headers into every response
// (handler-set headers win on conflict).
function withCors(handler) {
  return async function (event, ...rest) {
    const headers = corsHeaders((((event || {}).headers || {}).origin || "").toString());
    if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
    const res = await handler(event, ...rest);
    if (!res || typeof res !== "object") return res;
    return { ...res, headers: { ...headers, ...(res.headers || {}) } };
  };
}

module.exports = { corsHeaders, withCors, ALLOWED_ORIGINS };

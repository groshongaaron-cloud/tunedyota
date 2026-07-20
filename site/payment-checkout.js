// site/payment-checkout.js — Elavon Converge Lightbox checkout (pure logic +
// thin DOM glue, testable in Node like amsoil-garage-render.js). DORMANT until
// the server reports payments configured: the pricing page keeps its
// reservation flow, and this module only activates when create-payment-session
// stops returning payments-not-configured. Card entry happens entirely inside
// Converge's modal — no card data ever touches tunedyota.com.
(function (root) {
  var SESSION_FN = "/.netlify/functions/create-payment-session";
  var SCRIPTS = {
    prod: "https://www.convergepay.com/hosted-payments/PayWithConverge.js",
    demo: "https://demo.convergepay.com/hosted-payments/PayWithConverge.js"
  };

  function scriptUrlFor(session) { return session && session.demo ? SCRIPTS.demo : SCRIPTS.prod; }

  // POST the SKU (never a price) for a session token. Resolves the parsed JSON
  // whatever the outcome; callers branch on .status / .error.
  function requestSession(sku, fetchImpl) {
    return (fetchImpl || fetch)(SESSION_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku })
    }).then(function (r) { return r.json(); });
  }

  // Open the Converge Lightbox for a minted session. deps.loadScript / deps.pay
  // are injectable for tests; in the browser they default to a script tag +
  // window.PayWithConverge.
  function openLightbox(session, callbacks, deps) {
    deps = deps || {};
    var load = deps.loadScript || function (url) {
      return new Promise(function (resolve, reject) {
        if (root.PayWithConverge) return resolve();
        var s = document.createElement("script");
        s.src = url; s.onload = resolve; s.onerror = function () { reject(new Error("PayWithConverge load failed")); };
        document.head.appendChild(s);
      });
    };
    return load(scriptUrlFor(session)).then(function () {
      var pay = deps.pay || root.PayWithConverge;
      pay.open({ ssl_txn_auth_token: session.token }, callbacks);
    });
  }

  // Full flow: token -> modal. onUnavailable fires for payments-not-configured
  // (the page should quietly keep its reservation flow).
  function startCheckout(sku, handlers, deps) {
    deps = deps || {}; handlers = handlers || {};
    return requestSession(sku, deps.fetchImpl).then(function (session) {
      if (session.status !== "ok") {
        if (session.error === "payments-not-configured") { if (handlers.onUnavailable) handlers.onUnavailable(); }
        else if (handlers.onError) handlers.onError(session.error || "unknown");
        return session;
      }
      return openLightbox(session, {
        onApproval: handlers.onApproval || function () {},
        onDeclined: handlers.onDeclined || function () {},
        onCancelled: handlers.onCancelled || function () {},
        onError: handlers.onError || function () {}
      }, deps).then(function () { return session; });
    });
  }

  var api = { scriptUrlFor: scriptUrlFor, requestSession: requestSession, openLightbox: openLightbox, startCheckout: startCheckout, SESSION_FN: SESSION_FN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.TYPayment = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

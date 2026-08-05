// site/payment-checkout.js — Elavon Payment Gateway (EPG) Lightbox checkout
// (pure logic + thin DOM glue, testable in Node like amsoil-garage-render.js).
// DORMANT until the server reports payments configured: the pricing page keeps
// its reservation flow, and this module only activates when
// create-payment-session stops returning payments-not-configured. Card entry
// happens entirely inside Elavon's modal — no card data ever touches
// tunedyota.com.
(function (root) {
  var SESSION_FN = "/.netlify/functions/create-payment-session";
  var RECORD_FN = "/.netlify/functions/record-payment";
  // client/library.js defines window.ElavonLightbox; client/index.js is the
  // HPP's own bundle and does NOT (docs show both — library.js is correct,
  // verified against the sandbox 2026-08-04).
  var SCRIPTS = {
    prod: "https://hpp.na.elavonpayments.com/client/library.js",
    sandbox: "https://hpp.sandbox.elavonpayments.com/client/library.js"
  };

  function scriptUrlFor(session) { return session && session.sandbox ? SCRIPTS.sandbox : SCRIPTS.prod; }

  // POST the SKU (never a price) for a payment session. Resolves the parsed
  // JSON whatever the outcome; callers branch on .status / .error.
  function requestSession(sku, fetchImpl) {
    return (fetchImpl || fetch)(SESSION_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku })
    }).then(function (r) { return r.json(); });
  }

  // Open the EPG Lightbox for a created session. deps.loadScript / deps.lightbox
  // are injectable for tests; in the browser they default to a script tag +
  // window.ElavonLightbox. Message mapping: transactionCreated+isAuthorized ->
  // onApproval, transactionCreated without -> onDeclined, closeOverlay with no
  // transaction yet -> onCancelled, error -> onError. defaultAction is always
  // called so the lightbox keeps its built-in behavior.
  function openLightbox(session, callbacks, deps) {
    deps = deps || {}; callbacks = callbacks || {};
    var load = deps.loadScript || function (url) {
      return new Promise(function (resolve, reject) {
        if (root.ElavonLightbox) return resolve();
        var s = document.createElement("script");
        s.src = url; s.onload = resolve; s.onerror = function () { reject(new Error("ElavonLightbox load failed")); };
        document.head.appendChild(s);
      });
    };
    var noop = function () {};
    var onApproval = callbacks.onApproval || noop;
    var onDeclined = callbacks.onDeclined || noop;
    var onCancelled = callbacks.onCancelled || noop;
    var onError = callbacks.onError || noop;
    return load(scriptUrlFor(session)).then(function () {
      var Lightbox = deps.lightbox || root.ElavonLightbox;
      var MT = Lightbox.MessageTypes || {};
      var transacted = false;
      var box = new Lightbox({
        sessionId: session.sessionId,
        onReady: function (error) {
          if (error) return onError("lightbox-load-failed");
          box.show();
        },
        messageHandler: function (message, defaultAction) {
          switch (message.type) {
            case MT.transactionCreated:
              transacted = true;
              // the live library carries isAuthorized inside transaction; the
              // docs' quickstart shows it top-level — accept either.
              var ok = message.isAuthorized === true ||
                !!(message.transaction && message.transaction.isAuthorized === true);
              var result = { sessionId: message.sessionId, transaction: message.transaction, authorized: ok };
              if (ok) onApproval(result); else onDeclined(result);
              break;
            case MT.closeOverlay:
              if (!transacted) onCancelled();
              break;
            case MT.error:
              onError(message.error);
              break;
          }
          if (typeof defaultAction === "function") defaultAction();
        }
      });
      return box;
    });
  }

  // Fire-and-forget: report an approval to the server for Slack alert + lead
  // pipeline. Never throws — the customer already paid; the thank-you UI must
  // render no matter what happens here.
  function reportApproval(sku, approval, fetchImpl) {
    return (fetchImpl || fetch)(RECORD_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku, approval: approval })
    }).then(function (r) { return r.json(); })
      .catch(function () { return { status: "error" }; });
  }

  // Full flow: session -> modal. onUnavailable fires for payments-not-configured
  // (the page should quietly keep its reservation flow).
  function startCheckout(sku, handlers, deps) {
    deps = deps || {}; handlers = handlers || {};
    return requestSession(sku, deps.fetchImpl).then(function (session) {
      if (session.status !== "ok") {
        if (session.error === "payments-not-configured") { if (handlers.onUnavailable) handlers.onUnavailable(); }
        else if (handlers.onError) handlers.onError(session.error || "unknown");
        return session;
      }
      // GA4: begin_checkout when a session mints, purchase_approved on approval.
      // root.gtag is absent in Node tests — both are no-ops there.
      try { if (typeof root.gtag === "function") root.gtag("event", "begin_checkout", { sku: sku }); } catch (e) {}
      var onApproval = handlers.onApproval || function () {};
      return openLightbox(session, {
        onApproval: function (r) {
          try { if (typeof root.gtag === "function") root.gtag("event", "purchase_approved", { sku: sku }); } catch (e) {}
          return onApproval(r);
        },
        onDeclined: handlers.onDeclined || function () {},
        onCancelled: handlers.onCancelled || function () {},
        onError: handlers.onError || function () {}
      }, deps).then(function () { return session; });
    }).catch(function (e) {
      // network / library-load failures reject the chain — surface them instead
      // of leaving the button stuck on "Opening secure checkout…".
      if (handlers.onError) handlers.onError((e && e.message) || "checkout-error");
    });
  }

  var api = { scriptUrlFor: scriptUrlFor, requestSession: requestSession, openLightbox: openLightbox, startCheckout: startCheckout, reportApproval: reportApproval, SESSION_FN: SESSION_FN, RECORD_FN: RECORD_FN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.TYPayment = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

// tests/payment-checkout.test.js — EPG Lightbox checkout client
const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../site/payment-checkout.js");

// Fake ElavonLightbox constructor for tests: captures options, exposes MessageTypes
// like the real library, and lets tests drive onReady / messageHandler.
function fakeLightbox() {
  const state = { shown: 0, opts: null };
  function Ctor(opts) {
    state.opts = opts;
    this.show = () => { state.shown++; };
    this.hide = () => {};
  }
  Ctor.MessageTypes = {
    loaded: "loaded", hostedCardCreated: "hostedCardCreated", closeOverlay: "closeOverlay",
    error: "error", methodSessionCompleted: "methodSessionCompleted",
    sessionCompleted: "sessionCompleted", transactionCreated: "transactionCreated",
  };
  return { Ctor, state };
}

test("scriptUrlFor picks sandbox vs prod lightbox library (library.js, NOT index.js — index.js lacks ElavonLightbox, verified 2026-08-04)", () => {
  assert.equal(P.scriptUrlFor({ sandbox: true }), "https://hpp.sandbox.elavonpayments.com/client/library.js");
  assert.equal(P.scriptUrlFor({ sandbox: false }), "https://hpp.na.elavonpayments.com/client/library.js");
});

test("requestSession posts only the SKU", async () => {
  let got;
  await P.requestSession("01-26-57-107-BL", async (url, opts) => {
    got = { url, opts }; return { json: async () => ({ status: "ok" }) };
  });
  assert.equal(got.url, P.SESSION_FN);
  assert.deepEqual(JSON.parse(got.opts.body), { sku: "01-26-57-107-BL" });
});

test("startCheckout: not-configured -> onUnavailable, lightbox never loads", async () => {
  let unavailable = 0, loaded = 0;
  await P.startCheckout("SKU", { onUnavailable: () => unavailable++ }, {
    fetchImpl: async () => ({ json: async () => ({ status: "error", error: "payments-not-configured" }) }),
    loadScript: async () => loaded++,
  });
  assert.equal(unavailable, 1);
  assert.equal(loaded, 0);
});

test("startCheckout: ok session -> loads script for env, constructs with sessionId, shows on ready", async () => {
  const { Ctor, state } = fakeLightbox();
  let loadedUrl;
  const session = { status: "ok", sessionId: "sess_1", sandbox: true };
  await P.startCheckout("SKU", { onApproval: () => {} }, {
    fetchImpl: async () => ({ json: async () => session }),
    loadScript: async (url) => { loadedUrl = url; },
    lightbox: Ctor,
  });
  assert.match(loadedUrl, /hpp\.sandbox\.elavonpayments\.com/);
  assert.equal(state.opts.sessionId, "sess_1");
  state.opts.onReady(null);
  assert.equal(state.shown, 1);
});

test("lightbox load failure -> onError, never shown", async () => {
  const { Ctor, state } = fakeLightbox();
  let err;
  await P.openLightbox({ sessionId: "s" }, { onError: (e) => { err = e; } }, { loadScript: async () => {}, lightbox: Ctor });
  state.opts.onReady(new Error("blocked"));
  assert.equal(err, "lightbox-load-failed");
  assert.equal(state.shown, 0);
});

test("transactionCreated with transaction.isAuthorized (LIVE library shape, verified sandbox 2026-08-04) -> onApproval", async () => {
  const { Ctor, state } = fakeLightbox();
  let approval, defaulted = 0;
  await P.openLightbox({ sessionId: "sess_1" }, { onApproval: (a) => { approval = a; } }, { loadScript: async () => {}, lightbox: Ctor });
  // the live lightbox puts isAuthorized INSIDE transaction, not top-level
  state.opts.messageHandler(
    { type: "transactionCreated", sessionId: "sess_1", transaction: { id: "txn_9", state: "authorized", isAuthorized: true, total: { amount: "8295.00" } } },
    () => defaulted++);
  assert.equal(approval.sessionId, "sess_1");
  assert.equal(approval.authorized, true);
  assert.equal(approval.transaction.id, "txn_9");
  assert.equal(defaulted, 1);
});

test("transactionCreated with top-level isAuthorized (docs quickstart shape) -> onApproval too", async () => {
  const { Ctor, state } = fakeLightbox();
  let approval;
  await P.openLightbox({ sessionId: "s" }, { onApproval: (a) => { approval = a; } }, { loadScript: async () => {}, lightbox: Ctor });
  state.opts.messageHandler({ type: "transactionCreated", transaction: { id: "t" }, isAuthorized: true }, () => {});
  assert.equal(approval.authorized, true);
});

test("transactionCreated without authorization anywhere -> onDeclined", async () => {
  const { Ctor, state } = fakeLightbox();
  let declined = 0, approved = 0;
  await P.openLightbox({ sessionId: "s" }, { onApproval: () => approved++, onDeclined: () => declined++ }, { loadScript: async () => {}, lightbox: Ctor });
  state.opts.messageHandler({ type: "transactionCreated", transaction: { id: "t", isAuthorized: false } }, () => {});
  assert.equal(declined, 1);
  assert.equal(approved, 0);
});

test("closeOverlay before any transaction -> onCancelled; after a transaction -> not", async () => {
  const { Ctor, state } = fakeLightbox();
  let cancelled = 0;
  await P.openLightbox({ sessionId: "s" }, { onApproval: () => {}, onCancelled: () => cancelled++ }, { loadScript: async () => {}, lightbox: Ctor });
  state.opts.messageHandler({ type: "closeOverlay" }, () => {});
  assert.equal(cancelled, 1);
  state.opts.messageHandler({ type: "transactionCreated", transaction: { id: "t" }, isAuthorized: true }, () => {});
  state.opts.messageHandler({ type: "closeOverlay" }, () => {});
  assert.equal(cancelled, 1, "closeOverlay after a transaction must not read as a cancel");
});

test("error message -> onError with the gateway's error text", async () => {
  const { Ctor, state } = fakeLightbox();
  let err;
  await P.openLightbox({ sessionId: "s" }, { onError: (e) => { err = e; } }, { loadScript: async () => {}, lightbox: Ctor });
  state.opts.messageHandler({ type: "error", error: "session expired" }, () => {});
  assert.equal(err, "session expired");
});

test("reportApproval posts the sku + full approval payload to record-payment", async () => {
  let got;
  await P.reportApproval("01-26-57-107-BL", { sessionId: "sess_1", transaction: { id: "txn_9" } }, async (url, opts) => {
    got = { url, opts }; return { json: async () => ({ status: "ok" }) };
  });
  assert.equal(got.url, P.RECORD_FN);
  assert.deepEqual(JSON.parse(got.opts.body), { sku: "01-26-57-107-BL", approval: { sessionId: "sess_1", transaction: { id: "txn_9" } } });
});

test("reportApproval swallows network failures — the thank-you UI must never break", async () => {
  const out = await P.reportApproval("SKU", { sessionId: "s" }, async () => { throw new Error("offline"); });
  assert.equal(out.status, "error");
});

test("startCheckout: gateway error -> onError with the code", async () => {
  let err;
  await P.startCheckout("SKU", { onError: (e) => { err = e; } }, {
    fetchImpl: async () => ({ json: async () => ({ status: "error", error: "gateway-error" }) }),
  });
  assert.equal(err, "gateway-error");
});

test("startCheckout: script/library load failure routes to onError (never silently stuck)", async () => {
  const session = { status: "ok", sessionId: "sess_1", sandbox: true };
  let err;
  await P.startCheckout("SKU", { onError: (e) => { err = e; } }, {
    fetchImpl: async () => ({ json: async () => session }),
    loadScript: async () => { throw new Error("ElavonLightbox load failed"); },
  });
  assert.match(String(err || ""), /load failed/i);
});

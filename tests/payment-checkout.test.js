// tests/payment-checkout.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../site/payment-checkout.js");

test("scriptUrlFor picks demo vs prod PayWithConverge", () => {
  assert.match(P.scriptUrlFor({ demo: true }), /^https:\/\/demo\.convergepay\.com\//);
  assert.match(P.scriptUrlFor({ demo: false }), /^https:\/\/www\.convergepay\.com\//);
});

test("requestSession posts only the SKU", async () => {
  let got;
  await P.requestSession("01-26-57-107-BL", async (url, opts) => {
    got = { url, opts }; return { json: async () => ({ status: "ok" }) };
  });
  assert.equal(got.url, P.SESSION_FN);
  assert.deepEqual(JSON.parse(got.opts.body), { sku: "01-26-57-107-BL" });
});

test("startCheckout: not-configured -> onUnavailable, modal never opens", async () => {
  let unavailable = 0, opened = 0;
  await P.startCheckout("SKU", { onUnavailable: () => unavailable++ }, {
    fetchImpl: async () => ({ json: async () => ({ status: "error", error: "payments-not-configured" }) }),
    loadScript: async () => opened++,
  });
  assert.equal(unavailable, 1);
  assert.equal(opened, 0);
});

test("startCheckout: ok session -> loads script for env and opens with the token", async () => {
  let loadedUrl, openArgs;
  const session = { status: "ok", token: "TOK", demo: true };
  await P.startCheckout("SKU", { onApproval: () => {} }, {
    fetchImpl: async () => ({ json: async () => session }),
    loadScript: async (url) => { loadedUrl = url; },
    pay: { open: (fields, cbs) => { openArgs = { fields, cbs }; } },
  });
  assert.match(loadedUrl, /demo\.convergepay\.com/);
  assert.equal(openArgs.fields.ssl_txn_auth_token, "TOK");
  assert.equal(typeof openArgs.cbs.onApproval, "function");
});

test("startCheckout: gateway error -> onError with the code", async () => {
  let err;
  await P.startCheckout("SKU", { onError: (e) => { err = e; } }, {
    fetchImpl: async () => ({ json: async () => ({ status: "error", error: "gateway-error" }) }),
  });
  assert.equal(err, "gateway-error");
});

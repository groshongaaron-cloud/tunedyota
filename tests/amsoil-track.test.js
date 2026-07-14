const { test } = require("node:test");
const assert = require("node:assert/strict");
const T = require("../site/amsoil-track.js");

const loc = { pathname: "/amsoil-tundra.html", href: "https://tunedyota.com/amsoil-tundra.html" };

test("relTarget extracts the relative amsoil path and strips an existing zo", () => {
  assert.equal(T.relTarget("https://www.amsoil.com/shop/?zo=30713116", loc), "/shop/");
  assert.equal(T.relTarget("https://www.amsoil.com/p/x-asm/?code=EA15K09-EA&zo=1", loc), "/p/x-asm/?code=EA15K09-EA");
});
test("relTarget ignores non-amsoil links", () => {
  assert.equal(T.relTarget("https://tunedyota.com/faq.html", loc), "");
  assert.equal(T.relTarget("/amsoil-garage.html", loc), "");   // same-site relative, not amsoil.com
  assert.equal(T.relTarget("mailto:info@x.com", loc), "");
});
test("destOf classifies PC vs shop", () => {
  assert.equal(T.destOf("/offers/pc/"), "pc");
  assert.equal(T.destOf("/p/preferred-customer-registration-preg/"), "pc");
  assert.equal(T.destOf("/shop/"), "shop");
});
test("sourceOf derives a page slug", () => {
  assert.equal(T.sourceOf(loc), "page:amsoil-tundra");
  assert.equal(T.sourceOf({ pathname: "/" }), "page:home");
});
test("trackerHref preserves the destination via ?p= and tags the source", () => {
  const h = T.trackerHref("/p/x-asm/?code=EA15K09-EA", loc);
  assert.ok(h.startsWith("/.netlify/functions/amsoil-go?to=shop&s=page%3Aamsoil-tundra&p="));
  assert.ok(decodeURIComponent(h.split("&p=")[1]) === "/p/x-asm/?code=EA15K09-EA");
});

test("instrument rewrites amsoil links in place, leaves others, and is idempotent", () => {
  // tiny DOM stub
  function A(href) { return { _h: href, getAttribute() { return this._h; }, setAttribute(_, v) { this._h = v; } }; }
  const links = [A("https://www.amsoil.com/shop/?zo=30713116"), A("https://tunedyota.com/faq.html"), A("/amsoil-garage.html")];
  const doc = { querySelectorAll: () => links };
  T.instrument(doc, loc);
  assert.ok(links[0].getAttribute().startsWith("/.netlify/functions/amsoil-go?to=shop"));
  assert.equal(links[1].getAttribute(), "https://tunedyota.com/faq.html");   // untouched
  assert.equal(links[2].getAttribute(), "/amsoil-garage.html");              // untouched
  const once = links[0].getAttribute();
  T.instrument(doc, loc);                                                    // second pass
  assert.equal(links[0].getAttribute(), once);                              // idempotent
});

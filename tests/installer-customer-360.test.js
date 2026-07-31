// Static wiring: the customer 360 overlay exists and every surface links into it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("customer view fetches customer-view with installer auth", () => {
  assert.ok(HTML.includes("/.netlify/functions/customer-view?"));
  const fn = HTML.slice(HTML.indexOf("async function openCustomerView"));
  assert.ok(fn.slice(0, 1500).includes("x-installer-token"));
});

test("all four surfaces open the customer view", () => {
  assert.ok(HTML.includes("data-cust "), "booking/lead name anchors");
  assert.ok(HTML.includes('id="chatcust"'), "chat header");
  assert.ok(HTML.includes("data-custcall"), "call rows");
  // rowCard wires all three of its branches (completed / no-show / open).
  assert.equal((HTML.match(/wireCust\(c,b\);/g) || []).length, 3);
});

test("timeline covers bookings, leads, chats, calls", () => {
  const fn = HTML.slice(HTML.indexOf("function renderCustomer"));
  for (const probe of ["d.bookings", "d.leads", "d.chats", "d.calls", "data-custchat", "data-custsig"])
    assert.ok(fn.includes(probe), probe);
});

test("a lead name tap never toggles the card open", () => {
  assert.ok(/ev\.stopPropagation\(\); openCustomerView\(/.test(HTML));
});

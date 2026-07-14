const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildInstallerEmail, buildCustomerEmail } = require("../netlify/functions/lib/templates.js");
const { keyToInstaller } = require("../netlify/functions/lib/routing.js");

const sample = {
  name: "Jane Driver", phone: "(555) 111-2222", email: "jane@example.com",
  market: "Green Bay, WI", installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2024+ Toyota Tacoma 2.4L-T I4", goals: "More power & torque, Towing confidence",
  quote_base: "650", quote_custom: "800", quote_sc: "950",
  message: "Interested in the supercharger path.",
  referrer: "https://instagram.com/", utm_source: "ig", utm_medium: "social", utm_campaign: "tacoma-launch",
};

test("installer email includes contact, vehicle, goals, quote, attribution", () => {
  const m = buildInstallerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tacoma/);
  for (const needle of ["Jane Driver", "(555) 111-2222", "jane@example.com",
       "Green Bay, WI", "2024+ Toyota Tacoma", "More power", "650", "950",
       "supercharger path", "ig", "tacoma-launch", "instagram.com"]) {
    assert.ok(m.text.includes(needle), `text missing: ${needle}`);
    assert.ok(m.html.includes(needle), `html missing: ${needle}`);
  }
});

test("customer email names the assigned installer and phone", () => {
  const m = buildCustomerEmail(sample, keyToInstaller(sample.installer_key));
  assert.match(m.subject, /Tuned Yota/);
  assert.ok(m.text.includes("Noah Kreis"));
  assert.ok(m.text.includes("(920) 860-7050"));
  assert.ok(m.html.includes("Noah Kreis"));
});

test("templates tolerate missing optional fields", () => {
  const bare = { name: "X", phone: "", email: "x@y.com", market: "Not selected",
    installer_key: "", vehicle: "2020-2024 4Runner", goals: "", quote_base: "600",
    quote_custom: "", quote_sc: "", message: "", referrer: "", utm_source: "",
    utm_medium: "", utm_campaign: "" };
  const inst = keyToInstaller(bare.installer_key);
  assert.doesNotThrow(() => buildInstallerEmail(bare, inst));
  assert.doesNotThrow(() => buildCustomerEmail(bare, inst));
});

const tB = require("../netlify/functions/lib/templates.js");

const dB = { name: "Jane Doe", phone: "(612) 406-7117", email: "jane@x.com", vehicle: "2024+ Toyota Tacoma", goals: "Power" };
const instB = { key: "cody", name: "Cody Star", email: "cody@tunedyota.com", phone: "(605) 214-1335" };
const marketB = { city: "Sioux Falls", state: "SD" };
const eventB = { dateISO: "2026-07-12", label: "Jul 12, 2026" };

test("booking customer email names slot + date", () => {
  const m = tB.buildBookingCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(m.subject.toLowerCase().includes("booked"));
  assert.ok(m.text.includes("9:20"));
  assert.ok(m.text.includes("Sioux Falls"));
});
test("booking confirmation includes the venue street address when it's set", () => {
  const ev = { dateISO: "2026-07-25", label: "July 25, 2026", address: "4165 Loberg Avenue, Hermantown, MN 55811" };
  const m = tB.buildBookingCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, ev);
  assert.ok(m.text.includes("4165 Loberg Avenue, Hermantown, MN 55811"), "confirmation text missing address");
  assert.ok(m.html.includes("4165 Loberg Avenue"), "confirmation html missing address");
  assert.ok(!/exact address before your event/i.test(m.text), "should not promise a later address when it's known");
});
test("booking confirmation promises a later address when the venue is TBD", () => {
  const tbd = { dateISO: "2026-09-12", label: "September 12, 2026", address: "To Be Released" };
  const m = tB.buildBookingCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, tbd);
  assert.ok(!/to be released/i.test(m.text), "must never print the raw 'To Be Released' placeholder");
  assert.ok(/exact address before your event/i.test(m.text), "should promise the address by email when TBD");
  assert.ok(/exact address before your event/i.test(m.html), "html should promise the address when TBD");
});
test("booking installer email lists details", () => {
  const m = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(m.subject.includes("Sioux Falls"));
  assert.ok(m.text.includes("Jane Doe"));
  assert.ok(m.text.includes("9:20"));
});
test("booking emails surface the exact model year when set, omit it when not", () => {
  const withYear = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20", modelYear: "2019" }, instB, marketB, eventB);
  assert.ok(withYear.text.includes("Model year: 2019"), "installer text missing model year");
  assert.ok(withYear.html.includes("2019"), "installer html missing model year");
  const cust = tB.buildBookingCustomerEmail({ ...dB, slot: "9:20", modelYear: "2019" }, instB, marketB, eventB);
  assert.ok(cust.html.includes("2019"), "customer html missing model year");
  const noYear = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(!/Model year:/.test(noYear.text), "should omit model-year row when absent");
});
test("installer emails surface Free OTT Update request type when source set", () => {
  const b = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20", source: "OTT Update" }, instB, marketB, eventB);
  assert.ok(b.text.includes("Free OTT Update"), "booking text row missing");
  assert.ok(b.html.includes("Free OTT Update"), "booking html row missing");
  const p = tB.buildPriorityInstallerEmail({ ...dB, source: "OTT Update" }, instB, marketB, "no-event");
  assert.ok(p.text.includes("Free OTT Update"), "priority text row missing");
  const plain = tB.buildBookingInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, eventB);
  assert.ok(!plain.text.includes("Free OTT Update"), "no row when source absent");
});
test("priority emails reflect reason", () => {
  const full = tB.buildPriorityCustomerEmail(dB, instB, marketB, "full");
  assert.ok(full.text.toLowerCase().includes("priority"));
  const inE = tB.buildPriorityInstallerEmail(dB, instB, marketB, "no-event");
  assert.ok(inE.subject.toLowerCase().includes("priority"));
  // full-event wait list carries the requested time
  assert.ok(tB.buildPriorityCustomerEmail({ ...dB, slot: "9:20" }, instB, marketB, "full").text.includes("9:20"));
  assert.ok(tB.buildPriorityInstallerEmail({ ...dB, slot: "9:20" }, instB, marketB, "full").text.includes("9:20"));
});
test("event reminder names date, time, city, and address", () => {
  const booking = { Name: "Jane Doe", Email: "jane@x.com" };
  const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Dyno Rd, Green Bay WI" };
  const inst = { name: "Noah Kreis", phone: "(920) 860-7050" };
  const m = require("../netlify/functions/lib/templates.js").buildEventReminderCustomerEmail(booking, event, inst, 2);
  assert.match(m.subject, /Green Bay/);
  assert.ok(m.html.includes("123 Dyno Rd, Green Bay WI"));
  assert.ok(m.html.includes("9:00 AM") && m.html.includes("Sep 12, 2026"));
  assert.ok(m.text.includes("Jane"));
});
test("event reminder uses the customer's booked slot time, not a hardcoded 9 AM", () => {
  const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "X" };
  const inst = { name: "Noah Kreis", phone: "(920) 860-7050" };
  const m = require("../netlify/functions/lib/templates.js").buildEventReminderCustomerEmail({ Name: "Jane", Email: "j@x.com", Slot: "10:20" }, event, inst, 2);
  assert.ok(m.html.includes("10:20 AM"));
  assert.ok(!m.html.includes("9:00 AM"));
});
test("day-of (daysUntil 0) customer email says today and names the slot", () => {
  const tpl = require("../netlify/functions/lib/templates.js");
  const booking = { Name: "Jane Doe", Slot: "9:40" };
  const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Main St" };
  const inst = { name: "Noah Kreis", phone: "(920) 860-7050" };
  const m = tpl.buildEventReminderCustomerEmail(booking, event, inst, 0);
  assert.match(m.subject, /today/i);
  assert.match(m.text, /today/i);
  assert.match(m.text, /9:40/);
  assert.match(m.text, /123 Main St/);
});

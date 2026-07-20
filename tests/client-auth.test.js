const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  signSession, verifySession, signLogin, verifyLogin, resolveClient, accountLink,
  SESSION_TTL_MS, RENEW_AFTER_MS,
} = require("../netlify/functions/lib/client-auth.js");

const ENV = { CLIENT_SESSION_SECRET: "test-secret-0123456789" };
const NOW = 1800000000000; // fixed epoch ms

test("session round-trip, lower-cases the email", () => {
  const t = signSession("Marcus@Example.com", NOW, ENV);
  assert.ok(t && t.includes("."));
  const v = verifySession(t, NOW + 1000, ENV);
  assert.equal(v.email, "marcus@example.com");
});

test("session expires after 365 days", () => {
  const t = signSession("a@b.co", NOW, ENV);
  assert.ok(verifySession(t, NOW + SESSION_TTL_MS - 1, ENV));
  assert.equal(verifySession(t, NOW + SESSION_TTL_MS + 1, ENV), null);
});

test("tampered token rejected", () => {
  const t = signSession("a@b.co", NOW, ENV);
  const [p, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ e: "evil@b.co", t: "session", x: NOW + SESSION_TTL_MS, i: NOW })).toString("base64url");
  assert.equal(verifySession(forged + "." + sig, NOW, ENV), null);
  assert.equal(verifySession(p + ".AAAA", NOW, ENV), null);
});

test("login token is not a session token (type confusion)", () => {
  const lt = signLogin("a@b.co", 30 * 60 * 1000, NOW, ENV);
  assert.equal(verifySession(lt, NOW, ENV), null);
  assert.equal(verifyLogin(lt, NOW + 1000, ENV).email, "a@b.co");
  const st = signSession("a@b.co", NOW, ENV);
  assert.equal(verifyLogin(st, NOW, ENV), null);
});

test("login token honors its ttl", () => {
  const lt = signLogin("a@b.co", 1000, NOW, ENV);
  assert.ok(verifyLogin(lt, NOW + 999, ENV));
  assert.equal(verifyLogin(lt, NOW + 1001, ENV), null);
});

test("fails closed when the secret is unset", () => {
  assert.equal(signSession("a@b.co", NOW, {}), null);
  const t = signSession("a@b.co", NOW, ENV);
  assert.equal(verifySession(t, NOW, {}), null);
});

test("accountLink embeds a 7-day login token, plain when unconfigured", () => {
  const url = accountLink("a@b.co", NOW, ENV);
  const m = /lt=([A-Za-z0-9_\-\.]+)/.exec(url);
  assert.ok(m);
  assert.ok(verifyLogin(m[1], NOW + 6 * 24 * 3600 * 1000, ENV));
  assert.equal(verifyLogin(m[1], NOW + 8 * 24 * 3600 * 1000, ENV), null);
  assert.equal(accountLink("a@b.co", NOW, {}), "https://tunedyota.com/account");
});

test("resolveClient reads the header; renews only past the renewal window", () => {
  const fresh = signSession("a@b.co", NOW, ENV);
  const r1 = resolveClient({ "x-client-token": fresh }, NOW + 1000, ENV);
  assert.equal(r1.email, "a@b.co");
  assert.equal(r1.renewedToken, undefined);
  const r2 = resolveClient({ "x-client-token": fresh }, NOW + RENEW_AFTER_MS + 1, ENV);
  assert.equal(r2.email, "a@b.co");
  assert.ok(r2.renewedToken && r2.renewedToken !== fresh);
  assert.equal(resolveClient({}, NOW, ENV), null);
  assert.equal(resolveClient({ "x-client-token": "junk" }, NOW, ENV), null);
});

const { signReferral, verifyReferral, referralUrl, REFERRAL_TTL_MS } = require("../netlify/functions/lib/client-auth.js");

test("referral token round-trips + lowercases; rejects tamper, expiry, wrong type", () => {
  const t = signReferral("Ref@Example.com", NOW, ENV);
  assert.equal(verifyReferral(t, NOW + 1000, ENV).email, "ref@example.com");
  assert.equal(verifyReferral(t, NOW + REFERRAL_TTL_MS + 1, ENV), null);          // expired
  assert.equal(verifyReferral("junk.sig", NOW, ENV), null);                        // malformed
  assert.equal(verifyReferral(signSession("a@b.co", NOW, ENV), NOW, ENV), null);   // a session is not a ref
});
test("referralUrl embeds a ref token in the funnel link; plain funnel without a secret", () => {
  assert.match(referralUrl("a@b.co", NOW, ENV), /^https:\/\/tunedyota\.com\/find-your-exact-tune\?ref=.+/);
  assert.equal(referralUrl("a@b.co", NOW, {}), "https://tunedyota.com/find-your-exact-tune");
});

# "Get OTT Now!" Shareable Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Get OTT Now!" CTA + native-share-sheet Share button on the homepage hero and funnel page, plus a clean `/get-ott-now` link that redirects into the existing decision funnel tagged `get-ott-now`.

**Architecture:** Reuse the existing funnel + booking/priority logic. New: one shared browser helper (`site/share.js`, with a node-testable pure `shareLinks`), a `netlify.toml` redirect, and button edits on two pages. No function/booking changes.

**Tech Stack:** static HTML/CSS/JS, Netlify redirect, `node --test` for the pure share-URL builder + static-content guards.

**File structure:**
- Create `site/share.js` — `shareLinks(url,text)` (pure) + browser wiring (Web Share API + desktop fallback popover).
- Create `tests/share.test.js` — unit-test `shareLinks`.
- Create `tests/get-ott-now.test.js` — static guards (buttons/script present; redirect present).
- Modify `netlify.toml` — add the `/get-ott-now` redirect.
- Modify `site/index.html` — hero CTA + Share button + script include.
- Modify `site/find-your-exact-tune.html` — Share button + script include.

---

### Task 1: `share.js` + its unit test

- [ ] **Step 1: Write the failing test** — `tests/share.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shareLinks } = require("../site/share.js");

test("shareLinks builds encoded fallback URLs per platform", () => {
  const L = shareLinks("https://tunedyota.com/get-ott-now", "Get OTT Now");
  assert.match(L.facebook, /facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
  assert.match(L.reddit, /reddit\.com\/submit\?url=https%3A%2F%2Ftunedyota\.com%2Fget-ott-now&title=Get%20OTT%20Now/);
  assert.match(L.email, /^mailto:\?subject=.*&body=Get%20OTT%20Now%20https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
  assert.match(L.sms, /body=Get%20OTT%20Now%20https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
});
```

- [ ] **Step 2: Run it → FAIL** — `node --test tests/share.test.js`.

- [ ] **Step 3: Implement** — `site/share.js`:
```js
// site/share.js
// "Get OTT Now!" share helper. Pure shareLinks() is node-testable; the DOM wiring
// (native share sheet + desktop fallback popover) runs only in the browser.
(function (root) {
  var SHARE_URL = "https://tunedyota.com/get-ott-now";
  var TEXT = "Get your Toyota or Lexus OTT tune — pick your vehicle and schedule with a Tuned Yota installer.";

  function shareLinks(url, text) {
    var u = encodeURIComponent(url);
    var t = encodeURIComponent(text);
    var tu = encodeURIComponent(text + " " + url);
    return {
      sms: "sms:?&body=" + tu,
      email: "mailto:?subject=" + encodeURIComponent("Get OTT Now — Tuned Yota") + "&body=" + tu,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + u,
      reddit: "https://www.reddit.com/submit?url=" + u + "&title=" + t,
    };
  }

  if (typeof document !== "undefined") {
    var openFallback = function () {
      var existing = document.getElementById("ty-share-pop");
      if (existing) { existing.remove(); return; }
      var L = shareLinks(SHARE_URL, TEXT);
      var box = "flex:1;min-width:64px;text-align:center;padding:9px;border:1px solid #d8d2ca;border-radius:8px;color:#3A2E26;text-decoration:none";
      var pop = document.createElement("div");
      pop.id = "ty-share-pop";
      pop.setAttribute("style", "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#fff;border:1px solid #d8d2ca;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:14px 16px;max-width:340px;width:92%;font-family:-apple-system,Arial,sans-serif;color:#3A2E26");
      pop.innerHTML =
        '<div style="font-weight:700;margin-bottom:8px">Share “Get OTT Now”</div>' +
        '<button id="ty-copy" type="button" style="width:100%;padding:11px;margin:0 0 8px;border:0;border-radius:8px;background:#5B4B42;color:#fff;font-weight:700">Copy link</button>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a href="' + L.sms + '" style="' + box + '">Text</a>' +
        '<a href="' + L.email + '" style="' + box + '">Email</a>' +
        '<a href="' + L.facebook + '" target="_blank" rel="noopener" style="' + box + '">Facebook</a>' +
        '<a href="' + L.reddit + '" target="_blank" rel="noopener" style="' + box + '">Reddit</a>' +
        '</div>' +
        '<div style="font-size:12px;color:#7c8472;margin-top:8px">Instagram, TikTok &amp; YouTube: tap Copy link, then paste it into your post or DM.</div>' +
        '<button id="ty-share-close" type="button" style="width:100%;padding:8px;margin-top:8px;border:0;background:none;color:#7c8472">Close</button>';
      document.body.appendChild(pop);
      document.getElementById("ty-copy").addEventListener("click", function () {
        var mark = function () { var c = document.getElementById("ty-copy"); if (c) c.textContent = "Copied!"; };
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(SHARE_URL).then(mark).catch(function () {}); }
        else { var ta = document.createElement("textarea"); ta.value = SHARE_URL; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); mark(); } catch (e) {} ta.remove(); }
      });
      document.getElementById("ty-share-close").addEventListener("click", function () { pop.remove(); });
    };
    var wire = function () {
      var btns = document.querySelectorAll("[data-share-ott]");
      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener("click", function () {
          if (navigator.share) { navigator.share({ title: "Get OTT Now — Tuned Yota", text: TEXT, url: SHARE_URL }).catch(function () {}); return; }
          openFallback();
        });
      });
    };
    if (document.readyState !== "loading") wire(); else document.addEventListener("DOMContentLoaded", wire);
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { shareLinks: shareLinks };
  else root.TYShare = { shareLinks: shareLinks };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: Run it → PASS** — `node --test tests/share.test.js`.
- [ ] **Step 5: Commit** — `git add site/share.js tests/share.test.js && git commit -m "feat(share): Get OTT Now share helper (native share + fallback)" -m "<trailer>"`.

---

### Task 2: `/get-ott-now` redirect + static guard test

- [ ] **Step 1: Write the failing test** — `tests/get-ott-now.test.js`:
```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("netlify.toml redirects /get-ott-now into the funnel with the campaign tag", () => {
  const t = read("netlify.toml");
  assert.match(t, /from\s*=\s*"\/get-ott-now"/);
  assert.match(t, /to\s*=\s*"\/find-your-exact-tune\?[^"]*utm_campaign=get-ott-now/);
});
test("homepage has the Get OTT Now CTA, a share trigger, and the share script", () => {
  const h = read("site/index.html");
  assert.match(h, /Get OTT Now!/);
  assert.match(h, /data-share-ott/);
  assert.match(h, /share\.js/);
});
test("funnel page has a share trigger and the share script", () => {
  const h = read("site/find-your-exact-tune.html");
  assert.match(h, /data-share-ott/);
  assert.match(h, /share\.js/);
});
```

- [ ] **Step 2: Run it → FAIL** — `node --test tests/get-ott-now.test.js` (redirect + HTML not yet present).

- [ ] **Step 3: Add the redirect** — append to `netlify.toml`:
```toml

# "Get OTT Now!" share link -> the decision funnel, tagged to the share campaign.
[[redirects]]
  from = "/get-ott-now"
  to = "/find-your-exact-tune?utm_source=share&utm_medium=social&utm_campaign=get-ott-now"
  status = 302
```

- [ ] **Step 4: Homepage hero** — in `site/index.html`, replace the hero `.cta-row` (the line with `Find Your Exact Tune →` + `Call / Text`) with:
```html
        <div class="cta-row"><a class="btn p" href="find-your-exact-tune.html">Get OTT Now! →</a><a class="btn o" href="find-your-exact-tune.html">Find Your Exact Tune</a><button class="btn o" type="button" data-share-ott>Share</button><a class="btn o" href="tel:+16124067117">Call / Text (612) 406-7117</a></div>
```
Then add, just before `</body>`: `<script src="/share.js" defer></script>`.

- [ ] **Step 5: Funnel page** — in `site/find-your-exact-tune.html`, add a `<button class="btn o" type="button" data-share-ott>Share “Get OTT Now”</button>` in a sensible spot near the top of the visible funnel content (read the file, place it just after the first funnel heading/intro block so it matches the theme), and add `<script src="/share.js" defer></script>` just before `</body>`.

- [ ] **Step 6: Run it → PASS** — `node --test tests/get-ott-now.test.js`.
- [ ] **Step 7: Commit** — `git add netlify.toml site/index.html site/find-your-exact-tune.html tests/get-ott-now.test.js && git commit -m "feat(share): Get OTT Now CTA + Share button + /get-ott-now redirect" -m "<trailer>"`.

---

### Task 3: Full suite + ship

- [ ] **Step 1:** `npm test` → all pass (incl. new share + guard tests, and existing SEO guards unaffected).
- [ ] **Step 2:** No SEO inputs changed (buttons only; `/get-ott-now` is a redirect, not a page) → skip `build:seo`. If desired, run `npm run build:seo` and `git checkout site/sitemap.xml` if only its date changed.
- [ ] **Step 3:** `git push origin master`; confirm Netlify `ready`; verify:
  - `curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://tunedyota.com/get-ott-now` → `302 -> https://tunedyota.com/find-your-exact-tune?utm_source=share&utm_medium=social&utm_campaign=get-ott-now`
  - `curl -s https://tunedyota.com/ | grep -o "Get OTT Now!"` → present
  - `curl -s -o /dev/null -w "%{http_code}\n" https://tunedyota.com/share.js` → `200`

---

## Self-review notes
- **Spec coverage:** redirect (T2), share.js pure+wiring (T1), hero CTA+Share (T2 s4), funnel Share (T2 s5), tests (T1/T2), ship+verify (T3). All mapped.
- **Consistency:** `shareLinks(url,text)` + `data-share-ott` + `/share.js` used identically across tasks; redirect `to` matches the funnel + `utm_campaign=get-ott-now` asserted in the test.
- **Placeholders:** none — full code/commands throughout; the one judgment call (exact funnel insertion point) is bounded by "just after the first funnel heading, matching theme," with the fixed contract being a `data-share-ott` trigger + the script include (asserted by the test).

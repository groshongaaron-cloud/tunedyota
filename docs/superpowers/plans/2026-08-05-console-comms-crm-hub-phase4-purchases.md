# Purchases & Ownership (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the client card a "Purchases & Ownership" section on Customer 360 — auto-derived tunes from completed Bookings merged with a manual purchase log (in-person AMSOIL PC / Banks / Magnuson parts and any online buys logged by staff).

**Architecture:** A pure merge module (`purchases-view.js`) derives a tune entry per completed booking and merges it with rows from a new `Purchases` Airtable table into one date-sorted ownership timeline. `customer-view.js` gains a `fetchManualPurchases` source and returns `purchases[]`. A thin `add-purchase.js` endpoint appends a manual row. The console renders the section and an "Add purchase" modal.

**Tech Stack:** Node.js Netlify functions, Airtable REST, `node --test` (deps-injected), vanilla-JS SPA (`site/installer.html`).

This is Phase 4 (final) of the spec `docs/superpowers/specs/2026-08-05-console-comms-crm-hub-design.md`.

## ⚠️ OWNER SETUP REQUIRED FIRST — create the `Purchases` Airtable table

This phase needs a new table in the same base the console uses. **Owner (Aaron) creates it in Airtable before Task 5's live verification** (Tasks 1–4 are unit-tested with mocks and don't need it live). Create a table named **`Purchases`** with these fields:

| Field | Type | Notes |
|---|---|---|
| `Date` | Date | purchase date |
| `Category` | Single select | options EXACTLY: `OTT Tune`, `AMSOIL`, `Banks`, `Magnuson`, `Other` |
| `Item` | Single line text | e.g. "PedalMonster", "Preferred Customer membership", "Signature 0W-20 ×2" |
| `Amount` | Currency | optional |
| `Vehicle` | Single line text | optional |
| `Phone` | Single line text | match key to a person |
| `Email` | Single line text | match key to a person |
| `Name` | Single line text | optional, for readability |
| `Installer` | Single line text | who logged it |
| `Notes` | Long text | optional |

(If the table is named differently, set env `AIRTABLE_PURCHASES_TABLE` to that name — Task 1 reads it.)

## Scope note — online purchases

EPG online payments currently create a **lead** (source `magnuson-purchase`) + a Slack alert; they do **not** persist a per-purchase record. So Phase 4 has no auto online-purchase source. Online buys are captured via the manual log for now; a future hook can auto-append to `Purchases` if EPG starts persisting payments. Tunes are the one auto source (from Bookings).

## File structure

- **Modify** `netlify/functions/lib/airtable.js` — add `purchases` to `cfg`.
- **Create** `netlify/functions/lib/purchases-view.js` — pure `deriveTunes`, `toPurchaseView`, `mergePurchases`.
- **Modify** `netlify/functions/customer-view.js` — add `fetchManualPurchases`; return merged `purchases[]`.
- **Create** `netlify/functions/add-purchase.js` — POST endpoint appending a `Purchases` row.
- **Create** `tests/purchases-view.test.js`, `tests/add-purchase.test.js`; **extend** `tests/customer-view.test.js`.
- **Modify** `site/installer.html` — render the Purchases section in `renderCustomer` + an "Add purchase" modal.

Reused: `cfg`/`listAllRecords`/`createRecord`/`createTolerant` (`lib/airtable.js`), `normalizePhone`/`normalizeEmail` (`lib/leads.js`), `resolveInstaller` (`lib/installer-auth.js`), `withCors` (`lib/cors.js`), console `tok`/`esc`/`succeed`/`fail`/`openCustomerView`/`renderCustomer`.

---

### Task 1: Add `purchases` table to `cfg`

**Files:**
- Modify: `netlify/functions/lib/airtable.js` (`cfg`, ~9-16)
- Test: `tests/airtable-cfg-purchases.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/airtable-cfg-purchases.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cfg } = require("../netlify/functions/lib/airtable.js");

test("cfg exposes the Purchases table, overridable via env", () => {
  assert.equal(cfg({}).purchases, "Purchases");
  assert.equal(cfg({ AIRTABLE_PURCHASES_TABLE: "Buys" }).purchases, "Buys");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/airtable-cfg-purchases.test.js`
Expected: FAIL — `cfg(...).purchases` is `undefined`.

- [ ] **Step 3: Add the field**

In `netlify/functions/lib/airtable.js`, in the object `cfg` returns, add after the `clients` line:

```js
    clients: env.AIRTABLE_CLIENTS_TABLE || "Clients",
    purchases: env.AIRTABLE_PURCHASES_TABLE || "Purchases",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/airtable-cfg-purchases.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/airtable.js tests/airtable-cfg-purchases.test.js
git commit -m "feat(purchases): add Purchases table to airtable cfg"
```

---

### Task 2: Pure `purchases-view.js` — derive tunes + merge

**Files:**
- Create: `netlify/functions/lib/purchases-view.js`
- Test: `tests/purchases-view.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/purchases-view.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deriveTunes, toPurchaseView, mergePurchases } = require("../netlify/functions/lib/purchases-view.js");

test("deriveTunes makes one OTT Tune entry per COMPLETED booking", () => {
  const t = deriveTunes([
    { id: "bk1", status: "Completed", dateISO: "2022-05-01", vehicle: "2022 Tacoma", calibration: "OTT Stage 1", installer: "aaron", certSent: true },
    { id: "bk2", status: "Booked", dateISO: "2026-09-01", vehicle: "4Runner" },
  ]);
  assert.equal(t.length, 1);
  assert.equal(t[0].category, "OTT Tune");
  assert.equal(t[0].source, "booking");
  assert.ok(t[0].item.includes("Tacoma"));
  assert.equal(t[0].cert, true);
});

test("toPurchaseView maps a manual Purchases row", () => {
  const v = toPurchaseView({ id: "p1", fields: { Date: "2026-08-01", Category: "Banks", Item: "PedalMonster", Amount: 349, Vehicle: "2021 4Runner", Installer: "cody", Notes: "installed same day" } });
  assert.equal(v.source, "manual");
  assert.equal(v.category, "Banks");
  assert.equal(v.item, "PedalMonster");
  assert.equal(v.amount, 349);
});

test("mergePurchases combines and sorts newest-first", () => {
  const out = mergePurchases(
    [{ source: "booking", date: "2022-05-01", category: "OTT Tune", item: "tune" }],
    [{ source: "manual", date: "2026-08-01", category: "Banks", item: "PedalMonster" }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].date, "2026-08-01"); // newest first
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/purchases-view.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the module**

Create `netlify/functions/lib/purchases-view.js`:

```js
// netlify/functions/lib/purchases-view.js
// Pure purchase/ownership merge for Customer 360. Derives a "tune" purchase from
// each COMPLETED booking and merges with manually-logged Purchases rows into one
// date-sorted ownership timeline. No I/O — unit-tested directly.
function deriveTunes(bookings) {
  return (bookings || []).filter((b) => b.status === "Completed").map((b) => ({
    source: "booking", recordId: b.id, date: b.dateISO || "", category: "OTT Tune",
    item: [b.calibration || "OTT tune", b.vehicle].filter(Boolean).join(" — "),
    amount: "", vehicle: b.vehicle || "", installer: b.installer || "", cert: !!b.certSent,
  }));
}

function toPurchaseView(r) {
  const f = r.fields || {};
  return { source: "manual", recordId: r.id, date: String(f.Date || "").slice(0, 10),
    category: f.Category || "Other", item: f.Item || "",
    amount: f.Amount != null ? f.Amount : "", vehicle: f.Vehicle || "",
    installer: f.Installer || "", notes: f.Notes || "" };
}

function mergePurchases(tunes, manual) {
  return [...(tunes || []), ...(manual || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

module.exports = { deriveTunes, toPurchaseView, mergePurchases };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/purchases-view.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/purchases-view.js tests/purchases-view.test.js
git commit -m "feat(purchases): pure derive-tunes + merge helpers"
```

---

### Task 3: `customer-view.js` — fetch + merge purchases into the 360

**Files:**
- Modify: `netlify/functions/customer-view.js`
- Test: `tests/customer-view.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/customer-view.test.js` (match the file's existing test harness — it injects `listImpl` and an installer token; read the top of the file first and mirror its `ENV`/headers/`listImpl` router shape):

```js
test("customer-view returns a purchases timeline (completed-booking tunes + manual rows)", async () => {
  const { handler } = require("../netlify/functions/customer-view.js");
  const cfg = require("../netlify/functions/lib/airtable.js").cfg;
  const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "S" }), INSTALLER_ADMINS: "aaron" };
  const c = cfg(ENV);
  const listImpl = async ({ table }) => {
    if (table === c.bookings) return [{ id: "bk1", fields: { Name: "Pat", Phone: "612-406-7117", Vehicle: "2022 Tacoma", "Event Date": "2022-05-01", Status: "Completed", "OTT Calibration": "Stage 1", Installer: "aaron" } }];
    if (table === c.purchases) return [{ id: "p1", fields: { Date: "2026-08-01", Category: "Banks", Item: "PedalMonster", Phone: "612-406-7117", Installer: "aaron" } }];
    return [];
  };
  const res = await handler({ httpMethod: "GET", headers: { "x-installer-token": "S" }, queryStringParameters: { phone: "612-406-7117" } }, { env: ENV, listImpl, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.purchases.length, 2);
  assert.equal(body.purchases[0].category, "Banks");   // 2026 newest first
  assert.equal(body.purchases[1].category, "OTT Tune"); // derived from the completed booking
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customer-view.test.js`
Expected: FAIL — `body.purchases` is undefined.

- [ ] **Step 3: Add the source and merge**

In `netlify/functions/customer-view.js`:

At the top, add imports:

```js
const { deriveTunes, toPurchaseView, mergePurchases } = require("./lib/purchases-view.js");
```

Add a fetcher next to the other `fetch*` functions:

```js
async function fetchManualPurchases({ c, list, pKey, eKey }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.purchases,
    fields: ["Date", "Category", "Item", "Amount", "Vehicle", "Phone", "Email", "Installer", "Notes"] });
  return recs.filter((r) => {
    const f = r.fields || {};
    return (pKey && normalizePhone(f.Phone) === pKey) || (eKey && normalizeEmail(f.Email) === eKey);
  }).map(toPurchaseView).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
```

In `handler`, add a fifth `safe(...)` to the `Promise.all` and merge after:

```js
  const [bookings, leads, chats, calls, manualPurchases] = await Promise.all([
    safe(pKey ? fetchBookings({ c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchLeads({ c, list, pKey, eKey, key, admin })),
    safe(pKey ? fetchChats({ env, c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchCalls({ env, fetchImpl, pKey })),
    safe(fetchManualPurchases({ c, list, pKey, eKey })),
  ]);
  const purchases = mergePurchases(deriveTunes(bookings), manualPurchases);
```

And add `purchases` to the JSON response body:

```js
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", partial, bookings, leads, chats, calls, purchases }) };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/customer-view.test.js`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/customer-view.js tests/customer-view.test.js
git commit -m "feat(purchases): merge tunes + manual purchases into Customer 360"
```

---

### Task 4: `add-purchase.js` endpoint

**Files:**
- Create: `netlify/functions/add-purchase.js`
- Test: `tests/add-purchase.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/add-purchase.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/add-purchase.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "S" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "S" };

test("add-purchase 401s without a token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, { env: ENV });
  assert.equal(res.statusCode, 401);
});

test("add-purchase 400s without item or contact", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ category: "Banks" }) }, { env: ENV, createImpl: async () => ({ id: "x" }) });
  assert.equal(res.statusCode, 400);
});

test("add-purchase creates a Purchases row with the installer stamped", async () => {
  let created = null;
  const res = await handler({ httpMethod: "POST", headers: H,
    body: JSON.stringify({ phone: "612-406-7117", category: "Banks", item: "PedalMonster", amount: 349, date: "2026-08-01" }) },
    { env: ENV, createImpl: async (a) => { created = a; return { id: "p1" }; } });
  assert.equal(res.statusCode, 200);
  assert.equal(created.fields.Category, "Banks");
  assert.equal(created.fields.Item, "PedalMonster");
  assert.equal(created.fields.Installer, "aaron");
  assert.equal(created.fields.Amount, 349);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/add-purchase.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the endpoint**

Create `netlify/functions/add-purchase.js`:

```js
// netlify/functions/add-purchase.js
// Log a manual/in-person purchase onto a person's ownership history (the
// Purchases table). POST, installer-auth. Read-back is via Customer 360.
const { cfg, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { withCors } = require("./lib/cors.js");

const CATEGORIES = ["OTT Tune", "AMSOIL", "Banks", "Magnuson", "Other"];

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  if ((event.httpMethod || "POST") !== "POST") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }

  const category = CATEGORIES.includes(body.category) ? body.category : "Other";
  const item = String(body.item || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  if (!item || (!phone && !email)) return { statusCode: 400, body: JSON.stringify({ error: "missing-item-or-contact" }) };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : new Date(now).toISOString().slice(0, 10);

  const fields = { Date: date, Category: category, Item: item, Phone: phone, Email: email,
    Name: String(body.name || "").trim(), Vehicle: String(body.vehicle || "").trim(),
    Installer: key, Notes: String(body.notes || "").trim().slice(0, 500) };
  const amount = body.amount === "" || body.amount == null ? null : Number(body.amount);
  if (amount != null && isFinite(amount)) fields.Amount = amount;

  const c = cfg(env);
  const createImpl = ctx.createImpl || ((a) => createRecord({ ...a }));
  let rec;
  try { rec = await createTolerant(createImpl, { token: c.token, baseId: c.baseId, table: c.purchases, fields }, ["Amount", "Vehicle", "Name", "Notes"]); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", id: rec && rec.id }) };
}
module.exports = { handler: withCors(handler) };
```

Note: `createTolerant(createFn, params, tolerantFields)` retries dropping the listed optional fields if Airtable rejects them (column missing) — confirm its real signature in `lib/airtable.js` matches before finalizing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/add-purchase.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/add-purchase.js tests/add-purchase.test.js
git commit -m "feat(purchases): add-purchase endpoint (manual ownership log)"
```

---

### Task 5: Console — render the Purchases & Ownership section

**Files:**
- Modify: `site/installer.html` (`renderCustomer` ~655-720, the timeline section)

No unit test (SPA); verified live in Task 7.

- [ ] **Step 1: Render `d.purchases` in the Customer 360 body**

In `renderCustomer`, the body HTML currently ends with a Timeline section:

```js
      '<div class="sec"><span class="lbl">Timeline</span></div><div id="custtl"></div>';
```

Change that to insert a Purchases block + an "Add purchase" button BEFORE the Timeline:

```js
      '<div class="sec"><span class="lbl">Purchases &amp; ownership</span> <a href="#" id="custaddpurch" style="font-size:12px">+ add</a></div>'+
      '<div id="custpurch"></div>'+
      '<div class="sec"><span class="lbl">Timeline</span></div><div id="custtl"></div>';
```

Then, after the existing action-row wiring (after the `#custact` buttons block, before the timeline items are built), add the purchases rendering + the add hook:

```js
    var pur=(d.purchases||[]);
    var ph=document.getElementById('custpurch');
    if(ph){ ph.innerHTML = pur.length ? '<div class="card" style="padding:0;overflow:hidden">'+pur.map(function(x){
        var ico = x.category==='OTT Tune'?'🔧':x.category==='AMSOIL'?'🛢️':x.category==='Banks'?'⚡':x.category==='Magnuson'?'🏎️':'🧾';
        var amt = (x.amount!==''&&x.amount!=null)?' · $'+esc(String(x.amount)):'';
        return '<div class="crow"><div class="cava">'+ico+'</div>'+
          '<div class="cmeta"><div class="cname">'+esc(x.item||x.category)+'<span class="cbadge" style="opacity:.7"> '+esc(x.category)+'</span></div>'+
          '<div class="csnip">'+esc([x.vehicle, x.installer?('by '+x.installer):''].filter(Boolean).join(' · '))+amt+(x.source==='manual'?'':' · auto')+'</div></div>'+
          '<div class="cwhen">'+esc((x.date||'').slice(0,10))+'</div></div>';
      }).join('')+'</div>' : '<p class="muted" style="padding:8px 2px">No purchases logged yet.</p>'; }
    var ap=document.getElementById('custaddpurch');
    if(ap) ap.onclick=function(e){ e.preventDefault(); openPurchaseDialog({ name:name, phone:phone, email:email, vehicle:vehicle }); };
```

- [ ] **Step 2: Commit**

```bash
git add site/installer.html
git commit -m "feat(purchases): render Purchases & Ownership on Customer 360"
```

---

### Task 6: Console — "Add purchase" modal

**Files:**
- Modify: `site/installer.html` (add `openPurchaseDialog` near `renderNudge` ~705)

- [ ] **Step 1: Add the modal**

After the `renderNudge` function (end of the nudge modal block, ~line 705), add:

```js
  function openPurchaseDialog(person){
    var ov=document.getElementById('purchov');
    if(!ov){ ov=document.createElement('div'); ov.id='purchov'; ov.className='reviewov';
      ov.innerHTML='<div class="reviewbox" style="max-width:440px;width:92%;text-align:left"><div id="purchbody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',function(e){ if(e.target===ov) ov.style.display='none'; }); }
    ov.style.display='flex';
    var p=person||{};
    var b=document.getElementById('purchbody');
    var cats=['OTT Tune','AMSOIL','Banks','Magnuson','Other'];
    b.innerHTML='<div class="reviewh" style="text-align:left">🧾 Log a purchase</div>'+
      '<div class="meta">'+esc(p.name||p.phone||p.email||'Customer')+'</div>'+
      '<div class="sec"><span class="lbl">Category</span></div>'+
      '<select id="purchcat" style="font:inherit;padding:6px;width:100%;box-sizing:border-box">'+cats.map(function(c){ return '<option>'+c+'</option>'; }).join('')+'</select>'+
      '<div class="sec" style="margin-top:8px"><span class="lbl">Item</span></div>'+
      '<input id="purchitem" placeholder="e.g. PedalMonster, Preferred Customer membership" style="font:inherit;padding:6px;width:100%;box-sizing:border-box">'+
      '<div style="display:flex;gap:8px;margin-top:8px"><div style="flex:1"><div class="sec"><span class="lbl">Date</span></div><input id="purchdate" type="date" value="'+esc(STATE.today)+'" style="font:inherit;padding:6px;width:100%;box-sizing:border-box"></div>'+
        '<div style="flex:1"><div class="sec"><span class="lbl">Amount (opt)</span></div><input id="purchamt" type="number" inputmode="decimal" placeholder="0.00" style="font:inherit;padding:6px;width:100%;box-sizing:border-box"></div></div>'+
      '<div class="sec" style="margin-top:8px"><span class="lbl">Vehicle (opt)</span></div>'+
      '<input id="purchveh" value="'+esc(p.vehicle||'')+'" style="font:inherit;padding:6px;width:100%;box-sizing:border-box">'+
      '<div class="sec" style="margin-top:8px"><span class="lbl">Note (opt)</span></div>'+
      '<textarea id="purchnote" rows="2" style="font:inherit;padding:6px;width:100%;box-sizing:border-box"></textarea>'+
      '<div style="height:10px"></div><button class="btn" id="purchsave" style="width:100%">Log purchase</button>'+
      '<div style="height:6px"></div><button class="btn" id="purchcancel" style="width:100%">Cancel</button>';
    document.getElementById('purchcancel').onclick=function(){ ov.style.display='none'; };
    document.getElementById('purchsave').onclick=async function(){
      var item=(document.getElementById('purchitem')||{}).value||'';
      if(!item.trim()){ fail('Add an item name.'); return; }
      var save=document.getElementById('purchsave'); save.disabled=true; save.textContent='Saving…';
      try{
        var res=await fetch('/.netlify/functions/add-purchase',{method:'POST',
          headers:{'Content-Type':'application/json','x-installer-token':tok()},
          body:JSON.stringify({ name:p.name||'', phone:p.phone||'', email:p.email||'',
            category:(document.getElementById('purchcat')||{}).value||'Other', item:item,
            date:(document.getElementById('purchdate')||{}).value||STATE.today,
            amount:(document.getElementById('purchamt')||{}).value||'',
            vehicle:(document.getElementById('purchveh')||{}).value||'',
            notes:(document.getElementById('purchnote')||{}).value||'' })});
        var out=await res.json().catch(function(){return{};});
        if(res.ok && out.status==='ok'){ ov.style.display='none'; succeed('🧾 Purchase logged.'); openCustomerView(p); }
        else { save.disabled=false; save.textContent='Log purchase'; fail('Could not log it: '+((out&&out.error)||res.status)); }
      }catch(e){ save.disabled=false; save.textContent='Log purchase'; fail('Network error — not logged.'); }
    };
  }
```

- [ ] **Step 2: Commit**

```bash
git add site/installer.html
git commit -m "feat(purchases): add-purchase modal on Customer 360"
```

---

### Task 7: Full test run, ship, live verification

**Files:** none (deploy + verify). **Precondition:** the `Purchases` Airtable table exists (owner setup above).

- [ ] **Step 1: Full suite green** — `npm test` (0 fail; no SEO inputs changed).
- [ ] **Step 2: Push** — `git push origin master`.
- [ ] **Step 3: Confirm Netlify `ready`** — `netlify api listSiteDeploys --data '{"site_id":"47fd6491-fd07-4f6b-9e1e-20a83e164d36","per_page":3}'`.
- [ ] **Step 4: Live verify:**
  - `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://tunedyota.com/.netlify/functions/add-purchase -H "Content-Type: application/json" --data '{"phone":"5555555555"}'` → expect `401`.
  - Open `https://tunedyota.com/installer`, open a Customer 360, confirm a **Purchases & ownership** section shows (completed-booking tunes auto-appear); click **+ add**, log a Banks part, confirm it appears in the section and lands in the Airtable `Purchases` table.
- [ ] **Step 5: Mark Phase 4 complete** — the Console Comms & CRM Hub (all 4 phases) is done.

---

## Self-review

- **Spec coverage (Pillar 4):** Purchases & Ownership on Customer 360 ✓ (Tasks 3, 5); tunes auto from Bookings ✓ (Task 2 deriveTunes); manual in-person log (AMSOIL PC / Banks / Magnuson) ✓ (Tasks 1, 4, 6); merged read-time (no duplicate ledger) ✓ (Task 3). Online-purchase auto-source intentionally deferred (EPG persists no payment record — documented in Scope note).
- **Placeholders:** none.
- **Type/name consistency:** purchase view shape (`source`/`recordId`/`date`/`category`/`item`/`amount`/`vehicle`/`installer`/`notes`/`cert`) consistent across `purchases-view.js`, `customer-view.js`, tests, and `renderCustomer`; endpoint contract `{name,phone,email,category,item,date,amount,vehicle,notes}` → `{status,id}` consistent between `add-purchase.js`, its test, and the console modal; `openPurchaseDialog` used by Task 5 is defined in Task 6.
- **Scope:** final phase; ships the ownership panel + manual log.
- **Owner dependency:** the `Purchases` Airtable table must exist before Task 7's live verification (Tasks 1–4 are mock-tested and don't need it).

# Customer 360 · Overdue Leads Tab · Follow-up Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One unified customer timeline (bookings + leads + chats + calls) reachable from any name tap, an Overdue sub-tab that pulls due follow-ups out of the active lead stages, and follow-ups that carry a message the installer delivers as a prefilled chat draft.

**Architecture:** One new read-only Netlify function (`customer-view.js`) aggregates four sources server-side, matched on normalized last-10-digit phone; the console merges/sorts client-side. Lead follow-ups gain a `Follow-up Message` Airtable field written through the existing tolerant-update path; sending reuses the `openSms` chat flow with `STATE.chatPrefill` and a `followupSent` action closes the loop. All UI lands in `site/installer.html` following its existing patterns (reviewov overlays, tabbtn strips, walkmini rows).

**Tech Stack:** Netlify functions (CommonJS), Airtable REST via lib/airtable.js, Twilio REST, vanilla-JS single-file console, `node --test`.

Spec: `docs/superpowers/specs/2026-07-30-customer-360-overdue-followups-design.md`

---

### Task 1: Lead lib — follow-up message + followupSent action

**Files:**
- Modify: `netlify/functions/lib/leads.js` (toLeadView ~line 43, applyLeadUpdate ~line 163)
- Modify: `netlify/functions/lead-update.js:83` (optionalKeys)
- Test: `tests/lead-followup-message.test.js` (new)

- [ ] **Step 1: Write the failing tests**

```js
// tests/lead-followup-message.test.js
// Follow-ups that carry a message: setFollowup stores it, followupSent clears it.
const test = require("node:test");
const assert = require("node:assert");
const { applyLeadUpdate, toLeadView } = require("../netlify/functions/lib/leads.js");

const NOW = new Date("2026-07-30T15:00:00Z");
const lead = { activity: "old line", stage: "Qualified" };

test("setFollowup stores date + message and logs both", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02", message: "Hey Sam — spot open Saturday, want it?" }, NOW);
  assert.equal(out.fields["Next Follow-up"], "2026-08-02");
  assert.equal(out.fields["Follow-up Message"], "Hey Sam — spot open Saturday, want it?");
  assert.match(out.fields["Activity Log"], /follow-up set 2026-08-02 — "Hey Sam/);
});

test("setFollowup without a message still works, message cleared", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02" }, NOW);
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up set 2026-08-02$/m);
});

test("setFollowup caps the message at 500 chars", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02", message: "x".repeat(600) }, NOW);
  assert.equal(out.fields["Follow-up Message"].length, 500);
});

test("clearing the date clears the message too", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "", message: "stale" }, NOW);
  assert.equal(out.fields["Next Follow-up"], "");
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up cleared/);
});

test("bad date still rejected", () => {
  assert.equal(applyLeadUpdate(lead, "setFollowup", { date: "8/2/26" }, NOW).error, "bad-date");
});

test("followupSent stamps Last Contact and clears date + message", () => {
  const out = applyLeadUpdate(lead, "followupSent", { note: "Hey Sam — spot open Saturday" }, NOW);
  assert.equal(out.fields["Last Contact"], "2026-07-30");
  assert.equal(out.fields["Next Follow-up"], "");
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up sent: "Hey Sam — spot open Saturday"/);
});

test("toLeadView exposes followupMessage", () => {
  const v = toLeadView({ id: "rec1", fields: { Name: "Sam", "Follow-up Message": "msg" } });
  assert.equal(v.followupMessage, "msg");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/lead-followup-message.test.js`
Expected: FAIL (`Follow-up Message` undefined; `followupSent` → `bad-action`).

- [ ] **Step 3: Implement in lib/leads.js**

In `toLeadView`, after the `nextFollowup` line add:

```js
    followupMessage: f["Follow-up Message"] || "",
```

Replace the existing `setFollowup` branch of `applyLeadUpdate` with:

```js
  if (action === "setFollowup") {
    const date = String(payload.date || "");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "bad-date" };
    // The optional message rides along with the date and dies with it — a cleared
    // follow-up must never leave a stale draft that fires months later.
    const message = date ? String(payload.message || "").trim().slice(0, 500) : "";
    return { fields: { "Next Follow-up": date, "Follow-up Message": message,
      "Activity Log": add(date ? `follow-up set ${date}${message ? ` — "${message.slice(0, 80)}"` : ""}` : "follow-up cleared") } };
  }
  if (action === "followupSent") {
    const note = String(payload.note || "").trim().slice(0, 200);
    return { fields: { "Last Contact": today, "Next Follow-up": "", "Follow-up Message": "",
      "Activity Log": add(`follow-up sent${note ? `: "${note}"` : ""}`) } };
  }
```

In `lead-update.js:83` extend the tolerant keys:

```js
      ["Stage", "Channel", "Next Follow-up", "Follow-up Message", "Last Contact", "Activity Log", "Installer", "City"]);
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/lead-followup-message.test.js tests/leads.test.js tests/lead-endpoints.test.js`
Expected: PASS (existing setFollowup tests must still pass — they don't assert the absence of `Follow-up Message`; if one does exact-fields equality, update it to include `"Follow-up Message": ""`).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/leads.js netlify/functions/lead-update.js tests/lead-followup-message.test.js
git commit -m "feat(leads): follow-ups carry an optional message; followupSent closes the loop"
```

### Task 2: customer-view.js endpoint

**Files:**
- Create: `netlify/functions/customer-view.js`
- Test: `tests/customer-view.test.js` (new)

- [ ] **Step 1: Write the failing tests**

```js
// tests/customer-view.test.js
// Customer 360 aggregation: phone-keyed matching, installer scoping, partial degradation.
const test = require("node:test");
const assert = require("node:assert");
const { handler } = require("../netlify/functions/customer-view.js");

const ENV = { INSTALLER_TOKENS: JSON.stringify({ aaron: "tokA", noah: "tokN" }),
  ADMIN_INSTALLERS: "aaron", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tw" };
const H = (tok) => ({ "x-installer-token": tok });

const BOOKINGS = [
  { id: "bk1", fields: { Name: "Sam", Phone: "(651) 278-1401", Vehicle: "2021 Tundra", City: "Lakeville",
    "Event Date": "2026-07-10", Status: "Completed", "OTT Calibration": "Spicy", "Certificate Sent": true, Installer: "noah" } },
  { id: "bk2", fields: { Name: "Sam", Phone: "6512781401", City: "Lakeville", "Event Date": "2026-08-10", Status: "Booked", Installer: "noah" } },
  { id: "bk3", fields: { Name: "Other", Phone: "5551112222", "Event Date": "2026-07-01", Status: "Completed", Installer: "noah" } },
  { id: "bk4", fields: { Name: "Sam", Phone: "651-278-1401", "Event Date": "2026-06-01", Status: "Cancelled", Installer: "noah" } },
];
const LEADS = [
  { id: "ld1", fields: { Name: "Sam", Phone: "+1 651 278 1401", Stage: "Booked", Installer: "noah", "Last Contact": "2026-07-09" } },
  { id: "ld2", fields: { Name: "Sam2", Email: "sam@x.com", Stage: "New", Installer: "cody" } },
];
const CHATS = [
  { id: "cs1", fields: { "Session ID": "sms:+16512781401", Phone: "+16512781401", Status: "closed",
    Transcript: JSON.stringify([{ role: "user", text: "on my way", at: 1 }]), "Last Activity": "2026-07-28T21:00:00Z", Installer: "noah" } },
  { id: "cs2", fields: { "Session ID": "web:zzz", Phone: "5551112222", Transcript: "[]", Installer: "" } },
];
function listFor(tables) {
  return async ({ table }) => {
    if (/booking/i.test(table)) return tables.bookings || [];
    if (/priority/i.test(table)) return tables.leads || [];
    if (/chat/i.test(table)) return tables.chats || [];
    return [];
  };
}
const twilioOk = async (url) => ({ ok: true, json: async () => ({ calls:
  /To=/.test(url) ? [{ sid: "CA1", direction: "inbound", from: "+16512781401", to: "+16125550000", status: "completed", start_time: "Tue, 28 Jul 2026 20:00:00 +0000", duration: "95" }]
                  : [{ sid: "CA1", direction: "inbound", from: "+16512781401", to: "+16125550000", status: "completed", start_time: "Tue, 28 Jul 2026 20:00:00 +0000", duration: "95" },
                     { sid: "CA2", direction: "outbound-api", from: "+16125550000", to: "+16512781401", status: "completed", start_time: "Mon, 27 Jul 2026 20:00:00 +0000", duration: "10" }] }) });

test("401 without a token", async () => {
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { phone: "6512781401" } }, { env: ENV });
  assert.equal(res.statusCode, 401);
});

test("400 without phone or email", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: {} }, { env: ENV });
  assert.equal(res.statusCode, 400);
});

test("matches formatted phone variants, excludes Cancelled, newest first", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "(651) 278-1401" } },
    { env: ENV, listImpl: listFor({ bookings: BOOKINGS, leads: LEADS, chats: CHATS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(out.bookings.map((b) => b.id), ["bk2", "bk1"]);
  assert.equal(out.bookings[1].calibration, "Spicy");
  assert.equal(out.leads.length, 1);
  assert.equal(out.chats.length, 1);
  assert.equal(out.chats[0].lastText, "on my way");
});

test("non-admin never sees another installer's bookings/leads", async () => {
  const foreign = [{ id: "bkX", fields: { Name: "Sam", Phone: "6512781401", "Event Date": "2026-07-01", Status: "Completed", Installer: "aaron" } }];
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: listFor({ bookings: foreign, leads: [] }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.bookings.length, 0);
});

test("admin sees all; calls deduped by sid across To/From queries", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokA"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: listFor({ bookings: BOOKINGS, leads: LEADS, chats: CHATS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.bookings.length, 2);
  assert.deepEqual(out.calls.map((c) => c.sid), ["CA1", "CA2"]);
});

test("email matches leads when no phone", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokA"), queryStringParameters: { email: "SAM@x.com" } },
    { env: ENV, listImpl: listFor({ leads: LEADS }), fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.deepEqual(out.leads.map((l) => l.id), ["ld2"]);
  assert.equal(out.bookings.length, 0);
});

test("a failing source degrades to empty + partial:true", async () => {
  const res = await handler({ httpMethod: "GET", headers: H("tokN"), queryStringParameters: { phone: "6512781401" } },
    { env: ENV, listImpl: async ({ table }) => { if (/chat/i.test(table)) throw new Error("boom"); return listFor({ bookings: BOOKINGS, leads: LEADS })({ table }); },
      fetchImpl: twilioOk });
  const out = JSON.parse(res.body);
  assert.equal(out.partial, true);
  assert.equal(out.chats.length, 0);
  assert.equal(out.bookings.length, 2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/customer-view.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement customer-view.js**

```js
// netlify/functions/customer-view.js
// Customer 360: everything TY knows about one contact, in one response.
// GET ?phone=…&email=… — installer token auth, read-only. Matching is JS-side on
// the normalized last-10-digits (stored phone formats are free text); email is a
// secondary matcher for leads only. Non-admins see only their own bookings and
// leads; chat sessions follow the Chats-tab rule (mine + unassigned) and calls
// are the business line the Calls tab already shows. Each source fails
// independently to an empty array + partial:true — the view never all-or-nothings.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { normalizePhone, normalizeEmail, toLeadView } = require("./lib/leads.js");
const { normalizeInstallerKey } = require("./lib/routing.js");
const { TABLE: chatTable, parseTranscript } = require("./lib/chat-store.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);

async function fetchBookings({ c, list, pKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings });
  return recs.map((r) => {
    const f = r.fields || {};
    return { id: r.id, dateISO: dateOnly(f["Event Date"]), city: f.City || "",
      name: f.Name || "", vehicle: f.Vehicle || "", modelYear: f["Model Year"] || "",
      phone: f.Phone || "", email: f.Email || "", status: f.Status || "Booked",
      calibration: f["OTT Calibration"] || "", certSent: !!f["Certificate Sent"],
      scheduledTime: f["Scheduled Time"] || "", installer: normalizeInstallerKey(f.Installer),
      signed: !!(f["Customer Signature"] && String(f["Customer Signature"]).trim()) };
  }).filter((b) => normalizePhone(b.phone) === pKey && b.status !== "Cancelled")
    .filter((b) => admin || b.installer === key)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

async function fetchLeads({ c, list, pKey, eKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.priority });
  return recs.map(toLeadView)
    .filter((l) => (pKey && normalizePhone(l.phone) === pKey) || (eKey && normalizeEmail(l.email) === eKey))
    .filter((l) => admin || (l.installer || "") === key)
    .sort((a, b) => String(b.lastContact || "").localeCompare(String(a.lastContact || "")));
}

async function fetchChats({ env, c, list, pKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: chatTable(env),
    fields: ["Session ID", "Status", "Transcript", "Customer Name", "Phone", "Vehicle", "Installer", "Last Activity"] });
  return recs.map((r) => {
    const f = r.fields || {};
    const turns = parseTranscript(f.Transcript);
    const last = [...turns].reverse().find((t) => t.role !== "system");
    return { id: f["Session ID"] || "", customerName: f["Customer Name"] || "",
      phone: f.Phone || "", vehicle: f.Vehicle || "", status: f.Status || "ai",
      installer: f.Installer || "", lastActivity: f["Last Activity"] || "",
      lastText: last ? String(last.text || "").slice(0, 140) : "" };
  }).filter((s) => normalizePhone(s.phone) === pKey || String(s.id).replace(/\D/g, "").slice(-10) === pKey)
    .filter((s) => admin || !s.installer || s.installer === key)
    .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
}

async function fetchCalls({ env, fetchImpl, pKey }) {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !pKey) return [];
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const seen = {}, out = [];
  for (const q of [`To=%2B1${pKey}`, `From=%2B1${pKey}`]) {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=50&${q}`,
      { headers: { Authorization: auth } });
    if (!res.ok) continue;
    for (const cl of ((await res.json()).calls || [])) {
      if (seen[cl.sid]) continue;
      seen[cl.sid] = 1;
      out.push({ sid: cl.sid, direction: cl.direction === "inbound" ? "inbound" : "outbound",
        from: cl.from || "", to: cl.to || "", status: cl.status || "",
        startTime: cl.start_time || cl.date_created || "", duration: Number(cl.duration || 0) });
    }
  }
  return out.sort((a, b) => (Date.parse(b.startTime) || 0) - (Date.parse(a.startTime) || 0));
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  const list = ctx.listImpl || ((a) => listAllRecords({ fetchImpl, ...a }));
  if ((event.httpMethod || "GET") !== "GET") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const q = event.queryStringParameters || {};
  const pKey = normalizePhone(q.phone);
  const eKey = normalizeEmail(q.email);
  if (!pKey && !eKey) return { statusCode: 400, body: JSON.stringify({ error: "missing-contact" }) };
  const c = cfg(env);
  let partial = false;
  const safe = (p) => p.catch(() => { partial = true; return []; });
  const [bookings, leads, chats, calls] = await Promise.all([
    safe(pKey ? fetchBookings({ c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchLeads({ c, list, pKey, eKey, key, admin })),
    safe(pKey ? fetchChats({ env, c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchCalls({ env, fetchImpl, pKey })),
  ]);
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", partial, bookings, leads, chats, calls }) };
}
module.exports = { handler };
```

Note: `resolveInstaller`/`isAdmin` read `INSTALLER_TOKENS` + `ADMIN_INSTALLERS` — check `lib/installer-auth.js` for the exact admin env var name before running and adjust the test ENV if it differs.

- [ ] **Step 4: Run tests**

Run: `node --test tests/customer-view.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/customer-view.js tests/customer-view.test.js
git commit -m "feat(console): customer-view endpoint — 360 history for one contact"
```

### Task 3: Console — Overdue sub-tab + follow-up message UI + send flow

**Files:**
- Modify: `site/installer.html` — STATE (~line 353), renderTabs (~1185), renderLeads (~1784), leadCard follow-up row (~1859), chat reply submit (~1156)

- [ ] **Step 1: STATE + shared overdue predicate**

Add to the STATE literal (after `, theme: '', me: ''`):

```js
    , leadTab:'active', followupPending:null
```

Add near `isOpen` (top-level helpers):

```js
  function isOverdueLead(l){ return ACTIVE_LEAD_STAGES.indexOf(l.stage)>=0 && !!l.nextFollowup && l.nextFollowup<=STATE.today; }
```

In `renderTabs` replace the inline `due` filter with:

```js
    var due=STATE.leads.filter(isOverdueLead).length;
```

- [ ] **Step 2: renderLeads — sub-tabs, split views, reminder cards**

Replace the body of `renderLeads` after the search-box wiring (`qi.oninput=…`) with:

```js
    var visible=STATE.leads.filter(leadMatchesQ);
    var over=visible.filter(isOverdueLead).sort(function(a,b){ return (a.nextFollowup||'').localeCompare(b.nextFollowup||''); });
    var st=document.createElement('div'); st.style.cssText='display:flex;gap:8px;margin:8px 0';
    [['active','Active'],['overdue','⏰ Overdue'+(over.length?' ('+over.length+')':'')]].forEach(function(t){
      var b=document.createElement('button'); b.className='tabbtn'+(STATE.leadTab===t[0]?' on':''); b.textContent=t[1];
      b.onclick=function(){ STATE.leadTab=t[0]; renderLeads(); }; st.appendChild(b);
    });
    host.appendChild(st);
    if(STATE.leadTab==='overdue'){
      if(!over.length){ var oe=document.createElement('div'); oe.className='empty'; oe.textContent='Nothing overdue — every follow-up is handled. 🎉'; host.appendChild(oe); return; }
      over.forEach(function(l){ host.appendChild(reminderCard(l)); });
      return;
    }
    LEAD_STAGES.forEach(function(stage){
      var inStage=visible.filter(function(l){ return (l.stage||'New')===stage && !isOverdueLead(l); });
      if(!inStage.length) return;
      inStage.sort(function(a,b){ return (b.lastContact||'').localeCompare(a.lastContact||''); });
      host.appendChild(secHead(stage+' ('+inStage.length+')',''));
      inStage.forEach(function(l){ host.appendChild(leadCard(l)); });
    });
    var anyActive=visible.some(function(l){ return !isOverdueLead(l); });
    if(!anyActive){ var em=document.createElement('div'); em.className='empty';
      em.textContent = over.length ? 'All caught up here — '+over.length+' lead'+(over.length>1?'s':'')+' waiting under ⏰ Overdue.' : 'No leads yet. Use "＋ Log a lead" above.';
      host.appendChild(em); }
```

Then add `reminderCard` + `sendFollowup` immediately before `function leadCard(l){`:

```js
  // Overdue view: one focused reminder per lead — who, how late, what you planned
  // to say, one primary action. The full lead card stays reachable underneath.
  function reminderCard(l){
    var wrap=document.createElement('div'); wrap.className='card';
    var days=daysBetween(STATE.today, l.nextFollowup||STATE.today);
    var when=days<=0?'due today':(days===1?'1 day overdue':days+' days overdue');
    var head=document.createElement('div');
    head.innerHTML='<div class="top"><span class="who">'+(CHAN_ICON[l.channel]||'•')+' '+esc(l.name)+'</span>'+
      '<span class="pill hasopen">⏰ '+esc(when)+'</span></div>'+
      '<div class="meta">'+esc(l.vehicle||'—')+' · '+esc(l.city||'—')+' · '+esc(l.stage)+
      (l.installer&&STATE.admin?' · <span class="installer-tag">'+esc(l.installer)+'</span>':'')+'</div>'+
      (l.followupMessage?'<div class="meta" style="font-style:italic">“'+esc(l.followupMessage)+'”</div>':'');
    wrap.appendChild(head);
    if(l.phone){
      var send=document.createElement('button'); send.className='btn'; send.style.cssText='width:100%;margin:6px 0 2px';
      send.textContent='💬 Send follow-up'; send.onclick=function(){ send.disabled=true; sendFollowup(l); };
      wrap.appendChild(send);
    } else {
      var noP=document.createElement('div'); noP.className='empty'; noP.textContent='No phone on file — follow up by email below.'; wrap.appendChild(noP);
    }
    var det=leadCard(l);
    var ds=det.querySelector('summary');
    if(ds) ds.innerHTML='<span class="edate">Full lead — stages · notes · convert ›</span>';
    wrap.appendChild(det);
    return wrap;
  }
  // Approved flow (2026-07-30): prefilled draft, one tap to send. Opens/creates the
  // client's SMS thread with the saved message in the composer; the follow-up is
  // only marked handled when a send actually succeeds in that thread.
  async function sendFollowup(l){
    try{
      var r=await chatApi({op:'openSms', phone:l.phone, name:l.name, vehicle:l.vehicle});
      if(!(r&&r.session)){ fail('Could not open the chat — try again.'); return; }
      var msg=(l.followupMessage||'').trim();
      if(!msg){
        var first=(l.name||'').trim().split(/\s+/)[0]||'there';
        var me=STATE.me?cap(STATE.me):'Tuned Yota';
        msg='Hi '+first+", it's "+me+' with Tuned Yota'+(l.vehicle?' about your '+l.vehicle:'')+' — ';
      }
      STATE.chatPrefill=msg;
      STATE.followupPending={leadId:l.id, sessionId:r.session};
      STATE.tab='chats'; STATE.chatOpen=r.session; renderAll();
    }catch(e){ fail('Could not open the chat — try again.'); }
  }
```

- [ ] **Step 3: leadCard follow-up row — custom date + message**

Replace the existing quick-pick row

```js
    var fu=document.createElement('div'); fu.className='walkmini';
    [['Today',0],['Tomorrow',1],['+3d',3],['+1wk',7]].forEach(function(p){ fu.appendChild(act('Follow-up '+p[0],function(){ leadUpdate(l.id,{action:'setFollowup',date:addDays(STATE.today,p[1])}); })); });
    body.appendChild(fu);
```

with:

```js
    var fu=document.createElement('div'); fu.className='walkmini';
    var fuMsg=document.createElement('textarea'); fuMsg.placeholder='Message to send with the follow-up (optional)';
    fuMsg.rows=2; fuMsg.style.cssText='width:100%;padding:9px;font:inherit;font-size:14px;border:1px solid var(--t-line,#d8d2ca);border-radius:8px;margin:5px 0;resize:vertical;background:var(--t-input,#fff);color:inherit';
    fuMsg.value=l.followupMessage||'';
    function setFu(date){ leadUpdate(l.id,{action:'setFollowup',date:date,message:fuMsg.value}); }
    [['Today',0],['Tomorrow',1],['+3d',3],['+1wk',7]].forEach(function(p){ fu.appendChild(act('Follow-up '+p[0],function(){ setFu(addDays(STATE.today,p[1])); })); });
    var fuDate=document.createElement('input'); fuDate.type='date'; fuDate.value=l.nextFollowup||'';
    fuDate.onchange=function(){ if(fuDate.value) setFu(fuDate.value); };
    fu.appendChild(fuDate);
    body.appendChild(fu); body.appendChild(fuMsg);
```

- [ ] **Step 4: chat reply success clears the pending follow-up**

In `renderChatThread`'s `form.onsubmit`, capture the text and fire `followupSent` after a successful reply. Replace:

```js
      try{ await chatApi({op:'reply', session:replyId, text:tin.value}); tin.value='';
```

with:

```js
      var sentText=tin.value;
      try{ await chatApi({op:'reply', session:replyId, text:sentText}); tin.value='';
        var fp=STATE.followupPending;
        if(fp && fp.sessionId===replyId){
          STATE.followupPending=null;
          // Mark the follow-up handled: stamps Last Contact, clears date + message.
          // Fire-and-forget; the Overdue list refreshes on the next Leads load.
          fetch('/.netlify/functions/lead-update',{method:'POST',
            headers:{'Content-Type':'application/json','x-installer-token':tok()},
            body:JSON.stringify({id:fp.leadId,action:'followupSent',note:sentText.slice(0,200)})})
            .then(function(){ STATE.leadsLoaded=false; }).catch(function(){});
        }
```

- [ ] **Step 5: Static test + browser-suite run**

Append to a new `tests/installer-followups.test.js`:

```js
// Static wiring: the console's overdue/follow-up surfaces exist and use the
// approved prefilled-draft flow (never a direct send).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("leads view has Active/Overdue sub-tabs driven by STATE.leadTab", () => {
  assert.ok(HTML.includes("STATE.leadTab"));
  assert.ok(HTML.includes("⏰ Overdue"));
});
test("overdue reminders send through the chat prefilled-draft flow", () => {
  assert.ok(HTML.includes("sendFollowup"));
  assert.ok(HTML.includes("STATE.followupPending"));
  assert.ok(HTML.includes("followupSent"));
});
test("follow-ups carry an optional message", () => {
  assert.ok(HTML.includes("Message to send with the follow-up (optional)"));
  assert.ok(/action:'setFollowup',date:date,message:/.test(HTML));
});
```

Run: `node --test tests/installer-followups.test.js tests/leads-browser.test.mjs`
Expected: PASS. If `leads-browser.test.mjs` asserted the old overdue-first ordering inside stages, update it to select the new `⏰ Overdue` sub-tab (`STATE.leadTab='overdue'`) before asserting.

- [ ] **Step 6: Commit**

```bash
git add site/installer.html tests/installer-followups.test.js tests/leads-browser.test.mjs
git commit -m "feat(console): Overdue leads sub-tab + follow-up messages sent as prefilled chat drafts"
```

### Task 4: Console — customer 360 overlay + name-tap entry points

**Files:**
- Modify: `site/installer.html` — new `openCustomerView`/`renderCustomer` (place after `viewSignature`, ~line 587), `rowCard` (~2114), `leadCard` summary (~1814), `renderChatThread` header (~1104), `renderCalls` rows (~974)

- [ ] **Step 1: overlay + renderer**

Insert after `viewSignature`:

```js
  // Customer 360 (2026-07-30): one timeline for one human — bookings, lead
  // history, chats, calls — reachable from any name tap in the console.
  async function openCustomerView(p){
    var ov=document.getElementById('custov');
    if(!ov){
      ov=document.createElement('div'); ov.id='custov'; ov.className='reviewov';
      ov.innerHTML='<div class="reviewbox" style="max-width:560px;width:92%;max-height:88vh;overflow:auto;text-align:left">'+
        '<div id="custbody"></div>'+
        '<div style="height:10px"></div><button class="btn" id="custclose" style="width:100%">Close</button></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',function(e){ if(e.target===ov) ov.style.display='none'; });
      document.getElementById('custclose').onclick=function(){ ov.style.display='none'; };
    }
    ov.style.display='flex';
    var body=document.getElementById('custbody');
    body.innerHTML='<div class="reviewh" style="text-align:left">'+esc(p.name||'Customer')+'</div><div class="empty">Loading history…</div>';
    var ctrl=new AbortController(), timer=setTimeout(function(){ ctrl.abort(); },15000);
    var qs=[]; if(p.phone) qs.push('phone='+encodeURIComponent(p.phone)); if(p.email) qs.push('email='+encodeURIComponent(p.email));
    try{
      var res=await fetch('/.netlify/functions/customer-view?'+qs.join('&'),{headers:{'x-installer-token':tok()},signal:ctrl.signal});
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      if(!res.ok) throw new Error('http '+res.status);
      renderCustomer(body, p, await res.json());
    }catch(e){
      body.innerHTML='<div class="reviewh" style="text-align:left">'+esc(p.name||'Customer')+'</div><div class="empty">Couldn’t load the history — check the connection.</div>';
      var rb=document.createElement('button'); rb.className='btn'; rb.style.width='100%'; rb.textContent='Retry';
      rb.onclick=function(){ openCustomerView(p); }; body.appendChild(rb);
    }finally{ clearTimeout(timer); }
  }
  function custClose(){ var ov=document.getElementById('custov'); if(ov) ov.style.display='none'; }
  function renderCustomer(body, p, d){
    var name=p.name||'', vehicle='', phone=p.phone||'', email=p.email||'';
    (d.bookings||[]).concat(d.leads||[]).forEach(function(x){
      if(!name&&x.name) name=x.name; if(!vehicle&&x.vehicle) vehicle=x.vehicle;
      if(!phone&&x.phone) phone=x.phone; if(!email&&x.email) email=x.email; });
    var done=(d.bookings||[]).filter(function(b){ return b.status==='Completed'; }).length;
    body.innerHTML='<div class="reviewh" style="text-align:left">'+esc(name||'Customer')+'</div>'+
      '<div class="meta">'+esc(vehicle||'')+(phone?' · '+esc(phone):'')+(email?' · '+esc(email):'')+'</div>'+
      '<div class="tally"><span><b>'+(d.bookings||[]).length+'</b> bookings</span><span class="g"><b>'+done+'</b> completed</span>'+
      '<span><b>'+(d.chats||[]).length+'</b> chats</span><span><b>'+(d.calls||[]).length+'</b> calls</span></div>'+
      '<div class="walkmini" id="custact" style="display:flex;gap:8px;flex-wrap:wrap"></div>'+
      (d.partial?'<div class="ffnote">Some history sources didn’t load — this view may be incomplete.</div>':'')+
      '<div class="sec"><span class="lbl">Timeline</span></div><div id="custtl"></div>';
    var ar=document.getElementById('custact');
    if(phone){ ar.appendChild(linkBtn('Call','tel:'+phone)); ar.appendChild(linkBtn('Text','sms:'+phone)); }
    if(email){ ar.appendChild(linkBtn('Email','mailto:'+email)); }
    if(phone){
      var oc=document.createElement('button'); oc.className='btn'; oc.textContent='💬 Open chat';
      oc.onclick=async function(){ oc.disabled=true;
        try{ var r=await chatApi({op:'openSms', phone:phone, name:name, vehicle:vehicle});
          if(r&&r.session){ custClose(); STATE.tab='chats'; STATE.chatOpen=r.session; renderAll(); return; }
        }catch(e){}
        oc.disabled=false; oc.textContent='Chat failed — retry'; };
      ar.appendChild(oc);
    }
    var items=[];
    (d.bookings||[]).forEach(function(b){ items.push({t:b.dateISO||'', html:
      '<div class="card"><div class="top"><span class="who">🔧 '+esc(b.city||'Booking')+'</span><span class="edate">'+esc(relDate(b.dateISO))+'</span></div>'+
      '<div class="meta">'+esc(((b.modelYear?b.modelYear+' ':'')+(b.vehicle||'')).trim())+'</div>'+
      '<div class="meta">'+(b.status==='Completed'
        ? '<span class="done">✓ Completed'+(b.calibration?' · '+esc(b.calibration):'')+'</span>'+(b.certSent?' · 📜 cert sent':'')
        : (b.status==='No-show'?'<span class="noshow">✗ No-show</span>':esc(b.status)))+'</div>'+
      (b.signed?'<a href="#" class="link" data-custsig="'+esc(b.id)+'">✍ Signed — view</a>':'')+'</div>'}); });
    (d.leads||[]).forEach(function(l){ items.push({t:l.lastContact||(l.createdTime||'').slice(0,10), html:
      '<div class="card"><div class="top"><span class="who">'+(CHAN_ICON[l.channel]||'🧲')+' Lead — '+esc(l.stage)+'</span><span class="edate">'+esc(l.lastContact||'')+'</span></div>'+
      (l.nextFollowup?'<div class="meta">⏰ follow-up '+esc(l.nextFollowup)+(l.followupMessage?' — “'+esc(l.followupMessage)+'”':'')+'</div>':'')+
      (l.activity?'<div class="edate" style="white-space:pre-wrap;margin-top:4px">'+esc(l.activity)+'</div>':'')+'</div>'}); });
    (d.chats||[]).forEach(function(s){ items.push({t:(s.lastActivity||'').slice(0,10), html:
      '<div class="card" style="cursor:pointer" data-custchat="'+esc(s.id)+'"><div class="top"><span class="who">'+chanBadge(s.id)+' Chat'+(s.status==='closed'?' · closed':'')+'</span><span class="edate">'+esc(relTime(s.lastActivity))+'</span></div>'+
      '<div class="csnip">'+esc(s.lastText||'')+'</div><div class="edate">tap to open ›</div></div>'}); });
    (d.calls||[]).forEach(function(cl){
      var missed=cl.direction==='inbound'&&['no-answer','busy','failed','canceled'].indexOf(cl.status)>=0;
      var dd=new Date(cl.startTime), iso=isNaN(dd)?'':dd.toISOString().slice(0,10);
      items.push({t:iso, html:
      '<div class="card"><div class="top"><span class="who">📞 '+(cl.direction==='inbound'?'Incoming call':'Outgoing call')+(missed?' · <span class="noshow">missed</span>':'')+'</span><span class="edate">'+esc(relTime(cl.startTime))+'</span></div>'+
      (cl.duration&&!missed?'<div class="meta">'+fmtCallDur(cl.duration)+'</div>':'')+'</div>'}); });
    items.sort(function(a,b){ return String(b.t).localeCompare(String(a.t)); });
    var tl=document.getElementById('custtl');
    tl.innerHTML=items.length?items.map(function(x){ return x.html; }).join(''):'<div class="empty">No history for this contact yet.</div>';
    Array.prototype.forEach.call(tl.querySelectorAll('[data-custsig]'),function(a2){
      a2.onclick=function(e){ e.preventDefault(); viewSignature(a2.getAttribute('data-custsig')); }; });
    Array.prototype.forEach.call(tl.querySelectorAll('[data-custchat]'),function(cel){
      cel.onclick=function(){ custClose(); STATE.tab='chats'; STATE.chatOpen=cel.getAttribute('data-custchat'); renderAll(); }; });
  }
```

- [ ] **Step 2: entry point — booking cards (rowCard)**

In `rowCard`'s `head` string, replace `esc(b.name)` with:

```js
'<a href="#" data-cust style="color:inherit;text-decoration:underline dotted">'+esc(b.name)+'</a>'
```

Add helper right above `rowCard`:

```js
  function wireCust(c,b){ var a=c.querySelector('[data-cust]');
    if(a) a.onclick=function(ev){ ev.preventDefault(); openCustomerView({phone:b.phone||'',email:b.email||'',name:b.name||''}); }; }
```

Call `wireCust(c,b);` immediately before **each** `return c;` in `rowCard` (Completed branch, No-show branch, and the open-booking branch at the end).

- [ ] **Step 3: entry point — lead cards**

In `leadCard`, the summary name span `'…class="etitle">'+(CHAN_ICON[l.channel]||'•')+' '+esc(l.name)+'</span>'` becomes:

```js
'…class="etitle">'+(CHAN_ICON[l.channel]||'•')+' <a href="#" data-cust style="color:inherit;text-decoration:underline dotted">'+esc(l.name)+'</a></span>'
```

After `det.appendChild(sum);` add:

```js
    var custA=sum.querySelector('[data-cust]');
    if(custA) custA.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); openCustomerView({phone:l.phone||'',email:l.email||'',name:l.name||''}); };
```

(`stopPropagation` so the tap doesn't toggle the `<details>`.)

- [ ] **Step 4: entry point — chat thread header**

In `renderChatThread`'s header, `'<b>'+esc(j.customerName||'Customer')+'</b>'` becomes:

```js
'<a href="#" id="chatcust" style="color:inherit"><b>'+esc(j.customerName||'Customer')+'</b></a>'
```

After the `chatback` wiring add:

```js
    var cc=document.getElementById('chatcust');
    if(cc) cc.onclick=function(e){ e.preventDefault(); openCustomerView({phone:j.phone||'',name:j.customerName||''}); };
```

- [ ] **Step 5: entry point — call rows**

In `renderCalls`, `'<div style="font-weight:700">'+esc(title)+…` becomes:

```js
'<div style="font-weight:700"><a href="#" data-custcall="'+i+'" style="color:inherit;text-decoration:underline dotted">'+esc(title)+'</a>'+…
```

After the existing `[data-callmsg]` wiring add:

```js
      Array.prototype.forEach.call(host.querySelectorAll('[data-custcall]'),function(a){ a.onclick=function(e){
        e.preventDefault();
        var c=STATE.calls[Number(a.getAttribute('data-custcall'))]; if(!c) return;
        var m=who[callDigits(callParty(c))]||{};
        openCustomerView({phone:callParty(c), name:m.name||''});
      }; });
```

- [ ] **Step 6: static test**

Create `tests/installer-customer-360.test.js`:

```js
// Static wiring: the customer 360 overlay exists and every surface links into it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("customer view fetches customer-view with installer auth", () => {
  assert.ok(HTML.includes("/.netlify/functions/customer-view?"));
  const fn = HTML.slice(HTML.indexOf("async function openCustomerView"));
  assert.ok(fn.slice(0, 1200).includes("x-installer-token"));
});
test("all four surfaces open the customer view", () => {
  assert.ok(HTML.includes("data-cust "), "booking/lead name anchors");
  assert.ok(HTML.includes('id="chatcust"'), "chat header");
  assert.ok(HTML.includes("data-custcall"), "call rows");
});
test("timeline covers bookings, leads, chats, calls", () => {
  const fn = HTML.slice(HTML.indexOf("function renderCustomer"));
  for (const probe of ["d.bookings", "d.leads", "d.chats", "d.calls", "data-custchat", "data-custsig"])
    assert.ok(fn.includes(probe), probe);
});
```

Run: `node --test tests/installer-customer-360.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add site/installer.html tests/installer-customer-360.test.js
git commit -m "feat(console): customer 360 view — one timeline per human, tap any name"
```

### Task 5: Full suite, Airtable column, deploy

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: all green (1283+ tests). Fix any console browser-suite tests that asserted the old leads ordering.

- [ ] **Step 2: Add the `Follow-up Message` column**

Try the Airtable Meta API with the existing token (needs `schema.bases:write`); if it 403s, tell the owner to add a long-text field named exactly `Follow-up Message` to the Priority List table. Writes are tolerant either way — dates save even while the column is missing, messages start persisting the moment it exists.

- [ ] **Step 3: Ship**

Follow the `/ship` skill (regenerate → test → pathspec commit → push master → live verification). Live checks: `/installer` 200; `GET /.netlify/functions/customer-view?phone=5555550100` without a token → 401; with a valid token → 200 JSON.

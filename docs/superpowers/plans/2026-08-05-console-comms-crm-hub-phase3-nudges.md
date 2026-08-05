# Communication Nudges (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let installers set a communication nudge (a dated follow-up reminder + note) on a person from anywhere in the console — a chat thread or a contact's Customer 360 — with quick-picks and a "remind me before an event" helper, creating a lead for the person if none exists.

**Architecture:** A thin `set-nudge.js` endpoint find-or-creates a lead (via existing `processLeadIngest`) and writes the follow-up via existing `applyLeadUpdate`'s `setFollowup` branch — so nudges reuse the Priority List's `Next Follow-up`/`Follow-up Message` fields and the existing morning `lead-followups` sweep + week-calendar surfacing. The console adds one reusable `openNudgeDialog(person)` modal (client-side date math for quick-picks and "before a date"), hooked from the chat header and Customer 360.

**Tech Stack:** Node.js Netlify functions, Airtable REST, `node --test` (deps-injected), vanilla-JS SPA (`site/installer.html`).

This is Phase 3 of the spec `docs/superpowers/specs/2026-08-05-console-comms-crm-hub-design.md`. Phase 4 (Purchases) gets its own plan.

## Scope note — surfacing already exists

The spec's "surface reminders due" is already covered and is **not** rebuilt here: the week calendar renders follow-ups by day (`followupsByDay`/`renderWeek`), the Leads list shows `nextFollowup`/`followupMessage` inline, and the scheduled `lead-followups.js` sweep web-pushes each installer their due/overdue count each morning (via `dueLeads`). Phase 3 adds only the missing capability — **setting** a nudge from a chat/contact. (A dedicated "Reminders due" strip is a possible future polish.)

## File structure

- **Create** `netlify/functions/set-nudge.js` — GET-not-allowed/POST endpoint: auth, resolve lead (explicit `leadId` or find-or-create via `processLeadIngest`), apply `setFollowup`. Thin composition of existing helpers.
- **Create** `tests/set-nudge.test.js` — auth (401), bad-date (400), set-on-existing-lead, find-or-create path, non-admin ownership.
- **Modify** `site/installer.html` — nudge date helpers, `STATE` fields, `openNudgeDialog`/`renderNudge` modal, and two hooks (Customer 360 action row + chat thread header).

Reused (do not reimplement): `processLeadIngest`, `applyLeadUpdate`, `toLeadView` (`lib/leads.js`); `resolveInstaller`/`isAdmin` (`lib/installer-auth.js`); `cfg`/`getRecord`/`updateRecord`/`updateTolerant` (`lib/airtable.js`); `withCors` (`lib/cors.js`); console `tok()`, `esc()`, `succeed()`, `fail()`, `relDate()`, `openCustomerView`/`renderCustomer`, `renderChatThread`.

---

### Task 1: `set-nudge.js` endpoint

**Files:**
- Create: `netlify/functions/set-nudge.js`
- Test: `tests/set-nudge.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/set-nudge.test.js`:

```js
// tests/set-nudge.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/set-nudge.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", INSTALLER_TOKENS: JSON.stringify({ aaron: "SECRET", cody: "CODYTOK" }), INSTALLER_ADMINS: "aaron" };
const H = { "x-installer-token": "SECRET" };
const REC = (over = {}) => ({ id: "ld1", fields: Object.assign({ Name: "Pat Lee", Phone: "612-406-7117", Installer: "aaron", Stage: "Qualified", "Activity Log": "" }, over) });

function ctx(over = {}) {
  return Object.assign({
    env: ENV, now: new Date("2026-08-05T12:00:00Z"),
    getImpl: async () => REC(),
    updateImpl: async (a) => { ctx._patch = a.fields; return { id: a.id }; },
    ingestImpl: async () => ({ status: "lead", recordId: "ldNEW", deduped: false }),
  }, over);
}

test("set-nudge 401s without a valid token", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, ctx());
  assert.equal(res.statusCode, 401);
});

test("set-nudge rejects a bad date", async () => {
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", date: "soon" }) }, ctx());
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad-date");
});

test("set-nudge writes Next Follow-up + message on an existing lead", async () => {
  const c = ctx();
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ leadId: "ld1", date: "2026-10-01", message: "check supercharger build" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(c._patch["Next Follow-up"], "2026-10-01");
  assert.equal(c._patch["Follow-up Message"], "check supercharger build");
  assert.equal(JSON.parse(res.body).leadId, "ld1");
});

test("set-nudge find-or-creates a lead when no leadId is given", async () => {
  let ingestedName = null;
  const c = ctx({ ingestImpl: async (b) => { ingestedName = b.name; return { status: "lead", recordId: "ldNEW", deduped: false }; },
    getImpl: async (a) => REC({}) });
  const res = await handler({ httpMethod: "POST", headers: H, body: JSON.stringify({ name: "New Person", phone: "218-555-1212", date: "2026-09-01" }) }, c);
  assert.equal(res.statusCode, 200);
  assert.equal(ingestedName, "New Person");   // ingest was called to create the lead
});

test("set-nudge blocks a non-admin from nudging another installer's lead", async () => {
  const res = await handler({ httpMethod: "POST", headers: { "x-installer-token": "CODYTOK" },
    body: JSON.stringify({ leadId: "ld1", date: "2026-10-01" }) }, ctx({ getImpl: async () => REC({ Installer: "aaron" }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "not-your-market");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/set-nudge.test.js`
Expected: FAIL — cannot find module `set-nudge.js`.

- [ ] **Step 3: Create the endpoint**

Create `netlify/functions/set-nudge.js`:

```js
// netlify/functions/set-nudge.js
// Set a communication nudge (a dated follow-up reminder + note) on a person from
// anywhere in the console — a chat, a contact card, or a lead. Nudges live on the
// Priority List (Next Follow-up + Follow-up Message); a person without an active
// lead gets one created (find-or-create via processLeadIngest) so the reminder has
// a home and surfaces in the existing due-leads sweep. Reuses applyLeadUpdate's
// setFollowup branch — one code path for "how a follow-up is written."
const { cfg, getRecord, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, processLeadIngest } = require("./lib/leads.js");
const { withCors } = require("./lib/cors.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  if ((event.httpMethod || "POST") !== "POST") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const date = String(body.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { statusCode: 400, body: JSON.stringify({ error: "bad-date" }) };
  const message = String(body.message || "").trim().slice(0, 500);

  const c = cfg(env);
  const getImpl = ctx.getImpl || ((a) => getRecord({ ...a }));
  const updateImpl = ctx.updateImpl || ((a) => updateRecord({ ...a }));
  const ingest = ctx.ingestImpl || ((b) => processLeadIngest(b, { env, now }));

  // Resolve the lead: an explicit id, else find-or-create one for the person.
  let leadId = String(body.leadId || "").trim();
  if (!leadId) {
    const name = String(body.name || "").trim() || String(body.phone || "").trim() || String(body.email || "").trim();
    let r;
    try { r = await ingest({ name, phone: body.phone || "", email: body.email || "", vehicle: body.vehicle || "",
      city: body.city || "", channel: body.channel || "chat", source: "nudge", message: "reminder set" }); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    if (!r || r.status === "error" || !r.recordId) return { statusCode: 400, body: JSON.stringify({ error: (r && r.error) || "no-lead" }) };
    leadId = r.recordId;
  }

  let rec;
  try { rec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: leadId }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const lead = toLeadView(rec);
  if (!admin && lead.installer && lead.installer !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };

  const built = applyLeadUpdate(lead, "setFollowup", { date, message }, now);
  if (built.error) return { statusCode: 400, body: JSON.stringify({ error: built.error }) };
  try {
    await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id: leadId, fields: built.fields },
      ["Next Follow-up", "Follow-up Message", "Activity Log"]);
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", leadId, nextFollowup: date }) };
}
module.exports = { handler: withCors(handler) };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/set-nudge.test.js`
Expected: PASS (5 tests). If `updateTolerant`'s real signature differs from `(updateFn, params, tolerantFields)`, check `lib/airtable.js` and match it — the test's `updateImpl` receives the `params` object and reads `.fields`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/set-nudge.js tests/set-nudge.test.js
git commit -m "feat(nudges): set-nudge endpoint (find-or-create lead + setFollowup)"
```

---

### Task 2: Console — date helpers, state, and the nudge modal

**Files:**
- Modify: `site/installer.html` (`STATE` init ~366-367; add helpers + `openNudgeDialog`/`renderNudge` near `openCustomerView` ~654)

No unit test (SPA); verified live in Task 4.

- [ ] **Step 1: Add nudge fields to STATE**

In `site/installer.html`, in the `STATE` initializer, find the Phase-2 contacts line:

```js
    , contacts:[], contactsLoaded:false, contactQ:'', contactSort:'last', contactTerritory:''
```

and append nudge fields on the next line inside the same object:

```js
    , contacts:[], contactsLoaded:false, contactQ:'', contactSort:'last', contactTerritory:''
    , nudgePerson:null, nudgeDate:'', nudgeMsg:''
```

- [ ] **Step 2: Add the date helpers and the modal**

Immediately after the `custClose` function (`function custClose(){ ... }`, ~line 654), add:

```js
  function nudgeAddDays(iso, n){ var d=new Date((iso||STATE.today)+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function nudgeAddMonths(iso, n){ var d=new Date((iso||STATE.today)+'T00:00:00'); d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); }
  function openNudgeDialog(person){
    STATE.nudgePerson = person || {}; STATE.nudgeDate = nudgeAddDays(STATE.today,7); STATE.nudgeMsg = '';
    var ov=document.getElementById('nudgeov');
    if(!ov){ ov=document.createElement('div'); ov.id='nudgeov'; ov.className='reviewov';
      ov.innerHTML='<div class="reviewbox" style="max-width:440px;width:92%;text-align:left"><div id="nudgebody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click',function(e){ if(e.target===ov) ov.style.display='none'; }); }
    ov.style.display='flex';
    renderNudge();
  }
  function closeNudge(){ var ov=document.getElementById('nudgeov'); if(ov) ov.style.display='none'; }
  function renderNudge(){
    var b=document.getElementById('nudgebody'); if(!b) return;
    var p=STATE.nudgePerson||{};
    function chip(label,iso){ return '<button type="button" class="btn'+(STATE.nudgeDate===iso?' on':'')+'" data-nudgedate="'+iso+'" style="font-size:12px">'+label+'</button>'; }
    b.innerHTML='<div class="reviewh" style="text-align:left">⏰ Set reminder</div>'+
      '<div class="meta">'+esc(p.name||p.phone||p.email||'Customer')+(p.vehicle?' · '+esc(p.vehicle):'')+'</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">'+
        chip('In 1 week', nudgeAddDays(STATE.today,7))+chip('In 2 weeks', nudgeAddDays(STATE.today,14))+
        chip('In 1 month', nudgeAddMonths(STATE.today,1))+chip('In 2 months', nudgeAddMonths(STATE.today,2))+'</div>'+
      '<div class="sec"><span class="lbl">Remind me on</span></div>'+
      '<input id="nudgedate" type="date" value="'+esc(STATE.nudgeDate)+'" style="font:inherit;padding:6px;width:100%;box-sizing:border-box">'+
      '<div class="sec" style="margin-top:10px"><span class="lbl">…or a set time before an event</span></div>'+
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input id="nudgeevent" type="date" style="font:inherit;padding:6px">'+
        '<button type="button" class="btn" id="nudgeb7" style="font-size:12px">1 wk before</button><button type="button" class="btn" id="nudgeb14" style="font-size:12px">2 wk before</button></div>'+
      '<div class="sec" style="margin-top:10px"><span class="lbl">Note (optional)</span></div>'+
      '<textarea id="nudgemsg" rows="2" placeholder="e.g. check in about the supercharger build" style="font:inherit;padding:6px;width:100%;box-sizing:border-box">'+esc(STATE.nudgeMsg||'')+'</textarea>'+
      '<div style="height:10px"></div><button class="btn" id="nudgesave" style="width:100%">Set reminder</button>'+
      '<div style="height:6px"></div><button class="btn" id="nudgecancel" style="width:100%">Cancel</button>';
    Array.prototype.forEach.call(b.querySelectorAll('[data-nudgedate]'),function(el){ el.onclick=function(){ STATE.nudgeMsg=(document.getElementById('nudgemsg')||{}).value||STATE.nudgeMsg; STATE.nudgeDate=el.getAttribute('data-nudgedate'); renderNudge(); }; });
    var di=document.getElementById('nudgedate'); if(di) di.onchange=function(){ STATE.nudgeDate=di.value; };
    var ev=document.getElementById('nudgeevent');
    document.getElementById('nudgeb7').onclick=function(){ if(ev&&ev.value){ STATE.nudgeMsg=(document.getElementById('nudgemsg')||{}).value||STATE.nudgeMsg; STATE.nudgeDate=nudgeAddDays(ev.value,-7); renderNudge(); } };
    document.getElementById('nudgeb14').onclick=function(){ if(ev&&ev.value){ STATE.nudgeMsg=(document.getElementById('nudgemsg')||{}).value||STATE.nudgeMsg; STATE.nudgeDate=nudgeAddDays(ev.value,-14); renderNudge(); } };
    document.getElementById('nudgecancel').onclick=closeNudge;
    document.getElementById('nudgesave').onclick=async function(){
      var msg=(document.getElementById('nudgemsg')||{}).value||'';
      var save=document.getElementById('nudgesave'); save.disabled=true; save.textContent='Saving…';
      try{
        var res=await fetch('/.netlify/functions/set-nudge',{method:'POST',
          headers:{'Content-Type':'application/json','x-installer-token':tok()},
          body:JSON.stringify({ leadId:p.leadId||'', name:p.name||'', phone:p.phone||'', email:p.email||'', vehicle:p.vehicle||'', city:p.city||'', date:STATE.nudgeDate, message:msg })});
        var out=await res.json().catch(function(){return{};});
        if(res.ok && out.status==='ok'){ closeNudge(); succeed('⏰ Reminder set for '+relDate(STATE.nudgeDate)+'.'); if(STATE.leadsLoaded) loadLeads(); }
        else { save.disabled=false; save.textContent='Set reminder'; fail('Could not set reminder: '+((out&&out.error)||res.status)); }
      }catch(e){ save.disabled=false; save.textContent='Set reminder'; fail('Network error — reminder not set.'); }
    };
  }
```

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(nudges): reminder modal with quick-picks and before-a-date helper"
```

---

### Task 3: Console — hook the nudge dialog into Customer 360 + chat header

**Files:**
- Modify: `site/installer.html` (`renderCustomer` action row ~668-679; `renderChatThread` header ~1228-1230)

- [ ] **Step 1: Add a "Set reminder" button to Customer 360**

In `renderCustomer`, find the `#custact` action-row wiring (the block that appends Call/Text/Email and the "Open chat" button, ~line 668-679). Immediately AFTER the `if(phone){ var oc=... ar.appendChild(oc); }` block, add:

```js
    var rem=document.createElement('button'); rem.className='btn'; rem.textContent='⏰ Set reminder';
    rem.onclick=function(){ openNudgeDialog({ name:name, phone:phone, email:email, vehicle:vehicle }); };
    ar.appendChild(rem);
```

- [ ] **Step 2: Add a "remind" link to the chat thread header**

In `renderChatThread`, find the header line that renders the AI toggle + close link (~line 1228-1230), which contains:

```js
      ' · <a href="#" id="chatclose" style="color:var(--muted,#8a8a8e)">close chat</a></p>'+
```

Change that segment to insert a remind link before `close chat`:

```js
      ' · <a href="#" id="chatremind">⏰ remind</a>'+
      ' · <a href="#" id="chatclose" style="color:var(--muted,#8a8a8e)">close chat</a></p>'+
```

Then, near where the other header links are wired (where `chatback`/`chatcust`/`chatclose` handlers are set, after the `host.innerHTML = html;` assignment in `renderChatThread`), add a handler for the remind link:

```js
    var crem=document.getElementById('chatremind');
    if(crem) crem.onclick=function(e){ e.preventDefault(); openNudgeDialog({ name:j.customerName||'', phone:j.phone||'', vehicle:j.vehicle||'' }); };
```

(Place this next to the existing `var back=document.getElementById('chatback'); ...` wiring so `j` is in scope.)

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(nudges): set-reminder entry points on Customer 360 and chat header"
```

---

### Task 4: Full test run, ship, live verification

**Files:** none (deploy + verify)

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: all tests pass (0 fail), including the new `set-nudge` tests. No SEO inputs changed; `build:seo` not needed.

- [ ] **Step 2: Push to master (deploy)**

```bash
git push origin master
```

- [ ] **Step 3: Confirm Netlify published**

```bash
netlify api listSiteDeploys --data '{"site_id":"47fd6491-fd07-4f6b-9e1e-20a83e164d36","per_page":3}'
```

Expected: newest deploy `state: ready`, `commit_ref` = the pushed commit.

- [ ] **Step 4: Live verify**

Endpoint auth (POST without token → 401):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://tunedyota.com/.netlify/functions/set-nudge -H "Content-Type: application/json" --data '{"date":"2026-10-01"}'
```

Expected: `401`.

Then open `https://tunedyota.com/installer` (hard refresh) and confirm:
- Opening a chat thread shows a **⏰ remind** link in the header; clicking it opens the reminder modal.
- Opening a contact's Customer 360 shows a **⏰ Set reminder** button; clicking it opens the modal.
- The modal's quick-picks set the date; the "1 wk / 2 wk before" buttons compute a date from the event date; Save shows "⏰ Reminder set for …" and the follow-up appears on that person's lead (visible in the Leads list / week calendar).

- [ ] **Step 5: Mark Phase 3 complete**

Phase 3 is shippable on its own. Phase 4 (Purchases & Ownership) is planned separately.

---

## Self-review

- **Spec coverage (Pillar 3):** reuse `Next Follow-up`/`Follow-up Message` ✓ (Task 1 via `applyLeadUpdate` setFollowup); set from a conversation AND a contact card ✓ (Task 3 hooks); auto-create a lead when none exists ✓ (Task 1 `processLeadIngest`); quick-picks (1wk/2wk/1mo/2mo) + "remind me before [date]" helper ✓ (Task 2 modal + client date math); surfacing via existing dueLeads sweep + calendar ✓ (documented in Scope note — not rebuilt).
- **Placeholders:** none — every code step shows exact code and commands.
- **Type/name consistency:** endpoint contract `{leadId?, name, phone, email, vehicle, city, date, message}` → `{status,leadId,nextFollowup}` is consistent between `set-nudge.js`, its test, and the console `fetch`; `openNudgeDialog`/`renderNudge`/`closeNudge`/`nudgeAddDays`/`nudgeAddMonths` and `STATE.nudgePerson`/`nudgeDate`/`nudgeMsg` are consistent across Tasks 2–3.
- **Scope:** Phase 3 only — the set capability; surfacing intentionally reuses existing infrastructure.
- **Deviation noted:** the dedicated "Reminders due" strip from the spec is not built; the existing week calendar + Leads inline + morning `lead-followups` push already surface due nudges. Flagged as optional future polish.

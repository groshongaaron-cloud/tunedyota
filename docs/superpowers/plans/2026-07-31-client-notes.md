# Client Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installer-written stamped notes that live on the client (Lead) record and surface on every booking card and lead card for that client.

**Architecture:** One new Airtable long-text column `Client Notes` on the Leads (Priority List) table, append-only stamped lines built server-side. One new Netlify function `installer-client-note.js` accepts `{leadId, note}` or `{bookingId, note}`; the booking path resolves the client (linked lead → phone → email → mint a market-routed linked lead). Console joins notes client-side from already-loaded leads.

**Tech Stack:** Netlify functions (CommonJS), Airtable REST via `lib/airtable.js`, `node --test`, static-HTML wiring tests for `site/installer.html`.

**Spec:** `docs/superpowers/specs/2026-07-31-client-notes-design.md`

**Repo rule:** tests green → commit → push in one motion (memory: push-after-commit-tunedyota). Pull before touching `installer.html` (parallel sessions).

---

### Task 1: `toLeadView` exposes `clientNotes`

**Files:**
- Modify: `netlify/functions/lib/leads.js` (inside `toLeadView`, next to `activity:`)
- Test: `tests/installer-client-note.test.js` (new file)

- [ ] **Step 1: Write the failing test**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toLeadView } = require("../netlify/functions/lib/leads.js");

test("toLeadView exposes Client Notes as clientNotes", () => {
  const v = toLeadView({ id: "recL", fields: { Name: "Jane", "Client Notes": "2026-07-31 14:03 — cody: has aFe CAI" } });
  assert.equal(v.clientNotes, "2026-07-31 14:03 — cody: has aFe CAI");
  assert.equal(toLeadView({ id: "recL", fields: {} }).clientNotes, "");
});
```

- [ ] **Step 2: Run it** — `node --test tests/installer-client-note.test.js` → FAIL (`clientNotes` undefined)

- [ ] **Step 3: Implement** — in `toLeadView`, after the `activity:` line add:

```js
    clientNotes: f["Client Notes"] || "",
```

- [ ] **Step 4: Run it** → PASS. Also run the full suite once (`npm test`) to confirm no view-shape test breaks.

- [ ] **Step 5: Commit** — `feat(leads): toLeadView exposes Client Notes`

---

### Task 2: `installer-client-note.js` — lead path

**Files:**
- Create: `netlify/functions/installer-client-note.js`
- Test: `tests/installer-client-note.test.js` (append)

- [ ] **Step 1: Write the failing tests**

```js
const { processClientNote } = require("../netlify/functions/installer-client-note.js");
const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-07-31T14:03:00Z");
const leadRec = (installer, extra = {}) => ({ id: "recL", fields: { Name: "Jane", Installer: installer, Phone: "(612) 555-0100", ...extra } });

test("lead path appends a stamped line and touches nothing else", async () => {
  let patched;
  const out = await processClientNote({ leadId: "recL", note: "has aFe cold air intake" },
    { env, key: "cody", now: NOW, get: async () => leadRec("cody", { "Client Notes": "2026-07-30 09:00 — cody: wants 91 octane cal" }),
      update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.fields["Client Notes"],
    "2026-07-30 09:00 — cody: wants 91 octane cal\n2026-07-31 14:03 — cody: has aFe cold air intake");
  assert.deepEqual(Object.keys(patched.fields), ["Client Notes"]); // no Last Contact bump
  assert.equal(out.notes, patched.fields["Client Notes"]);
});

test("first note on a lead needs no existing text", async () => {
  let patched;
  const out = await processClientNote({ leadId: "recL", note: "prefers text" },
    { env, key: "cody", now: NOW, get: async () => leadRec("cody"), update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.fields["Client Notes"], "2026-07-31 14:03 — cody: prefers text");
});

test("lead path rejects another installer's lead; admin passes", async () => {
  const deny = await processClientNote({ leadId: "recL", note: "x" },
    { env, key: "noah", now: NOW, get: async () => leadRec("cody"), update: async () => ({}) });
  assert.equal(deny.error, "not-yours");
  const ok = await processClientNote({ leadId: "recL", note: "x" },
    { env, key: "aaron", admin: true, now: NOW, get: async () => leadRec("cody"), update: async () => ({}) });
  assert.equal(ok.status, "ok");
});

test("empty and oversize notes are rejected", async () => {
  assert.equal((await processClientNote({ leadId: "recL", note: "  " }, { env, key: "cody" })).error, "missing-note");
  assert.equal((await processClientNote({ leadId: "recL", note: "x".repeat(501) }, { env, key: "cody" })).error, "note-too-long");
});
```

- [ ] **Step 2: Run** → FAIL (module not found)

- [ ] **Step 3: Implement the function (lead path + handler; booking path stubs to `missing-target`)**

```js
// netlify/functions/installer-client-note.js
// Append a stamped note to the CLIENT record (Leads / Priority List row) — never
// the booking. Owner rule (2026-07-31): notes travel with the client, so they're
// simply there on the second, third, or zeroth booking. Accepts {leadId, note}
// from a lead card, or {bookingId, note} from a booking card — the booking path
// resolves the client (linked lead → phone → email → mint a linked lead).
// Never bumps Last Contact: a note is not a contact, and Last Contact drives
// the stale/nurture logic. Works on Completed/Cancelled bookings — the
// report-critical-field lock protects the booking record, which this never touches.
const { cfg, getRecord, updateRecord, createRecord, createTolerant, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, logLine, appendActivity, normalizePhone, normalizeEmail } = require("./lib/leads.js");
const { normalizeInstallerKey, keyToInstaller } = require("./lib/routing.js");
const { getMarket } = require("./lib/markets.js");

async function processClientNote(body, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false, now = new Date(), log = console,
          get = (a) => getRecord({ fetchImpl, ...a }),
          list = (a) => listAllRecords({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const note = String(d.note || "").trim();
  if (!note) return { status: "error", error: "missing-note" };
  if (note.length > 500) return { status: "error", error: "note-too-long" };
  // Stamp is server-side (time + installer key) so history can't be forged.
  const line = logLine(now, `${key}: ${note}`);
  const c = cfg(env);

  const appendTo = async (leadId, existing) => {
    const notes = appendActivity(existing || "", line);
    // Plain update, NOT updateTolerant — tolerant would silently drop the one
    // field that matters. The column is created at ship time (ensure-field.mjs).
    await update({ token: c.token, baseId: c.baseId, table: c.priority, id: leadId, fields: { "Client Notes": notes } });
    return notes;
  };

  if (d.leadId) {
    let rec;
    try { rec = await get({ token: c.token, baseId: c.baseId, table: c.priority, id: d.leadId }); }
    catch (e) { if (log.error) log.error("client-note get lead", e.message); return { status: "error", error: "store-unavailable" }; }
    const lead = toLeadView(rec);
    if (!admin && (lead.installer || "") !== key) return { status: "error", error: "not-yours" };
    try { return { status: "ok", leadId: d.leadId, notes: await appendTo(d.leadId, lead.clientNotes) }; }
    catch (e) { if (log.error) log.error("client-note update", e.message); return { status: "error", error: "store-unavailable" }; }
  }

  return { status: "error", error: "missing-target" };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processClientNote(body, { key, admin: isAdmin(key, process.env) });
  const code = out.status !== "error" ? 200
    : out.error === "not-yours" ? 403
    : out.error === "store-unavailable" ? 502 : 400;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processClientNote };
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit** — `feat(console): installer-client-note — stamped notes on the client record (lead path)`

---

### Task 3: booking path — resolve linked/phone/email, else mint

**Files:**
- Modify: `netlify/functions/installer-client-note.js` (replace the `missing-target` return)
- Test: `tests/installer-client-note.test.js` (append)

- [ ] **Step 1: Write the failing tests**

```js
const bookingRec = (extra = {}) => ({ id: "recB", fields: { Name: "Jane", Installer: ["cody"], Status: "Booked",
  Phone: "(612) 555-0100", Email: "jane@x.com", City: "Madison", Vehicle: "2019 Tacoma 3.5L", ...extra } });
const leadRow = (extra = {}) => ({ id: "recL", fields: { Name: "Jane", Installer: "cody", Phone: "612-555-0100", ...extra } });

test("booking path finds the linked lead first", async () => {
  let patched;
  const out = await processClientNote({ bookingId: "recB", note: "has aFe CAI" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(),
      list: async () => [leadRow({ Booking: ["recB"], Phone: "999" }), leadRow({ Phone: "612-555-0100" })],
      update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(out.leadId, "recL");
  assert.equal(out.minted, false);
  assert.equal(patched.table, "Priority List");
  assert.equal(patched.fields["Client Notes"], "2026-07-31 14:03 — cody: has aFe CAI");
});

test("booking path falls back to a normalized phone match", async () => {
  let patched;
  const out = await processClientNote({ bookingId: "recB", note: "n" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(),
      list: async () => [leadRow({ Phone: "+1 (612) 555-0100" })],
      update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(out.leadId, "recL");
});

test("booking path mints a market-routed linked lead when no client exists", async () => {
  let created;
  const out = await processClientNote({ bookingId: "recB", note: "has aFe CAI" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(), list: async () => [],
      create: async (a) => { created = a; return { id: "recNew" }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.minted, true);
  assert.equal(out.leadId, "recNew");
  assert.equal(created.fields.Name, "Jane");
  assert.equal(created.fields.Stage, "Booked");
  assert.deepEqual(created.fields.Booking, ["recB"]);
  assert.equal(created.fields["Converted Booking"], "recB");
  assert.ok(created.fields.Installer, "market-routed installer set");
  assert.equal(created.fields["Client Notes"], "2026-07-31 14:03 — cody: has aFe CAI");
  assert.match(created.fields["Activity Log"], /minted from booking recB/);
});

test("notes are allowed on a Completed booking", async () => {
  const out = await processClientNote({ bookingId: "recB", note: "noticed CAI during flash" },
    { env, key: "cody", now: NOW, get: async () => bookingRec({ Status: "Completed" }),
      list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(out.status, "ok");
});

test("booking path rejects another installer's booking; admin passes", async () => {
  const deny = await processClientNote({ bookingId: "recB", note: "x" },
    { env, key: "noah", now: NOW, get: async () => bookingRec(), list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(deny.error, "not-yours");
  const ok = await processClientNote({ bookingId: "recB", note: "x" },
    { env, key: "aaron", admin: true, now: NOW, get: async () => bookingRec(), list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(ok.status, "ok");
});
```

Note: `patched.table` assertion — check what `cfg(env).priority` resolves to with the test env (read `cfg` in `lib/airtable.js`); if it isn't the literal `"Priority List"`, assert `patched.table === cfg(env).priority` instead.

- [ ] **Step 2: Run** → FAIL (`missing-target`)

- [ ] **Step 3: Implement** — replace `return { status: "error", error: "missing-target" };` with:

```js
  if (d.bookingId) {
    let rec;
    try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id: d.bookingId }); }
    catch (e) { if (log.error) log.error("client-note get booking", e.message); return { status: "error", error: "store-unavailable" }; }
    const f = (rec && rec.fields) || {};
    const owner = normalizeInstallerKey(f.Installer);
    if (!admin && owner !== key) return { status: "error", error: "not-yours" };
    // Booking Status is deliberately not checked — notes never touch the booking.

    let leads = [];
    try { leads = (await list({ token: c.token, baseId: c.baseId, table: c.priority })).map(toLeadView); }
    catch (e) { if (log.error) log.error("client-note list leads", e.message); return { status: "error", error: "store-unavailable" }; }
    const pKey = normalizePhone(f.Phone), eKey = normalizeEmail(f.Email);
    const match = leads.find((l) => l.bookingId === d.bookingId)
      || (pKey && leads.find((l) => normalizePhone(l.phone) === pKey))
      || (eKey && leads.find((l) => normalizeEmail(l.email) === eKey)) || null;
    if (match) {
      try { return { status: "ok", leadId: match.id, notes: await appendTo(match.id, match.clientNotes), minted: false }; }
      catch (e) { if (log.error) log.error("client-note update", e.message); return { status: "error", error: "store-unavailable" }; }
    }

    // No client record yet — mint one from the booking identity (market-routed,
    // linked back), same spirit as the contact-resolver (d220c07). The note is
    // the record's first Client Notes line.
    const city = String(f.City || "").trim();
    const market = getMarket(city);
    const instKey = market ? keyToInstaller(market.inst).key : owner;
    const fields = {
      Name: String(f.Name || ""), Phone: String(f.Phone || ""), Email: String(f.Email || ""),
      City: market ? market.city : (city || "Unassigned"), Vehicle: String(f.Vehicle || ""),
      Source: "booking-note", Stage: "Booked",
      Booking: [d.bookingId], "Converted Booking": d.bookingId,
      "Activity Log": logLine(now, `minted from booking ${d.bookingId}`),
      "Client Notes": line,
    };
    if (instKey) fields.Installer = instKey;
    let createdRec;
    try {
      createdRec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
        ["Booking", "Converted Booking", "Stage", "Source", "Activity Log"]);
    } catch (e) { if (log.error) log.error("client-note mint", e.message); return { status: "error", error: "store-unavailable" }; }
    return { status: "ok", leadId: createdRec && createdRec.id, notes: line, minted: true };
  }

  return { status: "error", error: "missing-target" };
```

(`"Client Notes"` is intentionally NOT in the tolerated list — if the column is missing the create must fail loudly, not silently drop the note.)

- [ ] **Step 4: Run full suite** — `npm test` → all pass

- [ ] **Step 5: Commit** — `feat(console): client-note booking path — linked/phone/email resolution, else mint a linked lead`

---

### Task 4: booking-card UI — visible notes strip + Add note

**Files:**
- Modify: `site/installer.html` — `rowCard` open-booking branch (near the ✏️ Edit details block, ~line 2501), completed-card branch (before ~line 2488), no-show branch (~line 2492); new helpers near `knownIdentityFor` (~line 2388)
- Test: `tests/installer-client-notes-ui.test.js` (new, static-wiring style like `tests/installer-contact-resolver.test.js`)

**`git pull --ff-only` first — parallel sessions edit installer.html.**

- [ ] **Step 1: Write the failing wiring tests**

```js
// Static wiring: client notes — stamped notes live on the client record and
// render on every card for that client (owner rule 2026-07-31).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("booking cards join the client's notes from loaded leads", () => {
  assert.ok(HTML.includes("function clientLeadFor"), "join helper exists");
  const fn = HTML.slice(HTML.indexOf("function clientLeadFor"));
  assert.ok(fn.slice(0, 700).includes("l.bookingId===b.id"), "linked lead first");
  assert.ok(fn.slice(0, 700).includes("callDigits"), "phone fallback");
});

test("notes strip + Add note render on open, completed, and no-show cards", () => {
  assert.ok((HTML.match(/notesBlock\(b\)/g) || []).length >= 3, "strip on all three card branches");
});

test("saving a note posts to installer-client-note and highlights the booking", () => {
  const fn = HTML.slice(HTML.indexOf("function addClientNote"));
  assert.ok(fn.slice(0, 1200).includes("installer-client-note"), "endpoint");
  assert.ok(fn.slice(0, 1200).includes("bookingId:"), "booking-scoped body");
  assert.ok(fn.slice(0, 1600).includes("jumpToBooking"), "jump-and-flash");
});
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implement.** Near `knownIdentityFor` add the join + strip helpers:

```js
  // The client record behind a booking: linked lead first, then phone, then email.
  // Same phone-keyed spirit as knownIdentityFor; leads load lazily, so this may
  // return null on first paint and fill in when loadLeads completes.
  function clientLeadFor(b){
    var leads=STATE.leads||[];
    var m=leads.filter(function(l){ return l.bookingId===b.id; })[0];
    if(m) return m;
    var pd=callDigits(b.phone||'');
    if(pd){ m=leads.filter(function(l){ return callDigits(l.phone||'')===pd; })[0]; if(m) return m; }
    var em=String(b.email||'').trim().toLowerCase();
    if(em){ m=leads.filter(function(l){ return String(l.email||'').trim().toLowerCase()===em; })[0]; if(m) return m; }
    return null;
  }
  // Notes strip + collapsed Add-note control. Notes live on the CLIENT record
  // (Lead), never the booking — they're there on the 2nd, 3rd, or 0th booking.
  function noteLines(t){ return String(t||'').split('\n').filter(function(s){ return s.trim(); }); }
  function notesBlock(b){
    var l=clientLeadFor(b);
    var lines=l?noteLines(l.clientNotes):[];
    return '<div id="cnwrap_'+b.id+'">'+
      (lines.length?'<div class="ffnote">'+lines.map(function(s){ return '📝 '+esc(s); }).join('<br>')+'</div>':'')+
      '<details style="margin:4px 0"><summary class="btn" style="display:inline-block;cursor:pointer;list-style:none">📝 Add note</summary>'+
      '<div class="row-actions" style="margin-top:6px">'+
      '<input id="cni_'+b.id+'" autocomplete="off" maxlength="500" placeholder="Note — travels with the client record">'+
      '<button class="btn" id="cns_'+b.id+'">Save note</button></div></details></div>';
  }
  async function addClientNote(b){
    clearMsg();
    var inp=document.getElementById('cni_'+b.id);
    var note=(inp&&inp.value||'').trim();
    if(!note){ fail('Type the note first.'); return; }
    try{
      var res=await fetch('/.netlify/functions/installer-client-note',{method:'POST',
        headers:{'Content-Type':'application/json','x-installer-token':tok()},
        body:JSON.stringify({bookingId:b.id,note:note})});
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      var out=await res.json().catch(function(){return{};});
      if(res.ok && out.status==='ok'){
        var l=clientLeadFor(b);
        if(l){ l.clientNotes=out.notes; }
        else { STATE.leadsLoaded=false; }   // minted server-side — refetch on next leads render
        succeed('✓ Note saved to '+((b.name&&!isPlaceholderName(b))?b.name:'the client')+"'s record");
        jumpToBooking(b);
      } else { fail('Could not save note: '+(out.error||res.status)); }
    }catch(e){ fail('Network error — try again.'); }
  }
  function wireNotes(c,b){ var s=c.querySelector('#cns_'+b.id); if(s) s.onclick=function(){ addClientNote(b); }; }
```

Then in `rowCard`:
- Open-booking branch: insert `notesBlock(b)+` into the `c.innerHTML` concatenation immediately before the `✏️ Edit` details block, and call `wireNotes(c,b);` next to the existing `wireCust(c,b);`.
- Completed branch: insert `notesBlock(b)+` into its innerHTML (after the head/contact section) and add `wireNotes(c,b);` beside its `wireCust(c,b);`.
- No-show branch: same — `notesBlock(b)` in innerHTML, `wireNotes(c,b);` beside `wireCust(c,b);`.

Lazy-load hookup: read `loadLeads` (~line 1883). If it doesn't already re-render the feed on completion, add `if(STATE.tab!=='leads') renderAll();` after `STATE.leadsLoaded=true;`, and in `renderFeed`'s entry add the existing lazy trigger pattern: `if(!STATE.leadsLoaded && !STATE.leadsLoading){ STATE.leadsLoading=true; loadLeads(); }` — copy the exact style used at line ~1377.

- [ ] **Step 4: Run** — `npm test` → all pass

- [ ] **Step 5: Commit + push** — `feat(console): client notes on booking cards — strip + Add note, joined from the client record`

---

### Task 5: lead-card UI — same strip + Add note

**Files:**
- Modify: `site/installer.html` — `leadCard` (~line 1997), in the body right after the waitlist/linked-booking rows
- Test: `tests/installer-client-notes-ui.test.js` (append)

- [ ] **Step 1: Write the failing test**

```js
test("lead cards show notes and can add one via leadId", () => {
  const fn = HTML.slice(HTML.indexOf("function leadCard"));
  assert.ok(fn.includes("noteLines(l.clientNotes)"), "strip renders lead notes");
  assert.ok(fn.includes("addLeadNote(l"), "add-note wired");
  const add = HTML.slice(HTML.indexOf("function addLeadNote"));
  assert.ok(add.slice(0, 900).includes("installer-client-note"), "endpoint");
  assert.ok(add.slice(0, 900).includes("leadId:"), "lead-scoped body");
});
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implement.** In `leadCard`, after the linked-booking block (`if(l.booking){...}` ends ~line 2033) insert:

```js
    // Client notes — the stamped log that travels with this person.
    var nls=noteLines(l.clientNotes);
    if(nls.length){
      var nb=document.createElement('div'); nb.className='ffnote';
      nb.innerHTML=nls.map(function(s){ return '📝 '+esc(s); }).join('<br>');
      body.appendChild(nb);
    }
    var nrow=document.createElement('div'); nrow.className='walkmini';
    var ninp=document.createElement('input'); ninp.placeholder='Add note — travels with the client record'; ninp.maxLength=500;
    nrow.appendChild(ninp);
    nrow.appendChild(act('📝 Save note',function(){ addLeadNote(l,ninp); }));
    body.appendChild(nrow);
```

And add beside `addClientNote`:

```js
  async function addLeadNote(l,inp){
    var note=(inp&&inp.value||'').trim();
    if(!note){ inp.placeholder='Type the note first'; return; }
    try{
      var res=await fetch('/.netlify/functions/installer-client-note',{method:'POST',
        headers:{'Content-Type':'application/json','x-installer-token':tok()},
        body:JSON.stringify({leadId:l.id,note:note})});
      if(res.status===401){ localStorage.removeItem('ty_installer_token'); location.reload(); return; }
      var out=await res.json().catch(function(){return{};});
      if(res.ok && out.status==='ok'){
        l.clientNotes=out.notes;
        STATE.leadOpenId=l.id;   // re-open + flash this card after re-render
        renderLeads();
      } else { inp.value=note; inp.placeholder='Could not save — try again'; }
    }catch(e){ inp.placeholder='Network error — try again'; }
  }
```

(Check `act` is in scope — it's defined inside `leadCard`, so pass the button through `act(...)` inside `leadCard` as shown; `addLeadNote` itself lives at top level with the other helpers.)

- [ ] **Step 4: Run** — `npm test` → all pass

- [ ] **Step 5: Commit + push** — `feat(console): client notes on lead cards — notes start before any booking`

---

### Task 6: ship — create the column, deploy, smoke

- [ ] **Step 1: Pull, full suite, push** — `git pull --ff-only && npm test` → green → push (deploy is push-triggered).

- [ ] **Step 2: Create the Airtable column** (table name = `cfg().priority` — confirm the literal name first, expected `Priority List`):

```bash
cd /c/Users/grosh/Documents/tunedyota
AIRTABLE_TOKEN=$(npx netlify env:get AIRTABLE_TOKEN) \
AIRTABLE_BASE_ID=$(npx netlify env:get AIRTABLE_BASE_ID) \
node scripts/airtable/ensure-field.mjs "Priority List" "Client Notes" multilineText "Append-only stamped installer notes — travels with the client record"
```

Expected: `created "Client Notes" …` (or `ok: already exists`).

- [ ] **Step 3: Live smoke** (after deploy finishes): as an installer, open a booking card → 📝 Add note → "smoke test note" → expect ✓ message + flash; confirm the line lands in Airtable `Client Notes` with stamp + key; confirm it shows on the matching lead card and in Customer 360. Delete the smoke line from Airtable afterward.

- [ ] **Step 4: Update memory** — record ship status in the session memory file.

---

## Self-review notes

- Spec coverage: data (Task 6 column + stamped format via `logLine`), server lead path (T2), booking path + mint (T3), booking-card UI incl. completed/no-show (T4), lead-card UI (T5), customer-360 via `toLeadView.clientNotes` (T1 — `customer-view.js` and `leads-list.js` both map through `toLeadView`, so no further change), testing (each task), ship (T6).
- `linkedBookingId` is not exported from `lib/leads.js`; the plan correctly matches via `toLeadView(...).bookingId` instead.
- Type consistency: `notesBlock`/`wireNotes`/`clientLeadFor`/`noteLines`/`addClientNote`/`addLeadNote` names used consistently across T4/T5 and the wiring tests.

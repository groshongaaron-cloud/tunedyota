# Unified Multi-Channel Inbox (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the installer console Chats tab into a unified multi-channel inbox — a primary "top 10 open, all sources" list plus a source dropdown (Facebook / Instagram / Text / Web / Completed) so completed chats stay reachable instead of vanishing.

**Architecture:** Extend the existing `listSessions` (server) to (a) tag each session with a derived `channel` and (b) accept a `view` param that reshapes the Airtable filter (`open` default, a specific channel, or `completed`). The console (`installer.html`) sends the selected view, caps the primary list to 10 client-side, and renders a source `<select>`. No new tables; builds directly on the shipped FB/IG-visibility fix (commit f2ff6b8).

**Tech Stack:** Node.js Netlify functions, Airtable REST (`filterByFormula`), `node --test` (deps-injected `fetchImpl`), vanilla-JS SPA (`site/installer.html`).

This is Phase 1 of the 4-phase spec `docs/superpowers/specs/2026-08-05-console-comms-crm-hub-design.md`. Phases 2–4 (Contacts directory, Nudges, Purchases) get their own plans.

## File structure

- `netlify/functions/lib/chat-admin.js` — add `channelOf` + a `channel` field on each `listSessions` row; add a `view` param and a `listFilter(view, scope)` helper. (Server logic; the one file that owns the inbox query.)
- `netlify/functions/chat.js` — `installerOp` passes `body.view` into `listSessions`. (Thin routing change.)
- `tests/chat-admin.test.js` — new tests for channel tagging + view filters.
- `site/installer.html` — `STATE.chatSource`, `loadChats` sends the view, `renderChats` renders the dropdown + caps the primary list, completed threads show a read-only notice. (Console UI; not unit-tested — verified live per the `ship` skill.)

---

### Task 1: Derive a `channel` tag on each session

**Files:**
- Modify: `netlify/functions/lib/chat-admin.js` (`listSessions`, ~48-67)
- Test: `tests/chat-admin.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/chat-admin.test.js`:

```js
test("listSessions tags each session with a derived channel", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ records: [
    { id: "r1", fields: { "Session ID": "fb:1", Status: "ai", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T04:00:00Z" } },
    { id: "r2", fields: { "Session ID": "ig:2", Status: "ai", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T03:00:00Z" } },
    { id: "r3", fields: { "Session ID": "sms:+15551234567", Status: "escalated", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T02:00:00Z" } },
    { id: "r4", fields: { "Session ID": "abd7-uuid", Status: "escalated", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T01:00:00Z" } },
  ] }) });
  const out = await admin.listSessions("aaron", { env: ENV, fetchImpl });
  const byId = Object.fromEntries(out.map((s) => [s.id, s.channel]));
  assert.equal(byId["fb:1"], "facebook");
  assert.equal(byId["ig:2"], "instagram");
  assert.equal(byId["sms:+15551234567"], "text");
  assert.equal(byId["abd7-uuid"], "web");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="tags each session with a derived channel" tests/chat-admin.test.js`
Expected: FAIL — `s.channel` is `undefined`.

- [ ] **Step 3: Add `channelOf` and the `channel` field**

In `netlify/functions/lib/chat-admin.js`, add above `listSessions`:

```js
// Source-of-record channel from the Session ID prefix (ids: fb:/ig:/sms:, else web).
function channelOf(id) {
  const s = String(id || "");
  if (s.startsWith("fb:")) return "facebook";
  if (s.startsWith("ig:")) return "instagram";
  if (s.startsWith("sms:")) return "text";
  return "web";
}
```

In the `listSessions` `.map((r) => { ... })` return object, add the `channel` field right after `status`:

```js
      id: f["Session ID"] || "", status: f.Status || "ai",
      channel: channelOf(f["Session ID"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="tags each session with a derived channel" tests/chat-admin.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/chat-admin.js tests/chat-admin.test.js
git commit -m "feat(inbox): tag chat sessions with a derived channel"
```

---

### Task 2: `view` param — open / channel / completed filters

**Files:**
- Modify: `netlify/functions/lib/chat-admin.js` (`listSessions` filter, ~48-67)
- Test: `tests/chat-admin.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/chat-admin.test.js` (the `norm` helper mirrors the URLSearchParams `+`-for-space encoding used by the existing FB test):

```js
test("listSessions view=completed returns only closed threads (mine/unassigned)", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl, view: "completed" });
  assert.ok(formula.includes('{Status}="closed"'));
  assert.ok(!formula.includes('{Status}="escalated"'));
  assert.ok(formula.includes('{Installer}="aaron"'));
});

test("listSessions view=facebook scopes the open set to fb: threads", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl, view: "facebook" });
  assert.ok(formula.includes('LEFT({Session ID},3)="fb:"'));
  assert.ok(formula.includes('{Status}="escalated"')); // still the open set, intersected with the channel
});

test("listSessions default view=open is unchanged (escalated + live fb/ig)", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl });
  assert.ok(formula.includes('{Status}="escalated"'));
  assert.ok(formula.includes('LEFT({Session ID},3)="fb:"'));
  assert.ok(formula.includes('LEFT({Session ID},3)="ig:"'));
  assert.ok(!formula.includes('{Status}="closed"'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern="view=" tests/chat-admin.test.js`
Expected: FAIL — `view` is ignored; `completed`/`facebook` produce the same open filter.

- [ ] **Step 3: Add the `listFilter` helper and wire `view`**

In `netlify/functions/lib/chat-admin.js`, add above `listSessions`:

```js
// Airtable predicate selecting a single channel by Session ID prefix.
const CHANNEL_PRED = {
  facebook: `LEFT({Session ID},3)="fb:"`,
  instagram: `LEFT({Session ID},3)="ig:"`,
  text: `LEFT({Session ID},4)="sms:"`,
  web: `AND(LEFT({Session ID},3)!="fb:", LEFT({Session ID},3)!="ig:", LEFT({Session ID},4)!="sms:")`,
};

// The inbox query per view. `scope` = mine-or-unassigned. "open" = escalated
// (any channel) plus live (non-closed) Facebook/Instagram threads. A channel
// view is that open set intersected with the channel. "completed" = closed
// threads (bounded to the last 90 days so the list stays finite).
function listFilter(view, scope) {
  const open = `OR(AND({Status}="escalated", ${scope}),AND({Status}!="closed", OR(LEFT({Session ID},3)="fb:", LEFT({Session ID},3)="ig:"), ${scope}))`;
  if (view === "completed") {
    return `AND({Status}="closed", ${scope}, IS_AFTER({Last Activity}, DATEADD(TODAY(), -90, 'days')))`;
  }
  if (CHANNEL_PRED[view]) return `AND(${open}, ${CHANNEL_PRED[view]})`;
  return open;
}
```

Change the `listSessions` signature and the `filterByFormula` to use it:

```js
async function listSessions(installerKey, { env = process.env, fetchImpl = fetch, view = "open" } = {}) {
  const c = cfg(env);
  const key = escapeFormula(String(installerKey || ""));
  const scope = `OR({Installer}="${key}", {Installer}="")`;
  const recs = await listRecords({
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: listFilter(view, scope),
    fields: ["Session ID", "Status", "Customer Name", "Phone", "Vehicle", "City", "Installer", "Transcript", "Last Activity"],
  });
```

(Leave the `.map(...).sort(...)` body from Task 1 exactly as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-name-pattern="view=" tests/chat-admin.test.js`
Expected: PASS. Then run the whole file — the existing FB-surface test (which asserts the open filter) must still pass:
Run: `node --test tests/chat-admin.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/chat-admin.js tests/chat-admin.test.js
git commit -m "feat(inbox): view param for open/channel/completed session lists"
```

---

### Task 3: Route the `view` from the request into `listSessions`

**Files:**
- Modify: `netlify/functions/chat.js` (`installerOp`, line 240)
- Test: `tests/chat-admin.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/chat-admin.test.js`:

```js
test("installerOp op:list forwards the requested view to the lister", async () => {
  let gotView;
  const deps = { list: async (_key, o) => { gotView = (o || {}).view; return []; } };
  await installerOp({ op: "list", view: "completed" }, "aaron", deps);
  assert.equal(gotView, "completed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="forwards the requested view" tests/chat-admin.test.js`
Expected: FAIL — `gotView` is `undefined` (view not passed through).

- [ ] **Step 3: Pass the view through**

In `netlify/functions/chat.js`, change line 240 from:

```js
  if (body.op === "list") return { status: 200, body: { sessions: await list(installerKey, deps) } };
```

to:

```js
  if (body.op === "list") return { status: 200, body: { sessions: await list(installerKey, { ...deps, view: body.view }) } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="forwards the requested view" tests/chat-admin.test.js`
Expected: PASS

- [ ] **Step 5: Run the related suite for regressions**

Run: `node --test tests/chat-admin.test.js tests/chat-handler.test.js tests/meta-dm.test.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/chat.js tests/chat-admin.test.js
git commit -m "feat(inbox): forward op:list view param to listSessions"
```

---

### Task 4: Console — track the selected source and send it

**Files:**
- Modify: `site/installer.html` (`STATE` init ~366; `loadChats` ~1141-1145)

No unit test (SPA); verified live in Task 7.

- [ ] **Step 1: Add `chatSource` to STATE**

In `site/installer.html`, in the `STATE` object initializer, change:

```js
    , chats:[], chatOpen:null, chatsLoaded:false
```

to:

```js
    , chats:[], chatOpen:null, chatsLoaded:false, chatSource:'open'
```

- [ ] **Step 2: Send the view from `loadChats`**

Change `loadChats` (~1141) from:

```js
  async function loadChats(){
    try{ var j = await chatApi({op:'list'}); STATE.chats = j.sessions||[]; STATE.chatsLoaded = true; }
    catch(e){ STATE.chats = []; STATE.chatsLoaded = true; }
    renderAll();
  }
```

to:

```js
  async function loadChats(){
    try{ var j = await chatApi({op:'list', view:STATE.chatSource}); STATE.chats = j.sessions||[]; STATE.chatsLoaded = true; }
    catch(e){ STATE.chats = []; STATE.chatsLoaded = true; }
    renderAll();
  }
```

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(inbox): console tracks and sends the selected chat source"
```

---

### Task 5: Console — source dropdown + primary top-10 cap

**Files:**
- Modify: `site/installer.html` (`renderChats` ~1159-1176)

- [ ] **Step 1: Replace `renderChats` with the dropdown + cap version**

Replace the entire `renderChats` function (1159-1176) with:

```js
  var CHAT_SOURCES = [['open','All'],['facebook','Facebook'],['instagram','Instagram'],['text','Text'],['web','Web'],['completed','Completed']];
  function chatSourceLabel(v){ for(var i=0;i<CHAT_SOURCES.length;i++){ if(CHAT_SOURCES[i][0]===v) return CHAT_SOURCES[i][1]; } return v; }
  function renderChats(){
    var host = document.getElementById('feed');
    if(STATE.chatOpen) return renderChatThread(host);
    if(!CHAT_POLL) CHAT_POLL = setInterval(loadChats, 15000);
    var picker = '<div class="mnav"><select id="chatsource" style="font:inherit;font-size:13px">'+
      CHAT_SOURCES.map(function(s){ return '<option value="'+s[0]+'"'+(STATE.chatSource===s[0]?' selected':'')+'>'+s[1]+'</option>'; }).join('')+
      '</select></div>';
    var rows = STATE.chatSource==='open' ? STATE.chats.slice(0,10) : STATE.chats;
    var emptyMsg = STATE.chatSource==='open'
      ? 'No active chats. Escalations and Facebook/Instagram/text messages land here.'
      : (STATE.chatSource==='completed' ? 'No completed chats in the last 90 days.' : 'No '+chatSourceLabel(STATE.chatSource)+' chats.');
    var listHtml = rows.length ? '<div class="card" style="padding:0;overflow:hidden">'+rows.map(function(s){
        var initial = (s.customerName||'?').trim().charAt(0).toUpperCase() || '?';
        return '<div class="crow" data-chat="'+esc(s.id)+'">'+
          '<div class="cava">'+esc(initial)+'</div>'+
          '<div class="cmeta"><div class="cname">'+esc(s.customerName||'Customer')+
            ' <span class="cbadge">'+chanBadge(s.id)+'</span>'+
            (s.status==='closed'?' <span class="cbadge" style="opacity:.6">done</span>':'')+
            (STATE.admin?(s.installer?' <span class="installer-tag">'+esc(s.installer)+'</span>':' <span class="cbadge" style="opacity:.7">unassigned</span>'):'')+'</div>'+
          '<div class="csnip">'+(s.lastRole==='installer'?'You: ':'')+esc(s.lastText||(s.vehicle||''))+'</div></div>'+
          '<div class="cwhen">'+esc(relTime(s.lastActivity))+'</div>'+
          (s.lastRole==='user' && s.status!=='closed'?'<div class="cdot" title="needs reply"></div>':'')+
          '</div>';
      }).join('')+'</div>' : '<p class="muted" style="padding:14px">'+emptyMsg+'</p>';
    host.innerHTML = picker + listHtml;
    var sel = document.getElementById('chatsource');
    if(sel) sel.onchange = function(){ STATE.chatSource = sel.value; STATE.chats=[]; STATE.chatsLoaded=false; loadChats(); };
    host.onclick = function(e){ var c=e.target.closest('[data-chat]'); if(c){ STATE.chatOpen=c.getAttribute('data-chat'); renderAll(); } };
  }
```

- [ ] **Step 2: Commit**

```bash
git add site/installer.html
git commit -m "feat(inbox): source dropdown and top-10 primary list"
```

---

### Task 6: Console — completed threads open read-only

**Files:**
- Modify: `site/installer.html` (`renderChatThread`, the compose form ~1231-1233)

A closed thread's `installerReply` is rejected server-side (`not-escalated`); showing the compose box would be a dead end. Swap it for a notice.

- [ ] **Step 1: Gate the compose on status**

In `renderChatThread`, change the thread/compose markup (1231-1233) from:

```js
      '<div class="cthread"><div id="chatlog" class="clog">'+bubbles.join('')+'</div>'+
      '<form id="chatreply" class="ccompose"><textarea id="chattext" rows="1" placeholder="Text message…"></textarea>'+
        '<button type="submit" class="csend" title="Send">↑</button></form></div>';
```

to:

```js
      '<div class="cthread"><div id="chatlog" class="clog">'+bubbles.join('')+'</div>'+
      (j.status==='closed'
        ? '<div class="ccompose" style="justify-content:center;color:var(--muted,#8a8a8e);font-size:13px;padding:10px">Completed chat — a new message from the customer reopens it.</div>'
        : '<form id="chatreply" class="ccompose"><textarea id="chattext" rows="1" placeholder="Text message…"></textarea>'+
          '<button type="submit" class="csend" title="Send">↑</button></form>')+'</div>';
```

- [ ] **Step 2: Confirm the transcript endpoint returns `status`**

Verify (read-only) that `getTranscript` in `netlify/functions/lib/chat-admin.js` returns `status` — it does (`return { id: sess.id, status: sess.status, ... }`). No change needed; this step is a check so the `j.status` gate is valid.

- [ ] **Step 3: Commit**

```bash
git add site/installer.html
git commit -m "feat(inbox): completed chats open read-only with a reopen hint"
```

---

### Task 7: Full test run, ship, and live verification

**Files:** none (deploy + verify)

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: all tests pass (0 fail). No SEO inputs changed, so `build:seo` is not needed.

- [ ] **Step 2: Push to master (deploy)**

Stage only the Phase-1 files (leave any unrelated working-tree changes alone):

```bash
git push origin master
```

- [ ] **Step 3: Confirm Netlify published**

Confirm the deploy for the latest commit shows state `ready` (per the `ship` skill — deploys have silently skipped before). If the Netlify CLI is linked:

```bash
netlify api listSiteDeploys --data '{"site_id":"47fd6491-fd07-4f6b-9e1e-20a83e164d36","per_page":3}'
```

Expected: newest deploy `state: ready`, `commit_ref` = the pushed commit.

- [ ] **Step 4: Live verify the console**

Open `https://tunedyota.com/installer` → Chats tab (hard refresh). Confirm:
- A source dropdown shows: All / Facebook / Instagram / Text / Web / Completed.
- **All** shows up to 10 open threads, mixed sources, each with a channel badge.
- **Facebook** shows the live FB threads; **Completed** shows closed threads (and opening one shows the read-only "reopen" notice, no compose box).
- Switching the dropdown reloads the list for that source.

- [ ] **Step 5: Mark Phase 1 complete**

Phase 1 is shippable on its own. Phases 2–4 (Contacts directory, Nudges, Purchases) are planned separately against the same spec.

---

## Self-review

- **Spec coverage (Pillar 1):** primary top-10 open all-sources ✓ (Tasks 2, 5); source dropdown incl. Completed ✓ (Task 5); channel labels ✓ (Task 1); completed reachable + not gone ✓ (Tasks 2, 6). Channel/view server modes ✓ (Tasks 2, 3).
- **Placeholders:** none — every code step shows exact code and commands.
- **Type/name consistency:** `channelOf`, `CHANNEL_PRED`, `listFilter(view, scope)`, `view` param, `STATE.chatSource`, `CHAT_SOURCES`, `chatSourceLabel` used consistently across tasks; channel strings (`facebook`/`instagram`/`text`/`web`) match between `channelOf` and `CHANNEL_PRED` and the dropdown values.
- **Scope:** Phase 1 only; produces working, shippable software (the inbox) on its own.

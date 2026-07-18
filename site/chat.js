// Tuned Yota chat widget. Context-aware label, session in sessionStorage,
// POSTs to /.netlify/functions/chat; polls for installer replies while escalated.
// Sends are serialized: the send button disables until the reply returns (the
// server has no concurrent-write merge for a session — do not remove this).
(function () {
  var path = location.pathname.toLowerCase();
  var CTX = path.indexOf("amsoil") >= 0 ? "amsoil" : (path.indexOf("magnuson") >= 0 ? "magnuson" : "default");
  var LABEL = CTX === "amsoil" ? "💬 Chat with an AMSOIL Fluid Specialist"
    : CTX === "magnuson" ? "💬 Chat with a Magnuson Supercharger Specialist"
    : "💬 Chat with an OTT installer NOW";
  var FN = "/.netlify/functions/chat";
  var sid = sessionStorage.getItem("ty-chat-sid");
  if (!sid) { sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); sessionStorage.setItem("ty-chat-sid", sid); }
  var seen = 0, escalated = false, pollTimer = null, open = false, sending = false;

  var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/chat.css"; document.head.appendChild(css);
  var btn = document.createElement("button"); btn.id = "ty-chat-btn"; btn.textContent = LABEL; document.body.appendChild(btn);
  var panel = null, log = null, input = null, sendBtn = null;

  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function addMsg(role, text, name) {
    var m = el("div", { class: "ty-msg " + role });
    if (role === "installer") { var b = document.createElement("b"); b.textContent = (name || "OTT Installer") + ": "; m.appendChild(b); m.appendChild(document.createTextNode(text)); }
    else m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight;
  }

  function poll() {
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sid, poll: true, since: seen }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        (j.turns || []).forEach(function (t) { seen++; if (t.role === "installer") addMsg("installer", t.text); });
      }).catch(function () {});
  }
  function startPolling() { if (!pollTimer) pollTimer = setInterval(poll, 3000); }

  function send(text) {
    if (sending) return;
    sending = true; if (sendBtn) sendBtn.disabled = true;
    addMsg("user", text); seen += 1;
    var typing = el("div", { class: "ty-msg ai", id: "ty-typing" }, "…"); log.appendChild(typing);
    fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sid, message: text, page: CTX }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        typing.remove();
        if (j.expired) { sessionStorage.removeItem("ty-chat-sid"); addMsg("ai", "That chat expired — refresh the page to start a new one."); return; }
        if (j.reply) { addMsg("ai", j.reply); seen += 1; }
        if (j.escalated) { escalated = true; startPolling(); }
      })
      .catch(function () { typing.remove(); addMsg("ai", "Connection hiccup — text us at 612-406-7117 and we'll take care of you."); })
      .then(function () { sending = false; if (sendBtn) sendBtn.disabled = false; if (input) input.focus(); });
  }

  function openPanel() {
    if (open) return; open = true; btn.style.display = "none";
    panel = el("div", { id: "ty-chat-panel" });
    var head = el("div", { id: "ty-chat-head" }, "Tuned Yota");
    var close = el("button", { type: "button", "aria-label": "Close" }, "—"); head.appendChild(close);
    log = el("div", { id: "ty-chat-log" });
    var form = el("form", { id: "ty-chat-form" });
    input = el("input", { id: "ty-chat-input", placeholder: "Type a message…", maxlength: "1000" });
    sendBtn = el("button", { id: "ty-chat-send", type: "submit" }, "Send");
    form.appendChild(input); form.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(form);
    document.body.appendChild(panel);
    addMsg("ai", "Thank you for using Tuned Yota's chat agent. What can I help you with — your truck, a tune, or an upcoming event?");
    close.addEventListener("click", function () { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } panel.remove(); open = false; btn.style.display = ""; });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); var t = input.value.trim(); if (t) { input.value = ""; send(t); } });
    if (escalated) startPolling();
    input.focus();
  }
  btn.addEventListener("click", openPanel);
})();

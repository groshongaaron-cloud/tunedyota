// site/offline-queue.js — offline op-queue logic for the installer console.
// Pure + storage-injected so it unit-tests in Node and runs in the browser. The
// console wires these to fetch/localStorage/events; NO DOM or network here.
(function (root) {
  var KEY = "ty_pending_ops";

  function uuid() {
    try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function makeOp(type, body) { return { clientKey: uuid(), type: type, body: body || {}, ts: Date.now() }; }

  // Queue only what a retry could fix: a network failure (no response) or a 5xx.
  // Never queue a 4xx (validation/permission — it will fail again) or a 2xx (it worked).
  function shouldQueue(error, status) {
    if (error) return true;
    return !!(status && status >= 500);
  }

  // Classify a replay response during flush.
  function nextFlushResult(status) {
    if (!status) return "retry-later";          // network error / unknown → keep, retry
    if (status >= 200 && status < 300) return "remove";
    if (status === 401) return "stop-auth";     // token rejected — stop, keep queue, re-login
    if (status >= 500) return "retry-later";
    return "drop";                              // other 4xx — poison op, drop so it can't block
  }

  function loadQueue(storage) {
    try { var raw = storage.getItem(KEY); if (!raw) return []; var a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveQueue(storage, ops) { try { storage.setItem(KEY, JSON.stringify(ops || [])); } catch (e) {} }

  var api = { KEY: KEY, makeOp: makeOp, shouldQueue: shouldQueue, nextFlushResult: nextFlushResult, loadQueue: loadQueue, saveQueue: saveQueue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.OfflineQueue = api;
})(typeof window !== "undefined" ? window : this);

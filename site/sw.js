// site/sw.js — Tuned Yota installer console: web push + offline shell cache.
var CACHE_VERSION = "ty-console-v3"; // bump when the SHELL list or fetch strategy changes
var SHELL = ["/installer.html", "/commission-tally.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE_VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var isNav = req.mode === "navigate" && url.pathname === "/installer.html";
  var isAsset = !isNav && SHELL.indexOf(url.pathname) >= 0;
  if (!isNav && !isAsset) return; // pass through the public site + all /.netlify/functions/* (never cached)

  // The HTML shell changes often and correctness matters most: NETWORK-FIRST so an
  // online installer always loads the latest console on their next visit (no more
  // second-reload lag after a fix), with the cached copy as an offline fallback.
  if (isNav) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return fetch(req).then(function (res) {
          if (res && res.status === 200) cache.put("/installer.html", res.clone());
          return res;
        }).catch(function () {
          return cache.match("/installer.html").then(function (c) { return c || Response.error(); });
        });
      })
    );
    return;
  }

  // Static assets (icons, commission-tally.js): stale-while-revalidate — instant
  // from cache, refreshed in the background.
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
// Background Sync (where supported): tell open clients to flush their offline queue.
self.addEventListener("sync", function (event) {
  if (event.tag === "ty-flush") {
    event.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(function (list) {
      list.forEach(function (c) { c.postMessage({ type: "ty-flush" }); });
    }));
  }
});

self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || "Tuned Yota", {
    body: d.body || "", data: { url: d.url || "/installer.html" },
    icon: "/icon-192.png", badge: "/icon-192.png",
  }));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/installer.html";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(url) >= 0 && "focus" in list[i]) return list[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

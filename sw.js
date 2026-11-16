/* NorthReserve Mountain — service worker.
   Network-first for navigations (marketing + app pages always try fresh, so SEO
   pages are never served stale); stale-while-revalidate for our own static shell
   assets; offline fallback to /app-offline.html. Third-party (GA, three.js CDNs)
   is passed straight through and never cached. */
"use strict";
var CACHE = "nr-mountain-v1";
var PRECACHE = [
  "/app-offline.html", "/nr-app.css", "/nr-core.js", "/nr-ui.js", "/links.js",
  "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.allSettled(PRECACHE.map(function (u) { return c.add(u); })); // resilient: a missing file won't break install
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // never touch GA / CDNs

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match("/app-offline.html"); });
      })
    );
    return;
  }

  if (/\.(css|js|png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
          return res;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
  }
});

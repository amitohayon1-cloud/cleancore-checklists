/*
 * Service worker – שומר את כל קבצי האפליקציה במכשיר לעבודה אופליין.
 * בכל עדכון של קובץ כלשהו באפליקציה (כולל data/trades.json) חובה להעלות
 * את VERSION באחד, כדי שהטלפונים יורידו את הגרסה החדשה.
 */
var VERSION = "1";
var CACHE = "cc-checklists-" + VERSION;

var FILES = [
  "./",
  "index.html",
  "install.html",
  "js/install.js",
  "css/style.css",
  "js/app.js",
  "js/pdf-template.js",
  "data/trades.json",
  "vendor/jspdf.umd.min.js",
  "assets/letterhead.jpg",
  "fonts/heebo-hebrew-400-normal.woff2",
  "fonts/heebo-hebrew-700-normal.woff2",
  "fonts/heebo-latin-400-normal.woff2",
  "fonts/heebo-latin-700-normal.woff2",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // cache: "reload" עוקף את מטמון ה-HTTP של GitHub Pages, כדי לקבל בוודאות את הקבצים החדשים
      return cache.addAll(FILES.map(function (f) { return new Request(f, { cache: "reload" }); }));
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // install.html מוחזר כמו שהוא; כל דף אחר (כולל "./") מקבל את index.html
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then(function (r) { return r || caches.match("index.html"); })
        .then(function (r) { return r || fetch(req); })
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (r) { return r || fetch(req); })
  );
});

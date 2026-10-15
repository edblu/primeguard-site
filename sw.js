/* ============================================================
   PrimeGuard service worker (pg-v1)
   ------------------------------------------------------------
   Deliberately conservative for a live business site:
   - Static assets (CSS/JS/images/fonts, anything under /assets/):
     cache-first, refreshed in the background on every fetch.
   - HTML pages: network-first, cache is only an offline fallback.
   - Staff/vendor surfaces (/admin.html, /vendor-dashboard*):
     NEVER intercepted and NEVER cached. Network only.
   - Non-GET requests are never touched.
   Also carries the push-notification foundation at the bottom:
   payload-driven handlers only (no FCM, no subscriptions yet).
   ============================================================ */

var CACHE_NAME = "pg-v1";

/* Small app shell precached on install so the installed app can
   open offline. Everything else is runtime-cached on first use. */
var PRECACHE_URLS = [
  "/",
  "/index.html",
  "/account.html",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];

/* Pages that must always come straight from the network. */
function isNetworkOnly(url) {
  return url.pathname.indexOf("/admin") === 0 ||
         url.pathname.indexOf("/vendor-dashboard") === 0;
}

function isStaticAsset(request, url) {
  if (url.pathname.indexOf("/assets/") === 0) return true;
  return request.destination === "style" ||
         request.destination === "script" ||
         request.destination === "image" ||
         request.destination === "font";
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* Add one by one so a single 404 can't fail the whole install. */
      return Promise.all(PRECACHE_URLS.map(function (u) {
        return cache.add(u).catch(function () { /* ignore */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) return caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* Staff/vendor surfaces: no interception, no caching, ever. */
  if (isNetworkOnly(url)) return;

  /* Static assets: cache-first, then network (and cache the result). */
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (hit) {
        var network = fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        }).catch(function () { return hit; });
        return hit || network;
      })
    );
    return;
  }

  /* HTML pages: network-first, cached copy only as offline fallback. */
  if (request.mode === "navigate" ||
      (request.headers.get("accept") || "").indexOf("text/html") !== -1) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match("/index.html");
        });
      })
    );
  }
});

/* ============================================================
   PUSH NOTIFICATION FOUNDATION (no FCM / subscriptions yet)
   ------------------------------------------------------------
   Payload-driven only: when a push service eventually delivers
   a message, its JSON payload is expected to look like:
     { "title": "...", "body": "...", "url": "/account.html",
       "icon": "/assets/icon-192.png" }
   Anything missing falls back to the defaults below. There is
   deliberately NO subscription logic, NO permission prompt and
   NO messaging keys in this pass; this is the receiving end so
   notifications never have to be retrofitted later.
   ============================================================ */

var PUSH_DEFAULTS = {
  title: "PrimeGuard",
  body: "You have an update from PrimeGuard.",
  url: "/account.html",
  icon: "/assets/icon-192.png"
};

self.addEventListener("push", function (event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json() || {}; }
    catch (e) {
      try { data = { body: event.data.text() }; } catch (e2) { data = {}; }
    }
  }
  var title = data.title || PUSH_DEFAULTS.title;
  var url = data.url || PUSH_DEFAULTS.url;
  var options = {
    body: data.body || PUSH_DEFAULTS.body,
    icon: data.icon || PUSH_DEFAULTS.icon,
    badge: "/assets/icon-192.png",
    /* One stable tag: a new PrimeGuard notification replaces the
       previous one instead of stacking up on the lock screen. */
    tag: "primeguard-update",
    data: { url: url }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) ||
               PUSH_DEFAULTS.url;
  var targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        /* Reuse an open PrimeGuard window if there is one:
           navigate it to the payload URL, then focus it. */
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (client.url.indexOf(self.location.origin) === 0 &&
              "focus" in client) {
            if ("navigate" in client && client.url !== targetUrl) {
              return client.navigate(targetUrl).then(function (c) {
                return (c || client).focus();
              }).catch(function () { return client.focus(); });
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});

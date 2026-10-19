/* ============================================================
   PrimeGuard service worker (pg-v5)
   ------------------------------------------------------------
   Deliberately conservative for a live business site:
   - Static assets (CSS/JS/images/fonts, anything under /assets/):
     cache-first, refreshed in the background on every fetch.
   - HTML pages: network-first, cache is only an offline fallback.
   - Staff/vendor surfaces (/admin.html, /vendor-dashboard*):
     NEVER intercepted and NEVER cached. Network only.
   - Non-GET requests are never touched.
   Push: an FCM layer (Firebase Cloud Messaging, below) shows
   background notifications for pushes sent via FCM, and a
   generic payload-driven push handler (bottom) covers any
   non-FCM push. The generic handler skips FCM-shaped payloads
   so a message is never shown twice.
   ============================================================ */

/* ============================================================
   FIREBASE CLOUD MESSAGING (background notifications)
   ------------------------------------------------------------
   The compat SDKs run inside the worker so FCM pushes (sent by
   send-push.mjs and the watches) can wake the app when no page
   is open. The firebase config mirrors config.js (public web
   config, not a secret). The whole block is guarded: if the
   SDKs fail to load or init, the worker keeps working as a
   plain caching + generic-push worker.
   ============================================================ */
var PG_FCM_ACTIVE = false;
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
  );
  if (typeof firebase !== "undefined" && firebase.messaging) {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: "AIzaSyDDOcUiuTlollOGoNUJd_Eos-tovJ1dqA0",
        authDomain: "primeguard-83e88.firebaseapp.com",
        projectId: "primeguard-83e88",
        storageBucket: "primeguard-83e88.firebasestorage.app",
        messagingSenderId: "1031375547061",
        appId: "1:1031375547061:web:947b8ed95695a0df2b2cfc"
      });
    }
    firebase.messaging().onBackgroundMessage(function (payload) {
      var n = (payload && payload.notification) || {};
      var d = (payload && payload.data) || {};
      var title = n.title || d.title || "PrimeGuard";
      var url = d.url ||
        (payload && payload.fcmOptions && payload.fcmOptions.link) ||
        "/account.html";
      var options = {
        body: n.body || d.body || "You have an update from PrimeGuard.",
        icon: n.icon || d.icon || "/assets/icon-192.png",
        badge: "/assets/icon-192.png",
        tag: "primeguard-update",
        /* The existing notificationclick handler (bottom) reads
           data.url and opens / focuses the right page. */
        data: { url: url }
      };
      return self.registration.showNotification(title, options);
    });
    PG_FCM_ACTIVE = true;
  }
} catch (e) { /* FCM is an enhancement; never break the worker over it. */ }

var CACHE_NAME = "pg-v5";

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

  /* Static assets: cache-first, then network (and cache the result).
     Match WITHOUT ignoreSearch: CSS/JS are versioned via ?v= query
     strings, and ignoring the query served stale stylesheets forever
     (the Oct 15 daylight.css incident). */
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then(function (hit) {
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
   GENERIC PUSH HANDLER (non-FCM payloads)
   ------------------------------------------------------------
   Payload-driven: a plain push payload is expected to look like:
     { "title": "...", "body": "...", "url": "/account.html",
       "icon": "/assets/icon-192.png" }
   Anything missing falls back to the defaults below. FCM
   messages are handled by the messaging layer at the top and
   are SKIPPED here (see looksLikeFcmMessage) so the customer
   never sees the same notification twice.
   ============================================================ */

var PUSH_DEFAULTS = {
  title: "PrimeGuard",
  body: "You have an update from PrimeGuard.",
  url: "/account.html",
  icon: "/assets/icon-192.png"
};

/* FCM web-push payloads are recognizable: a "from" field (the
   sender id), keys namespaced "google." / "gcm." added by the
   FCM backend, or the notification + fcmOptions pairing our
   sender produces. When the messaging layer above is active it
   owns those messages; showing them here too would double up. */
function looksLikeFcmMessage(data) {
  if (!data || typeof data !== "object") return false;
  if (data.from) return true;
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf("google.") === 0 || k.indexOf("gcm.") === 0 ||
        k.indexOf("firebase-messaging") === 0) return true;
  }
  if (data.fcmOptions && data.notification) return true;
  return false;
}

self.addEventListener("push", function (event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json() || {}; }
    catch (e) {
      try { data = { body: event.data.text() }; } catch (e2) { data = {}; }
    }
  }
  /* FCM message: the messaging layer's onBackgroundMessage
     handler shows it. Stay silent here to avoid duplicates. */
  if (PG_FCM_ACTIVE && looksLikeFcmMessage(data)) return;
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

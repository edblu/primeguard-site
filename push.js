/* ============================================================
   PRIMEGUARD PUSH NOTIFICATIONS (FCM web push)
   ------------------------------------------------------------
   Loaded by account.html (customer portal) and
   vendor-dashboard.html. Exposes window.PGpush:

     PGpush.enable("customer" | "vendor")
       Asks for notification permission, fetches this device's
       FCM registration token, and saves it to the Firestore
       push_tokens/{uid} doc so PrimeGuard can buzz this phone:
       quote ready / job scheduled for customers, new job or
       quote request for vendors.

     PGpush.state() -> Promise<"on" | "off">
       "on" when a token doc exists for the signed-in user.

   Buttons are wired here by delegation (no edits to
   account.js / vendor-dashboard.js needed):
     #pgPushBtn        customer portal  -> enable("customer")
     #pgPushBtnVendor  vendor dashboard -> enable("vendor")

   Nothing runs until a button is tapped: permission prompts
   must come from a user gesture. The VAPID key below is the
   PUBLIC half of the project's Web Push key pair (safe in
   client code by design).
   ============================================================ */
(function () {
  var VAPID_KEY = "BEDkWVBT5md9NPGyQJs7NnkYKyh2D_BCE5PTXDvAUEiGZIYn8n9_POKb2Ui0KF2dsQAkQlIua8qfKEb0x6xepOk";
  var MESSAGING_SDK = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js";
  var LS_ON = "pg_push_on";

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  /* ---------- Tiny toast (self-contained: the portals have no
     shared toast helper). Dark pill, bottom center, auto-hide. */
  var toastTimer = null;
  function toast(msg, ms) {
    try {
      var el = document.getElementById("pg-push-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "pg-push-toast";
        el.setAttribute("role", "status");
        el.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translate(-50%,16px);" +
          "z-index:1400;max-width:min(480px,calc(100% - 32px));padding:12px 18px;border-radius:14px;" +
          "background:linear-gradient(160deg,#1a1a1e,#0b0b0d 72%);border:1px solid rgba(212,168,67,.55);" +
          "box-shadow:0 18px 44px rgba(0,0,0,.6);color:#f5f1e6;font-size:.92rem;line-height:1.45;" +
          "font-family:Inter,system-ui,-apple-system,sans-serif;opacity:0;pointer-events:none;" +
          "transition:opacity .3s ease,transform .3s ease;text-align:center;";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      el.style.transform = "translate(-50%,0)";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%,16px)";
      }, ms || 4500);
    } catch (e) { /* a toast must never break the page */ }
  }

  /* ---------- Firebase plumbing ---------- */
  function ensureFirebase() {
    if (typeof firebase === "undefined") return Promise.reject(new Error("no-firebase"));
    try {
      if (!firebase.apps.length && window.SITE_CONFIG && window.SITE_CONFIG.firebase) {
        firebase.initializeApp(window.SITE_CONFIG.firebase);
      }
    } catch (e) { /* already initialized by the page's own script */ }
    return Promise.resolve();
  }

  var sdkPromise = null;
  function ensureMessagingSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = ensureFirebase().then(function () {
      if (firebase.messaging) return null;
      /* The portals load app/auth/firestore compat but not
         messaging: pull it in on first use. */
      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = MESSAGING_SDK;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error("messaging-sdk-load")); };
        document.head.appendChild(s);
      });
    });
    return sdkPromise;
  }

  /* Resolve with the signed-in user, or null if still nobody
     after the timeout (session restore can lag the first
     onAuthStateChanged callback, so nulls are ignored). */
  function waitForUser(timeoutMs) {
    return ensureFirebase().then(function () {
      var auth = firebase.auth();
      if (auth.currentUser) return auth.currentUser;
      return new Promise(function (resolve) {
        var done = false;
        var unsub = auth.onAuthStateChanged(function (user) {
          if (user && !done) { done = true; if (unsub) unsub(); resolve(user); }
        });
        setTimeout(function () {
          if (!done) { done = true; if (unsub) unsub(); resolve(auth.currentUser || null); }
        }, timeoutMs || 4000);
      });
    });
  }

  function requestPermission() {
    return new Promise(function (resolve) {
      try {
        var r = Notification.requestPermission(function (res) { resolve(res); });
        if (r && typeof r.then === "function") r.then(function (res) { resolve(res); });
      } catch (e) { resolve("denied"); }
    });
  }

  /* The /sw.js registration (site.js's PWA module registers it on
     window load). register() is idempotent; we then wait for the
     worker to be ACTIVE, which FCM's getToken requires. */
  function activeRegistration() {
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error("no-sw"));
    return navigator.serviceWorker.register("/sw.js").then(function (reg) {
      if (reg.active) return reg;
      return new Promise(function (resolve) {
        var settled = false;
        var finish = function () { if (!settled) { settled = true; resolve(reg); } };
        var sw = reg.installing || reg.waiting;
        if (sw) {
          sw.addEventListener("statechange", function () {
            if (sw.state === "activated") finish();
          });
        }
        setTimeout(finish, 10000); /* never hang a tap forever */
      });
    });
  }

  function saveToken(user, surface, token) {
    var data = {
      token: token,
      surface: surface,
      email: user.email || "",
      userAgent: navigator.userAgent || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    /* The vendor doc id IS the auth uid on this site
       (vendor-dashboard.js reads vendors/{uid}), so the sender
       can map vendor doc id -> this token directly. */
    if (surface === "vendor") data.vendorId = user.uid;
    return firebase.firestore().collection("push_tokens").doc(user.uid)
      .set(data, { merge: true });
  }

  /* ---------- Public API ---------- */
  function enable(surface) {
    surface = surface === "vendor" ? "vendor" : "customer";
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast("This browser doesn't support notifications.");
      return Promise.resolve(false);
    }
    var user = null;
    return ensureMessagingSdk()
      .then(function () { return waitForUser(4000); })
      .then(function (u) {
        user = u;
        if (!user) {
          toast("Sign in first, then tap the button again.");
          throw { pgHandled: true };
        }
        return requestPermission();
      })
      .then(function (perm) {
        if (perm === "denied") {
          toast("Notifications are blocked for this site. Allow them in your browser's site settings, then tap again.");
          throw { pgHandled: true };
        }
        if (perm !== "granted") {
          toast("Notification permission wasn't granted.");
          throw { pgHandled: true };
        }
        return activeRegistration();
      })
      .then(function (reg) {
        return firebase.messaging().getToken({
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg
        });
      })
      .then(function (token) {
        if (!token) {
          toast("Couldn't get a notification token for this phone. Please try again.");
          throw { pgHandled: true };
        }
        return saveToken(user, surface, token);
      })
      .then(function () {
        lsSet(LS_ON, "1");
        refreshLabels();
        toast("Notifications on for this phone ✓");
        return true;
      })
      .catch(function (err) {
        if (err && err.pgHandled) return false;
        try { console.error("PGpush.enable", err); } catch (e) { /* ignore */ }
        var code = err && err.code ? String(err.code) : "";
        if (code.indexOf("permission-denied") !== -1) {
          /* Firestore rules may not be published yet; the token
             exists in the browser but couldn't be saved. */
          toast("Notifications couldn't be saved yet. Please try again in a bit.");
        } else if (code.indexOf("messaging/") === 0) {
          toast("This browser couldn't register for notifications. On iPhone, add PrimeGuard to your Home Screen first, then tap again.");
        } else {
          toast("Something went wrong turning on notifications. Please try again.");
        }
        return false;
      });
  }

  function state() {
    return ensureFirebase()
      .then(function () { return waitForUser(2500); })
      .then(function (user) {
        if (!user) return lsGet(LS_ON) === "1" ? "on" : "off";
        return firebase.firestore().collection("push_tokens").doc(user.uid).get()
          .then(function (snap) {
            var on = snap.exists && !!((snap.data() || {}).token);
            if (on) lsSet(LS_ON, "1");
            return on ? "on" : "off";
          })
          .catch(function () {
            /* Doc unreadable (rules): fall back to this phone's
               own memory of a successful opt-in. */
            return lsGet(LS_ON) === "1" ? "on" : "off";
          });
      })
      .catch(function () { return "off"; });
  }

  /* ---------- Button wiring + labels ---------- */
  function refreshLabels() {
    state().then(function (st) {
      if (st !== "on") return;
      var b1 = document.getElementById("pgPushBtn");
      if (b1) b1.textContent = "🔔 Notifications on ✓";
      var b2 = document.getElementById("pgPushBtnVendor");
      if (b2) b2.textContent = "🔔 Job alerts on ✓";
    });
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === "pgPushBtn") enable("customer");
    else if (t.id === "pgPushBtnVendor") enable("vendor");
  });

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    try {
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) refreshLabels();
      });
    } catch (e) { /* labels are progressive enhancement */ }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  window.PGpush = { enable: enable, state: state };
})();

// PrimeGuard customer account logic (Firebase Auth + Firestore).
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  var configured = !!cfg && cfg.apiKey;

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  if (!configured) {
    show($("account-coming-soon"));
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var authForms = $("auth-forms"), dashboard = $("account-dashboard");

  // Auth tabs
  $("tab-login").addEventListener("click", function () {
    $("tab-login").classList.add("active"); $("tab-signup").classList.remove("active");
    show($("form-login")); hide($("form-signup"));
  });
  $("tab-signup").addEventListener("click", function () {
    $("tab-signup").classList.add("active"); $("tab-login").classList.remove("active");
    show($("form-signup")); hide($("form-login"));
  });

  // Mobile hamburger menu: wired by site.js's standalone nav-drawer
  // module (this page loads site.js in PWA-only mode, and that module
  // runs there too). Do not wire #navToggle here — double handlers
  // would toggle the drawer open and shut on a single click.

  // Promo banner slot (Midnight Gold dashboard). Driven by SITE_CONFIG.promoBanner.
  // Empty/missing title = banner stays hidden.
  (function () {
    try {
      var p = (window.SITE_CONFIG && window.SITE_CONFIG.promoBanner) || {};
      if (!p.title) return;
      var b = document.getElementById("promoBanner");
      if (!b) return;
      document.getElementById("promoTitle").textContent = p.title;
      document.getElementById("promoSub").textContent = p.sub || "";
      document.getElementById("promoCta").textContent = p.cta || "Learn more";
      b.href = p.link || "#";
      b.classList.remove("hidden");
    } catch (e) {}
  })();

  // Settings slide-over panel
  var settingsPanel = $("settingsPanel"), settingsOverlay = $("settingsOverlay");
  function openSettings() {
    settingsPanel.classList.add("open"); settingsOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSettings() {
    settingsPanel.classList.remove("open"); settingsOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  $("settingsOpenBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", closeSettings);

  // (tabs removed. The page now scrolls hero → requests → jobs → settings)

  var yr = $("acct-year");
  if (yr) yr.textContent = new Date().getFullYear();

  // Friendly auth errors: never show raw Firebase text to users.
  function friendlyAuthError(err) {
    var code = (err && err.code) || "";
    var map = {
      "auth/invalid-credential": "That email and password don't match our records. Check for typos — or if you signed up with Google, use Continue with Google.",
      "auth/wrong-password": "That email and password don't match our records. Check for typos — or if you signed up with Google, use Continue with Google.",
      "auth/user-not-found": "That email and password don't match our records. Check for typos — or if you signed up with Google, use Continue with Google.",
      "auth/email-already-in-use": "That email already has an account. Try logging in instead.",
      "auth/weak-password": "Password needs at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Wait a minute and try again, or reset your password.",
      "auth/network-request-failed": "Connection problem. Check your internet and try again."
    };
    if (map[code]) return map[code];
    var msg = (err && err.message) || "Something went wrong. Please try again.";
    msg = msg.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[a-z0-9-]+\)\.?$/i, "").trim();
    return msg || "Something went wrong. Please try again.";
  }

  function authError(err, elId) {
    var el = $(elId); el.textContent = friendlyAuthError(err);
    show(el);
  }

  // Busy state so a submit click never looks dead.
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true; btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  // Email/password login
  $("form-login").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("login-error")); hide($("login-reset-ok"));
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, "Signing in...");
    auth.signInWithEmailAndPassword($("login-email").value.trim(), $("login-password").value.trim())
      .then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); authError(err, "login-error"); });
  });

  // Forgot password (mirrors the vendor dashboard pattern)
  $("login-forgot").addEventListener("click", function (e) {
    e.preventDefault(); hide($("login-error")); hide($("login-reset-ok"));
    var email = $("login-email").value.trim();
    if (!email) {
      var el = $("login-error");
      el.textContent = "Type your email above first, then tap Forgot password.";
      show(el); return;
    }
    auth.sendPasswordResetEmail(email).then(function () {
      var ok = $("login-reset-ok");
      ok.textContent = "Reset link sent to " + email + ".";
      show(ok);
    }).catch(function (err) { authError(err, "login-error"); });
  });

  // Email/password signup
  $("form-signup").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("signup-error"));
    var name = $("signup-name").value.trim();
    var email = $("signup-email").value.trim();
    var phone = $("signup-phone").value.trim();
    var pw = $("signup-password").value;
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, "Creating account...");
    auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
      return db.collection("customers").doc(cred.user.uid).set({
        name: name, email: email, phone: phone, address: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); authError(err, "signup-error"); });
  });

  // Google sign-in (shared, mobile-safe)
  function googleSignIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function (cred) {
      var ref = db.collection("customers").doc(cred.user.uid);
      return ref.get().then(function (snap) {
        if (!snap.exists) {
          return ref.set({
            name: cred.user.displayName || "", email: cred.user.email || "",
            phone: "", address: "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    }).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request")) {
        auth.signInWithRedirect(provider);
      } else {
        authError(err, "login-error"); show($("form-login")); hide($("form-signup"));
      }
    });
  }
  $("google-login").addEventListener("click", googleSignIn);
  $("google-signup").addEventListener("click", googleSignIn);

  // Logout
  $("logout-btn").addEventListener("click", function () { auth.signOut(); });

  // Profile save (settings tab)
  $("profile-form").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("profile-error")); hide($("profile-ok"));
    var user = auth.currentUser; if (!user) return;
    db.collection("customers").doc(user.uid).set({
      name: $("profile-name").value.trim(),
      phone: $("profile-phone").value.trim(),
      address: $("profile-address").value.trim(),
      email: user.email || ""
    }, { merge: true }).then(function () {
      show($("profile-ok"));
      var n = $("profile-name").value.trim().split(" ")[0];
      if (n) $("dashboard-name").textContent = n;
    }).catch(function (err) { authError(err, "profile-error"); });
  });

  function daypart() {
    var h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function pillFor(status) {
    var s = String(status || "new").toLowerCase().replace(/[\s-]+/g, "_");
    var cls = "pill-new", label = status || "New";
    if (s === "done" || s === "completed") { cls = "pill-done"; }
    else if (s === "in_progress" || s === "scheduled" || s === "accepted" || s === "confirmed" || s === "review") { cls = "pill-progress"; }
    else if (s === "cancelled" || s === "canceled" || s === "declined") { cls = "pill-cancel"; }
    return '<span class="pill ' + cls + '">' + esc(label) + "</span>";
  }

  function fmtDate(ts) {
    try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""; }
    catch (e) { return ""; }
  }
  function fmtDateKey(key) {
    if (!key) return "";
    var p = String(key).split("-");
    if (p.length !== 3) return String(key);
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function tsMillis(ts) {
    try {
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      var t = new Date(ts).getTime();
      return isNaN(t) ? 0 : t;
    } catch (e) { return 0; }
  }

  // Staff-only "Admin dashboard" entry: visible when a staff/{uid} doc exists
  // or for the owner account; stays hidden for regular customers and on any error.
  function checkStaffEntry(user) {
    var btn = $("pgAdminBtn");
    if (!btn) return;
    // The button is hidden with an inline style="display:none" in the HTML,
    // so toggle the inline style directly — the class-based show()/hide()
    // helpers cannot override it (that mismatch kept the button invisible).
    btn.style.display = "none";
    if (!user) return;
    try {
      if (user.email === "edblucorp@gmail.com") { btn.style.display = ""; return; }
      db.collection("staff").doc(user.uid).get().then(function (snap) {
        if (snap && snap.exists) btn.style.display = "";
      }).catch(function () { /* leave hidden */ });
    } catch (e) { /* leave hidden */ }
  }

  // Auth state
  auth.onAuthStateChanged(function (user) {
    if (user) {
      hide(authForms); hide($("account-hero-static")); show(dashboard);
      checkStaffEntry(user);
      var ref = db.collection("customers").doc(user.uid);
      ref.get().then(function (snap) {
        var d = snap.exists ? snap.data() : {};
        var first = (d.name || user.displayName || "there").split(" ")[0];
        $("dashboard-greeting").textContent = daypart();
        $("dashboard-name").textContent = first;
        $("profile-name").value = d.name || user.displayName || "";
        $("profile-phone").value = d.phone || "";
        $("profile-address").value = d.address || "";
        custInfo.name = d.name || user.displayName || "";
        custInfo.phone = d.phone || "";
        custInfo.email = d.email || user.email || "";
        var since = "-";
        if (d.createdAt && d.createdAt.toDate) since = d.createdAt.toDate().getFullYear();
        else if (user.metadata && user.metadata.creationTime) since = new Date(user.metadata.creationTime).getFullYear();
        $("stat-since").textContent = since;
        badgeCtx.memberYear = parseInt(since, 10) || 0; renderBadges();
      }).catch(function () {
        $("dashboard-greeting").textContent = daypart();
        $("dashboard-name").textContent = (user.displayName || "there").split(" ")[0];
      });
      loadRequests(user.uid); loadJobs(user.uid); loadExtras(user); loadCustomerQuotes(user); loadCustCalendar(user);
    } else {
      show(authForms); show($("account-hero-static")); hide(dashboard);
      checkStaffEntry(null);
    }
  });

  function emptyState(box, text, ctaHref, ctaText) {
    var cta = "";
    if (ctaHref === "modal") {
      cta = '<button type="button" class="btn btn-gold btn-sm" data-open-req>' + esc(ctaText) + "</button>";
    } else if (ctaHref) {
      cta = '<a class="btn btn-gold btn-sm" href="' + ctaHref + '">' + esc(ctaText) + "</a>";
    }
    box.innerHTML = '<div class="acct-empty"><p>' + esc(text) + "</p>" + cta + "</div>";
  }

  function loadRequests(uid) {
    // (no orderBy: composite index not guaranteed. Sort client-side)
    db.collection("service_requests").where("uid", "==", uid).limit(25).get()
      .then(function (qs) {
        var box = $("requests-list");
        var active = 0;
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().createdAt) - tsMillis(a.data().createdAt); });
        docs = docs.slice(0, 10);
        if (!docs.length) {
          emptyState(box, "No requests yet. Tell us what your home needs.", "modal", "Request service");
          renderQuotes([]);
        } else {
          box.innerHTML = "";
          var quotes = [];
          docs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "new").toLowerCase();
            if (st === "quoted") { quotes.push(doc); return; } // shown in Action needed
            if (["new", "received", "in_progress", "scheduled", "accepted", "confirmed"].indexOf(st.replace(/[\s-]+/g, "_")) > -1) active++;
            var editable = st.replace(/[\s-]+/g, "_") === "new";
            var div = document.createElement("div"); div.className = "req-row";
            var mediaHtml = "";
            var rPhotos = Array.isArray(d.photos) ? d.photos : [];
            var rVideos = Array.isArray(d.videos) ? d.videos : [];
            if (rPhotos.length) {
              mediaHtml += '<div class="job-thumbs">' + rPhotos.slice(0, 4).map(function (u) {
                return '<img src="' + esc(u) + '" alt="Request photo" loading="lazy">';
              }).join("") + "</div>";
            }
            if (rVideos.length || d.videoLink) {
              mediaHtml += '<div class="req-vids">' + rVideos.map(function (u, i) {
                return '<a href="' + esc(u) + '" target="_blank" rel="noopener">🎬 Video ' + (i + 1) + "</a>";
              }).join("") + (d.videoLink ? '<a href="' + esc(d.videoLink) + '" target="_blank" rel="noopener">🎬 Video link</a>' : "") + "</div>";
            }
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span class="req-date"></span>' + timelineFor(st) + mediaHtml + '</div>' + pillFor(d.status) +
              '<button type="button" class="req-edit" data-add-media="' + doc.id + '">Add photos / video</button>' +
              (editable ? '<button type="button" class="req-edit" data-edit-req="' + doc.id + '">Edit</button>' : "");
            div.querySelector("strong").textContent = d.service || "Service request";
            div.querySelector(".req-date").textContent = fmtDate(d.createdAt);
            box.appendChild(div);
            var panel = document.createElement("div");
            panel.className = "req-media-panel hidden";
            panel.setAttribute("data-media-panel", doc.id);
            panel.innerHTML =
              '<label>Photos<input type="file" accept="image/*" multiple data-mp-photos></label>' +
              '<label>Videos <span style="font-weight:400;color:#a89a7d">(25 MB max each. Bigger? Use the link field below)</span><input type="file" accept="video/*" multiple data-mp-videos></label>' +
              '<label>Or paste a video link<input type="text" data-mp-link placeholder="Google Photos, iCloud, YouTube…"></label>' +
              '<p class="req-media-msg" data-mp-msg></p>' +
              '<div class="req-media-btns"><button type="button" class="btn btn-gold btn-sm" data-mp-save>Add to request</button>' +
              '<button type="button" class="req-edit" data-mp-cancel>Cancel</button></div>';
            box.appendChild(panel);
          });
          renderQuotes(quotes);
        }
        $("stat-requests").textContent = active;
      }).catch(function () {
        emptyState($("requests-list"), "Couldn't load requests right now.", null, null);
      });
  }

  function loadJobs(uid) {
    // (no orderBy: composite index not guaranteed. Sort client-side)
    db.collection("jobs").where("uid", "==", uid).limit(25).get()
      .then(function (qs) {
        var box = $("jobs-list");
        var done = 0;
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().scheduledAt) - tsMillis(a.data().scheduledAt); });
        docs = docs.slice(0, 10);
        if (!docs.length) {
          emptyState(box, "No jobs yet. Your completed and upcoming jobs will live here.", "index.html#services", "Browse services");
          renderGallery([]);
        } else {
          box.innerHTML = "";
          var gallery = [];
          docs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "scheduled").toLowerCase();
            if (st === "done" || st === "completed") done++;
            var div = document.createElement("div"); div.className = "req-row";
            var thumbs = "";
            if (Array.isArray(d.photos) && d.photos.length) {
              d.photos.slice(0, 4).forEach(function (u) { gallery.push({ url: u, service: d.service || "Job" }); });
              thumbs = '<div class="job-thumbs">' + d.photos.slice(0, 4).map(function (u) {
                return '<img src="' + esc(u) + '" alt="Job photo" loading="lazy">';
              }).join("") + "</div>";
            }
            var again = (st === "done" || st === "completed")
              ? '<button type="button" class="req-again" data-again="' + esc(d.service || "Lawn Care") + '">Book again</button>' : "";
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span class="req-date"></span>' + thumbs + "</div>" + pillFor(d.status) + again;
            div.querySelector("strong").textContent = d.service || "Job";
            div.querySelector(".req-date").textContent = fmtDate(d.scheduledAt);
            box.appendChild(div);
          });
          renderGallery(gallery);
        }
        $("stat-jobs").textContent = done;
        badgeCtx.jobsDone = done; renderBadges();
      }).catch(function () {
        emptyState($("jobs-list"), "Couldn't load jobs right now.", null, null);
      });
  }
  /* ---------- Dashboard extras: quotes, reorder, referrals, gallery, plan, properties, seasonal ---------- */

  function timelineFor(st) {
    var stages = ["Received", "Scheduled", "In progress", "Done"];
    var idx = 0;
    if (["scheduled", "confirmed", "approved"].indexOf(st) > -1) idx = 1;
    else if (st === "in_progress") idx = 2;
    else if (["done", "completed"].indexOf(st) > -1) idx = 3;
    else if (["cancelled", "declined"].indexOf(st) > -1)
      return '<div class="req-tl"><span class="tl-cancel">Cancelled</span></div>';
    var dots = "";
    for (var i = 0; i < 4; i++) dots += '<i class="' + (i <= idx ? "on" : "") + '"></i>';
    return '<div class="req-tl">' + dots + "<span>" + stages[idx] + "</span></div>";
  }

  function renderQuotes(list) {
    var sec = $("quoteSection"), box = $("quotes-list");
    if (!sec || !box) return;
    if (!list.length) { hide(sec); return; }
    show(sec);
    $("quoteCount").textContent = list.length + (list.length === 1 ? " quote" : " quotes");
    box.innerHTML = "";
    list.forEach(function (doc) {
      var d = doc.data();
      var el = document.createElement("div"); el.className = "quote-card";
      el.innerHTML =
        '<div class="q-main"><strong></strong><span class="q-det"></span><span class="q-notes"></span></div>' +
        '<div class="q-side"><div class="q-price"></div>' +
        '<div class="q-btns"><button type="button" class="btn btn-gold btn-sm" data-qok>Approve</button>' +
        '<button type="button" class="btn-ghost-w btn-sm" data-qno>Decline</button></div></div>';
      el.querySelector("strong").textContent = d.service || "Service";
      el.querySelector(".q-det").textContent = d.message || "";
      el.querySelector(".q-notes").textContent = d.quoteNotes || "";
      el.querySelector(".q-price").textContent = d.quotePrice || "-";
      el.querySelector("[data-qok]").addEventListener("click", function () { decideQuote(doc.id, "approved"); });
      el.querySelector("[data-qno]").addEventListener("click", function () { decideQuote(doc.id, "declined"); });
      box.appendChild(el);
    });
  }

  function decideQuote(id, status) {
    var u = auth.currentUser; if (!u) return;
    db.collection("service_requests").doc(id)
      .update({ status: status, decidedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { loadRequests(u.uid); })
      .catch(function () { alert("Couldn't update that quote. Please call us at (786) 422-9674."); });
  }


  /* ---------- Your calendar: visits + personal calendar connect ---------- */
  var PG_FEED_BASE_C = "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec";
  var CCAL_DATE_FIELDS = ["scheduledFor", "scheduledDate", "serviceDate", "appointmentDate", "date", "when"];
  var ccalMap = {}, ccalCursor = null, ccalSelected = "", ccalNextKey = "", ccalUser = null, ccalProfile = null, ccalWired = false;
  var ccalWos = [];        // raw work order rows behind ccalMap (live tracker reads these)
  var ccalLiveIds = {};    // work order ids with a live snapshot listener attached
  function ccalPad(n) { return (n < 10 ? "0" : "") + n; }
  function ccalKey(d) { return d.getFullYear() + "-" + ccalPad(d.getMonth() + 1) + "-" + ccalPad(d.getDate()); }
  function ccalParse(x) {
    if (!x) return null;
    if (typeof x.toDate === "function") { try { return x.toDate(); } catch (e) { return null; } }
    if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
    if (typeof x === "object" && typeof x.seconds === "number") return new Date(x.seconds * 1000);
    if (typeof x === "string" || typeof x === "number") { var d = new Date(x); return isNaN(d.getTime()) ? null : d; }
    return null;
  }
  function ccalBuild(wos) {
    ccalMap = {};
    function pushEv(w, d) {
      var k = ccalKey(d);
      if (!ccalMap[k]) ccalMap[k] = [];
      ccalMap[k].push({ w: w, date: new Date(d) });
    }
    (wos || []).forEach(function (w) {
      var anchor = w.planAnchor ? ccalParse(w.planAnchor) : null;
      var count = parseInt(w.visitCount, 10) || 0;
      if (anchor && count > 1) {
        var step = w.cadence === "weekly" ? 7 : 14;
        var t = ccalParse(w.scheduledFor);
        for (var i = 0; i < count; i++) {
          var d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i * step);
          if (t && (t.getHours() || t.getMinutes())) d.setHours(t.getHours(), t.getMinutes(), 0, 0);
          pushEv(w, d);
        }
      } else {
        var placed = false;
        for (var j = 0; j < CCAL_DATE_FIELDS.length; j++) {
          var dd = ccalParse(w[CCAL_DATE_FIELDS[j]]);
          if (dd) { pushEv(w, dd); placed = true; break; }
        }
        if (!placed) { var cd = ccalParse(w.createdAt); if (cd) pushEv(w, cd); }
      }
    });
    var todayK = ccalKey(new Date());
    ccalNextKey = "";
    Object.keys(ccalMap).sort().forEach(function (k) { if (!ccalNextKey && k >= todayK) ccalNextKey = k; });
  }
  function ccalStatus(ev) {
    var st = String(ev.w.status || "");
    // Live tracking stages (2026-10-17) outrank the calendar labels.
    if (st === "en_route") return { label: "On the way", cls: "next" };
    if (st === "arrived") return { label: "Crew arrived", cls: "next" };
    var todayK = ccalKey(new Date());
    var k = ccalKey(ev.date);
    var done = ["done", "completed", "review"].indexOf(st) >= 0;
    if (k < todayK) return done ? { label: "Completed", cls: "done" } : { label: "Past visit", cls: "" };
    if (k === ccalNextKey) return { label: "Next visit", cls: "next" };
    return { label: "Scheduled", cls: "" };
  }
  function ccalTime(ev) {
    var d = ev.date;
    return (d.getHours() || d.getMinutes()) ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  }
  function renderCcal() {
    var grid = $("ccalGrid"); if (!grid) return;
    if (!ccalCursor) { var now = new Date(); ccalCursor = new Date(now.getFullYear(), now.getMonth(), 1); }
    var y = ccalCursor.getFullYear(), m = ccalCursor.getMonth();
    var titleEl = $("ccalTitle");
    if (titleEl) titleEl.textContent = ccalCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    var pill = $("ccalNext");
    if (pill) {
      if (ccalNextKey && ccalMap[ccalNextKey]) {
        var nx = ccalMap[ccalNextKey].slice().sort(function (a, b) { return a.date - b.date; })[0];
        pill.textContent = "Next: " + nx.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + (ccalTime(nx) ? " · " + ccalTime(nx) : "");
      } else pill.textContent = "";
    }
    var firstDow = new Date(y, m, 1).getDay();
    var dim = new Date(y, m + 1, 0).getDate();
    var todayK = ccalKey(new Date());
    if (!ccalSelected) ccalSelected = ccalNextKey || todayK;
    var html = "";
    for (var b = 0; b < firstDow; b++) html += '<div class="ccal-cell empty"></div>';
    for (var day = 1; day <= dim; day++) {
      var k = ccalKey(new Date(y, m, day));
      var evs = ccalMap[k] || [];
      var dots = "";
      for (var i = 0; i < Math.min(evs.length, 3); i++) dots += '<span class="ccal-dot"></span>';
      html += '<button type="button" class="ccal-cell' + (k === todayK ? " today" : "") + (k === ccalSelected ? " sel" : "") + (k === ccalNextKey ? " nextv" : "") + '" data-ccal-day="' + k + '"><span>' + day + '</span><span class="ccal-dots">' + dots + "</span></button>";
    }
    grid.innerHTML = html;
    renderCcalDay();
  }
  function renderCcalDay() {
    var box = $("ccalDay"); if (!box) return;
    var evs = (ccalMap[ccalSelected] || []).slice().sort(function (a, b) { return a.date - b.date; });
    var dObj = ccalParse(ccalSelected + "T12:00:00");
    var head = dObj ? dObj.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }) : ccalSelected;
    if (!evs.length) {
      box.innerHTML = '<div class="ccal-dayh">' + esc(head) + '</div><p class="ccal-none">No visits this day.</p>';
      renderCustTracker();
      return;
    }
    box.innerHTML = '<div class="ccal-dayh">' + esc(head) + "</div>" + evs.map(function (ev) {
      var w = ev.w, st = ccalStatus(ev);
      var crew = w.vendorBusiness || "PrimeGuard crew";
      var meta = [ccalTime(ev), "Crew: " + crew, w.address || ""].filter(Boolean).join(" · ");
      var photos = "";
      if (st.cls === "done" && Array.isArray(w.photos) && w.photos.length) {
        photos = '<div class="ccal-photos">' + w.photos.slice(0, 4).map(function (p) {
          var src = typeof p === "string" ? p : (p && (p.url || p.src)) || "";
          return src ? '<img src="' + esc(src) + '" alt="Visit photo" loading="lazy">' : "";
        }).join("") + "</div>";
      }
      return '<div class="ccal-ev"><div class="ccal-ev-tx"><strong>' + esc(w.title || w.category || "PrimeGuard visit") + "</strong>" +
        (meta ? "<small>" + esc(meta) + "</small>" : "") + photos + '</div><span class="ccal-chip ' + st.cls + '">' + esc(st.label) + "</span></div>";
    }).join("");
    renderCustTracker();
  }

  /* Live visit tracker (2026-10-17): when the crew starts the trip,
     today's next-visit card becomes a live tracker. Stages come
     straight off the work order: Scheduled, On the way (enRouteAt),
     Arrived (arrivedAt), Done (status review/done, photos shown).
     Snapshot listeners on the work orders keep it current while the
     page is open; stage push notifications go out through the same
     push_tokens plumbing the portal already uses (send-push.mjs on
     the office side reads those docs). */
  function renderCustTracker() {
    var box = $("ccalTracker");
    if (!box) return;
    var todayK = ccalKey(new Date());
    var pick = null, pickEv = null;
    function score(w) {
      var st = String(w.status || "");
      if (st === "en_route" || st === "arrived") return 3;
      if (st === "review" || st === "done") return 2;
      if (w.enRouteAt || w.arrivedAt) return 2;
      return 1;
    }
    // A crew live right now wins, even over the calendar math.
    ccalWos.forEach(function (w) {
      var st = String(w.status || "");
      if ((st === "en_route" || st === "arrived") && (!pick || score(w) > score(pick))) pick = w;
    });
    if (!pick) {
      (ccalMap[todayK] || []).forEach(function (ev) {
        if (!pick || score(ev.w) > score(pick)) { pick = ev.w; pickEv = ev; }
      });
    }
    if (!pick) { box.innerHTML = ""; return; }
    var w = pick;
    var st = String(w.status || "");
    var idx = 0;
    if (w.enRouteAt || st === "en_route" || st === "arrived" || st === "review" || st === "done") idx = 1;
    if (w.arrivedAt || st === "arrived" || st === "review" || st === "done") idx = 2;
    if (st === "review" || st === "done") idx = 3;
    var names = ["Scheduled", "On the way", "Arrived", "Done"];
    var steps = names.map(function (n, i) {
      var cls = "ct-step" + (i < idx ? " on" : (i === idx ? " on now" : ""));
      return '<div class="' + cls + '">' + n + "</div>";
    }).join("");
    var live = "";
    if (idx === 1) live = "Your crew is on the way. This page updates the moment they arrive.";
    else if (idx === 2) live = "Your crew has arrived and is getting to work.";
    else if (idx === 3 && st === "review") live = "Your crew finished this visit. Here are the photos.";
    else if (idx === 3) live = "All done, confirmed by our office. Here are the photos from the visit.";
    else live = "This tracker goes live the moment your crew starts the trip.";
    var photos = "";
    if (idx === 3 && Array.isArray(w.photos) && w.photos.length) {
      photos = '<div class="ccal-photos">' + w.photos.slice(0, 6).map(function (p) {
        var src = typeof p === "string" ? p : (p && (p.url || p.src)) || "";
        return src ? '<img src="' + esc(src) + '" alt="Visit photo" loading="lazy">' : "";
      }).join("") + "</div>";
    }
    var when = pickEv ? ccalTime(pickEv) : "";
    box.innerHTML = '<div class="ccal-track"><h4>🚗 Live visit tracker</h4>' +
      '<p class="ct-sub">' + esc(w.title || w.category || "PrimeGuard visit") + (when ? " · " + esc(when) : "") +
      " · Crew: " + esc(w.vendorBusiness || "PrimeGuard crew") + "</p>" +
      '<div class="ct-steps">' + steps + "</div>" +
      (live ? '<p class="ct-live">' + esc(live) + "</p>" : "") + photos + "</div>";
  }
  function ccalNewToken() {
    var s = "", chars = "abcdef0123456789";
    for (var i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function ccalIcsText() {
    function escT(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function z(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrimeGuard//Customer Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PrimeGuard Visits"];
    var stamp = z(new Date());
    Object.keys(ccalMap).forEach(function (k) {
      ccalMap[k].forEach(function (ev, idx) {
        var w = ev.w;
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + (w.id || "wo") + "-" + k + "-" + idx + "@primeguardmia.com");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART:" + z(ev.date));
        lines.push("DTEND:" + z(new Date(ev.date.getTime() + 90 * 60000)));
        lines.push("SUMMARY:" + escT("PrimeGuard visit: " + (w.category || w.title || "Service")));
        if (w.address) lines.push("LOCATION:" + escT(w.address));
        lines.push("DESCRIPTION:" + escT("Your PrimeGuard service visit. Crew: " + (w.vendorBusiness || "PrimeGuard") + ". Questions? Call (786) 422-9674."));
        lines.push("END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function writeCustCalFeedSnapshot() {
    if (!ccalUser || !ccalProfile || !ccalProfile.calendarToken) return;
    try {
      db.collection("calendar_feeds").doc(ccalProfile.calendarToken).set({
        kind: "customer", ownerUid: ccalUser.uid, ics: ccalIcsText(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }
  function renderCcalConnect() {
    var box = $("ccalConnectBody"); if (!box || !ccalUser) return;
    var tok = ccalProfile && ccalProfile.calendarToken;
    if (!tok) {
      box.innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="ccalGenBtn">Create my calendar link</button>';
      var gb = $("ccalGenBtn");
      if (gb) gb.addEventListener("click", ccalSetToken);
      return;
    }
    var link = PG_FEED_BASE_C + "?feed=customer&id=" + encodeURIComponent(ccalUser.uid) + "&t=" + encodeURIComponent(tok);
    box.innerHTML = '<div class="ccal-linkrow"><input type="text" readonly id="ccalLink" value="' + esc(link) + '"><button type="button" class="btn btn-gold btn-sm" id="ccalCopy">Copy</button></div>' +
      '<p class="ccal-how">Google Calendar: Settings, then Add calendar, then From URL, paste the link. iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.</p>' +
      '<button type="button" class="ccal-revoke" id="ccalRegen">Get a new link (the old one stops working)</button>';
    var cp = $("ccalCopy");
    if (cp) cp.addEventListener("click", function () {
      var i = $("ccalLink"); if (!i) return; i.select();
      try { navigator.clipboard.writeText(i.value); } catch (e) { try { document.execCommand("copy"); } catch (e2) {} }
      cp.textContent = "Copied \u2713";
      setTimeout(function () { var b = $("ccalCopy"); if (b) b.textContent = "Copy"; }, 1600);
    });
    var rg = $("ccalRegen");
    if (rg) rg.addEventListener("click", ccalSetToken);
  }
  function ccalSetToken() {
    if (!ccalUser) return;
    var old = ccalProfile && ccalProfile.calendarToken;
    var tok = ccalNewToken();
    db.collection("customers").doc(ccalUser.uid).set({ calendarToken: tok }, { merge: true }).then(function () {
      if (!ccalProfile) ccalProfile = {};
      ccalProfile.calendarToken = tok;
      if (old && old !== tok) db.collection("calendar_feeds").doc(old).delete().catch(function () {});
      renderCcalConnect();
      writeCustCalFeedSnapshot();
    }).catch(function () {});
  }
  function loadCustCalendar(u) {
    var sec = $("custCalSection");
    if (!sec || !u || !u.email) return;
    ccalUser = u;
    show(sec);
    if (!ccalWired) {
      ccalWired = true;
      var grid = $("ccalGrid");
      if (grid) grid.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest("[data-ccal-day]") : null;
        if (!t) return;
        ccalSelected = t.getAttribute("data-ccal-day");
        renderCcal();
      });
      var pv = $("ccalPrev"), nv = $("ccalNextBtn");
      if (pv) pv.addEventListener("click", function () { ccalCursor = new Date(ccalCursor.getFullYear(), ccalCursor.getMonth() - 1, 1); renderCcal(); });
      if (nv) nv.addEventListener("click", function () { ccalCursor = new Date(ccalCursor.getFullYear(), ccalCursor.getMonth() + 1, 1); renderCcal(); });
    }
    renderCcal();
    db.collection("customers").doc(u.uid).get().then(function (s) {
      ccalProfile = s.exists ? s.data() : {};
      renderCcalConnect();
      writeCustCalFeedSnapshot();
    }).catch(function () {});
    var email = String(u.email).toLowerCase();
    var seen = {}, woIds = [];
    function collect(qs) {
      qs.forEach(function (doc) {
        var d = doc.data();
        if (d.workOrderId && !seen[d.workOrderId]) { seen[d.workOrderId] = 1; woIds.push(d.workOrderId); }
      });
    }
    var p1 = db.collection("customer_quotes").where("customerEmail", "==", email).limit(25).get().then(collect).catch(function () {});
    var p2 = db.collection("customer_quotes").where("contact", "==", email).limit(25).get().then(collect).catch(function () {});
    Promise.all([p1, p2]).then(function () {
      if (!woIds.length) { ccalWos = []; ccalBuild([]); renderCcal(); return; }
      var gets = woIds.map(function (id) {
        return db.collection("work_orders").doc(id).get().then(function (s) {
          return s.exists ? Object.assign({ id: s.id }, s.data()) : null;
        }).catch(function () { return null; });
      });
      Promise.all(gets).then(function (rows) {
        ccalWos = rows.filter(Boolean);
        ccalBuild(ccalWos);
        renderCcal();
        writeCustCalFeedSnapshot();
        // Live updates: one snapshot listener per work order keeps the
        // calendar and the live tracker current while this page is
        // open (the vendor's On my way tap and automatic arrival land
        // here within seconds, no refresh needed).
        woIds.forEach(function (id) {
          if (ccalLiveIds[id]) return;
          ccalLiveIds[id] = true;
          try {
            db.collection("work_orders").doc(id).onSnapshot(function (s) {
              if (!s.exists) return;
              var row = Object.assign({ id: s.id }, s.data());
              var found = false;
              ccalWos = ccalWos.map(function (r) { if (r.id === id) { found = true; return row; } return r; });
              if (!found) ccalWos.push(row);
              ccalBuild(ccalWos);
              renderCcal();
            }, function () {});
          } catch (e) {}
        });
      });
    }).catch(function () {});
  }

  // "Your quotes": the formal customer quotes staff built from a vendor
  // quote (customer_quotes collection), matched by the email the quote was
  // addressed to. Separate from the request quotes above. Any failure
  // (rules, network) hides the section silently.
  function loadCustomerQuotes(u) {
    var sec = $("custQuotesSection"), box = $("cust-quotes-list");
    if (!sec || !box || !u || !u.email) return;
    db.collection("customer_quotes").where("customerEmail", "==", String(u.email).toLowerCase()).limit(25).get()
      .then(function (qs) {
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().createdAt) - tsMillis(a.data().createdAt); });
        if (!docs.length) { hide(sec); return; }
        show(sec);
        $("custQuoteCount").textContent = docs.length + (docs.length === 1 ? " quote" : " quotes");
        box.innerHTML = "";
        docs.forEach(function (doc) {
          var d = doc.data();
          var signed = d.status === "signed";
          var el = document.createElement("div"); el.className = "quote-card";
          el.innerHTML =
            '<div class="q-main"><strong></strong><span class="q-det"></span></div>' +
            '<div class="q-side"><div class="q-price"></div>' +
            (signed
              ? '<span class="pill pill-done">Signed ✓</span>'
              : '<span class="pill pill-new">Awaiting your signature</span>' +
                '<div class="q-btns"><a class="btn btn-gold btn-sm" href="quote-sign.html?id=' + doc.id + '">Review &amp; sign</a></div>') +
            "</div>";
          el.querySelector("strong").textContent = d.service || "PrimeGuard quote";
          el.querySelector(".q-det").textContent = signed
            ? "Signed " + fmtDate(d.signedAt) + (d.payChoice === "deposit20" ? " · 20% deposit" : " · Full payment")
            : "Valid until " + fmtDateKey(d.expiresAt);
          el.querySelector(".q-price").textContent = "$" + (Number(d.total) || 0).toLocaleString();
          box.appendChild(el);
        });
      })
      .catch(function () { hide(sec); });
  }

  // One-tap reorder: opens the request window with a service preselected.
  function openReqService(name, addrNote) {
    openReq();
    if (addrNote) $("rwDetails").value = addrNote;
    rwSelect(name || "Lawn Care");
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-again]") : null;
    if (b) openReqService(b.getAttribute("data-again"));
  });

  function makeRefCode(name) {
    var base = String(name || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
    return base + "-" + Math.floor(100 + Math.random() * 900);
  }

  function loadReferral(u) {
    var body = $("referral-body"); if (!body) return;
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var code = d.referralCode || null;
      if (!code) {
        code = makeRefCode(d.name || u.displayName || "Friend");
        db.collection("customers").doc(u.uid).set({ referralCode: code }, { merge: true }).catch(function () {});
        db.collection("referral_codes").add({
          code: code, name: d.name || u.displayName || "", uid: u.uid, email: u.email || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      }
      $("refCodeVal").textContent = code;
      var rl = $("refLinkVal");
      if (rl) rl.textContent = "https://primeguardmia.com/quote.html?ref=" + code;
      db.collection("service_requests").where("referralCode", "==", code).get().then(function (qs) {
        $("refUses").textContent = qs.size;
        $("refCredit").textContent = "$" + (qs.size * 20);
        badgeCtx.refUses = qs.size; renderBadges();
        show($("refStats"));
      }).catch(function () { hide($("refStats")); });
    }).catch(function () { body.innerHTML = "<p>Couldn’t load your referral info.</p>"; });
  }

  function loadPlan(u) {
    var body = $("plan-body"); if (!body) return;
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var p = d.plan || null;
      badgeCtx.hasPlan = !!(p && p.name); renderBadges();
      if (p && p.name) {
        body.innerHTML = '<div class="plan-name"></div><div class="plan-meta"></div>' +
          '<a class="btn btn-ghost btn-sm" href="plans.html" style="color:#ffd873;border-color:rgba(255,200,90,.4)">Manage plan</a>';
        body.querySelector(".plan-name").textContent = p.name + (p.price ? ". " + p.price : "");
        body.querySelector(".plan-meta").textContent = p.nextBilling ? "Next billing: " + p.nextBilling : "";
      } else {
        body.innerHTML = "<p>Lock in a lower rate with a subscription. Lawn, pressure washing, or handyman.</p>" +
          '<a class="btn btn-gold btn-sm" href="plans.html">Browse plans</a>';
      }
    }).catch(function () { body.innerHTML = "<p>Couldn’t load your plan.</p>"; });
  }

  function renderGallery(items) {
    var card = $("galleryCard"), strip = $("gallery-strip");
    if (!card || !strip) return;
    if (!items.length) { hide(card); return; }
    show(card);
    strip.innerHTML = "";
    items.slice(0, 24).forEach(function (it) {
      var img = document.createElement("img");
      img.src = it.url; img.alt = it.service || "Job photo"; img.loading = "lazy";
      img.addEventListener("click", function () {
        $("lightboxImg").src = it.url; show($("lightbox")); document.body.style.overflow = "hidden";
      });
      strip.appendChild(img);
    });
  }

  var SEASON_TIPS = [
    { m: "January", tip: "Dry season is here. Perfect time for exterior painting and pressure washing. Check irrigation for dry spots." },
    { m: "February", tip: "Peak dry season: check the lawn for pests and trim trees before spring growth kicks in." },
    { m: "March", tip: "Clean gutters before the rainy season arrives. Clogged gutters overflow into flower beds and foundations." },
    { m: "April", tip: "Service your AC before the summer heat hits. A tune-up now beats a breakdown in August." },
    { m: "May", tip: "Rainy season is starting. Check drainage around the house and seal windows and doors." },
    { m: "June", tip: "Hurricane season begins: trim tree limbs away from the roof and secure loose outdoor items." },
    { m: "July", tip: "Watch for lawn fungus in the heat and rain. Mow high and water early in the morning." },
    { m: "August", tip: "Peak storm season: review your hurricane prep checklist and make sure drains run clear." },
    { m: "September", tip: "Peak hurricane month. Keep gutters, drains, and the roof clear of debris." },
    { m: "October", tip: "Storm season winds down: schedule a post-season roof check and yard cleanup." },
    { m: "November", tip: "Dry season returns. Ideal for pressure washing driveways and patios before the holidays." },
    { m: "December", tip: "Cool snaps can hurt tropical plants. Cover sensitive landscaping on cold nights." }
  ];
  function renderSeason() {
    var t = SEASON_TIPS[new Date().getMonth()];
    if ($("seasonMonth")) $("seasonMonth").textContent = t.m;
    if ($("seasonTip")) $("seasonTip").textContent = t.tip;
  }

  function loadProps(u) {
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      renderProps(u, d.properties || []);
    }).catch(function () {});
  }
  function renderProps(u, props) {
    var box = $("props-list"); if (!box) return;
    badgeCtx.propCount = props.length; renderBadges();
    box.innerHTML = "";
    if (!props.length)
      box.innerHTML = '<p class="pfaint">Only one home? Nothing to do here. Add rentals or family homes you manage.</p>';
    props.forEach(function (p) {
      var row = document.createElement("div"); row.className = "prop-row";
      row.innerHTML = '<div class="p-main"><strong></strong><span></span></div>' +
        '<button type="button" class="btn btn-gold btn-sm" data-preq>Request service</button>' +
        '<button type="button" class="prop-del" data-pdel aria-label="Remove property">×</button>';
      row.querySelector("strong").textContent = p.label || "Property";
      row.querySelector("span").textContent = p.address || "";
      row.querySelector("[data-preq]").addEventListener("click", function () {
        openReqService(null, "Property: " + (p.label || "") + ". " + (p.address || "") + "\n\n");
      });
      row.querySelector("[data-pdel]").addEventListener("click", function () {
        if (!confirm("Remove this property?")) return;
        db.collection("customers").doc(u.uid).set({
          properties: firebase.firestore.FieldValue.arrayRemove(p)
        }, { merge: true }).then(function () { loadProps(u); }).catch(function () {});
      });
      box.appendChild(row);
    });
  }

  function loadExtras(u) {
    loadReferral(u); loadPlan(u); loadProps(u); renderSeason(); renderBadges();
    var rc = $("refCopy");
    if (rc) rc.addEventListener("click", function () {
      var c = $("refCodeVal").textContent;
      function ok() { rc.textContent = "Copied!"; setTimeout(function () { rc.textContent = "Copy"; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok).catch(ok); else ok();
    });
    var rlc = $("refLinkCopy");
    if (rlc) rlc.addEventListener("click", function () {
      var c = ($("refLinkVal") || {}).textContent || "";
      function ok2() { rlc.textContent = "Copied!"; setTimeout(function () { rlc.textContent = "Copy link"; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok2).catch(ok2); else ok2();
    });
    var pa = $("propAdd");
    if (pa) pa.addEventListener("click", function () {
      var label = $("propLabel").value.trim(), addr = $("propAddr").value.trim();
      if (!addr) { $("propAddr").focus(); return; }
      db.collection("customers").doc(u.uid).set({
        properties: firebase.firestore.FieldValue.arrayUnion({ label: label || "Property", address: addr })
      }, { merge: true }).then(function () {
        $("propLabel").value = ""; $("propAddr").value = ""; loadProps(u);
      }).catch(function () { alert("Couldn’t save. Please try again."); });
    });
    var lb = $("lightbox");
    if (lb) {
      lb.addEventListener("click", function () { hide(lb); document.body.style.overflow = ""; });
    }
  }

  /* ---------- Achievements / badges ---------- */
  var badgeCtx = { jobsDone: 0, refUses: 0, hasPlan: false, propCount: 0, memberYear: 0 };
  var BADGES = [
    { id: "founder", icon: "🎖️", name: "Founding Member", hint: "Joined in 2026", earned: function (c) { return c.memberYear === 2026; } },
    { id: "first", icon: "🌟", name: "First Service", hint: "Complete 1 service", earned: function (c) { return c.jobsDone >= 1; } },
    { id: "loyal", icon: "🏠", name: "Loyal Customer", hint: "Complete 5 services", earned: function (c) { return c.jobsDone >= 5; } },
    { id: "royal", icon: "👑", name: "Royalty", hint: "Complete 10 services", earned: function (c) { return c.jobsDone >= 10; } },
    { id: "ref1", icon: "🎁", name: "Referral Star", hint: "1 friend joined", earned: function (c) { return c.refUses >= 1; } },
    { id: "ref5", icon: "🚀", name: "Super Connector", hint: "5 friends joined", earned: function (c) { return c.refUses >= 5; } },
    { id: "plan", icon: "💎", name: "Plan Member", hint: "Join a plan", earned: function (c) { return c.hasPlan; } },
    { id: "mogul", icon: "🏘️", name: "Property Mogul", hint: "Add 2 properties", earned: function (c) { return c.propCount >= 2; } }
  ];
  function renderBadges() {
    var grid = $("badgeGrid"); if (!grid) return;
    var n = 0;
    grid.innerHTML = "";
    BADGES.forEach(function (b) {
      var e = false;
      try { e = b.earned(badgeCtx); } catch (err) {}
      if (e) n++;
      var d = document.createElement("div");
      d.className = "badge" + (e ? "" : " locked");
      d.innerHTML = '<div class="medal">' + b.icon + '</div><div class="bname"></div><div class="bhint"></div>';
      d.querySelector(".bname").textContent = b.name;
      d.querySelector(".bhint").textContent = e ? "Earned!" : b.hint;
      grid.appendChild(d);
    });
    var c = $("badgeCount");
    if (c) c.textContent = n + " / " + BADGES.length;
  }

  /* ---------- Rich request window ---------- */
  var reqModal = $("reqModal");
  var custInfo = { name: "", phone: "", email: "" };
  var reqPhotos = [];      // dataURLs picked in the window
  var rwVideoFiles = [];   // File objects picked in the window (videos)
  var editingReqId = null; // service_requests doc id being edited, or null
  var rwSvc = null, rwFreq = "One-time";

  var SERVICES = [
    { name: "Lawn Care", price: "$45", img: "assets/acard-lawn-care.jpg",
      desc: "Mowing, edging, and cleanup on a schedule you can count on. Through South Florida's year-round growing season.",
      benefits: ["Precision mow at the right height for your grass", "Crisp edging along driveways, walkways & beds", "Full blow-off. No clippings left behind", "One-time cleanups or a set schedule, your call", "A yard that looks sharp every single visit"] },
    { name: "Pressure Washing", price: "$149", img: "assets/acard-pressure-washing.jpg",
      desc: "Driveways, walkways, patios, and exteriors brought back to clean. Years of grime, gone in an afternoon.",
      benefits: ["Driveways, walkways, patios, siding & fences", "Mold, mildew & years of grime gone in an afternoon", "Curb appeal that transforms your home's look", "Safe wash methods for concrete, pavers & stucco", "We walk the results with you before we leave"] },
    { name: "Debris & Junk Removal", price: "$89", img: "assets/acard-junk-removal.jpg",
      desc: "Yard debris, old furniture, and clutter hauled away. You point, we lift, it's gone.",
      benefits: ["Furniture, yard debris, appliances & clutter", "You point, we lift. Zero heavy lifting for you", "Fast pickup scheduling that fits your week", "Hauled away and disposed of responsibly", "Upfront price before anything leaves your property"] },
    { name: "Make-Ready Cleaning", price: "$179", img: "assets/acard-make-ready.jpg",
      desc: "Turnover cleans that get rentals and listings guest-ready. Kitchens, baths, floors, and details.",
      benefits: ["Deep move-in / move-out cleans", "Kitchens, baths, floors & all the details", "Rentals and listings guest-ready, fast", "Checklist clean. Nothing gets missed", "Perfect for landlords, realtors & Airbnb hosts"] },
    { name: "Handyman Services", price: "$65", img: "assets/acard-handyman.jpg",
      desc: "Small repairs and punch-list items done right the first time. One call handles the whole list.",
      benefits: ["Small repairs, installs & punch-list items", "One visit handles your whole list", "Done right the first time. Guaranteed", "Upfront pricing before work starts", "Respectful of your home: tidy work, every time"] }
  ];

  // Build the service cards once.
  (function buildSvcCards() {
    var list = $("rwSvcList");
    if (!list) return;
    list.innerHTML = "";
    SERVICES.forEach(function (s) {
      var b = document.createElement("button");
      b.className = "rw-svc"; b.type = "button";
      b.innerHTML = '<img src="' + s.img + '" alt="' + esc(s.name) + '" loading="lazy">' +
        '<div class="b"><h3>' + esc(s.name) + '</h3>' +
        '<div class="pr">from <strong>' + esc(s.price) + '</strong></div>' +
        '<p>' + esc(s.desc) + '</p></div>';
      b.addEventListener("click", function () { rwSelect(s.name); });
      list.appendChild(b);
    });
  })();

  function rwStep(n) {
    [1, 2, 3].forEach(function (i) {
      var sec = $("rwStep" + i);
      if (sec) sec.classList.toggle("hidden", i !== n);
    });
    $("rwDone").classList.add("hidden");
    document.querySelectorAll("#rwSteps .rw-st").forEach(function (d) {
      var s = parseInt(d.getAttribute("data-s"), 10);
      d.classList.toggle("active", s === n);
      d.classList.toggle("done", s < n);
      d.querySelector(".dot").textContent = s < n ? "✓" : s;
    });
    var body = reqModal.querySelector(".rw-body");
    if (body) body.scrollTop = 0;
  }

  function rwSelect(name) {
    var s = null;
    SERVICES.forEach(function (x) { if (x.name === name) s = x; });
    if (!s) s = SERVICES[0];
    rwSvc = s;
    $("rwImg").src = s.img; $("rwImg").alt = s.name;
    $("rwName").textContent = s.name;
    $("rwPrice").textContent = s.price;
    $("rwBenefits").innerHTML = s.benefits.map(function (b) {
      return '<li><span class="rw-ck">✓</span><span>' + esc(b) + '</span></li>';
    }).join("");
    rwStep(2);
  }

  function openReq() {
    rwSvc = null; rwFreq = "One-time"; editingReqId = null; reqPhotos = [];
    $("rwTitle").textContent = "New request";
    $("rwDetails").value = ""; $("rwPhotos").value = ""; $("rwPreview").innerHTML = "";
    rwVideoFiles = []; $("rwVideos").value = ""; $("rwVideoLink").value = "";
    $("rwVideoList").innerHTML = ""; $("rwVideoMsg").textContent = ""; hide($("rwVideoMsg"));
    hide($("reqError"));
    $("rwSend").textContent = "Send my request";
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (c, i) { c.classList.toggle("active", i === 0); });
    rwStep(1);
    reqModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function openReqEdit(id, d) {
    editingReqId = id; reqPhotos = [];
    rwFreq = d.frequency || "One-time";
    $("rwTitle").textContent = "Edit request";
    $("rwDetails").value = d.message || "";
    $("rwPhotos").value = ""; $("rwPreview").innerHTML = "";
    rwVideoFiles = []; $("rwVideos").value = "";
    $("rwVideoLink").value = d.videoLink || "";
    $("rwVideoList").innerHTML = ""; $("rwVideoMsg").textContent = ""; hide($("rwVideoMsg"));
    if (Array.isArray(d.videos) && d.videos.length) {
      $("rwVideoList").textContent = "🎬 " + d.videos.length + " video" + (d.videos.length === 1 ? "" : "s") + " already on this request.";
    }
    hide($("reqError"));
    $("rwSend").textContent = "Save changes";
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-freq") === rwFreq);
    });
    rwSelect(d.service || "Lawn Care"); // lands on step 2 with details prefilled
    reqModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeReq() {
    reqModal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  $("reqNewBtn").addEventListener("click", openReq);
  $("reqClose").addEventListener("click", closeReq);
  reqModal.addEventListener("click", function (e) { if (e.target === reqModal) closeReq(); });
  document.addEventListener("click", function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-open-req")) openReq();
    var eb = e.target && e.target.closest ? e.target.closest("[data-edit-req]") : null;
    if (eb) {
      var rid = eb.getAttribute("data-edit-req");
      db.collection("service_requests").doc(rid).get().then(function (snap) {
        if (snap.exists) openReqEdit(rid, snap.data());
      });
    }
  });

  // "Add photos / video" panels on request cards: append media to an existing request.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var ab = t.closest("[data-add-media]");
    if (ab) {
      var pid = ab.getAttribute("data-add-media");
      document.querySelectorAll("[data-media-panel]").forEach(function (p) {
        if (p.getAttribute("data-media-panel") === pid) p.classList.toggle("hidden");
        else p.classList.add("hidden");
      });
      return;
    }
    var cb = t.closest("[data-mp-cancel]");
    if (cb) { var cp = cb.closest("[data-media-panel]"); if (cp) cp.classList.add("hidden"); return; }
    var sb = t.closest("[data-mp-save]");
    if (sb) saveReqMedia(sb);
  });

  function saveReqMedia(btn) {
    var user = auth.currentUser; if (!user) return;
    var panel = btn.closest("[data-media-panel]"); if (!panel) return;
    var id = panel.getAttribute("data-media-panel");
    var msg = panel.querySelector("[data-mp-msg]");
    var photoFiles = Array.prototype.slice.call(panel.querySelector("[data-mp-photos]").files || []);
    var videoFiles = Array.prototype.slice.call(panel.querySelector("[data-mp-videos]").files || []);
    var link = panel.querySelector("[data-mp-link]").value.trim();
    if (!photoFiles.length && !videoFiles.length && !link) {
      msg.textContent = "Pick a photo or video first, or paste a video link.";
      return;
    }
    btn.disabled = true;
    msg.textContent = "Uploading…";
    var ref = db.collection("service_requests").doc(id);
    ref.get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var exPhotos = Array.isArray(d.photos) ? d.photos.slice() : [];
      var exVideos = Array.isArray(d.videos) ? d.videos.slice() : [];
      return Promise.all([
        uploadPhotoFiles(photoFiles, "service-request-photos"),
        uploadVideoFiles(videoFiles, "service-request-photos")
      ]).then(function (res) {
        var update = {};
        if (res[0].length) update.photos = exPhotos.concat(res[0]);
        if (res[1].urls.length) update.videos = exVideos.concat(res[1].urls);
        if (link && !d.videoLink) update.videoLink = link;
        var skippedNote = res[1].skipped.length
          ? " Note: " + res[1].skipped.join(", ") + " was over 25 MB and wasn't attached. Paste a link to it instead."
          : "";
        if (!Object.keys(update).length) {
          msg.textContent = "Nothing new to add." + skippedNote;
          btn.disabled = false;
          return null;
        }
        // Same doc.update path the portal's edit-request save uses.
        return ref.update(update).then(function () {
          msg.textContent = "Added to your request. Thank you!" + skippedNote;
          setTimeout(function () { loadRequests(user.uid); }, 1200);
        });
      });
    }).catch(function () {
      msg.textContent = "Couldn't add that. Please try again, or call us at (786) 422-9674.";
      btn.disabled = false;
    });
  }

  $("rwBack2").addEventListener("click", function () { rwStep(1); });
  $("rwBack2b").addEventListener("click", function () { rwStep(1); });
  $("rwBack3").addEventListener("click", function () { rwStep(2); });
  $("rwDoneBtn").addEventListener("click", closeReq);

  $("rwFreq").addEventListener("click", function (e) {
    var c = e.target.closest ? e.target.closest(".rw-chip") : null;
    if (!c) return;
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (x) { x.classList.remove("active"); });
    c.classList.add("active");
    rwFreq = c.getAttribute("data-freq");
  });

  // photo picker in the window
  $("rwPhotoBtn").addEventListener("click", function () { $("rwPhotos").click(); });
  $("rwPhotos").addEventListener("change", function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) {
      if (reqPhotos.length >= 6) return;
      var r = new FileReader();
      r.onload = function () {
        reqPhotos.push(r.result);
        var img = document.createElement("img");
        img.src = r.result; img.alt = "request photo";
        $("rwPreview").appendChild(img);
      };
      r.readAsDataURL(f);
    });
  });

  /* ----- Media upload helpers (shared: request window + request cards) ----- */
  var VIDEO_MAX_BYTES = 25 * 1024 * 1024;
  function fmtMB(b) { return (b / (1024 * 1024)).toFixed(1) + " MB"; }
  function uploadEndpoint() { return (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || ""; }
  function readAsDataURL(f) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.readAsDataURL(f);
    });
  }
  // Photos: same photo-upload pattern the window already uses (dataURLs in, URLs out).
  function uploadPhotoFiles(files, folder) {
    var ep = uploadEndpoint();
    if (!files.length || !ep) return Promise.resolve([]);
    return Promise.all(files.map(readAsDataURL)).then(function (dus) {
      dus = dus.filter(Boolean);
      if (!dus.length) return [];
      return fetch(ep, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "photo-upload", folder: folder, photos: dus }) })
        .then(function (r) { return r.json(); })
        .then(function (out) { return (out && out.urls) || []; })
        .catch(function () { return []; });
    });
  }
  // One video via the generic doc-upload pattern (FileReader -> POST). The saved
  // URL comes back as out.urls[0] (same {ok, urls} shape as photo-upload).
  function uploadOneVideo(f, folder) {
    var ep = uploadEndpoint();
    if (!ep) return Promise.resolve(null);
    return readAsDataURL(f).then(function (dataUrl) {
      if (!dataUrl) return null;
      return fetch(ep, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "doc-upload", folder: folder, name: f.name, mime: f.type, data: dataUrl }) })
        .then(function (r) { return r.json(); })
        .then(function (out) { return (out && out.ok && out.urls && out.urls.length) ? out.urls[0] : null; })
        .catch(function () { return null; });
    });
  }
  // Videos upload ONE BY ONE. Files over 25 MB are skipped (never fatal).
  function uploadVideoFiles(files, folder) {
    var urls = [], skipped = [];
    var chain = Promise.resolve();
    files.forEach(function (f) {
      if (f.size > VIDEO_MAX_BYTES) { skipped.push(f.name); return; }
      chain = chain.then(function () { return uploadOneVideo(f, folder); })
        .then(function (u) { if (u) urls.push(u); });
    });
    return chain.then(function () { return { urls: urls, skipped: skipped }; });
  }

  // video picker in the window
  $("rwVideoBtn").addEventListener("click", function () { $("rwVideos").click(); });
  $("rwVideos").addEventListener("change", function (e) {
    rwVideoFiles = Array.prototype.slice.call(e.target.files || []);
    var list = $("rwVideoList"); list.innerHTML = "";
    var over = 0;
    rwVideoFiles.forEach(function (f) {
      var d = document.createElement("div");
      if (f.size > VIDEO_MAX_BYTES) {
        over++;
        d.textContent = "🎬 " + f.name + " (" + fmtMB(f.size) + ") — too big to attach (25 MB max)";
        d.style.color = "#b3541e"; d.style.fontWeight = "700";
      } else {
        d.textContent = "🎬 " + f.name + " (" + fmtMB(f.size) + ")";
      }
      list.appendChild(d);
    });
    var msg = $("rwVideoMsg");
    if (over) {
      msg.textContent = "That video is over 25 MB, so we can't attach it here. No problem: paste a link to it in the link field below (Google Photos, iCloud, YouTube) and we'll watch it there.";
      show(msg);
    } else { msg.textContent = ""; hide(msg); }
  });

  $("rwToReview").addEventListener("click", function () {
    if (!rwSvc) return;
    var det = $("rwDetails").value.trim() || "-";
    $("rwRevName").textContent = custInfo.name || "you";
    $("rwRevContact").textContent = custInfo.phone || custInfo.email || "";
    $("rwRevBox").innerHTML =
      '<div class="rw-rrow"><span class="k">Service</span><span class="v">' + esc(rwSvc.name) + ' (from ' + esc(rwSvc.price) + ')</span></div>' +
      '<div class="rw-rrow"><span class="k">Frequency</span><span class="v">' + esc(rwFreq) + '</span></div>' +
      '<div class="rw-rrow"><span class="k">Details</span><span class="v">' + esc(det) + '</span></div>' +
      (reqPhotos.length ? '<div class="rw-rrow"><span class="k">Photos</span><span class="v">' + reqPhotos.length + ' attached</span></div>' : '') +
      (rwVideoFiles.filter(function (f) { return f.size <= VIDEO_MAX_BYTES; }).length ? '<div class="rw-rrow"><span class="k">Videos</span><span class="v">' + rwVideoFiles.filter(function (f) { return f.size <= VIDEO_MAX_BYTES; }).length + ' attached</span></div>' : '') +
      ($("rwVideoLink").value.trim() ? '<div class="rw-rrow"><span class="k">Video link</span><span class="v">' + esc($("rwVideoLink").value.trim()) + '</span></div>' : '');
    rwStep(3);
  });

  $("rwSend").addEventListener("click", function () {
    hide($("reqError"));
    var user = auth.currentUser;
    if (!user || !rwSvc) return;
    var btn = $("rwSend");
    var isEdit = !!editingReqId;
    btn.disabled = true; btn.textContent = isEdit ? "Saving..." : "Sending...";

    function save(urls, vres) {
      var payload = {
        service: rwSvc.name, frequency: rwFreq,
        message: $("rwDetails").value.trim()
      };
      if (urls && urls.length) payload.photos = urls;
      if (vres && vres.urls.length) payload.videos = vres.urls;
      var vlink = $("rwVideoLink").value.trim();
      if (vlink) payload.videoLink = vlink;
      if (isEdit) {
        return db.collection("service_requests").doc(editingReqId).update(payload);
      }
      payload.uid = user.uid;
      payload.name = custInfo.name; payload.phone = custInfo.phone; payload.email = custInfo.email;
      payload.status = "new"; payload.source = "account-dashboard";
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("service_requests").add(payload);
    }

    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    var uploadP = (reqPhotos.length && endpoint)
      ? fetch(endpoint, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ type: "photo-upload", folder: "service-request-photos", photos: reqPhotos }) })
        .then(function (r) { return r.json(); }).then(function (out) { return out.urls || []; })
        .catch(function () { return []; })
      : Promise.resolve([]);

    var videoP = uploadVideoFiles(rwVideoFiles, "service-request-photos");
    Promise.all([uploadP, videoP]).then(function (res) {
      return save(res[0], res[1]).then(function () { return res[1]; });
    }).then(function (vres) {
      $("rwStep3").classList.add("hidden");
      $("rwDone").classList.remove("hidden");
      $("rwDoneTitle").textContent = isEdit ? "Changes saved!" : "Request received!";
      $("rwDoneSummary").textContent = isEdit
        ? "Your " + rwSvc.name.toLowerCase() + " request has been updated."
        : "Your " + rwSvc.name.toLowerCase() + " request (" + rwFreq.toLowerCase() + ") is in. We'll be in touch shortly to confirm the details.";
      if (vres && vres.skipped.length) {
        $("rwDoneSummary").textContent += " Note: " + vres.skipped.join(", ") + " was over the 25 MB video limit and wasn't attached. You can add a link to it from your request list anytime.";
      }
      document.querySelectorAll("#rwSteps .rw-st").forEach(function (d) {
        d.classList.remove("active"); d.classList.add("done");
        d.querySelector(".dot").textContent = "✓";
      });
      // Email Edwin instantly via the website lead endpoint (same alerts as the quote form).
      if (!isEdit) {
        try {
          var lep = (window.SITE_CONFIG && window.SITE_CONFIG.leadEndpoint) || "";
          if (lep) {
            fetch(lep, {
              method: "POST", mode: "no-cors",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                name: custInfo.name, phone: custInfo.phone, email: custInfo.email,
                service: "Dashboard request: " + rwSvc.name + " (" + rwFreq + ")",
                message: $("rwDetails").value.trim() +
                  ((vres && vres.urls.length) ? "\nVideos: " + vres.urls.join(", ") : "") +
                  ($("rwVideoLink").value.trim() ? "\nVideo link: " + $("rwVideoLink").value.trim() : ""),
                source: "account-dashboard", uid: user.uid,
                timestamp: new Date().toISOString()
              })
            }).catch(function () {});
          }
        } catch (e) {}
      }
      loadRequests(user.uid);
    }).catch(function (err) {
      var el = $("reqError");
      el.textContent = (err && err.message) || "Couldn't send. Please try again.";
      show(el);
    }).then(function () {
      btn.disabled = false; btn.textContent = isEdit ? "Save changes" : "Send my request";
    });
  });

  // keep customer info fresh for request submissions
})();

// PrimeGuard admin: work orders, quotes, vendors, acquisition managers.
// Access: edblucorp@gmail.com (admin) or users with a staff/{uid} doc.
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  if (!cfg || !cfg.apiKey) return;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var ADMIN_EMAIL = "edblucorp@gmail.com";

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  var me = null, isAdmin = false, isStaff = false, myRole = "acquisition";
  var pendingPhotos = []; // dataURLs selected in the WO form
  var editingId = null; // work order id being edited, or null for create mode

  function setSelect(sel, val) {
    // ensure the value exists as an option (older orders may have custom text)
    var has = Array.prototype.some.call(sel.options, function (o) { return o.value === val; });
    if (!has && val) {
      var o = document.createElement("option");
      o.value = val; o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val || sel.options[0].value;
  }

  function setWoFormCollapsed(c) {
    $("wo-form-card").classList.toggle("hidden", c);
    $("wo-collapse-btn").textContent = c ? "Expand" : "Collapse";
    try { localStorage.setItem("pg_wo_form_collapsed", c ? "1" : ""); } catch (e) {}
  }
  $("wo-collapse-btn").addEventListener("click", function () {
    setWoFormCollapsed(!$("wo-form-card").classList.contains("hidden"));
  });
  try { if (localStorage.getItem("pg_wo_form_collapsed")) setWoFormCollapsed(true); } catch (e) {}

  // ---------- Nav emoji icons (Edwin, Oct 19: he loves the emoji tabs on
  // the vendor portal and wants the same treatment on the admin nav) ----
  (function navEmoji() {
    var EMOJI = {
      home: "\u{1F3E0}", hotleads: "\u{1F525}", work: "\u{1F4BC}",
      quotes: "\u{1F4DD}", vendors: "\u{1F477}", followups: "\u2705",
      customers: "\u{1F465}", contracts: "\u{1F4C4}", calendar: "\u{1F4C5}",
      team: "\u{1F91D}", activity: "\u{1F440}", referrals: "\u{1F381}",
      traffic: "\u{1F4C8}"
    };
    document.querySelectorAll("[data-atab]").forEach(function (b) {
      if (b.dataset.emojiDone) return;
      var ic = EMOJI[b.getAttribute("data-atab")];
      if (!ic) return;
      b.dataset.emojiDone = "1";
      var s = document.createElement("span");
      s.className = "tab-emoji";
      s.setAttribute("aria-hidden", "true");
      s.textContent = ic;
      b.insertBefore(s, b.firstChild);
    });
    // Nav alignment (Edwin, Oct 19): sidebar items with no emoji of their
    // own (the two external links) get an EMPTY slot span, so their labels
    // start at the same x as every emoji item's label. No glyph is added.
    document.querySelectorAll(".pg-nav-item").forEach(function (b) {
      if (b.querySelector(".tab-emoji")) return;
      var s2 = document.createElement("span");
      s2.className = "tab-emoji";
      s2.setAttribute("aria-hidden", "true");
      b.insertBefore(s2, b.firstChild);
    });
  })();

  // ---------- Light / dark theme toggle ----------
  var themeBtn = $("ad-theme");
  function syncThemeBtn() {
    var light = document.documentElement.classList.contains("pg-light");
    if (themeBtn) themeBtn.innerHTML = light ? "&#127769; Dark" : "&#9728; Light";
    var cal = $("cal-frame");
    if (cal && cal.src) {
      cal.src = light ? cal.src.replace("bgcolor=%23141417", "bgcolor=%23ffffff")
                      : cal.src.replace("bgcolor=%23ffffff", "bgcolor=%23141417");
    }
  }
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var light = document.documentElement.classList.toggle("pg-light");
    try { localStorage.setItem("pg_admin_theme", light ? "light" : "dark"); } catch (e) {}
    syncThemeBtn();
  });
  syncThemeBtn();

  // ---------- Left drawer navigation (mirrors the LoraLedger drawer) ----------
  // Drawer items carry data-atab, the same attribute as the top tab bar, so the
  // inline tab script in admin.html wires them to showTab() exactly like any
  // other tab button — one code path per destination. This handler only adds
  // the drawer extras: highlight sync + close on selection.
  var navDrawer = $("pgNavDrawer"), navBackdrop = $("pgNavBackdrop"), navOpen = false;
  function navStoredClosed() {
    try { return localStorage.getItem("pg_admin_nav_closed") !== "0"; } catch (e) { return true; }
  }
  function setNavOpen(open, persist) {
    navOpen = !!open;
    if (navDrawer) navDrawer.classList.toggle("open", navOpen);
    if (navBackdrop) navBackdrop.classList.toggle("open", navOpen);
    if (persist !== false) { try { localStorage.setItem("pg_admin_nav_closed", navOpen ? "0" : "1"); } catch (e) {} }
  }
  function syncNavActive(name) {
    document.querySelectorAll("#pgNavDrawer [data-atab]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-atab") === name);
    });
  }
  if ($("pgNavToggle")) $("pgNavToggle").addEventListener("click", function () { setNavOpen(!navOpen); });
  if ($("pgNavClose")) $("pgNavClose").addEventListener("click", function () { setNavOpen(false); });
  if (navBackdrop) navBackdrop.addEventListener("click", function () { setNavOpen(false); });
  document.querySelectorAll("#pgNavDrawer [data-atab]").forEach(function (b) {
    b.addEventListener("click", function () {
      syncNavActive(b.getAttribute("data-atab"));
      setNavOpen(false);
    });
  });
  // Keep drawer highlights in sync when the top tab bar is used instead.
  document.querySelectorAll("[data-atab]").forEach(function (b) {
    b.addEventListener("click", function () { syncNavActive(b.getAttribute("data-atab")); });
  });
  // External drawer links close the drawer too (they open in a new tab).
  document.querySelectorAll("#pgNavDrawer a.pg-nav-item").forEach(function (a) {
    a.addEventListener("click", function () { setNavOpen(false); });
  });
  syncNavActive("home");

  function resetWoForm() {
    editingId = null;
    $("ad-woform").reset();
    $("wo-preview").innerHTML = ""; pendingPhotos = [];
    $("wo-form-title").textContent = "Create work order";
    $("wo-submit").textContent = "Create work order";
    $("wo-ok").textContent = "Work order created. It is live on vendor dashboards now.";
    hide($("wo-cancel")); hide($("wo-error")); hide($("wo-ok"));
  }

  function enterEditMode(id) {
    db.collection("work_orders").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var w = snap.data();
      editingId = id;
        $("wo-title").value = w.title || "";
      $("wo-kind").value = w.kind || "job";
      setSelect($("wo-category"), w.category || "");
      setSelect($("wo-area"), w.area || "");
      $("wo-pay").value = w.pay || "";
      $("wo-details").value = w.details || "";
      $("wo-assign").value = w.broadcast ? "broadcast" : (w.vendorId || "broadcast");
      $("wo-form-title").textContent = "Edit work order";
      $("wo-submit").textContent = "Save changes";
      $("wo-ok").textContent = "Work order updated.";
      show($("wo-cancel")); hide($("wo-error")); hide($("wo-ok"));
      setWoFormCollapsed(false);
      $("wo-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  $("wo-cancel").addEventListener("click", resetWoForm);

  $("ad-loginform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("ad-login-err"); hide(errEl);
    auth.signInWithEmailAndPassword($("ad-email").value.trim(), $("ad-pass").value)
      .catch(function (err) { errEl.textContent = err.message; show(errEl); });
  });
  $("ad-logout").addEventListener("click", function (e) {
    e.preventDefault();
    endSession().then(function () { auth.signOut(); });
  });

  $("ad-google").addEventListener("click", function () {
    var errEl = $("ad-login-err"); hide(errEl);
    var provider = new firebase.auth.GoogleAuthProvider();
    // Mobile browsers often block popups: fall back to full-page redirect.
    auth.signInWithPopup(provider).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-window-closed")) {
        auth.signInWithRedirect(provider);
      } else {
        errEl.textContent = err.message; show(errEl);
      }
    });
  });

  $("ad-forgot").addEventListener("click", function (e) {
    e.preventDefault();
    var errEl = $("ad-login-err"); hide(errEl); hide($("ad-reset-ok"));
    var email = $("ad-email").value.trim();
    if (!email) { errEl.textContent = "Type your email above first."; show(errEl); return; }
    auth.sendPasswordResetEmail(email).then(function () {
      $("ad-reset-ok").textContent = "Reset link sent to " + email + ".";
      show($("ad-reset-ok"));
    }).catch(function (err) { errEl.textContent = err.message; show(errEl); });
  });

  auth.onAuthStateChanged(function (user) {
    me = user;
    if (!user) { liveOffAll(); show($("ad-loginwrap")); hide($("ad-dash")); document.body.classList.remove("pg-nav-on"); setNavOpen(false, false); return; }
    isAdmin = (user.email === ADMIN_EMAIL);
    var check = isAdmin
      ? Promise.resolve({ ok: true, role: "owner" })
      : db.collection("staff").doc(user.uid).get().then(function (s) {
          if (s.exists) return { ok: true, role: (s.data() && s.data().role) || "acquisition" };
          // Auto-claim an invite sent to this email
          return db.collection("staff_invites").doc(user.email).get().then(function (inv) {
            if (!inv.exists) return { ok: false };
            var invRole = (inv.data() && inv.data().role) || "acquisition";
            return db.collection("staff").doc(user.uid).set({
              email: user.email, role: invRole,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function () {
              return db.collection("staff_invites").doc(user.email).delete();
            }).then(function () { return { ok: true, role: invRole }; });
          });
        });
    check.then(function (res) {
      isStaff = res.ok;
      myRole = res.role || "acquisition";
      if (!res.ok) { show($("ad-loginwrap")); hide($("ad-dash")); document.body.classList.remove("pg-nav-on"); setNavOpen(false, false); $("ad-login-err").textContent = "This account is not staff."; show($("ad-login-err")); auth.signOut(); return; }
      hide($("ad-loginwrap")); show($("ad-dash"));
      document.body.classList.add("pg-nav-on");
      setNavOpen(!navStoredClosed(), false);
      $("ad-who").textContent = user.email + (isAdmin ? " (owner)" : " (" + roleLabel(myRole) + ")");
      if (!(isAdmin || myRole === "admin")) hide($("ad-teamsec"));
      if (!isAdmin) { var nab = $("pg-nav-activity"); if (nab) nab.style.display = "none"; }
      // ownerOnlyTraffic: the Traffic tab is revealed and its data loads
      // ONLY for the owner email. Staff accounts (even role "admin")
      // never see the button and the visits listener never starts.
      var tnb = $("pg-nav-traffic");
      if (isAdmin) { if (tnb) tnb.style.display = ""; startTraffic(); }
      else if (tnb) { tnb.style.display = "none"; }
      loadAll();
      startTracking();
    });
  });

  /* ---------- Live data: Firestore snapshot listeners ----------
     Each main list registers ONE onSnapshot listener (first load
     call); later changes re-render automatically, no page refresh.
     Repeat load calls replay the cached snapshot into the same
     render path, so every existing "reload after save" call site
     keeps working exactly like the old one-time fetches did. */
  var liveSubs = {}, liveCache = {};
  function liveOn(key, query, onData, onErr) {
    if (liveSubs[key]) {
      if (liveCache[key] && onData) onData(liveCache[key]);
      return;
    }
    try {
      liveSubs[key] = query.onSnapshot(function (qs) {
        liveCache[key] = qs;
        if (onData) onData(qs);
      }, function (err) {
        delete liveSubs[key];
        if (onErr) onErr(err);
      });
    } catch (e) { if (onErr) onErr(e); }
  }
  function liveOffAll() {
    Object.keys(liveSubs).forEach(function (k) { try { liveSubs[k](); } catch (e) {} });
    liveSubs = {};
    liveCache = {};
  }

  function loadAll() { loadStats(); loadWorkOrders(); loadHotLeads(); loadQuotes(); loadContracts(); loadVendors(); loadArchivedVendors(); loadTeam(); loadVendorOptions(); loadReferrals(); loadActivity(); loadFollowUps(); loadCustomers(); }

  /* ---------- Staff activity tracking (visible to the owner only) ---------- */
  var mySessionId = null, heartbeatTimer = null, trackingOn = false;

  function startTracking() {
    if (trackingOn || !me) return;
    trackingOn = true;
    mySessionId = db.collection("staff_sessions").doc().id;
    var sref = db.collection("staff_sessions").doc(mySessionId);
    sref.set({
      uid: me.uid, email: me.email, role: myRole,
      loginAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
      endedAt: null
    }).catch(function () {});
    logActivity("Logged in");
    heartbeatTimer = setInterval(function () {
      sref.update({ lastSeenAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
    }, 60000);
  }

  function endSession() {
    if (!mySessionId) return Promise.resolve();
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    var sid = mySessionId; mySessionId = null; trackingOn = false;
    return db.collection("staff_sessions").doc(sid).update({
      endedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  }

  function logActivity(action) {
    if (!me) return;
    db.collection("staff_activity").add({
      uid: me.uid, email: me.email, role: myRole, action: action,
      sessionId: mySessionId || "",
      at: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  }

  function fmtClock(ts) {
    if (!ts || !ts.toDate) return "";
    return ts.toDate().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function fmtDur(ms) {
    var mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return mins + "m";
    return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
  }

  function loadActivity() {
    if (!isAdmin) return;
    var nowD = new Date();
    var dayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();
    liveOn("act-sessions", db.collection("staff_sessions").orderBy("loginAt", "desc").limit(60), function (qs) {
      var byUser = {}, history = [];
      qs.forEach(function (d) {
        var s = d.data();
        var loginMs = s.loginAt && s.loginAt.toDate ? s.loginAt.toDate().getTime() : 0;
        var seenMs = s.lastSeenAt && s.lastSeenAt.toDate ? s.lastSeenAt.toDate().getTime() : loginMs;
        var endMs = s.endedAt && s.endedAt.toDate ? s.endedAt.toDate().getTime() : seenMs;
        var online = !s.endedAt && (Date.now() - seenMs < 3 * 60 * 1000);
        var u = byUser[s.email] || (byUser[s.email] = { email: s.email, role: s.role, todayMs: 0, lastSeen: 0, online: false });
        if (loginMs >= dayStart) u.todayMs += Math.max(0, endMs - loginMs);
        if (seenMs > u.lastSeen) u.lastSeen = seenMs;
        if (online) u.online = true;
        history.push({ s: s, dur: Math.max(0, endMs - loginMs), online: online });
      });
      var sbox = $("ad-act-status");
      var emails = Object.keys(byUser);
      if (!emails.length) { sbox.innerHTML = '<p style="color:var(--faint)">No logins recorded yet. Activity appears here once a team member signs in.</p>'; }
      else {
        sbox.innerHTML = "";
        emails.forEach(function (em) {
          var u = byUser[em];
          var row = document.createElement("div"); row.className = "arow";
          row.innerHTML = '<div class="grow"><strong>' + esc(u.email) + "</strong><small>" + esc(roleLabel(u.role)) +
            " · Last active " + (u.lastSeen ? new Date(u.lastSeen).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never") + "</small></div>" +
            '<span class="pill ' + (u.online ? "p-done" : "p-pend") + '">' + (u.online ? "Online now" : "Offline") + "</span>" +
            '<span class="pill p-acc">Today: ' + fmtDur(u.todayMs) + "</span>";
          sbox.appendChild(row);
        });
      }
      var hbox = $("ad-act-history");
      if (!history.length) { hbox.innerHTML = '<p style="color:var(--faint)">No sessions yet.</p>'; }
      else {
        hbox.innerHTML = "";
        history.slice(0, 20).forEach(function (h) {
          var row = document.createElement("div"); row.className = "arow";
          row.innerHTML = '<div class="grow"><strong>' + esc(h.s.email) + "</strong><small>Logged in " + fmtClock(h.s.loginAt) +
            (h.s.endedAt ? " · logged out " + fmtClock(h.s.endedAt) : (h.online ? " · still active" : " · no logout recorded")) + "</small></div>" +
            '<span class="pill p-open">' + fmtDur(h.dur) + "</span>";
          hbox.appendChild(row);
        });
      }
    }, function () {
      var sb = $("ad-act-status");
      if (sb) sb.innerHTML = '<p style="color:var(--faint)">Activity tracking is built in, but the database rules update has not been applied yet, so no data can be saved or read.</p>';
    });
    liveOn("act-feed", db.collection("staff_activity").orderBy("at", "desc").limit(30), function (qs) {
      var box = $("ad-act-feed");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No activity yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var a = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(a.action) + "</strong><small>" + esc(a.email) + " · " + fmtClock(a.at) + "</small></div>";
        box.appendChild(row);
      });
    }, function () {});
  }

  /* ---------- Shared notes, call log, and follow-ups ---------- */
  var CALL_OUTCOMES = [
    ["no_answer", "No answer"],
    ["left_message", "Left message"],
    ["not_interested", "Not interested"],
    ["interested", "Interested"],
    ["registered", "Registered"]
  ];

  function outcomeLabel(key) {
    for (var i = 0; i < CALL_OUTCOMES.length; i++) if (CALL_OUTCOMES[i][0] === key) return CALL_OUTCOMES[i][1];
    return key || "";
  }
  function tsMs(ts) {
    try { return ts && ts.toDate ? ts.toDate().getTime() : (ts ? new Date(ts).getTime() : 0); } catch (e) { return 0; }
  }
  function localDateKey(d) {
    var m = String(d.getMonth() + 1); if (m.length < 2) m = "0" + m;
    var day = String(d.getDate()); if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function fmtFollowDate(key) {
    if (!key) return "";
    var p = key.split("-");
    if (p.length !== 3) return key;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function noteEntryHtml(n) {
    var title = n.kind === "call" ? "Call · " + outcomeLabel(n.outcome) : "Note";
    var whenMs = tsMs(n.createdAt);
    var when = whenMs ? new Date(whenMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    var follow = "";
    if (n.followUpOn) {
      follow = '<div class="note-follow' + (n.followUpDone ? " done" : "") + '">' +
        (n.followUpDone ? "Follow-up completed" : "Follow-up: " + esc(fmtFollowDate(n.followUpOn))) + "</div>";
    }
    return '<div class="sr-comment"><strong>' + esc(title) + "</strong><span>" +
      esc(n.createdByEmail || "") + (when ? " · " + esc(when) : "") + "</span>" +
      (n.text ? "<p>" + esc(n.text).replace(/\n/g, "<br>") + "</p>" : "") + follow + "</div>";
  }
  function loadItemNotes(entityType, entityId, box) {
    if (!box) return;
    box.innerHTML = '<p class="sr-faint">Loading notes…</p>';
    db.collection("item_notes").where("entityKey", "==", entityType + ":" + entityId).limit(100).get().then(function (qs) {
      var notes = [];
      qs.forEach(function (d) { notes.push(d.data()); });
      notes.sort(function (a, b) { return tsMs(b.createdAt) - tsMs(a.createdAt); });
      box.innerHTML = notes.length ? notes.map(noteEntryHtml).join("") : '<p class="sr-faint">No notes yet.</p>';
    }).catch(function () {
      box.innerHTML = '<p class="sr-faint">Notes could not load yet. The database rules update may still need to be published.</p>';
    });
  }
  function saveItemNote(data) {
    data.entityKey = data.entityType + ":" + data.entityId;
    data.createdByUid = me ? me.uid : "";
    data.createdByEmail = me ? me.email : "";
    data.createdByRole = myRole;
    data.followUpDone = false;
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("item_notes").add(data);
  }

  /* ---------- Tasks page: note follow-ups + standalone tasks, one queue ---------- */
  // Follow-ups still live on item_notes (followUpOn date + followUpDone flag;
  // completion writes completedAt/completedByEmail — see the data-fudone
  // handler below, unchanged). Standalone tasks are their own docs in the
  // `tasks` collection. Both merge here into one date-sorted queue:
  // Overdue, Today, Upcoming, then a Done section. The function keeps its
  // historical name (loadFollowUps) because every note-save flow calls it.
  var tkDateCtx = null; // { source: "note" | "task", id: string } for the date-editor modal

  function tkShiftKey(key, days) {
    if (!key) return key;
    var p = key.split("-");
    if (p.length !== 3) return key;
    return localDateKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + days));
  }
  function tkDueMeta(key, today) {
    if (!key || key === today) return { label: "Today", cls: "p-pend", group: 1 };
    if (key < today) {
      var days = Math.max(1, Math.round((Date.parse(today) - Date.parse(key)) / 86400000));
      return { label: days + "d overdue", cls: "p-rev", group: 0 };
    }
    return { label: fmtFollowDate(key), cls: "p-acc", group: 2 };
  }
  function tkWhen(ms) {
    return ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
  }
  function tkNoteDetail(n) {
    var detail = n.kind === "call" ? "Call · " + outcomeLabel(n.outcome) : "Note";
    if (n.text) detail += " · " + n.text;
    return detail;
  }

  var tkEntityFilter = "all"; // Tasks page entity filter (chips)
  var fuSnaps = { open: null, done: null, tasks: null };
  var FU_EMPTY_SNAP = { forEach: function () {}, empty: true, size: 0 };
  function loadFollowUps() {
    var box = $("ad-fu-list");
    if (!box) return;
    // Live listeners on the three sources; the merged queue re-renders
    // whenever any of them changes. The done-notes and tasks reads stay
    // best-effort: an error there just yields an empty set, exactly
    // like the one-time reads did. An error on the open-notes read
    // shows the same message the old load failure did.
    liveOn("fu-done", db.collection("item_notes").where("followUpDone", "==", true).limit(100), function (qs) { fuSnaps.done = qs; renderFollowUps(); }, function () { fuSnaps.done = FU_EMPTY_SNAP; renderFollowUps(); });
    liveOn("fu-tasks", db.collection("tasks").limit(200), function (qs) { fuSnaps.tasks = qs; renderFollowUps(); }, function () { fuSnaps.tasks = FU_EMPTY_SNAP; renderFollowUps(); });
    liveOn("fu-open", db.collection("item_notes").where("followUpDone", "==", false).limit(200), function (qs) { fuSnaps.open = qs; renderFollowUps(); }, function () { box.innerHTML = '<p style="color:var(--faint)">Tasks could not load yet. The database rules update may still need to be published.</p>'; });
    renderFollowUps();
    function renderFollowUps() {
      if (!fuSnaps.open || !fuSnaps.done || !fuSnaps.tasks) return;
      var today = localDateKey(new Date());
      var statsBox = $("ad-task-stats");
      var res = [fuSnaps.open, fuSnaps.done, fuSnaps.tasks];
      var open = [], done = [];
      res[0].forEach(function (d) {
        var n = d.data();
        if (!n.followUpOn) return;
        open.push({ src: "note", id: d.id, due: n.followUpOn, text: tkNoteDetail(n),
          entityType: n.entityType, entityId: n.entityId, entityLabel: n.entityLabel || "Item",
          by: n.createdByEmail || "", createdMs: tsMs(n.createdAt), assignee: "", doneMs: 0 });
      });
      res[1].forEach(function (d) {
        var n = d.data();
        done.push({ src: "note", id: d.id, due: n.followUpOn, text: tkNoteDetail(n),
          entityType: n.entityType, entityId: n.entityId, entityLabel: n.entityLabel || "Item",
          by: n.completedByEmail || n.createdByEmail || "", createdMs: tsMs(n.createdAt), assignee: "",
          doneMs: tsMs(n.completedAt) });
      });
      res[2].forEach(function (d) {
        var t = d.data();
        var item = { src: "task", id: d.id, due: t.dueDate || today, text: t.details || "",
          entityType: t.entityType || null, entityId: t.entityId || null,
          entityLabel: t.title || "Task", by: t.createdBy || "", createdMs: tsMs(t.createdAt),
          assignee: pgTaskAssigneeLabel(t), dueTime: t.dueTime || "", doneMs: tsMs(t.doneAt) };
        if (t.done) done.push(item); else open.push(item);
      });
      open.sort(function (a, b) {
        if (a.due !== b.due) return a.due < b.due ? -1 : 1;
        return a.createdMs - b.createdMs;
      });
      done.sort(function (a, b) { return b.doneMs - a.doneMs; });
      // Header stats + drawer badge (open overdue + due today).
      var nOver = 0, nToday = 0, nUp = 0;
      open.forEach(function (it) {
        var g = tkDueMeta(it.due, today).group;
        if (g === 0) nOver++; else if (g === 1) nToday++; else nUp++;
      });
      var weekAgo = Date.now() - 7 * 86400000;
      var nWeek = done.filter(function (it) { return it.doneMs && it.doneMs >= weekAgo; }).length;
      var mb = $("pg-nav-b-followups"); if (mb) mb.textContent = nOver + nToday;
      if (statsBox) {
        statsBox.innerHTML = '<section class="astats">' +
          '<div class="astat"><div class="l">Overdue</div><div class="v">' + nOver + "</div></div>" +
          '<div class="astat"><div class="l">Due today</div><div class="v">' + nToday + "</div></div>" +
          '<div class="astat"><div class="l">Upcoming</div><div class="v">' + nUp + "</div></div>" +
          '<div class="astat"><div class="l">Done this week</div><div class="v">' + nWeek + "</div></div></section>";
      }
      if (!open.length && !done.length) {
        box.innerHTML = '<p style="color:var(--faint)">No tasks yet. Add a follow-up date to any note or call, or create a standalone task with the New task button.</p>';
        return;
      }
      var tkTypes = [["all", "All"], ["hot_lead", "Hot leads"], ["work_order", "Work orders"], ["customer", "Customers"], ["customer_quote", "Quotes"], ["vendor", "Vendors"], ["", "Unlinked"]];
      var tkCounts = {};
      open.concat(done).forEach(function (it) { var k = it.entityType || ""; tkCounts[k] = (tkCounts[k] || 0) + 1; });
      var tkAllCount = open.length + done.length;
      if (tkEntityFilter !== "all") {
        var tkFk = tkEntityFilter;
        open = open.filter(function (it) { return (it.entityType || "") === tkFk; });
        done = done.filter(function (it) { return (it.entityType || "") === tkFk; });
      }
      box.innerHTML = "";
      var tkChips = document.createElement("div");
      tkChips.className = "tk-filters";
      tkChips.innerHTML = tkTypes.map(function (tp) {
        var n = tp[0] === "all" ? tkAllCount : (tkCounts[tp[0]] || 0);
        return '<button type="button" class="tk-chip' + (tkEntityFilter === tp[0] ? " on" : "") + '" data-tkfilter="' + tp[0] + '">' + tp[1] + " (" + n + ")</button>";
      }).join("");
      box.appendChild(tkChips);
      if (!open.length) {
        var tkNp = document.createElement("p");
        tkNp.style.color = "var(--faint)";
        tkNp.textContent = (!done.length && tkEntityFilter !== "all") ? "No tasks match this filter." : "Nothing open. Everything is done, nice work.";
        box.appendChild(tkNp);
      }
      [[0, "Overdue", "overdue"], [1, "Today", ""], [2, "Upcoming", ""]].forEach(function (g) {
        var items = open.filter(function (it) { return tkDueMeta(it.due, today).group === g[0]; });
        if (!items.length) return;
        var h = document.createElement("div");
        h.className = "tk-group-h" + (g[2] ? " " + g[2] : "");
        h.textContent = g[1];
        box.appendChild(h);
        items.forEach(function (it) { box.appendChild(tkRow(it, today, false)); });
      });
      if (done.length) {
        var dh = document.createElement("div");
        dh.className = "tk-group-h";
        dh.textContent = "Done";
        box.appendChild(dh);
        done.slice(0, 20).forEach(function (it) { box.appendChild(tkRow(it, today, true)); });
      }
    }
  }

  function fmtTaskTime(v) {
    var m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    var hh = parseInt(m[1], 10), mm = m[2];
    var ap = hh >= 12 ? "PM" : "AM";
    var h12 = hh % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + mm + " " + ap;
  }
  function tkRailHtml(key, doneMs) {
    var dt = null;
    if (key) { var p = String(key).split("-"); if (p.length === 3) dt = new Date(+p[0], +p[1] - 1, +p[2]); }
    if (!dt && doneMs) dt = new Date(doneMs);
    if (!dt || isNaN(dt.getTime())) return '<div class="tk-rail"><div class="tk-dow">DATE</div><div class="tk-day">·</div><div class="tk-mon"></div></div>';
    var dow = dt.toLocaleDateString([], { weekday: "short" }).toUpperCase();
    var mon = dt.toLocaleDateString([], { month: "short" });
    return '<div class="tk-rail"><div class="tk-dow">' + dow + '</div><div class="tk-day">' + dt.getDate() + '</div><div class="tk-mon">' + mon + "</div></div>";
  }
  function tkRow(it, today, isDone) {
    var meta = tkDueMeta(it.due, today);
    var sub = [];
    if (it.text) sub.push(esc(it.text));
    if (it.assignee) sub.push("Assigned: " + esc(it.assignee));
    if (isDone) {
      sub.push("Done" + (it.doneMs ? " " + esc(tkWhen(it.doneMs)) : "") + (it.by ? " · by " + esc(it.by) : ""));
    } else if (it.by) {
      sub.push("Set by " + esc(it.by) + (it.createdMs ? " · " + esc(tkWhen(it.createdMs)) : ""));
    }
    var main = '<div class="grow"><strong>' + esc(it.entityLabel) + "</strong>" +
      (sub.length ? "<small>" + sub.join("<br>") + "</small>" : "") + "</div>";
    var links = [];
    if (!isDone) {
      var whenCls = meta.group === 0 ? "tk-over" : (meta.group === 1 ? "tk-today" : "tk-future");
      links.push('<span class="tk-when ' + whenCls + '">' + esc(meta.label + (it.dueTime ? " · " + fmtTaskTime(it.dueTime) : "")) + "</span>");
    }
    if (it.entityType && it.entityId) {
      links.push('<button class="mini tk-link" data-fuopen="' + esc(it.entityType) + "|" + esc(it.entityId) + '">Open</button>');
    }
    if (isDone) {
      links.push(it.src === "note"
        ? '<button class="mini tk-link" data-fuundo="' + it.id + '">Undo</button>'
        : '<button class="mini tk-link" data-taskundo="' + it.id + '">Undo</button>');
    } else if (it.src === "note") {
      links.push('<button class="mini tk-link" data-fudone="' + it.id + '">✓ Mark done</button>');
      links.push('<button class="mini tk-link" data-fusnooze="' + it.id + '">Snooze +1d</button>');
      links.push('<button class="mini tk-link" data-fueditdate="' + it.id + "|" + esc(it.due) + '">Edit date</button>');
    } else {
      links.push('<button class="mini tk-link" data-taskdone="' + it.id + '">✓ Mark done</button>');
      links.push('<button class="mini tk-link" data-tasksnooze="' + it.id + '">Snooze +1d</button>');
      links.push('<button class="mini tk-link" data-taskeditdate="' + it.id + "|" + esc(it.due) + '">Edit date</button>');
    }
    var row = document.createElement("div");
    row.className = "arow tk-row";
    row.innerHTML = tkRailHtml(it.due, it.doneMs) +
      '<div class="tk-main">' + main +
      '<div class="tk-links">' + links.join('<span class="tk-sep">·</span>') + "</div></div>";
    return row;
  }

  /* ----- Task assignment: pick a person, never type an email ----- */
  // Friendly display names for the people who can hold a task. Staff docs
  // carry only email + role, so known principals are named here; anyone
  // else falls back to a prettified email local part.
  function pgStaffName(email) {
    var e = String(email || "").toLowerCase();
    if (!e) return "";
    if (e === ADMIN_EMAIL.toLowerCase()) return "Edwin Lora";
    if (e === "primeguardllc.office@pgpbiz.com") return "Natasha Rivero";
    var local = e.split("@")[0].replace(/[._-]+/g, " ").trim();
    return local ? local.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : e;
  }
  function pgTaskAssigneeLabel(t) {
    if (!t) return "";
    return t.assigneeName || (t.assigneeEmail ? pgStaffName(t.assigneeEmail) : "");
  }
  // Fill the task form's Assign-to select: "Me" first (a reminder for the
  // signed-in user), then every registered staff member, then the owner.
  function pgFillAssigneeSelect(sel, prefillEmail) {
    if (!sel) return;
    var myEmail = me ? me.email : "";
    var wanted = (prefillEmail || "").trim();
    var chosen = wanted || myEmail;
    var seen = {};
    var opts = [];
    function addOpt(email, name, label) {
      var key = String(email || "").toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      opts.push({ email: email, name: name, label: label });
    }
    addOpt(myEmail, pgStaffName(myEmail), "Me (reminder for myself)");
    addOpt(ADMIN_EMAIL, "Edwin Lora", "Edwin Lora · Owner");
    function render() {
      if (wanted && !seen[wanted.toLowerCase()]) {
        opts.push({ email: wanted, name: pgStaffName(wanted), label: pgStaffName(wanted) + " (" + wanted + ")" });
      }
      sel.innerHTML = opts.map(function (o) {
        return '<option value="' + esc(o.email) + '" data-name="' + esc(o.name) + '"' +
          (o.email.toLowerCase() === chosen.toLowerCase() ? " selected" : "") + ">" + esc(o.label) + "</option>";
      }).join("");
    }
    render();
    db.collection("staff").get().then(function (qs) {
      qs.forEach(function (d) {
        var s = d.data() || {};
        if (!s.email) return;
        addOpt(s.email, pgStaffName(s.email), pgStaffName(s.email) + " · " + roleLabel(s.role));
      });
      render();
    }).catch(function () {});
  }

  /* ----- New standalone task (optionally linked to an entity) ----- */
  function openTaskForm(prefill) {
    prefill = prefill || {};
    var etOpts = [["", "No link"], ["vendor", "Vendor"], ["work_order", "Work order"], ["hot_lead", "Hot lead"], ["customer", "Customer"]]
      .map(function (o) {
        return '<option value="' + o[0] + '"' + ((prefill.entityType || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
    $("taskFormBody").innerHTML = '<h3 id="taskFormTitle">New task</h3>' +
      '<form id="taskForm" class="aform" style="margin-top:10px">' +
      '<label>Title<input type="text" id="tk-f-title" required placeholder="Call the customer about the annual plan"></label>' +
      '<label>Details<textarea id="tk-f-details" rows="3" placeholder="Anything the person doing this needs to know…"></textarea></label>' +
      '<div class="row2"><label>Due date<input type="date" id="tk-f-due" value="' + esc(prefill.dueDate || localDateKey(new Date())) + '"></label>' +
      '<label>Due time (optional)<input type="time" id="tk-f-time" value="' + esc(prefill.dueTime || "") + '"></label></div>' +
      '<div class="row2"><label>Assign to<select id="tk-f-assignee"><option value="">Loading team…</option></select></label>' +
      '<label>&nbsp;<span style="display:block;padding:11px 0;color:var(--muted);font-size:.85rem">Time is optional: date alone is fine.</span></label></div>' +
      '<div class="row2"><label>Linked to<select id="tk-f-etype">' + etOpts + "</select></label>" +
      '<label>Linked record name<input type="text" id="tk-f-ename" placeholder="Customer, vendor, or job name" value="' + esc(prefill.entityName || "") + '"></label></div>' +
      '<input type="hidden" id="tk-f-eid" value="' + esc(prefill.entityId || "") + '">' +
      '<p class="aerr hidden" id="tk-f-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="tk-f-save">Create task</button></div>' +
      "</form>";
    $("taskFormModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    pgFillAssigneeSelect($("tk-f-assignee"), prefill.assigneeEmail || "");
    $("taskForm").addEventListener("submit", saveTaskForm);
    var tt = $("tk-f-title");
    if (tt) tt.focus();
  }
  function closeTaskForm() {
    $("taskFormModal").classList.add("hidden");
    if ($("custModal").classList.contains("hidden") && $("hlNoteModal").classList.contains("hidden")) {
      document.body.style.overflow = "";
    }
  }
  function saveTaskForm(e) {
    e.preventDefault();
    var err = $("tk-f-err"); err.classList.add("hidden");
    var title = $("tk-f-title").value.trim();
    if (!title) { err.textContent = "Title is required."; err.classList.remove("hidden"); return; }
    var eid = $("tk-f-eid").value.trim() || null;
    var btn = $("tk-f-save"); btn.disabled = true;
    db.collection("tasks").add({
      title: title,
      details: $("tk-f-details").value.trim(),
      dueDate: $("tk-f-due").value || localDateKey(new Date()),
      dueTime: ($("tk-f-time") && $("tk-f-time").value) || "",
      assigneeEmail: $("tk-f-assignee").value.trim(),
      assigneeName: ($("tk-f-assignee").selectedOptions && $("tk-f-assignee").selectedOptions[0] && $("tk-f-assignee").selectedOptions[0].getAttribute("data-name")) || "",
      entityType: eid ? ($("tk-f-etype").value || null) : null,
      entityId: eid,
      entityName: $("tk-f-ename").value.trim(),
      done: false,
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      doneAt: null
    }).then(function () {
      logActivity("Created a task: " + title);
      closeTaskForm();
      loadFollowUps();
    }).catch(function (e2) {
      err.textContent = "Could not save: " + (e2.message || e2);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }
  var tkAddBtn = $("tk-add");
  if (tkAddBtn) tkAddBtn.addEventListener("click", function () { openTaskForm(null); });

  /* ----- Shared due-date editor (note follow-ups + standalone tasks) ----- */
  function openTaskDateModal(source, id, key) {
    tkDateCtx = { source: source, id: id };
    $("taskDateBody").innerHTML = '<h3 id="taskDateTitle">Edit due date</h3>' +
      '<form id="taskDateForm" class="aform" style="margin-top:10px">' +
      '<label>Due date<input type="date" id="tk-d-date" value="' + esc(key || "") + '"></label>' +
      '<p class="aerr hidden" id="tk-d-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="tk-d-save">Save date</button></div>' +
      "</form>";
    $("taskDateModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("taskDateForm").addEventListener("submit", saveTaskDate);
  }
  function closeTaskDateModal() {
    $("taskDateModal").classList.add("hidden");
    document.body.style.overflow = "";
    tkDateCtx = null;
  }
  function saveTaskDate(e) {
    e.preventDefault();
    if (!tkDateCtx) return;
    var err = $("tk-d-err"); err.classList.add("hidden");
    var key = $("tk-d-date").value;
    if (!key) { err.textContent = "Pick a date."; err.classList.remove("hidden"); return; }
    var ctx = tkDateCtx;
    var upd = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    var ref;
    if (ctx.source === "note") { upd.followUpOn = key; ref = db.collection("item_notes").doc(ctx.id); }
    else { upd.dueDate = key; ref = db.collection("tasks").doc(ctx.id); }
    var btn = $("tk-d-save"); btn.disabled = true;
    ref.update(upd).then(function () {
      logActivity("Changed a task due date");
      closeTaskDateModal();
      loadFollowUps();
    }).catch(function (e2) {
      err.textContent = "Could not save: " + (e2.message || e2);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }

  /* ---------- Hot leads pipeline + notification bell ---------- */
  // Customer conversations that got hot (asking prices, ready to move),
  // worked by the whole acquisition team. Notes reuse the exact item_notes
  // plumbing (loadItemNotes/saveItemNote) with entityType "hot_lead", in a
  // modal shell that mirrors the vendor Calls & notes card, same as the
  // vendor and work-order shells do.
  var HL_STAGES = [
    ["new", "New", "p-pend"],
    ["contacted", "Contacted", "p-acc"],
    ["quoted", "Quoted", "p-rev"],
    ["booked", "Booked", "p-done"],
    ["done", "Done", "p-done"],
    ["cold", "Cold", "p-cold"]
  ];
  var HL_SOURCES = ["Marketplace", "Instagram", "Website", "Referral", "Phone", "Other"];
  // Temperature: how hot the lead is, independent of pipeline stage.
  // [value, label, pill class], mirroring HL_STAGES. A lead with a
  // missing/invalid temperature is treated as "hot" everywhere.
  var HL_TEMPS = [
    ["hot", "Hot", "p-hot"],
    ["warm", "Warm", "p-warm"],
    ["cold", "Cold", "p-cold"]
  ];
  var hlTempFilter = "all"; // active temperature filter chip: all|hot|warm|cold
  var hlStageFilter = "all"; // active stage filter chip: all|new|contacted|quoted|booked|done|cold
  var hlLeads = []; // cached { id, d } rows from the last loadHotLeads()
  var woFilter = "active"; // Board opens on Active so Done jobs file away (Edwin, Oct 18); All/Done chips still show them
  var woOrders = []; // cached { id, d } rows from the last loadWorkOrders()
  var woOpenId = null; // work order id whose card is expanded inline (Open/Close toggle)

  /* ================= Home dashboard (v62) =================
     Edwin's approved v4: goal hero, leads-by-stage donut, money
     bars, and a "needs you now" queue, all from live collections.
     Read-only: renders from the cached loaders plus three small
     count queries (vendor quotes pending, open tasks, vendors). */
  var homeExtraAt = 0, homeExtra = { quotesPending: null, tasksDue: null, vendApproved: null, vendTotal: null, openTasks: null, vendorRows: null };
  function homeParseDay(key) {
    if (!key) return null;
    var p = String(key).slice(0, 10).split("-");
    if (p.length !== 3) return null;
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function homeDayLabel(key, todayKey) {
    var dt = homeParseDay(key); if (!dt) return key || "";
    var base = dt.toLocaleDateString([], { weekday: "short" }) + " " + dt.toLocaleDateString([], { month: "short" }) + " " + dt.getDate();
    return key === todayKey ? "Today" : base;
  }
  function homeBindRows(scope) {
    if (!scope) return;
    scope.querySelectorAll(".home-row[data-atab], .home-day[data-atab]").forEach(function (b) {
      if (b.dataset.bound) return; b.dataset.bound = "1";
      b.addEventListener("click", function () {
        var nav = document.querySelector('#pgNavDrawer [data-atab="' + b.getAttribute("data-atab") + '"]');
        if (nav) nav.click();
      });
    });
  }
  function homeRowBtn(tab, nHtml, title, sub) {
    return '<button class="home-row" type="button" data-atab="' + tab + '">' + (nHtml || "") +
      '<span class="who"><span class="t">' + title + '</span>' + (sub ? '<br><span class="s">' + sub + "</span>" : "") + '</span><span class="go">&#8250;</span></button>';
  }
  function homeStageCounts() {
    var c = { new: 0, contacted: 0, quoted: 0, rest: 0, total: 0, unseen: 0 };
    (hlLeads || []).forEach(function (r) {
      var d = r.d || {};
      if (d.convertedWorkOrderId || d.customerId) return;
      c.total++;
      if (d.seen === false) c.unseen++;
      var st = hlStageValue(d);
      if (st === "new") c.new++; else if (st === "contacted") c.contacted++;
      else if (st === "quoted") c.quoted++; else c.rest++;
    });
    return c;
  }
  function homeDonutSvg(c) {
    var segs = [[c.new, "#0e7c86"], [c.contacted, "#d9ab2b"], [c.quoted, "#e8cf8f"], [c.rest, "#0b3b42"]];
    var total = Math.max(1, c.total), r = 52, circ = 2 * Math.PI * r, off = 0, out = "";
    segs.forEach(function (sg) {
      if (!sg[0]) return;
      var frac = sg[0] / total;
      out += '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + sg[1] + '" stroke-width="17" stroke-dasharray="' + Math.max(0, frac * circ - 3) + " " + circ + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>';
      off += frac * circ;
    });
    if (!c.total) out = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="#e9e4d6" stroke-width="17"/>';
    return '<svg width="132" height="132" viewBox="0 0 140 140">' + out +
      '<text x="70" y="67" text-anchor="middle" font-family="Sora" font-weight="800" font-size="21" fill="#101c26">' + c.total + '</text>' +
      '<text x="70" y="86" text-anchor="middle" font-size="10" fill="#7a7668">active leads</text></svg>';
  }
  function homeBar(label, valText, pct, color) {
    return '<div class="home-bar-row"><span>' + label + '</span><strong>' + valText + '</strong></div>' +
      '<div class="home-bar"><i style="width:' + Math.max(1, Math.min(100, pct)) + '%;background:' + color + '"></i></div>';
  }
  // Safety wrapper (Oct 18 freeze lesson): Home renders inside the other
  // tabs' renderers; a Home bug must NEVER take the whole admin down.
  function renderHomeDash() {
    try { renderHomeDashReal(); } catch (e) { if (window.console) console.warn("Home dash skipped:", e); }
  }
  function renderHomeDashReal() {
    var sub = $("home-goal-sub"); if (!sub) return;
    var c = homeStageCounts();
    var signed = (custRows || []).filter(function (r) { return (r.d || {}).annualContract === "signed"; }).length;
    var review = (woOrders || []).filter(function (r) { return (r.d || {}).status === "review"; });
    var done = (woOrders || []).filter(function (r) { return (r.d || {}).status === "done"; }).length;
    var pct = Math.round(signed / 67 * 1000) / 10;
    sub.textContent = signed + (signed === 1 ? " annual customer" : " annual customers") + " signed · " + done + (done === 1 ? " job" : " jobs") + " completed · " + c.total + " active leads";
    if ($("home-goal-bar")) $("home-goal-bar").style.width = Math.max(1, pct) + "%";
    if ($("home-goal-pct")) $("home-goal-pct").textContent = pct + "% there, at $150/mo per annual customer, " + signed + " of about 67 needed for $10K/mo";
    if ($("home-donut")) $("home-donut").innerHTML = homeDonutSvg(c);
    if ($("home-legend")) $("home-legend").innerHTML =
      '<div class="home-legend"><span><span class="home-dot" style="background:#0e7c86"></span>New</span><strong>' + c.new + '</strong></div>' +
      '<div class="home-legend"><span><span class="home-dot" style="background:#d9ab2b"></span>Contacted</span><strong>' + c.contacted + '</strong></div>' +
      '<div class="home-legend"><span><span class="home-dot" style="background:#e8cf8f"></span>Quoted</span><strong>' + c.quoted + '</strong></div>' +
      '<div class="home-legend"><span><span class="home-dot" style="background:#0b3b42"></span>Signed / other</span><strong>' + c.rest + '</strong></div>';
    var bars = homeBar("Annual customers", signed + " of ~67", pct, "linear-gradient(90deg,#ffd968,#d9ab2b)");
    bars += homeBar("Jobs completed", String(done), done ? Math.min(100, done * 10) : 1, "linear-gradient(90deg,#0e7c86,#0b5560)");
    if (homeExtra.vendApproved != null) bars += homeBar("Crew approved", homeExtra.vendApproved + " of " + homeExtra.vendTotal + " registered", homeExtra.vendTotal ? homeExtra.vendApproved / homeExtra.vendTotal * 100 : 1, "linear-gradient(90deg,#0e7c86,#0b5560)");
    bars += '<p style="font-size:.78rem;color:#7a7668">Every signed annual moves the gold bar. Projects and one-time jobs speed it up.</p>';
    if ($("home-bars")) $("home-bars").innerHTML = bars;
    var rows = "";
    function needRow(n, color, title, s2, tab) {
      return '<button class="home-row" type="button" data-atab="' + tab + '"><span class="n" style="color:' + color + '">' + n + '</span><span class="who"><span class="t">' + title + '</span><br><span class="s">' + s2 + '</span></span><span class="go">&#8250;</span></button>';
    }
    if (review.length) {
      var r0 = review[0].d || {};
      rows += needRow(review.length, "#c0392b", "Job" + (review.length > 1 ? "s" : "") + " in review" + ((r0.customerName || r0.customer) ? ": " + esc(r0.customerName || r0.customer) : ""), esc(r0.title || "Work order") + " · check the photos, tap Done, then pay the crew", "work");
    }
    if (c.unseen) rows += needRow(c.unseen, "#a87e14", "New hot leads to look at", "Fresh inquiries waiting for a first touch", "hotleads");
    if (homeExtra.quotesPending) rows += needRow(homeExtra.quotesPending, "#a87e14", "Vendor quotes to review", "Build the customer quote so it can go out for signing", "quotes");
    if (homeExtra.tasksDue) rows += needRow(homeExtra.tasksDue, "#0e5560", "Tasks due or overdue", "Yours and the team's open items for today", "followups");
    if (!rows) rows = '<p style="font-size:.9rem;padding:10px 0;color:#7a7668">All caught up. Nothing is waiting on a tap right now.</p>';
    if ($("home-needs")) $("home-needs").innerHTML = rows;

    /* ---- v5 sections ---- */
    var todayKey = localDateKey(new Date());
    // Today: open tasks due today or overdue, review jobs
    var todayHtml = "";
    if (homeExtra.openTasks) {
      var dueToday = homeExtra.openTasks.filter(function (t) { return t.dueDate === todayKey; });
      var overdue = homeExtra.openTasks.filter(function (t) { return t.dueDate && t.dueDate < todayKey; });
      dueToday.slice(0, 3).forEach(function (t) {
        todayHtml += homeRowBtn("followups", '<span class="n" style="color:#a87e14">!</span>', "Task due: " + esc(t.title), t.assigneeName ? "Assigned: " + esc(t.assigneeName) : "");
      });
      if (overdue.length) todayHtml += homeRowBtn("followups", '<span class="n" style="color:#c0392b">' + overdue.length + "</span>", "Overdue task" + (overdue.length > 1 ? "s" : ""), esc(overdue[0].title) + (overdue.length > 1 ? " and " + (overdue.length - 1) + " more" : ""));
      if (!dueToday.length && !overdue.length) todayHtml += '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">No tasks due today. Clean slate.</p>';
    } else {
      todayHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Loading tasks…</p>';
    }
    if (review.length) {
      var rr = review[0].d || {};
      todayHtml += homeRowBtn("work", '<span class="n" style="color:#c0392b">' + review.length + "</span>", "Job in review: " + esc(rr.customerName || rr.customer || rr.title || "Work order"), "Check the photos and tap Done");
    }
    if ($("home-today")) $("home-today").innerHTML = todayHtml;
    var tk = $("home-today-kick");
    if (tk) tk.textContent = "Today · " + new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

    // Week ahead: open tasks + vendor W-9 deadlines in the next 7 days
    var weekHtml = "";
    var winEnd = localDateKey(new Date(Date.now() + 6 * 86400000));
    var dayItems = {};
    function addDay(key, text, tab) { if (!dayItems[key]) dayItems[key] = []; dayItems[key].push({ text: text, tab: tab }); }
    if (homeExtra.openTasks) homeExtra.openTasks.forEach(function (t) {
      if (t.dueDate && t.dueDate >= todayKey && t.dueDate <= winEnd) addDay(t.dueDate, esc(t.title), "followups");
    });
    if (homeExtra.vendorRows) homeExtra.vendorRows.forEach(function (v) {
      var st = String(v.w9Status || "pending");
      if (st === "received" || st === "submitted" || st === "approved") return;
      if (!v.w9Due) return;
      var dk = String(v.w9Due).slice(0, 10);
      if (dk >= todayKey && dk <= winEnd) addDay(dk, "W-9 deadline: " + esc(v.business || v.name || "Vendor"), "vendors");
    });
    var dayKeys = Object.keys(dayItems).sort();
    if (dayKeys.length) {
      weekHtml = dayKeys.map(function (k) {
        return dayItems[k].map(function (it, i) {
          return '<button class="home-day" type="button" data-atab="' + it.tab + '"><span class="dt">' + (i === 0 ? homeDayLabel(k, todayKey) : "") + "</span><span>" + it.text + "</span></button>";
        }).join("");
      }).join("");
    } else if (homeExtra.openTasks) {
      weekHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Nothing dated in the next 7 days.</p>';
    } else {
      weekHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Loading…</p>';
    }
    if ($("home-week")) $("home-week").innerHTML = weekHtml;

    // Crew papers
    var crewHtml = "";
    if (homeExtra.vendorRows) {
      var approved = homeExtra.vendorRows.filter(function (v) { return (v.status || (v.verified ? "approved" : "pending")) === "approved" && !v.archivedAt; });
      approved.sort(function (a, b) {
        function score(v) { var w = ["received", "submitted", "approved"].indexOf(String(v.w9Status || "")) >= 0 ? 0 : 1; var p = v.payoutMethod ? 0 : 1; return w + p; }
        return score(a) - score(b);
      });
      if (!approved.length) crewHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">No approved crew yet.</p>';
      approved.slice(0, 5).forEach(function (v) {
        var w9ok = ["received", "submitted", "approved"].indexOf(String(v.w9Status || "")) >= 0;
        var chips = "";
        if (w9ok && v.payoutMethod) chips = '<span class="home-pill home-pill-green">Ready ✓</span>';
        else {
          if (!w9ok) chips += '<span class="home-pill home-pill-gold">W-9' + (v.w9Due ? " due " + (homeParseDay(v.w9Due) ? homeParseDay(v.w9Due).toLocaleDateString([], { month: "short", day: "numeric" }) : "") : " open") + "</span> ";
          if (!v.payoutMethod) chips += '<span class="home-pill home-pill-gold">Payout not set</span>';
        }
        crewHtml += '<button class="home-row" type="button" data-atab="vendors"><span class="who"><span class="t">' + esc(v.name || "") + (v.business ? " · " + esc(v.business) : "") + '</span><br><span class="s">' + esc((v.services || []).join(", ") || "Crew") + '</span></span><span class="home-amt">' + chips + "</span></button>";
      });
    } else crewHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Loading…</p>';
    if ($("home-crew")) $("home-crew").innerHTML = crewHtml;

    // Money owed: jobs in review carry the crew pay
    var owedHtml = "", owedTotal = 0, owedAny = false;
    review.forEach(function (r) {
      var d = r.d || {};
      var payTxt = String(d.payAgreed || d.pay || "");
      var m = payTxt.replace(",", "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
      var amt = m ? parseFloat(m[1]) : 0;
      if (amt) { owedTotal += amt; owedAny = true; }
      owedHtml += '<button class="home-row" type="button" data-atab="work"><span class="who"><span class="t">' + esc(d.vendorBusiness || d.customerName || d.customer || "Crew") + '</span><br><span class="s">' + esc(d.customerName || d.customer || "") + (d.title ? " · " + esc(d.title) : "") + " · pays when you tap Done</span></span>" + '<span class="home-amt">' + (amt ? "$" + amt : esc(payTxt)) + "</span></button>";
    });
    if (!review.length) owedHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Nothing waiting. Crew payouts appear here the moment a job lands in review.</p>';
    else if (owedAny) owedHtml += '<div class="home-row" style="cursor:default"><span class="who"><span class="t">Total waiting</span></span><span class="home-amt">$' + owedTotal + "</span></div>";
    if ($("home-owed")) $("home-owed").innerHTML = owedHtml;

    // Follow-up radar: leads going cold
    var cold = (hlLeads || []).filter(function (r) {
      var d = r.d || {};
      if (d.convertedWorkOrderId || d.customerId) return false;
      var st = hlStageValue(d);
      if (st !== "new" && st !== "contacted" && st !== "quoted") return false;
      return hlIdleDays(d) >= 3;
    }).sort(function (a, b) { return hlIdleDays(b.d) - hlIdleDays(a.d); });
    var radarHtml = "";
    if (!cold.length) radarHtml = '<p style="font-size:.9rem;padding:8px 0;color:#7a7668">Nobody is going cold. Every open lead was touched in the last 3 days.</p>';
    cold.slice(0, 4).forEach(function (r) {
      var d = r.d || {}, days = hlIdleDays(d);
      radarHtml += '<button class="home-row" type="button" data-atab="hotleads"><span class="who"><span class="t">' + esc(d.name || "Lead") + '</span><br><span class="s">' + esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + (d.source ? " · via " + esc(d.source) : "") + '</span></span><span class="home-amt"><span class="home-pill ' + (days >= 7 ? "home-pill-red" : "home-pill-gold") + '">' + days + " days quiet</span></span></button>";
    });
    if ($("home-radar")) $("home-radar").innerHTML = radarHtml;

    homeBindRows($("atab-home"));
    var homeSec = $("atab-home");
    if (homeSec && !homeSec.dataset.qaBound) {
      homeSec.dataset.qaBound = "1";
      homeSec.querySelectorAll("[data-homeact]").forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.getAttribute("data-homeact");
          var tab = act === "lead" ? "hotleads" : (act === "task" ? "followups" : "work");
          var nav = document.querySelector('#pgNavDrawer [data-atab="' + tab + '"]');
          if (nav) nav.click();
          if (act === "lead") { var lb = $("hl-add"); if (lb) setTimeout(function () { lb.click(); }, 60); }
          if (act === "task") { var tb = $("tk-add"); if (tb) setTimeout(function () { tb.click(); }, 60); }
        });
      });
    }
    if (Date.now() - homeExtraAt > 30000) {
      homeExtraAt = Date.now();
      db.collection("quotes").where("status", "==", "pending").limit(50).get().then(function (qs) { homeExtra.quotesPending = qs.size; renderHomeDash(); }).catch(function () {});
      db.collection("tasks").where("done", "==", false).limit(200).get().then(function (qs) {
        var today = localDateKey(new Date()), n = 0, list = [];
        qs.forEach(function (d) { var t = d.data(); if (t.dueDate && t.dueDate <= today) n++; list.push({ title: t.title || "Task", dueDate: t.dueDate || "", assigneeName: t.assigneeName || "" }); });
        homeExtra.tasksDue = n; homeExtra.openTasks = list; renderHomeDash();
      }).catch(function () {});
      db.collection("item_notes").where("followUpDone", "==", false).limit(200).get().then(function (qs) {
        var extra = [];
        qs.forEach(function (d) { var t = d.data(); if (t.followUpOn) extra.push({ title: (t.entityLabel || "Follow-up") + (t.text ? ": " + String(t.text).slice(0, 60) : ""), dueDate: t.followUpOn, assigneeName: "" }); });
        if (extra.length) {
          homeExtra.openTasks = (homeExtra.openTasks || []).concat(extra);
          var today = localDateKey(new Date());
          homeExtra.tasksDue = homeExtra.openTasks.filter(function (t) { return t.dueDate && t.dueDate <= today; }).length;
          renderHomeDash();
        }
      }).catch(function () {});
      db.collection("vendors").limit(60).get().then(function (qs) {
        var ap = 0, rows = [];
        qs.forEach(function (d) { var v = d.data(); rows.push(v); if ((v.status || (v.verified ? "approved" : "pending")) === "approved") ap++; });
        homeExtra.vendApproved = ap; homeExtra.vendTotal = qs.size; homeExtra.vendorRows = rows; renderHomeDash();
      }).catch(function () {});
    }
  }

  var hlNoteId = null, hlNoteData = null, hlOutcome = "";
  var hlEditId = null;
  var hlPendingPhotos = []; // compressed photos picked in the lead form, not yet uploaded
  var hlConvertId = null;
  // Same category options as the work-order form's #wo-category select.
  var HL_WO_CATEGORIES = ["Lawn care", "Tree trimming", "Tree removal", "Stump grinding", "Cleanups", "Planting", "Pressure washing", "Handyman"];

  function hlStageMeta(stage) {
    for (var i = 0; i < HL_STAGES.length; i++) if (HL_STAGES[i][0] === stage) return HL_STAGES[i];
    return HL_STAGES[0];
  }
  function hlTempMeta(temp) {
    for (var i = 0; i < HL_TEMPS.length; i++) if (HL_TEMPS[i][0] === temp) return HL_TEMPS[i];
    return HL_TEMPS[0];
  }
  function leadTemp(d) { return hlTempMeta((d && d.temperature) || "")[0]; }
  function hlTempRank(d) {
    var t = leadTemp(d);
    return t === "hot" ? 0 : (t === "warm" ? 1 : 2);
  }
  function timeAgo(ms) {
    if (!ms) return "";
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    if (d < 30) return d + "d ago";
    return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function updateHotLeadBadges() {
    var unseen = 0;
    hlLeads.forEach(function (it) { if (!it.d.seen) unseen++; });
    var db2 = $("pg-nav-b-hotleads");
    if (db2) { db2.textContent = unseen; db2.style.display = unseen ? "" : "none"; }
    var bb = $("pgBellBadge");
    if (bb) { bb.textContent = unseen; bb.classList.toggle("hidden", !unseen); }
    return unseen;
  }
  function loadHotLeads() {
    var box = $("ad-hl-list");
    if (!box) return;
    liveOn("hl", db.collection("hot_leads").orderBy("createdAt", "desc").limit(100), function (qs) {
      hlLeads = [];
      qs.forEach(function (d) { hlLeads.push({ id: d.id, d: d.data() }); });
      renderHotLeads();
      updateHotLeadBadges();
      renderBellPanel();
    }, function () {
      box.innerHTML = '<p style="color:var(--faint)">Hot leads could not load yet. The database rules update may still need to be published.</p>';
    });
  }
  function hlStageValue(d) { return hlStageMeta((d && d.stage) || "new")[0]; }
  function hlIdleMs(d) {
    var touchedMs = tsMs(d && d.updatedAt) || tsMs(d && d.createdAt);
    return touchedMs ? Math.max(0, Date.now() - touchedMs) : 0;
  }
  function hlIdleDays(d) { return Math.floor(hlIdleMs(d) / 86400000); }
  function hlAreaLabel(d) {
    if (!d) return "";
    if (d.area) return d.area;
    if (!d.address) return "";
    var parts = String(d.address).split(",").map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length >= 3) return parts[1];
    if (parts.length === 2) return parts[1].replace(/\s+\b[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?$/, "").trim();
    return "";
  }
  function hlExcerpt(text) {
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > 140 ? clean.slice(0, 137).trim() + "..." : clean;
  }
  function renderHlFilterChips() {
    var wrap = $("ad-hl-filters");
    if (!wrap) return;
    var queueLeads = hlLeads.filter(function (it) { return !it.d.convertedWorkOrderId && !it.d.customerId; });
    var stageCounts = { all: queueLeads.length };
    HL_STAGES.forEach(function (s) { stageCounts[s[0]] = 0; });
    var tempCounts = { all: queueLeads.length, hot: 0, warm: 0, cold: 0 };
    queueLeads.forEach(function (it) {
      stageCounts[hlStageValue(it.d)]++;
      tempCounts[leadTemp(it.d)]++;
    });
    var stageDefs = [["all", "All"]].concat(HL_STAGES);
    var stageHtml = stageDefs.map(function (df) {
      return '<button type="button" class="hl-chip hl-stage-chip' + (hlStageFilter === df[0] ? " active" : "") +
        '" data-hlstagefilter="' + df[0] + '">' + esc(df[1]) + ' <span class="cnt">' + stageCounts[df[0]] + "</span></button>";
    }).join("");
    var tempDefs = [["all", "All"]].concat(HL_TEMPS.map(function (t) { return [t[0], t[1]]; }));
    var tempHtml = tempDefs.map(function (df) {
      return '<button type="button" class="hl-chip' + (hlTempFilter === df[0] ? " active" : "") +
        '" data-hltempfilter="' + df[0] + '">' + df[1] + ' <span class="cnt">' + tempCounts[df[0]] + "</span></button>";
    }).join("");
    wrap.innerHTML = '<div class="hl-filter-row hl-stage-filter-row" aria-label="Filter by stage">' + stageHtml + "</div>" +
      '<div class="hl-filter-row hl-temp-filter-row" aria-label="Filter by temperature">' + tempHtml + "</div>";
  }
  function hlStepperHtml(id, d) {
    var stage = hlStageValue(d);
    var pipeline = HL_STAGES.slice(0, 5);
    var current = -1;
    pipeline.forEach(function (s, i) { if (s[0] === stage) current = i; });
    var parts = [];
    pipeline.forEach(function (s, i) {
      var cls = stage === "cold" ? "" : (i < current ? " done" : (i === current ? " now" : ""));
      parts.push('<button type="button" class="hlq-step' + cls + '" data-hlstep="' + id + '" data-stage="' + s[0] + '" aria-label="Move to ' + esc(s[1]) + '">' + esc(s[1]) + "</button>");
      if (i < pipeline.length - 1) parts.push('<span class="hlq-step-line" aria-hidden="true"></span>');
    });
    if (stage === "cold") {
      parts.push('<span class="hlq-step-line" aria-hidden="true"></span><span class="hlq-step now hlq-cold-now">Cold</span>' +
        '<button type="button" class="hlq-park" data-hlrevive="' + id + '">Revive</button>');
    } else {
      parts.push('<span class="hlq-step-line" aria-hidden="true"></span><button type="button" class="hlq-park" data-hlpark="' + id + '">Park as Cold</button>');
    }
    return '<div class="hlq-stepper" aria-label="Lead stage">' + parts.join("") + "</div>";
  }
  function renderHotLeads() {
    renderHomeDash();
    var box = $("ad-hl-list");
    if (!box) return;
    renderHlFilterChips();
    if (!hlLeads.length) {
      box.innerHTML = '<p style="color:var(--faint)">No hot leads yet. When a customer conversation gets serious, add it here with the Add lead button so the whole team can work it.</p>';
      return;
    }
    var visible = hlLeads.filter(function (it) {
      // Pipeline rule (Edwin, 2026-10-16): a record lives in ONE stage at a
      // time. Once a lead converts to a work order (or is promoted into the
      // CRM) it leaves the Hot Leads queue for good.
      if (it.d.convertedWorkOrderId || it.d.customerId) return false;
      var stageOk = hlStageFilter === "all" || hlStageValue(it.d) === hlStageFilter;
      var tempOk = hlTempFilter === "all" || leadTemp(it.d) === hlTempFilter;
      return stageOk && tempOk;
    });
    visible.sort(function (a, b) {
      var unseenRank = (a.d.seen ? 1 : 0) - (b.d.seen ? 1 : 0);
      if (unseenRank) return unseenRank;
      var tempRank = hlTempRank(a.d) - hlTempRank(b.d);
      if (tempRank) return tempRank;
      var idleRank = hlIdleMs(b.d) - hlIdleMs(a.d);
      if (idleRank) return idleRank;
      return tsMs(b.d.createdAt) - tsMs(a.d.createdAt);
    });
    box.innerHTML = "";
    if (!visible.length) {
      var labelParts = [];
      if (hlStageFilter !== "all") labelParts.push(hlStageMeta(hlStageFilter)[1].toLowerCase());
      if (hlTempFilter !== "all") labelParts.push(hlTempMeta(hlTempFilter)[1].toLowerCase());
      box.innerHTML = '<p style="color:var(--faint)">No ' + esc(labelParts.join(" ")) + ' leads right now.</p>';
      return;
    }
    visible.forEach(function (it) {
      var d = it.d;
      var temp = leadTemp(d);
      var tm = hlTempMeta(temp);
      var idleDays = hlIdleDays(d);
      var idleCls = idleDays >= 7 ? " red" : (idleDays >= 3 ? " amber" : "");
      var serviceLine = [d.service || "", hlAreaLabel(d), d.contact || ""].filter(Boolean).join(" · ");
      var excerpt = hlExcerpt(d.notes);
      var photoCount = Array.isArray(d.photos) ? d.photos.length : 0;
      var claim = pgLeadClaim(d);
      var lockedOther = pgLeadLockedByOther(d);
      var claimChip = claim
        ? '<span class="pill p-acc" title="Claimed' + (pgLeadClaimWhen(claim) ? " since " + esc(pgLeadClaimWhen(claim)) : "") + '">🔒 Working: ' + esc(claim.name) + "</span>"
        : '<span class="pill p-open">Open</span>';
      var row = document.createElement("article");
      row.className = "hlq-card hlq-temp-" + temp;
      row.innerHTML =
        '<div class="hlq-head"><button type="button" class="hlq-name" data-hldetail="' + it.id + '">' +
          (d.seen ? "" : '<span class="hl-dot" title="Unseen"></span>') + esc(d.name || "Lead") + '</button>' +
          '<span class="pill ' + tm[2] + '">' + esc(tm[1]) + "</span>" + claimChip + "</div>" +
        (serviceLine ? '<div class="hlq-service">' + esc(serviceLine) + (photoCount ? ' <span class="hl-photo-badge" title="Photos on this lead">📷 ' + photoCount + "</span>" : "") + "</div>" : "") +
        (excerpt ? '<p class="hlq-notes">' + esc(excerpt) + "</p>" : "") +
        (lockedOther
          ? '<div class="hlq-stepper" aria-label="Lead stage"><span class="hlq-step now">' + esc(hlStageMeta(hlStageValue(d))[1]) + "</span></div>"
          : hlStepperHtml(it.id, d)) +
        '<div class="hlq-actions">' +
          '<button type="button" class="mini hlq-action hlq-action-primary" data-hlnotes="' + it.id + '">Notes</button>' +
          (lockedOther ? "" :
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-taskfor="hot_lead|' + it.id + '">Task</button>' +
          (d.customerId
            ? '<button type="button" class="mini hlq-action hlq-action-ghost" data-hlviewcustomer="' + d.customerId + '">In CRM \u2713</button>'
            : '<button type="button" class="mini hlq-action hlq-action-ghost" data-hlmakecustomer="' + it.id + '">Add to CRM</button>') +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-callead="' + it.id + '">Calendar</button>' +
          (d.convertedWorkOrderId
            ? '<button type="button" class="mini hlq-action hlq-action-ghost" disabled>Converted ✓</button>'
            : '<button type="button" class="mini hlq-action hlq-action-ghost" data-hlconvert="' + it.id + '">Convert</button>')) +
        "</div>" +
        '<div class="hlq-foot"><span class="hlq-idle' + idleCls + '">' + idleDays + 'd since touch</span>' +
          (lockedOther
            ? '<span class="hlq-manage"></span>'
            : '<span class="hlq-manage"><button type="button" class="hlq-manage-btn" data-hledit="' + it.id + '">Edit</button>' +
              (isAdmin ? '<button type="button" class="hlq-manage-btn danger" data-hldel="' + it.id + '">Delete</button>' : "") + '</span>') +
          '<span class="hlq-source">' + esc(d.source || "Other") + "</span></div>";
      box.appendChild(row);
    });
  }
  function hlStageChanged(id, stage) {
    if (!pgLeadGate(hlLeadData(id))) { loadHotLeads(); return; }
    db.collection("hot_leads").doc(id).update({
      stage: stage,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      logActivity("hot_lead_stage");
      // Booked / done leads become CRM customers automatically (once —
      // makeCustomerFromLead no-ops when the lead already has customerId),
      // so the CRM's last-service tracking starts from real pipeline wins.
      if (stage === "booked" || stage === "done") {
        return makeCustomerFromLead(id).catch(function () {}).then(function () { loadHotLeads(); });
      }
      loadHotLeads();
    }).catch(function (e) { alert("Could not move lead: " + (e.message || e)); loadHotLeads(); });
  }

  /* ----- Hot lead claim & lock (v59) ----- */
  // One person works a lead at a time. claimedBy (email), claimedByName
  // and claimedAt (ISO string) live on the hot_leads doc; no claimedBy =
  // unclaimed and open to anyone. While a lead is claimed, only the
  // claimant can work it: stage moves, notes, convert, edit, tasks. The
  // owner (isAdmin) can release anyone's claim from the lead detail, but
  // that is administration, not working the lead.
  function pgLeadClaim(d) {
    if (!d || !d.claimedBy) return null;
    return {
      email: String(d.claimedBy),
      name: d.claimedByName || pgStaffName(d.claimedBy),
      atMs: tsMs(d.claimedAt)
    };
  }
  function pgLeadClaimMine(d) {
    var c = pgLeadClaim(d);
    if (!c || !me) return false;
    return c.email.toLowerCase() === String(me.email || "").toLowerCase();
  }
  function pgLeadLockedByOther(d) {
    var c = pgLeadClaim(d);
    return (c && !pgLeadClaimMine(d)) ? c : null;
  }
  // Central gate for every lead-work handler. True = the signed-in user
  // may work this lead; false = locked by someone else (message shown).
  function pgLeadGate(d) {
    var c = pgLeadLockedByOther(d);
    if (!c) return true;
    alert("This lead is locked by " + c.name + ". Only they can work it. They can release it from the lead, or the owner can release the claim.");
    return false;
  }
  function pgLeadClaimWhen(c) {
    return c && c.atMs ? new Date(c.atMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  }
  function hlClaimCardHtml(id, d) {
    var c = pgLeadClaim(d);
    if (!c) {
      return '<div class="sr-card"><h4>Claim</h4>' +
        '<p class="sr-faint">Nobody is working this lead yet. Claim it to lock it to you: while you hold it, nobody else on the team can change it.</p>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" type="button" data-hlclaim="' + id + '">Work this lead</button></div></div>';
    }
    if (pgLeadClaimMine(d)) {
      return '<div class="sr-card"><h4>Claim</h4>' +
        '<p><strong>You are working this lead</strong>' + (pgLeadClaimWhen(c) ? " since " + esc(pgLeadClaimWhen(c)) : "") + ".</p>" +
        '<div class="sr-actions"><button class="mini" type="button" data-hlrelease="' + id + '">Release lead</button></div></div>';
    }
    var when = pgLeadClaimWhen(c);
    return '<div class="sr-card"><h4>🔒 Locked</h4>' +
      '<p><strong>Locked by ' + esc(c.name) + "</strong>" + (when ? " since " + esc(when) : "") + ". This lead is view-only for you: only " + esc(c.name) + " can work it.</p>" +
      (isAdmin ? '<div class="sr-actions"><button class="mini" type="button" data-hlrelease="' + id + '">Release claim (owner)</button></div>' : "") +
      "</div>";
  }
  function claimHotLead(id) {
    if (!me) return;
    var ref = db.collection("hot_leads").doc(id);
    ref.get().then(function (snap) {
      if (!snap.exists) return;
      var d = snap.data();
      var c = pgLeadClaim(d);
      if (c && !pgLeadClaimMine(d)) {
        alert("This lead was just claimed by " + c.name + ".");
        loadHotLeads();
        if (hlNoteId === id) openHotLeadNotes(id);
        return;
      }
      return ref.update({
        claimedBy: me.email,
        claimedByName: pgStaffName(me.email),
        claimedAt: new Date().toISOString(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        logActivity("Claimed hot lead: " + (d.name || "lead"));
        loadHotLeads();
        if (hlNoteId === id) openHotLeadNotes(id);
      });
    }).catch(function (e) { alert("Could not claim lead: " + (e.message || e)); });
  }
  function releaseHotLead(id) {
    var ref = db.collection("hot_leads").doc(id);
    ref.get().then(function (snap) {
      if (!snap.exists) return;
      var d = snap.data();
      var c = pgLeadClaim(d);
      if (!c) return;
      if (!pgLeadClaimMine(d) && !isAdmin) {
        alert("Only " + c.name + " or the owner can release this claim.");
        return;
      }
      return ref.update({
        claimedBy: firebase.firestore.FieldValue.delete(),
        claimedByName: firebase.firestore.FieldValue.delete(),
        claimedAt: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        logActivity("Released claim on hot lead: " + (d.name || "lead"));
        loadHotLeads();
        if (hlNoteId === id) openHotLeadNotes(id);
      });
    }).catch(function (e) { alert("Could not release claim: " + (e.message || e)); });
  }

  /* ----- Add / edit lead form ----- */
  function openHotLeadForm(id) {
    if (id && !pgLeadGate(hlLeadData(id))) return;
    hlEditId = id || null;
    var d = null;
    if (id) { for (var i = 0; i < hlLeads.length; i++) if (hlLeads[i].id === id) { d = hlLeads[i].d; break; } }
    d = d || {};
    var srcOpts = HL_SOURCES.map(function (s) {
      return '<option value="' + s + '"' + ((d.source || "Marketplace") === s ? " selected" : "") + ">" + s + "</option>";
    }).join("");
    var stOpts = HL_STAGES.map(function (s) {
      return '<option value="' + s[0] + '"' + ((d.stage || "new") === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");
    var tempOpts = HL_TEMPS.map(function (s) {
      return '<option value="' + s[0] + '"' + (leadTemp(d) === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");
    $("hlFormBody").innerHTML = '<h3 id="hlFormTitle">' + (id ? "Edit lead" : "Add lead") + "</h3>" +
      '<form id="hlForm" class="aform" style="margin-top:10px">' +
      '<label>Name<input type="text" id="hl-f-name" required placeholder="Customer name" value="' + esc(d.name || "") + '"></label>' +
      '<label>Contact<input type="text" id="hl-f-contact" placeholder="Phone, Messenger name, or handle" value="' + esc(d.contact || "") + '"></label>' +
      '<div class="row2"><label>Source<select id="hl-f-source">' + srcOpts + "</select></label>" +
      '<label>Stage<select id="hl-f-stage">' + stOpts + "</select></label></div>" +
      '<div class="row2"><label>Temperature<select id="hl-f-temp">' + tempOpts + "</select></label>" +
      '<label>Service<input type="text" id="hl-f-service" placeholder="Lawn care, cleanup…" value="' + esc(d.service || "") + '"></label></div>' +
      '<label>Area<input type="text" id="hl-f-area" placeholder="Kendall, Richmond Heights…" value="' + esc(d.area || "") + '"></label>' +
      '<label>Full street address<input type="text" id="hl-f-address" placeholder="123 Main St, Miami, FL 33101" value="' + esc(d.address || "") + '"></label>' +
      '<label>Notes<textarea id="hl-f-notes" rows="3" placeholder="What they asked, what was quoted, what is next…">' + esc(d.notes || "") + "</textarea></label>" +
      '<label>Media links<textarea id="hl-f-media" rows="2" placeholder="One link per line: property videos, shared photo albums, Drive links the customer sent…">' + esc((Array.isArray(d.mediaLinks) ? d.mediaLinks : []).join("\n")) + "</textarea></label>" +
      '<label>Photos<input type="file" id="hl-f-photos" accept="image/*" multiple></label>' +
      '<div class="athumbs" id="hl-photo-preview"></div>' +
      '<p class="aerr hidden" id="hl-f-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="hl-f-save">' + (id ? "Save changes" : "Add lead") + "</button></div>" +
      "</form>";
    $("hlFormModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("hlForm").addEventListener("submit", saveHotLead);
    // Photo picking mirrors the work-order form exactly: canvas-compress to
    // max 1600px, JPEG 0.82, collect {filename, mimeType, data} for upload.
    hlPendingPhotos = [];
    var hlPrev = $("hl-photo-preview");
    (Array.isArray(d.photos) ? d.photos : []).forEach(function (u) {
      var im = document.createElement("img"); im.src = u; im.className = "hl-thumb-old"; im.alt = "lead photo";
      hlPrev.appendChild(im);
    });
    $("hl-f-photos").addEventListener("change", function (e) {
      hlPendingPhotos = [];
      hlPrev.querySelectorAll(".hl-thumb-new").forEach(function (n) { n.remove(); });
      Array.prototype.forEach.call(e.target.files, function (f) {
        var img = new Image();
        img.onload = function () {
          var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/jpeg", 0.82);
          hlPendingPhotos.push({ filename: f.name, mimeType: "image/jpeg", data: url.split(",")[1] });
          var th = document.createElement("img"); th.src = url; th.className = "hl-thumb-new";
          hlPrev.appendChild(th);
        };
        var fr = new FileReader();
        fr.onload = function () { img.src = fr.result; };
        fr.readAsDataURL(f);
      });
    });
  }
  function closeHotLeadForm() {
    $("hlFormModal").classList.add("hidden");
    document.body.style.overflow = "";
    hlEditId = null;
    hlPendingPhotos = [];
  }
  function saveHotLead(e) {
    e.preventDefault();
    var name = $("hl-f-name").value.trim();
    var err = $("hl-f-err"); err.classList.add("hidden");
    if (!name) { err.textContent = "Name is required."; err.classList.remove("hidden"); return; }
    if (hlEditId && !pgLeadGate(hlLeadData(hlEditId))) { err.textContent = "This lead is locked by another team member."; err.classList.remove("hidden"); return; }
    var mediaLinks = $("hl-f-media").value.split(/\n/).map(function (s) { return s.trim(); })
      .filter(function (s) { return !!s; });
    var fields = {
      name: name,
      contact: $("hl-f-contact").value.trim(),
      source: $("hl-f-source").value,
      service: $("hl-f-service").value.trim(),
      area: $("hl-f-area").value.trim(),
      address: $("hl-f-address").value.trim(),
      stage: $("hl-f-stage").value,
      temperature: $("hl-f-temp").value,
      notes: $("hl-f-notes").value.trim(),
      mediaLinks: mediaLinks,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var existingPhotos = [];
    if (hlEditId) {
      var cur = hlLeadData(hlEditId);
      if (cur && Array.isArray(cur.photos)) existingPhotos = cur.photos.slice();
    }
    var btn = $("hl-f-save"); btn.disabled = true;
    // Same photo store the work-order form uses: the compressed JPEGs are
    // POSTed to SITE_CONFIG.photoEndpoint, which returns hosted URLs that
    // land on the doc as `photos: [url, ...]`.
    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    var uploadP = (hlPendingPhotos.length && endpoint)
      ? fetch(endpoint, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ type: "photo-upload", folder: "work-order-photos", photos: hlPendingPhotos }) })
        .then(function (r) { return r.json(); }).then(function (out) { return out.urls || []; })
      : Promise.resolve([]);
    var p = uploadP.then(function (urls) {
      if (hlEditId) {
        // Keep already-saved photos; append any newly uploaded ones.
        if (urls.length) fields.photos = existingPhotos.concat(urls);
        return db.collection("hot_leads").doc(hlEditId).update(fields).then(function () {
          logActivity("Edited hot lead: " + name);
        });
      }
      fields.photos = urls || [];
      fields.seen = false;
      fields.createdBy = me ? me.email : "";
      fields.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("hot_leads").add(fields).then(function () {
        logActivity("Added hot lead: " + name);
      });
    });
    p.then(function () {
      closeHotLeadForm();
      loadHotLeads();
    }).catch(function (e2) {
      err.textContent = "Could not save: " + (e2.message || e2);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }
  function hlLeadData(id) {
    for (var i = 0; i < hlLeads.length; i++) if (hlLeads[i].id === id) return hlLeads[i].d;
    return null;
  }
  var hlAddBtn = $("hl-add");
  if (hlAddBtn) hlAddBtn.addEventListener("click", function () { openHotLeadForm(null); });

  function deleteHotLead(id) {
    if (!isAdmin) return;
    var name = "this lead";
    for (var i = 0; i < hlLeads.length; i++) if (hlLeads[i].id === id) { name = hlLeads[i].d.name || name; break; }
    if (!confirm("Delete hot lead " + name + "? This cannot be undone.")) return;
    db.collection("hot_leads").doc(id).delete().then(function () {
      logActivity("Deleted hot lead: " + name);
      loadHotLeads();
    }).catch(function (e) { alert("Could not delete lead: " + (e.message || e)); });
  }

  /* ----- Calls & notes for a lead (item_notes, entityType "hot_lead") ----- */
  function openHotLeadNotes(id) {
    db.collection("hot_leads").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var d = snap.data();
      hlNoteId = id; hlNoteData = d; hlOutcome = "";
      var st = hlStageMeta(d.stage || "new");
      var tm = hlTempMeta(leadTemp(d));
      var whenMs = tsMs(d.createdAt);
      var photos = Array.isArray(d.photos) ? d.photos : [];
      var mediaLinks = Array.isArray(d.mediaLinks) ? d.mediaLinks : [];
      var convMs = tsMs(d.convertedAt);
      var lockedOther = pgLeadLockedByOther(d);
      var fullDate = function (ms) { return ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"; };
      var hlToolsEntity = { label: d.name || "Lead", area: d.area || hlAreaLabel(d), address: d.address || "", service: d.service || "" };
      var h = '<h3 id="hlNoteTitle">' + esc(d.name || "Lead") + "</h3>" +
        '<p class="sr-meta"><span class="pill ' + st[2] + '">' + esc(st[1]) + '</span><span class="pill ' + tm[2] + '">' + esc(tm[1]) + '</span><span class="pill p-acc">' + esc(d.source || "Other") + "</span><span>" +
        esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + (d.contact ? " · " + esc(d.contact) : "") +
        (d.address ? " · " + esc(d.address) : "") +
        (whenMs ? " · added " + esc(new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric" })) : "") + "</span></p>" +
        hlClaimCardHtml(id, d) +
        pgJobToolsHtml(hlToolsEntity) +
        (d.notes ? '<div class="sr-card"><h4>Lead notes</h4><p>' + esc(d.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +
        (photos.length ? '<div class="sr-card"><h4>Photos (' + photos.length + ')</h4><div class="sr-photos">' +
          photos.map(function (u) {
            return '<button type="button" class="woq-thumb-btn" data-wophoto="' + esc(woPhotoBigUrl(u)) + '" data-wophotoorig="' + esc(u) + '" aria-label="View photo full size"><img src="' + esc(u) + '" alt="lead photo" loading="lazy"></button>';
          }).join("") + "</div></div>" : "") +
        (mediaLinks.length ? '<div class="sr-card"><h4>Media links (' + mediaLinks.length + ')</h4><p>' +
          mediaLinks.map(function (u) {
            return /^https?:\/\//i.test(u)
              ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + "</a>"
              : esc(u);
          }).join("<br>") + "</p></div>" : "") +
        '<div class="sr-card"><h4>History</h4>' +
        '<p><strong>Added:</strong> ' + esc(fullDate(whenMs)) + (d.createdBy ? " by " + esc(d.createdBy) : "") + '</p>' +
        '<p><strong>Stage:</strong> ' + esc(st[1]) + '</p>' +
        '<p><strong>Temperature:</strong> ' + esc(tm[1]) + '</p>' +
        '<p><strong>Photos:</strong> ' + photos.length + ' · <strong>Media links:</strong> ' + mediaLinks.length + '</p>' +
        (d.convertedWorkOrderId
          ? '<p><strong>Quote request:</strong> converted' + (convMs ? " " + esc(fullDate(convMs)) : "") + '</p>' +
            '<div class="sr-actions"><button class="mini" type="button" data-hlviewwo="' + id + '">Open work order</button></div>'
          : (lockedOther ? "" : '<div class="sr-actions"><button class="mini" type="button" data-hlconvert="' + id + '">Convert to work order</button></div>')) +
        (d.customerId
          ? '<p style="margin-top:8px"><strong>Customer:</strong> CRM record on file</p>' +
            '<div class="sr-actions"><button class="mini" type="button" data-hlviewcustomer="' + esc(d.customerId) + '">Open customer record</button></div>'
          : (lockedOther ? "" : '<div class="sr-actions" style="margin-top:8px"><button class="mini" type="button" data-hlmakecustomer="' + id + '">Make customer</button></div>')) +
        "</div>" +
        (lockedOther
          ? '<div class="sr-card"><h4>Calls & notes</h4>' +
            '<p class="sr-faint">🔒 ' + esc(lockedOther.name) + ' is working this lead. The call history below is view-only.</p>' +
            '<div class="sr-comments" id="hlnNotes" style="margin-top:14px"></div></div>'
          : '<div class="sr-card"><h4>Calls & notes</h4>' +
        '<p class="sr-faint">Log every call and update here. Notes are a permanent team record with your name and the time on them.</p>' +
        '<div class="outcome-grid" id="hlOutcomes">' +
        CALL_OUTCOMES.map(function (o) {
          return '<button type="button" class="outcome-btn" data-hloutcome="' + o[0] + '">' + o[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="note-form"><label>Notes<textarea id="hlnText" rows="3" placeholder="What happened on the call, what they said, what is next…"></textarea></label>' +
        '<label>Follow-up date (optional)<input type="date" id="hlnFollow"></label></div>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="hlnSave" type="button">Save call / note</button></div>' +
        '<p class="aok hidden" id="hlnOk" style="margin-top:10px">Saved.</p>' +
        '<p class="aerr hidden" id="hlnErr" style="margin-top:10px"></p>' +
        '<div class="sr-comments" id="hlnNotes" style="margin-top:14px"></div></div>');
      var box = $("hlNoteBody");
      box.innerHTML = h;
      box.querySelectorAll("[data-hloutcome]").forEach(function (b) {
        b.addEventListener("click", function () {
          hlOutcome = hlOutcome === b.getAttribute("data-hloutcome") ? "" : b.getAttribute("data-hloutcome");
          box.querySelectorAll("[data-hloutcome]").forEach(function (x) {
            x.classList.toggle("active", x.getAttribute("data-hloutcome") === hlOutcome);
          });
        });
      });
      var hlnSaveBtn = $("hlnSave");
      if (hlnSaveBtn) hlnSaveBtn.addEventListener("click", saveHotLeadNote);
      wireJobTools(box, hlToolsEntity, function () { closeHotLeadNotes(); });
      $("hlNoteModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
      loadItemNotes("hot_lead", id, $("hlnNotes"));
    });
  }
  function closeHotLeadNotes() {
    $("hlNoteModal").classList.add("hidden");
    document.body.style.overflow = "";
    hlNoteId = null; hlNoteData = null; hlOutcome = "";
  }
  function saveHotLeadNote() {
    if (!hlNoteId) return;
    if (!pgLeadGate(hlNoteData)) return;
    var text = $("hlnText").value.trim();
    var err = $("hlnErr"); err.classList.add("hidden");
    if (!hlOutcome && !text) { err.textContent = "Pick a call outcome or write a note first."; err.classList.remove("hidden"); return; }
    var btn = $("hlnSave"); btn.disabled = true;
    var label = (hlNoteData && hlNoteData.name) || "Lead";
    saveItemNote({
      entityType: "hot_lead", entityId: hlNoteId, entityLabel: label,
      kind: hlOutcome ? "call" : "note", outcome: hlOutcome, text: text,
      followUpOn: $("hlnFollow").value || null
    }).then(function () {
      logActivity((hlOutcome ? "Logged a call (" + outcomeLabel(hlOutcome) + ") with lead " : "Added a note on lead ") + label);
      $("hlnOk").classList.remove("hidden");
      $("hlnText").value = ""; $("hlnFollow").value = "";
      hlOutcome = "";
      document.querySelectorAll("[data-hloutcome]").forEach(function (x) { x.classList.remove("active"); });
      loadItemNotes("hot_lead", hlNoteId, $("hlnNotes"));
      loadFollowUps();
    }).catch(function (e) {
      err.textContent = "Could not save: " + (e.message || e);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }

  /* ----- Convert a lead into a work order ----- */
  // Creates a work_orders doc with kind "quote_request" through the exact
  // same doc shape the work-order create form saves (see the ad-woform
  // submit handler), carrying the lead's photos (same hosted URL strings),
  // videos (from the lead's mediaLinks), details and contact info.
  // vendorNotifyPending stays false at convert time: notifying vendors is
  // now a separate, explicit step on the work order — staff pick a target
  // and review an exact preview before anything is queued (see woSendHtml
  // / openWoSendPreview below).
  function gotoWorkOrders() {
    var btn = document.querySelector('#pgNavDrawer [data-atab="work"]');
    if (btn) btn.click();
  }
  function openHotLeadConvert(id) {
    var d = hlLeadData(id);
    if (!d || d.convertedWorkOrderId) return;
    if (!pgLeadGate(d)) return;
    hlConvertId = id;
    var links = Array.isArray(d.mediaLinks) ? d.mediaLinks : [];
    var photos = Array.isArray(d.photos) ? d.photos : [];
    var catOpts = HL_WO_CATEGORIES.map(function (c) {
      return '<option value="' + c + '"' + ((d.service || "").toLowerCase() === c.toLowerCase() ? " selected" : "") + ">" + c + "</option>";
    }).join("");
    var det = [];
    if (d.notes) det.push(d.notes);
    if (links.length) det.push("Media links:\n" + links.join("\n"));
    if (d.contact) det.push("Contact: " + d.contact);
    if (d.address) det.push("Address: " + d.address);
    // Same assignment options loadVendorOptions() built for the WO form:
    // "broadcast" plus one option per non-archived vendor (value = vendor id).
    var assignHtml = $("wo-assign") ? $("wo-assign").innerHTML
      : '<option value="broadcast">All vendors (broadcast)</option>';
    $("hlConvertBody").innerHTML = '<h3 id="hlConvertTitle">Convert to work order</h3>' +
      '<p class="sr-faint" style="margin-top:6px">Creates a work order for ' + esc(d.name || "this lead") +
      ' with everything saved on the lead attached: photos, media links, contact info and notes. Vendors are not notified yet: sending it out is a separate step on the work order when you are ready.</p>' +
      '<form id="hlConvertForm" class="aform" style="margin-top:10px">' +
      '<label>Title<input type="text" id="hl-cv-title" required value="' + esc((d.name || "Lead") + " - " + (d.service || "Service")) + '"></label>' +
      '<div class="row2"><label>Category<select id="hl-cv-category">' + catOpts + "</select></label>" +
      '<label>Area<input type="text" id="hl-cv-area" value="' + esc(d.area || "") + '"></label></div>' +
      '<label>Address<input type="text" id="hl-cv-address" value="' + esc(d.address || "") + '"></label>' +
      '<label>Details<textarea id="hl-cv-details" rows="5">' + esc(det.join("\n\n")) + "</textarea></label>" +
      '<div class="row2"><label>Pay (optional)<input type="text" id="hl-cv-pay" placeholder="$280 or per job"></label>' +
      '<label>Send to<select id="hl-cv-assign">' + assignHtml + "</select></label></div>" +
      (photos.length ? '<label>Photos from the lead (' + photos.length + ')</label><div class="athumbs">' +
        photos.map(function (u) { return '<img src="' + esc(u) + '" alt="lead photo">'; }).join("") + "</div>" : "") +
      '<p class="aerr hidden" id="hl-cv-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="hl-cv-save">Create work order</button></div>' +
      "</form>";
    $("hlConvertModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("hlConvertForm").addEventListener("submit", submitHotLeadConvert);
  }
  function closeHotLeadConvert() {
    $("hlConvertModal").classList.add("hidden");
    if ($("hlNoteModal").classList.contains("hidden") && $("hlFormModal").classList.contains("hidden")) {
      document.body.style.overflow = "";
    }
    hlConvertId = null;
  }
  function submitHotLeadConvert(e) {
    e.preventDefault();
    if (!hlConvertId) return;
    var d = hlLeadData(hlConvertId);
    if (!d) return;
    if (!pgLeadGate(d)) return;
    var err = $("hl-cv-err"); err.classList.add("hidden");
    var title = $("hl-cv-title").value.trim();
    if (!title) { err.textContent = "Title is required."; err.classList.remove("hidden"); return; }
    var assignVal = $("hl-cv-assign").value;
    var btn = $("hl-cv-save"); btn.disabled = true; btn.textContent = "Creating...";
    var leadId = hlConvertId, leadName = d.name || "lead";
    // Doc shape mirrors the work-order create form's save() exactly, plus
    // the lead link (sourceLeadId/sourceLeadName), the street address the
    // calendar bridge already reads (w.address), and the notify flag.
    var wo = {
      title: title,
      kind: "quote_request",
      category: $("hl-cv-category").value,
      area: $("hl-cv-area").value.trim(),
      details: $("hl-cv-details").value.trim(),
      pay: $("hl-cv-pay").value.trim(),
      // Conversions start PRIVATE (Edwin, 2026-10-16): no vendor sees a
      // work order until the office sends it (Preview & send stamps
      // broadcast from the chosen target) or posts it as available work.
      broadcast: false,
      vendorId: assignVal === "broadcast" ? null : assignVal,
      vendorBusiness: null,
      status: "open",
      photos: (Array.isArray(d.photos) ? d.photos : []).slice(),
      videos: (Array.isArray(d.mediaLinks) ? d.mediaLinks : []).slice(),
      address: $("hl-cv-address").value.trim(),
      sourceLeadId: leadId,
      sourceLeadName: leadName,
      vendorNotifyPending: false,
      vendorNotifyTarget: assignVal === "broadcast" ? "broadcast" : assignVal,
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (wo.vendorId) {
      var opt = $("hl-cv-assign").selectedOptions[0];
      if (opt) wo.vendorBusiness = opt.textContent.split(" - ")[0];
    }
    geocodeAddress(wo.address).then(function (g) {
      if (g) { wo.propertyLat = g.lat; wo.propertyLng = g.lng; }
      return db.collection("work_orders").add(wo);
    }).then(function (ref) {
      return db.collection("hot_leads").doc(leadId).update({
        stage: "quoted",
        convertedWorkOrderId: ref.id,
        convertedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      logActivity("Converted hot lead " + leadName + " to work order");
      $("hlConvertBody").innerHTML = '<h3>Work order created ✓</h3>' +
        '<p style="margin-top:8px">The work order for ' + esc(leadName) +
        ' is ready with the lead photos and details attached. Vendors have not been notified yet: open the work order and use "Send to vendors" when it is ready to go out. The lead is now at the Quoted stage with the full history kept.</p>' +
        '<div class="sr-actions" style="margin-top:14px">' +
        '<button class="btn btn-gold btn-sm" type="button" id="hl-cv-view">Open work orders</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="hl-cv-done">Done</button></div>';
      $("hl-cv-view").addEventListener("click", function () {
        closeHotLeadConvert(); closeHotLeadNotes(); gotoWorkOrders();
      });
      $("hl-cv-done").addEventListener("click", function () {
        var reopen = leadId;
        closeHotLeadConvert();
        loadHotLeads();
        if (!$("hlNoteModal").classList.contains("hidden")) openHotLeadNotes(reopen);
      });
      loadHotLeads();
      loadWorkOrders();
    }).catch(function (e2) {
      err.textContent = "Could not convert: " + (e2.message || e2);
      err.classList.remove("hidden");
    }).finally(function () {
      var b = $("hl-cv-save");
      if (b) { b.disabled = false; b.textContent = "Create work order"; }
    });
  }

  /* ----- Notification bell ----- */
  function renderBellPanel() {
    var list = $("pgBellList");
    if (!list) return;
    var unseen = hlLeads.filter(function (it) { return !it.d.seen; });
    if (!unseen.length) {
      list.innerHTML = '<p class="pg-bell-empty">No new leads. You are all caught up.</p>';
      return;
    }
    list.innerHTML = "";
    unseen.forEach(function (it) {
      var d = it.d;
      var b = document.createElement("button");
      b.type = "button"; b.className = "pg-bell-item";
      b.setAttribute("data-hlbell", it.id);
      b.innerHTML = "<strong>" + esc(d.name || "Lead") + "</strong><small>" +
        esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + " · " + esc(timeAgo(tsMs(d.createdAt))) + "</small>";
      list.appendChild(b);
    });
  }
  function setBellOpen(open) {
    var p = $("pgBellPanel");
    if (p) p.classList.toggle("hidden", !open);
  }
  function bellIsOpen() {
    var p = $("pgBellPanel");
    return !!(p && !p.classList.contains("hidden"));
  }
  var bellBtn = $("pgBell");
  if (bellBtn) bellBtn.addEventListener("click", function () {
    if (!bellIsOpen()) renderBellPanel();
    setBellOpen(!bellIsOpen());
  });
  var bellAllBtn = $("pgBellAll");
  if (bellAllBtn) bellAllBtn.addEventListener("click", function () { markAllLeadsSeen(); });
  document.addEventListener("click", function (e) {
    if (!bellIsOpen()) return;
    var wrap = document.querySelector(".pg-bell-wrap");
    if (wrap && !wrap.contains(e.target)) setBellOpen(false);
  });
  function markLeadSeen(id) {
    db.collection("hot_leads").doc(id).update({
      seen: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      loadHotLeads();
    }).catch(function () {});
    setBellOpen(false);
    var btn = document.querySelector('#pgNavDrawer [data-atab="hotleads"]');
    if (btn) btn.click();
  }
  function markAllLeadsSeen() {
    var unseen = hlLeads.filter(function (it) { return !it.d.seen; });
    if (!unseen.length) { setBellOpen(false); return; }
    var batch = db.batch();
    unseen.forEach(function (it) {
      batch.update(db.collection("hot_leads").doc(it.id), {
        seen: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    batch.commit().then(function () {
      logActivity("Marked all hot leads seen");
      setBellOpen(false);
      loadHotLeads();
    }).catch(function () {});
  }

  /* ---------- CRM: customers ---------- */
  // One record per real customer, promoted from hot leads (button on the
  // lead, or automatically when a lead is booked/done) or added by hand.
  // lastServiceAt is the field the team works from: it drives the card's
  // big "Last service" line and the days-since chip behind the
  // annual-contract push. Notes reuse the item_notes plumbing with
  // entityType "customer". NOTE: this is the staff CRM collection; the
  // portal's per-user docs live in the same collection keyed by uid and
  // are never listed here (they carry no name/createdBy CRM shape and the
  // list query below only renders docs the CRM created — see leadId /
  // createdBy fields — plus any staff-added records).
  var custRows = []; // cached { id, d } rows from the last loadCustomers()
  var custId = null, custData = null, custOutcome = "";
  var custTlSort = "new", custHistSort = "new", custTaskSort = "due";
  var custTlEvs = null, custHistFound = null;
  var custVisitRows = {}; // "woId:visitIndex" -> { wid, entry } for the service-history visit rows (v56)
  var custEditId = null;
  // Customers filter panel state (slide-over, applies live). quick is a
  // single preset; sources is a list of source keys ("__none__" = blank
  // source); the rest are single-pick buckets. custSort orders the list.
  var custFilters = { quick: "all", sources: [], lastService: "any", jobs: "any", annual: "any" };
  var custSort = "recent_service";
  var custHotLeads = []; // hot_leads data cached by loadCustomers() for the numbers strip

  function custLastMs(d) { return tsMs(d && d.lastServiceAt); }
  function custDaysSince(d) {
    var ms = custLastMs(d);
    return ms ? Math.floor((Date.now() - ms) / 86400000) : null;
  }
  // Win-back: serviced before, 30+ days since, and no signed annual
  // contract. Annual-contract-ready is the narrower slice the per-card
  // gold chip flags: 30+ days since service and contract still "none".
  function custIsWinBack(d) {
    var days = custDaysSince(d);
    return days != null && days >= 30 && (d.annualContract || "none") !== "signed";
  }
  function custIsAnnualReady(d) {
    var days = custDaysSince(d);
    return days != null && days >= 30 && (d.annualContract || "none") === "none";
  }
  function custContactLine(d) {
    if (!d) return "";
    if (d.contact) return d.contact;
    return [d.phone || "", d.email || ""].filter(Boolean).join(" · ");
  }
  function custRowData(id) {
    for (var i = 0; i < custRows.length; i++) if (custRows[i].id === id) return custRows[i].d;
    return null;
  }

  function loadCustomers() {
    var box = $("ad-cust-list");
    if (!box) return;
    function renderFromCache() {
      var qs = liveCache["cust"];
      if (!qs) return;
      custRows = [];
      qs.forEach(function (doc) {
        var d = doc.data();
        // CRM records only: portal profile docs (keyed by uid, no CRM
        // fields) are skipped so the list stays a clean customer book.
        if (!d || (!d.name && !d.leadId && !d.createdBy)) return;
        custRows.push({ id: doc.id, d: d });
      });
      // Most recently serviced first; never-serviced at the bottom.
      custRows.sort(function (a, b) {
        var am = custLastMs(a.d), bm = custLastMs(b.d);
        if (am && bm) return bm - am;
        if (am) return -1;
        if (bm) return 1;
        return tsMs(b.d.createdAt) - tsMs(a.d.createdAt);
      });
      // A live read of hot_leads feeds the numbers strip on this page
      // (leads this month, top source, lead -> job conversion). Best
      // effort: if it has not landed yet, the strip just shows the
      // customer counts.
      custHotLeads = [];
      var hqs = liveCache["custhl"];
      if (hqs) hqs.forEach(function (doc) { custHotLeads.push(doc.data()); });
      renderCustomers();
      renderHomeDash();
    }
    liveOn("custhl", db.collection("hot_leads").limit(500), function () { renderFromCache(); }, function () { renderFromCache(); });
    liveOn("cust", db.collection("customers").limit(200), function () { renderFromCache(); }, function () {
      box.innerHTML = '<p style="color:var(--faint)">CRM could not load yet. The database rules update may still need to be published.</p>';
    });
  }

  /* ----- Customers page: numbers strip + win-back filters ----- */
  function renderCustStats() {
    var box = $("ad-cust-stats");
    if (!box) return;
    var repeats = 0;
    custRows.forEach(function (it) { if ((it.d.totalJobs || 0) >= 2) repeats++; });
    var nowD = new Date();
    var leadsMonth = 0, converted = 0;
    var srcCounts = {}, srcOrder = [];
    custHotLeads.forEach(function (d) {
      var ms = tsMs(d && d.createdAt);
      if (ms) {
        var cd = new Date(ms);
        if (cd.getFullYear() === nowD.getFullYear() && cd.getMonth() === nowD.getMonth()) leadsMonth++;
      }
      if (d && d.convertedWorkOrderId) converted++;
      var src = (d && d.source) || "Other";
      if (!(src in srcCounts)) { srcCounts[src] = 0; srcOrder.push(src); }
      srcCounts[src]++;
    });
    // Top source renders name and count on separate lines (the .vsrc
    // class shrinks the name) so a long source like "Marketplace" can
    // never overflow its tile on a phone.
    var topName = "—", topCount = "";
    if (custHotLeads.length) {
      var best = "";
      srcOrder.forEach(function (s) { if (!best || srcCounts[s] > srcCounts[best]) best = s; });
      topName = best;
      topCount = srcCounts[best] + (srcCounts[best] === 1 ? " lead" : " leads");
    }
    var conv = custHotLeads.length ? Math.round(100 * converted / custHotLeads.length) + "%" : "—";
    box.innerHTML = '<section class="astats">' +
      '<div class="astat"><div class="l">Total customers</div><div class="v">' + custRows.length + "</div></div>" +
      '<div class="astat"><div class="l">Repeat customers</div><div class="v">' + repeats + "</div></div>" +
      '<div class="astat"><div class="l">Leads this month</div><div class="v">' + leadsMonth + "</div></div>" +
      '<div class="astat"><div class="l">Top source</div><div class="v vsrc">' + esc(topName) + '</div>' + (topCount ? '<div class="vsub">' + esc(topCount) + "</div>" : "") + "</div>" +
      '<div class="astat"><div class="l">Lead → job conversion</div><div class="v">' + conv + "</div></div></section>";
  }
  /* ----- Customers filter toolbar + slide-over panel ----- */
  var CUST_SORTS = [
    ["recent_service", "Sort: Recent service"],
    ["longest_waiting", "Sort: Longest waiting"],
    ["name", "Sort: Name A–Z"],
    ["most_jobs", "Sort: Most jobs"],
    ["newest", "Sort: Newest added"]
  ];
  function custActiveFilterCount() {
    var n = 0;
    if (custFilters.quick !== "all") n++;
    n += custFilters.sources.length;
    if (custFilters.lastService !== "any") n++;
    if (custFilters.jobs !== "any") n++;
    if (custFilters.annual !== "any") n++;
    return n;
  }
  function renderCustToolbar(visibleCount) {
    var wrap = $("ad-cust-filters");
    if (!wrap) return;
    var n = custActiveFilterCount();
    var opts = CUST_SORTS.map(function (s) {
      return '<option value="' + s[0] + '"' + (custSort === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");
    wrap.innerHTML =
      '<button type="button" class="btn btn-ghost btn-sm" id="cust-filters-btn">Filters' +
        (n ? ' <span class="cust-fbtn-cnt">' + n + "</span>" : "") + "</button>" +
      '<select id="ad-cust-sort" class="cust-sort-sel" aria-label="Sort customers">' + opts + "</select>" +
      '<span class="cust-res-count">' +
        (visibleCount === custRows.length
          ? visibleCount + (visibleCount === 1 ? " customer" : " customers")
          : visibleCount + " of " + custRows.length + " customers") + "</span>";
    $("cust-filters-btn").addEventListener("click", openCustFilterPanel);
    $("ad-cust-sort").addEventListener("change", function () {
      custSort = this.value;
      renderCustomers();
    });
  }
  function custSourceKey(d) {
    var src = ((d && d.source) || "").trim();
    return src || "__none__";
  }
  function custMatchesFilters(d) {
    // Quick preset first (win-back / annual reuse the card predicates).
    if (custFilters.quick === "winback" && !custIsWinBack(d)) return false;
    if (custFilters.quick === "annual" && !custIsAnnualReady(d)) return false;
    if (custFilters.quick === "never" && custLastMs(d)) return false;
    if (custFilters.quick === "nojobs" && (d.totalJobs || 0) > 0) return false;
    // Source: any checked = the customer's source must be among them.
    if (custFilters.sources.length && custFilters.sources.indexOf(custSourceKey(d)) === -1) return false;
    // Last service window, by whole days since lastServiceAt.
    var days = custDaysSince(d);
    if (custFilters.lastService === "w30" && (days == null || days > 30)) return false;
    if (custFilters.lastService === "d31_60" && (days == null || days < 31 || days > 60)) return false;
    if (custFilters.lastService === "d60plus" && (days == null || days <= 60)) return false;
    if (custFilters.lastService === "never" && days != null) return false;
    // Jobs buckets.
    var jobs = d.totalJobs || 0;
    if (custFilters.jobs === "0" && jobs !== 0) return false;
    if (custFilters.jobs === "1" && jobs !== 1) return false;
    if (custFilters.jobs === "2plus" && jobs < 2) return false;
    // Annual contract status.
    if (custFilters.annual !== "any" && (d.annualContract || "none") !== custFilters.annual) return false;
    return true;
  }
  function custSortRows(rows) {
    var arr = rows.slice();
    if (custSort === "longest_waiting") {
      // Follow-up gold first: never-serviced, then longest since service.
      arr.sort(function (a, b) {
        var am = custLastMs(a.d), bm = custLastMs(b.d);
        if (!am && !bm) return tsMs(b.d.createdAt) - tsMs(a.d.createdAt);
        if (!am) return -1;
        if (!bm) return 1;
        return am - bm;
      });
    } else if (custSort === "name") {
      arr.sort(function (a, b) { return String(a.d.name || "").localeCompare(String(b.d.name || "")); });
    } else if (custSort === "most_jobs") {
      arr.sort(function (a, b) {
        return ((b.d.totalJobs || 0) - (a.d.totalJobs || 0)) || ((custLastMs(b.d) || 0) - (custLastMs(a.d) || 0));
      });
    } else if (custSort === "newest") {
      arr.sort(function (a, b) { return tsMs(b.d.createdAt) - tsMs(a.d.createdAt); });
    } else { // recent_service: newest service first, never-serviced last
      arr.sort(function (a, b) {
        var am = custLastMs(a.d), bm = custLastMs(b.d);
        if (am && bm) return bm - am;
        if (am) return -1;
        if (bm) return 1;
        return tsMs(b.d.createdAt) - tsMs(a.d.createdAt);
      });
    }
    return arr;
  }
  function syncCustFilterPanel() {
    var panel = $("custFilterPanel");
    if (!panel) return;
    var setRadio = function (name, val) {
      var inputs = panel.querySelectorAll('input[name="' + name + '"]');
      for (var i = 0; i < inputs.length; i++) inputs[i].checked = inputs[i].value === val;
    };
    setRadio("cust-quick", custFilters.quick);
    setRadio("cust-lastsvc", custFilters.lastService);
    setRadio("cust-jobsf", custFilters.jobs);
    setRadio("cust-annualf", custFilters.annual);
    var boxes = panel.querySelectorAll("input[data-custsrc]");
    for (var j = 0; j < boxes.length; j++) boxes[j].checked = custFilters.sources.indexOf(boxes[j].dataset.custsrc) !== -1;
  }
  function refreshCustFilterPanel() {
    // Counts for the quick views + the dynamic source checkbox list,
    // rebuilt from the loaded customers every time the panel opens.
    var counts = { all: custRows.length, winback: 0, annual: 0, never: 0, nojobs: 0 };
    var srcMap = {}, srcOrder = [];
    custRows.forEach(function (it) {
      var d = it.d;
      if (custIsWinBack(d)) counts.winback++;
      if (custIsAnnualReady(d)) counts.annual++;
      if (!custLastMs(d)) counts.never++;
      if (!((d.totalJobs || 0) > 0)) counts.nojobs++;
      var key = custSourceKey(d);
      if (!(key in srcMap)) { srcMap[key] = 0; srcOrder.push(key); }
      srcMap[key]++;
    });
    var spans = document.querySelectorAll("[data-custqcnt]");
    for (var i = 0; i < spans.length; i++) spans[i].textContent = counts[spans[i].dataset.custqcnt] != null ? counts[spans[i].dataset.custqcnt] : "";
    var sl = $("cust-src-list");
    if (sl) {
      sl.innerHTML = srcOrder.length ? srcOrder.map(function (k) {
        return '<label class="cfp-row"><input type="checkbox" data-custsrc="' + esc(k) + '"' +
          (custFilters.sources.indexOf(k) !== -1 ? " checked" : "") +
          '> <span class="cfp-lbl">' + esc(k === "__none__" ? "(No source)" : k) + '</span>' +
          ' <span class="cfp-cnt">' + srcMap[k] + "</span></label>";
      }).join("") : '<p class="cfp-empty">No sources yet.</p>';
    }
    syncCustFilterPanel();
  }
  function wireCustFilterPanel() {
    var panel = $("custFilterPanel");
    if (!panel || panel.dataset.wired) return;
    panel.dataset.wired = "1";
    panel.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "cust-quick") custFilters.quick = t.value;
      else if (t.name === "cust-lastsvc") custFilters.lastService = t.value;
      else if (t.name === "cust-jobsf") custFilters.jobs = t.value;
      else if (t.name === "cust-annualf") custFilters.annual = t.value;
      else if (t.dataset && t.dataset.custsrc) {
        var k = t.dataset.custsrc, i = custFilters.sources.indexOf(k);
        if (t.checked && i === -1) custFilters.sources.push(k);
        if (!t.checked && i !== -1) custFilters.sources.splice(i, 1);
      } else return;
      renderCustomers(); // filters apply live
    });
    $("custFilterClose").addEventListener("click", closeCustFilterPanel);
    $("custFilterDone").addEventListener("click", closeCustFilterPanel);
    $("custFilterBackdrop").addEventListener("click", closeCustFilterPanel);
    $("custFilterClear").addEventListener("click", function () {
      custFilters = { quick: "all", sources: [], lastService: "any", jobs: "any", annual: "any" };
      refreshCustFilterPanel();
      renderCustomers();
    });
  }
  function openCustFilterPanel() {
    wireCustFilterPanel();
    refreshCustFilterPanel();
    var p = $("custFilterPanel"), b = $("custFilterBackdrop");
    if (p) p.classList.add("open");
    if (b) b.classList.add("open");
  }
  function closeCustFilterPanel() {
    var p = $("custFilterPanel"), b = $("custFilterBackdrop");
    if (p) p.classList.remove("open");
    if (b) b.classList.remove("open");
  }

  function renderCustomers() {
    var box = $("ad-cust-list");
    if (!box) return;
    renderCustStats();
    if (!custRows.length) {
      renderCustToolbar(0);
      box.innerHTML = '<p style="color:var(--faint)">No customers yet. Promote a lead with "Make customer" on the lead detail, or add one with the Add customer button.</p>';
      return;
    }
    // Filter panel pipeline: quick preset + source / last-service /
    // jobs / annual-contract buckets, then the chosen sort.
    var visible = custSortRows(custRows.filter(function (it) { return custMatchesFilters(it.d); }));
    renderCustToolbar(visible.length);
    box.innerHTML = "";
    if (!visible.length) {
      box.innerHTML = '<p style="color:var(--faint)">' +
        (custActiveFilterCount()
          ? "No customers match the current filters. Open Filters and tap Clear all to see everyone."
          : "No customers to show.") + "</p>";
      return;
    }
    visible.forEach(function (it) {
      var d = it.d;
      var lastMs = custLastMs(d);
      var days = custDaysSince(d);
      var contract = d.annualContract || "none";
      var lastLine = lastMs
        ? "Last service: " + new Date(lastMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) + (d.lastServiceLabel ? " · " + d.lastServiceLabel : "")
        : "No service yet";
      var chips = [];
      chips.push('<span class="pill p-acc">' + (d.totalJobs || 0) + " jobs</span>");
      if (days != null) {
        var dcls = days >= 60 ? "p-rev" : (days >= 30 ? "p-pend" : "p-done");
        chips.push('<span class="pill ' + dcls + '">' + days + "d ago</span>");
      }
      if (d.totalSpent != null) chips.push('<span class="pill p-done">$' + esc(d.totalSpent) + " spent</span>");
      if (contract === "signed") chips.push('<span class="pill p-done">Annual contract ✓</span>');
      else if (contract === "offered") chips.push('<span class="pill p-pend">Annual contract offered</span>');
      else if (days != null && days >= 30) chips.push('<span class="pill p-pend">Ready for annual-contract follow-up</span>');
      var contactLine = [custContactLine(d), d.address || ""].filter(Boolean).join(" · ");
      var row = document.createElement("article");
      row.className = "hlq-card";
      row.style.borderLeftColor = "#c9a227";
      row.innerHTML =
        '<div class="hlq-head"><button type="button" class="hlq-name" data-custdetail="' + it.id + '">' + esc(d.name || "Customer") + "</button>" +
          '<div class="cust-lastsvc' + (lastMs ? "" : " none") + '">' + esc(lastLine) + "</div></div>" +
        (contactLine ? '<div class="hlq-service">' + esc(contactLine) + "</div>" : "") +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' + chips.join("") + "</div>" +
        '<div class="hlq-actions">' +
          '<button type="button" class="mini hlq-action hlq-action-primary" data-custnotes="' + it.id + '">Notes</button>' +
          '<button type="button" class="mini hlq-action" data-custtask="' + it.id + '">Task</button>' +
          (d.email ? '<a class="mini hlq-action" href="mailto:' + esc(d.email) + '" data-custemail="' + it.id + '">Email</a>' : "") +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-custedit="' + it.id + '">Edit</button>' +
        "</div>" +
        '<div class="hlq-foot"><span class="hlq-source">' + esc(d.source || "") + "</span>" +
          '<span class="hlq-manage">' + (isAdmin ? '<button type="button" class="hlq-manage-btn danger" data-custdel="' + it.id + '">Delete</button>' : "") + "</span></div>";
      box.appendChild(row);
    });
  }

  /* ----- Add / edit customer ----- */
  function openCustomerForm(id) {
    custEditId = id || null;
    var d = id ? (custRowData(id) || {}) : {};
    var contractOpts = [["none", "None"], ["offered", "Offered"], ["signed", "Signed"]].map(function (o) {
      return '<option value="' + o[0] + '"' + ((d.annualContract || "none") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
    $("custFormBody").innerHTML = '<h3 id="custFormTitle">' + (id ? "Edit customer" : "Add customer") + "</h3>" +
      '<form id="custForm" class="aform" style="margin-top:10px">' +
      '<label>Name<input type="text" id="cu-f-name" required placeholder="Customer name" value="' + esc(d.name || "") + '"></label>' +
      '<div class="row2"><label>Phone<input type="text" id="cu-f-phone" placeholder="(305) 555-0123" value="' + esc(d.phone || "") + '"></label>' +
      '<label>Email<input type="email" id="cu-f-email" placeholder="name@email.com" value="' + esc(d.email || "") + '"></label></div>' +
      '<label>Contact (display)<input type="text" id="cu-f-contact" placeholder="Phone · email as shown on the card" value="' + esc(d.contact || "") + '"></label>' +
      '<label>Address<input type="text" id="cu-f-address" placeholder="123 Main St, Miami, FL 33101" value="' + esc(d.address || "") + '"></label>' +
      '<div class="row2"><label>Source<input type="text" id="cu-f-source" placeholder="Hot lead, Referral, Website…" value="' + esc(d.source || "") + '"></label>' +
      '<label>Annual contract<select id="cu-f-contract">' + contractOpts + "</select></label></div>" +
      '<label>Notes<textarea id="cu-f-notes" rows="3" placeholder="Gate codes, preferences, anything the crew should know…">' + esc(d.notes || "") + "</textarea></label>" +
      '<p class="aerr hidden" id="cu-f-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="cu-f-save">' + (id ? "Save changes" : "Add customer") + "</button></div>" +
      "</form>";
    $("custFormModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    $("custForm").addEventListener("submit", saveCustomerForm);
  }
  function closeCustomerForm() {
    $("custFormModal").classList.add("hidden");
    if ($("custModal").classList.contains("hidden")) document.body.style.overflow = "";
    custEditId = null;
  }
  function saveCustomerForm(e) {
    e.preventDefault();
    var err = $("cu-f-err"); err.classList.add("hidden");
    var name = $("cu-f-name").value.trim();
    if (!name) { err.textContent = "Name is required."; err.classList.remove("hidden"); return; }
    var phone = $("cu-f-phone").value.trim(), email = $("cu-f-email").value.trim();
    var contact = $("cu-f-contact").value.trim() || [phone, email].filter(Boolean).join(" · ");
    var fields = {
      name: name, phone: phone, email: email, contact: contact,
      address: $("cu-f-address").value.trim(),
      source: $("cu-f-source").value.trim(),
      annualContract: $("cu-f-contract").value,
      notes: $("cu-f-notes").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var btn = $("cu-f-save"); btn.disabled = true;
    var p;
    if (custEditId) {
      p = db.collection("customers").doc(custEditId).update(fields).then(function () {
        logActivity("Edited customer: " + name);
      });
    } else {
      fields.lastServiceAt = null;
      fields.lastServiceLabel = "";
      fields.totalJobs = 0;
      fields.totalSpent = null;
      fields.leadId = null;
      fields.createdBy = me ? me.email : "";
      fields.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      p = db.collection("customers").add(fields).then(function () {
        logActivity("Added customer: " + name);
      });
    }
    p.then(function () {
      var reopen = custId;
      closeCustomerForm();
      loadCustomers();
      if (reopen) openCustomer(reopen);
    }).catch(function (e2) {
      err.textContent = "Could not save: " + (e2.message || e2);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }
  var custAddBtn = $("cust-add");
  if (custAddBtn) custAddBtn.addEventListener("click", function () { openCustomerForm(null); });

  function deleteCustomer(id) {
    if (!isAdmin) return;
    var d = custRowData(id);
    var name = (d && d.name) || "this customer";
    if (!confirm("Delete customer " + name + "? This cannot be undone.")) return;
    db.collection("customers").doc(id).delete().then(function () {
      logActivity("Deleted customer: " + name);
      loadCustomers();
    }).catch(function (e) { alert("Could not delete customer: " + (e.message || e)); });
  }

  /* ----- Promote a hot lead into a CRM customer (idempotent) ----- */
  function makeCustomerFromLead(leadId) {
    var d = hlLeadData(leadId);
    if (!d) return Promise.resolve(null);
    if (d.customerId) return Promise.resolve(d.customerId);
    var contact = d.contact || "";
    var email = "", phone = "";
    if (/@/.test(contact)) email = contact; else if (contact) phone = contact;
    var fields = {
      name: d.name || "Customer", contact: contact, email: email, phone: phone,
      address: d.address || "", source: "Hot lead", notes: d.notes || "",
      lastServiceAt: null, lastServiceLabel: "", totalJobs: 0, totalSpent: null,
      leadId: leadId, annualContract: "none",
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return db.collection("customers").add(fields).then(function (ref) {
      return db.collection("hot_leads").doc(leadId).update({
        customerId: ref.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        logActivity("Created customer record from hot lead: " + fields.name);
        for (var i = 0; i < hlLeads.length; i++) if (hlLeads[i].id === leadId) hlLeads[i].d.customerId = ref.id;
        loadCustomers();
        return ref.id;
      });
    });
  }

  /* ----- Promote a work order's customer into the CRM (idempotent) ----- */
  function makeCustomerFromWO(woId) {
    var w = null;
    for (var i = 0; i < woOrders.length; i++) if (woOrders[i].id === woId) w = woOrders[i].d;
    if (!w) return Promise.resolve(null);
    if (w.customerId) return Promise.resolve(w.customerId);
    function linkBack(custId) {
      if (!custId) return null;
      return db.collection("work_orders").doc(woId).update({
        customerId: custId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        for (var j = 0; j < woOrders.length; j++) if (woOrders[j].id === woId) woOrders[j].d.customerId = custId;
        return custId;
      });
    }
    // Richest path: the WO came from a hot lead, promote the lead so the
    // customer carries the lead's contact info and history link.
    if (w.sourceLeadId) {
      return makeCustomerFromLead(w.sourceLeadId).then(linkBack);
    }
    var bits = [w.customerContact || w.contact || "", w.customerPhone || w.phone || "", w.customerEmail || w.email || ""];
    var email = "", phone = "";
    bits.forEach(function (b) { if (!b) return; if (/@/.test(b) && !email) email = b; else if (!phone && !/@/.test(b)) phone = b; });
    var fields = {
      name: woCustomerName(w) || w.title || "Customer",
      contact: bits.filter(Boolean).join(" \u00b7 "), email: email, phone: phone,
      address: w.address || "", source: "Work order", notes: w.details || "",
      lastServiceAt: null, lastServiceLabel: "", totalJobs: 0, totalSpent: null,
      leadId: null, annualContract: "none",
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return db.collection("customers").add(fields).then(function (ref) {
      logActivity("Created customer record from work order: " + fields.name);
      loadCustomers();
      return linkBack(ref.id);
    });
  }

  /* ----- Review-request task, auto-created when a job completes ----- */
  // One Tasks-page item per completed job, linked to the customer, so the
  // team asks for a Google review while the work is fresh. Best effort by
  // design: every failure is swallowed — this must never block or break
  // work-order completion. Dedupe: skip when an OPEN task for the same
  // customer with the same review title was already created in the last
  // 7 days (a second job inside a week does not need a second ask).
  function createReviewRequestTask(custId, cd) {
    try {
      if (!custId || !cd) return Promise.resolve();
      var custName = cd.name || "Customer";
      var title = "Ask " + custName + " for a Google review";
      var firstName = String(custName).trim().split(/\s+/)[0] || custName;
      var weekAgo = Date.now() - 7 * 86400000;
      return db.collection("tasks").where("entityId", "==", custId).limit(50).get()
        .then(function (qs) {
          var dupe = false;
          qs.forEach(function (doc) {
            var t = doc.data();
            if (!t || t.done) return;
            if (typeof t.title !== "string" || t.title.indexOf(title) !== 0) return;
            if (tsMs(t.createdAt) >= weekAgo) dupe = true;
          });
          if (dupe) return;
          return db.collection("tasks").add({
            title: title,
            details: "The job is done — strike while it's fresh.\n" +
              "1. First ask how everything went. If they're happy, send the review link with this message:\n" +
              "\"Hi " + firstName + ", thanks for choosing PrimeGuard! If you're happy with the work, a quick Google review helps a small local business like ours more than you'd think: {REVIEW LINK}\"\n" +
              "2. If they're NOT happy, don't send the link — call Edwin first.",
            dueDate: localDateKey(new Date()),
            assigneeEmail: "",
            entityType: "customer",
            entityId: custId,
            entityName: custName,
            done: false,
            createdBy: "System (job completed)",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            doneAt: null
          });
        })
        .catch(function () {});
    } catch (e) {
      return Promise.resolve();
    }
  }

  /* ----- Completing a work order stamps the linked customer ----- */
  // Linkage: work_orders.customerId when present, else the customer whose
  // leadId matches the work order's sourceLeadId (the convert path).
  function custServicedFromWorkOrder(w) {
    if (!w) return Promise.resolve();
    function apply(ref, cd, custId) {
      return ref.update({
        lastServiceAt: firebase.firestore.Timestamp.fromDate(new Date()),
        lastServiceLabel: w.category || w.title || "Service visit",
        totalJobs: (cd.totalJobs || 0) + 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        // Fire-and-forget: queue the review ask on the Tasks page. Its
        // own errors are swallowed inside, so completion never waits on
        // or breaks because of it.
        try {
          var p = createReviewRequestTask(custId, cd);
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      });
    }
    if (w.customerId) {
      var ref = db.collection("customers").doc(w.customerId);
      return ref.get().then(function (s) { if (s.exists) return apply(ref, s.data(), w.customerId); }).catch(function () {});
    }
    if (w.sourceLeadId) {
      return db.collection("customers").where("leadId", "==", w.sourceLeadId).limit(1).get()
        .then(function (qs) {
          if (qs.empty) return;
          var doc = qs.docs[0];
          return apply(doc.ref, doc.data(), doc.id);
        }).catch(function () {});
    }
    return Promise.resolve();
  }

  /* ----- Customer detail: service history, log service, calls & notes ----- */
  function openCustomer(id) {
    db.collection("customers").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var d = snap.data();
      custId = id; custData = d; custOutcome = "";
      var lastMs = custLastMs(d);
      var days = custDaysSince(d);
      var fullDate = function (ms) { return ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"; };
      var contractOpts = [["none", "None"], ["offered", "Offered"], ["signed", "Signed"]].map(function (o) {
        return '<option value="' + o[0] + '"' + ((d.annualContract || "none") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
      var selStyle = 'style="margin-top:6px;width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:.95rem;font-family:inherit;color-scheme:dark"';
      var custPhone = d.phone || "", custEmail = d.email || "";
      if (!custPhone || !custEmail) {
        String(d.contact || "").split(/[\u00b7,;]/).forEach(function (part) {
          var p = part.trim(); if (!p) return;
          if (/@/.test(p)) { if (!custEmail) custEmail = p; }
          else if (/\d{3}/.test(p)) { if (!custPhone) custPhone = p; }
        });
      }
      var contractLabel = { none: "No contract", offered: "Contract offered", signed: "Contract signed" }[d.annualContract || "none"];
      var sinceMs = tsMs(d.createdAt);
      var kvRow = function (k, v) { return v ? '<div class="cust-kv"><span>' + k + '</span><strong>' + v + "</strong></div>" : ""; };
      var h = '<h3 id="custTitle">' + esc(d.name || "Customer") + "</h3>" +
        '<p class="sr-meta">' + (d.source ? '<span class="pill p-acc">' + esc(d.source) + "</span>" : "") +
        '<span class="pill">' + esc(contractLabel) + "</span>" +
        "<span>" + esc([custContactLine(d), d.address || ""].filter(Boolean).join(" · ")) + "</span></p>" +
        '<div class="sr-actions" style="margin:2px 0 12px">' +
        '<button class="btn btn-gold btn-sm" id="cust-task-btn-top" type="button">Create task</button>' +
        (custPhone ? '<a class="btn btn-ghost btn-sm" href="tel:' + esc(custPhone.replace(/[^0-9+]/g, "")) + '">Call</a>' +
          '<a class="btn btn-ghost btn-sm" href="sms:' + esc(custPhone.replace(/[^0-9+]/g, "")) + '">Text</a>' : "") +
        (custEmail ? '<a class="btn btn-ghost btn-sm" href="mailto:' + esc(custEmail) + '">Email</a>' : "") +
        '<button class="btn btn-ghost btn-sm" id="cust-edit-top" type="button">Edit</button></div>' +
        '<div class="cust-strip">' +
        '<div class="cust-tile"><span class="cust-tile-v" id="cust-strip-value">…</span><span class="cust-tile-l" id="cust-strip-value-l">Value</span></div>' +
        '<div class="cust-tile"><span class="cust-tile-v">' + (d.totalJobs || 0) + '</span><span class="cust-tile-l">Jobs done</span></div>' +
        '<div class="cust-tile"><span class="cust-tile-v">' + (lastMs ? esc(fullDate(lastMs)) : "None yet") + '</span><span class="cust-tile-l">Last service</span></div>' +
        '<div class="cust-tile"><span class="cust-tile-v" id="cust-strip-next">…</span><span class="cust-tile-l">Next visit</span></div>' +
        "</div>" +
        '<div class="cust-grid"><div class="cust-main">' +
        '<div class="sr-card"><h4>Plan &amp; contract</h4><div id="cust-plan"><p class="sr-faint">Loading…</p></div>' +
        '<label style="display:block;margin-top:12px;font-size:.85rem;color:var(--muted)">Annual contract<select id="cust-annual" ' + selStyle + ">" + contractOpts + "</select></label></div>" +
        '<div class="sr-card"><h4 style="display:flex;justify-content:space-between;align-items:center;gap:8px">Timeline <button type="button" class="mini" id="cust-tl-sort">Oldest first</button></h4><div id="cust-timeline" class="cust-scrollbox"><p class="sr-faint">Loading…</p></div></div>' +
        '<div class="sr-card"><h4>Calls &amp; notes</h4>' +
        '<p class="sr-faint">Log every call and update here. Notes are a permanent team record with your name and the time on them.</p>' +
        '<div class="outcome-grid" id="custOutcomes">' +
        CALL_OUTCOMES.map(function (o) {
          return '<button type="button" class="outcome-btn" data-custoutcome="' + o[0] + '">' + o[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="note-form"><label>Notes<textarea id="cnText" rows="3" placeholder="What happened on the call, what they said, what is next…"></textarea></label>' +
        '<label>Follow-up date (optional)<input type="date" id="cnFollow"></label></div>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="cnSave" type="button">Save call / note</button>' +
        '<button class="btn btn-ghost btn-sm" id="cust-task-btn" type="button">Create task</button></div>' +
        '<p class="aok hidden" id="cnOk" style="margin-top:10px">Saved.</p>' +
        '<p class="aerr hidden" id="cnErr" style="margin-top:10px"></p>' +
        '<div class="sr-comments" id="cnNotes" style="margin-top:14px"></div></div>' +
        '<div class="sr-card"><h4>Log a completed service</h4>' +
        '<p class="sr-faint">Until jobs close out on their own, log each finished visit here: it stamps the last-service date the whole team works from.</p>' +
        '<div class="note-form"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<label>Date<input type="date" id="cust-svc-date" value="' + localDateKey(new Date()) + '"></label>' +
        '<label>Service<input type="text" id="cust-svc-label" placeholder="Lawn care visit" style="margin-top:6px;width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:.95rem;font-family:inherit"></label></div></div>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="cust-svc-btn" type="button">Log service</button></div>' +
        '<p class="aerr hidden" id="cust-svc-err" style="margin-top:10px"></p></div>' +
        '<div class="sr-card"><h4 style="display:flex;justify-content:space-between;align-items:center;gap:8px">Service history <button type="button" class="mini" id="cust-hist-sort">Oldest first</button></h4><div id="cust-history" class="cust-scrollbox"><p class="sr-faint">Loading…</p></div></div>' +
        '</div><div class="cust-rail">' +
        '<div class="sr-card cust-contact-card"><h4>Contact</h4>' +
        '<div class="cust-contact-row"><span>Phone</span>' + (custPhone ? '<a href="tel:' + esc(custPhone.replace(/[^0-9+]/g, "")) + '">' + esc(custPhone) + "</a>" : '<strong class="cust-none">Not on file</strong>') + "</div>" +
        '<div class="cust-contact-row"><span>Email</span>' + (custEmail ? '<a href="mailto:' + esc(custEmail) + '">' + esc(custEmail) + "</a>" : '<strong class="cust-none">Not on file</strong>') + "</div>" +
        '<div class="cust-contact-meta">' +
        kvRow("Source", esc(d.source || "")) + kvRow("Customer since", sinceMs ? esc(fullDate(sinceMs)) : "") +
        kvRow("Last visit", days != null ? days + "d ago" : "") + "</div></div>" +
        '<div class="sr-card"><h4>Tasks</h4>' +
        '<div class="sr-actions" style="margin:0 0 6px"><button class="btn btn-gold btn-sm" id="cust-tasks-new" type="button">Create task</button></div>' +
        '<p class="sr-faint" style="margin:0 0 4px">Create opens the Tasks page with this customer already linked.</p>' +
        '<label style="display:flex;gap:8px;align-items:center;font-size:.8rem;color:var(--muted);margin:0 0 6px">Sort <select id="cust-tasks-sort" class="cust-sortsel"><option value="due">Due soonest</option><option value="due-desc">Due latest</option><option value="az">A to Z</option><option value="new">Newest first</option></select></label>' +
        '<div id="cust-tasks" class="cust-scrollbox"><p class="sr-faint">Loading…</p></div></div>' +
        '<div class="sr-card"><h4>Property</h4>' +
        (d.address ? '<p style="margin:0 0 8px">' + esc(d.address) + '</p><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + esc(encodeURIComponent(d.address)) + '">Open in Maps</a>' : '<p class="sr-faint">No address on file yet.</p>') +
        (d.leadId ? '<p class="sr-faint" style="margin-top:8px">Came in as a hot lead; the full lead history is in the timeline.</p>' : "") + "</div>" +
        (d.notes ? '<div class="sr-card"><h4>Customer notes</h4><p>' + esc(d.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +

        "</div></div>";
      var box = $("custBody");
      box.innerHTML = h;
      box.querySelectorAll("[data-custoutcome]").forEach(function (b) {
        b.addEventListener("click", function () {
          custOutcome = custOutcome === b.getAttribute("data-custoutcome") ? "" : b.getAttribute("data-custoutcome");
          box.querySelectorAll("[data-custoutcome]").forEach(function (x) {
            x.classList.toggle("active", x.getAttribute("data-custoutcome") === custOutcome);
          });
        });
      });
      $("cust-annual").addEventListener("change", function () {
        var val = this.value;
        db.collection("customers").doc(id).update({
          annualContract: val,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          logActivity("Set annual contract (" + val + ") for customer " + (d.name || ""));
          loadCustomers();
        }).catch(function (e) { alert("Could not save: " + (e.message || e)); });
      });
      $("cust-svc-btn").addEventListener("click", logCustomerService);
      $("cnSave").addEventListener("click", saveCustomerNote);
      $("cust-task-btn-top").addEventListener("click", function () {
        openTaskForm({ entityType: "customer", entityId: id, entityName: d.name || "Customer" });
      });
      $("cust-task-btn").addEventListener("click", function () {
        openTaskForm({ entityType: "customer", entityId: id, entityName: d.name || "Customer" });
      });
      $("custModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
      loadItemNotes("customer", id, $("cnNotes"));
      loadCustomerHistory(id, d);
      var editTop = $("cust-edit-top");
      if (editTop) editTop.addEventListener("click", function () { openCustomerForm(id); });
      var tasksNew = $("cust-tasks-new");
      if (tasksNew) tasksNew.addEventListener("click", function () {
        var nm = d.name || "Customer";
        closeCustomer();
        var navBtn = document.querySelector('#pgNavDrawer [data-atab="followups"]');
        if (navBtn) navBtn.click();
        openTaskForm({ entityType: "customer", entityId: id, entityName: nm });
      });
      var tlSortBtn = $("cust-tl-sort");
      if (tlSortBtn) tlSortBtn.addEventListener("click", function () {
        custTlSort = custTlSort === "new" ? "old" : "new";
        tlSortBtn.textContent = custTlSort === "new" ? "Oldest first" : "Newest first";
        renderCustTimeline();
      });
      var histSortBtn = $("cust-hist-sort");
      if (histSortBtn) histSortBtn.addEventListener("click", function () {
        custHistSort = custHistSort === "new" ? "old" : "new";
        histSortBtn.textContent = custHistSort === "new" ? "Oldest first" : "Newest first";
        renderCustHistory();
      });
      var taskSortSel = $("cust-tasks-sort");
      if (taskSortSel) taskSortSel.addEventListener("change", function () {
        custTaskSort = taskSortSel.value;
        if (custId) loadCustOpenTasks(custId, custData || {});
      });
      loadCustProfileExtras(id, d);
      loadCustOpenTasks(id, d);
    });
  }
  function closeCustomer() {
    $("custModal").classList.add("hidden");
    document.body.style.overflow = "";
    custId = null; custData = null; custOutcome = "";
  }
  function renderCustTimeline() {
    var tlBox = $("cust-timeline");
    if (!tlBox) return;
    var evs = (custTlEvs || []).slice();
    evs.sort(function (a, b) { return custTlSort === "new" ? b.ms - a.ms : a.ms - b.ms; });
    tlBox.innerHTML = evs.length ? evs.slice(0, 40).map(function (e) {
      return '<div class="tl-item"><span class="tl-ic">' + e.icon + '</span><div class="tl-tx"><p>' + esc(e.text) + '</p><small>' + esc(new Date(e.ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })) + "</small></div></div>";
    }).join("") : '<p class="sr-faint">Nothing yet. Jobs, quotes, calls, and notes will land here in order.</p>';
  }
  function loadCustomerHistory(id, d) {
    var box = $("cust-history");
    if (!box) return;
    var found = {};
    function collect(qs) { qs.forEach(function (doc) { found[doc.id] = doc.data(); }); }
    var ps = [];
    if (d.leadId) {
      ps.push(db.collection("work_orders").where("sourceLeadId", "==", d.leadId).limit(50).get().then(collect).catch(function () {}));
    }
    ps.push(db.collection("work_orders").where("customerId", "==", id).limit(50).get().then(collect).catch(function () {}));
    Promise.all(ps).then(function () { custHistFound = found; renderCustHistory(); });
  }
  function renderCustHistory() {
    var box = $("cust-history");
    if (!box || !custHistFound) return;
    var found = custHistFound;
    var ids = Object.keys(found);
    if (!ids.length) {
      box.innerHTML = '<p class="sr-faint">No linked work orders yet. Jobs converted from this customer\'s lead will show up here.</p>';
      return;
    }
    // Flatten to one row per performed visit: a work order WITH a
    // visitLog gets one tappable row per visit entry (its own date, crew,
    // and photo count); a work order without one keeps the legacy row.
    custVisitRows = {};
    var rows = [];
    ids.forEach(function (wid) {
      var w = found[wid];
      var log = Array.isArray(w.visitLog) ? w.visitLog.filter(function (e) { return e && typeof e === "object"; }) : [];
      if (log.length) {
        log.forEach(function (entry, idx) {
          var key = wid + ":" + idx;
          custVisitRows[key] = { wid: wid, entry: entry };
          rows.push({ ms: custDateMs(entry.visitDate) || custDateMs(entry.completedAt) || tsMs(w.createdAt), wid: wid, entry: entry, key: key });
        });
      } else {
        rows.push({ ms: tsMs(w.createdAt), wid: wid, entry: null, key: "" });
      }
    });
    rows.sort(function (a, b) { return custHistSort === "new" ? b.ms - a.ms : a.ms - b.ms; });
    box.innerHTML = rows.map(function (r) {
      var w = found[r.wid];
      if (!r.entry) {
        var whenMs = tsMs(w.createdAt);
        return '<div class="sr-comment"><strong>' + esc(w.title || "Work order") + "</strong><span>" +
          esc(String(w.status || "").replace(/_/g, " ")) +
          (whenMs ? " · " + esc(new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })) : "") +
          (w.vendorBusiness ? " · " + esc(w.vendorBusiness) : "") + "</span>" +
          (w.details ? "<p>" + esc(hlExcerpt(w.details)) + "</p>" : "") + "</div>";
      }
      var e = r.entry;
      var vMs = custDateMs(e.visitDate) || custDateMs(e.completedAt);
      var vPhotos = Array.isArray(e.photos) ? e.photos.filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); }) : [];
      var statusWord = (w.status === "review" || w.status === "done") ? "Completed" : String(w.status || "Completed").replace(/_/g, " ");
      return '<div class="sr-comment" data-custvisit="' + esc(r.key) + '" role="button" tabindex="0" title="View this visit" style="cursor:pointer"><strong>' + esc(w.title || "Work order") + "</strong><span>" +
        esc(statusWord) +
        (vMs ? " · " + esc(new Date(vMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })) : "") +
        (e.vendorBusiness || w.vendorBusiness ? " · " + esc(e.vendorBusiness || w.vendorBusiness) : "") +
        " · " + vPhotos.length + (vPhotos.length === 1 ? " photo" : " photos") +
        ' <span style="color:var(--gold-bright);font-weight:700">View ›</span></span></div>';
    }).join("");
  }
  /* ----- Visit detail (v56): one performed visit, only its own photos ----- */
  // Opens in the shared #pgVmModal shell (ensurePgVmModal/closePgVmModal,
  // the same modal the vendor browser uses) and its photos reuse the
  // #pgLightbox via the same data-wophoto buttons as the work order detail.
  function openCustVisitDetail(key) {
    var rec = custVisitRows[key];
    if (!rec || !custHistFound) return;
    var w = custHistFound[rec.wid] || {};
    var e = rec.entry || {};
    ensurePgVmModal();
    var vMs = custDateMs(e.visitDate) || custDateMs(e.completedAt);
    var dateStr = vMs ? new Date(vMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
    var statusWord = (w.status === "review" || w.status === "done") ? "Completed" : String(w.status || "").replace(/_/g, " ");
    var pay = w.pay || w.payAgreed || "";
    var photos = Array.isArray(e.photos) ? e.photos.filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); }) : [];
    var ctxRow = function (k, v) { return v ? '<div class="pgvb-ctxi"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>" : ""; };
    var h = '<h3 id="pgVmTitle">' + esc(w.title || "Work order") + "</h3>" +
      '<div class="pgvb-ctx">' +
      ctxRow("Visit date", esc(dateStr)) +
      ctxRow("Crew", esc(e.vendorBusiness || w.vendorBusiness || "")) +
      ctxRow("Address", esc(w.address || "")) +
      ctxRow("Status", esc(statusWord)) +
      ctxRow("Pay", pay ? esc(String(pay)) : "") +
      "</div>";
    var noteBits = [];
    if (w.details) noteBits.push(esc(w.details).replace(/\n/g, "<br>"));
    if (e.note) noteBits.push(esc(e.note).replace(/\n/g, "<br>"));
    if (noteBits.length) h += '<div class="woq-dblock"><h4>Details</h4><p>' + noteBits.join("<br>") + "</p></div>";
    if (photos.length) {
      h += '<div class="woq-dblock"><h4>Photos from this visit (' + photos.length + ')</h4><div class="athumbs woq-thumbs">' +
        photos.map(function (u) { return '<button type="button" class="woq-thumb-btn" data-wophoto="' + esc(woPhotoBigUrl(u)) + '" data-wophotoorig="' + esc(u) + '" aria-label="View photo full size"><img src="' + esc(u) + '" alt="visit photo"></button>'; }).join("") + "</div></div>";
    } else {
      h += '<p class="sr-faint">No photos were attached to this visit.</p>';
    }
    $("pgVmBody").innerHTML = h;
    $("pgVmModal").classList.remove("hidden");
  }
  /* ----- Two Column Pro profile: plan, timeline, tasks (v45) ----- */
  function custDateMs(v) {
    if (v == null) return 0;
    if (typeof v.toDate === "function") { try { return v.toDate().getTime(); } catch (e) { return 0; } }
    if (typeof v === "object" && typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v === "string" || typeof v === "number") { var t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
    return 0;
  }
  function custLinkedWOs(id, d) {
    var found = {};
    function collect(qs) { qs.forEach(function (doc) { found[doc.id] = doc.data(); }); }
    var ps = [];
    if (d.leadId) ps.push(db.collection("work_orders").where("sourceLeadId", "==", d.leadId).limit(50).get().then(collect).catch(function () {}));
    ps.push(db.collection("work_orders").where("customerId", "==", id).limit(50).get().then(collect).catch(function () {}));
    return Promise.all(ps).then(function () {
      return Object.keys(found).map(function (wid) { return { id: wid, w: found[wid] }; });
    });
  }
  function custNextVisit(wos) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var best = null;
    function consider(ms, w) { if (ms && ms >= now.getTime() && (!best || ms < best.ms)) best = { ms: ms, w: w }; }
    (wos || []).forEach(function (row) {
      var w = row.w;
      var anchorMs = custDateMs(w.planAnchor);
      var count = parseInt(w.visitCount, 10) || 0;
      if (anchorMs && count > 1) {
        var step = (w.cadence === "weekly" ? 7 : 14) * 86400000;
        var tMs = custDateMs(w.scheduledFor);
        var tod = tMs ? (tMs - anchorMs) % 86400000 : 0;
        for (var i = 0; i < count; i++) consider(anchorMs + i * step + tod, w);
      } else {
        ["scheduledFor", "scheduledDate", "serviceDate", "appointmentDate", "date"].forEach(function (f) { consider(custDateMs(w[f]), w); });
      }
    });
    return best;
  }
  function loadCustProfileExtras(id, d) {
    custLinkedWOs(id, d).then(function (wos) {
      var next = custNextVisit(wos);
      var nxEl = $("cust-strip-next");
      if (nxEl) nxEl.textContent = next ? new Date(next.ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "Not scheduled";
      var email = String(d.email || (/@/.test(d.contact || "") ? d.contact : "") || "").toLowerCase();
      var quotes = {}, qps = [];
      function qcollect(qs) { qs.forEach(function (doc) { quotes[doc.id] = doc.data(); }); }
      if (email) {
        qps.push(db.collection("customer_quotes").where("customerEmail", "==", email).limit(25).get().then(qcollect).catch(function () {}));
        qps.push(db.collection("customer_quotes").where("contact", "==", email).limit(25).get().then(qcollect).catch(function () {}));
      }
      wos.forEach(function (row) {
        qps.push(db.collection("customer_quotes").where("workOrderId", "==", row.id).limit(5).get().then(qcollect).catch(function () {}));
      });
      return Promise.all(qps).then(function () { return { wos: wos, next: next, quotes: Object.keys(quotes).map(function (q) { return quotes[q]; }) }; });
    }).then(function (ctx) {
      if (!ctx) return;
      var quotes = ctx.quotes.slice().sort(function (a, b) { return custDateMs(b.createdAt) - custDateMs(a.createdAt); });
      var signed = quotes.filter(function (q) { return q.status === "signed"; });
      var valEl = $("cust-strip-value"), valL = $("cust-strip-value-l");
      if (valEl) {
        if (signed.length) {
          valEl.textContent = "$" + signed.reduce(function (s, q) { return s + (Number(q.total) || 0); }, 0).toLocaleString();
          if (valL) valL.textContent = "Contract value";
        } else if (quotes.length) {
          valEl.textContent = "$" + (Number(quotes[0].total) || 0).toLocaleString();
          if (valL) valL.textContent = "Quoted (unsigned)";
        } else { valEl.textContent = "No quote yet"; if (valL) valL.textContent = "Value"; }
      }
      var planBox = $("cust-plan");
      if (planBox) {
        var rows = [];
        var planWO = ctx.wos.map(function (r) { return r.w; }).filter(function (w) { return w.planAnchor || w.cadence; })[0];
        if (planWO) {
          rows.push('<div class="cust-kv"><span>Plan</span><strong>' + esc((planWO.cadence === "weekly" ? "Weekly" : "Biweekly") + " · " + (planWO.visitCount || "?") + " visits") + "</strong></div>");
          rows.push('<div class="cust-kv"><span>Crew</span><strong>' + esc(planWO.vendorBusiness || "Not assigned") + "</strong></div>");
        }
        if (quotes.length) {
          var q0 = quotes[0];
          rows.push('<div class="cust-kv"><span>Latest quote</span><strong>' + esc((q0.service || "Service") + " · $" + (Number(q0.total) || 0).toLocaleString()) + "</strong></div>");
          rows.push('<div class="cust-kv"><span>Quote status</span><strong>' + esc(q0.status === "signed" ? "Signed" : "Awaiting signature") + "</strong></div>");
        }
        if (signed.length) {
          var sq = signed[0];
          var sqMs = custDateMs(sq.signedAt);
          rows.push('<div class="cust-kv"><span>Signed</span><strong>' + esc((sq.signedName || "Customer") + (sqMs ? " \u00b7 " + new Date(sqMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "")) + "</strong></div>");
          if (sq.agreementDriveUrl) rows.push('<div class="cust-kv"><span>Agreement</span><strong><a href="' + esc(sq.agreementDriveUrl) + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">View signed agreement (PDF)</a></strong></div>');
        }
        if (ctx.next) rows.push('<div class="cust-kv"><span>Next visit</span><strong>' + esc(new Date(ctx.next.ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })) + "</strong></div>");
        planBox.innerHTML = rows.length ? rows.join("") : '<p class="sr-faint">No plan on file yet. When a quote is built and signed, the plan shows up here.</p>';
      }
      var tlBox = $("cust-timeline");
      if (tlBox) {
        var evs = [];
        ctx.wos.forEach(function (row) {
          var w = row.w, cms = custDateMs(w.createdAt);
          if (cms) evs.push({ ms: cms, icon: "\U0001F6E0", text: "Work order created: " + (w.title || "Job") + " · " + String(w.status || "").replace(/_/g, " ") });
          var sms = custDateMs(w.scheduledFor);
          if (sms) evs.push({ ms: sms, icon: "\U0001F4C5", text: "Visit scheduled: " + (w.title || "Service") + (w.vendorBusiness ? " · " + w.vendorBusiness : "") });
        });
        quotes.forEach(function (q) {
          var cms2 = custDateMs(q.createdAt);
          if (cms2) evs.push({ ms: cms2, icon: "\U0001F4C4", text: "Quote sent: " + (q.service || "Service") + " · $" + (Number(q.total) || 0).toLocaleString() });
          var sms2 = custDateMs(q.signedAt);
          if (sms2) evs.push({ ms: sms2, icon: "\u270D", text: "Quote signed by " + (q.signedName || "customer") });
        });
        var keys = ["customer:" + id];
        if (d.leadId) keys.push("hot_lead:" + d.leadId);
        ctx.wos.forEach(function (row) { keys.push("work_order:" + row.id); });
        var nps = keys.map(function (k) {
          return db.collection("item_notes").where("entityKey", "==", k).limit(50).get().then(function (qs) {
            qs.forEach(function (doc) {
              var n = doc.data(), nms = custDateMs(n.createdAt);
              if (nms) evs.push({ ms: nms, icon: n.kind === "call" ? "\U0001F4DE" : "\U0001F4DD", text: (n.kind === "call" ? "Call" + (n.outcome ? " (" + outcomeLabel(n.outcome) + ")" : "") + ": " : "Note: ") + String(n.text || "").slice(0, 140) });
            });
          }).catch(function () {});
        });
        Promise.all(nps).then(function () { custTlEvs = evs; renderCustTimeline(); });
      }
    }).catch(function () {});
  }
  function loadCustOpenTasks(id, d) {
    var box = $("cust-tasks");
    if (!box) return;
    var found = {};
    function collect(qs) { qs.forEach(function (doc) { found[doc.id] = doc.data(); }); }
    var ps = [db.collection("tasks").where("entityId", "==", id).limit(50).get().then(collect).catch(function () {})];
    if (d.leadId) ps.push(db.collection("tasks").where("entityId", "==", d.leadId).limit(50).get().then(collect).catch(function () {}));
    Promise.all(ps).then(function () {
      var all = Object.keys(found).map(function (tid) { return { id: tid, t: found[tid] }; });
      var rows = all.filter(function (r) { return !r.t.done; });
      rows.sort(function (a, b) {
        if (custTaskSort === "due-desc") return String(b.t.dueDate || "0000") < String(a.t.dueDate || "0000") ? -1 : 1;
        if (custTaskSort === "az") return String(a.t.title || "").toLowerCase() < String(b.t.title || "").toLowerCase() ? -1 : 1;
        if (custTaskSort === "new") return custDateMs(b.t.createdAt) - custDateMs(a.t.createdAt);
        return String(a.t.dueDate || "9999") < String(b.t.dueDate || "9999") ? -1 : 1;
      });
      var doneRows = all.filter(function (r) { return r.t.done; });
      doneRows.sort(function (a, b) { return custDateMs(b.t.doneAt) - custDateMs(a.t.doneAt); });
      var todayKey = localDateKey(new Date());
      function taskMeta(t) {
        var bits = [];
        if (t.dueDate) bits.push("Due " + fmtFollowDate(t.dueDate) + (t.dueTime ? " \u00b7 " + fmtTaskTime(t.dueTime) : ""));
        if (t.assigneeEmail) bits.push(pgTaskAssigneeLabel(t));
        return bits.join(" \u00b7 ");
      }
      var html = "";
      if (!rows.length) html += '<p class="sr-faint">No open tasks for this customer.</p>';
      html += rows.map(function (r) {
        var overdue = r.t.dueDate && r.t.dueDate < todayKey;
        return '<div class="cust-task-row"><div class="cust-task-tx"><strong>' + esc(r.t.title || "Task") + "</strong>" +
          (taskMeta(r.t) ? "<small" + (overdue ? ' style="color:#d66"' : "") + ">" + esc(taskMeta(r.t)) + (overdue ? " \u00b7 overdue" : "") + "</small>" : "") + '</div>' +
          '<button type="button" class="mini" data-taskdone="' + r.id + '">\u2713 Done</button></div>';
      }).join("");
      if (doneRows.length) {
        html += '<p class="sr-faint" style="margin:10px 0 2px">Recently done</p>' + doneRows.slice(0, 2).map(function (r) {
          var dms = custDateMs(r.t.doneAt);
          return '<div class="cust-task-row" style="opacity:.65"><div class="cust-task-tx"><strong style="text-decoration:line-through">' + esc(r.t.title || "Task") + "</strong>" +
            "<small>" + (dms ? "Done " + esc(fmtFollowDate(localDateKey(new Date(dms)))) : "Done") + "</small>" + '</div><span class="pill p-done">Done</span></div>';
        }).join("");
      }
      box.innerHTML = html;
      box.querySelectorAll("[data-taskdone]").forEach(function (b) {
        b.addEventListener("click", function () { setTimeout(function () { if (custId) loadCustOpenTasks(custId, custData || {}); }, 700); });
      });
    });
  }

  function logCustomerService() {
    if (!custId) return;
    var err = $("cust-svc-err"); err.classList.add("hidden");
    var key = $("cust-svc-date").value || localDateKey(new Date());
    var label = $("cust-svc-label").value.trim() || "Service visit";
    var d = custData || {};
    var btn = $("cust-svc-btn"); btn.disabled = true;
    db.collection("customers").doc(custId).update({
      lastServiceAt: firebase.firestore.Timestamp.fromDate(new Date(key + "T12:00:00")),
      lastServiceLabel: label,
      totalJobs: (d.totalJobs || 0) + 1,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      return saveItemNote({
        entityType: "customer", entityId: custId, entityLabel: d.name || "Customer",
        kind: "note", outcome: "", text: "Service logged: " + label + " on " + fmtFollowDate(key),
        followUpOn: null
      });
    }).then(function () {
      logActivity("Logged a service for customer " + (d.name || ""));
      loadCustomers();
      openCustomer(custId);
    }).catch(function (e) {
      err.textContent = "Could not log: " + (e.message || e);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }
  function saveCustomerNote() {
    if (!custId) return;
    var text = $("cnText").value.trim();
    var err = $("cnErr"); err.classList.add("hidden");
    if (!custOutcome && !text) { err.textContent = "Pick a call outcome or write a note first."; err.classList.remove("hidden"); return; }
    var btn = $("cnSave"); btn.disabled = true;
    var label = (custData && custData.name) || "Customer";
    saveItemNote({
      entityType: "customer", entityId: custId, entityLabel: label,
      kind: custOutcome ? "call" : "note", outcome: custOutcome, text: text,
      followUpOn: $("cnFollow").value || null
    }).then(function () {
      logActivity((custOutcome ? "Logged a call (" + outcomeLabel(custOutcome) + ") with customer " : "Added a note on customer ") + label);
      $("cnOk").classList.remove("hidden");
      $("cnText").value = ""; $("cnFollow").value = "";
      custOutcome = "";
      document.querySelectorAll("[data-custoutcome]").forEach(function (x) { x.classList.remove("active"); });
      loadItemNotes("customer", custId, $("cnNotes"));
      loadFollowUps();
    }).catch(function (e) {
      err.textContent = "Could not save: " + (e.message || e);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }

  /* ---------- Work order notes modal ---------- */
  var woNoteId = null, woNoteTitle = "";
  function openWorkOrderNotes(id) {
    db.collection("work_orders").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var w = snap.data();
      woNoteId = id; woNoteTitle = w.title || "Work order";
      var woToolsEntity = { label: woNoteTitle, area: w.area || "", address: w.address || "", service: w.category || "" };
      var box = $("woNoteBody");
      box.innerHTML = '<h3 id="woNoteTitle">' + esc(woNoteTitle) + "</h3>" +
        '<p class="sr-meta">' + pill(w.status) + " <span>" + esc(w.area || "") + " · " + esc(w.vendorBusiness || "broadcast") + "</span></p>" +
        ((w.area || w.address) ? pgJobToolsHtml(woToolsEntity) : "") +
        (w.details ? '<div class="sr-card"><h4>Job details</h4><p>' + esc(w.details).replace(/\n/g, "<br>") + "</p></div>" : "") +
        (w.kind === "quote_request" ? '<div class="sr-card"><h4>Send to vendors</h4><p class="sr-faint" style="margin-bottom:8px">Sends this work order out for vendor pricing (the background watch emails and pushes the vendor). Converting the lead did not send it.</p>' + woSendHtml(id, w) + "</div>" : "") +
        '<div class="sr-card"><h4>Notes & updates</h4>' +
        '<div class="note-form"><label>New note<textarea id="wonText" rows="3" placeholder="What happened, what is next…"></textarea></label>' +
        '<label>Follow-up date (optional)<input type="date" id="wonFollow"></label></div>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="wonSave" type="button">Save note</button></div>' +
        '<p class="aok hidden" id="wonOk" style="margin-top:10px">Note saved.</p>' +
        '<p class="aerr hidden" id="wonErr" style="margin-top:10px"></p>' +
        '<div class="sr-comments" id="wonNotes" style="margin-top:14px"></div></div>';
      $("woNoteModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
      loadItemNotes("work_order", id, $("wonNotes"));
      $("wonSave").addEventListener("click", saveWorkOrderNote);
      if (w.area || w.address) wireJobTools(box, woToolsEntity, function () { closeWorkOrderNotes(); });
    });
  }
  function closeWorkOrderNotes() {
    $("woNoteModal").classList.add("hidden");
    document.body.style.overflow = "";
    woNoteId = null; woNoteTitle = "";
  }
  function saveWorkOrderNote() {
    if (!woNoteId) return;
    var text = $("wonText").value.trim();
    var err = $("wonErr"); err.classList.add("hidden");
    if (!text) { err.textContent = "Write the note first."; err.classList.remove("hidden"); return; }
    var btn = $("wonSave"); btn.disabled = true;
    saveItemNote({
      entityType: "work_order", entityId: woNoteId, entityLabel: woNoteTitle,
      kind: "note", outcome: "", text: text,
      followUpOn: $("wonFollow").value || null
    }).then(function () {
      logActivity("Added a note to work order: " + woNoteTitle);
      $("wonOk").classList.remove("hidden");
      $("wonText").value = ""; $("wonFollow").value = "";
      loadItemNotes("work_order", woNoteId, $("wonNotes"));
      loadFollowUps();
    }).catch(function (e) {
      err.textContent = "Could not save: " + (e.message || e);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }

  /* ---------- Job tools: "Vendors for this job" + globe (Edwin, 2026-10-15) ---------- */
  // Shared by the hot-lead detail/notes modal and the work-order notes
  // modal. Given the entity being evaluated ({label, area, address,
  // service}), the tools row offers: (1) a vendor browser window listing
  // every approved/pending vendor as a designed card — searchable,
  // filterable by service category, sortable, badged for area/service
  // matches, with each vendor's distance from the job — and (2) a globe
  // button that opens the shared vendor Earth project with the job
  // address copied for paste-search (Earth projects cannot deep-link an
  // address).
  var PG_EARTH_URL = "https://earth.google.com/earth/d/1YGd8Uu_nKUiL_gTt5ErZoBf_ToK4e9--";
  var pgVmUnderlyingClose = null;

  function pgNorm(s) { return String(s == null ? "" : s).toLowerCase().trim(); }
  function pgAreaCandidates(entity) {
    var out = [];
    function push(x) {
      var n = pgNorm(x);
      if (n && out.indexOf(n) < 0) out.push(n);
    }
    push(entity.area);
    if (entity.address) {
      var parts = String(entity.address).split(",").map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length >= 2) push(parts[1].replace(/\s+\b[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?$/, "").trim());
    }
    return out;
  }
  function pgAreaHit(vendorAreas, candidates) {
    var hit = false;
    (vendorAreas || []).forEach(function (va) {
      var n = pgNorm(va);
      if (!n) return;
      candidates.forEach(function (c) {
        if (c.length < 3) return;
        if (n.indexOf(c) >= 0 || c.indexOf(n) >= 0) hit = true;
      });
    });
    return hit;
  }
  function pgServiceHit(vendorServices, serviceText) {
    var st = pgNorm(serviceText);
    if (!st) return false;
    var hit = false;
    (vendorServices || []).forEach(function (s) {
      var vs = pgNorm(s);
      if (vs && (vs.indexOf(st) >= 0 || st.indexOf(vs) >= 0)) hit = true;
    });
    return hit;
  }

  function pgTsMs(ts) {
    if (!ts) return 0;
    try {
      if (ts.toDate) return ts.toDate().getTime();
      if (ts.seconds) return ts.seconds * 1000;
      var t = new Date(ts).getTime();
      return isNaN(t) ? 0 : t;
    } catch (e) { return 0; }
  }
  function pgCrewOf(v) { return v.crewSize || v.crew || ""; }
  function pgOriginQuery(entity) {
    var addr = String((entity && entity.address) || "").trim();
    if (addr) return addr;
    var area = String((entity && entity.area) || "").trim();
    return area ? area + ", FL" : "";
  }
  function pgVendorPointQuery(v) {
    var addr = String((v && v.address) || "").trim();
    if (addr) return addr;
    var areas = (v && v.areas) || [];
    for (var i = 0; i < areas.length; i++) {
      var a = String(areas[i] || "").trim();
      if (a) return a + ", FL";
    }
    return "";
  }
  function pgCleanAddr(q) {
    return String(q || "").replace(/,?\s*(unit|apt\.?|apartment|suite|ste\.?|#)\s*[A-Za-z0-9-]+/gi, "").replace(/\s+,/g, ",").replace(/,\s*,/g, ", ").trim();
  }
  // Tries the full query, then the unit-stripped query, then the bare area,
  // so addresses with apartment/unit parts still resolve to a point.
  function pgGeocodeLoose(q, areaQ) {
    return pgGeocode(q).then(function (pt) {
      if (pt) return pt;
      var cleaned = pgCleanAddr(q);
      if (cleaned && cleaned !== q) return pgGeocode(cleaned).then(function (pt2) { return pt2 || (areaQ ? pgGeocode(areaQ) : null); });
      return areaQ ? pgGeocode(areaQ) : null;
    });
  }

  // Loads EVERY vendor who could take work (approved or pending; archived
  // and rejected stay out) and annotates each row with how it matches the
  // job: covers the area, does the service. Distance back to the job is
  // filled in later by the geocoder (row.dist; row.distState goes
  // "idle" -> "busy" -> "done").
  function pgLoadVendorRows(entity) {
    entity = entity || {};
    var candidates = pgAreaCandidates(entity);
    return db.collection("vendors").limit(100).get().then(function (qs) {
      var rows = [];
      qs.forEach(function (doc) {
        var v = doc.data();
        var st = vStatus(v);
        if (st !== "approved" && st !== "pending") return;
        rows.push({
          id: doc.id, v: v, status: st,
          areaMatch: !!candidates.length && pgAreaHit(v.areas, candidates),
          serviceMatch: pgServiceHit(v.services, entity.service),
          dist: null, distState: "idle", createdMs: pgTsMs(v.createdAt)
        });
      });
      return rows;
    });
  }

  // v24 contract kept for compatibility: approved vendors covering the
  // job's area, service matches first. The browser below works off
  // pgLoadVendorRows directly.
  window.pgVendorMatch = function (entity) {
    return pgLoadVendorRows(entity).then(function (rows) {
      return rows.filter(function (r) { return r.status === "approved" && r.areaMatch; })
        .sort(function (a, b) { return (b.serviceMatch ? 1 : 0) - (a.serviceMatch ? 1 : 0); });
    });
  };

  /* ----- Geocoding (Nominatim) + Haversine, cached ----- */
  var PG_GEO_LS_KEY = "pg_geo_cache_v1";
  var pgGeoMem = null;
  function pgGeoCacheLoad() {
    if (pgGeoMem) return pgGeoMem;
    pgGeoMem = {};
    try {
      var raw = localStorage.getItem(PG_GEO_LS_KEY);
      if (raw) { var parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") pgGeoMem = parsed; }
    } catch (e) {}
    return pgGeoMem;
  }
  function pgGeoCacheSave() {
    try { localStorage.setItem(PG_GEO_LS_KEY, JSON.stringify(pgGeoMem)); } catch (e) {}
  }
  function pgGeoKey(q) { return String(q || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function pgGeoCached(query) {
    var cache = pgGeoCacheLoad(), key = pgGeoKey(query);
    return key && Object.prototype.hasOwnProperty.call(cache, key);
  }
  // Resolves to [lat, lon] or null. Hits (and misses) are cached in
  // localStorage keyed by the normalized query, so repeat opens are
  // instant; network failures are NOT cached, so a later open can retry.
  function pgGeocode(query) {
    var key = pgGeoKey(query);
    if (!key) return Promise.resolve(null);
    var cache = pgGeoCacheLoad();
    if (Object.prototype.hasOwnProperty.call(cache, key)) return Promise.resolve(cache[key]);
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("geocode " + res.status);
      return res.json();
    }).then(function (arr) {
      var pt = null;
      if (arr && arr.length && isFinite(+arr[0].lat) && isFinite(+arr[0].lon)) pt = [+arr[0].lat, +arr[0].lon];
      cache[key] = pt; pgGeoCacheSave();
      return pt;
    }).catch(function () { return null; });
  }
  function pgHaversineMi(a, b) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  function pgDelay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pgJobToolsHtml(entity) {
    var target = entity.address || entity.area || "";
    return '<div class="sr-actions" style="margin:2px 0 12px">' +
      '<button class="mini" type="button" data-pgvendors="1">Vendors for this job</button>' +
      '<button class="mini" type="button" data-pgglobe="1"' + (target ? ' title="' + esc(target) + '"' : "") + ">🌐 View on globe</button></div>";
  }
  function wireJobTools(scope, entity, closeUnderlyingFn) {
    if (!scope) return;
    var vb = scope.querySelector("[data-pgvendors]");
    if (vb) vb.addEventListener("click", function () {
      pgVmUnderlyingClose = closeUnderlyingFn || null;
      window.openJobVendorTools(entity);
    });
    var gb = scope.querySelector("[data-pgglobe]");
    if (gb) gb.addEventListener("click", function () { pgOpenGlobe(entity); });
  }
  function pgOpenGlobe(entity) {
    var target = String((entity && (entity.address || entity.area)) || "").trim();
    if (target) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          var p = navigator.clipboard.writeText(target);
          if (p && p.catch) p.catch(function () {});
        }
      } catch (e) {}
    }
    window.open(PG_EARTH_URL, "_blank", "noopener");
  }

  function ensurePgVmModal() {
    ensurePgVbStyles();
    if ($("pgVmModal")) return;
    var ov = document.createElement("div");
    ov.className = "modal-overlay hidden";
    ov.id = "pgVmModal";
    ov.innerHTML = '<div class="modal sr-modal" role="dialog" aria-modal="true" aria-labelledby="pgVmTitle">' +
      '<button class="modal-close" id="pgVmClose" aria-label="Close">×</button><div id="pgVmBody"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) closePgVmModal(); });
    $("pgVmClose").addEventListener("click", closePgVmModal);
  }
  function closePgVmModal() {
    var m = $("pgVmModal");
    if (m) m.classList.add("hidden");
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePgVmModal();
  });

  /* ----- Vendor browser (v25): searchable, filterable, distance-aware ----- */
  // Replaces the v24 match list. Shows ALL approved + pending vendors as
  // designed cards, with live search, service-category chips, sorting
  // (closest / name / newest), match badges, and each vendor's distance
  // from the job geocoded in the background (never blocks the render).
  var pgVb = null; // {entity, rows, cats, search, cat, sort, origin, geoDone, seq}
  var pgVbStylesDone = false;

  function ensurePgVbStyles() {
    if (pgVbStylesDone) return;
    pgVbStylesDone = true;
    var s = document.createElement("style");
    s.id = "pgVbStyles";
    s.textContent =
      "#pgVmModal .modal{width:min(920px,100%)}" +
      "#pgVmBody{padding:26px 30px 30px;overflow-y:auto;min-height:0;flex:1 1 auto}" +
      "#pgVmBody h3{padding:0}" +
      "@media (max-width:640px){#pgVmBody{padding:20px 16px 24px}}" +
      ".pgvb-ctx{display:flex;flex-wrap:wrap;gap:12px 30px;background:rgba(255,255,255,.03);border:1px solid var(--line-soft);border-radius:14px;padding:14px 18px;margin:4px 0 16px}" +
      ".pgvb-ctxi{min-width:0}" +
      ".pgvb-ctxi .k{display:block;font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--faint);margin-bottom:2px}" +
      ".pgvb-ctxi .v{font-weight:700;font-size:.95rem;color:var(--text)}" +
      ".pgvb-controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}" +
      ".pgvb-search{flex:1 1 230px;display:flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:0 16px;background:rgba(255,255,255,.04)}" +
      ".pgvb-search:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,162,75,.18)}" +
      ".pgvb-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:.92rem;padding:10px 0;outline:none}" +
      ".pgvb-sort{border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);color:var(--text);font:inherit;font-size:.88rem;padding:10px 14px;cursor:pointer}" +
      ".pgvb-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px}" +
      ".pgvb-chip{flex:0 0 auto;padding:7px 14px;border-radius:999px;border:1px solid var(--line-soft);background:transparent;color:var(--muted);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .15s ease}" +
      ".pgvb-chip:hover{border-color:var(--gold);color:var(--gold-bright)}" +
      ".pgvb-chip.active{background:linear-gradient(135deg,#e8bd4e,#c9982f);color:#241a0c;border-color:transparent}" +
      ".pgvb-chip .cnt{opacity:.6;font-weight:400}" +
      ".pgvb-status{color:var(--faint);font-size:.82rem;margin:4px 0 12px}" +
      ".pgvb-foot{color:var(--faint);font-size:.8rem;margin:12px 0 0}" +
      ".pgvb-empty{border:1px dashed var(--line);border-radius:14px;padding:26px 20px;text-align:center;display:grid;gap:6px;justify-items:center;color:var(--muted)}" +
      ".pgvb-empty strong{color:var(--text);font-size:1rem}" +
      ".pgvb-empty span{font-size:.86rem}" +
      ".pgvb-empty .mini{margin-top:8px}" +
      ".pgvb-card{display:flex;gap:14px;align-items:flex-start;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015)),var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:10px}" +
      ".pgvb-card.both{box-shadow:inset 3px 0 0 var(--gold)}" +
      ".pgvb-av{flex:0 0 auto;width:52px;height:52px;border-radius:50%;border:2px solid var(--gold);background:radial-gradient(circle at 32% 28%,rgba(245,197,66,.38),rgba(201,162,39,.10) 72%);color:var(--gold-bright);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;letter-spacing:.02em}" +
      ".pgvb-main{flex:1;min-width:0}" +
      ".pgvb-toprow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".pgvb-biz{font-weight:800;font-size:1rem;color:var(--text);line-height:1.25;overflow-wrap:anywhere}" +
      ".pgvb-contact{color:var(--muted);font-size:.84rem;margin-top:2px}" +
      ".pgvb-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}" +
      ".pgvb-badge{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:3px 10px;background:rgba(201,162,39,.16);color:var(--gold-bright);border:1px solid rgba(201,162,39,.38)}" +
      ".pgvb-info{color:var(--muted);font-size:.85rem;margin-top:8px;display:flex;gap:4px 18px;flex-wrap:wrap}" +
      ".pgvb-info a{color:var(--gold-bright);text-decoration:none;font-weight:700}" +
      ".pgvb-svcs{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}" +
      ".pgvb-svc{font-size:.72rem;border:1px solid var(--line-soft);border-radius:999px;padding:3px 9px;color:var(--muted);background:rgba(255,255,255,.03)}" +
      ".pgvb-svc.more{color:var(--gold-bright);border-color:rgba(201,162,39,.38)}" +
      ".pgvb-areas{color:var(--faint);font-size:.78rem;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".pgvb-side{flex:0 0 auto;min-width:94px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;text-align:right}" +
      ".pgvb-dist .n{font-size:1.5rem;font-weight:800;color:var(--text);line-height:1;font-variant-numeric:tabular-nums}" +
      ".pgvb-dist .n small{font-size:.78rem;font-weight:700;color:var(--muted)}" +
      ".pgvb-dist .c{font-size:.62rem;text-transform:uppercase;letter-spacing:.12em;color:var(--faint);margin-top:3px}" +
      ".pgvb-dist.pend .n{color:var(--faint)}" +
      "@media (max-width:560px){.pgvb-card{flex-wrap:wrap}.pgvb-side{flex-direction:row;align-items:center;justify-content:space-between;width:100%;text-align:left}}" +
      ":root.pg-light .pgvb-card{background:#ffffff;border-color:#e7e4da;box-shadow:0 2px 12px rgba(20,20,20,.05)}" +
      ":root.pg-light .pgvb-ctx{background:#f6f5f1;border-color:#e5e2d8}" +
      ":root.pg-light .pgvb-search,:root.pg-light .pgvb-sort{background:#ffffff;border-color:#d8d4c8;color:#1b1b1b}" +
      ":root.pg-light .pgvb-search input{color:#1b1b1b}" +
      ":root.pg-light .pgvb-chip{background:#ffffff}" +
      ":root.pg-light .pgvb-svc{background:#f6f5f1}" +
      ":root.pg-light .pgvb-empty{border-color:#d8d4c8}";
    document.head.appendChild(s);
  }

  function pgInitials(name) {
    var words = String(name || "Vendor").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    var first = words[0] || "V";
    var ini = first.charAt(0) + (words.length > 1 ? words[1].charAt(0) : (first.charAt(1) || ""));
    return ini.toUpperCase();
  }
  function pgVbCategories(rows) {
    var map = {};
    rows.forEach(function (r) {
      (r.v.services || []).forEach(function (sv) {
        var label = String(sv || "").replace(/\s+/g, " ").trim();
        if (!label) return;
        var key = label.toLowerCase();
        if (!map[key]) map[key] = { label: label, count: 0 };
        map[key].count++;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return b.count - a.count || a.label.localeCompare(b.label);
    });
  }
  function pgRowHasCat(row, catLabel) {
    if (!catLabel) return true;
    var key = catLabel.toLowerCase();
    return (row.v.services || []).some(function (sv) {
      return String(sv || "").replace(/\s+/g, " ").trim().toLowerCase() === key;
    });
  }
  function pgVbCounts(state) {
    var cover = 0, svc = 0;
    state.rows.forEach(function (r) { if (r.areaMatch) cover++; if (r.serviceMatch) svc++; });
    return { total: state.rows.length, cover: cover, svc: svc };
  }
  function pgVbUpdateStatus(state) {
    var el = $("pgVbStatus");
    if (!el || pgVb !== state) return;
    var c = pgVbCounts(state);
    var txt = c.total + (c.total === 1 ? " vendor" : " vendors") +
      " · " + c.cover + " cover this area · " + c.svc + " do this service";
    if (!state.geoDone && pgOriginQuery(state.entity)) txt += " · measuring distances…";
    el.textContent = txt;
  }
  function pgVbVisibleRows(state) {
    var q = pgNorm(state.search);
    var rows = state.rows.filter(function (r) {
      if (!pgRowHasCat(r, state.cat)) return false;
      if (!q) return true;
      var v = r.v;
      var hay = pgNorm([v.business, v.name, v.phone, v.address,
        (v.services || []).join(" "), (v.areas || []).join(" ")].join(" "));
      return hay.indexOf(q) >= 0;
    });
    function byName(a, b) { return pgNorm(a.v.business || a.v.name).localeCompare(pgNorm(b.v.business || b.v.name)); }
    if (state.sort === "name") rows.sort(byName);
    else if (state.sort === "newest") rows.sort(function (a, b) { return b.createdMs - a.createdMs || byName(a, b); });
    else rows.sort(function (a, b) { // closest first; unknown distance last
      var da = a.dist == null ? Infinity : a.dist;
      var db = b.dist == null ? Infinity : b.dist;
      if (da !== db) return da - db;
      var ma = (a.areaMatch ? 1 : 0) + (a.serviceMatch ? 1 : 0);
      var mb = (b.areaMatch ? 1 : 0) + (b.serviceMatch ? 1 : 0);
      if (ma !== mb) return mb - ma;
      return byName(a, b);
    });
    return rows;
  }
  function pgVbDistHtml(row) {
    if (row.dist != null) return '<div class="n">' + row.dist.toFixed(1) + " <small>mi</small></div>" + '<div class="c">from job</div>';
    if (row.distState === "done") return '<div class="n">—</div><div class="c">from job</div>';
    return '<div class="n">…</div><div class="c">measuring</div>';
  }
  function pgVbPaintDist(row) {
    var el = document.querySelector('[data-pgvb-dist="' + row.id + '"]');
    if (!el) return;
    el.innerHTML = pgVbDistHtml(row);
    el.classList.toggle("pend", row.dist == null && row.distState !== "done");
  }
  function pgVbCardHtml(row) {
    var v = row.v;
    var biz = v.business || v.name || "Vendor";
    var crew = pgCrewOf(v);
    var digits = String(v.phone || "").replace(/\D/g, "");
    var svcs = (v.services || []).map(function (sv) { return String(sv || "").replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var shown = svcs.slice(0, 4), extra = svcs.length - shown.length;
    var areas = (v.areas || []).filter(Boolean);
    var badges = "";
    if (row.areaMatch) badges += '<span class="pgvb-badge">Covers this area</span>';
    if (row.serviceMatch) badges += '<span class="pgvb-badge">Does this service</span>';
    var info = "";
    if (crew) info += "<span>Crew: " + esc(crew) + "</span>";
    var phoneDisp = v.phone;
    if (digits.length === 10) phoneDisp = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
    else if (digits.length === 11 && digits.charAt(0) === "1") phoneDisp = "(" + digits.slice(1, 4) + ") " + digits.slice(4, 7) + "-" + digits.slice(7);
    if (v.phone) info += '<span>Call: <a href="tel:' + esc(digits) + '">' + esc(phoneDisp) + "</a></span>";
    if (v.equipment) info += "<span>" + esc(v.equipment) + "</span>";
    return '<div class="pgvb-card' + (row.areaMatch && row.serviceMatch ? " both" : "") + '">' +
      '<div class="pgvb-av">' + esc(pgInitials(biz)) + "</div>" +
      '<div class="pgvb-main">' +
        '<div class="pgvb-toprow"><span class="pgvb-biz">' + esc(biz) + "</span>" + pill(row.status) + "</div>" +
        (v.name && v.name !== biz ? '<div class="pgvb-contact">' + esc(v.name) + "</div>" : "") +
        (badges ? '<div class="pgvb-badges">' + badges + "</div>" : "") +
        (info ? '<div class="pgvb-info">' + info + "</div>" : "") +
        (shown.length ? '<div class="pgvb-svcs">' + shown.map(function (sv) { return '<span class="pgvb-svc">' + esc(sv) + "</span>"; }).join("") +
          (extra > 0 ? '<span class="pgvb-svc more">+' + extra + " more</span>" : "") + "</div>" : "") +
        (areas.length ? '<div class="pgvb-areas" title="' + esc(areas.join(", ")) + '">Areas: ' + esc(areas.join(", ")) + "</div>" : "") +
      "</div>" +
      '<div class="pgvb-side"><div class="pgvb-dist' + (row.dist == null && row.distState !== "done" ? " pend" : "") + '" data-pgvb-dist="' + row.id + '">' + pgVbDistHtml(row) + "</div>" +
      '<button class="mini" type="button" data-pgvmopen="' + row.id + '">Open</button></div></div>';
  }
  function pgVbRenderChips(state) {
    var box = $("pgVbChips");
    if (!box || pgVb !== state) return;
    var html = '<button type="button" class="pgvb-chip' + (!state.cat ? " active" : "") + '" data-pgvbcat="">All</button>';
    html += state.cats.map(function (c) {
      return '<button type="button" class="pgvb-chip' + (state.cat === c.label ? " active" : "") + '" data-pgvbcat="' + esc(c.label) + '">' + esc(c.label) + ' <span class="cnt">' + c.count + "</span></button>";
    }).join("");
    box.innerHTML = html;
    box.querySelectorAll("[data-pgvbcat]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.cat = b.getAttribute("data-pgvbcat") || "";
        pgVbRenderChips(state);
        pgVbRenderList(state);
      });
    });
  }
  function pgVbRenderList(state) {
    var list = $("pgVbList");
    if (!list || pgVb !== state) return;
    var rows = pgVbVisibleRows(state);
    var foot = $("pgVbFoot");
    if (!state.rows.length) {
      list.innerHTML = '<div class="pgvb-empty"><strong>No vendors on file yet.</strong><span>When a vendor registers, they show up here automatically.</span></div>';
    } else if (!rows.length) {
      list.innerHTML = '<div class="pgvb-empty"><strong>No vendors match</strong><span>Try a different search or category.</span>' +
        '<button class="mini" type="button" id="pgVbClear">Clear filters</button></div>';
      var c = $("pgVbClear");
      if (c) c.addEventListener("click", function () {
        state.search = ""; state.cat = "";
        var si = $("pgVbSearch"); if (si) si.value = "";
        pgVbRenderChips(state); pgVbRenderList(state);
      });
    } else {
      list.innerHTML = rows.map(pgVbCardHtml).join("");
      list.querySelectorAll("[data-pgvmopen]").forEach(function (b) {
        b.addEventListener("click", function () {
          var vid = b.getAttribute("data-pgvmopen");
          closePgVmModal();
          if (pgVmUnderlyingClose) { var f = pgVmUnderlyingClose; pgVmUnderlyingClose = null; f(); }
          openVendor(vid);
        });
      });
    }
    if (foot) foot.textContent = state.rows.length
      ? "Showing " + rows.length + " of " + state.rows.length + (state.rows.length === 1 ? " vendor" : " vendors")
      : "";
  }
  function pgVbDistUpdated(state, row) {
    if (pgVb !== state) return;
    if (state.sort === "closest") pgVbRenderList(state);
    else pgVbPaintDist(row);
  }
  // Geocodes the job origin, then each vendor's point, sequentially and
  // cache-first (a short pause before uncached lookups keeps Nominatim
  // happy). Distances paint in as they land; nothing here blocks render.
  function pgVbGeocodeAll(state) {
    var originQ = pgOriginQuery(state.entity);
    if (!originQ) {
      state.rows.forEach(function (r) { r.distState = "done"; });
      state.geoDone = true;
      pgVbRenderList(state);
      return;
    }
    pgGeocode(originQ).then(function (origin) {
      if (pgVb !== state) return;
      state.origin = origin;
      var p = Promise.resolve();
      state.rows.forEach(function (row) {
        p = p.then(function () {
          if (pgVb !== state) return null;
          var q = pgVendorPointQuery(row.v);
          if (!q || !origin) { row.distState = "done"; row.dist = null; pgVbDistUpdated(state, row); return null; }
          row.distState = "busy"; pgVbPaintDist(row);
          var wait = pgGeoCached(q) ? 0 : 150;
          var areaQ = "";
          if (String(row.v.address || "").trim()) {
            var ars = row.v.areas || [];
            for (var ai = 0; ai < ars.length; ai++) { var av = String(ars[ai] || "").trim(); if (av) { areaQ = av + ", FL"; break; } }
          }
          return pgDelay(wait).then(function () { return pgGeocodeLoose(q, areaQ); }).then(function (pt) {
            row.distState = "done";
            row.dist = pt ? pgHaversineMi(origin, pt) : null;
            pgVbDistUpdated(state, row);
          });
        });
      });
      return p;
    }).then(function () {
      if (pgVb !== state) return;
      state.geoDone = true;
      pgVbUpdateStatus(state);
      if (state.sort === "closest") pgVbRenderList(state);
    }).catch(function () {});
  }

  window.openJobVendorTools = function (entity) {
    entity = entity || {};
    ensurePgVmModal();
    var hasOrigin = !!pgOriginQuery(entity);
    var prevSeq = pgVb ? pgVb.seq : 0;
    var state = pgVb = {
      entity: entity, rows: [], cats: [], search: "", cat: "",
      sort: hasOrigin ? "closest" : "name",
      origin: null, geoDone: !hasOrigin, seq: prevSeq + 1
    };
    var loc = entity.address || entity.area || "";
    $("pgVmBody").innerHTML =
      '<h3 id="pgVmTitle">Vendors for this job</h3>' +
      '<div class="pgvb-ctx">' +
        '<div class="pgvb-ctxi"><span class="k">Job</span><span class="v">' + esc(entity.label || "Job") + "</span></div>" +
        (entity.service ? '<div class="pgvb-ctxi"><span class="k">Service needed</span><span class="v">' + esc(entity.service) + "</span></div>" : "") +
        (loc ? '<div class="pgvb-ctxi"><span class="k">Location</span><span class="v">' + esc(loc) + "</span></div>" : "") +
      "</div>" +
      '<div class="pgvb-controls">' +
        '<label class="pgvb-search"><input type="search" id="pgVbSearch" placeholder="Search name, business, area, service…" autocomplete="off"></label>' +
        '<select class="pgvb-sort" id="pgVbSort" aria-label="Sort vendors">' +
          '<option value="closest"' + (state.sort === "closest" ? " selected" : "") + ">Closest first</option>" +
          '<option value="name"' + (state.sort === "name" ? " selected" : "") + ">Name A–Z</option>" +
          '<option value="newest"' + (state.sort === "newest" ? " selected" : "") + ">Newest first</option>" +
        "</select>" +
      "</div>" +
      '<div class="pgvb-chips" id="pgVbChips"></div>' +
      '<p class="pgvb-status" id="pgVbStatus">Loading vendors…</p>' +
      '<div id="pgVbList"><p class="sr-faint">Loading vendors…</p></div>' +
      '<p class="pgvb-foot" id="pgVbFoot"></p>';
    $("pgVmModal").classList.remove("hidden");
    $("pgVbSearch").addEventListener("input", function (e) { state.search = e.target.value; pgVbRenderList(state); });
    $("pgVbSort").addEventListener("change", function (e) { state.sort = e.target.value; pgVbRenderList(state); });
    pgLoadVendorRows(entity).then(function (rows) {
      if (pgVb !== state) return;
      state.rows = rows;
      state.cats = pgVbCategories(rows);
      pgVbRenderChips(state);
      pgVbUpdateStatus(state);
      pgVbRenderList(state);
      pgVbGeocodeAll(state);
    }).catch(function () {
      if (pgVb !== state) return;
      var list = $("pgVbList");
      if (list) list.innerHTML = '<p class="aerr">Could not load vendors. Try again.</p>';
      var st = $("pgVbStatus"); if (st) st.textContent = "";
    });
  };

  function loadReferrals() {
    var box = $("ad-ref-list");
    liveOn("refs", db.collection("referral_codes").orderBy("createdAt", "desc").limit(50), function (qs) {
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No referral codes yet.</p>'; return; }
      box.innerHTML = "";
      var done = 0, rows = [];
      qs.forEach(function (d) { rows.push({ id: d.id, r: d.data() }); });
      rows.forEach(function (item) {
        var r = item.r;
        db.collection("service_requests").where("referralCode", "==", r.code || "").get().then(function (uses) {
          var row = document.createElement("div"); row.className = "arow";
          var when = "";
          try { when = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleDateString() : ""; } catch (e) {}
          row.innerHTML = '<div class="grow"><strong>' + esc(r.code || "") + "</strong><small>" +
            esc(r.name || "") + (r.email ? " · " + esc(r.email) : "") + (when ? " · " + esc(when) : "") + "</small></div>" +
            '<span class="pill ' + (uses.size ? "p-acc" : "p-open") + '">' + uses.size + (uses.size === 1 ? " use" : " uses") + "</span>";
          box.appendChild(row);
        }).catch(function () {});
        done++;
      });
    }, function () {
      box.innerHTML = '<p style="color:var(--faint)">Couldn\'t load referral codes.</p>';
    });
  }

  // ---------- Vendor review ----------
  var vdId = null, vdData = null, vdOutcome = "";
  function vStatus(v) { return v.status || (v.verified ? "approved" : "pending"); }
  function openVendor(id) {
    db.collection("vendors").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      vdId = id; vdData = snap.data(); vdOutcome = "";
      renderVendorModal();
      $("vdModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
    });
  }
  function closeVendor() {
    $("vdModal").classList.add("hidden");
    document.body.style.overflow = "";
    vdId = null; vdData = null; vdOutcome = "";
  }
  function renderVendorModal() {
    var v = vdData, box = $("vdBody"), st = vStatus(v);
    function docLine(label, url, status) {
      if (url) return '<p><strong>' + label + ':</strong> <a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">View</a> (' + esc(status || "received") + ')</p>';
      return '<p><strong>' + label + ':</strong> <span style="color:var(--gold-bright)">not submitted yet</span></p>';
    }
    var h = '<h3 id="vdTitle">' + esc(v.business || "Vendor") + '</h3>' +
      '<p class="sr-meta">' + pill(st) + ' <span>registered ' + esc(v.createdAt && v.createdAt.toDate ? v.createdAt.toDate().toLocaleDateString() : "") + '</span></p>' +
      '<div class="sr-grid">' +
      '<div class="sr-card"><h4>Contact</h4>' +
      '<p><strong>' + esc(v.name || "-") + '</strong></p>' +
      (v.phone ? '<p>📞 <a href="tel:' + esc(String(v.phone).replace(/\D/g, "")) + '">' + esc(v.phone) + '</a></p>' : '') +
      (v.email ? '<p>✉️ <a href="mailto:' + esc(v.email) + '">' + esc(v.email) + '</a></p>' : '') +
      (v.address ? '<p>📍 ' + esc(v.address) + '</p>' : '') + '</div>' +
      '<div class="sr-card"><h4>Coverage</h4>' +
      '<p><strong>Services:</strong> ' + esc((v.services || []).join(", ") || "-") + '</p>' +
      '<p><strong>Areas:</strong> ' + esc((v.areas || []).join(", ") || "-") + '</p>' +
      '<p><strong>Crew size:</strong> ' + esc(v.crewSize || "-") + '</p>' +
      (v.equipment ? '<p><strong>Equipment:</strong> ' + esc(v.equipment) + '</p>' : '') + '</div></div>' +
      '<div class="sr-actions" style="margin-bottom:14px">' +
      '<button class="mini" id="vdCalBtn" type="button">Add to calendar</button></div>' +
      '<div class="sr-card"><h4>Documents</h4>' +
      docLine("W-9", v.w9Url, v.w9Status) +
      '<p><strong>Payout:</strong> ' + (v.payoutMethod === "zelle" ? "Zelle \u00b7 " + esc(v.payoutZelle || "") + (v.payoutName ? " (" + esc(v.payoutName) + ")" : "") : v.payoutMethod === "ach" ? "Bank transfer \u00b7 " + esc(v.payoutBankName || "") + " \u2026" + esc(String(v.payoutAccount || "").slice(-4)) + (v.payoutName ? " (" + esc(v.payoutName) + ")" : "") : v.payoutMethod === "check" ? "Check by mail \u00b7 " + esc(v.address || "") : '<span style="color:#e8a33d">not set yet, vendor completes it in their portal setup checklist</span>') + '</p>' +
      '<p><strong>Insurance:</strong> ' + esc(v.insured === "yes" ? "Carries general liability" : "Not currently insured") + '</p>' +
      (v.insured === "yes" ? docLine("Certificate of insurance", v.coiUrl, v.coiStatus) : '') + '</div>';
    if (isAdmin && st === "archived") {
      h += '<div class="sr-card"><h4>Registration status</h4>' +
        '<p style="color:var(--muted);font-size:.88rem;margin-bottom:12px">This vendor is archived, so they are hidden from the active vendor list. Their record, calls, and notes are kept.' +
        (v.archivedAt && v.archivedAt.toDate ? ' Archived ' + esc(v.archivedAt.toDate().toLocaleDateString()) + '.' : '') +
        (v.archivedBy ? ' Archived by ' + esc(v.archivedBy) + '.' : '') + '</p>' +
        '<div class="sr-actions">' +
        '<button class="btn btn-gold btn-sm" id="vd-restore" type="button">Restore vendor</button>' +
        '</div></div>';
    } else if (isAdmin) {
      h += '<div class="sr-card"><h4>Registration status</h4>' +
        '<p style="color:var(--muted);font-size:.88rem;margin-bottom:12px">Set the status when you have everything you need from them. They see this status on their dashboard.</p>' +
        '<div class="sr-actions">' +
        '<button class="btn btn-gold btn-sm" data-vstatus="approved" type="button">Approve</button>' +
        '<button class="btn btn-ghost btn-sm" data-vstatus="pending" type="button">Keep pending</button>' +
        '<button class="btn btn-ghost btn-sm" data-vstatus="rejected" type="button" style="border-color:#a33;color:#e88">Reject</button>' +
        '<button class="btn btn-ghost btn-sm" id="vd-archive" type="button">Archive</button>' +
        '<button class="btn btn-ghost btn-sm" id="vd-delete" type="button" style="border-color:#a33;color:#e88">Delete</button>' +
        '</div><p class="aok hidden" id="vd-ok" style="margin-top:10px">Status saved.</p></div>';
    } else {
      h += '<div class="sr-card"><h4>Registration status</h4>' +
        '<p>Current status: <strong>' + esc(st) + '</strong></p>' +
        '<p style="color:var(--muted);font-size:.88rem">Vendor approval is handled by Edwin. Your job is the calls, notes, and follow-ups below.</p></div>';
    }
    h += '<div class="sr-card"><h4>Calls & notes</h4>' +
      '<p class="sr-faint">Log every call and update here. Notes are a permanent team record with your name and the time on them.</p>' +
      '<div class="outcome-grid" id="vdOutcomes">' +
      CALL_OUTCOMES.map(function (o) {
        return '<button type="button" class="outcome-btn" data-vdoutcome="' + o[0] + '">' + o[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="note-form"><label>Notes<textarea id="vdNoteText" rows="3" placeholder="What happened on the call, what they said, what is next…"></textarea></label>' +
      '<label>Follow-up date (optional)<input type="date" id="vdFollowDate"></label></div>' +
      '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="vdSaveNote" type="button">Save call / note</button></div>' +
      '<p class="aok hidden" id="vdNoteOk" style="margin-top:10px">Saved.</p>' +
      '<p class="aerr hidden" id="vdNoteErr" style="margin-top:10px"></p>' +
      '<div class="sr-comments" id="vdNotes" style="margin-top:14px"></div></div>';
    box.innerHTML = h;
    box.querySelectorAll("[data-vstatus]").forEach(function (b) {
      b.addEventListener("click", function () { setVendorStatus(b.getAttribute("data-vstatus")); });
    });
    var vcb = $("vdCalBtn");
    if (vcb) vcb.addEventListener("click", function () {
      var v = vdData; if (!v) return;
      var notes = [v.name ? "Contact: " + v.name : "", v.phone ? "Phone: " + v.phone : "",
        v.email ? "Email: " + v.email : ""].filter(Boolean).join("\n");
      openCal({
        title: (v.business || v.name || "Vendor") + " - meeting",
        address: v.address || "",
        colorId: "3",
        notes: notes
      });
    });
    var vab = $("vd-archive");
    if (vab) vab.addEventListener("click", archiveVendor);
    var vdb = $("vd-delete");
    if (vdb) vdb.addEventListener("click", deleteVendor);
    var vrb = $("vd-restore");
    if (vrb) vrb.addEventListener("click", function () { restoreVendor(vdId); });
    box.querySelectorAll("[data-vdoutcome]").forEach(function (b) {
      b.addEventListener("click", function () {
        vdOutcome = vdOutcome === b.getAttribute("data-vdoutcome") ? "" : b.getAttribute("data-vdoutcome");
        box.querySelectorAll("[data-vdoutcome]").forEach(function (x) {
          x.classList.toggle("active", x.getAttribute("data-vdoutcome") === vdOutcome);
        });
      });
    });
    var vsn = $("vdSaveNote");
    if (vsn) vsn.addEventListener("click", saveVendorNote);
    loadItemNotes("vendor", vdId, $("vdNotes"));
  }
  function saveVendorNote() {
    if (!vdId) return;
    var text = $("vdNoteText").value.trim();
    var err = $("vdNoteErr"); err.classList.add("hidden");
    if (!vdOutcome && !text) { err.textContent = "Pick a call outcome or write a note first."; err.classList.remove("hidden"); return; }
    var btn = $("vdSaveNote"); btn.disabled = true;
    var label = (vdData && (vdData.business || vdData.name)) || "Vendor";
    saveItemNote({
      entityType: "vendor", entityId: vdId, entityLabel: label,
      kind: vdOutcome ? "call" : "note", outcome: vdOutcome, text: text,
      followUpOn: $("vdFollowDate").value || null
    }).then(function () {
      logActivity((vdOutcome ? "Logged a call (" + outcomeLabel(vdOutcome) + ") with " : "Added a note on ") + label);
      $("vdNoteOk").classList.remove("hidden");
      $("vdNoteText").value = ""; $("vdFollowDate").value = "";
      vdOutcome = "";
      document.querySelectorAll("[data-vdoutcome]").forEach(function (x) { x.classList.remove("active"); });
      loadItemNotes("vendor", vdId, $("vdNotes"));
      loadFollowUps();
    }).catch(function (e) {
      err.textContent = "Could not save: " + (e.message || e);
      err.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; });
  }
  function setVendorStatus(st) {
    if (!vdId || !isAdmin) return;
    db.collection("vendors").doc(vdId).update({
      status: st,
      verified: st === "approved"
    }).then(function () {
      logActivity("Set vendor status to " + st);
      vdData.status = st; vdData.verified = st === "approved";
      renderVendorModal();
      var ok = $("vd-ok"); if (ok) ok.classList.remove("hidden");
      loadVendors(); loadVendorOptions();
    }).catch(function (err) {
      alert("Could not save status: " + (err.message || err) + "\n\nIf this says permission denied, the database rules need the staff update — check the setup notes.");
    });
  }

  // ---------- Vendor archive (owner only) ----------
  // Archiving keeps the vendor's record, calls, and notes; it only takes
  // them out of the active vendor list. prevStatus remembers where they
  // were so Restore can put them back exactly.
  function archiveVendor() {
    if (!vdId || !isAdmin) return;
    var name = (vdData && (vdData.business || vdData.name)) || "this vendor";
    if (!confirm("Archive " + name + "? They will leave the active vendor list. Their record is kept and can be restored.")) return;
    db.collection("vendors").doc(vdId).update({
      status: "archived",
      prevStatus: vStatus(vdData),
      archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
      archivedBy: me ? me.email : ""
    }).then(function () {
      logActivity("vendor_archived: " + name + " (" + vdId + ")");
      closeVendor();
      loadVendors(); loadArchivedVendors(); loadVendorOptions();
    }).catch(function (err) {
      alert("Could not archive vendor: " + (err.message || err) + "\n\nIf this says permission denied, the database rules need the staff update — check the setup notes.");
    });
  }
  function archiveVendorById(id) {
    if (!id || !isAdmin) return;
    db.collection("vendors").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var v = snap.data();
      var name = v.business || v.name || "this vendor";
      if (!confirm("Archive " + name + "? They will leave the active vendor list. Their record is kept and can be restored.")) return;
      return db.collection("vendors").doc(id).update({
        status: "archived",
        prevStatus: vStatus(v),
        archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
        archivedBy: me ? me.email : ""
      }).then(function () {
        logActivity("vendor_archived: " + name + " (" + id + ")");
        loadVendors(); loadArchivedVendors(); loadVendorOptions();
      });
    }).catch(function (err) {
      alert("Could not archive vendor: " + (err.message || err));
    });
  }
  function deleteVendor() {
    if (!vdId || !isAdmin) return;
    var name = (vdData && (vdData.business || vdData.name)) || "this vendor";
    if (!confirm("Delete " + name + " permanently? This removes their vendor record. This cannot be undone.")) return;
    if (!confirm("Are you sure? Delete " + name + " for good?")) return;
    var id = vdId;
    db.collection("vendors").doc(id).delete().then(function () {
      logActivity("vendor_deleted: " + name + " (" + id + ")");
      try { db.collection("push_tokens").doc(id).delete(); } catch (e) {}
      closeVendor();
      loadVendors(); loadArchivedVendors(); loadVendorOptions();
    }).catch(function (err) {
      alert("Could not delete vendor: " + (err.message || err));
    });
  }
  function restoreVendor(id) {
    if (!id || !isAdmin) return;
    db.collection("vendors").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var v = snap.data();
      var back = v.prevStatus || "pending";
      return db.collection("vendors").doc(id).update({
        status: back,
        archivedAt: null,
        archivedBy: null
      }).then(function () {
        logActivity("vendor_restored: " + (v.business || v.name || "Vendor") + " (" + id + ")");
        if (vdId === id) closeVendor();
        loadVendors(); loadArchivedVendors(); loadVendorOptions();
      });
    }).catch(function (err) {
      alert("Could not restore vendor: " + (err.message || err) + "\n\nIf this says permission denied, the database rules need the staff update — check the setup notes.");
    });
  }
  var archivedVendors = [], archivedOpen = false;
  function loadArchivedVendors() {
    var sec = $("ad-vendor-archived-sec");
    if (!sec) return;
    if (!isAdmin) { sec.classList.add("hidden"); return; }
    liveOn("varch", db.collection("vendors"), function (qs) {
      archivedVendors = [];
      qs.forEach(function (d) { var v = d.data(); if (v.status === "archived" || v.status === "rejected") archivedVendors.push({ id: d.id, v: v }); });
      archivedVendors.sort(function (a, b) { return (tsMs(b.v.archivedAt) || tsMs(b.v.createdAt)) - (tsMs(a.v.archivedAt) || tsMs(a.v.createdAt)); });
      sec.classList.remove("hidden");
      renderArchivedVendors();
    }, function () {});
  }
  function renderArchivedVendors() {
    var btn = $("ad-vendor-archived-toggle"), box = $("ad-vendor-archived-list");
    if (!btn || !box) return;
    btn.textContent = "Archived & rejected (" + archivedVendors.length + ")" + (archivedOpen ? " — hide" : " — show");
    box.classList.toggle("hidden", !archivedOpen);
    if (!archivedOpen) return;
    if (!archivedVendors.length) { box.innerHTML = '<p style="color:var(--faint)">No archived or rejected vendors.</p>'; return; }
    box.innerHTML = "";
    archivedVendors.forEach(function (item) {
      var v = item.v;
      var when = v.archivedAt && v.archivedAt.toDate ? v.archivedAt.toDate().toLocaleDateString() : "";
      var row = document.createElement("div"); row.className = "arow";
      row.innerHTML = '<div class="grow"><strong>' + esc(v.business || v.name || "Vendor") + "</strong><small>" +
        esc(v.name || "") + (when ? " · archived " + esc(when) : "") + (v.archivedBy ? " · by " + esc(v.archivedBy) : "") + "</small></div>" +
        " " + pill(v.status || "archived") +
        ' <button class="mini" data-vopen="' + item.id + '">Open</button>' +
        ' <button class="mini" data-vrestore="' + item.id + '">Restore</button>';
      box.appendChild(row);
    });
  }
  var arcToggle = $("ad-vendor-archived-toggle");
  if (arcToggle) arcToggle.addEventListener("click", function () {
    archivedOpen = !archivedOpen;
    renderArchivedVendors();
  });

  function loadStats() {
    liveOn("stats-wo", db.collection("work_orders"), function (qs) {
      var open = 0, active = 0;
      qs.forEach(function (d) { var s = d.data().status; if (s === "open") open++; else if (s !== "done") active++; });
      $("as-open").textContent = open; $("as-active").textContent = active;
    });
    liveOn("stats-q", db.collection("quotes").where("status", "==", "pending"), function (qs) { $("as-quotes").textContent = qs.size; var mb = $("pg-nav-b-quotes"); if (mb) mb.textContent = qs.size; });
    liveOn("stats-push", db.collection("push_tokens").limit(500), function (qs) {
      var inst = 0, on = 0, instC = 0, instV = 0, onC = 0, onV = 0;
      qs.forEach(function (doc) {
        var d = doc.data() || {};
        if (d.appInstalled) { inst++; if (d.surface === "vendor") instV++; else instC++; }
        if (d.token) { on++; if (d.surface === "vendor") onV++; else onC++; }
      });
      var a1 = $("as-apps"); if (a1) a1.innerHTML = inst + ' <small style="font-size:.62em;color:var(--muted);font-weight:600">' + instC + " cust · " + instV + " vend</small>";
      var a2 = $("as-pushon"); if (a2) a2.innerHTML = on + ' <small style="font-size:.62em;color:var(--muted);font-weight:600">' + onC + " cust · " + onV + " vend</small>";
    }, function () {});
    liveOn("stats-v", db.collection("vendors"), function (qs) { var n = 0; qs.forEach(function (d) { var s = d.data().status; if (s !== "archived" && s !== "rejected") n++; }); $("as-vendors").textContent = n; var mb = $("pg-nav-b-vendors"); if (mb) mb.textContent = n; });
  }

  function pill(s) {
    var cls = { open: "p-open", new: "p-open", accepted: "p-acc", evaluation_accepted: "p-acc", in_progress: "p-acc", review: "p-rev", reviewing: "p-pend", quoted: "p-acc", scheduled: "p-acc", done: "p-done", pending: "p-pend", approved: "p-done", declined: "p-rev", cancelled: "p-rev" }[s] || "p-open";
    return '<span class="pill ' + cls + '">' + esc(String(s || "new").replace(/_/g, " ")) + "</span>";
  }

  /* ----- Work Orders work queue (mirrors the Hot Leads queue) ----- */
  // The list is a prioritized card feed over the same work_orders docs:
  // unsent quote requests first, then quote requests already sent and
  // awaiting vendor pricing, then active jobs, then completed work.
  // Filters and sorting are presentation only; every action keeps the
  // same data-* hook and handler the old rows used.
  function woStatusValue(w) { return String((w && w.status) || "open"); }
  function woCustomerName(w) {
    if (!w) return "";
    return w.customerName || w.sourceLeadName || w.customer || "";
  }
  function woIsActiveJobStatus(status) {
    return ["accepted", "evaluation_accepted", "in_progress", "scheduled", "en_route", "arrived", "review"].indexOf(status) >= 0;
  }
  // Live tracking stage chip (2026-10-17 build, rebased 2026-10-19):
  // the same stages the customer watches in their portal tracker
  // (Scheduled, On the way, Arrived, In review, Done), plus a live map
  // link while the crew is en route or on site and a position has
  // been stamped.
  function woStageChip(w) {
    if (!w) return "";
    var st = woStatusValue(w);
    var label = null, cls = "p-acc";
    if (st === "en_route") label = "On the way";
    else if (st === "arrived") label = "Arrived";
    else if (st === "review") { label = "In review"; cls = "p-rev"; }
    else if (st === "done") { label = "Done"; cls = "p-done"; }
    else if (woIsActiveJobStatus(st) || w.vendorId) { label = "Scheduled"; cls = "p-pend"; }
    if (!label) return "";
    var html = '<span class="pill ' + cls + '" title="Live tracking stage">' + label + "</span>";
    if ((st === "en_route" || st === "arrived") && typeof w.lastLat === "number" && typeof w.lastLng === "number") {
      html += ' <a class="mini hlq-action hlq-action-ghost" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + w.lastLat + "," + w.lastLng + '">See on map</a>';
    }
    return html;
  }
  // Property coordinates for live arrival tracking: geocode the work
  // order address once, when the office creates the work order, via
  // the free Nominatim endpoint, and keep propertyLat/propertyLng on
  // the doc. The vendor portal measures arrival against these. Fail
  // soft: no result means that job has no automatic arrival (the
  // vendor's photo upload and the office still close the loop).
  function geocodeAddress(address) {
    var q = String(address || "").trim();
    if (!q) return Promise.resolve(null);
    return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), {
      headers: { "Accept": "application/json" }
    }).then(function (r) { return r.json(); }).then(function (rows) {
      if (rows && rows.length && rows[0].lat && rows[0].lon) {
        return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) };
      }
      return null;
    }).catch(function () { return null; });
  }
  function woBucket(w) {
    var status = woStatusValue(w);
    if (status === "done") return 3;
    if (w && w.kind === "quote_request" && !woIsActiveJobStatus(status)) {
      if (!tsMs(w.vendorNotifiedAt) && w.vendorNotifyPending !== true) return 0;
      return 1;
    }
    return 2;
  }
  function woFilterGroup(w) {
    var bucket = woBucket(w);
    return bucket === 0 || bucket === 1 ? "quote" : (bucket === 3 ? "done" : "active");
  }
  function woIdleMs(w) {
    var touchedMs = tsMs(w && w.updatedAt) || tsMs(w && w.createdAt);
    return touchedMs ? Math.max(0, Date.now() - touchedMs) : 0;
  }
  function woVideoLinks(w) {
    var out = [];
    function push(link) {
      link = String(link || "").trim();
      if (link && out.indexOf(link) < 0) out.push(link);
    }
    if (w && Array.isArray(w.videos)) w.videos.forEach(push);
    if (w) push(w.videoLink);
    return out;
  }
  function renderWoFilterChips() {
    var wrap = $("ad-wo-filters");
    if (!wrap) return;
    var counts = { all: woOrders.length, quote: 0, active: 0, done: 0 };
    woOrders.forEach(function (it) { counts[woFilterGroup(it.d)]++; });
    var defs = [["all", "All"], ["quote", "Quote requests"], ["active", "Active"], ["done", "Done"]];
    wrap.innerHTML = defs.map(function (df) {
      return '<button type="button" class="hl-chip' + (woFilter === df[0] ? " active" : "") +
        '" data-wofilter="' + df[0] + '">' + esc(df[1]) + ' <span class="cnt">' + counts[df[0]] + "</span></button>";
    }).join("");
  }
  // Full inline detail for an expanded work-order card (the Open toggle).
  // Shows everything stored on the doc: customer + contact, address,
  // area, service, the complete details text (property notes live inside
  // it on prepared orders, and in their own field when present), the
  // assigned vendor + pay, schedule hints, every photo and video link,
  // and the record timestamps. Built from the cached row, so expanding
  // never needs a network round-trip.
  function woDetailHtml(w, woId) {
    function row(label, valueHtml) {
      if (!valueHtml) return "";
      return '<div class="woq-drow"><span class="woq-dlabel">' + esc(label) + '</span><span class="woq-dval">' + valueHtml + "</span></div>";
    }
    function fmtWhen(v) {
      var ms = tsMs(v);
      if (ms) return esc(new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
      return esc(String(v || ""));
    }
    var contactBits = [w.customerContact || w.contact || "", w.customerPhone || w.phone || "", w.customerEmail || w.email || ""]
      .filter(function (x) { return x && String(x).trim(); });
    var assign = w.vendorBusiness || (w.broadcast ? "Broadcast (all approved vendors)" : (w.vendorId ? "Vendor " + w.vendorId : ""));
    var when = w.scheduledAt || w.scheduledFor || w.preferredTime || w.when || "";
    var html = '<div class="woq-detail">';
    html += row("Customer", woCustomerName(w) ? esc(woCustomerName(w)) : "");
    if (contactBits.length) html += row("Contact", esc(contactBits.join(" · ")));
    html += row("Address", w.address ? esc(w.address) : "");
    html += row("Area", w.area ? esc(w.area) : "");
    html += row("Service", w.category ? esc(w.category) : "");
    html += row("Type", w.kind ? esc(String(w.kind).replace(/_/g, " ")) : "");
    html += row("Status", esc(String(woStatusValue(w)).replace(/_/g, " ")));
    html += row("Assigned to", assign ? esc(assign) : "");
    html += row("Pay", w.pay ? esc(w.pay) : "");
    // Job costing (Oct 18, Jobber-steal #4): customer price vs crew pay vs
    // margin, on the job itself. Price is editable and saved to the WO as
    // jobPrice; margin colors flag thin jobs before they close.
    (function () {
      function money(v) { var m = String(v == null ? "" : v).replace(",", "").match(/(\d+(?:\.\d{1,2})?)/); return m ? parseFloat(m[1]) : 0; }
      var crewPay = money(w.payAgreed || w.pay);
      var price = parseFloat(w.jobPrice) || 0;
      var inner = "";
      if (price > 0) {
        var margin = price - crewPay;
        var mpct = Math.round(margin / price * 100);
        var col = mpct < 15 ? "#c0392b" : (mpct < 30 ? "#a87e14" : "#177245");
        inner = "$" + price + " price · $" + crewPay + " crew pay · <strong style='color:" + col + "'>$" + Math.round(margin) + " margin (" + mpct + "%)</strong><br>";
      } else inner = "<span style='color:#7a7668'>No customer price on this job yet.</span><br>";
      if (woId) inner += '<span style="display:inline-flex;gap:6px;align-items:center;margin-top:4px"><input class="wo-price-in" type="number" min="0" step="1" placeholder="Job price $" value="' + (price > 0 ? price : "") + '" style="width:110px;padding:5px 8px;border:1px solid var(--m-line,#ddd);border-radius:8px;font:inherit;font-size:.85rem"><button type="button" class="mini hlq-action hlq-action-ghost" data-wopricesave="' + esc(woId) + '">Save price</button></span>';
      html += row("Job costing", inner);
    })();
    // Vendor add-on scan (Oct 19): extras the vendor flagged on site with
    // HIS prices; Natasha marks them up in the customer quote builder.
    if (Array.isArray(w.vendorAddons) && w.vendorAddons.length) {
      var vaTotal = 0;
      var vaHtml = w.vendorAddons.map(function (a) {
        var p = parseFloat(a.price) || 0; vaTotal += p;
        return esc(a.label || "Add-on") + " <strong>$" + Math.round(p) + "</strong>";
      }).join(" · ");
      html += row("Add-on scan (vendor)", vaHtml + '<br><span style="color:#7a7668">Vendor total for extras: $' + Math.round(vaTotal) + ". These prefill the customer quote builder as optional add-ons.</span>");
    }
    if (when) html += row("Scheduled", fmtWhen(when));
    if (w.enRouteAt) html += row("On the way", fmtWhen(w.enRouteAt));
    if (w.arrivedAt) html += row("Arrived", fmtWhen(w.arrivedAt));
    if (w.trackingStoppedAt) html += row("Tracking stopped", fmtWhen(w.trackingStoppedAt));
    if (typeof w.lastLat === "number" && typeof w.lastLng === "number") {
      html += row("Live position", '<a href="https://www.google.com/maps?q=' + w.lastLat + "," + w.lastLng + '" target="_blank" rel="noopener">See on map</a>' + (w.lastLocAt ? " · updated " + fmtWhen(w.lastLocAt) : ""));
    }
    // Vendor checklist progress (Oct 18): same per-service lists as the
    // vendor portal; keep the two in sync.
    if (w.kind !== "quote_request" && (w.vendorId || w.status !== "open")) {
      var ckCat = ((w.category || "") + " " + (w.title || "")).toLowerCase();
      var ckTotal = /pressure|wash/.test(ckCat) ? 4 : (/lawn|landscap|grass|mow|cut/.test(ckCat) ? 6 : 4);
      var ckState = (w.checklist && typeof w.checklist === "object") ? w.checklist : {};
      var ckDone = 0; for (var cki = 0; cki < ckTotal; cki++) if (ckState[cki]) ckDone++;
      var ckPct = Math.round(ckDone / ckTotal * 100);
      html += row("Checklist", '<span style="display:inline-block;vertical-align:middle;width:130px;height:8px;border-radius:999px;background:#efe9da;overflow:hidden;margin-right:8px"><i style="display:block;height:100%;width:' + ckPct + '%;background:linear-gradient(90deg,#ffd968,#d9ab2b)"></i></span>' + ckDone + "/" + ckTotal + " steps");
    }
    if (w.vendorNotifiedAt) html += row("Sent to vendors", fmtWhen(w.vendorNotifiedAt));
    if (w.acceptedAt) html += row("Accepted", fmtWhen(w.acceptedAt));
    if (w.sourceLeadName) html += row("From lead", esc(w.sourceLeadName));
    // v60 (Edwin, Oct 17): the long text blocks and the photos are
    // collapsible, and photos are grouped BY VISIT (date + crew + that
    // visit's summary), mirroring the CRM service history. Nothing dumps
    // open by default inside the expanded card.
    function collapsible(title, innerHtml) {
      return '<details class="woq-dblock woq-collapse"><summary style="cursor:pointer;font-weight:700;list-style-position:inside">' + esc(title) + "</summary>" + innerHtml + "</details>";
    }
    if (w.details) html += collapsible("Full details", "<p>" + esc(w.details).replace(/\n/g, "<br>") + "</p>");
    var propNotes = w.propertyNotes || w.property_notes || "";
    if (propNotes) html += collapsible("Property notes", "<p>" + esc(propNotes).replace(/\n/g, "<br>") + "</p>");
    var photoUrls = (Array.isArray(w.photos) ? w.photos : []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
    function thumbsHtml(urls) {
      // Photos open in the in-page lightbox (#pgLightbox), never as Drive
      // links: Drive file pages bounce staff to a Google sign-in wall.
      return '<div class="athumbs woq-thumbs">' + urls.map(function (u) { return '<button type="button" class="woq-thumb-btn" data-wophoto="' + esc(woPhotoBigUrl(u)) + '" data-wophotoorig="' + esc(u) + '" aria-label="View photo full size"><img src="' + esc(u) + '" alt="work order photo"></button>'; }).join("") + "</div>";
    }
    var visitLog = Array.isArray(w.visitLog) ? w.visitLog.filter(function (e) { return e && typeof e === "object"; }) : [];
    if (visitLog.length && photoUrls.length) {
      var inVisit = {};
      visitLog.forEach(function (e) {
        (Array.isArray(e.photos) ? e.photos : []).forEach(function (u) { inVisit[u] = true; });
      });
      visitLog.forEach(function (e) {
        var vPhotos = (Array.isArray(e.photos) ? e.photos : []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
        if (!vPhotos.length) return;
        var vMs = tsMs(e.visitDate) || tsMs(e.completedAt);
        var label = "Visit" + (vMs ? " · " + new Date(vMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "") +
          (e.vendorBusiness ? " · " + e.vendorBusiness : "") + " · " + vPhotos.length + (vPhotos.length === 1 ? " photo" : " photos");
        var inner = (e.note ? "<p>" + esc(e.note).replace(/\n/g, "<br>") + "</p>" : "") + thumbsHtml(vPhotos);
        html += collapsible(label, inner);
      });
      var refPhotos = photoUrls.filter(function (u) { return !inVisit[u]; });
      if (refPhotos.length) html += collapsible("Property photos (" + refPhotos.length + ")", thumbsHtml(refPhotos));
    } else if (photoUrls.length) {
      html += collapsible("Photos (" + photoUrls.length + ")", thumbsHtml(photoUrls));
    }
    var vids = woVideoLinks(w);
    if (vids.length) {
      html += '<div class="woq-dblock"><h4>Videos</h4><p class="woq-vids">' +
        vids.map(function (u, i) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">Video ' + (i + 1) + "</a>"; }).join(" · ") + "</p></div>";
    }
    var created = fmtWhen(w.createdAt), updated = fmtWhen(w.updatedAt);
    var metaBits = [];
    if (created) metaBits.push("Created " + created + (w.createdBy ? " by " + esc(w.createdBy) : ""));
    if (updated && updated !== created) metaBits.push("Updated " + updated);
    if (metaBits.length) html += '<p class="woq-dmeta">' + metaBits.join(" · ") + "</p>";
    html += "</div>";
    return html;
  }
  /* ----- Photo lightbox (#pgLightbox) ----- */
  // Work order photos live on Drive as thumbnail URLs, which load fine as
  // plain <img> sources (no Google session needed) — unlike Drive file
  // pages. The lightbox therefore shows the thumbnail URL itself, just at
  // a bigger size, inside the admin page: no navigation, no new tab.
  function woPhotoBigUrl(u) {
    var s = String(u || "");
    var fileMatch = s.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
    if (fileMatch) return "https://drive.google.com/thumbnail?id=" + fileMatch[1] + "&sz=w1600";
    if (/drive\.google\.com\/thumbnail\?/i.test(s)) {
      if (/[?&]sz=/i.test(s)) return s.replace(/([?&]sz=)[^&]*/i, "$1w1600");
      return s + "&sz=w1600";
    }
    return s;
  }
  function openPhotoLightbox(bigUrl, origUrl) {
    var ov = $("pgLightbox"), img = $("pgLightboxImg");
    if (!ov || !img) return;
    img.onerror = function () {
      img.onerror = null;
      if (origUrl && img.getAttribute("src") !== origUrl) img.src = origUrl;
    };
    img.src = bigUrl || origUrl || "";
    ov.classList.remove("hidden");
  }
  function closePhotoLightbox() {
    var ov = $("pgLightbox"), img = $("pgLightboxImg");
    if (!ov) return;
    ov.classList.add("hidden");
    if (img) { img.onerror = null; img.removeAttribute("src"); }
  }
  function renderWorkOrders() {
    renderHomeDash();
    var box = $("ad-wo-list");
    if (!box) return;
    // v61 (Edwin, Oct 17): red nav badge = jobs in "review" waiting on
    // staff (vendor pressed done on their end). Visible without opening
    // the Work orders view.
    var revBadge = $("pg-nav-b-work-review");
    if (revBadge) {
      var nRev = woOrders.filter(function (it) { return it.d && it.d.status === "review"; }).length;
      revBadge.textContent = nRev;
      revBadge.style.display = nRev ? "" : "none";
    }
    renderWoFilterChips();
    if (!woOrders.length) {
      box.innerHTML = '<p style="color:var(--faint)">No work orders yet.</p>';
      return;
    }
    var visible = woOrders.filter(function (it) {
      return woFilter === "all" || woFilterGroup(it.d) === woFilter;
    });
    visible.sort(function (a, b) {
      var bucketRank = woBucket(a.d) - woBucket(b.d);
      if (bucketRank) return bucketRank;
      var idleRank = woIdleMs(b.d) - woIdleMs(a.d);
      if (idleRank) return idleRank;
      return tsMs(b.d.createdAt) - tsMs(a.d.createdAt);
    });
    box.innerHTML = "";
    if (!visible.length) {
      var labels = { quote: "quote requests", active: "active work orders", done: "completed work orders" };
      box.innerHTML = '<p style="color:var(--faint)">No ' + esc(labels[woFilter] || "work orders") + " right now.</p>";
      return;
    }
    visible.forEach(function (it) {
      var w = it.d;
      var bucket = woBucket(w);
      var idleDays = Math.floor(woIdleMs(w) / 86400000);
      var idleCls = idleDays >= 7 ? " red" : (idleDays >= 3 ? " amber" : "");
      var customer = woCustomerName(w);
      var title = w.title || "Work order";
      var metaLine = [w.category || "", w.area || "", w.address || ""].filter(Boolean).join(" · ");
      var excerpt = hlExcerpt(w.details);
      var photoCount = Array.isArray(w.photos) ? w.photos.length : 0;
      var videoCount = woVideoLinks(w).length;
      var mediaHtml = (photoCount ? ' <span class="hl-photo-badge" title="Photos on this work order">📷 ' + photoCount + "</span>" : "") +
        (videoCount ? ' <span class="hl-photo-badge" title="Videos on this work order">🎬 ' + videoCount + "</span>" : "");
      var sendHtml = woSendHtml(it.id, w);
      var isOpen = woOpenId === it.id;
      var card = document.createElement("article");
      card.className = "hlq-card woq-card " + (bucket === 0 ? "woq-action" : (bucket === 3 ? "woq-done" : "woq-progress"));
      card.innerHTML =
        '<div class="hlq-head"><button type="button" class="hlq-name" data-wonotes="' + it.id + '">' +
          esc(title + (customer && title.indexOf(customer) < 0 ? " · " + customer : "")) + "</button>" +
          '<span class="hlq-head-right"><button type="button" class="mini woq-open-btn" data-woopen="' + it.id + '" aria-expanded="' + (isOpen ? "true" : "false") + '">' + (isOpen ? "Close" : "Open") + "</button>" +
          pill(w.status) + woStageChip(w) + "</span></div>" +
        (metaLine || mediaHtml ? '<div class="hlq-service">' + esc(metaLine) + mediaHtml + "</div>" : "") +
        (excerpt ? '<p class="hlq-notes">' + esc(excerpt) + "</p>" : "") +
        '<div class="hlq-actions">' +
          '<button type="button" class="mini hlq-action hlq-action-primary" data-wonotes="' + it.id + '">Notes</button>' +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-taskfor="work_order|' + it.id + '">Task</button>' +
          (w.customerId
            ? '<button type="button" class="mini hlq-action hlq-action-ghost" data-woviewcustomer="' + esc(w.customerId) + '">In CRM \u2713</button>'
            : '<button type="button" class="mini hlq-action hlq-action-ghost" data-wotocrm="' + it.id + '">Add to CRM</button>') +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-calwo="' + it.id + '">Add to calendar</button>' +
          (w.status !== "done" ? '<button type="button" class="mini hlq-action hlq-action-ghost" data-wodone="' + it.id + '">Done</button>' : "") +
        "</div>" +
        (sendHtml ? '<div class="woq-send">' + sendHtml + "</div>" : "") +
        '<div class="hlq-foot"><span class="hlq-idle' + idleCls + '">' + idleDays + 'd since update</span>' +
          '<span class="hlq-manage"><button type="button" class="hlq-manage-btn" data-woedit="' + it.id + '">Edit</button>' +
          '<button type="button" class="hlq-manage-btn danger" data-wodel="' + it.id + '">Delete</button></span>' +
          '<span class="hlq-source">' + esc(w.vendorBusiness || "Broadcast") + "</span></div>" +
        (isOpen ? woDetailHtml(w, it.id) : "");
      box.appendChild(card);
    });
  }
  function loadWorkOrders() {
    liveOn("wo", db.collection("work_orders").orderBy("createdAt", "desc").limit(30), function (qs) {
      woOrders = [];
      qs.forEach(function (d) { woOrders.push({ id: d.id, d: d.data() }); });
      renderWorkOrders();
    });
  }

  /* ----- Send a quote-request work order to vendors (explicit step) ----- */
  // Convert no longer notifies vendors. For kind "quote_request" work
  // orders, staff pick a target and press "Preview & send": a preview
  // modal shows exactly what the vendor(s) will receive (recipients,
  // the email in English and Spanish, the phone push, and the portal
  // card) and NOTHING is written until staff confirm there. Confirming
  // flags the doc vendorNotifyPending and the background watch emails/
  // pushes the vendor(s), honoring vendorNotifyLang ("auto" = each
  // vendor's own language). vendorNotifiedAt (stamped by the watch once
  // delivered) flips the control to its "Sent to vendors ✓" state.
  // Individual targets may be ANY approved or pending vendor (Edwin,
  // 2026-10-16); broadcast still means approved vendors only — that
  // semantics lives in the watch and does not change here. The target
  // list comes from woVendorCache, filled by loadVendorOptions().
  function woSendHtml(id, w) {
    if (!w || w.kind !== "quote_request") return "";
    var cur = w.vendorNotifyTarget || (w.broadcast === false && w.vendorId ? w.vendorId : "broadcast");
    var opts = '<option value="broadcast"' + (cur === "broadcast" ? " selected" : "") + ">All approved vendors (broadcast)</option>";
    (woVendorCache || []).forEach(function (v) {
      var label = v.business + (v.name && v.name !== v.business ? " — " + v.name : "") + (v.status !== "approved" ? " (pending)" : "");
      opts += '<option value="' + v.id + '"' + (cur === v.id ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    var sentMs = tsMs(w.vendorNotifiedAt);
    var state = "";
    if (sentMs) state = ' <span class="sr-faint">Sent to vendors ✓ ' + esc(new Date(sentMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })) + "</span>";
    else if (w.vendorNotifyPending) state = ' <span class="sr-faint">Send queued…</span>';
    // Available-work board toggle (Edwin, 2026-10-16): posting puts the
    // job in every vendor's portal for volunteers; removing it makes the
    // job private again. No notification is sent either way.
    var onBoard = w.broadcast === true;
    var board = ' <button class="mini" type="button" data-woboard="' + id + '">' +
      (onBoard ? "On the board · Remove" : "Post as available work") + "</button>" +
      (onBoard ? '<div class="sr-faint" style="margin-top:6px">Posted as available work — all vendors can see it.</div>' : "");
    return ' <span class="wo-send"><select data-wosendsel="' + id + '">' + opts + "</select>" +
      ' <button class="mini" type="button" data-wosend="' + id + '">' + (sentMs ? "Preview & resend" : "Preview & send") + "</button>" + state + "</span>" + board;
  }

  /* ----- Send preview modal (#woPrevModal) ----- */
  var woPrevCtx = null; // { id, w, target } while the preview is open
  var woPrevLang = "auto"; // "auto" | "en" | "es"

  function woPrevVendorById(id) {
    for (var i = 0; i < woVendorCache.length; i++) if (woVendorCache[i].id === id) return woVendorCache[i];
    return null;
  }
  function woPrevFirstName(v) {
    var n = String((v && v.name) || "").trim();
    if (n) return n.split(/\s+/)[0];
    var b = String((v && v.business) || "").trim();
    return b ? b.split(/\s+/)[0] : "";
  }
  // The actual recipient list the watch will deliver to: broadcast =
  // every approved vendor with an email; single target = that vendor.
  function woPrevRecipients() {
    if (!woPrevCtx) return [];
    if (woPrevCtx.target === "broadcast") {
      return woVendorCache.filter(function (v) { return v.status === "approved" && v.email; });
    }
    var v = woPrevVendorById(woPrevCtx.target);
    return v ? [v] : [];
  }
  // The email body, line for line the way the vendor-reply-watch sends
  // it. Empty WO fields drop their line; the photo line only appears
  // when photos exist.
  function woPrevEmailBody(lang, firstName, w) {
    var photos = Array.isArray(w.photos) ? w.photos.length : 0;
    var lines = [];
    if (lang === "es") {
      lines.push(firstName ? "Hola " + firstName + "," : "Hola,");
      lines.push("");
      lines.push("Tienes una nueva solicitud de cotización en tu portal de PrimeGuard.");
      if (w.title) lines.push("Trabajo: " + w.title);
      if (w.category) lines.push("Categoría: " + w.category);
      if (w.area) lines.push("Área: " + w.area);
      if (photos) lines.push(photos + " foto(s) adjunta(s)");
      lines.push("");
      lines.push("Todos los detalles, las fotos y la dirección están en el portal. Revísalo y manda tu precio ahí:");
      lines.push("https://primeguardmia.com/vendor-dashboard.html");
      lines.push("");
      lines.push("Instala la app desde esa misma página ('Get the app') para que los próximos trabajos te lleguen como notificación al teléfono.");
    } else {
      lines.push(firstName ? "Hi " + firstName + "," : "Hi there,");
      lines.push("");
      lines.push("A new quote request is waiting in your PrimeGuard vendor portal.");
      if (w.title) lines.push("Job: " + w.title);
      if (w.category) lines.push("Category: " + w.category);
      if (w.area) lines.push("Area: " + w.area);
      if (photos) lines.push(photos + " photo(s) attached");
      lines.push("");
      lines.push("Full details, photos, and the address are in the portal. Please review it and submit your price there:");
      lines.push("https://primeguardmia.com/vendor-dashboard.html");
      lines.push("");
      lines.push("Install the app from that same page ('Get the app') so future job alerts reach you as phone notifications.");
    }
    lines.push("");
    lines.push("Edwin Lora, President | PrimeGuard Preservation LLC");
    lines.push("(305) 788-2639");
    lines.push("primeguardllc.elora@pgpbiz.com");
    lines.push("https://primeguardmia.com");
    return lines.join("\n");
  }
  function woPrevPushText(lang, w) {
    var head = (w.title || "Work order") + (w.area ? (lang === "es" ? " en " : " in ") + w.area : "");
    return lang === "es"
      ? head + ". Entra a tu portal para revisarlo y mandar tu precio."
      : head + ". Open your portal to review it and submit your price.";
  }
  function woPrevPortalHtml(w) {
    var photoUrls = (Array.isArray(w.photos) ? w.photos : []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
    var photoCount = Array.isArray(w.photos) ? w.photos.length : 0;
    var vids = woVideoLinks(w).length;
    var thumbs = photoUrls.length
      ? '<div class="woprev-thumbs">' + photoUrls.slice(0, 3).map(function (u) { return '<img src="' + esc(u) + '" alt="job photo" loading="lazy">'; }).join("") + "</div>"
      : (photoCount ? '<p class="sr-faint">' + photoCount + " photo(s)</p>" : "");
    return '<div class="woprev-portal">' +
      '<p class="woprev-pcat">' + esc(w.category || "Quote request") + "</p>" +
      '<h4 class="woprev-ptitle">' + esc(w.title || "Work order") + "</h4>" +
      (w.details ? '<p class="woprev-pdetails">' + esc(hlExcerpt(w.details)) + "</p>" : "") +
      thumbs +
      (vids ? '<p class="sr-faint">Videos: ' + vids + "</p>" : "") +
      ((w.area || w.address) ? '<p class="woprev-pmeta">' + (w.area ? "<strong>" + esc(w.area) + "</strong>" : "") + (w.area && w.address ? " · " : "") + (w.address ? esc(w.address) : "") + "</p>" : "") +
      '<button type="button" class="btn btn-gold btn-sm" disabled>Give a quote</button></div>';
  }
  function renderWoPrev() {
    if (!woPrevCtx) return;
    var w = woPrevCtx.w;
    var recips = woPrevRecipients();
    var firstName = recips.length ? woPrevFirstName(recips[0]) : "";
    var lang = woPrevLang;
    // Recipients block
    var recipHtml;
    if (woPrevCtx.target === "broadcast") {
      recipHtml = recips.length
        ? recips.map(function (v) {
            return '<div class="woprev-recip"><strong>' + esc(v.business) + '</strong> <span class="sr-faint">' + esc(v.email) + "</span></div>";
          }).join("")
        : '<p class="sr-faint">No approved vendors with an email on file. Approved vendors will still see this job in their portal.</p>';
    } else {
      var tv = woPrevVendorById(woPrevCtx.target);
      recipHtml = tv
        ? '<div class="woprev-recip"><strong>' + esc(tv.business) + '</strong> <span class="sr-faint">' + esc(tv.email || "no email on file") + " · " + esc(tv.status) + "</span></div>" +
          (tv.email ? "" : '<p class="sr-faint" style="margin-top:6px">No email on file: they will not get the email, but the job shows in their portal.</p>')
        : '<p class="sr-faint">That vendor could not be found in the vendor list.</p>';
    }
    // Language segmented control
    var segBtn = function (val, label) {
      return '<button type="button" class="hl-chip' + (lang === val ? " active" : "") + '" data-woprevlang="' + val + '">' + label + "</button>";
    };
    // Email + push blocks follow the language control: Auto stacks both
    // versions; an explicit pick shows only that one.
    var mailBlock = function (l) {
      return '<div class="sr-card woprev-sec"><h4>' + (l === "es" ? "The email (Español)" : "The email (English)") + "</h4>" +
        '<p class="woprev-subj">Subject: New quote request in your portal - PrimeGuard</p>' +
        '<div class="woprev-mail">' + esc(woPrevEmailBody(l, firstName, w)) + "</div></div>";
    };
    var pushLine = function (l) {
      return '<p class="woprev-pushline"><strong>New quote request - PrimeGuard</strong><br>' + esc(woPrevPushText(l, w)) + "</p>";
    };
    var langs = lang === "auto" ? ["en", "es"] : [lang];
    $("woPrevBody").innerHTML =
      '<h3 id="woPrevTitle">Send to vendors: preview</h3>' +
      '<p class="sr-faint" style="margin-top:6px">Review exactly what goes out. Nothing is sent until you confirm below.</p>' +
      '<div class="sr-card woprev-sec"><h4>Who receives it</h4>' + recipHtml +
        '<p class="sr-faint" style="margin-top:8px">Channels: Email + portal alert.<br>Push to their phone if they turned notifications on in the app.</p></div>' +
      '<div class="woprev-langrow"><span class="sr-faint">Send language:</span>' +
        segBtn("auto", "Auto (vendor's language)") + segBtn("en", "English") + segBtn("es", "Español") + "</div>" +
      (lang === "auto" ? '<p class="sr-faint" style="margin-top:8px">Sent in the vendor\'s language: each vendor receives the version in their language, with their own first name.</p>' : "") +
      langs.map(mailBlock).join("") +
      '<div class="sr-card woprev-sec"><h4>Phone push notification</h4>' + langs.map(pushLine).join("") + "</div>" +
      '<div class="sr-card woprev-sec"><h4>What they\'ll see in their portal</h4>' + woPrevPortalHtml(w) + "</div>" +
      '<div class="sr-actions woprev-actions">' +
        '<button class="btn btn-ghost" type="button" data-woprevcancel>Cancel</button>' +
        '<button class="btn btn-gold" type="button" data-woprevconfirm>Send to vendor(s)</button></div>';
  }
  function openWoSendPreview(id, btn) {
    var wrap = btn && btn.closest ? btn.closest(".wo-send") : null;
    var sel = wrap ? wrap.querySelector("select") : null;
    var target = sel ? sel.value : "broadcast";
    var begin = function (w) {
      if (!w) { alert("That work order could not be loaded."); return; }
      woPrevCtx = { id: id, w: w, target: target };
      woPrevLang = "auto";
      renderWoPrev();
      $("woPrevModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
    };
    var loadWo = function () {
      var local = null;
      woOrders.forEach(function (it) { if (it.id === id) local = it.d; });
      if (local) { begin(local); return; }
      db.collection("work_orders").doc(id).get().then(function (snap) {
        begin(snap.exists ? snap.data() : null);
      }).catch(function () { begin(null); });
    };
    // The recipients block needs the vendor cache; fill it first if the
    // Vendors tab data has not loaded yet.
    if (woVendorCache.length) loadWo();
    else db.collection("vendors").get().then(function (qs) { woCacheVendors(qs); loadWo(); }).catch(loadWo);
  }
  function closeWoSendPreview() {
    $("woPrevModal").classList.add("hidden");
    if ($("woNoteModal").classList.contains("hidden") && $("cqModal").classList.contains("hidden")) {
      document.body.style.overflow = "";
    }
    woPrevCtx = null;
  }
  function confirmWoSend(btn) {
    if (!woPrevCtx) return;
    var ctx = woPrevCtx;
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    db.collection("work_orders").doc(ctx.id).update({
      vendorNotifyPending: true,
      vendorNotifyTarget: ctx.target,
      vendorNotifyRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      vendorNotifyLang: woPrevLang,
      // Sending also sets portal visibility: a broadcast send posts the
      // job on the available-work board for every vendor; a single-vendor
      // send keeps it private to that vendor (Edwin, 2026-10-16).
      broadcast: ctx.target === "broadcast"
    }).then(function () {
      logActivity("Sent a work order to vendors for pricing");
      closeWoSendPreview();
      loadWorkOrders();
      if (woNoteId === ctx.id) openWorkOrderNotes(ctx.id);
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Send to vendor(s)"; }
      alert("Could not send: " + (e.message || e));
    });
  }

  // Flip the available-work board flag on a work order. This only changes
  // portal visibility — vendorNotifyPending is never touched, so the
  // vendor-reply watch sends nothing when the board changes.
  function toggleWoBoard(id, btn) {
    var apply = function (w) {
      var next = !(w && w.broadcast === true);
      if (btn) btn.disabled = true;
      db.collection("work_orders").doc(id).update({ broadcast: next }).then(function () {
        logActivity((next ? "Posted a work order as available work" : "Removed a work order from the available-work board"));
        loadWorkOrders();
        if (woNoteId === id) openWorkOrderNotes(id);
      }).catch(function (e) {
        if (btn) btn.disabled = false;
        alert("Could not update the board: " + (e.message || e));
      });
    };
    var local = null;
    woOrders.forEach(function (it) { if (it.id === id) local = it.d; });
    if (local) { apply(local); return; }
    db.collection("work_orders").doc(id).get().then(function (snap) {
      apply(snap.exists ? snap.data() : null);
    }).catch(function () { apply(null); });
  }

  /* ----- Vendor quote office info: job notes + photos (v77) ----- */
  // Edwin (Oct 19): the office could not see a vendor's job notes or any
  // job photos from Quotes to Review or from the build-quote view. The
  // quote doc carries vendorNotes (the vendor's read on the job: what it
  // requires, what the customer asked for) and notes (his price details);
  // the photos live on the work order (office property file plus vendor
  // uploads from the job card / Records view, grouped into visitLog when
  // a visit completes). One renderer feeds both surfaces so they never
  // drift apart. Thumbs reuse the #pgLightbox via data-wophoto buttons.
  function quoteThumbsHtml(urls, alt) {
    return '<div class="athumbs woq-thumbs">' + urls.map(function (u) {
      return '<button type="button" class="woq-thumb-btn" data-wophoto="' + esc(woPhotoBigUrl(u)) + '" data-wophotoorig="' + esc(u) + '" aria-label="View photo full size"><img src="' + esc(u) + '" alt="' + esc(alt || "job photo") + '" loading="lazy"></button>';
    }).join("") + "</div>";
  }
  function quoteWoPhotosHtml(wo) {
    if (!wo) return "";
    var out = "";
    var woPhotos = (Array.isArray(wo.photos) ? wo.photos : []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
    var inVisit = {};
    var groups = [];
    (Array.isArray(wo.visitLog) ? wo.visitLog : []).forEach(function (e) {
      if (!e || typeof e !== "object") return;
      var vp = (Array.isArray(e.photos) ? e.photos : []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
      vp.forEach(function (u) { inVisit[u] = true; });
      if (vp.length) groups.push({ e: e, photos: vp });
    });
    groups.forEach(function (g) {
      var vMs = tsMs(g.e.visitDate) || tsMs(g.e.completedAt);
      var label = "Vendor visit photos" + (vMs ? " · " + new Date(vMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "") + " (" + g.photos.length + ")";
      out += '<div style="margin-top:10px"><div style="font-weight:700;font-size:.85rem;margin-bottom:6px">' + esc(label) + "</div>" + quoteThumbsHtml(g.photos, "vendor visit photo") + "</div>";
    });
    var filePhotos = woPhotos.filter(function (u) { return !inVisit[u]; });
    if (filePhotos.length) {
      out += '<div style="margin-top:10px"><div style="font-weight:700;font-size:.85rem;margin-bottom:6px">Property photos (' + filePhotos.length + ')</div>' + quoteThumbsHtml(filePhotos, "property photo") + "</div>";
    }
    return out;
  }
  function quoteOfficeInfoHtml(q, wo) {
    var out = "";
    var vn = q && q.vendorNotes ? String(q.vendorNotes).trim() : "";
    if (vn) {
      out += '<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--gold,#c9a227);border-radius:10px;background:rgba(201,162,39,.08)">' +
        '<div style="font-weight:800;font-size:.85rem;margin-bottom:4px">Vendor notes' + (q.vendorBusiness ? " · " + esc(q.vendorBusiness) : "") + "</div>" +
        "<div>" + esc(vn).replace(/\n/g, "<br>") + "</div></div>";
    }
    var pd = q && q.notes ? String(q.notes).trim() : "";
    if (pd) {
      out += '<div style="margin-top:10px"><div style="font-weight:700;font-size:.85rem;margin-bottom:2px">Price details (vendor)</div><div>' + esc(pd).replace(/\n/g, "<br>") + "</div></div>";
    }
    var qPhotos = q && Array.isArray(q.photos) ? q.photos.filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); }) : [];
    if (qPhotos.length) {
      out += '<div style="margin-top:10px"><div style="font-weight:700;font-size:.85rem;margin-bottom:6px">Photos sent with the quote (' + qPhotos.length + ")</div>" + quoteThumbsHtml(qPhotos, "quote photo") + "</div>";
    }
    if (wo) out += quoteWoPhotosHtml(wo);
    return out;
  }
  // Quotes to Review renders from the quotes listener alone; the work
  // order (and its photos) is resolved per quote from the in-memory
  // woOrders first, then a one-time fetch, cached across re-renders.
  var quoteWoCache = {};
  var quoteWoFetching = {};
  function fillQuotePhotos(woId, wo) {
    var html = quoteWoPhotosHtml(wo);
    if (!html) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-qwo="' + woId + '"]'), function (el) {
      if (el.getAttribute("data-photos-done")) return;
      el.setAttribute("data-photos-done", "1");
      el.insertAdjacentHTML("beforeend", html);
    });
  }
  function hydrateQuotePhotos(q) {
    if (!q || !q.workOrderId) return;
    var woId = q.workOrderId;
    var local = null;
    woOrders.forEach(function (it) { if (it.id === woId) local = it.d; });
    if (local) { fillQuotePhotos(woId, local); return; }
    if (quoteWoCache[woId] !== undefined) { fillQuotePhotos(woId, quoteWoCache[woId]); return; }
    if (quoteWoFetching[woId]) return;
    quoteWoFetching[woId] = true;
    db.collection("work_orders").doc(woId).get().then(function (s) {
      quoteWoCache[woId] = s.exists ? s.data() : null;
      delete quoteWoFetching[woId];
      fillQuotePhotos(woId, quoteWoCache[woId]);
    }).catch(function () { delete quoteWoFetching[woId]; });
  }

  function loadQuotes() {
    loadCustomerQuotes();
    liveOn("quotes", db.collection("quotes").orderBy("createdAt", "desc").limit(30), function (qs) {
      var box = $("ad-quote-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No quotes submitted yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var q = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>$' + esc(q.price) + " - " + esc(q.vendorBusiness || "") + "</strong><small>" + esc(q.notes || "") + " · " + esc(q.duration || "") + " · " + esc(q.vendorPhone || "") + (q.quotePdfUrl ? ' · <a href="' + esc(q.quotePdfUrl) + '" target="_blank" rel="noopener" style="color:var(--gold-bright);font-weight:700">View quote PDF</a>' : "") + "</small></div>" +
          pill(q.status) +
          (q.status === "pending" ? ' <button class="mini" data-qok="' + d.id + "|" + q.workOrderId + '">Approve</button> <button class="mini" data-calquote="' + d.id + '">Add to calendar</button> <button class="mini danger" data-qno="' + d.id + '">Decline</button>' : "") +
          ' <button class="mini" data-cqbuild="' + d.id + '">Build customer quote</button>' +
          (q.customerQuoteId ? ' <span class="sr-faint">Customer quote built ✓</span>' : "");
        box.appendChild(row);
        // v77: vendor job notes + price details render under the row,
        // and the work order's photos hydrate into the same block.
        var info = document.createElement("div");
        info.className = "q-office-info";
        if (q.workOrderId) info.setAttribute("data-qwo", q.workOrderId);
        info.innerHTML = quoteOfficeInfoHtml(q, null);
        box.appendChild(info);
        hydrateQuotePhotos(q);
      });
    });
  }

  /* ----- Customer quotes: staff build them from a vendor quote ----- */
  // Pipeline step 7 of Edwin's flow: vendor quote lands in Quotes to
  // review -> staff build the CUSTOMER quote (vendor price + margin) ->
  // the customer signs on quote-sign.html (full payment or 20% deposit)
  // -> signed quotes list here, portal history for the customer, and a
  // "Collect payment" task on the Tasks page. Saving also schedules the
  // day-3 / day-7 follow-up tasks; a signature closes them automatically
  // (see cqHandleSigned). The customer NEVER sees the vendor amount.
  var cqCtx = null; // { quoteId, quote, vendorAmount } while the builder is open

  function cqMoney(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "$" + (v % 1 === 0 ? String(v) : v.toFixed(2));
  }
  function cqParseEmail(contact) {
    var m = String(contact || "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0].toLowerCase() : "";
  }

  function openCustomerQuoteBuilder(quoteId) {
    cqCtx = null;
    $("cqBody").innerHTML = '<h3 id="cqTitle">Build customer quote</h3><p class="sr-faint" style="margin-top:10px">Loading the vendor quote…</p>';
    $("cqModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    db.collection("quotes").doc(quoteId).get().then(function (qsnap) {
      if (!qsnap.exists) {
        $("cqBody").innerHTML = '<h3 id="cqTitle">Build customer quote</h3><p class="aerr" style="margin-top:10px">That vendor quote could not be found.</p>';
        return;
      }
      var q = qsnap.data();
      var woP = q.workOrderId
        ? db.collection("work_orders").doc(q.workOrderId).get().then(function (s) { return s.exists ? s.data() : null; }).catch(function () { return null; })
        : Promise.resolve(null);
      woP.then(function (wo) {
        var leadP = wo && wo.sourceLeadId
          ? db.collection("hot_leads").doc(wo.sourceLeadId).get().then(function (s) { return s.exists ? s.data() : null; }).catch(function () { return null; })
          : Promise.resolve(null);
        var custP = wo && wo.sourceLeadId
          ? db.collection("customers").where("leadId", "==", wo.sourceLeadId).limit(1).get().then(function (s) { return s.empty ? null : s.docs[0].data(); }).catch(function () { return null; })
          : Promise.resolve(null);
        Promise.all([leadP, custP]).then(function (res) {
          renderCustomerQuoteBuilder(quoteId, q, wo, res[0], res[1]);
        });
      });
    }).catch(function (e) {
      $("cqBody").innerHTML = '<h3 id="cqTitle">Build customer quote</h3><p class="aerr" style="margin-top:10px">Could not load: ' + esc(e.message || e) + "</p>";
    });
  }
  function closeCustomerQuoteBuilder() {
    $("cqModal").classList.add("hidden");
    if ($("custModal").classList.contains("hidden") && $("hlNoteModal").classList.contains("hidden")) {
      document.body.style.overflow = "";
    }
    cqCtx = null;
  }

  function cqAddonRowHtml(label, amount) {
    return '<div class="cq-addon" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input type="text" class="cq-addon-label" placeholder="Optional extra, e.g. Pressure wash the driveway" value="' + esc(label || "") + '" style="flex:1;min-width:0">' +
      '<input type="number" class="cq-addon-amount" min="0" step="0.01" inputmode="decimal" placeholder="0" value="' + (amount != null && amount !== "" ? esc(amount) : "") + '" style="width:130px;flex:none">' +
      '<button type="button" class="mini danger" data-cq-addon-remove aria-label="Remove add-on">×</button></div>';
  }

  function cqItemRowHtml(label, amount) {
    return '<div class="cq-item" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
      '<input type="text" class="cq-item-label" placeholder="What is included" value="' + esc(label || "") + '" style="flex:1;min-width:0">' +
      '<input type="number" class="cq-item-amount" min="0" step="0.01" inputmode="decimal" placeholder="0" value="' + (amount != null && amount !== "" ? esc(amount) : "") + '" style="width:130px;flex:none">' +
      '<button type="button" class="mini danger" data-cq-remove aria-label="Remove line item">×</button></div>';
  }

  function renderCustomerQuoteBuilder(quoteId, q, wo, lead, cust) {
    var vendorAmount = Math.round((parseFloat(q.price) || 0) * 100) / 100;
    cqCtx = { quoteId: quoteId, quote: q, vendorAmount: vendorAmount };
    var name = woCustomerName(wo) || (lead && lead.name) || (cust && cust.name) || "";
    var contact = (lead && lead.contact) || (cust && (cust.contact || [cust.phone, cust.email].filter(Boolean).join(" · "))) || "";
    var address = (wo && wo.address) || (lead && lead.address) || (cust && cust.address) || "";
    var service = (wo && (wo.category || wo.title)) || (lead && lead.service) || "";
    var firstLabel = (wo && (wo.category || wo.title)) || service || "";
    $("cqBody").innerHTML = '<h3 id="cqTitle">Build customer quote</h3>' +
      '<p class="sr-faint" style="margin-bottom:14px">Vendor quote from ' + esc(q.vendorBusiness || "vendor") + ": <strong>" + esc(cqMoney(vendorAmount)) + "</strong>" +
      (q.duration ? " · " + esc(q.duration) : "") + ". Set the customer price below. The customer never sees the vendor number.</p>" +
      // v77: the vendor's job notes, price details, and the work order's
      // photos sit right here while staff price the job (Edwin, Oct 19).
      quoteOfficeInfoHtml(q, wo) +
      '<form id="cqForm" class="aform">' +
      '<div class="row2"><label>Customer name<input type="text" id="cq-name" value="' + esc(name) + '" required></label>' +
      '<label>Contact (phone · email)<input type="text" id="cq-contact" value="' + esc(contact) + '"></label></div>' +
      '<div class="row2"><label>Service address<input type="text" id="cq-address" value="' + esc(address) + '"></label>' +
      '<label>Service<input type="text" id="cq-service" value="' + esc(service) + '"></label></div>' +
      '<label style="margin-bottom:6px">Line items (what the customer sees)</label>' +
      '<div id="cq-items">' + cqItemRowHtml(firstLabel, vendorAmount) + "</div>" +
      '<button type="button" class="mini" id="cq-add-item">Add line</button>' +
      '<label style="margin:14px 0 6px">Optional add-ons <span style="font-weight:400;color:var(--m-faint,#999)">(the customer can add these on the sign page; not in the total unless they pick them)</span></label>' +
      '<div id="cq-addons"></div>' +
      '<button type="button" class="mini" id="cq-add-addon">Add add-on</button>' +
      '<div id="cq-math" style="margin:16px 0;padding:14px 16px;border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:.95rem"></div>' +
      '<div class="row2"><label>Quote valid for<select id="cq-expiry"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option></select></label>' +
      '<label>Notes for the customer (optional)<input type="text" id="cq-notes" placeholder="Terms line shown on the quote"></label></div>' +
      '<p class="aerr hidden" id="cq-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="cq-save">Create customer quote</button></div>' +
      "</form>";
    $("cqForm").addEventListener("submit", saveCustomerQuote);
    $("cq-add-item").addEventListener("click", function () {
      var div = document.createElement("div");
      div.innerHTML = cqItemRowHtml("", "");
      var row = div.firstChild;
      $("cq-items").appendChild(row);
      var lbl = row.querySelector(".cq-item-label");
      if (lbl) lbl.focus();
      cqRecalc();
    });
    $("cq-add-addon").addEventListener("click", function () {
      var div = document.createElement("div");
      div.innerHTML = cqAddonRowHtml("", "");
      $("cq-addons").appendChild(div.firstChild);
    });
    $("cq-addons").addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-cq-addon-remove]") : null;
      if (!b) return;
      var row = b.closest(".cq-addon");
      if (row) row.remove();
    });
    $("cq-items").addEventListener("input", cqRecalc);
    $("cq-items").addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-cq-remove]") : null;
      if (!b) return;
      var row = b.closest(".cq-item");
      if (!row) return;
      if ($("cq-items").querySelectorAll(".cq-item").length > 1) row.remove();
      else { row.querySelector(".cq-item-label").value = ""; row.querySelector(".cq-item-amount").value = ""; }
      cqRecalc();
    });
    // Prefill optional add-ons from the vendor's on-site scan (Oct 19):
    // vendor prices land in the rows as the starting point; staff raise
    // them to customer prices before saving. Source: the quote's addons,
    // falling back to the work order's vendorAddons.
    (function () {
      var scan = (q && Array.isArray(q.addons) && q.addons.length) ? q.addons : ((wo && Array.isArray(wo.vendorAddons)) ? wo.vendorAddons : []);
      if (!scan.length) return;
      scan.forEach(function (a) {
        var div = document.createElement("div");
        div.innerHTML = cqAddonRowHtml(a.label || "", a.price != null ? a.price : (a.amount != null ? a.amount : ""));
        $("cq-addons").appendChild(div.firstChild);
      });
      var hint = document.createElement("p");
      hint.className = "sr-faint";
      hint.style.margin = "6px 0 0";
      hint.textContent = "Prefilled from the vendor's add-on scan at HIS prices. Raise each amount to the customer price before saving.";
      $("cq-addons").appendChild(hint);
    })();
    cqRecalc();
  }

  function cqItemsTotal() {
    var total = 0;
    Array.prototype.forEach.call(document.querySelectorAll("#cq-items .cq-item"), function (row) {
      total += parseFloat(row.querySelector(".cq-item-amount").value) || 0;
    });
    return Math.round(total * 100) / 100;
  }
  function cqRecalc() {
    var box = $("cq-math");
    if (!box || !cqCtx) return;
    var total = cqItemsTotal();
    var vendor = cqCtx.vendorAmount || 0;
    var margin = Math.round((total - vendor) * 100) / 100;
    var pct = total > 0 ? Math.round((margin / total) * 100) : 0;
    var warn = total < vendor;
    box.innerHTML = "Vendor quote <strong>" + esc(cqMoney(vendor)) + "</strong> · Your margin <strong" +
      (warn ? ' style="color:#ff9d9d"' : "") + ">" + esc(cqMoney(margin)) + " (" + pct + "%)</strong> · Customer total <strong>" + esc(cqMoney(total)) + "</strong>" +
      (warn ? '<div style="color:#ff9d9d;margin-top:6px;font-size:.88rem">Warning: the customer total is below the vendor quote. PrimeGuard would lose money on this job.</div>' : "");
  }

  /* Create a tasks doc unless a matching one already exists. Dedupes on
     entityId + exact title; openOnly=true skips only when an OPEN task
     matches (follow-ups), false skips on any match (one-time notices).
     Resolves true when the task exists or was created, false on error. */
  function cqAddTaskOnce(title, details, dueKey, entityId, entityName, createdBy, openOnly) {
    return db.collection("tasks").where("entityId", "==", entityId).limit(50).get()
      .then(function (qs) {
        var dupe = false;
        qs.forEach(function (doc) {
          var t = doc.data();
          if (!t || t.title !== title) return;
          if (openOnly && t.done) return;
          dupe = true;
        });
        if (dupe) return true;
        return db.collection("tasks").add({
          title: title,
          details: details,
          dueDate: dueKey,
          assigneeEmail: "",
          entityType: "customer_quote",
          entityId: entityId,
          entityName: entityName || "",
          done: false,
          createdBy: createdBy || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          doneAt: null
        }).then(function () { return true; });
      })
      .catch(function () { return false; });
  }

  function cqCreateFollowUps(cqId, docData, todayKey) {
    var name = docData.customerName || "Customer";
    var total = cqMoney(docData.total);
    var sent = fmtFollowDate(todayKey);
    var exp = fmtFollowDate(docData.expiresAt);
    var d1 = "Day 2-3 follow-up on the " + total + " quote sent " + sent + ". Call or message, answer questions, note the reply on the customer record. Stop follow-ups if they reply or sign.";
    var d2 = "Final follow-up on the " + total + " quote sent " + sent + ". It expires " + exp + ". One last check-in: answer any questions and note the reply on the customer record. If they do not reply, let the quote expire and note the lead as cold.";
    return Promise.all([
      cqAddTaskOnce("Quote follow-up: " + name, d1, tkShiftKey(todayKey, 3), cqId, name, docData.createdBy, true),
      cqAddTaskOnce("Quote follow-up #2: " + name, d2, tkShiftKey(todayKey, 7), cqId, name, docData.createdBy, true)
    ]).catch(function () {});
  }

  function saveCustomerQuote(e) {
    e.preventDefault();
    if (!cqCtx) return;
    var err = $("cq-err"); err.classList.add("hidden");
    function fail(msg) { err.textContent = msg; err.classList.remove("hidden"); }
    var name = $("cq-name").value.trim();
    if (!name) { fail("Customer name is required."); return; }
    var items = [];
    Array.prototype.forEach.call(document.querySelectorAll("#cq-items .cq-item"), function (row) {
      var label = row.querySelector(".cq-item-label").value.trim();
      var amount = Math.round((parseFloat(row.querySelector(".cq-item-amount").value) || 0) * 100) / 100;
      if (label || amount) items.push({ label: label || "Service", amount: amount });
    });
    var addons = [];
    Array.prototype.forEach.call(document.querySelectorAll("#cq-addons .cq-addon"), function (row) {
      var label = row.querySelector(".cq-addon-label").value.trim();
      var amount = Math.round((parseFloat(row.querySelector(".cq-addon-amount").value) || 0) * 100) / 100;
      if (label && amount > 0) addons.push({ label: label, amount: amount });
    });
    var total = Math.round(items.reduce(function (s, it) { return s + it.amount; }, 0) * 100) / 100;
    if (!items.length || total <= 0) { fail("Add at least one line item with an amount."); return; }
    var contact = $("cq-contact").value.trim();
    var days = parseInt($("cq-expiry").value, 10) || 14;
    var todayKey = localDateKey(new Date());
    var docData = {
      vendorQuoteId: cqCtx.quoteId,
      workOrderId: cqCtx.quote.workOrderId || null,
      vendorId: cqCtx.quote.vendorId || null,
      vendorAmount: cqCtx.vendorAmount,
      items: items,
      addons: addons,
      total: total,
      customerName: name,
      customerContact: contact,
      customerEmail: cqParseEmail(contact),
      address: $("cq-address").value.trim(),
      service: $("cq-service").value.trim(),
      notes: $("cq-notes").value.trim(),
      status: "sent",
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: tkShiftKey(todayKey, days),
      signedName: null,
      signedAt: null,
      payChoice: null,
      notifiedSigned: false
    };
    var btn = $("cq-save"); btn.disabled = true; btn.textContent = "Creating…";
    db.collection("customer_quotes").add(docData).then(function (ref) {
      var newId = ref.id;
      var patch = db.collection("quotes").doc(cqCtx.quoteId).update({ customerQuoteId: newId }).catch(function () {});
      var fus = cqCreateFollowUps(newId, docData, todayKey);
      return Promise.all([patch, fus]).then(function () { return newId; });
    }).then(function (newId) {
      logActivity("Built a customer quote for " + name);
      showCustomerQuoteShare(newId, docData);
      loadQuotes();
    }).catch(function (e2) {
      fail("Could not save: " + (e2.message || e2));
    }).finally(function () {
      var b2 = $("cq-save");
      if (b2) { b2.disabled = false; b2.textContent = "Create customer quote"; }
    });
  }

  function showCustomerQuoteShare(newId, docData) {
    var link = "https://primeguardmia.com/quote-sign.html?id=" + newId;
    var first = String(docData.customerName || "there").trim().split(/\s+/)[0] || "there";
    var subject = "Your PrimeGuard quote";
    var body = "Hi " + first + ",\n\n" +
      "Your PrimeGuard quote is ready: " + (docData.service || "your service") + " for " + cqMoney(docData.total) +
      ", valid until " + fmtFollowDate(docData.expiresAt) + ".\n\n" +
      "Review and sign here: " + link + "\n\n" +
      "You can pay in full, or put 20% down to schedule and pay the rest when the job is done.\n\n" +
      "Questions? Call us at (786) 422-9674.\n\n" +
      "PrimeGuard Preservation LLC";
    var mailto = "mailto:" + encodeURIComponent(docData.customerEmail || "") +
      "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    $("cqBody").innerHTML = '<h3 id="cqTitle">Customer quote ready ✓</h3>' +
      '<p style="margin-top:8px">' + esc(docData.customerName) + " · " + esc(cqMoney(docData.total)) + " · valid until " + esc(fmtFollowDate(docData.expiresAt)) + "</p>" +
      '<label style="display:block;margin-top:14px;font-size:.85rem;color:var(--muted)">Sign link<input type="text" id="cq-link" readonly value="' + esc(link) + '" style="margin-top:6px;width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:.92rem;font-family:inherit"></label>' +
      '<div class="sr-actions" style="margin-top:14px">' +
      '<button class="btn btn-gold btn-sm" type="button" id="cq-copy">Copy link</button>' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(mailto) + '">Email to customer</a>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="cq-done">Done</button></div>' +
      '<p class="sr-faint" style="margin-top:12px">Two follow-up tasks are on the Tasks page (day 3 and day 7). They close themselves if the customer signs.</p>';
    var copyBtn = $("cq-copy");
    copyBtn.addEventListener("click", function () {
      var inp = $("cq-link");
      function done() { copyBtn.textContent = "Copied ✓"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inp.value).then(done).catch(function () {
          inp.select(); try { document.execCommand("copy"); } catch (e) {} done();
        });
      } else { inp.select(); try { document.execCommand("copy"); } catch (e) {} done(); }
    });
    $("cq-done").addEventListener("click", closeCustomerQuoteBuilder);
  }

  /* ----- Signed customer quotes: list + signature side effects ----- */
  // Runs inside loadQuotes. Everything here is best-effort: failures are
  // swallowed so the vendor quote review flow is never disturbed (and so
  // the section stays quiet until the customer_quotes rules publish).
  function loadCustomerQuotes() {
    var box = $("ad-cq-signed-list");
    liveOn("cq", db.collection("customer_quotes").orderBy("createdAt", "desc").limit(50), function (qs) {
        var signed = [], awaiting = [];
        qs.forEach(function (d) {
          var q = d.data();
          if (q && q.status === "signed") signed.push({ id: d.id, q: q });
          else if (q && q.status === "sent") awaiting.push({ id: d.id, q: q });
        });
        var pbox = $("ad-cq-pending-list");
        if (pbox) {
          if (!awaiting.length) {
            pbox.innerHTML = '<p style="color:var(--faint)">No customer quotes waiting on a signature right now.</p>';
          } else {
            pbox.innerHTML = "";
            awaiting.forEach(function (it) {
              var q = it.q;
              var sdMs = tsMs(q.createdAt);
              var sd = sdMs ? new Date(sdMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
              var exMs = tsMs(q.expiresAt);
              var ex = exMs ? new Date(exMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
              var link = "https://primeguardmia.com/quote-sign.html?id=" + it.id;
              var row = document.createElement("div"); row.className = "arow";
              row.innerHTML = '<div class="grow"><strong>' + esc(q.customerName || "Customer") + " - " + esc(cqMoney(q.total)) + "</strong><small>" +
                esc(q.service || "") + (sd ? " \u00b7 sent " + esc(sd) : "") + (ex ? " \u00b7 expires " + esc(ex) : "") + "</small></div>" +
                '<button type="button" class="mini" data-cqcopylink="' + esc(link) + '">Copy sign link</button>' +
                '<span class="pill p-pend">Awaiting signature</span>';
              pbox.appendChild(row);
            });
            pbox.querySelectorAll("[data-cqcopylink]").forEach(function (b) {
              b.addEventListener("click", function () {
                var link = b.getAttribute("data-cqcopylink");
                function done() { b.textContent = "Copied \u2713"; setTimeout(function () { b.textContent = "Copy sign link"; }, 2000); }
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
                else done();
              });
            });
          }
        }
        signed.forEach(function (it) { cqHandleSigned(it.id, it.q); });
      },
      function () {});
  }

  function cqHandleSigned(cqId, q) {
    try {
      if (!cqId || !q) return;
      // A signed quote closes its own follow-up sequence.
      db.collection("tasks").where("entityId", "==", cqId).limit(50).get()
        .then(function (qs) {
          qs.forEach(function (doc) {
            var t = doc.data();
            if (t && !t.done && typeof t.title === "string" && t.title.indexOf("Quote follow-up") === 0) {
              doc.ref.update({
                done: true,
                doneAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              }).catch(function () {});
            }
          });
        })
        .catch(function () {});
      if (q.notifiedSigned) return;
      var total = Number(q.total) || 0;
      var dueNow = q.payChoice === "deposit20"
        ? (Number(q.amountDueNow) || Math.round(total * 0.2))
        : total;
      var choiceLabel = q.payChoice === "deposit20" ? "20% deposit" : "Full payment";
      var title = "Collect payment: " + (q.customerName || "Customer") + " — " + cqMoney(dueNow) + " (" + choiceLabel + ")";
      var details = (q.customerName || "The customer") + " signed the " + cqMoney(total) + " quote and chose " +
        (q.payChoice === "deposit20" ? "the 20% deposit" : "full payment") + ". Amount to collect now: " + cqMoney(dueNow) +
        ". Send the secure Stripe payment link for that amount, confirm the payment landed, then schedule the job and send the work order to the vendor.";
      cqAddTaskOnce(title, details, localDateKey(new Date()), cqId, q.customerName || "", "System (quote signed)", false)
        .then(function (ok) {
          if (ok) return db.collection("customer_quotes").doc(cqId).update({ notifiedSigned: true });
        })
        .catch(function () {});
    } catch (e) {}
  }

  /* ----- Contracts tab (v53, Edwin's direction 2026-10-17) -----
     Signed agreements live here permanently. Quotes to Review keeps
     only files still waiting on action; once a customer signs, the
     contract is the record and the CRM profile is the customer's home. */
  function loadContracts() {
    var box = $("ad-contracts-list");
    if (!box) return;
    liveOn("contracts", db.collection("customer_quotes").orderBy("createdAt", "desc").limit(100), function (qs) {
        var signed = [];
        qs.forEach(function (d) { var q = d.data(); if (q && q.status === "signed") signed.push({ id: d.id, q: q }); });
        var badge = $("pg-nav-b-contracts");
        if (badge) { badge.textContent = signed.length; badge.style.display = signed.length ? "" : "none"; }
        if (!signed.length) { box.innerHTML = '<p style="color:var(--faint)">No signed contracts yet. The first signed agreement lands here.</p>'; return; }
        db.collection("customers").limit(300).get().then(function (cs) {
          var byEmail = {}, byName = {};
          cs.forEach(function (cd) {
            var c = cd.data() || {};
            var em = String(c.email || "").toLowerCase();
            if (em) byEmail[em] = cd.id;
            String(c.contact || "").split(/[\u00b7,;]/).forEach(function (p) { var pp = p.trim().toLowerCase(); if (/@/.test(pp)) byEmail[pp] = cd.id; });
            if (c.name) byName[String(c.name).toLowerCase()] = cd.id;
          });
          var woGets = signed.map(function (it) {
            return it.q.workOrderId ? db.collection("work_orders").doc(it.q.workOrderId).get().catch(function () { return null; }) : Promise.resolve(null);
          });
          Promise.all(woGets).then(function (wos) {
            box.innerHTML = "";
            signed.forEach(function (it, ix) {
              var q = it.q;
              var email = (/@/.test(q.contact || "") ? q.contact : "") || q.customerEmail || "";
              var custId = (email && byEmail[String(email).toLowerCase()]) || byName[String(q.customerName || "").toLowerCase()] || "";
              var sdMs = tsMs(q.signedAt);
              var sd = sdMs ? new Date(sdMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
              var paid = !!q.paidAt;
              var due = Number(q.amountDueNow) || 0;
              var wo = wos[ix] && wos[ix].exists ? wos[ix].data() : null;
              var nv = "";
              if (wo && wo.scheduledFor) {
                var nms = tsMs(wo.scheduledFor);
                if (nms) nv = "Next visit " + new Date(nms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + (wo.status === "done" ? " (last job done)" : "");
              }
              var row = document.createElement("div"); row.className = "arow";
              row.innerHTML = '<div class="grow"><strong>' + esc(q.customerName || "Customer") + " - " + esc(cqMoney(q.total)) + '</strong><small>' +
                esc(q.service || "") + (sd ? " \u00b7 signed " + esc(sd) : "") + (q.signedName ? " \u00b7 signed by " + esc(q.signedName) : "") +
                " \u00b7 " + (q.payChoice === "deposit20" ? "20% deposit plan" : "Full payment plan") + (nv ? " \u00b7 " + esc(nv) : "") + '</small></div>' +
                (paid ? '<span class="pill p-done">Paid</span>' : (due > 0 ? '<span class="pill p-pend">' + esc(cqMoney(due)) + ' due</span>' : '<span class="pill p-done">Signed</span>')) +
                (q.agreementDriveUrl ? '<a class="mini" style="text-decoration:none" target="_blank" rel="noopener" href="' + esc(q.agreementDriveUrl) + '">Signed agreement</a>' : "") +
                (custId ? '<button type="button" class="mini" data-contract-cust="' + esc(custId) + '">Open in CRM</button>' : "");
              box.appendChild(row);
            });
            box.querySelectorAll("[data-contract-cust]").forEach(function (b) {
              b.addEventListener("click", function () {
                var id = b.getAttribute("data-contract-cust");
                var navBtn = document.querySelector('[data-atab="customers"]');
                if (navBtn) navBtn.click();
                setTimeout(function () { openCustomer(id); }, 60);
              });
            });
          });
        }).catch(function () { box.innerHTML = '<p style="color:var(--faint)">Contracts could not load just now.</p>'; });
      },
      function () { box.innerHTML = '<p style="color:var(--faint)">Contracts could not load just now.</p>'; });
  }

  function loadVendors() {
    liveOn("vendors", db.collection("vendors").orderBy("createdAt", "desc").limit(50), function (qs) {
      var box = $("ad-vendor-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No vendors registered yet.</p>'; return; }
      box.innerHTML = "";
      var shown = 0;
      qs.forEach(function (d) {
        var v = d.data();
        var st = v.status || (v.verified ? "approved" : "pending");
        if (st === "archived" || st === "rejected") return; // removed vendors live in the Archived & rejected section below
        shown++;
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(v.business) + "</strong><small>" + esc(v.name || "") + " · " + esc(v.phone || "") + " · " + (v.areas || []).join(", ") + "</small></div>" +
          pill(st) +
          ' <button class="mini" data-vopen="' + d.id + '">' + (isAdmin ? "Review" : "Open") + "</button>" +
          (isAdmin ? ' <button class="mini" data-varchive="' + d.id + '">Archive</button>' : "");
        box.appendChild(row);
      });
      if (!shown) box.innerHTML = '<p style="color:var(--faint)">No vendors registered yet.</p>';
    });
  }

  function loadTeam() {
    if (!isAdmin) return;
    function renderTeamFromCache() {
      var qs = liveCache["team"], iq = liveCache["teaminv"];
      if (!qs) return;
      var box = $("ad-team-list");
      box.innerHTML = "<h4 style='margin-bottom:8px'>Team</h4>";
      if (qs.empty) box.innerHTML += '<p style="color:var(--faint)">No acquisition managers yet.</p>';
      qs.forEach(function (d) {
        var s = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(s.email) + "</strong><small>" + esc(roleLabel(s.role)) + "</small></div>" +
          ' <button class="mini danger" data-staffdel="' + d.id + '">Remove</button>';
        box.appendChild(row);
      });
      if (!iq || iq.empty) return;
      box.innerHTML += "<h4 style='margin:12px 0 8px'>Pending invites</h4>";
      iq.forEach(function (d) {
        var inv = d.data() || {};
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(d.id) + "</strong><small>" + esc(roleLabel(inv.role)) + " · pending</small></div>" +
          ' <button class="mini danger" data-invdel="' + d.id + '">Cancel</button>';
        box.appendChild(row);
      });
    }
    liveOn("team", db.collection("staff"), function () { renderTeamFromCache(); });
    liveOn("teaminv", db.collection("staff_invites"), function () { renderTeamFromCache(); });
  }

  var woVendorCache = [];
  // The send-target cache: EVERY approved or pending vendor (archived
  // and rejected stay out), with the fields the send preview needs.
  function woCacheVendors(qs) {
    woVendorCache = [];
    qs.forEach(function (d) {
      var v = d.data();
      var st = vStatus(v);
      if (st !== "approved" && st !== "pending") return;
      woVendorCache.push({
        id: d.id,
        business: v.business || v.name || "Vendor",
        name: v.name || "",
        email: v.email || "",
        status: st
      });
    });
  }
  function loadVendorOptions() {
    liveOn("vopts", db.collection("vendors"), function (qs) {
      var sel = $("wo-assign");
      sel.innerHTML = '<option value="broadcast">All vendors (broadcast)</option>';
      qs.forEach(function (d) {
        var v = d.data();
        if (v.status === "archived") return;
        var o = document.createElement("option");
        o.value = d.id; o.textContent = (v.business || v.name) + " - " + (v.areas || []).join(", ");
        sel.appendChild(o);
      });
      woCacheVendors(qs);
      loadWorkOrders(); // refresh rows so the Send-to-vendors selects get vendor names
    });
  }

  // ---------- Work order form ----------
  $("wo-photos").addEventListener("change", function (e) {
    pendingPhotos = [];
    $("wo-preview").innerHTML = "";
    Array.prototype.forEach.call(e.target.files, function (f) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var url = c.toDataURL("image/jpeg", 0.82);
        pendingPhotos.push({ filename: f.name, mimeType: "image/jpeg", data: url.split(",")[1] });
        var th = document.createElement("img"); th.src = url;
        $("wo-preview").appendChild(th);
      };
      var fr = new FileReader();
      fr.onload = function () { img.src = fr.result; };
      fr.readAsDataURL(f);
    });
  });

  $("ad-woform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("wo-error"), okEl = $("wo-ok");
    errEl.classList.add("hidden"); okEl.classList.add("hidden");
    var btn = $("wo-submit"); btn.disabled = true;
    var isEdit = !!editingId;
    btn.textContent = isEdit ? "Saving..." : "Creating...";

    var assignVal = $("wo-assign").value;
    var wo = {
      title: $("wo-title").value.trim(),
      kind: $("wo-kind").value,
      category: $("wo-category").value,
      area: $("wo-area").value,
      details: $("wo-details").value.trim(),
      pay: $("wo-pay").value.trim(),
      broadcast: assignVal === "broadcast",
      vendorId: assignVal === "broadcast" ? null : assignVal,
      vendorBusiness: null
    };
    if (wo.vendorId) {
      var opt = $("wo-assign").selectedOptions[0];
      wo.vendorBusiness = opt.textContent.split(" - ")[0];
    }
    // Geocode the property once at save so live arrival tracking has
    // coordinates to measure against (edits included: a corrected
    // address refreshes the pin).
    var geoP = geocodeAddress(wo.address);

    function save(urls) {
      if (isEdit) {
        // keep existing photos unless new ones were added in this edit
        var upd = Object.assign({}, wo);
        if (urls && urls.length) upd.photos = urls;
        return db.collection("work_orders").doc(editingId).update(upd);
      }
      wo.status = "open";
      wo.photos = urls || [];
      wo.createdBy = me.email;
      wo.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("work_orders").add(wo);
    }

    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    var uploadP = (pendingPhotos.length && endpoint)
      ? fetch(endpoint, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ type: "photo-upload", folder: "work-order-photos", photos: pendingPhotos }) })
        .then(function (r) { return r.json(); }).then(function (out) { return out.urls || []; })
      : Promise.resolve([]);

    Promise.all([uploadP, geoP]).then(function (res) {
      if (res[1]) { wo.propertyLat = res[1].lat; wo.propertyLng = res[1].lng; }
      else if (!wo.address) { wo.propertyLat = null; wo.propertyLng = null; }
      return save(res[0]);
    }).then(function () {
      logActivity(isEdit ? "Edited a work order" : "Created a work order");
    }).then(function () {
      okEl.classList.remove("hidden");
      resetWoForm();
      loadAll();
    }).catch(function (err) {
      errEl.textContent = err.message; errEl.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; btn.textContent = editingId ? "Save changes" : "Create work order"; });
  });

  // ---------- Invite form ----------
  var lastInvite = null;
  $("inv-role").addEventListener("change", function () {
    $("inv-custom-wrap").classList.toggle("hidden", $("inv-role").value !== "custom");
  });
  function inviteRole() {
    var r = $("inv-role").value;
    if (r === "custom") {
      var c = $("inv-custom").value.trim();
      return c ? "custom:" + c : "";
    }
    return r;
  }
  function roleLabel(role) {
    if (!role) return "Acquisition specialist";
    if (role === "acquisition") return "Acquisition specialist";
    if (role === "admin") return "Admin";
    if (role.indexOf("custom:") === 0) return role.slice(7);
    return role;
  }
  function inviteMessage(email, role) {
    return "Hi,\n\nEdwin Lora is inviting you to join the PrimeGuard team as " + roleLabel(role) + ".\n\n" +
      "To accept:\n1. Go to https://primeguardmia.com/admin.html\n" +
      "2. Click \"Continue with Google\" and sign in with this email address (" + email + ")\n" +
      "3. Your staff access activates automatically.\n" +
      "Note: PrimeGuard systems record account activity for operations and security.\n\n" +
      "Questions? Call Edwin at (786) 422-9674.\n\n- PrimeGuard Preservation LLC";
  }
  $("ad-inviteform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("inv-error"), okEl = $("inv-ok");
    errEl.classList.add("hidden"); okEl.classList.add("hidden");
    var email = $("inv-email").value.trim().toLowerCase();
    var role = inviteRole();
    if (!role) { errEl.textContent = "Type a custom role name."; errEl.classList.remove("hidden"); return; }
    db.collection("staff_invites").doc(email).set({
      email: email, role: role, invitedBy: me.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      lastInvite = { email: email, role: role };
      logActivity("Invited " + email + " as " + roleLabel(role));
      $("inv-ok-email").textContent = email;
      $("inv-ok-role").textContent = roleLabel(role);
      okEl.classList.remove("hidden");
      $("inv-email").value = ""; $("inv-custom").value = "";
      loadTeam();
    }).catch(function (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); });
  });
  $("inv-send-email").addEventListener("click", function () {
    if (!lastInvite) return;
    var subject = "You're invited to join the PrimeGuard team";
    window.location.href = "mailto:" + encodeURIComponent(lastInvite.email) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(inviteMessage(lastInvite.email, lastInvite.role));
  });
  $("inv-copy").addEventListener("click", function () {
    if (!lastInvite) return;
    var txt = inviteMessage(lastInvite.email, lastInvite.role);
    function done() { $("inv-copy").textContent = "Copied!"; setTimeout(function () { $("inv-copy").textContent = "Copy invite text"; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(done);
    else done();
  });

  // ---------- Add to calendar (bridges to the cal2 module's window.openApptEditor) ----------
  function openCal(prefill) {
    if (typeof window.openApptEditor === "function") window.openApptEditor(prefill);
  }
  function woColorId(category) {
    var map = { "Lawn care": "10", "Pressure washing": "7", "Home maintenance": "5" };
    return map[category] || "8";
  }
  function calFromWorkOrder(id) {
    db.collection("work_orders").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var w = snap.data();
      var notes = [w.vendorBusiness ? "Vendor: " + w.vendorBusiness : "Not assigned yet",
        w.pay ? "Pay: " + w.pay : "", w.details || ""].filter(Boolean).join("\n");
      openCal({
        title: (w.title || "Work order") + " - " + (w.vendorBusiness || "Crew visit"),
        address: w.address || w.area || "",
        colorId: woColorId(w.category),
        notes: notes
      });
    });
  }
  function calFromQuote(id) {
    db.collection("quotes").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var q = snap.data();
      function build(wo) {
        var notes = [q.vendorBusiness ? "Vendor: " + q.vendorBusiness : "",
          q.price ? "Quoted price: $" + q.price : "",
          q.duration ? "Duration: " + q.duration : "",
          q.vendorPhone ? "Vendor phone: " + q.vendorPhone : "",
          q.notes ? "Quote notes: " + q.notes : ""].filter(Boolean).join("\n");
        openCal({
          title: ((wo && wo.title) || q.vendorBusiness || "Job") + " - scheduled work",
          address: (wo && (wo.address || wo.area)) || "",
          colorId: wo ? woColorId(wo.category) : "8",
          notes: notes
        });
      }
      if (q.workOrderId) {
        db.collection("work_orders").doc(q.workOrderId).get()
          .then(function (ws) { build(ws.exists ? ws.data() : null); })
          .catch(function () { build(null); });
      } else build(null);
    });
  }
  function calFromLead(id) {
    var d = null;
    for (var i = 0; i < hlLeads.length; i++) if (hlLeads[i].id === id) { d = hlLeads[i].d; break; }
    if (!d) return;
    var notes = [d.contact ? "Contact: " + d.contact : "", d.source ? "Source: " + d.source : "",
      d.service ? "Service: " + d.service : "", d.notes || ""].filter(Boolean).join("\n");
    openCal({
      title: (d.name || "Lead") + " - estimate visit",
      address: d.address || d.area || "",
      colorId: "6",
      notes: notes
    });
  }

  // ---------- Row actions ----------
  document.addEventListener("click", function (e) {
    var t = e.target, d = t.dataset;
    var hlActionEl = t.closest ? t.closest("[data-hlstagefilter],[data-hltempfilter],[data-hldetail],[data-hlstep],[data-hlpark],[data-hlrevive]") : null;
    if (hlActionEl) d = hlActionEl.dataset;
    var woFilterEl = t.closest ? t.closest("[data-wofilter]") : null;
    if (woFilterEl) d = woFilterEl.dataset;
    var woOpenEl = t.closest ? t.closest("[data-woopen]") : null;
    if (woOpenEl) d = woOpenEl.dataset;
    var woPhotoEl = t.closest ? t.closest("[data-wophoto]") : null;
    if (woPhotoEl) d = woPhotoEl.dataset;
    var woPrevEl = t.closest ? t.closest("[data-woprevlang],[data-woprevconfirm],[data-woprevcancel]") : null;
    if (woPrevEl) d = woPrevEl.dataset;
    var custVisitEl = t.closest ? t.closest("[data-custvisit]") : null;
    if (custVisitEl) d = custVisitEl.dataset;
    var tkfEl = t.closest ? t.closest("[data-tkfilter]") : null;
    if (tkfEl) { tkEntityFilter = tkfEl.getAttribute("data-tkfilter") || "all"; loadFollowUps(); }
    var taskForEl = t.closest ? t.closest("[data-taskfor]") : null;
    if (taskForEl) d = taskForEl.dataset;
    if (d.taskfor) {
      var tp = String(d.taskfor).split("|"), tName = "";
      if (tp[0] === "hot_lead" && !pgLeadGate(hlLeadData(tp[1]))) return;
      if (tp[0] === "hot_lead") { var lr = hlLeads.find(function (x) { return x.id === tp[1]; }); if (lr && lr.d) tName = lr.d.name || ""; }
      if (tp[0] === "work_order") { var wr = woOrders.find(function (x) { return x.id === tp[1]; }); var wd = wr ? (wr.d || wr) : null; if (wd) tName = wd.customerName || wd.title || ""; }
      openTaskForm({ entityType: tp[0], entityId: tp[1], entityName: tName });
    }
    if (d.wodone) {
      logActivity("Marked a work order done");
      var woRef = db.collection("work_orders").doc(d.wodone);
      woRef.get().then(function (snap) {
        var w = snap.exists ? snap.data() : null;
        return woRef.update({ status: "done" }).then(function () { return w; });
      }).then(function (w) {
        // Completing a job also stamps the linked CRM customer (via the
        // source lead or a direct customerId) so last-service stays current.
        return custServicedFromWorkOrder(w);
      }).then(function () { loadAll(); }, function () { loadAll(); });
    }
    var woPriceEl = t.closest ? t.closest("[data-wopricesave]") : null;
    if (woPriceEl) {
      var card = woPriceEl.closest(".woq-card");
      var inp = card ? card.querySelector(".wo-price-in") : null;
      var val = inp ? parseFloat(inp.value) : 0;
      if (val > 0) {
        db.collection("work_orders").doc(woPriceEl.getAttribute("data-wopricesave")).update({ jobPrice: val }).then(function () { loadAll(); });
        logActivity("Set a job price for costing");
      }
    }
    if (d.wodel && confirm("Delete this work order?")) { logActivity("Deleted a work order"); db.collection("work_orders").doc(d.wodel).delete().then(loadAll); }
    if (d.woedit) enterEditMode(d.woedit);
    if (d.wonotes) openWorkOrderNotes(d.wonotes);
    if (d.woopen) { woOpenId = (woOpenId === d.woopen) ? null : d.woopen; renderWorkOrders(); }
    if (d.wosend) openWoSendPreview(d.wosend, t);
    if (d.woboard) toggleWoBoard(d.woboard, t);
    if (d.woprevlang) { woPrevLang = d.woprevlang; renderWoPrev(); }
    if (d.woprevconfirm) confirmWoSend(woPrevEl || t);
    if (d.woprevcancel) closeWoSendPreview();
    if (d.custvisit) openCustVisitDetail(d.custvisit);
    if (d.wophoto) openPhotoLightbox(d.wophoto, d.wophotoorig);
    if (t.closest && t.closest("#pgLightbox")) closePhotoLightbox();
    if (t.id === "woPrevClose" || t.id === "woPrevModal") closeWoSendPreview();
    if (t.id === "woNoteClose" || t.id === "woNoteModal") closeWorkOrderNotes();
    if (t.id === "vdClose" || t.id === "vdModal") closeVendor();
    if (d.fudone) {
      db.collection("item_notes").doc(d.fudone).update({
        followUpDone: true,
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
        completedByEmail: me ? me.email : "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        logActivity("Completed a follow-up");
        loadFollowUps();
        if (woNoteId) loadItemNotes("work_order", woNoteId, $("wonNotes"));
        if (vdId) loadItemNotes("vendor", vdId, $("vdNotes"));
        if (hlNoteId) loadItemNotes("hot_lead", hlNoteId, $("hlnNotes"));
        if (custId) loadItemNotes("customer", custId, $("cnNotes"));
      }).catch(function () {});
    }
    if (d.fuopen) {
      var fp = d.fuopen.split("|");
      if (fp[0] === "vendor") openVendor(fp[1]);
      else if (fp[0] === "work_order") openWorkOrderNotes(fp[1]);
      else if (fp[0] === "hot_lead") openHotLeadNotes(fp[1]);
      else if (fp[0] === "customer") openCustomer(fp[1]);
    }
    if (d.fusnooze) {
      var nref = db.collection("item_notes").doc(d.fusnooze);
      nref.get().then(function (s) {
        if (!s.exists || !s.data().followUpOn) return;
        return nref.update({
          followUpOn: tkShiftKey(s.data().followUpOn, 1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }).then(function () { logActivity("Snoozed a follow-up by a day"); loadFollowUps(); }).catch(function () {});
    }
    if (d.fuundo) {
      db.collection("item_notes").doc(d.fuundo).update({
        followUpDone: false,
        completedAt: firebase.firestore.FieldValue.delete(),
        completedByEmail: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () { logActivity("Reopened a follow-up"); loadFollowUps(); }).catch(function () {});
    }
    if (d.fueditdate) { var fep = d.fueditdate.split("|"); openTaskDateModal("note", fep[0], fep[1]); }
    if (d.taskdone) {
      db.collection("tasks").doc(d.taskdone).update({
        done: true,
        doneAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () { logActivity("Completed a task"); loadFollowUps(); }).catch(function () {});
    }
    if (d.tasksnooze) {
      var tref = db.collection("tasks").doc(d.tasksnooze);
      tref.get().then(function (s) {
        if (!s.exists) return;
        return tref.update({
          dueDate: tkShiftKey(s.data().dueDate || localDateKey(new Date()), 1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }).then(function () { logActivity("Snoozed a task by a day"); loadFollowUps(); }).catch(function () {});
    }
    if (d.taskundo) {
      db.collection("tasks").doc(d.taskundo).update({
        done: false,
        doneAt: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () { logActivity("Reopened a task"); loadFollowUps(); }).catch(function () {});
    }
    if (d.taskeditdate) { var tep = d.taskeditdate.split("|"); openTaskDateModal("task", tep[0], tep[1]); }
    if (t.id === "taskFormClose" || t.id === "taskFormModal") closeTaskForm();
    if (t.id === "taskDateClose" || t.id === "taskDateModal") closeTaskDateModal();
    if (t.id === "cqClose" || t.id === "cqModal") closeCustomerQuoteBuilder();
    if (d.custdetail) openCustomer(d.custdetail);
    if (d.custnotes) openCustomer(d.custnotes);
    if (d.custtask) {
      var ctd = custRowData(d.custtask);
      openTaskForm({ entityType: "customer", entityId: d.custtask, entityName: (ctd && ctd.name) || "Customer" });
    }
    if (d.custemail) logActivity("Emailed customer");
    if (d.custedit) openCustomerForm(d.custedit);
    if (d.custdel) deleteCustomer(d.custdel);
    if (d.wofilter) { woFilter = d.wofilter; renderWorkOrders(); }
    if (d.wotocrm) {
      makeCustomerFromWO(d.wotocrm).then(function () { renderWorkOrders(); })
        .catch(function (e) { alert("Could not create customer: " + (e.message || e)); });
    }
    if (d.woviewcustomer) {
      var wvCustId = d.woviewcustomer;
      var woNavBtn = document.querySelector('#pgNavDrawer [data-atab="customers"]');
      if (woNavBtn) woNavBtn.click();
      openCustomer(wvCustId);
    }
    if (d.hlmakecustomer) {
      var mkId = d.hlmakecustomer;
      if (pgLeadGate(hlLeadData(mkId))) {
        makeCustomerFromLead(mkId).then(function () {
          loadHotLeads();
          if (hlNoteId === mkId) openHotLeadNotes(mkId);
        }).catch(function (e) { alert("Could not create customer: " + (e.message || e)); });
      }
    }
    if (d.hlviewcustomer) {
      var cvId = d.hlviewcustomer;
      closeHotLeadNotes();
      var custNavBtn = document.querySelector('#pgNavDrawer [data-atab="customers"]');
      if (custNavBtn) custNavBtn.click();
      openCustomer(cvId);
    }
    if (t.id === "custClose" || t.id === "custModal") closeCustomer();
    if (t.id === "custFormClose" || t.id === "custFormModal") closeCustomerForm();
    if (d.hlstagefilter) { hlStageFilter = d.hlstagefilter; renderHotLeads(); }
    if (d.hltempfilter) { hlTempFilter = d.hltempfilter; renderHotLeads(); }
    if (d.hldetail) openHotLeadNotes(d.hldetail);
    if (d.hlstep && d.stage) hlStageChanged(d.hlstep, d.stage);
    if (d.hlpark) hlStageChanged(d.hlpark, "cold");
    if (d.hlrevive) hlStageChanged(d.hlrevive, "contacted");
    if (d.hlnotes) openHotLeadNotes(d.hlnotes);
    if (d.hledit) openHotLeadForm(d.hledit);
    if (d.hldel) deleteHotLead(d.hldel);
    if (d.hlbell) markLeadSeen(d.hlbell);
    if (d.hlconvert) openHotLeadConvert(d.hlconvert);
    if (d.hlclaim) claimHotLead(d.hlclaim);
    if (d.hlrelease) releaseHotLead(d.hlrelease);
    if (d.hlviewwo) { closeHotLeadConvert(); closeHotLeadNotes(); gotoWorkOrders(); }
    if (t.id === "hlNoteClose" || t.id === "hlNoteModal") closeHotLeadNotes();
    if (t.id === "hlFormClose" || t.id === "hlFormModal") closeHotLeadForm();
    if (t.id === "hlConvertClose" || t.id === "hlConvertModal") closeHotLeadConvert();
    if (d.calwo) calFromWorkOrder(d.calwo);
    if (d.calquote) calFromQuote(d.calquote);
    if (d.callead) calFromLead(d.callead);
    if (d.qok) {
      var parts = d.qok.split("|"), qid = parts[0], woid = parts[1];
      db.collection("quotes").doc(qid).get().then(function (qsnap) {
        var q = qsnap.data();
        return db.collection("quotes").doc(qid).update({ status: "approved" }).then(function () {
          return db.collection("work_orders").doc(woid).update({
            vendorId: q.vendorId, vendorBusiness: q.vendorBusiness,
            payAgreed: q.price, status: "accepted"
          });
        });
      }).then(function () { logActivity("Approved a quote"); loadAll(); });
    }
    if (d.qno) { logActivity("Declined a quote"); db.collection("quotes").doc(d.qno).update({ status: "declined" }).then(loadAll); }
    if (d.cqbuild) openCustomerQuoteBuilder(d.cqbuild);
    if (d.vopen) openVendor(d.vopen);
    if (d.vrestore) restoreVendor(d.vrestore);
    if (d.varchive) archiveVendorById(d.varchive);
    if (d.staffdel && confirm("Remove this team member?")) { logActivity("Removed a team member"); db.collection("staff").doc(d.staffdel).delete().then(loadTeam); }
    if (d.invdel) { logActivity("Cancelled a team invite"); db.collection("staff_invites").doc(d.invdel).delete().then(loadTeam); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var modalOpen = !$("vdModal").classList.contains("hidden") ||
      !$("woNoteModal").classList.contains("hidden") || !$("hlNoteModal").classList.contains("hidden") ||
      !$("hlFormModal").classList.contains("hidden") || !$("hlConvertModal").classList.contains("hidden") ||
      !$("custModal").classList.contains("hidden") || !$("custFormModal").classList.contains("hidden") ||
      !$("taskFormModal").classList.contains("hidden") || !$("taskDateModal").classList.contains("hidden") ||
      !$("cqModal").classList.contains("hidden") ||
      !$("woPrevModal").classList.contains("hidden") ||
      !$("pgLightbox").classList.contains("hidden") ||
      !$("cal2Modal").classList.contains("hidden");
    if (!$("pgLightbox").classList.contains("hidden")) closePhotoLightbox();
    if (!$("woPrevModal").classList.contains("hidden")) closeWoSendPreview();
    if (!$("cqModal").classList.contains("hidden")) closeCustomerQuoteBuilder();
    if (!$("vdModal").classList.contains("hidden")) closeVendor();
    if (!$("woNoteModal").classList.contains("hidden")) closeWorkOrderNotes();
    if (!$("hlConvertModal").classList.contains("hidden")) closeHotLeadConvert();
    if (!$("hlNoteModal").classList.contains("hidden")) closeHotLeadNotes();
    if (!$("hlFormModal").classList.contains("hidden")) closeHotLeadForm();
    if (!$("taskDateModal").classList.contains("hidden")) closeTaskDateModal();
    if (!$("taskFormModal").classList.contains("hidden")) closeTaskForm();
    if (!$("custFormModal").classList.contains("hidden")) closeCustomerForm();
    if (!$("custModal").classList.contains("hidden")) closeCustomer();
    if (bellIsOpen()) setBellOpen(false);
    if (!modalOpen && navOpen) setNavOpen(false);
  });

  /* ============================================================
     WEBSITE TRAFFIC — ownerOnlyTraffic (Edwin's hard rule, Oct 19)
     ONLY the owner account (edblucorp@gmail.com = ADMIN_EMAIL) can
     ever see website traffic. Not Natasha, not any staff account,
     not even a staff doc with role "admin". Three locks:
       1. The nav button ships hidden (style="display:none") and is
          revealed in the auth handler ONLY when isAdmin is true,
          which is set from user.email === ADMIN_EMAIL alone.
       2. startTraffic() re-checks me.email === ADMIN_EMAIL before
          the Firestore listener is ever created; for anyone else
          the visits query never runs, so no traffic data is even
          fetched into their browser.
       3. renderTraffic() re-checks the same email before painting,
          so even a forced-visible section stays empty for staff.
     Data: the "visits" collection written by the site.js beacon
     (type "view" pageviews + type "click" events, city-level geo).
     Firestore rules mirror this gate: reads are owner-email-only.
     ============================================================ */
  var trafficStarted = false, trafficRows = [], trafficCities = [];
  var trafficMap = null, trafficMarkers = null, trafficMapWanted = false;

  function startTraffic() {
    if (!me || me.email !== ADMIN_EMAIL) return; // ownerOnlyTraffic
    if (trafficStarted) return;
    trafficStarted = true;
    var since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    liveOn("traffic",
      db.collection("visits").where("ts", ">=", since).orderBy("ts", "desc").limit(5000),
      function (qs) {
        trafficRows = [];
        qs.forEach(function (d) { trafficRows.push(d.data()); });
        renderTraffic();
      },
      function () { /* collection may not exist yet; panel stays at zero */ });
  }

  // __AGG_BEGIN__ (extracted verbatim by the aggregation simulation)
  function aggregateTraffic(rows, nowMs) {
    var dayMs = 24 * 3600 * 1000;
    var todayKey = new Date(nowMs).toISOString().slice(0, 10);
    var cutoff30 = nowMs - 30 * dayMs, cutoff7 = nowMs - 7 * dayMs;
    var tiles = { visitorsToday: 0, viewsToday: 0, views7: 0, views30: 0 };
    var sessionsToday = {}, byDay = {}, byPage = {}, bySource = {}, byClick = {};
    var cities = {}, sessions = {};
    rows.forEach(function (r) {
      var t = Date.parse(r.ts || "");
      if (isNaN(t) || t < cutoff30) return;
      var sid = r.session || "";
      if (sid) {
        if (!sessions[sid]) sessions[sid] = { events: [], source: "", city: "", region: "", start: r.ts, last: r.ts };
        var s = sessions[sid];
        s.events.push(r);
        if (!s.source && r.source) s.source = r.source;
        if (!s.city && r.city) { s.city = r.city; s.region = r.region || ""; }
        if (String(r.ts) < String(s.start)) s.start = r.ts;
        if (String(r.ts) > String(s.last)) s.last = r.ts;
        if (r.city && isFinite(+r.lat) && isFinite(+r.lng)) {
          var ck = r.city + "|" + (r.region || "");
          if (!cities[ck]) cities[ck] = { city: r.city, region: r.region || "", country: r.country || "", lat: +r.lat, lng: +r.lng, sessions: {} };
          cities[ck].sessions[sid] = 1;
        }
      }
      if (r.type === "click") {
        if (r.target) byClick[r.target] = (byClick[r.target] || 0) + 1;
        return;
      }
      // pageview: type "view" (rows without a type count as views too)
      if (String(r.ts).slice(0, 10) === todayKey) {
        tiles.viewsToday++;
        if (sid) sessionsToday[sid] = 1;
      }
      if (t >= cutoff7) tiles.views7++;
      tiles.views30++;
      var dk = String(r.ts).slice(0, 10);
      byDay[dk] = (byDay[dk] || 0) + 1;
      if (r.path) byPage[r.path] = (byPage[r.path] || 0) + 1;
      var src = r.source || "Direct";
      bySource[src] = (bySource[src] || 0) + 1;
    });
    tiles.visitorsToday = Object.keys(sessionsToday).length;
    var series = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(nowMs - i * dayMs), k = d.toISOString().slice(0, 10);
      series.push({ day: k, label: (d.getMonth() + 1) + "/" + d.getDate(), views: byDay[k] || 0 });
    }
    function topN(map, n) {
      return Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
        .sort(function (a, b) { return (b.v - a.v) || (a.k < b.k ? -1 : 1); }).slice(0, n);
    }
    var cityList = Object.keys(cities).map(function (k) {
      var c = cities[k];
      return { city: c.city, region: c.region, country: c.country, lat: c.lat, lng: c.lng, visitors: Object.keys(c.sessions).length };
    }).sort(function (a, b) { return b.visitors - a.visitors; });
    var journeys = Object.keys(sessions).map(function (sid) {
      var s = sessions[sid], views = 0, clicks = 0, segs = [];
      var evs = s.events.slice().sort(function (a, b) { return String(a.ts) < String(b.ts) ? -1 : 1; });
      evs.forEach(function (e) {
        if (e.type === "click") {
          clicks++;
          if (segs.length) segs[segs.length - 1].clicks.push(e.target || "");
          else segs.push({ path: e.path || "/", clicks: [e.target || ""] });
        } else { views++; segs.push({ path: e.path || "/", clicks: [] }); }
      });
      return { session: sid, start: s.start, last: s.last, source: s.source || "Direct",
               city: s.city || "", region: s.region || "", views: views, clicks: clicks, segs: segs };
    }).filter(function (j) { return j.views > 0; })
      .sort(function (a, b) { return String(a.last) < String(b.last) ? 1 : -1; }).slice(0, 20);
    return { tiles: tiles, series: series, topPages: topN(byPage, 8),
             topSources: topN(bySource, 8), topClicks: topN(byClick, 8),
             cities: cityList, journeys: journeys };
  }
  // __AGG_END__

  function trafficBarList(list, color) {
    if (!list.length) return '<p style="color:var(--faint)">No data yet.</p>';
    var max = Math.max.apply(null, list.map(function (x) { return x.v; }).concat([1]));
    return list.map(function (x) {
      return homeBar(esc(x.k), String(x.v), x.v / max * 100, color);
    }).join("");
  }

  function renderTraffic() {
    if (!me || me.email !== ADMIN_EMAIL) return; // ownerOnlyTraffic
    var agg = aggregateTraffic(trafficRows, Date.now());
    trafficCities = agg.cities;
    if ($("tr-visitors")) $("tr-visitors").textContent = agg.tiles.visitorsToday;
    if ($("tr-views-today")) $("tr-views-today").textContent = agg.tiles.viewsToday;
    if ($("tr-views-7")) $("tr-views-7").textContent = agg.tiles.views7;
    if ($("tr-views-30")) $("tr-views-30").textContent = agg.tiles.views30;
    var maxV = Math.max.apply(null, agg.series.map(function (s) { return s.views; }).concat([1]));
    if ($("tr-chart")) $("tr-chart").innerHTML = agg.series.map(function (s) {
      return homeBar(s.label, String(s.views), s.views / maxV * 100, "linear-gradient(90deg,#ffd968,#d9ab2b)");
    }).join("");
    if ($("tr-pages")) $("tr-pages").innerHTML = trafficBarList(agg.topPages, "linear-gradient(90deg,#0e7c86,#0b5560)");
    if ($("tr-sources")) $("tr-sources").innerHTML = trafficBarList(agg.topSources, "linear-gradient(90deg,#0e7c86,#0b5560)");
    if ($("tr-clicks")) $("tr-clicks").innerHTML = trafficBarList(agg.topClicks, "linear-gradient(90deg,#ffd968,#d9ab2b)");
    if ($("tr-cities")) {
      $("tr-cities").innerHTML = agg.cities.length
        ? '<table style="width:100%;border-collapse:collapse;font-size:.9rem"><tr><th style="text-align:left;padding:6px 8px">City</th><th style="text-align:left;padding:6px 8px">Region</th><th style="text-align:right;padding:6px 8px">Visitors</th></tr>' +
          agg.cities.map(function (c) {
            return '<tr><td style="padding:6px 8px;border-top:1px solid var(--line,#e6dfca)">' + esc(c.city) + '</td><td style="padding:6px 8px;border-top:1px solid var(--line,#e6dfca)">' + esc(c.region) + '</td><td style="padding:6px 8px;border-top:1px solid var(--line,#e6dfca);text-align:right"><strong>' + c.visitors + '</strong></td></tr>';
          }).join("") + "</table>"
        : '<p style="color:var(--faint)">No visitor locations yet. Locations are city-level only, from the visitor\u2019s connection, and appear once the tracker has run for a while.</p>';
    }
    if ($("tr-journeys")) {
      $("tr-journeys").innerHTML = agg.journeys.length
        ? agg.journeys.map(function (j) {
            var seq = j.segs.map(function (sg) {
              var c = sg.clicks.filter(Boolean);
              return esc(sg.path) + (c.length ? ' <span style="color:#8a6d2a">(clicked: ' + esc(c.join(", ")) + ')</span>' : "");
            }).join(' <span style="color:var(--faint)">&#8250;</span> ');
            var when = "";
            try { when = new Date(j.start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) {}
            var meta = [esc(j.source), j.city ? esc(j.city + (j.region ? ", " + j.region : "")) : "", when,
                        j.views + (j.views === 1 ? " view" : " views"), j.clicks + (j.clicks === 1 ? " click" : " clicks")]
                       .filter(Boolean).join(" · ");
            return '<div style="padding:10px 0;border-top:1px solid var(--line,#e6dfca)"><div style="font-weight:600;line-height:1.5">' + seq + '</div><div style="font-size:.82rem;color:var(--faint)">' + meta + '</div></div>';
          }).join("")
        : '<p style="color:var(--faint)">No journeys yet.</p>';
    }
    if (trafficMapWanted) plotTrafficMap();
  }

  // Leaflet loads lazily, only when the owner first opens this tab,
  // so the rest of the admin never pays for the map library.
  function ensureLeaflet(cb) {
    if (window.L) { cb(); return; }
    if (!document.querySelector('link[data-leaflet-css]')) {
      var lk = document.createElement("link");
      lk.rel = "stylesheet"; lk.setAttribute("data-leaflet-css", "1");
      lk.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(lk);
    }
    var sc = document.createElement("script");
    sc.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    sc.onload = function () { cb(); };
    sc.onerror = function () { /* map stays a blank panel; table still works */ };
    document.head.appendChild(sc);
  }
  function plotTrafficMap() {
    var el = $("tr-map");
    if (!el || !window.L) return;
    if (!trafficMap) {
      trafficMap = L.map(el).setView([27.9, -81.6], 7); // centered on Florida
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18, attribution: "&copy; OpenStreetMap contributors"
      }).addTo(trafficMap);
      trafficMarkers = L.layerGroup().addTo(trafficMap);
    }
    trafficMarkers.clearLayers();
    trafficCities.forEach(function (c) {
      L.circleMarker([c.lat, c.lng], {
        radius: 5 + Math.min(11, c.visitors * 2), color: "#8a6d2a",
        weight: 2, fillColor: "#d9ab2b", fillOpacity: 0.75
      }).bindPopup("<strong>" + esc(c.city) + (c.region ? ", " + esc(c.region) : "") + "</strong><br>" +
        c.visitors + (c.visitors === 1 ? " visitor" : " visitors")).addTo(trafficMarkers);
    });
    setTimeout(function () { try { trafficMap.invalidateSize(); } catch (e) {} }, 80);
  }
  document.querySelectorAll('[data-atab="traffic"]').forEach(function (b) {
    b.addEventListener("click", function () {
      if (!me || me.email !== ADMIN_EMAIL) return; // ownerOnlyTraffic
      trafficMapWanted = true;
      ensureLeaflet(function () { plotTrafficMap(); });
      setTimeout(function () { if (trafficMap) { try { trafficMap.invalidateSize(); } catch (e) {} } }, 300);
    });
  });
})();

// ---------- Calendar: native month view on the real Google calendar ----------
(function () {
  var grid = document.getElementById("cal2-grid");
  if (!grid) return;
  var CAL_ID = "48927766c8739f4467e8110bd996256daa3664caa204634e9a370f699220c30e@group.calendar.google.com";
  var CLIENT_ID = "1031375547061-mlni2m610tne83odo52honlp9af47rnk.apps.googleusercontent.com";
  var COLORS = { "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#188038", "11": "#d50000" };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var now = new Date();
  var viewY = now.getFullYear(), viewM = now.getMonth();
  var events = []; // raw Google events for the visible window
  var accessToken = null, tokenExp = 0, tokenClient = null, started = false;
  var editingId = null;
  var fromExternal = false; // editor was opened via window.openApptEditor (another admin section)

  function $(id) { return document.getElementById(id); }
  function status(t) { $("cal2-status").textContent = t; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- Google sign-in (GIS token client, warmed up at page load) ----
  function loadGis() {
    return new Promise(function (resolve, reject) {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Could not load Google sign-in.")); };
      document.head.appendChild(s);
    });
  }
  function initTokenClient() {
    if (tokenClient || !window.google || !google.accounts || !google.accounts.oauth2) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: function () {},
      error_callback: function () {},
    });
  }
  loadGis().then(initTokenClient).catch(function () {});
  function ensureToken() {
    // Reuse the token Google already gave us (about an hour) instead of
    // asking Google again on every load/save, which kept bouncing Edwin
    // back to a sign-in screen.
    if (accessToken && Date.now() < tokenExp) return Promise.resolve(accessToken);
    return loadGis().then(function () {
      initTokenClient();
      return new Promise(function (resolve, reject) {
        tokenClient.callback = function (resp) {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            tokenExp = Date.now() + ((resp.expires_in ? resp.expires_in - 60 : 3000) * 1000);
            resolve(accessToken);
          }
        };
        tokenClient.error_callback = function () {
          reject(new Error("Google sign-in was closed or blocked. If Google shows a 'hasn't verified this app' warning, tap Advanced, then 'Go to PrimeGuard Admin', then Allow."));
        };
        tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
      });
    });
  }
  function api(path, method, body) {
    function attempt(token) {
      return fetch("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL_ID) + path, {
        method: method || "GET",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (r) {
        if (r.status === 401) { accessToken = null; tokenExp = 0; throw new Error("EXPIRED"); }
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error("Google Calendar said " + r.status + ". " + (r.status === 403 || r.status === 404 ? "Your Google account may not have edit access to the PrimeGuard calendar yet." : String(t).slice(0, 160)));
          });
        }
        return r.status === 204 ? null : r.json();
      });
    }
    return ensureToken().then(attempt).catch(function (e) {
      if (e && e.message === "EXPIRED") return ensureToken().then(attempt);
      throw e;
    });
  }

  // ---- Data ----
  function gridWindow() {
    var first = new Date(viewY, viewM, 1);
    var start = new Date(first); start.setDate(1 - first.getDay());
    var end = new Date(start); end.setDate(start.getDate() + 42);
    return { start: start, end: end };
  }
  function loadEvents() {
    var w = gridWindow();
    status("Loading appointments...");
    var q = "/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=" +
      encodeURIComponent(w.start.toISOString()) + "&timeMax=" + encodeURIComponent(w.end.toISOString());
    return api(q).then(function (res) {
      events = (res && res.items) || [];
      render();
      status("Tap any day to add an appointment. Tap an appointment to edit or delete it. Everything saves to the real PrimeGuard Google calendar.");
    }).catch(function (e) {
      status(e && e.message ? e.message : "Could not load the calendar.");
      render();
    });
  }
  function evDay(ev) {
    if (ev.start && ev.start.date) return ev.start.date; // all-day
    if (ev.start && ev.start.dateTime) return ev.start.dateTime.slice(0, 10);
    return "";
  }
  function evTime(ev) {
    if (!ev.start || !ev.start.dateTime) return "All day";
    var d = new Date(ev.start.dateTime);
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + (m ? ":" + pad(m) : "") + " " + ap;
  }

  // ---- Render ----
  function render() {
    $("cal2-title").textContent = MONTHS[viewM] + " " + viewY;
    var w = gridWindow();
    var byDay = {};
    events.forEach(function (ev) {
      var k = evDay(ev);
      if (!byDay[k]) byDay[k] = [];
      byDay[k].push(ev);
    });
    var todayK = dayKey(new Date());
    var html = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(w.start); d.setDate(w.start.getDate() + i);
      var k = dayKey(d);
      var list = byDay[k] || [];
      html += '<div class="cal2-cell' + (d.getMonth() !== viewM ? " dim" : "") + (k === todayK ? " today" : "") + '" data-day="' + k + '">' +
        '<span class="cal2-dnum">' + d.getDate() + "</span>";
      list.slice(0, 3).forEach(function (ev) {
        var c = COLORS[ev.colorId] || "#c9a227";
        html += '<span class="cal2-ev" data-ev="' + esc(ev.id) + '" style="background:' + c + '">' + esc(evTime(ev)) + " " + esc(ev.summary || "(no title)") + "</span>";
      });
      if (list.length > 3) html += '<div class="cal2-more">+ ' + (list.length - 3) + " more below</div>";
      html += "</div>";
    }
    grid.innerHTML = html;
    grid.querySelectorAll(".cal2-cell").forEach(function (cell) {
      cell.addEventListener("click", function (e) {
        if (e.target.classList.contains("cal2-ev")) return;
        openEditor(null, cell.getAttribute("data-day"));
        renderDayList(cell.getAttribute("data-day"));
      });
    });
    grid.querySelectorAll(".cal2-ev").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = chip.getAttribute("data-ev");
        var ev = events.filter(function (x) { return x.id === id; })[0];
        if (ev) openEditor(ev, evDay(ev));
      });
    });
  }
  function renderDayList(k) {
    var box = $("cal2-daylist");
    var list = events.filter(function (ev) { return evDay(ev) === k; });
    var parts = k.split("-");
    var label = MONTHS[Number(parts[1]) - 1] + " " + Number(parts[2]) + ", " + parts[0];
    if (!list.length) { box.innerHTML = ""; return; }
    var html = '<h4 style="margin:16px 0 4px">' + esc(label) + "</h4>";
    list.forEach(function (ev) {
      var c = COLORS[ev.colorId] || "#c9a227";
      html += '<button type="button" class="cal2-dayitem" data-ev="' + esc(ev.id) + '"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + c + ';margin-right:8px"></i>' + esc(ev.summary || "(no title)") + (ev.location ? ' <span style="opacity:.7">· ' + esc(ev.location) + "</span>" : "") + '</span><span style="opacity:.8">' + esc(evTime(ev)) + "</span></button>";
    });
    box.innerHTML = html;
    box.querySelectorAll(".cal2-dayitem").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-ev");
        var ev = events.filter(function (x) { return x.id === id; })[0];
        if (ev) openEditor(ev, evDay(ev));
      });
    });
  }

  // ---- Editor modal ----
  function openEditor(ev, dateStr) {
    fromExternal = false;
    editingId = ev ? ev.id : null;
    $("cal2-m-title").textContent = ev ? "Edit appointment" : "New appointment";
    $("cal2-f-delete").classList.toggle("hidden", !ev);
    $("cal2-f-msg").textContent = "";
    $("cal2-f-title").value = ev ? (ev.summary || "") : "";
    $("cal2-f-type").value = ev && ev.colorId ? String(ev.colorId) : "10";
    $("cal2-f-date").value = dateStr || dayKey(new Date());
    if (ev && ev.start && ev.start.dateTime) {
      var s = new Date(ev.start.dateTime), en = new Date(ev.end.dateTime);
      $("cal2-f-start").value = pad(s.getHours()) + ":" + pad(s.getMinutes());
      $("cal2-f-end").value = pad(en.getHours()) + ":" + pad(en.getMinutes());
    } else {
      $("cal2-f-start").value = "09:00";
      $("cal2-f-end").value = "10:00";
    }
    $("cal2-f-addr").value = ev ? (ev.location || "") : "";
    $("cal2-f-notes").value = ev ? (ev.description || "") : "";
    $("cal2Modal").classList.remove("hidden");
  }
  function closeEditor() { $("cal2Modal").classList.add("hidden"); }
  $("cal2-m-close").addEventListener("click", closeEditor);
  $("cal2Modal").addEventListener("click", function (e) { if (e.target === $("cal2Modal")) closeEditor(); });

  // ---- Shared entry point: any admin section can open the editor prefilled ----
  // Runs the same lazy init as opening the Calendar tab (start()), then opens
  // the editor in CREATE mode and applies the caller's prefill. Saving goes
  // through the normal form handler; GIS sign-in happens on Save via
  // ensureToken() and any failure lands in the modal's #cal2-f-msg line.
  window.openApptEditor = function (prefill) {
    prefill = prefill || {};
    start();
    openEditor(null, prefill.date || dayKey(new Date()));
    if (prefill.title != null) $("cal2-f-title").value = prefill.title;
    if (prefill.colorId != null) $("cal2-f-type").value = String(prefill.colorId);
    if (prefill.address != null) $("cal2-f-addr").value = prefill.address;
    if (prefill.notes != null) $("cal2-f-notes").value = prefill.notes;
    fromExternal = true;
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("cal2Modal").classList.contains("hidden")) closeEditor();
  });
  $("cal2-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var title = $("cal2-f-title").value.trim();
    var date = $("cal2-f-date").value, start = $("cal2-f-start").value, end = $("cal2-f-end").value;
    if (!title || !date || !start || !end) { $("cal2-f-msg").textContent = "Fill in the title, date, and both times."; return; }
    if (end <= start) { $("cal2-f-msg").textContent = "End time has to be after the start time."; return; }
    var ev = {
      summary: title,
      colorId: $("cal2-f-type").value,
      location: $("cal2-f-addr").value.trim() || undefined,
      description: $("cal2-f-notes").value.trim() || undefined,
      start: { dateTime: date + "T" + start + ":00", timeZone: "America/New_York" },
      end: { dateTime: date + "T" + end + ":00", timeZone: "America/New_York" },
    };
    var btn = $("cal2-f-save"); btn.disabled = true;
    $("cal2-f-msg").textContent = "Saving...";
    var call = editingId ? api("/events/" + encodeURIComponent(editingId), "PATCH", ev) : api("/events", "POST", ev);
    call.then(function () {
      btn.disabled = false;
      if (fromExternal) {
        // Opened from another section: confirm in place, then close without
        // moving the user to the Calendar tab.
        fromExternal = false;
        $("cal2-f-msg").textContent = "Saved ✓ Added to the calendar.";
        setTimeout(function () { closeEditor(); loadEvents(); }, 1100);
      } else {
        closeEditor();
        loadEvents();
      }
    }).catch(function (err) {
      btn.disabled = false;
      $("cal2-f-msg").textContent = err && err.message ? err.message : "Something went wrong saving that appointment.";
    });
  });
  $("cal2-f-delete").addEventListener("click", function () {
    if (!editingId) return;
    if (!confirm("Delete this appointment?")) return;
    api("/events/" + encodeURIComponent(editingId), "DELETE").then(function () {
      closeEditor();
      loadEvents();
    }).catch(function (err) {
      $("cal2-f-msg").textContent = err && err.message ? err.message : "Could not delete that appointment.";
    });
  });

  // ---- Header controls ----
  $("cal2-prev").addEventListener("click", function () { viewM--; if (viewM < 0) { viewM = 11; viewY--; } $("cal2-daylist").innerHTML = ""; loadEvents(); });
  $("cal2-next").addEventListener("click", function () { viewM++; if (viewM > 11) { viewM = 0; viewY++; } $("cal2-daylist").innerHTML = ""; loadEvents(); });
  $("cal2-today").addEventListener("click", function () { var n = new Date(); viewY = n.getFullYear(); viewM = n.getMonth(); $("cal2-daylist").innerHTML = ""; loadEvents(); });
  $("cal2-refresh").addEventListener("click", loadEvents);

  // ---- Start when the Calendar tab is first opened ----
  function start() { if (started) return; started = true; loadEvents(); }
  var tabBtn = document.querySelector('[data-atab="calendar"]');
  if (tabBtn) tabBtn.addEventListener("click", start);
  if (!$("atab-calendar").classList.contains("hidden")) start();
  render(); // paint the empty grid immediately
})();

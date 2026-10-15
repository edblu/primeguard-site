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
  var woSourceRequestId = null; // service_requests id the WO form was prefilled from (conversion)

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
  syncNavActive("work");

  function resetWoForm() {
    editingId = null;
    woSourceRequestId = null;
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
      woSourceRequestId = null;
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
    if (!user) { show($("ad-loginwrap")); hide($("ad-dash")); document.body.classList.remove("pg-nav-on"); setNavOpen(false, false); return; }
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
      loadAll();
      startTracking();
    });
  });

  function loadAll() { loadStats(); loadWorkOrders(); loadHotLeads(); loadQuotes(); loadVendors(); loadArchivedVendors(); loadTeam(); loadVendorOptions(); loadServiceRequests(); loadReferrals(); loadActivity(); loadFollowUps(); }

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
    db.collection("staff_sessions").orderBy("loginAt", "desc").limit(60).get().then(function (qs) {
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
    }).catch(function () {
      var sb = $("ad-act-status");
      if (sb) sb.innerHTML = '<p style="color:var(--faint)">Activity tracking is built in, but the database rules update has not been applied yet, so no data can be saved or read.</p>';
    });
    db.collection("staff_activity").orderBy("at", "desc").limit(30).get().then(function (qs) {
      var box = $("ad-act-feed");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No activity yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var a = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(a.action) + "</strong><small>" + esc(a.email) + " · " + fmtClock(a.at) + "</small></div>";
        box.appendChild(row);
      });
    }).catch(function () {});
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

  function loadFollowUps() {
    var box = $("ad-fu-list");
    if (!box) return;
    db.collection("item_notes").where("followUpDone", "==", false).limit(100).get().then(function (qs) {
      var items = [];
      qs.forEach(function (d) {
        var n = d.data();
        if (n.followUpOn) items.push({ id: d.id, n: n });
      });
      items.sort(function (a, b) {
        if (a.n.followUpOn !== b.n.followUpOn) return a.n.followUpOn < b.n.followUpOn ? -1 : 1;
        return tsMs(a.n.createdAt) - tsMs(b.n.createdAt);
      });
      var today = localDateKey(new Date());
      var due = 0;
      items.forEach(function (it) { if (it.n.followUpOn <= today) due++; });
      var mb = $("pg-nav-b-followups"); if (mb) mb.textContent = due;
      if (!items.length) { box.innerHTML = '<p style="color:var(--faint)">No open follow-ups. When a note or call gets a follow-up date, it will show up here.</p>'; return; }
      box.innerHTML = "";
      items.forEach(function (it) {
        var n = it.n;
        var state = n.followUpOn < today ? "Overdue" : (n.followUpOn === today ? "Due today" : "Upcoming");
        var cls = n.followUpOn < today ? "p-rev" : (n.followUpOn === today ? "p-pend" : "p-acc");
        var detail = n.kind === "call" ? "Call · " + outcomeLabel(n.outcome) : "Note";
        if (n.text) detail += " · " + n.text;
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(n.entityLabel || "Item") + "</strong><small>" +
          esc(detail) + "<br>Set by " + esc(n.createdByEmail || "") + "</small></div>" +
          '<span class="pill ' + cls + '">' + state + " · " + esc(fmtFollowDate(n.followUpOn)) + "</span>" +
          ' <button class="mini" data-fuopen="' + esc(n.entityType) + "|" + esc(n.entityId) + '">Open</button>' +
          ' <button class="mini" data-fudone="' + it.id + '">Done</button>';
        box.appendChild(row);
      });
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--faint)">Follow-ups could not load yet. The database rules update may still need to be published.</p>';
    });
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
  var hlLeads = []; // cached { id, d } rows from the last loadHotLeads()
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
    db.collection("hot_leads").orderBy("createdAt", "desc").limit(100).get().then(function (qs) {
      hlLeads = [];
      qs.forEach(function (d) { hlLeads.push({ id: d.id, d: d.data() }); });
      renderHotLeads();
      updateHotLeadBadges();
      renderBellPanel();
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--faint)">Hot leads could not load yet. The database rules update may still need to be published.</p>';
    });
  }
  function renderHotLeads() {
    var box = $("ad-hl-list");
    if (!box) return;
    if (!hlLeads.length) {
      box.innerHTML = '<p style="color:var(--faint)">No hot leads yet. When a customer conversation gets serious, add it here with the Add lead button so the whole team can work it.</p>';
      return;
    }
    box.innerHTML = "";
    HL_STAGES.forEach(function (st) {
      var rows = hlLeads.filter(function (it) { return (it.d.stage || "new") === st[0]; });
      var head = document.createElement("h4");
      head.className = "hl-stage-head";
      head.innerHTML = esc(st[1]) + ' <span class="cnt">· ' + rows.length + "</span>";
      box.appendChild(head);
      if (!rows.length) {
        var none = document.createElement("p");
        none.style.cssText = "color:var(--faint);font-size:.85rem;margin:2px 0 6px";
        none.textContent = "None";
        box.appendChild(none);
        return;
      }
      rows.forEach(function (it) {
        var d = it.d;
        var whenMs = tsMs(d.createdAt);
        var when = whenMs ? new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
        var photoCount = Array.isArray(d.photos) ? d.photos.length : 0;
        var opts = HL_STAGES.map(function (s) {
          return '<option value="' + s[0] + '"' + ((d.stage || "new") === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
        }).join("");
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + (d.seen ? "" : '<span class="hl-dot" title="Unseen"></span>') + esc(d.name || "Lead") + "</strong><small>" +
          esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + (d.contact ? " · " + esc(d.contact) : "") +
          (when ? " · " + esc(when) : "") + (d.createdBy ? " · added by " + esc(d.createdBy) : "") + "</small></div>" +
          '<span class="pill p-acc">' + esc(d.source || "Other") + "</span>" +
          (photoCount ? ' <span class="hl-photo-badge" title="Photos on this lead">📷 ' + photoCount + "</span>" : "") +
          '<span class="pill ' + st[2] + '">' + esc(st[1]) + "</span>" +
          '<select class="hl-stage-sel" data-hlstage="' + it.id + '" aria-label="Move stage">' + opts + "</select>" +
          ' <button class="mini" data-hlnotes="' + it.id + '">Notes</button>' +
          ' <button class="mini" data-hledit="' + it.id + '">Edit</button>' +
          ' <button class="mini" data-callead="' + it.id + '">Add to calendar</button>' +
          (d.convertedWorkOrderId
            ? ' <button class="mini" data-hlviewwo="' + it.id + '">Converted ✓</button>'
            : ' <button class="mini" data-hlconvert="' + it.id + '">Convert to quote request</button>') +
          (isAdmin ? ' <button class="mini danger" data-hldel="' + it.id + '">Delete</button>' : "");
        box.appendChild(row);
      });
    });
  }
  function hlStageChanged(id, stage) {
    db.collection("hot_leads").doc(id).update({
      stage: stage,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      logActivity("Moved hot lead to " + hlStageMeta(stage)[1]);
      loadHotLeads();
    }).catch(function (e) { alert("Could not move lead: " + (e.message || e)); loadHotLeads(); });
  }
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.hlstage) hlStageChanged(t.dataset.hlstage, t.value);
  });

  /* ----- Add / edit lead form ----- */
  function openHotLeadForm(id) {
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
    $("hlFormBody").innerHTML = '<h3 id="hlFormTitle">' + (id ? "Edit lead" : "Add lead") + "</h3>" +
      '<form id="hlForm" class="aform" style="margin-top:10px">' +
      '<label>Name<input type="text" id="hl-f-name" required placeholder="Customer name" value="' + esc(d.name || "") + '"></label>' +
      '<label>Contact<input type="text" id="hl-f-contact" placeholder="Phone, Messenger name, or handle" value="' + esc(d.contact || "") + '"></label>' +
      '<div class="row2"><label>Source<select id="hl-f-source">' + srcOpts + "</select></label>" +
      '<label>Stage<select id="hl-f-stage">' + stOpts + "</select></label></div>" +
      '<div class="row2"><label>Service<input type="text" id="hl-f-service" placeholder="Lawn care, cleanup…" value="' + esc(d.service || "") + '"></label>' +
      '<label>Area<input type="text" id="hl-f-area" placeholder="Kendall, Richmond Heights…" value="' + esc(d.area || "") + '"></label></div>' +
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
      var whenMs = tsMs(d.createdAt);
      var photos = Array.isArray(d.photos) ? d.photos : [];
      var mediaLinks = Array.isArray(d.mediaLinks) ? d.mediaLinks : [];
      var convMs = tsMs(d.convertedAt);
      var fullDate = function (ms) { return ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"; };
      var h = '<h3 id="hlNoteTitle">' + esc(d.name || "Lead") + "</h3>" +
        '<p class="sr-meta"><span class="pill ' + st[2] + '">' + esc(st[1]) + '</span><span class="pill p-acc">' + esc(d.source || "Other") + "</span><span>" +
        esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + (d.contact ? " · " + esc(d.contact) : "") +
        (d.address ? " · " + esc(d.address) : "") +
        (whenMs ? " · added " + esc(new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric" })) : "") + "</span></p>" +
        (d.notes ? '<div class="sr-card"><h4>Lead notes</h4><p>' + esc(d.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +
        (photos.length ? '<div class="sr-card"><h4>Photos (' + photos.length + ')</h4><div class="sr-photos">' +
          photos.map(function (u) {
            return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="lead photo" loading="lazy"></a>';
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
        '<p><strong>Photos:</strong> ' + photos.length + ' · <strong>Media links:</strong> ' + mediaLinks.length + '</p>' +
        (d.convertedWorkOrderId
          ? '<p><strong>Quote request:</strong> converted' + (convMs ? " " + esc(fullDate(convMs)) : "") + '</p>' +
            '<div class="sr-actions"><button class="mini" type="button" data-hlviewwo="' + id + '">Open work order</button></div>'
          : '<div class="sr-actions"><button class="mini" type="button" data-hlconvert="' + id + '">Convert to quote request</button></div>') +
        "</div>" +
        '<div class="sr-card"><h4>Calls & notes</h4>' +
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
        '<div class="sr-comments" id="hlnNotes" style="margin-top:14px"></div></div>';
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
      $("hlnSave").addEventListener("click", saveHotLeadNote);
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

  /* ----- Convert a lead into a vendor quote request ----- */
  // Creates a work_orders doc with kind "quote_request" through the exact
  // same doc shape the work-order create form saves (see the ad-woform
  // submit handler), carrying the lead's photos (same hosted URL strings),
  // details, media links and contact info. vendorNotifyPending flags the
  // new work order for the background vendor-notification watch.
  function gotoWorkOrders() {
    var btn = document.querySelector('#pgNavDrawer [data-atab="work"]');
    if (btn) btn.click();
  }
  function openHotLeadConvert(id) {
    var d = hlLeadData(id);
    if (!d || d.convertedWorkOrderId) return;
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
    $("hlConvertBody").innerHTML = '<h3 id="hlConvertTitle">Convert to quote request</h3>' +
      '<p class="sr-faint" style="margin-top:6px">Creates a quote request for ' + esc(d.name || "this lead") +
      ' with everything saved on the lead attached: photos, media links, contact info and notes. It goes live on the vendor portal right away and is flagged for vendor notification.</p>' +
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
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="hl-cv-save">Create quote request</button></div>' +
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
      broadcast: assignVal === "broadcast",
      vendorId: assignVal === "broadcast" ? null : assignVal,
      vendorBusiness: null,
      status: "open",
      photos: (Array.isArray(d.photos) ? d.photos : []).slice(),
      address: $("hl-cv-address").value.trim(),
      sourceLeadId: leadId,
      sourceLeadName: leadName,
      vendorNotifyPending: true,
      vendorNotifyTarget: assignVal === "broadcast" ? "broadcast" : assignVal,
      createdBy: me ? me.email : "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (wo.vendorId) {
      var opt = $("hl-cv-assign").selectedOptions[0];
      if (opt) wo.vendorBusiness = opt.textContent.split(" - ")[0];
    }
    db.collection("work_orders").add(wo).then(function (ref) {
      return db.collection("hot_leads").doc(leadId).update({
        stage: "quoted",
        convertedWorkOrderId: ref.id,
        convertedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      logActivity("Converted hot lead " + leadName + " to quote request");
      $("hlConvertBody").innerHTML = '<h3>Quote request created ✓</h3>' +
        '<p style="margin-top:8px">The quote request for ' + esc(leadName) +
        ' is live on the vendor portal with the lead photos and details attached, and flagged for vendor notification. The lead is now at the Quoted stage with the full history kept.</p>' +
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
      if (b) { b.disabled = false; b.textContent = "Create quote request"; }
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

  /* ---------- Work order notes modal ---------- */
  var woNoteId = null, woNoteTitle = "";
  function openWorkOrderNotes(id) {
    db.collection("work_orders").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      var w = snap.data();
      woNoteId = id; woNoteTitle = w.title || "Work order";
      var box = $("woNoteBody");
      box.innerHTML = '<h3 id="woNoteTitle">' + esc(woNoteTitle) + "</h3>" +
        '<p class="sr-meta">' + pill(w.status) + " <span>" + esc(w.area || "") + " · " + esc(w.vendorBusiness || "broadcast") + "</span></p>" +
        (w.details ? '<div class="sr-card"><h4>Job details</h4><p>' + esc(w.details).replace(/\n/g, "<br>") + "</p></div>" : "") +
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

  function loadReferrals() {
    var box = $("ad-ref-list");
    db.collection("referral_codes").orderBy("createdAt", "desc").limit(50).get().then(function (qs) {
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
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--faint)">Couldn\'t load referral codes.</p>';
    });
  }

  function loadServiceRequests() {
    db.collection("service_requests").orderBy("createdAt", "desc").limit(30).get().then(function (qs) {
      var box = $("ad-sr-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No customer requests yet.</p>'; return; }
      box.innerHTML = "";
      var shown = 0;
      qs.forEach(function (d) {
        var r = d.data();
        if (r.status === "converted") return; // already turned into a work order
        shown++;
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(r.service || "Service request") +
          (r.frequency ? " - " + esc(r.frequency) : "") + "</strong><small>" +
          esc(r.name || "") + (r.phone ? " · " + esc(r.phone) : "") +
          (r.message ? " · " + esc(r.message) : "") + "</small></div>" +
          pill(r.status) +
          ' <button class="mini" data-sropen="' + d.id + '">Open</button>' +
          ' <button class="mini" data-calsr="' + d.id + '">Add to calendar</button>' +
          ' <button class="mini danger" data-srdel="' + d.id + '">Delete</button>';
        box.appendChild(row);
      });
      if (!shown) box.innerHTML = '<p style="color:var(--faint)">No customer requests yet.</p>';
    }).catch(function () {
      $("ad-sr-list").innerHTML = '<p style="color:var(--faint)">Couldn\'t load requests.</p>';
    });
  }

  /* ---------- Request detail modal ---------- */
  var srId = null, srData = null;
  var SR_STATUSES = ["new", "reviewing", "quoted", "scheduled", "in_progress", "done", "cancelled"];

  function srDate(r) {
    try {
      var t = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : (r.createdAt ? new Date(r.createdAt) : null);
      return t ? t.toLocaleString() : "";
    } catch (e) { return ""; }
  }

  function openRequest(id) {
    db.collection("service_requests").doc(id).get().then(function (snap) {
      if (!snap.exists) return;
      srId = id; srData = snap.data();
      renderRequestModal();
      $("srModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
    });
  }
  function closeRequest() {
    $("srModal").classList.add("hidden");
    document.body.style.overflow = "";
    srId = null; srData = null;
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
    db.collection("vendors").where("status", "==", "archived").get().then(function (qs) {
      archivedVendors = [];
      qs.forEach(function (d) { archivedVendors.push({ id: d.id, v: d.data() }); });
      archivedVendors.sort(function (a, b) { return tsMs(b.v.archivedAt) - tsMs(a.v.archivedAt); });
      sec.classList.remove("hidden");
      renderArchivedVendors();
    }).catch(function () {});
  }
  function renderArchivedVendors() {
    var btn = $("ad-vendor-archived-toggle"), box = $("ad-vendor-archived-list");
    if (!btn || !box) return;
    btn.textContent = "Archived (" + archivedVendors.length + ")" + (archivedOpen ? " — hide" : " — show");
    box.classList.toggle("hidden", !archivedOpen);
    if (!archivedOpen) return;
    if (!archivedVendors.length) { box.innerHTML = '<p style="color:var(--faint)">No archived vendors.</p>'; return; }
    box.innerHTML = "";
    archivedVendors.forEach(function (item) {
      var v = item.v;
      var when = v.archivedAt && v.archivedAt.toDate ? v.archivedAt.toDate().toLocaleDateString() : "";
      var row = document.createElement("div"); row.className = "arow";
      row.innerHTML = '<div class="grow"><strong>' + esc(v.business || v.name || "Vendor") + "</strong><small>" +
        esc(v.name || "") + (when ? " · archived " + esc(when) : "") + (v.archivedBy ? " · by " + esc(v.archivedBy) : "") + "</small></div>" +
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

  function renderRequestModal() {
    var r = srData, box = $("srBody");
    var photos = Array.isArray(r.photos) ? r.photos : [];
    var comments = Array.isArray(r.comments) ? r.comments : [];
    var h = '<h3 id="srTitle">' + esc(r.service || "Service request") +
      (r.frequency ? " - " + esc(r.frequency) : "") + '</h3>' +
      '<p class="sr-meta">' + pill(r.status) + ' <span>' + esc(srDate(r)) + '</span>' +
      (r.source ? ' <span>· via ' + esc(r.source) + '</span>' : '') + '</p>' +
      '<div class="sr-grid">' +
      '<div class="sr-card"><h4>Customer</h4>' +
      '<p><strong>' + esc(r.name || "-") + '</strong></p>' +
      (r.phone ? '<p>📞 <a href="tel:' + esc(r.phone.replace(/\D/g, "")) + '">' + esc(r.phone) + '</a></p>' : '') +
      (r.email ? '<p>✉️ <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></p>' : '') +
      (r.address ? '<p>📍 ' + esc(r.address) + '</p>' : '') +
      (r.uid ? '' : '<p class="sr-guest">Guest request (no account)</p>') +
      '</div>' +
      '<div class="sr-card"><h4>Request details</h4>' +
      '<p><strong>Service:</strong> ' + esc(r.service || "-") + '</p>' +
      '<p><strong>Frequency:</strong> ' + esc(r.frequency || "-") + '</p>' +
      (r.message ? '<p><strong>Details:</strong><br>' + esc(r.message).replace(/\n/g, "<br>") + '</p>' : '<p class="sr-faint">No details provided.</p>') +
      '</div></div>';
    if (photos.length) {
      h += '<div class="sr-card"><h4>Photos (' + photos.length + ')</h4><div class="sr-photos">' +
        photos.map(function (u) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="request photo" loading="lazy"></a>';
        }).join("") + '</div></div>';
    }
    h += '<div class="sr-card"><h4>Evaluation</h4>' +
      '<div class="sr-row"><label>Status<br><select id="srStatus">' +
      SR_STATUSES.map(function (s) {
        var label = s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
        return '<option value="' + s + '"' + ((r.status || "new") === s ? " selected" : "") + '>' + label + '</option>';
      }).join("") + '</select></label>' +
      '<button class="btn btn-gold btn-sm" id="srSaveStatus" type="button">Save status</button></div>' +
      '<label>Internal notes<br><textarea id="srNotes" rows="3" placeholder="Notes only the team sees…">' + esc(r.adminNotes || "") + '</textarea></label>' +
      '<button class="btn btn-ghost btn-sm" id="srSaveNotes" type="button" style="margin-top:8px">Save notes</button>' +
      '<p class="aok hidden" id="srSaved">Saved.</p></div>';
    h += '<div class="sr-card"><h4>Comments</h4><div class="sr-comments">' +
      (comments.length ? comments.map(function (c) {
        var when = "";
        try { when = c.at && c.at.toDate ? c.at.toDate().toLocaleString() : ""; } catch (e) {}
        return '<div class="sr-comment"><strong>' + esc(c.by || "") + '</strong><span>' + esc(when) + '</span><p>' + esc(c.text || "").replace(/\n/g, "<br>") + '</p></div>';
      }).join("") : '<p class="sr-faint">No comments yet.</p>') + '</div>' +
      '<div class="sr-row"><input type="text" id="srComment" placeholder="Add a comment…" style="flex:1">' +
      '<button class="btn btn-gold btn-sm" id="srAddComment" type="button">Add</button></div></div>';
    h += '<div class="sr-card"><h4>Quote for customer</h4>' +
      '<p class="sr-faint">Set a price, then set Status to "Quoted" and save - the customer sees it on their dashboard with Approve / Decline buttons.</p>' +
      '<div class="sr-row"><label>Quote price<br><input id="srQuotePrice" placeholder="$0" value="' + esc(r.quotePrice || "") + '"></label></div>' +
      '<label>Quote notes (shown to customer)<br><textarea id="srQuoteNotes" rows="2" placeholder="What the price covers…">' + esc(r.quoteNotes || "") + '</textarea></label></div>';
    h += '<div class="sr-actions">' +
      '<button class="btn btn-gold btn-sm" id="srMakeWO" type="button">Create work order</button>' +
      '<button class="mini" id="srCalBtn" type="button">Add to calendar</button>' +
      '<button class="btn btn-ghost btn-sm" id="srDelete" type="button">Delete request</button></div>';
    box.innerHTML = h;

    $("srClose").addEventListener("click", closeRequest);
    $("srModal").addEventListener("click", function (e) { if (e.target === $("srModal")) closeRequest(); });
    $("vdClose").addEventListener("click", closeVendor);
    $("vdModal").addEventListener("click", function (e) { if (e.target === $("vdModal")) closeVendor(); });
    $("srSaveStatus").addEventListener("click", function () {
      var upd = { status: $("srStatus").value };
      if ($("srQuotePrice")) upd.quotePrice = $("srQuotePrice").value.trim();
      if ($("srQuoteNotes")) upd.quoteNotes = $("srQuoteNotes").value.trim();
      db.collection("service_requests").doc(srId).update(upd).then(function () {
        logActivity("Updated a customer request (" + upd.status + ")");
        srData.status = upd.status; srData.quotePrice = upd.quotePrice; srData.quoteNotes = upd.quoteNotes;
        saved(); loadServiceRequests();
      });
    });
    $("srSaveNotes").addEventListener("click", function () {
      db.collection("service_requests").doc(srId).update({ adminNotes: $("srNotes").value.trim() }).then(function () {
        logActivity("Saved internal notes on a customer request");
        srData.adminNotes = $("srNotes").value.trim(); saved();
      });
    });
    $("srAddComment").addEventListener("click", function () {
      var t = $("srComment").value.trim();
      if (!t) return;
      db.collection("service_requests").doc(srId).update({
        comments: firebase.firestore.FieldValue.arrayUnion({ by: me ? me.email : "team", text: t, at: new Date() })
      }).then(function () { return db.collection("service_requests").doc(srId).get(); }).then(function (s) {
        logActivity("Commented on a customer request");
        srData = s.data(); renderRequestModal();
      });
    });
    $("srDelete").addEventListener("click", function () {
      if (!confirm("Delete this customer request?")) return;
      db.collection("service_requests").doc(srId).delete().then(function () { closeRequest(); loadServiceRequests(); });
    });
    $("srMakeWO").addEventListener("click", function () { requestToWorkOrder(); });
    $("srCalBtn").addEventListener("click", function () { if (srData) openCal(srCalPrefill(srData)); });
    function saved() {
      var el = $("srSaved");
      if (el) { el.classList.remove("hidden"); setTimeout(function () { el.classList.add("hidden"); }, 1800); }
    }
  }

  function requestToWorkOrder() {
    var r = srData;
    var catMap = { "Lawn Care": "Lawn care", "Pressure Washing": "Pressure washing", "Debris & Junk Removal": "Cleanups", "Junk Removal": "Cleanups", "Make-Ready Cleaning": "Cleanups", "Handyman Services": "Handyman" };
    $("wo-title").value = (r.service || "Service") + " - " + (r.name || "customer");
    var cat = catMap[r.service] || "Cleanups";
    var catSel = $("wo-category");
    for (var i = 0; i < catSel.options.length; i++) if (catSel.options[i].value === cat) catSel.selectedIndex = i;
    $("wo-details").value = "Frequency: " + (r.frequency || "One-time") + "\n" +
      (r.message ? r.message + "\n" : "") +
      "\nCustomer: " + (r.name || "") + " " + (r.phone || "") + " " + (r.email || "") +
      (r.address ? "\nAddress: " + r.address : "") +
      "\n(From customer request " + srId + ")";
    woSourceRequestId = srId;
    closeRequest();
    setWoFormCollapsed(false);
    document.getElementById("ad-woform").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadStats() {
    db.collection("work_orders").get().then(function (qs) {
      var open = 0, active = 0;
      qs.forEach(function (d) { var s = d.data().status; if (s === "open") open++; else if (s !== "done") active++; });
      $("as-open").textContent = open; $("as-active").textContent = active;
    });
    db.collection("quotes").where("status", "==", "pending").get().then(function (qs) { $("as-quotes").textContent = qs.size; var mb = $("pg-nav-b-quotes"); if (mb) mb.textContent = qs.size; });
    db.collection("vendors").get().then(function (qs) { var n = 0; qs.forEach(function (d) { if (d.data().status !== "archived") n++; }); $("as-vendors").textContent = n; var mb = $("pg-nav-b-vendors"); if (mb) mb.textContent = n; });
  }

  function pill(s) {
    var cls = { open: "p-open", new: "p-open", accepted: "p-acc", evaluation_accepted: "p-acc", in_progress: "p-acc", review: "p-rev", reviewing: "p-pend", quoted: "p-acc", scheduled: "p-acc", done: "p-done", pending: "p-pend", approved: "p-done", declined: "p-rev", cancelled: "p-rev" }[s] || "p-open";
    return '<span class="pill ' + cls + '">' + esc(String(s || "new").replace(/_/g, " ")) + "</span>";
  }

  function loadWorkOrders() {
    db.collection("work_orders").orderBy("createdAt", "desc").limit(30).get().then(function (qs) {
      var box = $("ad-wo-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No work orders yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var w = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(w.title) + "</strong><small>" + esc(w.area || "") + " · " + esc(w.kind || "job") + " · " + esc(w.vendorBusiness || "broadcast") + "</small></div>" +
          pill(w.status) +
          ' <button class="mini" data-wonotes="' + d.id + '">Notes</button>' +
          ' <button class="mini" data-calwo="' + d.id + '">Add to calendar</button>' +
          (w.status !== "done" ? ' <button class="mini" data-wodone="' + d.id + '">Done</button>' : "") +
          ' <button class="mini danger" data-wodel="' + d.id + '">Delete</button>' +
          ' <button class="mini" data-woedit="' + d.id + '">Edit</button>';
        box.appendChild(row);
      });
    });
  }

  function loadQuotes() {
    db.collection("quotes").orderBy("createdAt", "desc").limit(30).get().then(function (qs) {
      var box = $("ad-quote-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No quotes submitted yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var q = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>$' + esc(q.price) + " - " + esc(q.vendorBusiness || "") + "</strong><small>" + esc(q.notes || "") + " · " + esc(q.duration || "") + " · " + esc(q.vendorPhone || "") + (q.quotePdfUrl ? ' · <a href="' + esc(q.quotePdfUrl) + '" target="_blank" rel="noopener" style="color:var(--gold-bright);font-weight:700">View quote PDF</a>' : "") + "</small></div>" +
          pill(q.status) +
          (q.status === "pending" ? ' <button class="mini" data-qok="' + d.id + "|" + q.workOrderId + '">Approve</button> <button class="mini" data-calquote="' + d.id + '">Add to calendar</button> <button class="mini danger" data-qno="' + d.id + '">Decline</button>' : "");
        box.appendChild(row);
      });
    });
  }

  function loadVendors() {
    db.collection("vendors").orderBy("createdAt", "desc").limit(50).get().then(function (qs) {
      var box = $("ad-vendor-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No vendors registered yet.</p>'; return; }
      box.innerHTML = "";
      var shown = 0;
      qs.forEach(function (d) {
        var v = d.data();
        var st = v.status || (v.verified ? "approved" : "pending");
        if (st === "archived") return; // archived vendors live in the Archived section below
        shown++;
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(v.business) + "</strong><small>" + esc(v.name || "") + " · " + esc(v.phone || "") + " · " + (v.areas || []).join(", ") + "</small></div>" +
          pill(st) +
          ' <button class="mini" data-vopen="' + d.id + '">' + (isAdmin ? "Review" : "Open") + "</button>";
        box.appendChild(row);
      });
      if (!shown) box.innerHTML = '<p style="color:var(--faint)">No vendors registered yet.</p>';
    });
  }

  function loadTeam() {
    if (!isAdmin) return;
    db.collection("staff").get().then(function (qs) {
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
    });
    db.collection("staff_invites").get().then(function (qs) {
      if (qs.empty) return;
      var box = $("ad-team-list");
      box.innerHTML += "<h4 style='margin:12px 0 8px'>Pending invites</h4>";
      qs.forEach(function (d) {
        var inv = d.data() || {};
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(d.id) + "</strong><small>" + esc(roleLabel(inv.role)) + " · pending</small></div>" +
          ' <button class="mini danger" data-invdel="' + d.id + '">Cancel</button>';
        box.appendChild(row);
      });
    });
  }

  function loadVendorOptions() {
    db.collection("vendors").get().then(function (qs) {
      var sel = $("wo-assign");
      sel.innerHTML = '<option value="broadcast">All vendors (broadcast)</option>';
      qs.forEach(function (d) {
        var v = d.data();
        if (v.status === "archived") return;
        var o = document.createElement("option");
        o.value = d.id; o.textContent = (v.business || v.name) + " - " + (v.areas || []).join(", ");
        sel.appendChild(o);
      });
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

    uploadP.then(save).then(function () {
      logActivity(isEdit ? "Edited a work order" : "Created a work order");
      if (!isEdit && woSourceRequestId) {
        var srcId = woSourceRequestId;
        return db.collection("service_requests").doc(srcId).update({
          status: "converted",
          convertedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          logActivity("Converted a customer request to a work order");
        }).catch(function () {});
      }
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
  function srCalPrefill(r) {
    var notes = [r.phone ? "Phone: " + r.phone : "", r.email ? "Email: " + r.email : "",
      r.frequency ? "Frequency: " + r.frequency : "", r.message || ""].filter(Boolean).join("\n");
    return {
      title: (r.name || "Customer") + " - " + (r.service || "Service") + " estimate",
      address: r.address || "",
      colorId: "6",
      notes: notes
    };
  }
  function calFromRequest(id) {
    db.collection("service_requests").doc(id).get().then(function (snap) {
      if (snap.exists) openCal(srCalPrefill(snap.data()));
    });
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
    if (d.wodone) { logActivity("Marked a work order done"); db.collection("work_orders").doc(d.wodone).update({ status: "done" }).then(loadAll); }
    if (d.wodel && confirm("Delete this work order?")) { logActivity("Deleted a work order"); db.collection("work_orders").doc(d.wodel).delete().then(loadAll); }
    if (d.woedit) enterEditMode(d.woedit);
    if (d.wonotes) openWorkOrderNotes(d.wonotes);
    if (t.id === "woNoteClose" || t.id === "woNoteModal") closeWorkOrderNotes();
    if (t.id === "srClose" || t.id === "srModal") closeRequest();
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
      }).catch(function () {});
    }
    if (d.fuopen) {
      var fp = d.fuopen.split("|");
      if (fp[0] === "vendor") openVendor(fp[1]);
      else if (fp[0] === "work_order") openWorkOrderNotes(fp[1]);
      else if (fp[0] === "hot_lead") openHotLeadNotes(fp[1]);
    }
    if (d.hlnotes) openHotLeadNotes(d.hlnotes);
    if (d.hledit) openHotLeadForm(d.hledit);
    if (d.hldel) deleteHotLead(d.hldel);
    if (d.hlbell) markLeadSeen(d.hlbell);
    if (d.hlconvert) openHotLeadConvert(d.hlconvert);
    if (d.hlviewwo) { closeHotLeadConvert(); closeHotLeadNotes(); gotoWorkOrders(); }
    if (t.id === "hlNoteClose" || t.id === "hlNoteModal") closeHotLeadNotes();
    if (t.id === "hlFormClose" || t.id === "hlFormModal") closeHotLeadForm();
    if (t.id === "hlConvertClose" || t.id === "hlConvertModal") closeHotLeadConvert();
    if (d.srdel && confirm("Delete this customer request?")) { logActivity("Deleted a customer request"); db.collection("service_requests").doc(d.srdel).delete().then(loadAll); }
    if (d.sropen) openRequest(d.sropen);
    if (d.calsr) calFromRequest(d.calsr);
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
    if (d.vopen) openVendor(d.vopen);
    if (d.vrestore) restoreVendor(d.vrestore);
    if (d.staffdel && confirm("Remove this team member?")) { logActivity("Removed a team member"); db.collection("staff").doc(d.staffdel).delete().then(loadTeam); }
    if (d.invdel) { logActivity("Cancelled a team invite"); db.collection("staff_invites").doc(d.invdel).delete().then(loadTeam); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var modalOpen = !$("srModal").classList.contains("hidden") || !$("vdModal").classList.contains("hidden") ||
      !$("woNoteModal").classList.contains("hidden") || !$("hlNoteModal").classList.contains("hidden") ||
      !$("hlFormModal").classList.contains("hidden") || !$("hlConvertModal").classList.contains("hidden") ||
      !$("cal2Modal").classList.contains("hidden");
    if (!$("srModal").classList.contains("hidden")) closeRequest();
    if (!$("vdModal").classList.contains("hidden")) closeVendor();
    if (!$("woNoteModal").classList.contains("hidden")) closeWorkOrderNotes();
    if (!$("hlConvertModal").classList.contains("hidden")) closeHotLeadConvert();
    if (!$("hlNoteModal").classList.contains("hidden")) closeHotLeadNotes();
    if (!$("hlFormModal").classList.contains("hidden")) closeHotLeadForm();
    if (bellIsOpen()) setBellOpen(false);
    if (!modalOpen && navOpen) setNavOpen(false);
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

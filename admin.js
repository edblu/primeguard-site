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

  function loadAll() { loadStats(); loadWorkOrders(); loadHotLeads(); loadQuotes(); loadVendors(); loadArchivedVendors(); loadTeam(); loadVendorOptions(); loadReferrals(); loadActivity(); loadFollowUps(); loadCustomers(); }

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

  function loadFollowUps() {
    var box = $("ad-fu-list");
    if (!box) return;
    var today = localDateKey(new Date());
    var statsBox = $("ad-task-stats");
    var emptySnap = { forEach: function () {}, empty: true };
    // Standalone tasks and the done-notes read are best-effort: if either
    // collection is not readable yet, the queue still shows open follow-ups.
    var pNotesDone = db.collection("item_notes").where("followUpDone", "==", true).limit(100).get()
      .catch(function () { return emptySnap; });
    var pTasks = db.collection("tasks").limit(200).get()
      .catch(function () { return emptySnap; });
    var pNotesOpen = db.collection("item_notes").where("followUpDone", "==", false).limit(200).get();
    Promise.all([pNotesOpen, pNotesDone, pTasks]).then(function (res) {
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
          assignee: t.assigneeEmail || "", doneMs: tsMs(t.doneAt) };
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
      box.innerHTML = "";
      if (!open.length) {
        box.innerHTML = '<p style="color:var(--faint)">Nothing open. Everything is done — nice work.</p>';
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
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--faint)">Tasks could not load yet. The database rules update may still need to be published.</p>';
    });
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
    var html = '<div class="grow"><strong>' + esc(it.entityLabel) + "</strong>" +
      (sub.length ? "<small>" + sub.join("<br>") + "</small>" : "") + "</div>";
    if (isDone) {
      html += '<span class="pill p-done">Done' + (it.doneMs ? " · " + esc(tkWhen(it.doneMs)) : "") + "</span>";
    } else {
      html += '<span class="pill ' + meta.cls + '">' + esc(meta.label) + "</span>";
    }
    // For tasks the entity label shown is the task title; the linked record
    // rides in entityName when it differs, shown via the Open button target.
    if (it.entityType && it.entityId) {
      html += ' <button class="mini" data-fuopen="' + esc(it.entityType) + "|" + esc(it.entityId) + '">Open</button>';
    }
    if (isDone) {
      html += it.src === "note"
        ? ' <button class="mini" data-fuundo="' + it.id + '">Undo</button>'
        : ' <button class="mini" data-taskundo="' + it.id + '">Undo</button>';
    } else if (it.src === "note") {
      html += ' <button class="mini" data-fudone="' + it.id + '">✓ Done</button>' +
        ' <button class="mini" data-fusnooze="' + it.id + '">Snooze +1d</button>' +
        ' <button class="mini" data-fueditdate="' + it.id + "|" + esc(it.due) + '">Edit date</button>';
    } else {
      html += ' <button class="mini" data-taskdone="' + it.id + '">✓ Done</button>' +
        ' <button class="mini" data-tasksnooze="' + it.id + '">Snooze +1d</button>' +
        ' <button class="mini" data-taskeditdate="' + it.id + "|" + esc(it.due) + '">Edit date</button>';
    }
    var row = document.createElement("div");
    row.className = "arow";
    row.innerHTML = html;
    return row;
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
      '<label>Assignee (email, optional)<input type="text" id="tk-f-assignee" placeholder="name@pgpbiz.com" value="' + esc(prefill.assigneeEmail || "") + '"></label></div>' +
      '<div class="row2"><label>Linked to<select id="tk-f-etype">' + etOpts + "</select></label>" +
      '<label>Linked record name<input type="text" id="tk-f-ename" placeholder="Customer, vendor, or job name" value="' + esc(prefill.entityName || "") + '"></label></div>' +
      '<input type="hidden" id="tk-f-eid" value="' + esc(prefill.entityId || "") + '">' +
      '<p class="aerr hidden" id="tk-f-err"></p>' +
      '<div class="sr-actions"><button class="btn btn-gold" type="submit" id="tk-f-save">Create task</button></div>' +
      "</form>";
    $("taskFormModal").classList.remove("hidden");
    document.body.style.overflow = "hidden";
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
      assigneeEmail: $("tk-f-assignee").value.trim(),
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
  var woFilter = "all"; // Work Orders queue filter chip: all|quote|active|done
  var woOrders = []; // cached { id, d } rows from the last loadWorkOrders()
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
    var stageCounts = { all: hlLeads.length };
    HL_STAGES.forEach(function (s) { stageCounts[s[0]] = 0; });
    var tempCounts = { all: hlLeads.length, hot: 0, warm: 0, cold: 0 };
    hlLeads.forEach(function (it) {
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
    var box = $("ad-hl-list");
    if (!box) return;
    renderHlFilterChips();
    if (!hlLeads.length) {
      box.innerHTML = '<p style="color:var(--faint)">No hot leads yet. When a customer conversation gets serious, add it here with the Add lead button so the whole team can work it.</p>';
      return;
    }
    var visible = hlLeads.filter(function (it) {
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
      var row = document.createElement("article");
      row.className = "hlq-card hlq-temp-" + temp;
      row.innerHTML =
        '<div class="hlq-head"><button type="button" class="hlq-name" data-hldetail="' + it.id + '">' +
          (d.seen ? "" : '<span class="hl-dot" title="Unseen"></span>') + esc(d.name || "Lead") + '</button>' +
          '<span class="pill ' + tm[2] + '">' + esc(tm[1]) + "</span></div>" +
        (serviceLine ? '<div class="hlq-service">' + esc(serviceLine) + (photoCount ? ' <span class="hl-photo-badge" title="Photos on this lead">📷 ' + photoCount + "</span>" : "") + "</div>" : "") +
        (excerpt ? '<p class="hlq-notes">' + esc(excerpt) + "</p>" : "") +
        hlStepperHtml(it.id, d) +
        '<div class="hlq-actions">' +
          '<button type="button" class="mini hlq-action hlq-action-primary" data-hlnotes="' + it.id + '">Notes</button>' +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-callead="' + it.id + '">Calendar</button>' +
          (d.convertedWorkOrderId
            ? '<button type="button" class="mini hlq-action hlq-action-ghost" disabled>Converted ✓</button>'
            : '<button type="button" class="mini hlq-action hlq-action-ghost" data-hlconvert="' + it.id + '">Convert</button>') +
        "</div>" +
        '<div class="hlq-foot"><span class="hlq-idle' + idleCls + '">' + idleDays + 'd since touch</span>' +
          '<span class="hlq-manage"><button type="button" class="hlq-manage-btn" data-hledit="' + it.id + '">Edit</button>' +
          (isAdmin ? '<button type="button" class="hlq-manage-btn danger" data-hldel="' + it.id + '">Delete</button>' : "") + '</span>' +
          '<span class="hlq-source">' + esc(d.source || "Other") + "</span></div>";
      box.appendChild(row);
    });
  }
  function hlStageChanged(id, stage) {
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
      var fullDate = function (ms) { return ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"; };
      var hlToolsEntity = { label: d.name || "Lead", area: d.area || hlAreaLabel(d), address: d.address || "", service: d.service || "" };
      var h = '<h3 id="hlNoteTitle">' + esc(d.name || "Lead") + "</h3>" +
        '<p class="sr-meta"><span class="pill ' + st[2] + '">' + esc(st[1]) + '</span><span class="pill ' + tm[2] + '">' + esc(tm[1]) + '</span><span class="pill p-acc">' + esc(d.source || "Other") + "</span><span>" +
        esc(d.service || "") + (d.area ? " · " + esc(d.area) : "") + (d.contact ? " · " + esc(d.contact) : "") +
        (d.address ? " · " + esc(d.address) : "") +
        (whenMs ? " · added " + esc(new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric" })) : "") + "</span></p>" +
        pgJobToolsHtml(hlToolsEntity) +
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
        '<p><strong>Temperature:</strong> ' + esc(tm[1]) + '</p>' +
        '<p><strong>Photos:</strong> ' + photos.length + ' · <strong>Media links:</strong> ' + mediaLinks.length + '</p>' +
        (d.convertedWorkOrderId
          ? '<p><strong>Quote request:</strong> converted' + (convMs ? " " + esc(fullDate(convMs)) : "") + '</p>' +
            '<div class="sr-actions"><button class="mini" type="button" data-hlviewwo="' + id + '">Open work order</button></div>'
          : '<div class="sr-actions"><button class="mini" type="button" data-hlconvert="' + id + '">Convert to work order</button></div>') +
        (d.customerId
          ? '<p style="margin-top:8px"><strong>Customer:</strong> CRM record on file</p>' +
            '<div class="sr-actions"><button class="mini" type="button" data-hlviewcustomer="' + esc(d.customerId) + '">Open customer record</button></div>'
          : '<div class="sr-actions" style="margin-top:8px"><button class="mini" type="button" data-hlmakecustomer="' + id + '">Make customer</button></div>') +
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
    db.collection("work_orders").add(wo).then(function (ref) {
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
  var custEditId = null;
  var custFilter = "all"; // Customers page filter chip: all|winback|annual
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
    db.collection("customers").limit(200).get().then(function (qs) {
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
      // One extra read of hot_leads feeds the numbers strip on this page
      // (leads this month, top source, lead -> job conversion). Best
      // effort: if it fails, the strip just shows the customer counts.
      return db.collection("hot_leads").limit(500).get().then(function (hqs) {
        custHotLeads = [];
        hqs.forEach(function (doc) { custHotLeads.push(doc.data()); });
      }).catch(function () { custHotLeads = []; });
    }).then(function () {
      renderCustomers();
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--faint)">Customers could not load yet. The database rules update may still need to be published.</p>';
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
    var topSource = "—";
    if (custHotLeads.length) {
      var best = "";
      srcOrder.forEach(function (s) { if (!best || srcCounts[s] > srcCounts[best]) best = s; });
      topSource = best + " · " + srcCounts[best];
    }
    var conv = custHotLeads.length ? Math.round(100 * converted / custHotLeads.length) + "%" : "—";
    box.innerHTML = '<section class="astats">' +
      '<div class="astat"><div class="l">Customers</div><div class="v">' + custRows.length + "</div></div>" +
      '<div class="astat"><div class="l">Repeat customers</div><div class="v">' + repeats + "</div></div>" +
      '<div class="astat"><div class="l">Leads this month</div><div class="v">' + leadsMonth + "</div></div>" +
      '<div class="astat"><div class="l">Top source</div><div class="v">' + esc(topSource) + "</div></div>" +
      '<div class="astat"><div class="l">Lead → job conversion</div><div class="v">' + conv + "</div></div></section>";
  }
  function renderCustFilterChips() {
    var wrap = $("ad-cust-filters");
    if (!wrap) return;
    var counts = { all: custRows.length, winback: 0, annual: 0 };
    custRows.forEach(function (it) {
      if (custIsWinBack(it.d)) counts.winback++;
      if (custIsAnnualReady(it.d)) counts.annual++;
    });
    var defs = [["all", "All"], ["winback", "Win-back"], ["annual", "Annual contract ready"]];
    wrap.innerHTML = defs.map(function (df) {
      return '<button type="button" class="hl-chip' + (custFilter === df[0] ? " active" : "") +
        '" data-custfilter="' + df[0] + '">' + esc(df[1]) + ' <span class="cnt">' + counts[df[0]] + "</span></button>";
    }).join("");
  }

  function renderCustomers() {
    var box = $("ad-cust-list");
    if (!box) return;
    renderCustStats();
    renderCustFilterChips();
    if (!custRows.length) {
      box.innerHTML = '<p style="color:var(--faint)">No customers yet. Promote a lead with "Make customer" on the lead detail, or add one with the Add customer button.</p>';
      return;
    }
    // Filter chips: never-serviced customers (no lastServiceAt) only ever
    // match "All" — both other filters require 30+ days since a service.
    var visible = custRows.filter(function (it) {
      if (custFilter === "winback") return custIsWinBack(it.d);
      if (custFilter === "annual") return custIsAnnualReady(it.d);
      return true;
    });
    if (custFilter === "winback") {
      // Longest-lapsed first so the stalest relationships get worked first.
      visible = visible.slice().sort(function (a, b) {
        return (custDaysSince(b.d) || 0) - (custDaysSince(a.d) || 0);
      });
    }
    box.innerHTML = "";
    if (!visible.length) {
      box.innerHTML = '<p style="color:var(--faint)">' +
        (custFilter === "winback" ? "No win-back customers right now. Nobody is 30+ days past their last service without a signed annual contract."
          : "No customers are annual-contract ready right now. Customers land here 30 days after a service with no contract on file.") + "</p>";
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
      var h = '<h3 id="custTitle">' + esc(d.name || "Customer") + "</h3>" +
        '<p class="sr-meta">' + (d.source ? '<span class="pill p-acc">' + esc(d.source) + "</span>" : "") +
        "<span>" + esc([custContactLine(d), d.address || ""].filter(Boolean).join(" · ")) + "</span></p>" +
        '<div class="sr-card"><h4>Service</h4>' +
        '<div class="cust-lastsvc big">' + (lastMs ? "Last service: " + esc(fullDate(lastMs)) + (d.lastServiceLabel ? " · " + esc(d.lastServiceLabel) : "") : "No service yet") + "</div>" +
        '<p style="margin-top:8px"><strong>Jobs:</strong> ' + (d.totalJobs || 0) +
        (d.totalSpent != null ? " · <strong>Total spent:</strong> $" + esc(d.totalSpent) : "") +
        (days != null ? " · <strong>Last visit:</strong> " + days + "d ago" : "") + "</p>" +
        '<label style="display:block;margin-top:12px;font-size:.85rem;color:var(--muted)">Annual contract<select id="cust-annual" ' + selStyle + ">" + contractOpts + "</select></label>" +
        "</div>" +
        '<div class="sr-card"><h4>Log a completed service</h4>' +
        '<p class="sr-faint">Until jobs close out on their own, log each finished visit here: it stamps the last-service date the whole team works from.</p>' +
        '<div class="note-form"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<label>Date<input type="date" id="cust-svc-date" value="' + localDateKey(new Date()) + '"></label>' +
        '<label>Service<input type="text" id="cust-svc-label" placeholder="Lawn care visit" style="margin-top:6px;width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:.95rem;font-family:inherit"></label></div></div>' +
        '<div class="sr-actions"><button class="btn btn-gold btn-sm" id="cust-svc-btn" type="button">Log service</button></div>' +
        '<p class="aerr hidden" id="cust-svc-err" style="margin-top:10px"></p></div>' +
        '<div class="sr-card"><h4>Service history</h4><div id="cust-history"><p class="sr-faint">Loading…</p></div></div>' +
        (d.notes ? '<div class="sr-card"><h4>Customer notes</h4><p>' + esc(d.notes).replace(/\n/g, "<br>") + "</p></div>" : "") +
        '<div class="sr-card"><h4>Calls & notes</h4>' +
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
        '<div class="sr-comments" id="cnNotes" style="margin-top:14px"></div></div>';
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
      $("cust-task-btn").addEventListener("click", function () {
        openTaskForm({ entityType: "customer", entityId: id, entityName: d.name || "Customer" });
      });
      $("custModal").classList.remove("hidden");
      document.body.style.overflow = "hidden";
      loadItemNotes("customer", id, $("cnNotes"));
      loadCustomerHistory(id, d);
    });
  }
  function closeCustomer() {
    $("custModal").classList.add("hidden");
    document.body.style.overflow = "";
    custId = null; custData = null; custOutcome = "";
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
    Promise.all(ps).then(function () {
      var ids = Object.keys(found);
      if (!ids.length) {
        box.innerHTML = '<p class="sr-faint">No linked work orders yet. Jobs converted from this customer\'s lead will show up here.</p>';
        return;
      }
      ids.sort(function (a, b) { return tsMs(found[b].createdAt) - tsMs(found[a].createdAt); });
      box.innerHTML = ids.map(function (wid) {
        var w = found[wid];
        var whenMs = tsMs(w.createdAt);
        return '<div class="sr-comment"><strong>' + esc(w.title || "Work order") + "</strong><span>" +
          esc(String(w.status || "").replace(/_/g, " ")) +
          (whenMs ? " · " + esc(new Date(whenMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })) : "") +
          (w.vendorBusiness ? " · " + esc(w.vendorBusiness) : "") + "</span>" +
          (w.details ? "<p>" + esc(hlExcerpt(w.details)) + "</p>" : "") + "</div>";
      }).join("");
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
    db.collection("vendors").get().then(function (qs) {
      archivedVendors = [];
      qs.forEach(function (d) { var v = d.data(); if (v.status === "archived" || v.status === "rejected") archivedVendors.push({ id: d.id, v: v }); });
      archivedVendors.sort(function (a, b) { return (tsMs(b.v.archivedAt) || tsMs(b.v.createdAt)) - (tsMs(a.v.archivedAt) || tsMs(a.v.createdAt)); });
      sec.classList.remove("hidden");
      renderArchivedVendors();
    }).catch(function () {});
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
    db.collection("work_orders").get().then(function (qs) {
      var open = 0, active = 0;
      qs.forEach(function (d) { var s = d.data().status; if (s === "open") open++; else if (s !== "done") active++; });
      $("as-open").textContent = open; $("as-active").textContent = active;
    });
    db.collection("quotes").where("status", "==", "pending").get().then(function (qs) { $("as-quotes").textContent = qs.size; var mb = $("pg-nav-b-quotes"); if (mb) mb.textContent = qs.size; });
    db.collection("vendors").get().then(function (qs) { var n = 0; qs.forEach(function (d) { var s = d.data().status; if (s !== "archived" && s !== "rejected") n++; }); $("as-vendors").textContent = n; var mb = $("pg-nav-b-vendors"); if (mb) mb.textContent = n; });
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
    return ["accepted", "evaluation_accepted", "in_progress", "scheduled", "review"].indexOf(status) >= 0;
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
  function renderWorkOrders() {
    var box = $("ad-wo-list");
    if (!box) return;
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
      var card = document.createElement("article");
      card.className = "hlq-card woq-card " + (bucket === 0 ? "woq-action" : (bucket === 3 ? "woq-done" : "woq-progress"));
      card.innerHTML =
        '<div class="hlq-head"><button type="button" class="hlq-name" data-wonotes="' + it.id + '">' +
          esc(title + (customer && title.indexOf(customer) < 0 ? " · " + customer : "")) + "</button>" +
          pill(w.status) + "</div>" +
        (metaLine || mediaHtml ? '<div class="hlq-service">' + esc(metaLine) + mediaHtml + "</div>" : "") +
        (excerpt ? '<p class="hlq-notes">' + esc(excerpt) + "</p>" : "") +
        '<div class="hlq-actions">' +
          '<button type="button" class="mini hlq-action hlq-action-primary" data-wonotes="' + it.id + '">Notes</button>' +
          '<button type="button" class="mini hlq-action hlq-action-ghost" data-calwo="' + it.id + '">Add to calendar</button>' +
          (w.status !== "done" ? '<button type="button" class="mini hlq-action hlq-action-ghost" data-wodone="' + it.id + '">Done</button>' : "") +
        "</div>" +
        (sendHtml ? '<div class="woq-send">' + sendHtml + "</div>" : "") +
        '<div class="hlq-foot"><span class="hlq-idle' + idleCls + '">' + idleDays + 'd since update</span>' +
          '<span class="hlq-manage"><button type="button" class="hlq-manage-btn" data-woedit="' + it.id + '">Edit</button>' +
          '<button type="button" class="hlq-manage-btn danger" data-wodel="' + it.id + '">Delete</button></span>' +
          '<span class="hlq-source">' + esc(w.vendorBusiness || "Broadcast") + "</span></div>";
      box.appendChild(card);
    });
  }
  function loadWorkOrders() {
    db.collection("work_orders").orderBy("createdAt", "desc").limit(30).get().then(function (qs) {
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
    return ' <span class="wo-send"><select data-wosendsel="' + id + '">' + opts + "</select>" +
      ' <button class="mini" type="button" data-wosend="' + id + '">' + (sentMs ? "Preview & resend" : "Preview & send") + "</button>" + state + "</span>";
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
      vendorNotifyLang: woPrevLang
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

  function loadQuotes() {
    loadCustomerQuotes();
    db.collection("quotes").orderBy("createdAt", "desc").limit(30).get().then(function (qs) {
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
      '<form id="cqForm" class="aform">' +
      '<div class="row2"><label>Customer name<input type="text" id="cq-name" value="' + esc(name) + '" required></label>' +
      '<label>Contact (phone · email)<input type="text" id="cq-contact" value="' + esc(contact) + '"></label></div>' +
      '<div class="row2"><label>Service address<input type="text" id="cq-address" value="' + esc(address) + '"></label>' +
      '<label>Service<input type="text" id="cq-service" value="' + esc(service) + '"></label></div>' +
      '<label style="margin-bottom:6px">Line items (what the customer sees)</label>' +
      '<div id="cq-items">' + cqItemRowHtml(firstLabel, vendorAmount) + "</div>" +
      '<button type="button" class="mini" id="cq-add-item">Add line</button>' +
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
    db.collection("customer_quotes").orderBy("createdAt", "desc").limit(50).get()
      .then(function (qs) {
        var signed = [];
        qs.forEach(function (d) {
          var q = d.data();
          if (q && q.status === "signed") signed.push({ id: d.id, q: q });
        });
        if (box) {
          if (!signed.length) {
            box.innerHTML = '<p style="color:var(--faint)">No signed customer quotes yet.</p>';
          } else {
            box.innerHTML = "";
            signed.forEach(function (it) {
              var q = it.q;
              var sdMs = tsMs(q.signedAt);
              var sd = sdMs ? new Date(sdMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
              var row = document.createElement("div"); row.className = "arow";
              row.innerHTML = '<div class="grow"><strong>' + esc(q.customerName || "Customer") + " - " + esc(cqMoney(q.total)) + "</strong><small>" +
                esc(q.service || "") + (sd ? " · signed " + esc(sd) : "") + " · " + (q.payChoice === "deposit20" ? "20% deposit" : "Full payment") +
                (q.signedName ? " · signed by " + esc(q.signedName) : "") + "</small></div>" +
                '<span class="pill p-done">Signed</span>';
              box.appendChild(row);
            });
          }
        }
        signed.forEach(function (it) { cqHandleSigned(it.id, it.q); });
      })
      .catch(function () {});
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

  function loadVendors() {
    db.collection("vendors").orderBy("createdAt", "desc").limit(50).get().then(function (qs) {
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
    var custFilterEl = t.closest ? t.closest("[data-custfilter]") : null;
    if (custFilterEl) d = custFilterEl.dataset;
    var woFilterEl = t.closest ? t.closest("[data-wofilter]") : null;
    if (woFilterEl) d = woFilterEl.dataset;
    var woPrevEl = t.closest ? t.closest("[data-woprevlang],[data-woprevconfirm],[data-woprevcancel]") : null;
    if (woPrevEl) d = woPrevEl.dataset;
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
    if (d.wodel && confirm("Delete this work order?")) { logActivity("Deleted a work order"); db.collection("work_orders").doc(d.wodel).delete().then(loadAll); }
    if (d.woedit) enterEditMode(d.woedit);
    if (d.wonotes) openWorkOrderNotes(d.wonotes);
    if (d.wosend) openWoSendPreview(d.wosend, t);
    if (d.woprevlang) { woPrevLang = d.woprevlang; renderWoPrev(); }
    if (d.woprevconfirm) confirmWoSend(woPrevEl || t);
    if (d.woprevcancel) closeWoSendPreview();
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
    if (d.custfilter) { custFilter = d.custfilter; renderCustomers(); }
    if (d.wofilter) { woFilter = d.wofilter; renderWorkOrders(); }
    if (d.hlmakecustomer) {
      var mkId = d.hlmakecustomer;
      makeCustomerFromLead(mkId).then(function () {
        loadHotLeads();
        if (hlNoteId === mkId) openHotLeadNotes(mkId);
      }).catch(function (e) { alert("Could not create customer: " + (e.message || e)); });
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
      !$("cal2Modal").classList.contains("hidden");
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

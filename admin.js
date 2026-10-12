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

  var me = null, isAdmin = false, isStaff = false;
  var pendingPhotos = []; // dataURLs selected in the WO form

  $("ad-loginform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("ad-login-err"); hide(errEl);
    auth.signInWithEmailAndPassword($("ad-email").value.trim(), $("ad-pass").value)
      .catch(function (err) { errEl.textContent = err.message; show(errEl); });
  });
  $("ad-logout").addEventListener("click", function (e) { e.preventDefault(); auth.signOut(); });

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
    if (!user) { show($("ad-loginwrap")); hide($("ad-dash")); return; }
    isAdmin = (user.email === ADMIN_EMAIL);
    var check = isAdmin
      ? Promise.resolve(true)
      : db.collection("staff").doc(user.uid).get().then(function (s) { return s.exists; })
          .then(function (ok) {
            if (ok) return true;
            // Auto-claim an invite sent to this email
            return db.collection("staff_invites").doc(user.email).get().then(function (inv) {
              if (!inv.exists) return false;
              return db.collection("staff").doc(user.uid).set({
                email: user.email, role: "acquisition",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }).then(function () {
                return db.collection("staff_invites").doc(user.email).delete();
              }).then(function () { return true; });
            });
          });
    check.then(function (ok) {
      isStaff = ok;
      if (!ok) { show($("ad-loginwrap")); hide($("ad-dash")); $("ad-login-err").textContent = "This account is not staff."; show($("ad-login-err")); auth.signOut(); return; }
      hide($("ad-loginwrap")); show($("ad-dash"));
      $("ad-who").textContent = user.email + (isAdmin ? " (owner)" : " (acquisition)");
      if (!isAdmin) hide($("ad-teamsec"));
      loadAll();
    });
  });

  function loadAll() { loadStats(); loadWorkOrders(); loadQuotes(); loadVendors(); loadTeam(); loadVendorOptions(); }

  function loadStats() {
    db.collection("work_orders").get().then(function (qs) {
      var open = 0, active = 0;
      qs.forEach(function (d) { var s = d.data().status; if (s === "open") open++; else if (s !== "done") active++; });
      $("as-open").textContent = open; $("as-active").textContent = active;
    });
    db.collection("quotes").where("status", "==", "pending").get().then(function (qs) { $("as-quotes").textContent = qs.size; });
    db.collection("vendors").get().then(function (qs) { $("as-vendors").textContent = qs.size; });
  }

  function pill(s) {
    var cls = { open: "p-open", accepted: "p-acc", evaluation_accepted: "p-acc", in_progress: "p-acc", review: "p-rev", done: "p-done", pending: "p-pend", approved: "p-done", declined: "p-rev" }[s] || "p-open";
    return '<span class="pill ' + cls + '">' + esc(String(s).replace(/_/g, " ")) + "</span>";
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
          (w.status !== "done" ? ' <button class="mini" data-wodone="' + d.id + '">Done</button>' : "") +
          ' <button class="mini danger" data-wodel="' + d.id + '">Delete</button>';
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
        row.innerHTML = '<div class="grow"><strong>$' + esc(q.price) + " — " + esc(q.vendorBusiness || "") + "</strong><small>" + esc(q.notes || "") + " · " + esc(q.duration || "") + " · " + esc(q.vendorPhone || "") + "</small></div>" +
          pill(q.status) +
          (q.status === "pending" ? ' <button class="mini" data-qok="' + d.id + "|" + q.workOrderId + '">Approve</button> <button class="mini danger" data-qno="' + d.id + '">Decline</button>' : "");
        box.appendChild(row);
      });
    });
  }

  function loadVendors() {
    db.collection("vendors").orderBy("createdAt", "desc").limit(50).get().then(function (qs) {
      var box = $("ad-vendor-list");
      if (qs.empty) { box.innerHTML = '<p style="color:var(--faint)">No vendors registered yet.</p>'; return; }
      box.innerHTML = "";
      qs.forEach(function (d) {
        var v = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(v.business) + "</strong><small>" + esc(v.name || "") + " · " + esc(v.phone || "") + " · " + (v.areas || []).join(", ") + "</small></div>" +
          (v.verified ? pill("done") : pill("pending")) +
          (isAdmin && !v.verified ? ' <button class="mini" data-vverify="' + d.id + '">Verify</button>' : "");
        box.appendChild(row);
      });
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
        row.innerHTML = '<div class="grow"><strong>' + esc(s.email) + "</strong><small>" + esc(s.role || "acquisition") + "</small></div>" +
          ' <button class="mini danger" data-staffdel="' + d.id + '">Remove</button>';
        box.appendChild(row);
      });
    });
    db.collection("staff_invites").get().then(function (qs) {
      if (qs.empty) return;
      var box = $("ad-team-list");
      box.innerHTML += "<h4 style='margin:12px 0 8px'>Pending invites</h4>";
      qs.forEach(function (d) {
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(d.id) + "</strong></div>" +
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
        var o = document.createElement("option");
        o.value = d.id; o.textContent = (v.business || v.name) + " — " + (v.areas || []).join(", ");
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
    var btn = $("wo-submit"); btn.disabled = true; btn.textContent = "Creating...";

    var assignVal = $("wo-assign").value;
    var wo = {
      title: $("wo-title").value.trim(),
      kind: $("wo-kind").value,
      category: $("wo-category").value.trim(),
      area: $("wo-area").value.trim(),
      details: $("wo-details").value.trim(),
      pay: $("wo-pay").value.trim(),
      broadcast: assignVal === "broadcast",
      vendorId: assignVal === "broadcast" ? null : assignVal,
      vendorBusiness: null,
      status: "open",
      photos: [],
      createdBy: me.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (wo.vendorId) {
      var opt = $("wo-assign").selectedOptions[0];
      wo.vendorBusiness = opt.textContent.split(" — ")[0];
    }

    function save(urls) {
      wo.photos = urls || [];
      return db.collection("work_orders").add(wo);
    }

    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    var uploadP = (pendingPhotos.length && endpoint)
      ? fetch(endpoint, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ type: "photo-upload", folder: "work-order-photos", photos: pendingPhotos }) })
        .then(function (r) { return r.json(); }).then(function (out) { return out.urls || []; })
      : Promise.resolve([]);

    uploadP.then(save).then(function () {
      okEl.classList.remove("hidden");
      $("ad-woform").reset(); $("wo-preview").innerHTML = ""; pendingPhotos = [];
      loadAll();
    }).catch(function (err) {
      errEl.textContent = err.message; errEl.classList.remove("hidden");
    }).finally(function () { btn.disabled = false; btn.textContent = "Create work order"; });
  });

  // ---------- Invite form ----------
  $("ad-inviteform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("inv-error"), okEl = $("inv-ok");
    errEl.classList.add("hidden"); okEl.classList.add("hidden");
    var email = $("inv-email").value.trim().toLowerCase();
    db.collection("staff_invites").doc(email).set({
      email: email, role: "acquisition", invitedBy: me.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () { okEl.classList.remove("hidden"); $("inv-email").value = ""; loadTeam(); })
      .catch(function (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); });
  });

  // ---------- Row actions ----------
  document.addEventListener("click", function (e) {
    var t = e.target, d = t.dataset;
    if (d.wodone) db.collection("work_orders").doc(d.wodone).update({ status: "done" }).then(loadAll);
    if (d.wodel && confirm("Delete this work order?")) db.collection("work_orders").doc(d.wodel).delete().then(loadAll);
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
      }).then(loadAll);
    }
    if (d.qno) db.collection("quotes").doc(d.qno).update({ status: "declined" }).then(loadAll);
    if (d.vverify) db.collection("vendors").doc(d.vverify).update({ verified: true }).then(function () { loadVendors(); loadVendorOptions(); });
    if (d.staffdel && confirm("Remove this team member?")) db.collection("staff").doc(d.staffdel).delete().then(loadTeam);
    if (d.invdel) db.collection("staff_invites").doc(d.invdel).delete().then(loadTeam);
  });
})();

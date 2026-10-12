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
      if (!res.ok) { show($("ad-loginwrap")); hide($("ad-dash")); $("ad-login-err").textContent = "This account is not staff."; show($("ad-login-err")); auth.signOut(); return; }
      hide($("ad-loginwrap")); show($("ad-dash"));
      $("ad-who").textContent = user.email + (isAdmin ? " (owner)" : " (" + roleLabel(myRole) + ")");
      if (!(isAdmin || myRole === "admin")) hide($("ad-teamsec"));
      loadAll();
    });
  });

  function loadAll() { loadStats(); loadWorkOrders(); loadQuotes(); loadVendors(); loadTeam(); loadVendorOptions(); loadServiceRequests(); loadReferrals(); }

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
      qs.forEach(function (d) {
        var r = d.data();
        var row = document.createElement("div"); row.className = "arow";
        row.innerHTML = '<div class="grow"><strong>' + esc(r.service || "Service request") +
          (r.frequency ? " — " + esc(r.frequency) : "") + "</strong><small>" +
          esc(r.name || "") + (r.phone ? " · " + esc(r.phone) : "") +
          (r.message ? " · " + esc(r.message) : "") + "</small></div>" +
          pill(r.status) +
          ' <button class="mini" data-sropen="' + d.id + '">Open</button>' +
          ' <button class="mini danger" data-srdel="' + d.id + '">Delete</button>';
        box.appendChild(row);
      });
    }).catch(function () {
      $("ad-sr-list").innerHTML = '<p style="color:var(--faint)">Couldn\'t load requests.</p>';
    });
  }

  /* ---------- Request detail modal ---------- */
  var srId = null, srData = null;
  var SR_STATUSES = ["new", "reviewing", "quoted", "scheduled", "done", "cancelled"];

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

  function renderRequestModal() {
    var r = srData, box = $("srBody");
    var photos = Array.isArray(r.photos) ? r.photos : [];
    var comments = Array.isArray(r.comments) ? r.comments : [];
    var h = '<h3 id="srTitle">' + esc(r.service || "Service request") +
      (r.frequency ? " — " + esc(r.frequency) : "") + '</h3>' +
      '<p class="sr-meta">' + pill(r.status) + ' <span>' + esc(srDate(r)) + '</span>' +
      (r.source ? ' <span>· via ' + esc(r.source) + '</span>' : '') + '</p>' +
      '<div class="sr-grid">' +
      '<div class="sr-card"><h4>Customer</h4>' +
      '<p><strong>' + esc(r.name || "—") + '</strong></p>' +
      (r.phone ? '<p>📞 <a href="tel:' + esc(r.phone.replace(/\D/g, "")) + '">' + esc(r.phone) + '</a></p>' : '') +
      (r.email ? '<p>✉️ <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></p>' : '') +
      (r.address ? '<p>📍 ' + esc(r.address) + '</p>' : '') +
      (r.uid ? '' : '<p class="sr-guest">Guest request (no account)</p>') +
      '</div>' +
      '<div class="sr-card"><h4>Request details</h4>' +
      '<p><strong>Service:</strong> ' + esc(r.service || "—") + '</p>' +
      '<p><strong>Frequency:</strong> ' + esc(r.frequency || "—") + '</p>' +
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
        return '<option value="' + s + '"' + ((r.status || "new") === s ? " selected" : "") + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
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
    h += '<div class="sr-actions">' +
      '<button class="btn btn-gold btn-sm" id="srMakeWO" type="button">Create work order</button>' +
      '<button class="btn btn-ghost btn-sm" id="srDelete" type="button">Delete request</button></div>';
    box.innerHTML = h;

    $("srClose").addEventListener("click", closeRequest);
    $("srModal").addEventListener("click", function (e) { if (e.target === $("srModal")) closeRequest(); });
    $("srSaveStatus").addEventListener("click", function () {
      db.collection("service_requests").doc(srId).update({ status: $("srStatus").value }).then(function () {
        srData.status = $("srStatus").value; saved(); loadServiceRequests();
      });
    });
    $("srSaveNotes").addEventListener("click", function () {
      db.collection("service_requests").doc(srId).update({ adminNotes: $("srNotes").value.trim() }).then(function () {
        srData.adminNotes = $("srNotes").value.trim(); saved();
      });
    });
    $("srAddComment").addEventListener("click", function () {
      var t = $("srComment").value.trim();
      if (!t) return;
      db.collection("service_requests").doc(srId).update({
        comments: firebase.firestore.FieldValue.arrayUnion({ by: me ? me.email : "team", text: t, at: new Date() })
      }).then(function () { return db.collection("service_requests").doc(srId).get(); }).then(function (s) {
        srData = s.data(); renderRequestModal();
      });
    });
    $("srDelete").addEventListener("click", function () {
      if (!confirm("Delete this customer request?")) return;
      db.collection("service_requests").doc(srId).delete().then(function () { closeRequest(); loadServiceRequests(); });
    });
    $("srMakeWO").addEventListener("click", function () { requestToWorkOrder(); });
    function saved() {
      var el = $("srSaved");
      if (el) { el.classList.remove("hidden"); setTimeout(function () { el.classList.add("hidden"); }, 1800); }
    }
  }

  function requestToWorkOrder() {
    var r = srData;
    var catMap = { "Lawn Care": "Lawn care", "Pressure Washing": "Pressure washing", "Debris & Junk Removal": "Cleanups", "Junk Removal": "Cleanups", "Make-Ready Cleaning": "Cleanups", "Handyman Services": "Handyman" };
    $("wo-title").value = (r.service || "Service") + " — " + (r.name || "customer");
    var cat = catMap[r.service] || "Cleanups";
    var catSel = $("wo-category");
    for (var i = 0; i < catSel.options.length; i++) if (catSel.options[i].value === cat) catSel.selectedIndex = i;
    $("wo-details").value = "Frequency: " + (r.frequency || "One-time") + "\n" +
      (r.message ? r.message + "\n" : "") +
      "\nCustomer: " + (r.name || "") + " " + (r.phone || "") + " " + (r.email || "") +
      (r.address ? "\nAddress: " + r.address : "") +
      "\n(From customer request " + srId + ")";
    closeRequest();
    document.getElementById("ad-woform").scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      wo.vendorBusiness = opt.textContent.split(" — ")[0];
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
      "3. Your staff access activates automatically.\n\n" +
      "Questions? Call Edwin at (786) 422-9674.\n\n— PrimeGuard Preservation LLC";
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

  // ---------- Row actions ----------
  document.addEventListener("click", function (e) {
    var t = e.target, d = t.dataset;
    if (d.wodone) db.collection("work_orders").doc(d.wodone).update({ status: "done" }).then(loadAll);
    if (d.wodel && confirm("Delete this work order?")) db.collection("work_orders").doc(d.wodel).delete().then(loadAll);
    if (d.woedit) enterEditMode(d.woedit);
    if (d.srdel && confirm("Delete this customer request?")) db.collection("service_requests").doc(d.srdel).delete().then(loadAll);
    if (d.sropen) openRequest(d.sropen);
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

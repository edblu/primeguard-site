// PrimeGuard vendor dashboard (Firebase Auth + Firestore).
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  if (!cfg || !cfg.apiKey) return;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  var me = null;       // firebase user
  var vendor = null;    // vendors/{uid} data
  var myEvals = [];     // quote requests I accepted (for quote form dropdown)

  var _yr = document.getElementById("vd-year");
  if (_yr) _yr.textContent = new Date().getFullYear();

  // ---------- Login ----------
  $("vd-loginform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("vd-login-error");
    hide(errEl);
    auth.signInWithEmailAndPassword($("vd-login-email").value.trim(), $("vd-login-password").value.trim())
      .catch(function (err) { errEl.textContent = err.message; show(errEl); });
  });
  $("vd-logout").addEventListener("click", function (e) { e.preventDefault(); auth.signOut(); });

  auth.onAuthStateChanged(function (user) {
    me = user;
    if (!user) { show($("vd-loginwrap")); hide($("vd-dash")); return; }
    hide($("vd-loginwrap")); show($("vd-dash"));
    db.collection("vendors").doc(user.uid).get().then(function (snap) {
      if (!snap.exists) { window.location.href = "vendor-register.html"; return; }
      vendor = snap.data();
      renderHeader();
      renderProfile();
      loadAll();
    });
  });

  function renderHeader() {
    $("vd-biz").textContent = vendor.business || "Vendor";
    $("vd-area").textContent = (vendor.areas || []).join(", ");
    $("vd-avatar").textContent = (vendor.business || "V").charAt(0).toUpperCase();
    $("vd-hello").textContent = (vendor.name || "there").split(" ")[0];
  }

  function renderProfile() {
    var v = vendor;
    $("cnt-verified").textContent = v.verified ? "VERIFIED" : "PENDING VERIFICATION";
    $("vd-profile").innerHTML = [
      ["Business", v.business], ["Contact", v.name], ["Phone", v.phone],
      ["Email", v.email], ["Services", (v.services || []).join(", ")],
      ["Areas", (v.areas || []).join(", ")], ["Crew size", v.crewSize],
      ["Equipment", v.equipment || "—"]
    ].map(function (f) {
      return '<div class="vfield"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1] || "—") + '</strong></div>';
    }).join("");
  }

  // ---------- Work orders ----------
  function loadAll() {
    db.collection("work_orders").where("status", "==", "open").get().then(function (qs) {
      var jobs = [], qrs = [];
      qs.forEach(function (d) {
        var w = d.data(); w.id = d.id;
        if (w.kind === "quote_request") qrs.push(w); else jobs.push(w);
      });
      renderList($("list-qr"), qrs, "quote_request");
      renderList($("list-jobs"), jobs, "job");
      $("cnt-qr").textContent = qrs.length + (qrs.length === 1 ? " NEED EVALUATION" : " NEED EVALUATION");
      $("cnt-jobs").textContent = jobs.length + " AVAILABLE";
      $("st-open").textContent = jobs.length + qrs.length;
    });
    db.collection("work_orders").where("vendorId", "==", me.uid).get().then(function (qs) {
      var active = [], done = [], earned = 0, pending = 0, pendingN = 0;
      myEvals = [];
      qs.forEach(function (d) {
        var w = d.data(); w.id = d.id;
        if (w.status === "open") return; // not accepted yet — shows in the open lists above
        if (w.status === "done") {
          done.push(w);
          earned += parseFloat(w.payAgreed || w.pay || 0) || 0;
        } else {
          active.push(w);
          if (w.status === "review") { pending += parseFloat(w.payAgreed || w.pay || 0) || 0; pendingN++; }
          if (w.kind === "quote_request" && w.status === "evaluation_accepted") myEvals.push(w);
        }
      });
      renderActive(active);
      renderDone(done);
      $("st-done").textContent = done.length;
      $("st-earned").textContent = "$" + earned.toLocaleString();
      $("st-pending").textContent = "$" + pending.toLocaleString();
      $("st-pending-n").textContent = pendingN ? pendingN + " job(s) awaiting confirmation" : "Nothing awaiting confirmation";
      $("cnt-active").textContent = active.length + " IN PROGRESS";
      $("cnt-done").textContent = done.length + " JOBS";
      var sel = $("q-workorder");
      sel.innerHTML = '<option value="">Select a quote request...</option>' + myEvals.map(function (w) {
        return '<option value="' + w.id + '">' + esc(w.title) + " — " + esc(w.area) + "</option>";
      }).join("");
    });
  }

  function photoThumbs(w) {
    var ph = w.photos || [];
    if (!ph.length) return "";
    return '<div class="vthumbs">' + ph.slice(0, 3).map(function (u) {
      return '<img src="' + esc(u) + '" alt="job photo" loading="lazy">';
    }).join("") + "</div>";
  }

  function renderList(box, arr, kind) {
    if (!arr.length) { box.innerHTML = '<div class="vempty">Nothing here right now. New jobs pop up here automatically.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      var btn = kind === "quote_request"
        ? '<button class="btn btn-gold" data-accept-eval="' + w.id + '">Accept evaluation</button>'
        : '<button class="btn btn-gold" data-accept-job="' + w.id + '">Accept job</button>';
      return '<div class="vjob"><div class="t">' + esc(w.category || w.kind) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" +
        photoThumbs(w) +
        '<div class="meta"><strong>' + esc(w.area || "") + "</strong> &nbsp;·&nbsp; Pay: <strong>" + esc(w.pay || "per job") + "</strong></div>" +
        btn + "</div>";
    }).join("");
  }

  function renderActive(arr) {
    var box = $("list-active");
    if (!arr.length) { box.innerHTML = '<div class="vempty">No active work. Accept a job above to get started.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      var steps;
      if (w.kind === "quote_request") {
        steps = step(w.status !== "open", "Evaluation visit scheduled") +
                step(w.quoteSubmitted, "Quote submitted");
      } else {
        steps = step(true, "Work order received") +
                step((w.beforePhotos || []).length > 0, "Before photos uploaded") +
                step(false, "Work completed") +
                step(w.status === "review" || w.status === "done", "After photos uploaded — then payment is released");
      }
      return '<div class="vjob"><div class="t">' + esc(w.status.replace(/_/g, " ").toUpperCase()) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" + photoThumbs(w) +
        '<ul class="vsteps">' + steps + "</ul>" +
        '<button class="btn btn-gold" data-upload="' + w.id + '">Upload photos</button> ' +
        (w.kind !== "quote_request" ? '<button class="btn btn-ghost" data-complete="' + w.id + '" style="margin-left:8px">Mark complete</button>' : "") +
        '<input type="file" accept="image/*" multiple class="hidden" id="up-' + w.id + '">' +
        "</div>";
    }).join("");
  }

  function step(done, label) {
    return '<li class="' + (done ? "sdone" : "stodo") + '"><span class="vdot">' + (done ? "✓" : "·") + "</span>" + esc(label) + "</li>";
  }

  function renderDone(arr) {
    var box = $("list-done");
    if (!arr.length) { box.innerHTML = '<div class="vempty">No completed jobs yet.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      return '<div class="vhrow"><div class="info"><strong>' + esc(w.title) + '</strong><span>' + esc(w.area || "") + " · " + esc(w.completedAt || "") + "</span></div>" +
        '<div class="vpaid">$' + esc(w.payAgreed || w.pay || "?") + "<small>Paid per job</small></div></div>";
    }).join("");
  }

  // ---------- Actions (event delegation) ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.acceptJob) {
      db.collection("work_orders").doc(t.dataset.acceptJob).update({
        vendorId: me.uid, vendorBusiness: vendor.business, status: "accepted",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(loadAll);
    }
    if (t.dataset.acceptEval) {
      db.collection("work_orders").doc(t.dataset.acceptEval).update({
        vendorId: me.uid, vendorBusiness: vendor.business, status: "evaluation_accepted",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(loadAll);
    }
    if (t.dataset.complete) {
      if (!confirm("Mark this job complete? Make sure your after photos are uploaded.")) return;
      db.collection("work_orders").doc(t.dataset.complete).update({
        status: "review",
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(loadAll);
    }
    if (t.dataset.upload) {
      var inp = document.getElementById("up-" + t.dataset.upload);
      if (inp) inp.click();
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id && t.id.indexOf("up-") === 0 && t.files.length) {
      var woId = t.id.slice(3);
      uploadPhotos(woId, t.files);
    }
  });

  // ---------- Photo upload via Apps Script + Drive ----------
  function uploadPhotos(woId, files) {
    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    if (!endpoint) { alert("Photo upload is being set up. Please send photos by text for now."); return; }
    var readers = Array.prototype.map.call(files, function (f) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () {
          var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res({ filename: f.name, mimeType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.82).split(",")[1] });
        };
        var fr = new FileReader();
        fr.onload = function () { img.src = fr.result; };
        fr.readAsDataURL(f);
      });
    });
    Promise.all(readers).then(function (photos) {
      return fetch(endpoint, {
        method: "POST", mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "photo-upload", workOrderId: woId, vendorId: me.uid, photos: photos })
      }).then(function (r) { return r.json(); });
    }).then(function (out) {
      if (!out.ok) throw new Error(out.error || "upload failed");
      return db.collection("work_orders").doc(woId).update({
        photos: firebase.firestore.FieldValue.arrayUnion.apply(null, out.urls)
      });
    }).then(loadAll).catch(function (err) { alert("Upload failed: " + err.message); });
  }

  // ---------- Quote form ----------
  $("vd-quoteform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("q-error"), okEl = $("q-ok");
    errEl.classList.add("hidden"); okEl.classList.add("hidden");
    var woId = $("q-workorder").value;
    if (!woId) { errEl.textContent = "Pick the quote request first."; errEl.classList.remove("hidden"); return; }
    db.collection("quotes").add({
      workOrderId: woId,
      vendorId: me.uid,
      vendorBusiness: vendor.business,
      vendorPhone: vendor.phone,
      price: $("q-price").value.trim(),
      duration: $("q-duration").value.trim(),
      notes: $("q-notes").value.trim(),
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      return db.collection("work_orders").doc(woId).update({ quoteSubmitted: true });
    }).then(function () {
      okEl.classList.remove("hidden");
      $("q-price").value = ""; $("q-duration").value = ""; $("q-notes").value = "";
      loadAll();
    }).catch(function (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); });
  });
})();

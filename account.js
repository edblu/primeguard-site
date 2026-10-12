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

  // (tabs removed — the page now scrolls hero → requests → jobs → settings)

  var yr = $("acct-year");
  if (yr) yr.textContent = new Date().getFullYear();

  function authError(err, elId) {
    var el = $(elId); el.textContent = err.message || "Something went wrong. Please try again.";
    show(el);
  }

  // Email/password login
  $("form-login").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("login-error"));
    auth.signInWithEmailAndPassword($("login-email").value.trim(), $("login-password").value.trim())
      .catch(function (err) { authError(err, "login-error"); });
  });

  // Email/password signup
  $("form-signup").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("signup-error"));
    var name = $("signup-name").value.trim();
    var email = $("signup-email").value.trim();
    var phone = $("signup-phone").value.trim();
    var pw = $("signup-password").value;
    auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
      return db.collection("customers").doc(cred.user.uid).set({
        name: name, email: email, phone: phone, address: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).catch(function (err) { authError(err, "signup-error"); });
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

  // Auth state
  auth.onAuthStateChanged(function (user) {
    if (user) {
      hide(authForms); hide($("account-hero-static")); show(dashboard);
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
        var since = "—";
        if (d.createdAt && d.createdAt.toDate) since = d.createdAt.toDate().getFullYear();
        else if (user.metadata && user.metadata.creationTime) since = new Date(user.metadata.creationTime).getFullYear();
        $("stat-since").textContent = since;
      }).catch(function () {
        $("dashboard-greeting").textContent = daypart();
        $("dashboard-name").textContent = (user.displayName || "there").split(" ")[0];
      });
      loadRequests(user.uid); loadJobs(user.uid);
    } else {
      show(authForms); show($("account-hero-static")); hide(dashboard);
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
    db.collection("service_requests").where("uid", "==", uid).orderBy("createdAt", "desc").limit(10).get()
      .then(function (qs) {
        var box = $("requests-list");
        var active = 0;
        if (qs.empty) {
          emptyState(box, "No requests yet. Tell us what your home needs.", "modal", "Request service");
        } else {
          box.innerHTML = "";
          qs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "new").toLowerCase();
            if (["new", "received", "in_progress", "scheduled", "accepted", "confirmed"].indexOf(st.replace(/[\s-]+/g, "_")) > -1) active++;
            var editable = st.replace(/[\s-]+/g, "_") === "new";
            var div = document.createElement("div"); div.className = "req-row";
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span></span></div>' + pillFor(d.status) +
              (editable ? '<button type="button" class="req-edit" data-edit-req="' + doc.id + '">Edit</button>' : "");
            div.querySelector("strong").textContent = d.service || "Service request";
            div.querySelector("span").textContent = fmtDate(d.createdAt);
            box.appendChild(div);
          });
        }
        $("stat-requests").textContent = active;
      }).catch(function () {
        emptyState($("requests-list"), "Couldn't load requests right now.", null, null);
      });
  }

  function loadJobs(uid) {
    db.collection("jobs").where("uid", "==", uid).orderBy("scheduledAt", "desc").limit(10).get()
      .then(function (qs) {
        var box = $("jobs-list");
        var done = 0;
        if (qs.empty) {
          emptyState(box, "No jobs yet. Your completed and upcoming jobs will live here.", "index.html#services", "Browse services");
        } else {
          box.innerHTML = "";
          qs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "scheduled").toLowerCase();
            if (st === "done" || st === "completed") done++;
            var div = document.createElement("div"); div.className = "req-row";
            var thumbs = "";
            if (Array.isArray(d.photos) && d.photos.length) {
              thumbs = '<div class="job-thumbs">' + d.photos.slice(0, 4).map(function (u) {
                return '<img src="' + esc(u) + '" alt="Job photo" loading="lazy">';
              }).join("") + "</div>";
            }
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span></span>' + thumbs + "</div>" + pillFor(d.status);
            div.querySelector("strong").textContent = d.service || "Job";
            div.querySelector("span").textContent = fmtDate(d.scheduledAt);
            box.appendChild(div);
          });
        }
        $("stat-jobs").textContent = done;
      }).catch(function () {
        emptyState($("jobs-list"), "Couldn't load jobs right now.", null, null);
      });
  }
  /* ---------- Request service modal ---------- */
  var reqModal = $("reqModal"), reqSvc = null, reqFreq = "One-time";
  var custInfo = { name: "", phone: "", email: "" };
  var reqPhotos = [];      // dataURLs picked in the modal
  var editingReqId = null; // service_requests doc id being edited, or null

  function openReq() {
    reqSvc = null; reqFreq = "One-time"; editingReqId = null; reqPhotos = [];
    $("reqStep1").hidden = false; $("reqStep2").hidden = true; $("reqDone").hidden = true;
    $("reqDetails").value = ""; $("reqPhotos").value = ""; $("reqPreview").innerHTML = "";
    hide($("reqError"));
    $("reqSubmit").textContent = "Send request";
    document.querySelectorAll(".req-chip").forEach(function (c, i) { c.classList.toggle("active", i === 0); });
    reqModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function openReqEdit(id, d) {
    editingReqId = id; reqPhotos = [];
    reqSvc = d.service || null; reqFreq = d.frequency || "One-time";
    $("reqStep1").hidden = true; $("reqStep2").hidden = false; $("reqDone").hidden = true;
    $("reqSvcTitle").textContent = reqSvc || "Service request";
    $("reqDetails").value = d.message || ""; $("reqPhotos").value = ""; $("reqPreview").innerHTML = "";
    hide($("reqError"));
    $("reqSubmit").textContent = "Save changes";
    document.querySelectorAll(".req-chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-freq") === reqFreq);
    });
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

  // photo picker in the request modal
  $("reqPhotos").addEventListener("change", function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) {
      if (reqPhotos.length >= 6) return;
      var r = new FileReader();
      r.onload = function () {
        reqPhotos.push(r.result);
        var img = document.createElement("img");
        img.src = r.result; img.alt = "request photo";
        $("reqPreview").appendChild(img);
      };
      r.readAsDataURL(f);
    });
  });

  document.querySelectorAll(".req-svc").forEach(function (btn) {
    btn.addEventListener("click", function () {
      reqSvc = btn.getAttribute("data-svc");
      $("reqSvcTitle").textContent = reqSvc;
      $("reqStep1").hidden = true; $("reqStep2").hidden = false;
    });
  });
  document.querySelectorAll(".req-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".req-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      reqFreq = chip.getAttribute("data-freq");
    });
  });
  $("reqBack").addEventListener("click", function () {
    $("reqStep2").hidden = true; $("reqStep1").hidden = false;
  });
  $("reqDoneBtn").addEventListener("click", closeReq);

  $("reqSubmit").addEventListener("click", function () {
    hide($("reqError"));
    var user = auth.currentUser;
    if (!user || !reqSvc) return;
    var btn = $("reqSubmit");
    var isEdit = !!editingReqId;
    btn.disabled = true; btn.textContent = isEdit ? "Saving..." : "Sending...";

    function save(urls) {
      var payload = {
        service: reqSvc, frequency: reqFreq,
        message: $("reqDetails").value.trim()
      };
      if (urls && urls.length) payload.photos = urls;
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

    uploadP.then(save).then(function () {
      $("reqStep2").hidden = true; $("reqDone").hidden = false;
      $("reqDone").querySelector("h3").textContent = isEdit ? "Changes saved!" : "Request received!";
      loadRequests(user.uid);
    }).catch(function (err) {
      var el = $("reqError");
      el.textContent = (err && err.message) || "Couldn't send. Please try again.";
      show(el);
    }).then(function () {
      btn.disabled = false; btn.textContent = isEdit ? "Save changes" : "Send request";
    });
  });

  // keep customer info fresh for request submissions
})();

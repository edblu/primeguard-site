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

  // Mobile hamburger menu
  (function () {
    var toggle = document.getElementById("navToggle"), nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      toggle.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (l) {
      l.addEventListener("click", function () { nav.classList.remove("open"); toggle.classList.remove("open"); });
    });
  })();

  // Promo banner slot (Midnight Gold dashboard) — driven by SITE_CONFIG.promoBanner.
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
  function tsMillis(ts) {
    try {
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      var t = new Date(ts).getTime();
      return isNaN(t) ? 0 : t;
    } catch (e) { return 0; }
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
        badgeCtx.memberYear = parseInt(since, 10) || 0; renderBadges();
      }).catch(function () {
        $("dashboard-greeting").textContent = daypart();
        $("dashboard-name").textContent = (user.displayName || "there").split(" ")[0];
      });
      loadRequests(user.uid); loadJobs(user.uid); loadExtras(user);
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
    // (no orderBy: composite index not guaranteed — sort client-side)
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
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span class="req-date"></span>' + timelineFor(st) + '</div>' + pillFor(d.status) +
              (editable ? '<button type="button" class="req-edit" data-edit-req="' + doc.id + '">Edit</button>' : "");
            div.querySelector("strong").textContent = d.service || "Service request";
            div.querySelector(".req-date").textContent = fmtDate(d.createdAt);
            box.appendChild(div);
          });
          renderQuotes(quotes);
        }
        $("stat-requests").textContent = active;
      }).catch(function () {
        emptyState($("requests-list"), "Couldn't load requests right now.", null, null);
      });
  }

  function loadJobs(uid) {
    // (no orderBy: composite index not guaranteed — sort client-side)
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
      el.querySelector(".q-price").textContent = d.quotePrice || "—";
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
      .catch(function () { alert("Couldn't update that quote — please call us at (786) 422-9674."); });
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
        body.querySelector(".plan-name").textContent = p.name + (p.price ? " — " + p.price : "");
        body.querySelector(".plan-meta").textContent = p.nextBilling ? "Next billing: " + p.nextBilling : "";
      } else {
        body.innerHTML = "<p>Lock in a lower rate with a subscription — lawn, pressure washing, or handyman.</p>" +
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
    { m: "January", tip: "Dry season is here — perfect time for exterior painting and pressure washing. Check irrigation for dry spots." },
    { m: "February", tip: "Peak dry season: check the lawn for pests and trim trees before spring growth kicks in." },
    { m: "March", tip: "Clean gutters before the rainy season arrives — clogged gutters overflow into flower beds and foundations." },
    { m: "April", tip: "Service your AC before the summer heat hits. A tune-up now beats a breakdown in August." },
    { m: "May", tip: "Rainy season is starting — check drainage around the house and seal windows and doors." },
    { m: "June", tip: "Hurricane season begins: trim tree limbs away from the roof and secure loose outdoor items." },
    { m: "July", tip: "Watch for lawn fungus in the heat and rain — mow high and water early in the morning." },
    { m: "August", tip: "Peak storm season: review your hurricane prep checklist and make sure drains run clear." },
    { m: "September", tip: "Peak hurricane month — keep gutters, drains, and the roof clear of debris." },
    { m: "October", tip: "Storm season winds down: schedule a post-season roof check and yard cleanup." },
    { m: "November", tip: "Dry season returns — ideal for pressure washing driveways and patios before the holidays." },
    { m: "December", tip: "Cool snaps can hurt tropical plants — cover sensitive landscaping on cold nights." }
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
      box.innerHTML = '<p class="pfaint">Only one home? Nothing to do here — add rentals or family homes you manage.</p>';
    props.forEach(function (p) {
      var row = document.createElement("div"); row.className = "prop-row";
      row.innerHTML = '<div class="p-main"><strong></strong><span></span></div>' +
        '<button type="button" class="btn btn-gold btn-sm" data-preq>Request service</button>' +
        '<button type="button" class="prop-del" data-pdel aria-label="Remove property">×</button>';
      row.querySelector("strong").textContent = p.label || "Property";
      row.querySelector("span").textContent = p.address || "";
      row.querySelector("[data-preq]").addEventListener("click", function () {
        openReqService(null, "Property: " + (p.label || "") + " — " + (p.address || "") + "\n\n");
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
    var pa = $("propAdd");
    if (pa) pa.addEventListener("click", function () {
      var label = $("propLabel").value.trim(), addr = $("propAddr").value.trim();
      if (!addr) { $("propAddr").focus(); return; }
      db.collection("customers").doc(u.uid).set({
        properties: firebase.firestore.FieldValue.arrayUnion({ label: label || "Property", address: addr })
      }, { merge: true }).then(function () {
        $("propLabel").value = ""; $("propAddr").value = ""; loadProps(u);
      }).catch(function () { alert("Couldn’t save — please try again."); });
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
  var editingReqId = null; // service_requests doc id being edited, or null
  var rwSvc = null, rwFreq = "One-time";

  var SERVICES = [
    { name: "Lawn Care", price: "$45", img: "assets/service-lawn-care.webp",
      desc: "Mowing, edging, and cleanup on a schedule you can count on — through South Florida's year-round growing season.",
      benefits: ["Precision mow at the right height for your grass", "Crisp edging along driveways, walkways & beds", "Full blow-off — no clippings left behind", "One-time cleanups or a set schedule, your call", "A yard that looks sharp every single visit"] },
    { name: "Pressure Washing", price: "$149", img: "assets/service-pressure-washing.webp",
      desc: "Driveways, walkways, patios, and exteriors brought back to clean. Years of grime, gone in an afternoon.",
      benefits: ["Driveways, walkways, patios, siding & fences", "Mold, mildew & years of grime gone in an afternoon", "Curb appeal that transforms your home's look", "Safe wash methods for concrete, pavers & stucco", "We walk the results with you before we leave"] },
    { name: "Debris & Junk Removal", price: "$89", img: "assets/service-junk-removal.webp",
      desc: "Yard debris, old furniture, and clutter hauled away. You point, we lift, it's gone.",
      benefits: ["Furniture, yard debris, appliances & clutter", "You point, we lift — zero heavy lifting for you", "Fast pickup scheduling that fits your week", "Hauled away and disposed of responsibly", "Upfront price before anything leaves your property"] },
    { name: "Make-Ready Cleaning", price: "$179", img: "assets/service-make-ready.webp",
      desc: "Turnover cleans that get rentals and listings guest-ready — kitchens, baths, floors, and details.",
      benefits: ["Deep move-in / move-out cleans", "Kitchens, baths, floors & all the details", "Rentals and listings guest-ready, fast", "Checklist clean — nothing gets missed", "Perfect for landlords, realtors & Airbnb hosts"] },
    { name: "Handyman Services", price: "$65", img: "assets/service-handyman.webp",
      desc: "Small repairs and punch-list items done right the first time. One call handles the whole list.",
      benefits: ["Small repairs, installs & punch-list items", "One visit handles your whole list", "Done right the first time — guaranteed", "Upfront pricing before work starts", "Respectful of your home: tidy work, every time"] }
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

  $("rwToReview").addEventListener("click", function () {
    if (!rwSvc) return;
    var det = $("rwDetails").value.trim() || "—";
    $("rwRevName").textContent = custInfo.name || "you";
    $("rwRevContact").textContent = custInfo.phone || custInfo.email || "";
    $("rwRevBox").innerHTML =
      '<div class="rw-rrow"><span class="k">Service</span><span class="v">' + esc(rwSvc.name) + ' (from ' + esc(rwSvc.price) + ')</span></div>' +
      '<div class="rw-rrow"><span class="k">Frequency</span><span class="v">' + esc(rwFreq) + '</span></div>' +
      '<div class="rw-rrow"><span class="k">Details</span><span class="v">' + esc(det) + '</span></div>' +
      (reqPhotos.length ? '<div class="rw-rrow"><span class="k">Photos</span><span class="v">' + reqPhotos.length + ' attached</span></div>' : '');
    rwStep(3);
  });

  $("rwSend").addEventListener("click", function () {
    hide($("reqError"));
    var user = auth.currentUser;
    if (!user || !rwSvc) return;
    var btn = $("rwSend");
    var isEdit = !!editingReqId;
    btn.disabled = true; btn.textContent = isEdit ? "Saving..." : "Sending...";

    function save(urls) {
      var payload = {
        service: rwSvc.name, frequency: rwFreq,
        message: $("rwDetails").value.trim()
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
      $("rwStep3").classList.add("hidden");
      $("rwDone").classList.remove("hidden");
      $("rwDoneTitle").textContent = isEdit ? "Changes saved!" : "Request received!";
      $("rwDoneSummary").textContent = isEdit
        ? "Your " + rwSvc.name.toLowerCase() + " request has been updated."
        : "Your " + rwSvc.name.toLowerCase() + " request (" + rwFreq.toLowerCase() + ") is in. We'll be in touch shortly to confirm the details.";
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
                message: $("rwDetails").value.trim(),
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

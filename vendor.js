// PrimeGuard vendor registration (Firebase Auth + Firestore).
(function () {
  // Mobile hamburger menu -> left drawer (runs even if Firebase
  // config is missing). This page does not load site.js, so the
  // drawer wiring lives here; it mirrors site.js's standalone
  // nav-drawer module exactly (backdrop, scroll lock, Escape,
  // close on resize past the mobile breakpoint).
  (function () {
    var toggle = document.getElementById("navToggle"), nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    var backdrop = document.getElementById("navBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "navBackdrop";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.appendChild(backdrop);
    }
    function isOpen() { return nav.classList.contains("open"); }
    function openMenu() {
      nav.classList.add("open");
      toggle.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      backdrop.classList.add("show");
      document.body.classList.add("nav-open");
    }
    function closeMenu() {
      nav.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      backdrop.classList.remove("show");
      document.body.classList.remove("nav-open");
    }
    toggle.addEventListener("click", function () {
      if (isOpen()) closeMenu(); else openMenu();
    });
    backdrop.addEventListener("click", closeMenu);
    nav.querySelectorAll("a").forEach(function (l) {
      l.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024) closeMenu();
    });
  })();

  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  var form = document.getElementById("vendor-register-form");
  if (!form || !cfg || !cfg.apiKey) return;

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var photoEndpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
  var leadEndpoint = (window.SITE_CONFIG && window.SITE_CONFIG.leadEndpoint) || "";

  // Show COI upload only when they say they're insured.
  var insuredSel = document.getElementById("vr-insured");
  var coiWrap = document.getElementById("vr-coi-wrap");
  if (insuredSel && coiWrap) {
    insuredSel.addEventListener("change", function () {
      coiWrap.classList.toggle("hidden", insuredSel.value !== "yes");
    });
  }

  function checkedValues(containerId) {
    var out = [];
    document.querySelectorAll("#" + containerId + " input[type=checkbox]:checked").forEach(function (el) {
      out.push(el.value);
    });
    return out;
  }

  /* ----- Required qualification fields (Edwin, 2026-11-10) -----
     A registration cannot finish until we have enough information
     to qualify and contact the vendor: full name, business name,
     phone, email, at least one service, and at least one area.
     This is enforced here in the save flow itself, because the
     services and areas pickers are checkbox panels and HTML
     required attributes alone cannot stop an empty submit. */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function phoneDigits(p) { return (p || "").replace(/\D/g, ""); }
  function missingRequired(d) {
    var missing = [];
    if (!d.name) missing.push({ label: "your name", target: "vr-name" });
    if (!d.business) missing.push({ label: "business name", target: "vr-business" });
    if (!d.email || !EMAIL_RE.test(d.email)) missing.push({ label: "a valid email", target: "vr-email" });
    if (phoneDigits(d.phone).length < 10) missing.push({ label: "a phone number with at least 10 digits", target: "vr-phone" });
    if (!d.services || !d.services.length) missing.push({ label: "at least one service", target: "vr-services-btn" });
    if (!d.areas || !d.areas.length) missing.push({ label: "at least one area you cover", target: "vr-areas-btn" });
    return missing;
  }
  function showMissing(missing, errEl) {
    var labels = missing.map(function (m) { return m.label; });
    errEl.textContent = "Almost there. Before your registration can finish, we still need: " + labels.join(", ") + ". Please fill those in and submit again.";
    errEl.classList.remove("hidden");
    var first = missing[0] && document.getElementById(missing[0].target);
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.focus) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // Upload a document (W-9 / COI) through the Apps Script + Drive backend.
  // Resolves to the Drive URL, or null when the backend isn't installed yet.
  function uploadDoc(file, folder) {
    if (!photoEndpoint || !file) return Promise.resolve(null);
    return readFileAsDataURL(file).then(function (dataUrl) {
      return fetch(photoEndpoint, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "doc-upload", folder: folder, name: file.name, mime: file.type, data: dataUrl })
      }).then(function () { return "uploaded"; }).catch(function () { return null; });
    }).catch(function () { return null; });
  }

  // Tell Edwin a new vendor registered (lands in his inbox like a lead alert).
  function notifyEdwin(v) {
    if (!leadEndpoint) return;
    try {
      fetch(leadEndpoint, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "vendor-registration",
          name: v.name, business: v.business, email: v.email, phone: v.phone,
          services: (v.services || []).join(", "), areas: (v.areas || []).join(", "),
          address: v.address || "", insured: v.insured || "no",
          hearAbout: v.hearAbout || "",
          w9: v.w9Url ? "uploaded" : "pending",
          timestamp: new Date().toISOString(), source: "vendor-register"
        })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ----- Google sign-up carry-through (Edwin, 2026-10-16) -----
     If the visitor is already signed in (e.g. they tapped Continue with
     Google on the portal login and had no vendor profile yet), do NOT
     make them create a second email/password account: prefill their
     Google identity, hide the password field, and write the vendor
     profile onto their existing account when the form submits. If they
     already HAVE a vendor profile, send them straight to the portal. */
  var googleUser = null;
  var completeUser = null;   // signed-in vendor finishing an incomplete profile
  var completeData = null;   // their existing (partial) vendors doc

  function setFieldValue(id, val) {
    var el = document.getElementById(id);
    if (el && val) el.value = val;
  }
  function setCheckedValues(containerId, values) {
    if (!values || !values.length) return;
    document.querySelectorAll("#" + containerId + " input[type=checkbox]").forEach(function (el) {
      if (values.indexOf(el.value) >= 0 && !el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  /* A vendors doc exists but is missing required information (the
     half-finished signup case): keep the vendor on this form with
     whatever they already gave us prefilled, and let the submit
     gate below make finishing actually finish the profile. */
  function enterCompleteMode(user, data) {
    completeUser = user;
    completeData = data || {};
    enterGoogleMode(user); // same signed-in, no-password carry-through UI
    var d = completeData;
    setFieldValue("vr-business", d.business);
    setFieldValue("vr-name", d.name);
    if (d.email) setFieldValue("vr-email", d.email);
    setFieldValue("vr-phone", d.phone);
    setFieldValue("vr-address", d.address);
    setFieldValue("vr-equipment", d.equipment);
    setFieldValue("vr-crewsize", d.crewSize);
    if (d.insured) {
      setFieldValue("vr-insured", d.insured);
      if (coiWrap) coiWrap.classList.toggle("hidden", d.insured !== "yes");
    }
    setFieldValue("vr-zelle", d.payoutZelle);
    setFieldValue("vr-payname", d.payoutName);
    setFieldValue("vr-bankname", d.payoutBankName);
    setFieldValue("vr-routing", d.payoutRouting);
    setFieldValue("vr-account", d.payoutAccount);
    var pm = document.getElementById("vr-paymethod");
    if (pm && d.payoutMethod) {
      pm.value = d.payoutMethod;
      pm.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setCheckedValues("vr-services", d.services);
    setCheckedValues("vr-areas", d.areas);
    var bn = document.getElementById("vr-google-banner");
    if (bn) {
      bn.innerHTML = "Welcome back. Your vendor profile is not finished yet. We still need a few details before we can send you work, so please fill in what is missing below and tap Finish registration.";
      bn.classList.remove("hidden");
    }
  }
  function enterGoogleMode(user) {
    googleUser = user;
    var em = document.getElementById("vr-email");
    if (em && user.email) { em.value = user.email; em.readOnly = true; }
    var nm = document.getElementById("vr-name");
    if (nm && user.displayName && !nm.value) nm.value = user.displayName;
    var pwEl = document.getElementById("vr-password");
    if (pwEl) {
      pwEl.required = false;
      pwEl.removeAttribute("minlength");
      var lab = pwEl.closest ? pwEl.closest("label") : null;
      if (lab) lab.style.display = "none";
    }
    var bn = document.getElementById("vr-google-banner");
    if (bn) {
      bn.innerHTML = "You\u2019re signed in with Google as <strong>" + (user.email || "") + "</strong>. Finish your vendor registration below \u2014 no password needed.";
      bn.classList.remove("hidden");
    }
    var gw = document.getElementById("vr-google-wrap");
    if (gw) gw.style.display = "none";
    var sb = document.getElementById("vr-submit");
    if (sb) sb.textContent = "Finish registration";
    var h2 = document.querySelector("#vendor-register-form h2");
    if (h2) h2.textContent = "Finish your vendor registration";
  }
  auth.onAuthStateChanged(function (user) {
    if (!user) return;
    db.collection("vendors").doc(user.uid).get().then(function (snap) {
      if (snap.exists) {
        var data = snap.data() || {};
        var missing = missingRequired({
          name: data.name, business: data.business,
          email: data.email || user.email, phone: data.phone,
          services: data.services, areas: data.areas
        });
        if (missing.length === 0 && !data.profileIncomplete) { window.location.href = "vendor-dashboard.html"; return; }
        enterCompleteMode(user, data);
        return;
      }
      enterGoogleMode(user);
    }).catch(function () { enterGoogleMode(user); });
  });
  var vrGoogleBtn = document.getElementById("vr-google");
  if (vrGoogleBtn) vrGoogleBtn.addEventListener("click", function () {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-window-closed")) {
        auth.signInWithRedirect(provider);
      } else {
        var e = document.getElementById("vr-error");
        if (e) { e.textContent = (err && err.message) || "Google sign-in failed. Please try again."; e.classList.remove("hidden"); }
      }
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = document.getElementById("vr-error");
    errEl.classList.add("hidden");
    var btn = document.getElementById("vr-submit");

    var business = document.getElementById("vr-business").value.trim();
    var name = document.getElementById("vr-name").value.trim();
    var email = document.getElementById("vr-email").value.trim();
    var phone = document.getElementById("vr-phone").value.trim();
    var pw = document.getElementById("vr-password").value;
    var services = checkedValues("vr-services");
    var areas = checkedValues("vr-areas");
    var crewSize = document.getElementById("vr-crewsize").value;
    var equipment = document.getElementById("vr-equipment").value.trim();
    var address = document.getElementById("vr-address").value.trim();
    var hearAbout = ((document.getElementById("vr-source") || {}).value || "").trim();
    var payMethodEl = document.getElementById("vr-paymethod");
    var payoutMethod = payMethodEl ? payMethodEl.value : "";
    var payoutZelle = ((document.getElementById("vr-zelle") || {}).value || "").trim();
    var payoutName = ((document.getElementById("vr-payname") || {}).value || "").trim();
    var payoutBankName = ((document.getElementById("vr-bankname") || {}).value || "").trim();
    var payoutRouting = ((document.getElementById("vr-routing") || {}).value || "").trim();
    var payoutAccount = ((document.getElementById("vr-account") || {}).value || "").trim();
    var payoutAchName = ((document.getElementById("vr-achname") || {}).value || "").trim();
    if (payoutMethod === "ach" && payoutAchName) payoutName = payoutAchName;
    var insured = document.getElementById("vr-insured").value;
    var w9Choice = document.querySelector('input[name="vr-w9-choice"]:checked');
    var w9Later = w9Choice && w9Choice.value === "later";
    var w9File = (!w9Later && document.getElementById("vr-w9").files[0]) || null;
    var coiFile = document.getElementById("vr-coi").files[0] || null;
    var ndaAgreed = document.getElementById("vr-agree-nda").checked;
    var contractAgreed = document.getElementById("vr-agree-contract").checked;
    var signature = document.getElementById("vr-signature").value.trim();
    var nowMs = Date.now();

    /* Required-fields gate: no account is created and no vendor doc
       is saved while any required qualification field is missing. */
    var missing = missingRequired({
      name: name, business: business, email: email, phone: phone,
      services: services, areas: areas
    });
    if (missing.length) {
      showMissing(missing, errEl);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploading documents...";
    var w9Url = null, coiUrl = null;
    uploadDoc(w9File, "vendor-w9").then(function (u) { w9Url = u; return uploadDoc(coiFile, "vendor-coi"); })
    .then(function (u) {
      coiUrl = u;
      btn.textContent = "Creating account...";
      if (googleUser) return Promise.resolve({ user: googleUser });
      return auth.createUserWithEmailAndPassword(email, pw);
    }).then(function (cred) {
      var docEmail = email || (cred.user && cred.user.email) || "";
      var v = {
        business: business,
        name: name,
        email: docEmail,
        phone: phone,
        address: address,
        hearAbout: hearAbout,
        services: services,
        areas: areas,
        crewSize: crewSize,
        equipment: equipment,
        insured: insured,
        w9Url: w9Url, w9Status: w9Url ? "received" : "pending",
        w9Due: w9Url ? null : new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
        coiUrl: coiUrl, coiStatus: coiUrl ? "received" : "pending",
        agreedToTerms: true,
        agreements: {
          nda: ndaAgreed,
          contractorAgreement: contractAgreed,
          signedName: signature,
          signedAt: new Date().toISOString(),
          version: "2026-10-15"
        },
        payoutMethod: payoutMethod || "",
        payoutZelle: payoutZelle || "",
        payoutName: payoutName || "",
        payoutBankName: payoutBankName || "",
        payoutRouting: payoutRouting || "",
        payoutAccount: payoutAccount || "",
        verified: false,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (completeUser) {
        // Finishing an incomplete profile: merge into the existing doc
        // so nothing already on file is lost, and clear the incomplete
        // flag only now that the gate passed. Approval state stays
        // whatever it already is, and documents already on file stay
        // on file unless the vendor just uploaded a replacement.
        delete v.createdAt;
        delete v.status;
        delete v.verified;
        if (!w9Url && completeData) {
          v.w9Url = completeData.w9Url || null;
          v.w9Status = completeData.w9Status || v.w9Status;
          v.w9Due = completeData.w9Due || v.w9Due;
        }
        if (!coiUrl && completeData) {
          v.coiUrl = completeData.coiUrl || null;
          v.coiStatus = completeData.coiStatus || v.coiStatus;
        }
        v.profileIncomplete = false;
        v.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        return db.collection("vendors").doc(cred.user.uid).set(v, { merge: true }).then(function () { return v; });
      }
      return db.collection("vendors").doc(cred.user.uid).set(v).then(function () { return v; });
    }).then(function (v) {
      notifyEdwin(v); // Edwin gets an inbox alert; vendor welcome email sends from the backend when installed
      window.location.href = "vendor-dashboard.html";
    }).catch(function (err) {
      errEl.textContent = err.message || "Something went wrong. Please try again.";
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = (googleUser || completeUser) ? "Finish registration" : "Create vendor account";
    });
  });

  /* Payment-method block toggle on the register form (v6). */
  var paySel = document.getElementById("vr-paymethod");
  if (paySel) {
    var syncPayBlocks = function () {
      var m = paySel.value;
      var z = document.getElementById("vr-pay-zelle"), a = document.getElementById("vr-pay-ach"), c = document.getElementById("vr-pay-check");
      if (z) z.classList.toggle("hidden", m !== "zelle");
      if (a) a.classList.toggle("hidden", m !== "ach");
      if (c) c.classList.toggle("hidden", m !== "check");
    };
    paySel.addEventListener("change", syncPayBlocks);
    syncPayBlocks();
  }
})();

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
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  var me = null;       // firebase user
  var vendor = null;    // vendors/{uid} data
  var myEvals = [];     // quote requests I accepted for evaluation (for quote form dropdown)
  var openQRs = [];     // open quote requests visible to me (for quote form dropdown)
  var myQuoted = {};    // workOrderId -> true, quote requests I already submitted a quote for
  var sessionPhotosByWo = {}; // workOrderId -> [urls] uploaded from this device during this portal session (grouped into visitLog on Mark complete)

  var _yr = document.getElementById("vd-year");
  if (_yr) _yr.textContent = new Date().getFullYear();

  // ---------- Login ----------
  $("vd-loginform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("vd-login-error");
    hide(errEl);
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, "Signing in...");
    auth.signInWithEmailAndPassword($("vd-login-email").value.trim(), $("vd-login-password").value.trim())
      .then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); errEl.textContent = friendlyAuthError(err); show(errEl); });
  });
  $("vd-logout").addEventListener("click", function (e) { e.preventDefault(); auth.signOut(); });
  $("vd-noprofile-logout").addEventListener("click", function () { auth.signOut(); });

  // ---------- Left slide-over menu (burger + drawer) ----------
  // Burger, backdrop and drawer live inside #vd-dash, so they only
  // exist while the dashboard is shown (same scoping as the tab bar).
  var drawerEl = $("vd-drawer"), backdropEl = $("vd-drawer-backdrop"), burgerEl = $("vd-burger");
  function drawerOpen() { return drawerEl && drawerEl.classList.contains("open"); }
  function openDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.add("open");
    if (backdropEl) backdropEl.classList.add("open");
    if (burgerEl) burgerEl.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden"; // lock page scroll behind the drawer
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove("open");
    if (backdropEl) backdropEl.classList.remove("open");
    if (burgerEl) burgerEl.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (burgerEl) burgerEl.addEventListener("click", openDrawer);
  if (backdropEl) backdropEl.addEventListener("click", closeDrawer);
  if ($("vd-drawer-close")) $("vd-drawer-close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && drawerOpen()) closeDrawer();
  });
  // Drawer links: close first, then glide to the section (the page
  // already smooth-scrolls anchors via CSS; scrollIntoView keeps the
  // behavior identical after the drawer closes).
  if (drawerEl) drawerEl.querySelectorAll(".vd-drawer-link").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) !== "#") return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      closeDrawer();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  // Drawer "Salir": one logout behavior only — fire the hero's
  // existing #vd-logout handler.
  if ($("vd-drawer-logout")) $("vd-drawer-logout").addEventListener("click", function () {
    closeDrawer();
    var lo = $("vd-logout");
    if (lo) lo.click();
  });

  // Count badge on a drawer link: number when n > 0, hidden otherwise.
  function setDrawerBadge(id, n) {
    var b = $(id);
    if (!b) return;
    if (n > 0) { b.textContent = n; b.classList.remove("hidden"); }
    else { b.textContent = ""; b.classList.add("hidden"); }
  }

  // "Cuenta" attention dots, from the same vendor fields renderW9 /
  // renderAgreements already read: W-9 still pending, or the current
  // agreements version not yet signed.
  function renderDrawerDots() {
    if (!vendor) return;
    var w9 = $("vd-nav-dot-w9");
    if (w9) {
      var st = String(vendor.w9Status || "pending").toLowerCase();
      var w9Done = st === "received" || st === "approved" || st === "submitted";
      w9.classList.toggle("hidden", w9Done);
    }
    var payDot = $("vd-nav-dot-pay");
    if (payDot) payDot.classList.toggle("hidden", payoutComplete(vendor));
    var ag = $("vd-nav-dot-agree");
    if (ag) {
      var signed = vendor.agreements && vendor.agreements.version === AGREEMENTS_VERSION;
      ag.classList.toggle("hidden", !!signed);
    }
  }

  $("vd-google").addEventListener("click", function () {
    var errEl = $("vd-login-error"); hide(errEl);
    var provider = new firebase.auth.GoogleAuthProvider();
    // Mobile browsers often block popups: fall back to full-page redirect.
    auth.signInWithPopup(provider).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-window-closed")) {
        auth.signInWithRedirect(provider);
      } else {
        errEl.textContent = friendlyAuthError(err); show(errEl);
      }
    });
  });

  $("vd-forgot").addEventListener("click", function (e) {
    e.preventDefault();
    var errEl = $("vd-login-error"); hide(errEl); hide($("vd-reset-ok"));
    var email = $("vd-login-email").value.trim();
    if (!email) { errEl.textContent = "Type your email above first."; show(errEl); return; }
    auth.sendPasswordResetEmail(email).then(function () {
      $("vd-reset-ok").textContent = "Reset link sent to " + email + ".";
      show($("vd-reset-ok"));
    }).catch(function (err) { errEl.textContent = friendlyAuthError(err); show(errEl); });
  });

  auth.onAuthStateChanged(function (user) {
    me = user;
    if (!user) { show($("vd-loginwrap")); hide($("vd-dash")); hide($("vd-topbar")); hide($("vd-noprofile")); hide($("vd-loading")); return; }
    // Signed in: hide the login, but keep the dashboard (and its fixed
    // burger) hidden until the profile result is known — showing it here
    // and hiding it again for no-profile accounts was the hamburger
    // flash on refresh. #vd-loading covers the wait instead.
    hide($("vd-loginwrap")); hide($("vd-noprofile")); hide($("vd-dash")); hide($("vd-topbar"));
    show($("vd-loading"));
    db.collection("vendors").doc(user.uid).get().then(function (snap) {
      hide($("vd-loading"));
      if (!snap.exists) {
        // Signed in but no vendor profile: explain it on a friendly panel
        // instead of silently bouncing to the register page (the old
        // redirect read as "it logs me in, then kicks me out").
        // (vd-dash / vd-topbar were never shown, so nothing to hide.)
        $("vd-noprofile-email").textContent = user.email || "your account";
        show($("vd-noprofile"));
        return;
      }
      vendor = snap.data();
      show($("vd-dash")); show($("vd-topbar"));
      renderHeader();
      renderProfile();
      renderDocs();
      renderAgreements();
      renderW9();
      renderSetup();
      loadAll();
    }).catch(function () {
      // Profile load failed: stay on this page, back to the login view
      // with a friendly message. Never bounce.
      hide($("vd-loading")); hide($("vd-dash")); hide($("vd-topbar")); hide($("vd-noprofile"));
      show($("vd-loginwrap"));
      var errEl = $("vd-login-error");
      errEl.textContent = "We hit a snag loading your vendor profile. Check your connection and try refreshing the page.";
      show(errEl);
    });
  });

  function renderHeader() {
    $("vd-biz").textContent = vendor.business || "Vendor";
    // Photo hero sub-line shows the primary area, plus "+n" when the
    // vendor covers more (profile section still lists them all).
    var areas = vendor.areas || [];
    $("vd-area").textContent = areas.length ? areas[0] + (areas.length > 1 ? " +" + (areas.length - 1) : "") : "";
    $("vd-hello").textContent = (vendor.name || "there").split(" ")[0];
    // Drawer header mirrors the same identity: business name + an
    // initials avatar (first letters of the first two words of the
    // business, falling back to the contact name).
    var dBiz = $("vd-drawer-biz");
    if (dBiz) dBiz.textContent = vendor.business || vendor.name || "Vendor";
    var dIni = $("vd-drawer-initials");
    if (dIni) {
      var words = String(vendor.business || vendor.name || "PrimeGuard").split(/\s+/).filter(Boolean);
      dIni.textContent = words.slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "PG";
    }
  }

  function renderProfile() {
    var v = vendor;
    var st = v.status || (v.verified ? "approved" : "pending");
    var stTxt = st === "approved" ? "APPROVED" : st === "rejected" ? "NOT APPROVED" : "PENDING REVIEW";
    $("cnt-verified").textContent = stTxt;
    var banner = $("vd-status-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "vd-status-banner";
      banner.style.cssText = "margin:0 0 16px;padding:14px 18px;border-radius:14px;font-size:.92rem;font-weight:600;";
      var sec = document.querySelector("#vd-dash .vsec");
      if (sec) sec.parentNode.insertBefore(banner, sec);
    }
    if (st === "approved") {
      banner.style.display = "none";
    } else {
      banner.style.display = "block";
      banner.style.border = "1px solid rgba(212,168,67,.45)";
      banner.style.background = "rgba(212,168,67,.08)";
      banner.style.color = "#f5d67b";
      banner.textContent = st === "rejected"
        ? "Your registration was not approved. Contact PrimeGuard at (786) 422-9674 if you think this is a mistake."
        : "Your registration is under review. You'll be able to accept jobs once approved.";
    }
    // Photo hero status pill: same status the profile/banners already
    // compute — gold for approved, frosted for everything else.
    var pill = $("vd-status-pill");
    if (pill) {
      if (st === "approved") { pill.className = "vd-ph-pill"; pill.textContent = "✓ Aprobado"; }
      else if (st === "pending") { pill.className = "vd-ph-pill vd-ph-pill-frost"; pill.textContent = "En revisión"; }
      else { pill.className = "vd-ph-pill vd-ph-pill-frost"; pill.textContent = stTxt; }
    }
    // Drawer header status line: same computed status, Spanish labels.
    var dStatus = $("vd-drawer-status");
    if (dStatus) {
      dStatus.textContent = st === "approved" ? "✓ Aprobado" : st === "pending" ? "En revisión" : stTxt;
    }
    $("vd-profile").innerHTML = [
      ["Business", v.business], ["Contact", v.name], ["Phone", v.phone],
      ["Email", v.email], ["Services", (v.services || []).join(", ")],
      ["Areas", (v.areas || []).join(", ")], ["Crew size", v.crewSize],
      ["Equipment", v.equipment || "-"]
    ].map(function (f) {
      return '<div class="vfield"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1] || "-") + '</strong></div>';
    }).join("");
  }

  // ---------- Documents reminder (W-9 / insurance) ----------
  function renderDocs() {
    var v = vendor, sec = $("vd-docs-sec"), list = $("vd-docs-list");
    // Quiet COI line in the Documentos area (upload itself lives in the
    // alert section below, same as before).
    var coiLine = $("vd-coi-line");
    if (coiLine) {
      if (v.insured === "yes" && v.coiStatus === "received") {
        coiLine.innerHTML = "<strong>Certificado de seguro (COI): recibido ✓</strong> — en archivo con la oficina.";
        coiLine.classList.remove("hidden");
      } else {
        coiLine.innerHTML = "";
        coiLine.classList.add("hidden");
      }
    }
    var needW9 = v.w9Status !== "received";
    var needCoi = v.insured === "yes" && v.coiStatus !== "received";
    if (!needW9 && !needCoi) { sec.classList.add("hidden"); return; }
    sec.classList.remove("hidden");
    var html = "";
    if (needW9) {
      var due = v.w9Due ? new Date(v.w9Due) : null;
      var days = due ? Math.ceil((due - Date.now()) / 86400000) : null;
      var dueTxt = days === null ? "as soon as possible" : days > 0 ? days + " day" + (days === 1 ? "" : "s") + " left" : "overdue - upload now";
      html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.25)">' +
        '<div style="flex:1;min-width:200px"><strong>W-9 form</strong><div style="font-size:.85rem;color:var(--muted)">' + dueTxt + '</div></div>' +
        '<input type="file" id="vd-w9-file" accept=".pdf,.jpg,.jpeg,.png" style="font-size:.85rem">' +
        '<button class="btn btn-gold" id="vd-w9-btn" style="padding:10px 18px;font-size:.9rem">Upload</button></div>';
    }
    if (needCoi) {
      html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.25)">' +
        '<div style="flex:1;min-width:200px"><strong>Certificate of insurance</strong><div style="font-size:.85rem;color:var(--muted)">Required since you carry general liability</div></div>' +
        '<input type="file" id="vd-coi-file" accept=".pdf,.jpg,.jpeg,.png" style="font-size:.85rem">' +
        '<button class="btn btn-gold" id="vd-coi-btn" style="padding:10px 18px;font-size:.9rem">Upload</button></div>';
    }
    list.innerHTML = html;
    var w9b = $("vd-w9-btn");
    if (w9b) w9b.addEventListener("click", function () { uploadVendorDoc("vd-w9-file", "vendor-w9", { w9Status: "received", w9Url: "uploaded", w9Due: null }); });
    var coib = $("vd-coi-btn");
    if (coib) coib.addEventListener("click", function () { uploadVendorDoc("vd-coi-file", "vendor-coi", { coiStatus: "received", coiUrl: "uploaded" }); });
  }

  function uploadVendorDoc(inputId, folder, update) {
    var f = $(inputId).files[0];
    if (!f) { alert("Choose the file first."); return; }
    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    if (!endpoint) { alert("Uploads are being set up. Please text the document to us for now."); return; }
    var fr = new FileReader();
    fr.onload = function () {
      fetch(endpoint, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "doc-upload", folder: folder, name: f.name, mime: f.type, data: fr.result })
      }).then(function () {
        return db.collection("vendors").doc(me.uid).update(update);
      }).then(function () {
        return db.collection("vendors").doc(me.uid).get();
      }).then(function (snap) {
        vendor = snap.data(); renderDocs(); renderW9(); renderSetup();
        alert("Document received. Thank you.");
      }).catch(function () { alert("Upload failed. Please try again."); });
    };
    fr.readAsDataURL(f);
  }

  // ---------- Agreements (re-sign updated versions) ----------
  var AGREEMENTS_VERSION = "2026-10-15";
  var NDA_URL = "https://primeguardmia.com/assets/PrimeGuard-NDA-NonCircumvention.pdf";
  var ICA_URL = "https://primeguardmia.com/assets/PrimeGuard-Independent-Contractor-Agreement.pdf";

  function fmtDate(x, withYear) {
    if (!x) return "";
    var d = (x && typeof x.toDate === "function") ? x.toDate() : new Date(x);
    if (!d || isNaN(d.getTime())) return "";
    var opts = { month: "short", day: "numeric" };
    if (withYear) opts.year = "numeric";
    return d.toLocaleDateString("en-US", opts);
  }

  function renderAgreements() {
    var statusEl = $("va-status"), form = $("va-form");
    if (!statusEl || !form || !vendor) return;
    renderDrawerDots();
    var ag = vendor.agreements || {};
    var agSec = $("vd-agreements");
    if (agSec) agSec.classList.toggle("vd-doc-done", ag.version === AGREEMENTS_VERSION);
    if (ag.version === AGREEMENTS_VERSION) {
      hide(form);
      var when = fmtDate(ag.signedAt, true);
      statusEl.innerHTML =
        '<p style="font-size:.95rem;margin-bottom:10px"><strong style="color:var(--gold-bright)">Agreements signed ✓</strong> — ' +
        esc(ag.signedName || "") + (when ? ", " + esc(when) : "") + "</p>" +
        '<p style="font-size:.9rem;color:var(--muted)">On file: ' +
        '<a href="' + NDA_URL + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">Non-Circumvention, Non-Solicitation and Confidentiality Agreement</a> · ' +
        '<a href="' + ICA_URL + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">Independent Contractor Services Agreement</a></p>';
      return;
    }
    statusEl.innerHTML =
      '<h3 style="font-size:1.05rem;margin-bottom:6px">Updated agreements — please re-sign</h3>' +
      '<p style="color:var(--muted);font-size:.9rem;margin-bottom:14px;max-width:640px">We updated our vendor agreements. Please read the new versions below, check both boxes, and sign with your full legal name. It takes about a minute.</p>';
    var nameEl = $("va-name");
    if (nameEl && !nameEl.value) nameEl.value = ag.signedName || vendor.name || "";
    show(form);
    vaValidate();
  }

  function vaValidate() {
    var btn = $("va-sign");
    if (!btn) return;
    var name = ($("va-name").value || "").trim();
    var twoWords = name.split(/\s+/).filter(Boolean).length >= 2;
    btn.disabled = !($("va-nda").checked && $("va-ica").checked && twoWords);
  }

  ["va-nda", "va-ica"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("change", vaValidate);
  });
  if ($("va-name")) $("va-name").addEventListener("input", vaValidate);

  $("va-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("va-error"), okEl = $("va-ok");
    hide(errEl); hide(okEl);
    var old = (vendor && vendor.agreements) || {};
    var btn = $("va-sign");
    btn.disabled = true; btn.textContent = "Signing...";
    db.collection("vendors").doc(me.uid).update({
      agreements: {
        nda: true,
        contractorAgreement: true,
        signedName: $("va-name").value.trim(),
        signedAt: firebase.firestore.FieldValue.serverTimestamp(),
        version: AGREEMENTS_VERSION,
        previousSignedAt: old.signedAt || null
      }
    }).then(function () {
      return db.collection("vendors").doc(me.uid).get();
    }).then(function (snap) {
      vendor = snap.data();
      renderAgreements();
      okEl.textContent = "Thank you — your updated agreements are signed and on file.";
      show(okEl);
    }).catch(function (err) {
      errEl.textContent = "Something went wrong saving your signature: " + (err.message || err) + " Please try again.";
      show(errEl);
      btn.disabled = false; btn.textContent = "Sign agreements";
      vaValidate();
    });
  });

  // ---------- W-9 status (upload lives in Documents needed above) ----------
  function renderW9() {
    var el = $("vd-w9-status");
    if (!el || !vendor) return;
    renderDrawerDots();
    var st = String(vendor.w9Status || "pending").toLowerCase();
    var w9Sec = $("vd-w9-sec");
    if (w9Sec) w9Sec.classList.toggle("vd-doc-done", st === "received" || st === "approved" || st === "submitted");
    if (st === "received" || st === "approved") {
      el.innerHTML = '<strong style="color:var(--gold-bright)">W-9: received ✓</strong> <span style="color:var(--muted)">— on file with the office.</span>';
    } else if (st === "submitted") {
      el.innerHTML = '<strong style="color:var(--gold-bright)">W-9: submitted ✓</strong> <span style="color:var(--muted)">— received, on file with the office.</span>';
    } else {
      var due = fmtDate(vendor.w9Due, false);
      el.innerHTML = '<strong style="color:#f5d67b">W-9: pending' + (due ? " — due " + esc(due) : "") + '</strong> <span style="color:var(--muted)">— download the blank form below, fill it in, and upload it in the "Documents needed" section above.</span>';
    }
  }

  /* ---------- Finish-your-setup checklist + payment info (v16) ----------
     Edwin's design (2026-10-17): after signup the portal shows the vendor
     a checklist of everything still owed, and one of the items is their
     payment information (Zelle preferred, ACH, or check). Saved on the
     vendor doc as payoutMethod / payoutZelle / payoutName / payoutBankName
     / payoutRouting / payoutAccount so the office knows where to send pay
     the moment a job closes. */
  function payoutComplete(v) {
    if (!v || !v.payoutMethod) return false;
    if (v.payoutMethod === "zelle") return !!(v.payoutZelle && v.payoutName);
    if (v.payoutMethod === "ach") return !!(v.payoutAccount && v.payoutName);
    if (v.payoutMethod === "check") return true;
    return false;
  }
  function payoutSummary(v) {
    if (v.payoutMethod === "zelle") return "Zelle \u00b7 " + (v.payoutZelle || "") + (v.payoutName ? " (" + v.payoutName + ")" : "");
    if (v.payoutMethod === "ach") return "Bank transfer \u00b7 " + (v.payoutBankName || "bank") + " \u2026" + String(v.payoutAccount || "").slice(-4) + (v.payoutName ? " (" + v.payoutName + ")" : "");
    if (v.payoutMethod === "check") return "Check by mail \u00b7 " + (v.address || "");
    return "";
  }
  var setupPayOpen = false;
  function renderSetup() {
    var box = $("vd-setup");
    if (!box || !vendor) return;
    renderDrawerDots();
    var v = vendor;
    var w9st = String(v.w9Status || "pending").toLowerCase();
    var w9Done = w9st === "received" || w9st === "approved" || w9st === "submitted";
    var agreeDone = !!(v.agreements && v.agreements.version === AGREEMENTS_VERSION);
    var payDone = payoutComplete(v);
    var items = [
      { label: "Payment information: how we pay you", done: payDone, hint: payDone ? payoutSummary(v) : "Add your Zelle, bank transfer, or check details below so the office can pay you per job completed.", anchor: null, pay: true },
      { label: "W-9 form", done: w9Done, hint: w9Done ? "On file with the office." : "Still needed. Download the blank form and upload it in Documents needed.", anchor: "#vd-w9-sec" },
      { label: "Signed agreements (NDA + contractor agreement)", done: agreeDone, hint: agreeDone ? "Signed and on file." : "Review and sign in the Acuerdos section.", anchor: "#vd-agreements" }
    ];
    if (v.insured === "yes") {
      var coiDone = String(v.coiStatus || "").toLowerCase() === "received";
      items.push({ label: "Certificate of insurance", done: coiDone, hint: coiDone ? "On file with the office." : "Upload it in the Documents needed section.", anchor: "#vd-w9-sec" });
    }
    var doneN = items.filter(function (i) { return i.done; }).length;
    var html = '<div class="vd-doccard" style="margin-bottom:18px"><div class="t">Finish your setup</div>' +
      '<h4>' + (doneN === items.length ? "Your setup is complete \u2713" : doneN + " of " + items.length + " done") + "</h4>";
    items.forEach(function (it) {
      html += '<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed rgba(255,255,255,.09)">' +
        '<span style="font-size:1.05rem;line-height:1.3">' + (it.done ? "\u2705" : "\u2b1c") + "</span>" +
        '<div style="flex:1"><strong style="font-size:.95rem">' + esc(it.label) + '</strong><div style="font-size:.84rem;color:var(--muted)">' + esc(it.hint) + "</div></div>" +
        (it.pay ? '<button class="btn btn-gold" id="vd-pay-toggle" type="button" style="padding:8px 16px;font-size:.85rem">' + (it.done ? "Update" : "Add") + "</button>"
                 : (!it.done && it.anchor ? '<a class="btn btn-ghost" href="' + it.anchor + '" style="padding:8px 16px;font-size:.85rem;text-decoration:none">Go</a>' : "")) +
        "</div>";
    });
    var showForm = setupPayOpen || !payDone;
    html += '<form id="vd-pay-form" class="vform' + (showForm ? "" : " hidden") + '" style="margin-top:14px;max-width:640px">' +
      '<label>Payment method<select id="vd-paymethod" style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#141417;color:var(--text);font-size:1rem;margin-top:6px">' +
      '<option value="zelle">Zelle (fastest)</option><option value="ach">Bank transfer (ACH)</option><option value="check">Check by mail</option></select></label>' +
      '<div id="vd-pay-zelle"><label>Zelle phone or email<input type="text" id="vd-zelle" value="' + esc(v.payoutZelle || "") + '"></label>' +
      '<label>Name on the account<input type="text" id="vd-payname" value="' + esc(v.payoutName || "") + '"></label></div>' +
      '<div id="vd-pay-ach" class="hidden"><label>Bank name<input type="text" id="vd-bankname" value="' + esc(v.payoutBankName || "") + '"></label>' +
      '<label>Routing number<input type="text" id="vd-routing" inputmode="numeric" value="' + esc(v.payoutRouting || "") + '"></label>' +
      '<label>Account number<input type="text" id="vd-account" inputmode="numeric" value="' + esc(v.payoutAccount || "") + '"></label>' +
      '<label>Name on the account<input type="text" id="vd-achname" value="' + esc(v.payoutName || "") + '"></label></div>' +
      '<p id="vd-pay-check" class="hidden" style="font-size:.88rem;color:var(--muted)">Checks are mailed to your business address on file: ' + esc(v.address || "") + ".</p>" +
      '<p id="vd-pay-msg" style="font-size:.88rem;margin:8px 0"></p>' +
      '<button class="btn btn-gold" id="vd-pay-save" type="submit" style="padding:11px 22px">Save payment info</button></form>';
    html += '<p style="font-size:.84rem;color:var(--muted);margin-top:12px">Job alerts: turn on notifications so you never miss a new job. <button class="btn btn-ghost" id="vd-setup-push" type="button" style="padding:7px 14px;font-size:.82rem;margin-left:6px">Turn on notifications</button></p>';
    html += "</div>";
    box.innerHTML = html;
    var sel = $("vd-paymethod");
    if (sel) {
      sel.value = v.payoutMethod || "zelle";
      var sync = function () {
        var m = sel.value;
        $("vd-pay-zelle").classList.toggle("hidden", m !== "zelle");
        $("vd-pay-ach").classList.toggle("hidden", m !== "ach");
        $("vd-pay-check").classList.toggle("hidden", m !== "check");
      };
      sel.addEventListener("change", sync); sync();
    }
    var tog = $("vd-pay-toggle");
    if (tog) tog.addEventListener("click", function () { setupPayOpen = !setupPayOpen; renderSetup(); });
    var pushBtn = $("vd-setup-push");
    if (pushBtn) pushBtn.addEventListener("click", function () { if (window.PGpush) PGpush.enable("vendor"); });
    var form = $("vd-pay-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = sel.value;
      var data = {
        payoutMethod: m,
        payoutZelle: $("vd-zelle").value.trim(),
        payoutName: $("vd-payname").value.trim(),
        payoutBankName: $("vd-bankname").value.trim(),
        payoutRouting: $("vd-routing").value.trim(),
        payoutAccount: $("vd-account").value.trim(),
        payoutUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (m === "ach" && $("vd-achname").value.trim()) data.payoutName = $("vd-achname").value.trim();
      var msg = $("vd-pay-msg");
      var probe = Object.assign({}, vendor, data);
      if (!payoutComplete(probe)) {
        msg.style.color = "#e8a33d";
        msg.textContent = m === "zelle" ? "Add your Zelle phone or email and the name on the account." : m === "ach" ? "Add your bank, routing, account number, and the name on the account." : "Something is missing.";
        return;
      }
      $("vd-pay-save").disabled = true;
      db.collection("vendors").doc(me.uid).update(data).then(function () {
        return db.collection("vendors").doc(me.uid).get();
      }).then(function (snap) {
        vendor = snap.data(); setupPayOpen = false;
        renderSetup(); renderDrawerDots();
        alert("Payment info saved. The office can now pay you per job completed.");
      }).catch(function () {
        msg.style.color = "#e88"; msg.textContent = "Save failed. Please try again.";
        $("vd-pay-save").disabled = false;
      });
    });
  }

  // ---------- "My Day" helpers (money strip + next-job hero) ----------
  // Presentation only: these read fields the page already loads; no new
  // queries, no new writes, no invented figures.
  function parseDate(x) {
    if (!x) return null;
    if (typeof x.toDate === "function") { try { return x.toDate(); } catch (e) { return null; } }
    if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
    if (typeof x === "object" && typeof x.seconds === "number") return new Date(x.seconds * 1000);
    if (typeof x === "string" || typeof x === "number") {
      var d = new Date(x);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function fmtDateEs(d) {
    try { return d.toLocaleDateString("es-US", { weekday: "short", month: "short", day: "numeric" }); }
    catch (e) { return fmtDate(d); }
  }

  // Pay exactly as the office wrote it ("$45" or "45"); "" when unset.
  function fmtPay(w) {
    var raw = String((w && (w.payAgreed || w.pay)) || "").trim();
    if (!raw) return "";
    return raw.indexOf("$") >= 0 ? raw : "$" + raw;
  }

  function heroPhoto(w) {
    if (w.photos && w.photos.length) return w.photos[0];
    var s = ((w.category || "") + " " + (w.title || "")).toLowerCase();
    if (/lawn|césped|cesped|grass|mow|yard|jardín|jardin/.test(s)) return "assets/hero-lawn-daylight.jpg";
    if (/pressure|lavado|washing/.test(s)) return "assets/hero-pw-daylight.jpg";
    if (/junk|escombro|haul|debris|basura/.test(s)) return "assets/hero-junk-daylight.jpg";
    if (/handyman|repair|repar|plumb|electric/.test(s)) return "assets/hero-handyman-daylight.jpg";
    if (/make.?ready|paint|pintura|clean/.test(s)) return "assets/hero-makeready-daylight.jpg";
    return "assets/careers-crew.jpg";
  }

  var WO_DATE_FIELDS = ["scheduledFor", "scheduledDate", "serviceDate", "appointmentDate", "date", "when", "requestedWhen", "timing", "schedule", "preferredTime"];
  function jobWhen(w) {
    for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
      var val = w[WO_DATE_FIELDS[i]];
      if (val === null || val === undefined || val === "") continue;
      if (typeof val === "string") {
        if (val.indexOf(":") >= 0) return val; // carries its own time text
        var d = parseDate(val);
        if (d) return fmtDateEs(d);
        return val;
      }
      var dd = parseDate(val);
      if (dd) return fmtDateEs(dd);
    }
    var acc = parseDate(w.acceptedAt);
    if (acc) return "Aceptado el " + fmtDateEs(acc);
    return "";
  }

  function statusLabelEs(w) {
    if (!w) return "";
    if (w.status === "accepted") return "Aceptado";
    if (w.status === "evaluation_accepted") return "Evaluación aceptada";
    return String(w.status || "").replace(/_/g, " ");
  }

  // Next job to work: not the ones already finished (status "review" is
  // vendor-complete, waiting on the office). Earliest scheduled date when
  // the work order carries one; otherwise the most recently accepted.
  function pickHero(active) {
    var cands = active.filter(function (w) { return w.status !== "review"; });
    if (!cands.length) return null;
    function sched(w) {
      for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
        var d = parseDate(w[WO_DATE_FIELDS[i]]);
        if (d) return d.getTime();
      }
      return null;
    }
    cands.sort(function (a, b) {
      var sa = sched(a), sb = sched(b);
      if (sa !== null && sb !== null) return sa - sb;
      if (sa !== null) return -1;
      if (sb !== null) return 1;
      var aa = (parseDate(a.acceptedAt) || parseDate(a.createdAt) || new Date(0)).getTime();
      var ab = (parseDate(b.acceptedAt) || parseDate(b.createdAt) || new Date(0)).getTime();
      return ab - aa;
    });
    return cands[0];
  }

  var SVG_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  var SVG_NAV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
  var SVG_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  // Job checklists (Oct 18, Jobber-steal): per-service steps the vendor
  // ticks off; Mark complete is blocked until every step is checked.
  function checklistFor(w) {
    var cat = ((w.category || "") + " " + (w.title || "")).toLowerCase();
    if (/pressure|presión|presion|wash/.test(cat)) return ["Fotos de antes subidas", "Superficie lavada completa", "Área enjuagada y limpia", "Fotos de después subidas"];
    if (/lawn|landscap|césped|cesped|jardín|jardin|grass|mow|cut|corte/.test(cat)) return ["Fotos de antes subidas", "Césped cortado completo", "Bordes y trimming hechos", "Entrada, driveway y aceras soplados", "Portón cerrado y propiedad segura", "Fotos de después subidas"];
    return ["Fotos de antes subidas", "Trabajo completado según la orden", "Área limpia al terminar", "Fotos de después subidas"];
  }
  function checklistState(w) { return (w && w.checklist && typeof w.checklist === "object") ? w.checklist : {}; }
  function checklistDoneCount(w) { var st = checklistState(w); return checklistFor(w).filter(function (_, i) { return !!st[i]; }).length; }
  function checklistBarHtml(w) {
    var items = checklistFor(w), n = checklistDoneCount(w), pct = Math.round(n / items.length * 100);
    return '<div class="vd-checkbar"><div class="vd-checkbar-top"><span>Lista de verificación</span><strong>' + n + "/" + items.length + '</strong></div><div class="vd-checktrack"><i style="width:' + pct + '%"></i></div></div>';
  }
  function checklistHtml(w) {
    var items = checklistFor(w), st = checklistState(w);
    return '<div class="vd-checklist">' + checklistBarHtml(w) + items.map(function (label, i) {
      return '<label class="vd-check"><input type="checkbox" data-checklist="' + w.id + '" data-idx="' + i + '"' + (st[i] ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
    }).join("") + "</div>";
  }

  function renderHero(w) {
    var box = $("vd-hero");
    if (!box) return;
    var cnt = $("vd-hero-cnt");
    if (cnt) cnt.textContent = w ? statusLabelEs(w) : "";
    if (!w) {
      box.innerHTML = '<div class="vd-hero vd-hero-empty"><div class="vd-hero-body">' +
        "<h3>Sin trabajos aceptados todavía</h3>" +
        '<p class="vd-addr">Cuando aceptes un trabajo, aquí verás la dirección, el horario y los botones para llegar, subir las fotos y marcarlo terminado. Revisa los trabajos disponibles abajo.</p>' +
        "</div></div>";
      return;
    }
    var dest = w.address || (w.area ? w.area + ", Miami, FL" : "");
    var mapsBtn = dest
      ? '<a class="vd-btn vd-btn-gold" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '">' + SVG_NAV + "Cómo llegar</a>"
      : "";
    // Third action mirrors what this job kind already allows in the
    // active list — no new writes are invented here.
    var third;
    if (w.kind !== "quote_request") {
      third = '<button class="vd-btn vd-btn-dark" type="button" data-complete="' + w.id + '">' + SVG_CHECK + "Marcar terminado</button>";
    } else if (!w.quoteSubmitted) {
      third = '<button class="vd-btn vd-btn-dark" type="button" data-give-quote="' + w.id + '">Dar mi precio</button>';
    } else {
      third = '<button class="vd-btn vd-btn-outline" type="button" disabled>Precio enviado ✓</button>';
    }
    var pay = fmtPay(w);
    var payHtml = pay
      ? '<div><small>Paga</small><span class="vd-pay">' + esc(pay) + '</span></div><span class="vd-paynote">Pago al terminar,<br>con las fotos</span>'
      : '<div><small>Paga</small><span class="vd-pay vd-pay-tqp">Tú pones el precio</span></div>';
    var when = jobWhen(w);
    box.innerHTML = '<article class="vd-hero">' +
      '<div class="vd-hero-photo"><img src="' + esc(heroPhoto(w)) + '" alt="">' +
      '<span class="vd-badge">' + esc(statusLabelEs(w)) + "</span></div>" +
      '<div class="vd-hero-body"><h3>' + esc(w.title) + "</h3>" +
      (when ? '<p class="vd-bigwhen">' + SVG_CLOCK + esc(when) + "</p>" : "") +
      '<p class="vd-addr">' + (w.area ? "<strong>" + esc(w.area) + "</strong>" : "") +
        (w.address ? " · " + esc(w.address) : "") +
        (w.details ? "<br>" + esc(w.details) : "") + "</p>" +
      '<div class="vd-payrow">' + payHtml + "</div>" +
      mapsBtn +
      '<button class="vd-btn vd-btn-outline" type="button" data-upload="' + w.id + '">' + SVG_CAM + "Subir fotos</button>" +
      third +
      (w.kind !== "quote_request" ? checklistBarHtml(w) : "") +
      '<input type="file" accept="image/*" multiple class="hidden" id="up-' + w.id + '">' +
      "</div></article>";
  }

  // ---------- Work orders ----------
  // Visibility (Edwin, 2026-10-16): an open work order is NOT visible to a
  // vendor just because it exists. It shows only when the office sent it to
  // this vendor (vendorNotifyTarget is their id, or they are the assignee)
  // or posted it as available work (broadcast). A specific target locks the
  // job to that vendor; legacy docs with no specific target fall back to the
  // broadcast flag (undefined broadcast counts as posted, matching how the
  // pre-board portal behaved for those docs).
  function woVisibleToMe(w) {
    if (!w || !me) return false;
    if (w.vendorNotifyTarget && w.vendorNotifyTarget !== "broadcast") {
      return w.vendorNotifyTarget === me.uid || w.vendorId === me.uid;
    }
    return w.broadcast === true || w.vendorId === me.uid;
  }

  // Inactive accounts (archived or rejected by the office) get no job
  // board: every job surface is cleared and one panel explains why. Their
  // profile, agreements and documents stay reachable above.
  function vendorInactive() {
    if (!vendor) return false;
    var st = vendor.status || (vendor.verified ? "approved" : "pending");
    return st === "archived" || st === "rejected";
  }
  function renderInactivePanel() {
    ["list-qr", "list-jobs", "list-active", "list-done", "vd-hero"].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = "";
    });
    ["cnt-qr", "cnt-jobs", "cnt-active", "cnt-done", "vd-hero-cnt"].forEach(function (id) {
      var el = $(id); if (el) el.textContent = "";
    });
    // No job board for inactive accounts: no menu entry point, no badges.
    if (burgerEl) burgerEl.classList.add("hidden");
    setDrawerBadge("vd-nav-badge-avail", 0);
    setDrawerBadge("vd-nav-badge-active", 0);
    openQRs = [];
    var sel = $("q-workorder");
    if (sel) sel.innerHTML = '<option value="">Select a quote request...</option>';
    var qr = $("list-qr");
    if (qr) {
      qr.innerHTML = '<div class="vjob" style="max-width:720px"><h3>Tu cuenta no está activa</h3>' +
        '<p>Llama a PrimeGuard al <a href="tel:+17864229674">(786) 422-9674</a>.</p>' +
        '<p style="color:var(--muted)">Your account isn\'t active. Call PrimeGuard at (786) 422-9674.</p></div>';
    }
  }

  // Quote form dropdown: open quote requests + ones I accepted for evaluation,
  // minus any I already quoted. Any open request can be quoted right from its card.
  function buildQuoteSelect() {
    var sel = $("q-workorder");
    if (!sel) return;
    var cur = sel.value;
    var quotable = [], seenQ = {};
    myEvals.concat(openQRs).forEach(function (w) {
      if (seenQ[w.id] || myQuoted[w.id]) return;
      seenQ[w.id] = true;
      quotable.push(w);
    });
    sel.innerHTML = '<option value="">Select a quote request...</option>' + quotable.map(function (w) {
      return '<option value="' + w.id + '">' + esc(w.title) + " - " + esc(w.area) + "</option>";
    }).join("");
    if (cur) sel.value = cur;
  }

  function loadAll() {
    if (vendorInactive()) { renderInactivePanel(); return; }
    if (burgerEl) burgerEl.classList.remove("hidden");
    db.collection("quotes").where("vendorId", "==", me.uid).get().then(function (qs) {
      myQuoted = {};
      qs.forEach(function (d) {
        var q = d.data();
        if (q.workOrderId) myQuoted[q.workOrderId] = true;
      });
    }).catch(function () { myQuoted = {}; }).then(function () {
    // Scoped board queries (privacy hardening, 2026-10-16): the database
    // rules only let a vendor read broadcast jobs or jobs sent to them,
    // so the board asks for exactly those two sets instead of every open
    // work order. A missing broadcast flag now means private.
    var boardSeen = {}, boardDocs = [];
    function boardCollect(qs) {
      qs.forEach(function (d) {
        if (boardSeen[d.id]) return;
        boardSeen[d.id] = 1;
        var w = d.data(); w.id = d.id;
        if (w.status !== "open") return;
        boardDocs.push(w);
      });
    }
    Promise.all([
      db.collection("work_orders").where("broadcast", "==", true).get().then(boardCollect).catch(function () {}),
      db.collection("work_orders").where("vendorNotifyTarget", "==", me.uid).get().then(boardCollect).catch(function () {})
    ]).then(function () {
      var jobs = [], qrs = [];
      boardDocs.forEach(function (w) {
        if (!woVisibleToMe(w)) return; // not sent to me and not posted as available work
        if (w.kind === "quote_request") qrs.push(w); else jobs.push(w);
      });
      openQRs = qrs;
      renderList($("list-qr"), qrs, "quote_request");
      renderList($("list-jobs"), jobs, "job");
      $("cnt-qr").textContent = qrs.length + (qrs.length === 1 ? " NUEVA" : " NUEVAS");
      setDrawerBadge("vd-nav-badge-avail", qrs.length);
      $("cnt-jobs").textContent = jobs.length + " DISPONIBLES";
      $("st-open").textContent = jobs.length + qrs.length;
      buildQuoteSelect();
    });
    db.collection("work_orders").where("vendorId", "==", me.uid).get().then(function (qs) {
      var active = [], done = [], earned = 0, pending = 0, pendingN = 0;
      myEvals = [];
      qs.forEach(function (d) {
        var w = d.data(); w.id = d.id;
        if (w.status === "open") return; // not accepted yet - shows in the open lists above
        if (w.status === "done") {
          done.push(w);
          earned += parseFloat(w.payAgreed || w.pay || 0) || 0;
        } else {
          active.push(w);
          if (w.status === "review") { pending += parseFloat(w.payAgreed || w.pay || 0) || 0; pendingN++; }
          if (w.kind === "quote_request" && w.status === "evaluation_accepted") myEvals.push(w);
        }
      });
      // Este mes (money strip): pay from jobs I completed — status
      // "review" (I marked it complete) or "done" (office closed it) —
      // whose completedAt falls in the current calendar month. Jobs
      // without a parseable completedAt are excluded here only; jobs
      // without pay count as 0, exactly like the totals below.
      var nowD = new Date(), mSum = 0, mCount = 0;
      active.concat(done).forEach(function (w) {
        if (w.status !== "review" && w.status !== "done") return;
        var cd = parseDate(w.completedAt);
        if (cd && cd.getFullYear() === nowD.getFullYear() && cd.getMonth() === nowD.getMonth()) {
          mSum += parseFloat(w.payAgreed || w.pay || 0) || 0;
          mCount++;
        }
      });
      var mEl = $("st-month"); if (mEl) mEl.textContent = "$" + mSum.toLocaleString();
      var mnEl = $("st-month-n"); if (mnEl) mnEl.textContent = mCount ? mCount + (mCount === 1 ? " trabajo terminado" : " trabajos terminados") : "";
      var heroJob = pickHero(active);
      renderHero(heroJob);
      renderActive(active, heroJob ? heroJob.id : null);
      renderDone(done);
      buildVendorCalEvents(active, done);
      renderVendorCal();
      renderCalConnect();
      writeCalFeedSnapshot();
      $("st-done").textContent = done.length;
      $("st-earned").textContent = "$" + earned.toLocaleString();
      $("st-pending").textContent = "$" + pending.toLocaleString();
      $("st-pending-n").textContent = pendingN ? pendingN + " trabajo(s) esperando confirmación" : "Nada esperando confirmación";
      $("cnt-active").textContent = active.length + " EN CURSO";
      setDrawerBadge("vd-nav-badge-active", active.length);
      $("cnt-done").textContent = done.length + " TRABAJOS";
      buildQuoteSelect();
    });
    });
  }


  /* ---------- Calendario (portal calendars, Edwin's directive 2026-10-16) ---------- */
  var PG_FEED_BASE = "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec";
  var vcalCursor = null;
  var vcalSelected = "";
  var vcalMap = {};
  function vcalPad(n) { return (n < 10 ? "0" : "") + n; }
  function vcalKey(d) { return d.getFullYear() + "-" + vcalPad(d.getMonth() + 1) + "-" + vcalPad(d.getDate()); }
  function vcalTime(w) {
    for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
      var dd = parseDate(w[WO_DATE_FIELDS[i]]);
      if (dd && (dd.getHours() || dd.getMinutes())) return dd.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
    }
    return "";
  }
  function buildVendorCalEvents(active, done) {
    vcalMap = {};
    function pushEv(w, d) {
      var k = vcalKey(d);
      if (!vcalMap[k]) vcalMap[k] = [];
      vcalMap[k].push({ w: w, date: new Date(d) });
    }
    (active || []).concat(done || []).forEach(function (w) {
      var anchor = w.planAnchor ? parseDate(w.planAnchor) : null;
      var count = parseInt(w.visitCount, 10) || 0;
      if (anchor && count > 1) {
        var step = w.cadence === "weekly" ? 7 : 14;
        var t = parseDate(w.scheduledFor);
        for (var i = 0; i < count; i++) {
          var d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i * step);
          if (t && (t.getHours() || t.getMinutes())) d.setHours(t.getHours(), t.getMinutes(), 0, 0);
          pushEv(w, d);
        }
      } else {
        var placed = false;
        for (var j = 0; j < WO_DATE_FIELDS.length; j++) {
          var dd = parseDate(w[WO_DATE_FIELDS[j]]);
          if (dd) { pushEv(w, dd); placed = true; break; }
        }
        if (!placed) { var cd = parseDate(w.createdAt); if (cd) pushEv(w, cd); }
      }
    });
    var cnt = $("cnt-cal");
    if (cnt) { var n = Object.keys(vcalMap).length; cnt.textContent = n ? n + (n === 1 ? " DÍA" : " DÍAS") : ""; }
  }
  function renderVendorCal() {
    var grid = $("vcal-grid"); if (!grid) return;
    if (!vcalCursor) { var now = new Date(); vcalCursor = new Date(now.getFullYear(), now.getMonth(), 1); }
    var y = vcalCursor.getFullYear(), m = vcalCursor.getMonth();
    var titleEl = $("vcal-title");
    if (titleEl) titleEl.textContent = vcalCursor.toLocaleDateString("es", { month: "long", year: "numeric" });
    var firstDow = new Date(y, m, 1).getDay();
    var dim = new Date(y, m + 1, 0).getDate();
    var todayK = vcalKey(new Date());
    if (!vcalSelected) vcalSelected = todayK;
    var html = "";
    for (var b = 0; b < firstDow; b++) html += '<div class="vcal-cell empty"></div>';
    for (var day = 1; day <= dim; day++) {
      var k = vcalKey(new Date(y, m, day));
      var evs = vcalMap[k] || [];
      var dots = "";
      for (var i = 0; i < Math.min(evs.length, 3); i++) dots += '<span class="vcal-dot"></span>';
      html += '<button type="button" class="vcal-cell' + (k === todayK ? " today" : "") + (k === vcalSelected ? " sel" : "") + '" data-vcal-day="' + k + '"><span>' + day + '</span><span class="vcal-dots">' + dots + "</span></button>";
    }
    grid.innerHTML = html;
    renderVendorCalDay();
  }
  function renderVendorCalDay() {
    var box = $("vcal-day"); if (!box) return;
    var evs = (vcalMap[vcalSelected] || []).slice().sort(function (a, b) { return a.date - b.date; });
    var dObj = parseDate(vcalSelected + "T12:00:00");
    var head = dObj ? dObj.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) : vcalSelected;
    if (!evs.length) {
      box.innerHTML = '<div class="vcal-dayh">' + esc(head) + '</div><p class="vcal-none">Sin trabajos este día.</p>';
      return;
    }
    box.innerHTML = '<div class="vcal-dayh">' + esc(head) + "</div>" + evs.map(function (ev) {
      var w = ev.w;
      var meta = [vcalTime(w), w.address || w.area || "", statusLabelEs(w)].filter(Boolean).join(" · ");
      return '<div class="vcal-ev"><div class="vcal-ev-tx"><strong>' + esc(w.title || w.category || "Trabajo") + "</strong>" +
        (meta ? "<small>" + esc(meta) + "</small>" : "") + "</div>" +
        '<a class="btn btn-ghost vcal-ev-btn" href="#sec-mistrabajos">Ver trabajo</a></div>';
    }).join("");
  }
  function vcalNewToken() {
    var s = "", chars = "abcdef0123456789";
    for (var i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function vcalIcsText() {
    function escT(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function z(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrimeGuard//Vendor Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PrimeGuard Trabajos"];
    var stamp = z(new Date());
    Object.keys(vcalMap).forEach(function (k) {
      vcalMap[k].forEach(function (ev, idx) {
        var w = ev.w;
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + w.id + "-" + k + "-" + idx + "@primeguardmia.com");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART:" + z(ev.date));
        lines.push("DTEND:" + z(new Date(ev.date.getTime() + 90 * 60000)));
        lines.push("SUMMARY:" + escT(w.title || w.category || "Trabajo PrimeGuard"));
        var loc = w.address || w.area || "";
        if (loc) lines.push("LOCATION:" + escT(loc));
        lines.push("DESCRIPTION:" + escT("Trabajo de PrimeGuard. Estado: " + statusLabelEs(w)));
        lines.push("END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function writeCalFeedSnapshot() {
    if (!me || !vendor || !vendor.calendarToken) return;
    try {
      db.collection("calendar_feeds").doc(vendor.calendarToken).set({
        kind: "vendor", ownerUid: me.uid, ics: vcalIcsText(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }
  function renderCalConnect() {
    var inp = $("vcal-link"); if (!inp || !me || !vendor) return;
    var err = $("vcal-err");
    function showLink() { inp.value = PG_FEED_BASE + "?feed=vendor&id=" + encodeURIComponent(me.uid) + "&t=" + encodeURIComponent(vendor.calendarToken || ""); }
    if (vendor.calendarToken) { showLink(); return; }
    var tok = vcalNewToken();
    db.collection("vendors").doc(me.uid).update({ calendarToken: tok }).then(function () {
      vendor.calendarToken = tok; showLink(); writeCalFeedSnapshot();
    }).catch(function () {
      if (err) { err.textContent = "No se pudo crear tu enlace. Revisa tu conexión e inténtalo de nuevo."; err.classList.remove("hidden"); }
    });
  }
  (function bindVcal() {
    var prev = $("vcal-prev"), next = $("vcal-next"), grid = $("vcal-grid");
    if (prev) prev.addEventListener("click", function () { if (!vcalCursor) vcalCursor = new Date(); vcalCursor = new Date(vcalCursor.getFullYear(), vcalCursor.getMonth() - 1, 1); renderVendorCal(); });
    if (next) next.addEventListener("click", function () { if (!vcalCursor) vcalCursor = new Date(); vcalCursor = new Date(vcalCursor.getFullYear(), vcalCursor.getMonth() + 1, 1); renderVendorCal(); });
    if (grid) grid.addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("[data-vcal-day]") : null; if (!b) return; vcalSelected = b.getAttribute("data-vcal-day"); renderVendorCal(); });
    var copy = $("vcal-copy");
    if (copy) copy.addEventListener("click", function () {
      var inp = $("vcal-link"); if (!inp || !inp.value) return;
      inp.select();
      function done() { copy.textContent = "\u00a1Copiado!"; setTimeout(function () { copy.textContent = "Copiar enlace"; }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done).catch(function () { try { document.execCommand("copy"); } catch (e) {} done(); });
      else { try { document.execCommand("copy"); } catch (e) {} done(); }
    });
    var regen = $("vcal-regen");
    if (regen) regen.addEventListener("click", function () {
      if (!me) return;
      var tok = vcalNewToken();
      var oldTok = vendor.calendarToken;
      db.collection("vendors").doc(me.uid).update({ calendarToken: tok }).then(function () {
        vendor.calendarToken = tok; renderCalConnect(); writeCalFeedSnapshot();
        if (oldTok && oldTok !== tok) { try { db.collection("calendar_feeds").doc(oldTok).delete().catch(function () {}); } catch (e) {} }
      }).catch(function () { var err = $("vcal-err"); if (err) { err.textContent = "No se pudo generar el enlace nuevo."; err.classList.remove("hidden"); } });
    });
  })();

  function photoThumbs(w) {
    var ph = w.photos || [];
    if (!ph.length) return "";
    return '<div class="vthumbs">' + ph.slice(0, 3).map(function (u) {
      return '<img src="' + esc(u) + '" alt="job photo" loading="lazy">';
    }).join("") + "</div>";
  }

  function videoLinks(w) {
    var vids = [];
    if (Array.isArray(w.videos)) vids = vids.concat(w.videos);
    if (w.videoLink) vids.push(w.videoLink);
    vids = vids.filter(function (u, i) {
      return typeof u === "string" && /^https?:\/\//i.test(u) && vids.indexOf(u) === i;
    });
    if (!vids.length) return "";
    return '<div class="vvids">' + vids.map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">▶ Watch video</a>';
    }).join("") + "</div>";
  }

  function renderList(box, arr, kind) {
    if (!arr.length) { box.innerHTML = '<div class="vempty">Nada por aquí ahora. Los trabajos nuevos aparecen aquí automáticamente.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      // Same actions the portal has always had (data-* hooks unchanged):
      // quote requests -> accept evaluation / give a quote; direct jobs
      // -> accept job. Labels are Spanish-first in the My Day skin.
      var btn = kind === "quote_request"
        ? '<button class="btn btn-gold" data-accept-eval="' + w.id + '">Aceptar evaluación</button>' +
          (myQuoted[w.id] ? "" : '<button class="btn btn-gold" data-give-quote="' + w.id + '">Dar mi precio</button>')
        : '<button class="btn btn-gold" data-accept-job="' + w.id + '">Aceptar trabajo</button>';
      var pay = fmtPay(w);
      var payHtml = pay
        ? '<div class="vd-payline"><small>Paga</small><strong>' + esc(pay) + "</strong></div>"
        : '<div class="vd-payline"><span class="vd-tqp">Tú pones el precio</span></div>';
      return '<div class="vjob"><div class="t">' + esc(w.category || w.kind) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" +
        photoThumbs(w) + videoLinks(w) +
        '<div class="meta"><strong>' + esc(w.area || "") + "</strong></div>" +
        payHtml + btn + "</div>";
    }).join("");
  }

  function renderActive(arr, heroId) {
    var box = $("list-active");
    if (!arr.length) { box.innerHTML = '<div class="vempty">Sin trabajo activo. Acepta un trabajo arriba para empezar.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      var steps;
      if (w.kind === "quote_request") {
        steps = step(w.status !== "open", "Visita de evaluación aceptada") +
                step(w.quoteSubmitted, "Precio enviado");
      } else {
        steps = step(true, "Orden de trabajo recibida") +
                step((w.beforePhotos || []).length > 0, "Fotos de antes subidas") +
                step(false, "Trabajo terminado") +
                step(w.status === "review" || w.status === "done", "Fotos de después subidas — se libera el pago");
      }
      return '<div class="vjob"><div class="t">' + esc(w.status.replace(/_/g, " ").toUpperCase()) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" + photoThumbs(w) + videoLinks(w) +
        '<ul class="vsteps">' + steps + "</ul>" +
        (w.kind !== "quote_request" ? checklistHtml(w) : "") +
        '<button class="btn btn-gold" data-upload="' + w.id + '">Subir fotos</button>' +
        (w.kind !== "quote_request" ? '<button class="btn btn-ghost" data-complete="' + w.id + '">Marcar terminado</button>' : "") +
        (w.kind === "quote_request" && !w.quoteSubmitted ? '<button class="btn btn-gold" data-give-quote="' + w.id + '">Dar mi precio</button>' : "") +
        // The hero card carries this job's one file input; skip the
        // duplicate here so #up-{id} exists exactly once per job.
        (w.id === heroId ? "" : '<input type="file" accept="image/*" multiple class="hidden" id="up-' + w.id + '">') +
        "</div>";
    }).join("");
  }

  function step(done, label) {
    return '<li class="' + (done ? "sdone" : "stodo") + '"><span class="vdot">' + (done ? "✓" : "·") + "</span>" + esc(label) + "</li>";
  }

  function renderDone(arr) {
    var box = $("list-done");
    if (!arr.length) { box.innerHTML = '<div class="vempty">Todavía no terminas trabajos.</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      return '<div class="vhrow"><div class="info"><strong>' + esc(w.title) + '</strong><span>' + esc(w.area || "") + " · " + esc(w.completedAt || "") + "</span></div>" +
        '<div class="vpaid">$' + esc(w.payAgreed || w.pay || "?") + "<small>Pagado por trabajo</small></div></div>";
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
      var cWoId = t.dataset.complete;
      var cRef = db.collection("work_orders").doc(cWoId);
      cRef.get().then(function (snap) {
        return snap.exists ? snap.data() : null;
      }, function () { return null; }).then(function (jw) {
        if (jw && jw.kind !== "quote_request") {
          var cItems = checklistFor(jw), cSt = checklistState(jw);
          var cMissing = cItems.filter(function (_, i) { return !cSt[i]; }).length;
          if (cMissing > 0) { alert("Completa la lista de verificación antes de marcar terminado. Faltan " + cMissing + " paso(s)."); return null; }
        }
        var nowIso = new Date().toISOString();
        var visitEntry = {
          visitDate: nowIso,
          completedAt: nowIso,
          vendorId: me.uid,
          vendorBusiness: (jw && jw.vendorBusiness) || (vendor && vendor.business) || "",
          photos: (sessionPhotosByWo[cWoId] || []).slice(),
          note: ""
        };
        var cupd = {
          status: "review",
          completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          visitLog: firebase.firestore.FieldValue.arrayUnion(visitEntry)
        };
        return cRef.update(cupd);
      }).then(loadAll);
    }
    if (t.dataset.upload) {
      var inp = document.getElementById("up-" + t.dataset.upload);
      if (inp) inp.click();
    }
    if (t.dataset.giveQuote) {
      var qsel = $("q-workorder");
      if (qsel) qsel.value = t.dataset.giveQuote;
      var qform = $("vd-quoteform");
      if (qform) qform.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(function () {
        var qp = $("q-price");
        if (qp) qp.focus({ preventScroll: true });
      }, 500);
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.checklist) {
      var upd = {};
      upd["checklist." + t.dataset.idx] = !!t.checked;
      db.collection("work_orders").doc(t.dataset.checklist).update(upd).then(loadAll, loadAll);
      return;
    }
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
      (sessionPhotosByWo[woId] = sessionPhotosByWo[woId] || []).push.apply(sessionPhotosByWo[woId], out.urls);
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
    var pdfFile = $("q-pdf").files[0] || null;
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = pdfFile ? "Uploading quote..." : "Submitting...";
    function collectAddons() {
      var out = [];
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-row"), function (row) {
        var chk = row.querySelector(".q-addon-check");
        var priceEl = row.querySelector(".q-addon-price");
        if (!chk || !chk.checked) return;
        var p = parseFloat(String(priceEl.value || "").replace(/[^0-9.]/g, ""));
        if (!(p > 0)) return;
        out.push({ label: chk.dataset.label, price: p });
      });
      return out;
    }
    var quoteAddons = collectAddons();
    function saveQuote(pdfUrl) {
      return db.collection("quotes").add({
        workOrderId: woId,
        vendorId: me.uid,
        vendorBusiness: vendor.business,
        vendorPhone: vendor.phone,
        price: $("q-price").value.trim(),
        duration: $("q-duration").value.trim(),
        notes: $("q-notes").value.trim(),
        addons: quoteAddons,
        quotePdfUrl: pdfUrl || null,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    function uploadPdf() {
      if (!pdfFile) return Promise.resolve(null);
      var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
      if (!endpoint) return Promise.resolve(null);
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () {
          fetch(endpoint, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ type: "doc-upload", folder: "vendor-quotes", name: pdfFile.name, mime: pdfFile.type, data: fr.result })
          }).then(function () { res("uploaded"); }).catch(function () { res(null); });
        };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(pdfFile);
      });
    }
    uploadPdf().then(saveQuote).then(function () {
      return db.collection("work_orders").doc(woId).update({ quoteSubmitted: true, vendorAddons: quoteAddons });
    }).then(function () {
      okEl.classList.remove("hidden");
      $("q-price").value = ""; $("q-duration").value = ""; $("q-notes").value = ""; $("q-pdf").value = "";
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-check"), function (c) { c.checked = false; });
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-price"), function (p) { p.value = ""; });
      btn.disabled = false; btn.textContent = "Submit quote";
      loadAll();
    }).catch(function (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); btn.disabled = false; btn.textContent = "Submit quote"; });
  });

  // ---------- Bottom tab bar: scroll-spy (presentation only) ----------
  // The tabs themselves are plain anchors; this only moves the gold
  // "active" state to the tab whose section is on screen.
  (function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".vd-tab"));
    if (!tabs.length) return;
    var map = [
      ["sec-dinero", "#sec-dinero"],
      ["sec-proximo", "#sec-mistrabajos"],
      ["vd-docs-sec", "#sec-disponibles"],
      ["sec-disponibles", "#sec-disponibles"],
      ["sec-jobs", "#sec-disponibles"],
      ["sec-mistrabajos", "#sec-mistrabajos"],
      ["sec-cotizar", "#sec-disponibles"],
      ["sec-done", "#sec-mistrabajos"],
      ["sec-mas", "#sec-mas"]
    ];
    // Drawer links spy on their own sections (same walk, own hrefs);
    // sections without a drawer entry keep the previous drawer state.
    var drawerLinks = Array.prototype.slice.call(document.querySelectorAll(".vd-drawer-link"));
    var drawerMap = [
      ["sec-dinero", "#vd-topbar"],
      ["sec-proximo", "#sec-proximo"],
      ["sec-disponibles", "#sec-disponibles"],
      ["sec-jobs", "#sec-jobs"],
      ["sec-mistrabajos", "#sec-mistrabajos"],
      ["sec-cotizar", "#sec-cotizar"],
      ["sec-done", "#sec-done"],
      ["vd-w9-sec", "#vd-w9-sec"],
      ["vd-agreements", "#vd-agreements"],
      ["vd-avisos", "#vd-avisos"],
      ["vd-perfil", "#vd-perfil"]
    ];
    var ticking = false;
    function update() {
      ticking = false;
      var dash = $("vd-dash");
      if (!dash || dash.classList.contains("hidden")) return;
      var current = "#sec-mistrabajos";
      for (var i = 0; i < map.length; i++) {
        var el = document.getElementById(map[i][0]);
        if (el && el.offsetParent !== null && el.getBoundingClientRect().top <= 160) current = map[i][1];
      }
      tabs.forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("href") === current);
      });
      if (drawerLinks.length) {
        var dCurrent = "#vd-topbar";
        for (var j = 0; j < drawerMap.length; j++) {
          var dEl = document.getElementById(drawerMap[j][0]);
          if (dEl && dEl.offsetParent !== null && dEl.getBoundingClientRect().top <= 160) dCurrent = drawerMap[j][1];
        }
        drawerLinks.forEach(function (t) {
          t.classList.toggle("active", t.getAttribute("href") === dCurrent);
        });
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
  })();
})();

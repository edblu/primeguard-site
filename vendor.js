// PrimeGuard vendor registration (Firebase Auth + Firestore).
(function () {
  // Mobile hamburger menu (runs even if Firebase config is missing)
  (function () {
    var toggle = document.getElementById("navToggle"), nav = document.getElementById("mainNav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var isOpen = nav.classList.toggle("open");
        toggle.classList.toggle("open", isOpen);
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      nav.querySelectorAll("a").forEach(function (l) {
        l.addEventListener("click", function () { nav.classList.remove("open"); toggle.classList.remove("open"); });
      });
    }
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
          w9: v.w9Url ? "uploaded" : "pending",
          timestamp: new Date().toISOString(), source: "vendor-register"
        })
      }).catch(function () {});
    } catch (e) {}
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = document.getElementById("vr-error");
    errEl.classList.add("hidden");
    var btn = document.getElementById("vr-submit");
    btn.disabled = true;
    btn.textContent = "Creating account...";

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
    var insured = document.getElementById("vr-insured").value;
    var w9Choice = document.querySelector('input[name="vr-w9-choice"]:checked');
    var w9Later = w9Choice && w9Choice.value === "later";
    var w9File = (!w9Later && document.getElementById("vr-w9").files[0]) || null;
    var coiFile = document.getElementById("vr-coi").files[0] || null;
    var nowMs = Date.now();

    btn.textContent = "Uploading documents...";
    var w9Url = null, coiUrl = null;
    uploadDoc(w9File, "vendor-w9").then(function (u) { w9Url = u; return uploadDoc(coiFile, "vendor-coi"); })
    .then(function (u) {
      coiUrl = u;
      btn.textContent = "Creating account...";
      return auth.createUserWithEmailAndPassword(email, pw);
    }).then(function (cred) {
      var v = {
        business: business,
        name: name,
        email: email,
        phone: phone,
        address: address,
        services: services,
        areas: areas,
        crewSize: crewSize,
        equipment: equipment,
        insured: insured,
        w9Url: w9Url, w9Status: w9Url ? "received" : "pending",
        w9Due: w9Url ? null : new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
        coiUrl: coiUrl, coiStatus: coiUrl ? "received" : "pending",
        agreedToTerms: true,
        verified: false,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return db.collection("vendors").doc(cred.user.uid).set(v).then(function () { return v; });
    }).then(function (v) {
      notifyEdwin(v); // Edwin gets an inbox alert; vendor welcome email sends from the backend when installed
      window.location.href = "vendor-dashboard.html";
    }).catch(function (err) {
      errEl.textContent = err.message || "Something went wrong. Please try again.";
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Create vendor account";
    });
  });
})();

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

  function checkedValues(containerId) {
    var out = [];
    document.querySelectorAll("#" + containerId + " input[type=checkbox]:checked").forEach(function (el) {
      out.push(el.value);
    });
    return out;
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

    auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
      return db.collection("vendors").doc(cred.user.uid).set({
        business: business,
        name: name,
        email: email,
        phone: phone,
        services: services,
        areas: areas,
        crewSize: crewSize,
        equipment: equipment,
        verified: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      window.location.href = "vendor-dashboard.html";
    }).catch(function (err) {
      errEl.textContent = err.message || "Something went wrong. Please try again.";
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Create vendor account";
    });
  });
})();

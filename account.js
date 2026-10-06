// PrimeGuard customer account logic (Firebase Auth + Firestore).
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  var configured = !!cfg && cfg.apiKey;

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  if (!configured) {
    show($("account-coming-soon"));
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var authForms = $("auth-forms"), dashboard = $("account-dashboard");

  // Tabs
  $("tab-login").addEventListener("click", function () {
    $("tab-login").classList.add("active"); $("tab-signup").classList.remove("active");
    show($("form-login")); hide($("form-signup"));
  });
  $("tab-signup").addEventListener("click", function () {
    $("tab-signup").classList.add("active"); $("tab-login").classList.remove("active");
    show($("form-signup")); hide($("form-login"));
  });

  function authError(err, elId) {
    var el = $(elId); el.textContent = err.message || "Something went wrong. Please try again.";
    show(el);
  }

  // Email/password login
  $("form-login").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("login-error"));
    auth.signInWithEmailAndPassword($("login-email").value.trim(), $("login-password").value)
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

  // Google sign-in (shared)
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
    }).catch(function (err) { authError(err, "login-error"); show($("form-login")); hide($("form-signup")); });
  }
  $("google-login").addEventListener("click", googleSignIn);
  $("google-signup").addEventListener("click", googleSignIn);

  // Logout
  $("logout-btn").addEventListener("click", function () { auth.signOut(); });

  // Profile save
  $("profile-form").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("profile-error")); hide($("profile-ok"));
    var user = auth.currentUser; if (!user) return;
    db.collection("customers").doc(user.uid).update({
      name: $("profile-name").value.trim(),
      phone: $("profile-phone").value.trim(),
      address: $("profile-address").value.trim()
    }).then(function () { show($("profile-ok")); })
      .catch(function (err) { authError(err, "profile-error"); });
  });

  // Auth state
  auth.onAuthStateChanged(function (user) {
    if (user) {
      hide(authForms); show(dashboard);
      var ref = db.collection("customers").doc(user.uid);
      ref.get().then(function (snap) {
        var d = snap.exists ? snap.data() : {};
        var name = d.name || user.displayName || "there";
        $("dashboard-greeting").textContent = "Hello, " + name.split(" ")[0];
        $("profile-name").value = d.name || user.displayName || "";
        $("profile-phone").value = d.phone || "";
        $("profile-address").value = d.address || "";
      });
      loadRequests(user.uid); loadJobs(user.uid);
    } else {
      show(authForms); hide(dashboard);
    }
  });

  function loadRequests(uid) {
    db.collection("service_requests").where("uid", "==", uid).orderBy("createdAt", "desc").limit(10).get()
      .then(function (qs) {
        var box = $("requests-list");
        if (qs.empty) return;
        box.innerHTML = "";
        qs.forEach(function (doc) {
          var d = doc.data();
          var div = document.createElement("div"); div.className = "request-row";
          div.innerHTML = "<strong></strong><span class='muted'></span><span class='status-pill'></span>";
          div.children[0].textContent = d.service || "Service request";
          div.children[1].textContent = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString() : "";
          div.children[2].textContent = d.status || "received";
          box.appendChild(div);
        });
      }).catch(function () { /* collection may not exist yet */ });
  }

  function loadJobs(uid) {
    db.collection("jobs").where("uid", "==", uid).orderBy("scheduledAt", "desc").limit(10).get()
      .then(function (qs) {
        var box = $("jobs-list");
        if (qs.empty) return;
        box.innerHTML = "";
        qs.forEach(function (doc) {
          var d = doc.data();
          var div = document.createElement("div"); div.className = "request-row";
          div.innerHTML = "<strong></strong><span class='muted'></span><span class='status-pill'></span>";
          div.children[0].textContent = d.service || "Job";
          div.children[1].textContent = d.scheduledAt && d.scheduledAt.toDate ? d.scheduledAt.toDate().toLocaleDateString() : "";
          div.children[2].textContent = d.status || "scheduled";
          box.appendChild(div);
        });
      }).catch(function () { /* collection may not exist yet */ });
  }
})();

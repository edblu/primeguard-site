/* PrimeGuard dedicated quote page: guided 3-step instant quote.
   Reads ?service=<key> to preselect. Posts type:"quote-request" to the
   lead endpoint and mirrors to Firestore service_requests for the admin. */
(function () {
  "use strict";

  var QUOTE_SVCS = {
    "lawn-care": { name: "Lawn Care", img: "assets/service-lawn-care.webp", from: 45, unit: "per visit",
      q1: { label: "How big is the yard?", opts: ["Small yard", "Medium yard", "Large yard"] }, base: [45, 65, 90],
      q2: { label: "How often?", opts: [["One-time", 1], ["Monthly", 0.95], ["Biweekly", 0.9], ["Weekly", 0.85]] },
      q3: { label: "Property type?", opts: ["Single-family home", "Townhouse", "Commercial property"] } },
    "pressure-washing": { name: "Pressure Washing", img: "assets/service-pressure-washing.webp", from: 169, unit: "per visit",
      q1: { label: "How big is the area?", opts: ["Small area", "Medium area", "Large area"] }, base: [169, 219, 289],
      q2: { label: "What are we washing?", opts: [["Driveway only", 1], ["House exterior", 1.25], ["Driveway + house", 1.6], ["Whole property", 2]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] } },
    "junk-removal": { name: "Debris & Junk Removal", img: "assets/service-junk-removal.webp", from: 89, unit: "per load",
      q1: { label: "How much junk?", opts: ["A few items", "Quarter truck", "Half truck or more"] }, base: [89, 149, 239],
      q2: { label: "What kind of junk?", opts: [["Household items", 1], ["Yard debris", 0.9], ["Furniture", 1.15], ["Construction debris", 1.3]] },
      q3: { label: "Where is the junk?", opts: ["Curbside or driveway", "Inside the home", "Backyard"] } },
    "make-ready-cleaning": { name: "Make-Ready Cleaning", img: "assets/service-make-ready.webp", from: 179, unit: "per clean",
      q1: { label: "How big is the home?", opts: ["Studio / 1 bed", "2-3 bed", "4+ bed"] }, base: [179, 249, 339],
      q2: { label: "Cleaning depth?", opts: [["Standard clean", 1], ["Deep clean", 1.3], ["Turnover package", 1.55]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] } },
    "handyman": { name: "Handyman Services", img: "assets/service-handyman.webp", from: 65, unit: "per visit",
      q1: { label: "How big is the job?", opts: ["Small fix", "A few items", "Full punch list"] }, base: [65, 140, 280],
      q2: { label: "Roughly how long?", opts: [["Under an hour", 1], ["Half day", 1.8], ["Full day", 3]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] } }
  };
  var ORDER = ["lawn-care", "pressure-washing", "junk-removal", "make-ready-cleaning", "handyman"];

  var svcKey = null, q1i = 1, q2i = 0, q3i = 2, shownPrice = 0, answered = false;

  var cfg = (window.SITE_CONFIG || {});
  var leadEndpoint = cfg.leadEndpoint || "";
  var fbDb = null, currentUser = null;
  try {
    if (cfg.firebase && typeof firebase !== "undefined") {
      if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(cfg.firebase);
      fbDb = firebase.firestore();
      firebase.auth().onAuthStateChanged(function (u) { currentUser = u || null; });
    }
  } catch (e) { fbDb = null; }

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  function price() {
    if (!svcKey) return 0;
    var c = QUOTE_SVCS[svcKey];
    return Math.max(25, Math.round(c.base[q1i] * c.q2.opts[q2i][1] / 5) * 5);
  }

  function animatePrice(to) {
    var pEl = $("quotePrice"), from = shownPrice, start = null;
    function tick(ts) {
      if (!start) start = ts;
      var k = Math.min(1, (ts - start) / 350);
      pEl.textContent = "$" + Math.round(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(tick); else shownPrice = to;
    }
    requestAnimationFrame(tick);
  }

  function renderEstimate() {
    var lines = $("quoteLines");
    lines.innerHTML = "";
    if (!svcKey) {
      animatePrice(0); $("quotePrice").textContent = "$-";
      $("quoteUnit").textContent = "Pick a service to start";
      return;
    }
    var c = QUOTE_SVCS[svcKey];
    if (!answered) {
      animatePrice(c.from);
      $("quotePrice").textContent = "$" + c.from;
      shownPrice = c.from;
      $("quoteUnit").textContent = "starting at · ballpark";
      [[ "Service", c.name ]].forEach(function (row) {
        var d = el("div"), a = el("span", null, row[0]), b = el("b", null, row[1]);
        d.appendChild(a); d.appendChild(b); lines.appendChild(d);
      });
      return;
    }
    animatePrice(price());
    $("quoteUnit").textContent = c.unit + " · ballpark";
    [[ "Service", c.name ],
     [ c.q1.label, c.q1.opts[q1i] ],
     [ c.q2.label, c.q2.opts[q2i][0] ],
     [ c.q3.label, c.q3.opts[q3i] ]].forEach(function (row) {
      var d = el("div"), a = el("span", null, row[0]), b = el("b", null, row[1]);
      d.appendChild(a); d.appendChild(b); lines.appendChild(d);
    });
  }

  function goStep(n) {
    [1, 2, 3].forEach(function (i) { $("qstep" + i).hidden = i !== n; });
    $("qstepDone").hidden = true;
    document.querySelectorAll("#quoteSteps li").forEach(function (li) {
      var s = parseInt(li.getAttribute("data-goto"), 10);
      li.classList.toggle("active", s === n);
      li.classList.toggle("done", s < n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Step 1: service cards ---------- */
  var grid = $("qsvcGrid");
  ORDER.forEach(function (key) {
    var c = QUOTE_SVCS[key];
    var b = el("button", "qsvc");
    b.setAttribute("type", "button");
    b.setAttribute("data-svc", key);
    var img = el("img"); img.src = c.img; img.alt = c.name; img.loading = "lazy";
    var bd = el("div", "qsvc-body");
    bd.appendChild(el("strong", null, c.name));
    bd.appendChild(el("em", null, "from $" + c.from));
    b.appendChild(img); b.appendChild(bd);
    b.addEventListener("click", function () { selectService(key, false); });
    grid.appendChild(b);
  });

  function selectService(key, advance) {
    svcKey = key; q1i = 1; q2i = 0; q3i = 2; answered = false;
    grid.querySelectorAll(".qsvc").forEach(function (x) {
      x.classList.toggle("sel", x.getAttribute("data-svc") === key);
    });
    renderQuestions();
    renderEstimate();
    var nx = document.getElementById("qstep1Next");
    if (nx) nx.disabled = false;
    if (advance) goStep(2);
  }

  document.getElementById("qstep1Next").addEventListener("click", function () {
    if (svcKey) goStep(2);
  });

  /* ---------- Step 2: questions ---------- */
  function pillRow(opts, activeIdx, onPick, isPair) {
    var row = el("div", "qopts");
    opts.forEach(function (o, i) {
      var label = isPair ? o[0] : o;
      var b = el("button", "qopt" + (i === activeIdx ? " active" : ""), label);
      b.setAttribute("type", "button");
      b.addEventListener("click", function () {
        row.querySelectorAll(".qopt").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        onPick(i);
      });
      row.appendChild(b);
    });
    return row;
  }

  function renderQuestions() {
    var c = QUOTE_SVCS[svcKey], wrap = $("qQuestions");
    wrap.innerHTML = "";
    var q1 = el("div", "qq");
    q1.appendChild(el("p", null, c.q1.label));
    q1.appendChild(pillRow(c.q1.opts, q1i, function (i) { q1i = i; answered = true; renderEstimate(); }, false));
    var q2 = el("div", "qq");
    q2.appendChild(el("p", null, c.q2.label));
    q2.appendChild(pillRow(c.q2.opts, q2i, function (i) { q2i = i; answered = true; renderEstimate(); }, true));
    var q3 = el("div", "qq");
    q3.appendChild(el("p", null, c.q3.label));
    var sel = el("select", "qselect");
    c.q3.opts.forEach(function (o, i) {
      var op = el("option", null, o);
      op.value = o; if (i === q3i) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener("change", function () { q3i = sel.selectedIndex; answered = true; renderEstimate(); });
    q3.appendChild(sel);
    wrap.appendChild(q1); wrap.appendChild(q2); wrap.appendChild(q3);
  }

  document.querySelectorAll("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () { goStep(parseInt(b.getAttribute("data-next"), 10)); });
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () { goStep(parseInt(b.getAttribute("data-back"), 10)); });
  });
  document.querySelectorAll("#quoteSteps li").forEach(function (li) {
    li.addEventListener("click", function () {
      var n = parseInt(li.getAttribute("data-goto"), 10);
      if (n === 1 || (n === 2 && svcKey)) goStep(n);
    });
  });

  /* ---------- Step 3: submit ---------- */
  $("quoteForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, err = $("quoteErr");
    var name = f.name.value.trim(), phone = f.phone.value.trim(), address = f.address.value.trim();
    if (!svcKey) { err.textContent = "Pick a service first."; err.hidden = false; goStep(1); return; }
    if (!name || !phone || !address) {
      err.textContent = "Please add your name, phone, and service address.";
      err.hidden = false; return;
    }
    err.hidden = true;
    var btn = $("quoteSubmit");
    btn.disabled = true; btn.textContent = "Sending...";
    var c = QUOTE_SVCS[svcKey], p = price();
    var ref = "PQ-" + Date.now().toString(36).toUpperCase().slice(-6);
    var detail = c.q1.label + " " + c.q1.opts[q1i] + "; " +
      c.q2.label + " " + c.q2.opts[q2i][0] + "; " + c.q3.label + " " + c.q3.opts[q3i];
    var payload = {
      type: "quote-request", status: "new", ref: ref,
      service: c.name, estimate: p, unit: c.unit, details: detail,
      name: name, phone: phone, email: f.email.value.trim(),
      address: address, date: f.date.value, referrer: f.referrer.value.trim(),
      notes: f.notes.value.trim(),
      message: "Instant estimate: $" + p + " " + c.unit + " (" + c.name + " - " + detail + ")." +
        (f.notes.value.trim() ? " Notes: " + f.notes.value.trim() : ""),
      source: "quote-page", page: location.pathname,
      uid: currentUser ? currentUser.uid : null
    };
    if (fbDb) {
      fbDb.collection("service_requests").add({
        uid: currentUser ? currentUser.uid : null,
        name: name, phone: phone, email: payload.email,
        service: "Quote request " + ref + " - " + c.name,
        message: payload.message, status: "new",
        source: "quote-page", ref: ref, estimate: p,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    }
    var done = function () {
      $("qdoneRef").textContent = ref;
      $("qdonePrice").textContent = "$" + p + " " + c.unit;
      goStep(1); $("qstep1").hidden = true; $("qstepDone").hidden = false;
      document.querySelectorAll("#quoteSteps li").forEach(function (li) { li.classList.add("done"); li.classList.remove("active"); });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (leadEndpoint) {
      fetch(leadEndpoint, { method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload) }).then(done).catch(done);
    } else { done(); }
  });

  /* ---------- Preselect from ?service= ---------- */
  try {
    var pre = new URLSearchParams(location.search).get("service");
    if (pre && QUOTE_SVCS[pre]) selectService(pre, true);
  } catch (e) {}
})();

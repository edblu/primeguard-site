/* PrimeGuard dedicated quote page: guided 3-step instant quote.
   Reads ?service=<key> to preselect. Posts type:"quote-request" to the
   lead endpoint and mirrors to Firestore service_requests for the admin. */
(function () {
  "use strict";
  try { var _rp = new URLSearchParams(location.search).get("ref"); if (_rp) localStorage.setItem("pgRef", _rp); } catch (e) {}

  var QUOTE_SVCS = {
    "lawn-care": { name: "Lawn Care", img: "assets/qcard-lawn-care.jpg", from: 45, unit: "per visit",
      q1: { label: "How big is the yard?", opts: ["Small yard", "Medium yard", "Large yard"] }, base: [45, 65, 90],
      q2: { label: "How often?", opts: [["One-time", 1], ["Monthly", 0.95], ["Biweekly", 0.9], ["Weekly", 0.85]] },
      q3: { label: "Property type?", opts: ["Single-family home", "Townhouse", "Commercial property"] },
      detailPh: "e.g. Front and back yard, two overgrown bushes by the fence, side gate sticks..." },
    "pressure-washing": { name: "Pressure Washing", img: "assets/qcard-pressure-washing.jpg", from: 169, unit: "per visit",
      q1: { label: "How big is the area?", opts: ["Small area", "Medium area", "Large area"] }, base: [169, 219, 289],
      q2: { label: "What are we washing?", opts: [["Driveway only", 1], ["House exterior", 1.25], ["Driveway + house", 1.6], ["Whole property", 2]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] },
      detailPh: "e.g. Driveway has oil stains, green mold on the north wall..." },
    "junk-removal": { name: "Debris & Junk Removal", img: "assets/qcard-junk-removal.jpg", from: 89, unit: "per load",
      q1: { label: "How much junk?", opts: ["A few items", "Quarter truck", "Half truck or more"] }, base: [89, 149, 239],
      q2: { label: "What kind of junk?", opts: [["Household items", 1], ["Yard debris", 0.9], ["Furniture", 1.15], ["Construction debris", 1.3]] },
      q3: { label: "Where is the junk?", opts: ["Curbside or driveway", "Inside the home", "Backyard"] },
      detailPh: "e.g. Old couch, mattress, and boxes stacked in the garage..." },
    "make-ready-cleaning": { name: "Make-Ready Cleaning", img: "assets/qcard-make-ready.jpg", from: 179, unit: "per clean",
      q1: { label: "How big is the home?", opts: ["Studio / 1 bed", "2-3 bed", "4+ bed"] }, base: [179, 249, 339],
      q2: { label: "Cleaning depth?", opts: [["Standard clean", 1], ["Deep clean", 1.3], ["Turnover package", 1.55]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] },
      detailPh: "e.g. 2-bed apartment, turnover clean, need it done before Friday..." },
    "handyman": { name: "Handyman Services", img: "assets/qcard-handyman.jpg", from: 65, unit: "per visit",
      q1: { label: "How big is the job?", opts: ["Small fix", "A few items", "Full punch list"] }, base: [65, 140, 280],
      q2: { label: "What kind of work?", opts: [["Repairs & fixes", 1], ["Installations", 1.15], ["Painting & drywall", 1.25], ["Multiple trades", 1.6]] },
      q3: { label: "When do you need it?", opts: ["As soon as possible", "This week", "I'm flexible"] },
      detailPh: "e.g. Kitchen faucet leaks, two holes in the drywall, install a ceiling fan..." }
  };
  var ORDER = ["lawn-care", "pressure-washing", "junk-removal", "make-ready-cleaning", "handyman"];

  var svcKey = null, svcKeys = [], q1i = 1, q2i = 0, q3i = 2, shownPrice = 0, answered = false;

  /* Instant lawn pricing state (lawn-pricing.js). lawnQuote holds the
     priced result, lawnMeas the raw county measurement when there is one. */
  var lawnMeas = null, lawnQuote = null, lawnBusy = false;

  // Multi-select: svcKeys holds every selected service key in click order.
  // svcKey stays the primary (first selected) service: it alone drives the
  // step-2 questions and the ballpark price. Display/submit order follows
  // the grid (ORDER), not click order.
  function selectedKeys() {
    return ORDER.filter(function (k) { return svcKeys.indexOf(k) !== -1; });
  }
  function selectedNames() {
    return selectedKeys().map(function (k) { return QUOTE_SVCS[k].name; });
  }

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

  function lawnActive() {
    return svcKey === "lawn-care" && !!lawnQuote && typeof window.PGLawn !== "undefined";
  }

  function price() {
    if (!svcKey) return 0;
    if (lawnActive()) return lawnQuote.customerPrice;
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

  var CONFIRM_COPY = "Your price is confirmed once you upload front, back and worst patch photos after ordering. If your yard measures materially different, we adjust the tier before any work starts and you approve the change first. No surprises.";
  var estDefaultNote = null;

  /* Price presentation law: for instant lawn prices the scope shows first
     and the price sits LAST in the card. Other services keep price on top. */
  function setEstOrder(instant) {
    var card = document.querySelector(".quote-est");
    if (!card) return;
    var priceEl = $("quotePrice"), unitEl = $("quoteUnit"), lines = $("quoteLines"), note = $("quoteNote");
    if (note && estDefaultNote === null) estDefaultNote = note.textContent;
    if (instant) {
      card.querySelector(".kicker").textContent = "Your instant price";
      lines.parentNode.insertBefore(priceEl, note);
      lines.parentNode.insertBefore(unitEl, note);
      if (note) note.textContent = CONFIRM_COPY;
    } else {
      card.querySelector(".kicker").textContent = "Your ballpark";
      lines.parentNode.insertBefore(priceEl, lines);
      lines.parentNode.insertBefore(unitEl, lines);
      if (note && estDefaultNote !== null) note.textContent = estDefaultNote;
    }
  }

  function renderEstimate() {
    var lines = $("quoteLines");
    lines.innerHTML = "";
    if (lawnActive()) {
      setEstOrder(true);
      animatePrice(lawnQuote.customerPrice);
      $("quoteUnit").textContent = "per visit · instant price";
      var rows = [];
      if (lawnMeas) {
        rows.push(["Yard size", lawnQuote.tierLabel + " · about " + lawnMeas.lawnSqft.toLocaleString() + " sq ft of lawn"]);
        rows.push(["Lot size", lawnMeas.lotSqft.toLocaleString() + " sq ft (county records)"]);
      } else {
        rows.push(["Yard size", lawnQuote.tierLabel + " · your estimate"]);
      }
      rows.push(["Includes", "Mowing, edging, trimming and blowing"]);
      rows.push(["Proof", "Before and after photos every visit"]);
      if (lawnQuote.overgrown) rows.push(["First visit", "Overgrown reset included"]);
      rows.forEach(function (row) {
        var d = el("div"), a = el("span", null, row[0]), b = el("b", null, row[1]);
        d.appendChild(a); d.appendChild(b); lines.appendChild(d);
      });
      return;
    }
    setEstOrder(false);
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
      [[ "Service", selectedNames().join(", ") ]].forEach(function (row) {
        var d = el("div"), a = el("span", null, row[0]), b = el("b", null, row[1]);
        d.appendChild(a); d.appendChild(b); lines.appendChild(d);
      });
      return;
    }
    animatePrice(price());
    $("quoteUnit").textContent = c.unit + " · ballpark";
    [[ "Service", selectedNames().join(", ") ],
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
    b.addEventListener("click", function () { toggleService(key); });
    grid.appendChild(b);
  });

  function syncSvcCards() {
    grid.querySelectorAll(".qsvc").forEach(function (x) {
      var on = svcKeys.indexOf(x.getAttribute("data-svc")) !== -1;
      x.classList.toggle("sel", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var nx = document.getElementById("qstep1Next");
    if (nx) nx.disabled = !svcKeys.length;
  }

  // Point the step-2 questions at a new primary service (or clear them when
  // nothing is selected). Question answers reset, same as a fresh pick.
  function setPrimary(key) {
    svcKey = key; q1i = 1; q2i = 0; q3i = 2; answered = false;
    lawnMeas = null; lawnQuote = null; pendingOvergrown = false;
    if (svcKey) { renderQuestions(); }
    else { var w = $("qQuestions"); if (w) w.innerHTML = ""; }
  }

  function toggleService(key) {
    var i = svcKeys.indexOf(key);
    if (i !== -1) {
      svcKeys.splice(i, 1);
      if (svcKey === key) setPrimary(svcKeys.length ? svcKeys[0] : null);
    } else {
      svcKeys.push(key);
      if (!svcKey) setPrimary(key);
    }
    syncSvcCards();
    renderEstimate();
  }

  // Preselect path (?service=): make sure the service is selected, treat it
  // as the primary, and optionally jump straight to step 2.
  function selectService(key, advance) {
    if (svcKeys.indexOf(key) === -1) svcKeys.push(key);
    setPrimary(key);
    syncSvcCards();
    renderEstimate();
    if (advance) goStep(2);
  }

  document.getElementById("qstep1Next").addEventListener("click", function () {
    if (svcKeys.length) goStep(2);
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

  /* ---------- Lawn instant pricing (step 2 block) ---------- */
  function applyLawnQuote(quote, meas) {
    lawnQuote = quote; lawnMeas = meas || null;
    answered = true;
    renderEstimate();
  }

  function renderLawnBlock(wrap) {
    var L = window.PGLawn;
    var block = el("div", "qq");
    block.appendChild(el("p", null, "Where is the yard?"));
    var sub = el("p", null, "We measure your lawn from county property records and price it on the spot. Type the service address:");
    sub.style.cssText = "font-size:.88rem;color:var(--muted);margin:0 0 12px;font-weight:400";
    block.appendChild(sub);
    var row = el("div", "qlawn-addr");
    var inp = el("input", "qselect"); inp.id = "qLawnAddress"; inp.type = "text";
    inp.placeholder = "Street address, City, FL ZIP";
    inp.setAttribute("autocomplete", "street-address");
    inp.style.maxWidth = "none";
    var btn = el("button", "btn btn-gold", "Measure my yard"); btn.type = "button"; btn.id = "qLawnBtn";
    row.appendChild(inp); row.appendChild(btn);
    block.appendChild(row);
    var status = el("p", "qlawn-status"); status.id = "qLawnStatus";
    block.appendChild(status);
    var fb = el("div"); fb.id = "qLawnFallback"; fb.hidden = true;
    fb.appendChild(el("p", null, "Or pick the closest size:"));
    var prow = el("div", "qopts");
    L.TIERS.forEach(function (t) {
      var b = el("button", "qopt", t.label); b.type = "button";
      b.title = t.desc;
      b.addEventListener("click", function () {
        prow.querySelectorAll(".qopt").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        status.innerHTML = "";
        status.appendChild(document.createTextNode("Priced from your estimate: "));
        var bb = el("b", null, t.desc + ".");
        status.appendChild(bb);
        applyLawnQuote(L.priceForTier(t.key, pendingOvergrown), null);
      });
      prow.appendChild(b);
    });
    fb.appendChild(prow);
    var fbd = el("p", null, L.TIERS.map(function (t) { return t.label + ": " + t.desc; }).join(" · "));
    fbd.style.cssText = "font-size:.82rem;color:var(--muted);margin-top:10px;font-weight:400";
    fb.appendChild(fbd);
    block.appendChild(fb);
    var og = el("div", "qq");
    og.appendChild(el("p", null, "Is the grass overgrown right now?"));
    var ogRow = el("div", "qopts");
    [["No, it is kept up", false], ["Yes, first visit needs a reset", true]].forEach(function (o, i) {
      var b = el("button", "qopt" + (i === 0 ? " active" : ""), o[0]); b.type = "button";
      b.addEventListener("click", function () {
        ogRow.querySelectorAll(".qopt").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        pendingOvergrown = o[1];
        if (lawnQuote) {
          var q = lawnMeas ? L.priceForLawn(lawnMeas.lawnSqft, o[1]) : L.priceForTier(lawnQuote.tier, o[1]);
          applyLawnQuote(q, lawnMeas);
        }
      });
      ogRow.appendChild(b);
    });
    og.appendChild(ogRow);
    block.appendChild(og);
    wrap.appendChild(block);

    btn.addEventListener("click", function () {
      var addr = inp.value.trim();
      if (!addr || lawnBusy) return;
      lawnBusy = true; btn.disabled = true; btn.textContent = "Measuring...";
      status.textContent = "Checking county property records...";
      L.measure(addr).then(function (meas) {
        lawnBusy = false; btn.disabled = false; btn.textContent = "Measure my yard";
        if (meas) {
          fb.hidden = true;
          status.innerHTML = "";
          status.appendChild(document.createTextNode("Found it: lot of "));
          status.appendChild(el("b", null, meas.lotSqft.toLocaleString() + " sq ft"));
          status.appendChild(document.createTextNode(", about "));
          status.appendChild(el("b", null, meas.lawnSqft.toLocaleString() + " sq ft of lawn"));
          status.appendChild(document.createTextNode(" (" + meas.county + " County records). Your instant price is on the right."));
          applyLawnQuote(L.priceForLawn(meas.lawnSqft, pendingOvergrown), meas);
          var stepAddr = document.querySelector("#quoteForm [name=address]");
          if (stepAddr && !stepAddr.value.trim()) stepAddr.value = addr;
        } else {
          fb.hidden = false;
          status.textContent = "We could not pull that address from county records. No problem: pick the closest yard size below and we price it from your estimate.";
        }
      });
    });
    if (!lawnQuote) fb.hidden = false;
  }
  var pendingOvergrown = false;

  function renderQuestions() {
    var c = QUOTE_SVCS[svcKey], wrap = $("qQuestions");
    wrap.innerHTML = "";
    if (svcKey === "lawn-care" && typeof window.PGLawn !== "undefined") {
      renderLawnBlock(wrap);
      var q2l = el("div", "qq");
      q2l.appendChild(el("p", null, c.q2.label));
      q2l.appendChild(pillRow(c.q2.opts, q2i, function (i) { q2i = i; }, true));
      var q3l = el("div", "qq");
      q3l.appendChild(el("p", null, c.q3.label));
      var sell = el("select", "qselect");
      c.q3.opts.forEach(function (o, i) {
        var op = el("option", null, o);
        op.value = o; if (i === q3i) op.selected = true;
        sell.appendChild(op);
      });
      sell.addEventListener("change", function () { q3i = sell.selectedIndex; });
      q3l.appendChild(sell);
      wrap.appendChild(q2l); wrap.appendChild(q3l);
      var dtl = $("qDetailText");
      if (dtl) dtl.placeholder = "Tell us exactly what you want done: what needs doing, where on the property, anything tricky we should know, and how we get in (gate, dogs, etc.). The more detail, the more accurate your quote." + (c.detailPh ? " " + c.detailPh : "");
      return;
    }
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
    var dt = $("qDetailText");
    if (dt) dt.placeholder = "Tell us exactly what you want done: what needs doing, where on the property, how big the area is, anything tricky we should know, and how we get in (gate, dogs, etc.). The more detail, the more accurate your quote." + (c.detailPh ? " " + c.detailPh : "");
  }

  /* ---------- Step 2: detail text + photos ---------- */
  $("qPhotos").addEventListener("change", function () {
    var prev = $("qPhotoPreview"); prev.innerHTML = "";
    Array.prototype.forEach.call(this.files, function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = document.createElement("img");
        img.src = fr.result; img.alt = "quote photo";
        prev.appendChild(img);
      };
      fr.readAsDataURL(f);
    });
  });

  /* ---------- Step 2: videos (doc-upload pattern, one by one, 25 MB guard) ---------- */
  var VIDEO_MAX_BYTES = 25 * 1024 * 1024;
  function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + " MB"; }
  function showVideoMsg(text) {
    var m = $("qVideoMsg");
    if (!m) return;
    if (text) { m.textContent = text; m.hidden = false; }
    else { m.textContent = ""; m.hidden = true; }
  }
  $("qVideos").addEventListener("change", function () {
    var list = $("qVideoList"); list.innerHTML = "";
    var over = [];
    Array.prototype.forEach.call(this.files, function (f) {
      var d = document.createElement("div");
      if (f.size > VIDEO_MAX_BYTES) {
        over.push(f.name);
        d.textContent = "🎬 " + f.name + " (" + fmtMB(f.size) + ") — too big to attach (25 MB max)";
        d.style.color = "#ff9d9d";
      } else {
        d.textContent = "🎬 " + f.name + " (" + fmtMB(f.size) + ")";
      }
      list.appendChild(d);
    });
    if (over.length) {
      showVideoMsg("That video is over 25 MB, so we can't attach it here. No problem: paste a link to it in the video link field above (Google Photos, iCloud, YouTube) and we'll watch it there.");
    } else { showVideoMsg(""); }
  });

  function uploadOneQuoteVideo(f) {
    var endpoint = cfg.photoEndpoint || "";
    if (!endpoint) return Promise.resolve(null);
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        fetch(endpoint, {
          method: "POST", mode: "cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ type: "doc-upload", folder: "quote-requests", name: f.name, mime: f.type, data: fr.result })
        }).then(function (r) { return r.json(); }).then(function (out) {
          res((out && out.ok && out.urls && out.urls.length) ? out.urls[0] : null);
        }).catch(function () { res(null); });
      };
      fr.onerror = function () { res(null); };
      fr.readAsDataURL(f);
    });
  }

  function uploadQuoteVideos() {
    var files = $("qVideos").files;
    var urls = [], skipped = [];
    if (!files || !files.length) return Promise.resolve({ urls: urls, skipped: skipped });
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (f) {
      if (f.size > VIDEO_MAX_BYTES) { skipped.push(f.name); return; }
      chain = chain.then(function () { return uploadOneQuoteVideo(f); })
        .then(function (u) { if (u) urls.push(u); });
    });
    return chain.then(function () { return { urls: urls, skipped: skipped }; });
  }

  function uploadQuotePhotos() {
    var files = $("qPhotos").files;
    if (!files || !files.length) return Promise.resolve([]);
    var endpoint = cfg.photoEndpoint || "";
    if (!endpoint) return Promise.resolve([]);
    var readers = Array.prototype.map.call(files, function (f) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () {
          var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement("canvas");
          cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          res({ filename: f.name, mimeType: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1] });
        };
        img.onerror = function () { res(null); };
        var fr = new FileReader();
        fr.onload = function () { img.src = fr.result; };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(f);
      });
    });
    return Promise.all(readers).then(function (photos) {
      photos = photos.filter(Boolean);
      if (!photos.length) return [];
      return fetch(endpoint, {
        method: "POST", mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "photo-upload", folder: "quote-requests", photos: photos })
      }).then(function (r) { return r.json(); }).then(function (out) {
        return (out && out.ok && out.urls) ? out.urls : [];
      }).catch(function () { return []; });
    });
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
    if (svcKey === "lawn-care" && typeof window.PGLawn !== "undefined" && !lawnQuote) {
      err.textContent = "One quick step left: go back to step 2, measure your yard or pick its size, and your instant price is set.";
      err.hidden = false; goStep(2); return;
    }
    err.hidden = true;
    var btn = $("quoteSubmit");
    btn.disabled = true; btn.textContent = "Sending...";
    var c = QUOTE_SVCS[svcKey], p = price();
    var ref = "PQ-" + Date.now().toString(36).toUpperCase().slice(-6);
    var instant = lawnActive() ? {
      lotSqft: lawnMeas ? lawnMeas.lotSqft : null,
      lawnSqft: lawnMeas ? lawnMeas.lawnSqft : null,
      tier: lawnQuote.tier,
      vendorAmount: lawnQuote.vendorAmount,
      customerPrice: lawnQuote.customerPrice,
      markupUsed: lawnQuote.markupUsed,
      measurementSource: lawnMeas ? lawnMeas.source : "customer-estimate",
      photosRequested: true
    } : null;
    var detail;
    if (instant) {
      detail = "Instant lawn price: " + lawnQuote.tierLabel +
        (lawnMeas ? " · lawn about " + lawnMeas.lawnSqft + " sq ft, lot " + lawnMeas.lotSqft + " sq ft (" + lawnMeas.county + " County records)" : " · customer size estimate") +
        " · customer price $" + lawnQuote.customerPrice + " per visit" +
        (lawnQuote.overgrown ? " · overgrown first visit reset included" : "") +
        "; " + c.q2.label + " " + c.q2.opts[q2i][0] + "; " + c.q3.label + " " + c.q3.opts[q3i];
    } else {
      detail = c.q1.label + " " + c.q1.opts[q1i] + "; " +
        c.q2.label + " " + c.q2.opts[q2i][0] + "; " + c.q3.label + " " + c.q3.opts[q3i];
    }
    var jobDesc = ($("qDetailText").value || "").trim();
    if (jobDesc) detail += "; Customer notes: " + jobDesc;
    var otherNames = selectedKeys().filter(function (k) { return k !== svcKey; })
      .map(function (k) { return QUOTE_SVCS[k].name; });
    if (otherNames.length) detail += "; Also requested: " + otherNames.join(", ");
    var photos = $("qPhotos").files;
    var vids = $("qVideos").files;
    if ((photos && photos.length) || (vids && vids.length)) btn.textContent = "Uploading...";
    uploadQuotePhotos().then(function (photoUrls) {
      return uploadQuoteVideos().then(function (vres) {
      if (photoUrls.length) detail += "; Photos: " + photoUrls.join(", ");
      if (vres.urls.length) detail += "; Videos: " + vres.urls.join(", ");
      var videoLink = ($("qVideoLink").value || "").trim();
      if (videoLink) detail += "; Video link: " + videoLink;
      var refCode = "";
      try { refCode = (new URLSearchParams(location.search).get("ref") || localStorage.getItem("pgRef") || "").trim(); } catch (e) {}
      if (!refCode) refCode = f.referrer.value.trim();
      var payload = {
        type: "quote-request", status: "new", ref: ref, referralCode: refCode,
        service: selectedNames().join(", "), services: selectedNames(),
        estimate: p, unit: c.unit, details: detail,
        name: name, phone: phone, email: f.email.value.trim(),
        address: address, date: f.date.value, referrer: f.referrer.value.trim(),
        hearAbout: (f.hear ? f.hear.value : ""),
        notes: f.notes.value.trim(),
        videos: vres.urls, videoLink: videoLink,
        message: "Instant estimate: $" + p + " " + c.unit + " (" + selectedNames().join(", ") + " - " + detail + ")." +
          (f.notes.value.trim() ? " Notes: " + f.notes.value.trim() : ""),
        source: "quote-page", page: location.pathname,
        uid: currentUser ? currentUser.uid : null
      };
      if (instant) {
        payload.lotSqft = instant.lotSqft;
        payload.lawnSqft = instant.lawnSqft;
        payload.tier = instant.tier;
        payload.vendorAmount = instant.vendorAmount;
        payload.customerPrice = instant.customerPrice;
        payload.markupUsed = instant.markupUsed;
        payload.measurementSource = instant.measurementSource;
        payload.photosRequested = instant.photosRequested;
      }
      if (fbDb) {
        var srDoc = {
          uid: currentUser ? currentUser.uid : null,
          name: name, phone: phone, email: payload.email,
          service: "Quote request " + ref + " - " + selectedNames().join(", "),
          services: selectedNames(),
          message: payload.message, status: "new",
          photos: photoUrls,
          videos: vres.urls, videoLink: videoLink,
          source: "quote-page", ref: ref, referralCode: refCode, estimate: p,
          hearAbout: (f.hear ? f.hear.value : ""),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (instant) {
          srDoc.lotSqft = instant.lotSqft;
          srDoc.lawnSqft = instant.lawnSqft;
          srDoc.tier = instant.tier;
          srDoc.vendorAmount = instant.vendorAmount;
          srDoc.customerPrice = instant.customerPrice;
          srDoc.markupUsed = instant.markupUsed;
          srDoc.measurementSource = instant.measurementSource;
          srDoc.photosRequested = instant.photosRequested;
        }
        fbDb.collection("service_requests").add(srDoc).catch(function () {});
      }
      var done = function () {
        if (instant) {
          $("qdoneMsg").textContent = "Request received at your instant price. Our team confirms it and sends your secure payment link. " + CONFIRM_COPY + " Questions? Call us at (786) 422-9674.";
        }
        if (vres.skipped.length) {
          $("qdoneMsg").textContent = "We'll call you shortly to confirm your exact quote. One heads-up: " + vres.skipped.join(", ") + " was over our 25 MB video limit, so it wasn't attached. Text us a link to it (Google Photos, iCloud, YouTube) anytime and we'll take a look.";
        }
        $("qdoneRef").textContent = ref;
        $("qdonePrice").textContent = "$" + p + " " + c.unit;
        goStep(1); $("qstep1").hidden = true; $("qstepDone").hidden = false;
        document.querySelectorAll("#quoteSteps li").forEach(function (li) { li.classList.add("done"); li.classList.remove("active"); });
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      if (leadEndpoint) {
        fetch(leadEndpoint, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        }).then(done).catch(done);
      } else { done(); }
      });
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Get my quote";
      err.textContent = "Something went wrong sending your quote. Please try again.";
      err.hidden = false;
    });
  });

  /* ---------- Preselect from ?service= ---------- */
  try {
    var pre = new URLSearchParams(location.search).get("service");
    if (pre && QUOTE_SVCS[pre]) selectService(pre, true);
  } catch (e) {}
})();

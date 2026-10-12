/* PrimeGuard instant quote calculator - shared by all service pages.
   Configure with <body data-svc="handyman"> and trigger with [data-quote-open].
   Ballpark only: final quote is always confirmed before work starts. */
(function () {
  "use strict";
  var SVC = (document.body.getAttribute("data-svc") || "").trim();
  var CFG = {
    "lawn-care": {
      name: "Lawn Care", select: "Lawn Care", unit: "per visit",
      q1label: "How big is the yard?",
      sizes: ["Small yard", "Medium yard", "Large yard"],
      base: [45, 65, 90],
      q2label: "How often?",
      q2: [["One-time", 1], ["Monthly", 0.95], ["Biweekly", 0.9], ["Weekly", 0.85]]
    },
    "pressure-washing": {
      name: "Pressure Washing", select: "Pressure Washing", unit: "per visit",
      q1label: "How big is the area?",
      sizes: ["Small area", "Medium area", "Large area"],
      base: [169, 219, 289],
      q2label: "What are we washing?",
      q2: [["Driveway only", 1], ["House exterior", 1.25], ["Driveway + house", 1.6], ["Whole property", 2]]
    },
    "junk-removal": {
      name: "Debris & Junk Removal", select: "Debris & Junk Removal", unit: "per load",
      q1label: "How much junk?",
      sizes: ["A few items", "Quarter truck", "Half truck or more"],
      base: [89, 149, 239],
      q2label: "What kind of junk?",
      q2: [["Household items", 1], ["Yard debris", 0.9], ["Furniture", 1.15], ["Construction debris", 1.3]]
    },
    "make-ready-cleaning": {
      name: "Make-Ready Cleaning", select: "Make-Ready Cleaning", unit: "per clean",
      q1label: "How big is the home?",
      sizes: ["Studio / 1 bed", "2-3 bed", "4+ bed"],
      base: [179, 249, 339],
      q2label: "Cleaning depth?",
      q2: [["Standard clean", 1], ["Deep clean", 1.3], ["Turnover package", 1.55]]
    },
    "handyman": {
      name: "Handyman Services", select: "Handyman Services", unit: "per visit",
      q1label: "How big is the job?",
      sizes: ["Small fix", "A few items", "Full punch list"],
      base: [65, 140, 280],
      q2label: "Roughly how long?",
      q2: [["Under an hour", 1], ["Half day", 1.8], ["Full day", 3]]
    }
  }[SVC];
  if (!CFG) return;

  var sizeIdx = 1, q2Idx = 0, shown = 0;

  function price() {
    var p = CFG.base[sizeIdx] * CFG.q2[q2Idx][1];
    return Math.max(25, Math.round(p / 5) * 5);
  }

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }

  /* ---------- Build the modal ---------- */
  var overlay = el("div", "qcalc-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  var card = el("div", "qcalc-card");
  var body = el("div", "qcalc-body");

  var closeBtn = el("button", "qcalc-close", "\u00d7");
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.setAttribute("type", "button");

  body.appendChild(el("p", "qcalc-kicker", "Instant quote"));
  body.appendChild(el("h3", "qcalc-title", CFG.name));

  body.appendChild(el("p", "qcalc-qlabel", CFG.q1label));
  var sizeRow = el("div", "qcalc-opts");
  CFG.sizes.forEach(function (s, i) {
    var b = el("button", "qcalc-opt" + (i === 1 ? " active" : ""), s);
    b.setAttribute("type", "button");
    b.addEventListener("click", function () {
      sizeIdx = i;
      sizeRow.querySelectorAll(".qcalc-opt").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      renderPrice();
    });
    sizeRow.appendChild(b);
  });
  body.appendChild(sizeRow);

  body.appendChild(el("p", "qcalc-qlabel", CFG.q2label));
  var q2Row = el("div", "qcalc-opts");
  CFG.q2.forEach(function (opt, i) {
    var b = el("button", "qcalc-opt" + (i === 0 ? " active" : ""), opt[0]);
    b.setAttribute("type", "button");
    b.addEventListener("click", function () {
      q2Idx = i;
      q2Row.querySelectorAll(".qcalc-opt").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      renderPrice();
    });
    q2Row.appendChild(b);
  });
  body.appendChild(q2Row);

  var priceWrap = el("div", "qcalc-price");
  var priceNum = el("strong", null, "$" + price());
  priceWrap.appendChild(priceNum);
  priceWrap.appendChild(el("span", "qcalc-unit", " " + CFG.unit));
  body.appendChild(priceWrap);
  body.appendChild(el("p", "qcalc-note", "Ballpark estimate. Final quote confirmed before we start. No surprises."));

  var cta = el("button", "btn btn-gold btn-lg qcalc-cta", "Get my exact quote");
  cta.setAttribute("type", "button");
  body.appendChild(cta);

  card.appendChild(closeBtn);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function animatePrice(to) {
    var from = shown, start = null;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / 350);
      var v = Math.round(from + (to - from) * p);
      priceNum.textContent = "$" + v;
      if (p < 1) requestAnimationFrame(tick);
      else shown = to;
    }
    requestAnimationFrame(tick);
  }
  function renderPrice() { animatePrice(price()); }

  function open() {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    shown = price();
    priceNum.textContent = "$" + shown;
  }
  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  cta.addEventListener("click", function () {
    try {
      sessionStorage.setItem("pg_quote", JSON.stringify({
        service: CFG.select,
        size: CFG.sizes[sizeIdx],
        extra: CFG.q2label + " " + CFG.q2[q2Idx][0],
        estimate: price(),
        unit: CFG.unit
      }));
    } catch (e) {}
    location.href = "../index.html#contact";
  });

  document.querySelectorAll("[data-quote-open]").forEach(function (t) {
    t.addEventListener("click", function (e) { e.preventDefault(); open(); });
  });
})();

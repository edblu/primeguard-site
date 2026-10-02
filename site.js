/* PrimeGuard site behavior:
   1. Injects SITE_CONFIG (see config.js) into every placeholder.
   2. Glassy header state, mobile hamburger menu.
   3. Hero search bar that live-filters service cards (+ quick-pick chips).
   4. Scroll-reveal animations (IntersectionObserver).
   5. Quote form -> mailto compose. No backend. */
(function () {
  var cfg = window.SITE_CONFIG || {};

  /* ---------- Config injection (do not change selectors) ---------- */
  function setText(sel, val) {
    document.querySelectorAll(sel).forEach(function (el) { el.textContent = val; });
  }
  function setHref(sel, val) {
    document.querySelectorAll(sel).forEach(function (el) { el.setAttribute("href", val); });
  }

  setText("[data-phone]", cfg.phoneDisplay || "");
  setHref("[data-phone-href]", cfg.phoneHref || "#");
  setText("[data-email]", cfg.email || "");
  setHref("[data-email-href]", "mailto:" + (cfg.email || ""));
  setText("[data-hours]", cfg.hours || "");
  setText("[data-area]", cfg.serviceArea || "");
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Header scroll state ---------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Hero video: nudge autoplay where the browser allows it ---------- */
  var heroVideo = document.querySelector(".hero-video");
  if (heroVideo) {
    try {
      var pv = heroVideo.play();
      if (pv && pv.catch) pv.catch(function () { /* poster image shows instead */ });
    } catch (e) { /* poster image shows instead */ }
  }

  /* ---------- Mobile hamburger menu ---------- */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("mainNav");
  function closeMenu() {
    nav.classList.remove("open");
    toggle.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  }
  toggle.addEventListener("click", function () {
    var isOpen = nav.classList.toggle("open");
    toggle.classList.toggle("open", isOpen);
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  /* ---------- Scroll-reveal animations ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Hero search -> live filter service cards ---------- */
  var searchInput = document.getElementById("serviceSearch");
  var searchClear = document.getElementById("searchClear");
  var searchEmpty = document.getElementById("searchEmpty");
  var searchEmptyTerm = document.getElementById("searchEmptyTerm");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".service-card"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));

  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  function applyFilter(term) {
    var q = normalize(term);
    var visible = 0;
    cards.forEach(function (card) {
      var hay = normalize(card.getAttribute("data-name")) + " " + normalize(card.getAttribute("data-desc"));
      var match = !q || hay.indexOf(q) !== -1;
      card.classList.toggle("hidden", !match);
      if (match) visible++;
    });
    searchEmpty.hidden = visible !== 0;
    if (visible === 0) searchEmptyTerm.textContent = term;
    searchClear.hidden = !q;
    chips.forEach(function (chip) {
      chip.classList.toggle("active", q !== "" && normalize(chip.getAttribute("data-chip")) === q);
    });
    return visible;
  }

  searchInput.addEventListener("input", function () {
    applyFilter(searchInput.value);
  });

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    applyFilter("");
    searchInput.focus();
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var term = chip.getAttribute("data-chip");
      searchInput.value = term;
      var visible = applyFilter(term);
      var target = null;
      if (visible === 1) {
        target = cards.filter(function (c) { return !c.classList.contains("hidden"); })[0];
      }
      (target || document.getElementById("services")).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("services").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /* ---------- Quote form -> mailto compose ---------- */
  var form = document.getElementById("quoteForm");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var els = form.elements;
    var name = els.name.value.trim();
    var phone = els.phone.value.trim();
    var email = els.email.value.trim();
    var service = els.service.value;
    var message = els.message.value.trim();

    var subject = "Service request: " + service + " — " + name;
    var body = [
      "Name: " + name,
      "Phone: " + phone,
      "Email: " + (email || "(not provided)"),
      "Service: " + service,
      "",
      "Details:",
      message || "(none provided)"
    ].join("\n");

    window.location.href =
      "mailto:" + encodeURIComponent(cfg.email || "") +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  });
})();

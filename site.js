/* Injects SITE_CONFIG (see config.js) into every placeholder and
   wires the quote form to compose a mailto email. No backend. */
(function () {
  var cfg = window.SITE_CONFIG || {};

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

  // Quote form -> mailto compose
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

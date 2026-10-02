/* ============================================================
   PRIMEGUARD SITE CONFIG — EDIT THIS ONE SPOT
   ------------------------------------------------------------
   Contact info confirmed with Edwin 2026-10-02.
   Change the values below and the whole site updates:
   header, hero, contact section, footer, and the form.
   NOTE: assigned to window.SITE_CONFIG (not const) because
   site.js reads it via window.SITE_CONFIG.
   ============================================================ */

window.SITE_CONFIG = {
  phoneDisplay: "(786) 422-9674",          // shown to visitors
  phoneHref: "tel:+17864229674",           // click-to-call link
  email: "primeguardllc.office@pgpbiz.com", // shown + used by the form
  hours: "Mon–Sat, 8:00 AM – 6:00 PM",
  serviceArea: "Miami-Dade County, FL",

  // --- Phase 2 integrations (fill these in; site degrades gracefully if empty) ---
  leadEndpoint: "https://script.google.com/macros/s/AKfycbyZvYyTY7GXMdPd6bQcgRyjXgozuOb8jmSkTmCSQT9R0N5w4fKz80ybms5AkjGIvQQA/exec",      // POST target for quote-form leads (JSON). Empty = mailto fallback.
  bookingUrl: "https://cal.com/primeguard/free-estimate",       // online booking page embedded in the "Book now" modal. "#" = "coming soon".
  reviewGoogle: "#",     // Google review page URL — button hidden while empty/"#"
  reviewFacebook: "#",   // Facebook review page URL — button hidden while empty/"#"
  reviewThumbtack: "https://www.thumbtack.com/fl/miami/pressure-washing/primeguard-preservation-llc/service/591657911686586383",   // Thumbtack review page URL — button hidden while empty/"#"

  // --- Customer accounts (Firebase). Parent fills the real config object later.
  // null/empty = "Accounts coming soon" mode; the site never breaks without it.
  firebase: null
};

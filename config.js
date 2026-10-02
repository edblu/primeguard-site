/* ============================================================
   PRIMEGUARD SITE CONFIG — EDIT THIS ONE SPOT
   ------------------------------------------------------------
   Phone and email are NOT yet confirmed with Edwin.
   Change the two values below and the whole site updates:
   header, hero, contact section, footer, and the form.
   ============================================================ */

const SITE_CONFIG = {
  phoneDisplay: "(786) 422-9674",          // shown to visitors
  phoneHref: "tel:+17864229674",           // click-to-call link
  email: "primeguardllc.elora@pgpbiz.com", // shown + used by the form
  hours: "Mon–Sat, 8:00 AM – 6:00 PM",
  serviceArea: "Miami-Dade County, FL",

  // --- Phase 2 integrations (fill these in; site degrades gracefully if empty) ---
  leadEndpoint: "https://script.google.com/macros/s/AKfycbyZvYyTY7GXMdPd6bQcgRyjXgozuOb8jmSkTmCSQT9R0N5w4fKz80ybms5AkjGIvQQA/exec",      // POST target for quote-form leads (JSON). Empty = mailto fallback.
  bookingUrl: "#",       // online booking page embedded in the "Book now" modal. "#" = "coming soon".
  reviewGoogle: "#",     // Google review page URL — button hidden while empty/"#"
  reviewFacebook: "#",   // Facebook review page URL — button hidden while empty/"#"
  reviewThumbtack: "https://www.thumbtack.com/fl/miami/pressure-washing/primeguard-preservation-llc/service/591657911686586383"   // Thumbtack review page URL — button hidden while empty/"#"
};

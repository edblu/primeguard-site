/* ============================================================
   PRIMEGUARD SITE CONFIG. EDIT THIS ONE SPOT
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
  hours: "Mon-Fri, 8:00\u00A0AM - 5:00\u00A0PM · Sat, 8:00\u00A0AM - 12:00\u00A0PM",
  serviceArea: "Miami-Dade & Broward Counties, FL",

  // --- Phase 2 integrations (fill these in; site degrades gracefully if empty) ---
  leadEndpoint: "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec",      // POST target for quote-form leads (JSON). Empty = mailto fallback.
  bookingUrl: "https://cal.com/primeguard/free-estimate",       // online booking page embedded in the "Book now" modal. "#" = "coming soon".
  reviewGoogle: "#",     // Google review page URL. Button hidden while empty/"#"
  reviewFacebook: "#",   // Facebook review page URL. Button hidden while empty/"#"
  reviewThumbtack: "https://www.thumbtack.com/fl/miami/pressure-washing/primeguard-preservation-llc/service/591657911686586383",   // Thumbtack review page URL. Button hidden while empty/"#"

  // --- Customer accounts (Firebase). Live config for the PrimeGuard project.
  firebase: {
    apiKey: "AIzaSyDDOcUiuTlollOGoNUJd_Eos-tovJ1dqA0",
    authDomain: "primeguard-83e88.firebaseapp.com",
    projectId: "primeguard-83e88",
    storageBucket: "primeguard-83e88.firebasestorage.app",
    messagingSenderId: "1031375547061",
    appId: "1:1031375547061:web:947b8ed95695a0df2b2cfc"
  },

  // --- Photo uploads (Apps Script + Google Drive). Empty = upload disabled.
  photoEndpoint: "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec",

  // --- Subscription plans (STARTING prices. Edwin adjusts these freely).
  // price: shown on the plan card (injected by site.js). service: must match
  // a value in the quote-form service dropdown so "Choose plan" preselects it.
  plans: [
    { price: "From $45/mo", service: "Lawn Care" },
    { price: "$149/visit", service: "Pressure Washing" },
    { price: "$59/mo",     service: "Handyman Services" }
  ],

  // --- Stripe Payment Links (Edwin pastes these in after creating the
  // products in Stripe; empty string = "payment coming soon" mode).
  // Order must match `plans` above: [lawn, pressure washing, maintenance].
  stripeLinks: [ "https://buy.stripe.com/7sY5kxdkm59HgmndYP9R600", "https://buy.stripe.com/00w00d1BE45D4DF1c39R601", "https://buy.stripe.com/6oU8wJ2FIgSpeefdYP9R602" ],

  // --- Customer portal promo banner (Midnight Gold dashboard).
  // Edwin edits these freely; empty title = banner hidden.
  promoBanner: {
    title: "Give $20, Get $20",
    sub: "Refer a friend. You both get $20 off your next service.",
    cta: "Get my code",
    link: "referrals.html"
  }
};

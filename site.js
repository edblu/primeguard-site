/* PrimeGuard site behavior:
   1. Injects SITE_CONFIG (see config.js) into every placeholder.
   2. EN/ES i18n via data-i18n / data-i18n-ph / data-i18n-aria (persisted in localStorage).
   3. Glassy header state, mobile hamburger menu.
   4. Hero search bar that live-filters service cards (+ quick-pick chips).
   5. Scroll-reveal animations (IntersectionObserver).
   6. Quote form -> POST lead JSON to SITE_CONFIG.leadEndpoint (with honeypot
      spam trap + success/error states); falls back to mailto when unset.
   7. "Book now" modal -> embeds SITE_CONFIG.bookingUrl, or "coming soon" + call.
   8. Review buttons shown only when their config URLs are set. */
(function () {
  var cfg = window.SITE_CONFIG || {};

  /* ============================================================
     i18n dictionary — every user-facing string lives here.
     Formal "usted" Spanish throughout.
     ============================================================ */
  var I18N = {
    en: {
      page_title: "PrimeGuard Preservation LLC — Property Services in Miami-Dade",
      meta_desc: "Pressure washing, lawn care, junk removal, make-ready cleaning, and handyman services across Miami-Dade County — plus SAM.gov-registered federal contracting. Upfront pricing, photo proof on every visit.",
      nav_services: "Services", nav_work: "Work", nav_reviews: "Reviews",
      nav_government: "Government", nav_about: "About", nav_contact: "Contact",
      book_now: "Book now", lang_label: "Language",
      hero_kicker: "Miami-Dade County · Property Services",
      hero_title_a: "Property care,", hero_title_b: "perfected.",
      hero_sub: "Five essential services, one smart call. Vetted pros, upfront pricing, and photo proof on every visit — across Miami-Dade County.",
      search_ph: "What service do you need? Try “lawn”…",
      search_aria: "Search services", search_clear_aria: "Clear search",
      chip_pressure: "Pressure Washing", chip_lawn: "Lawn Care", chip_junk: "Junk Removal",
      chip_makeready: "Make-Ready", chip_handyman: "Handyman",
      strip1_t: "Vetted pros", strip1_s: "Every tech is background-checked",
      strip2_t: "Photo proof", strip2_s: "Before & after photos every visit",
      strip3_t: "Upfront pricing", strip3_s: "You approve the price first",
      strip4_t: "Local", strip4_s: "Based in Miami-Dade County",
      svc_kicker: "What we do", svc_title: "Services & pricing",
      svc_lead: "Straightforward work at straightforward prices. Final quote confirmed before we start — no surprises.",
      svc1_t: "Pressure Washing",
      svc1_d: "Driveways, walkways, patios, and exteriors brought back to clean. Years of grime, gone in an afternoon.",
      svc2_t: "Lawn Care",
      svc2_d: "Mowing, edging, and cleanup on a schedule you can count on — through South Florida's year-round growing season.",
      svc3_t: "Debris & Junk Removal",
      svc3_d: "Yard debris, old furniture, and clutter hauled away. You point, we lift, it's gone.",
      svc4_t: "Make-Ready Cleaning",
      svc4_d: "Turnover cleans that get rentals and listings guest-ready — kitchens, baths, floors, and details.",
      svc5_t: "Handyman Services",
      svc5_d: "Small repairs and punch-list items done right the first time. One call handles the whole list.",
      from: "from", quote_link: "Get a quote",
      plans_kicker: "Subscriptions", plans_title: "Set it and forget it",
      plans_lead: "Recurring care at a locked-in rate. No contracts — cancel anytime.",
      plan_choose: "Choose plan",
      plan_selected: "You selected", plan_onetime: "One-time",
      plan_name_1: "Lawn Care Plan",
      plan_desc_1: "Biweekly mowing, edging & cleanup. Weekly service available.",
      plan_inc_1a: "Mowing & edging every two weeks",
      plan_inc_1b: "Cleanup & clippings removal",
      plan_inc_1c: "Year-round scheduling",
      plan_inc_1d: "Cancel anytime",
      plan_name_2: "Pressure Washing Plan",
      plan_desc_2: "Full driveway + walkway wash, auto-scheduled every 3 months.",
      plan_inc_2a: "Driveway & walkway wash",
      plan_inc_2b: "Auto-scheduled every 3 months",
      plan_inc_2c: "Priority booking",
      plan_inc_2d: "Cancel anytime",
      plan_name_3: "Home Maintenance Plan",
      plan_desc_3: "Monthly handyman checkup visit for punch-list items.",
      plan_inc_3a: "Monthly handyman visit",
      plan_inc_3b: "Punch-list & small repairs",
      plan_inc_3c: "Priority scheduling",
      plan_inc_3d: "Cancel anytime",
      referred_label: "Who referred you?", referred_ph: "Name (optional)",
      lead_plan_label: "Plan", lead_referred_label: "Referred by",
      no_match: "No match for", no_match_sub: "Tell us what you need — we probably do it.",
      call: "Call",
      work_kicker: "Our work", work_title: "Before & after",
      work_lead: "Real project photos are on the way.",
      before: "Before", after: "After",
      work_caption: "Project photos coming soon",
      work_caption_1: "Pressure Washing",
      work_caption_2: "Lawn Care",
      work_caption_3: "Debris & Junk Removal",
      reviews_kicker: "Reviews", reviews_title: "What our customers say",
      reviews_empty: "We're just getting started. Be the first to review us.",
      example_tag: "Example",
      sample_review_1: "\"My driveway looks brand new. They showed up on time and the price was exactly what they quoted.\"",
      sample_name_1: "Maria R.", sample_service_1: "Pressure Washing",
      sample_review_2: "\"The yard has never looked this good. Booking took two minutes and the crew was professional.\"",
      sample_name_2: "James T.", sample_service_2: "Lawn Care",
      sample_review_3: "\"They hauled away years of junk in one afternoon. Fair price, no hassle.\"",
      sample_name_3: "Denise W.", sample_service_3: "Debris & Junk Removal",
      review_google: "Review on Google", review_facebook: "Review on Facebook",
      review_thumbtack: "Review on Thumbtack",
      about_kicker: "Who we are", about_title: "A higher standard of property care",
      about_p1: "PrimeGuard Preservation is a Miami-Dade property services company built on a simple idea: the work should be excellent, the price should be clear, and you should never have to wonder what happened while you were away.",
      about_p2: "Every visit is handled by a vetted professional and documented with before-and-after photos, so you see exactly what your money bought. Homeowners, landlords, and property managers across the county trust us with the details that keep a property looking sharp.",
      about_li1: "Background-checked, vetted pros on every job",
      about_li2: "Before-and-after photo documentation, every visit",
      about_li3: "Upfront pricing — approved by you before work begins",
      about_li4: "One call for five services, across Miami-Dade County",
      gov_kicker: "Public sector", gov_title: "Government & institutional contracting",
      gov_lead: "PrimeGuard Preservation LLC is a SAM.gov-registered federal contractor. We bring our commercial property-services discipline — vetted crews, photo documentation, upfront pricing — to government facilities work, and we are ready to bid as a prime or support primes as a subcontractor.",
      gov_card1_t: "Registered & ready",
      gov_note: "Active SAM.gov registration. Capability statement available on request.",
      gov_card2_t: "Capability areas",
      gov_li1: "Grounds & facilities maintenance", gov_li2: "Janitorial services",
      gov_li3: "Property preservation", gov_li4: "Debris removal",
      gov_cta_p: "Contracting officers and facility managers: tell us about your requirement.",
      email_word: "Email",
      contact_kicker: "Get in touch", contact_title: "Request service",
      contact_lead: "Call, email, or send the form — we reply during business hours.",
      info_phone: "Phone", info_email: "Email", info_hours: "Hours", info_area: "Service area",
      call_now: "Call now",
      form_title: "Get a fast quote", form_name: "Full name", form_phone: "Phone",
      form_email: "Email", form_service: "Service needed", choose_service: "Choose a service",
      opt_else: "Something else", form_details: "Details",
      ph_name: "Your name", ph_details: "Tell us about the job — size, location, timing.",
      send_request: "Send request",
      form_note_mailto: "This opens your email app with the request ready to send. No account needed.",
      form_note_api: "We reply during business hours — usually the same day.",
      form_success: "Thanks! We'll call you shortly.",
      form_error: "Something went wrong sending your request. Please call us instead.",
      footer_rights: "All rights reserved.",
      booking_title: "Book your service",
      booking_soon: "Online booking coming soon — call us at",
      close: "Close",
      login: "Log in", login_aria: "Log in to your account", my_account: "My account",
      auth_title_login: "Welcome back", auth_title_signup: "Create your account",
      auth_tab_login: "Log in", auth_tab_signup: "Sign up",
      auth_email: "Email", auth_password: "Password",
      auth_submit_login: "Log in", auth_submit_signup: "Create account",
      auth_or: "or", auth_google: "Continue with Google",
      auth_error_default: "Something went wrong. Please try again.",
      auth_error_credential: "Email or password didn't match. Try again.",
      auth_error_inuse: "That email already has an account. Log in instead.",
      auth_error_weak: "Password needs at least 6 characters.",
      auth_error_email: "That email address doesn't look right.",
      auth_error_many: "Too many attempts — try again in a few minutes.",
      auth_error_popup: "The sign-in window was blocked. Allow popups and try again.",
      auth_soon_title: "Accounts are coming soon",
      auth_soon_body: "We're putting the finishing touches on customer accounts. You can still request service as a guest — no account needed.",
      profile_title: "My profile",
      profile_name: "Full name", profile_phone: "Phone",
      profile_address: "Service address", ph_address: "Street, city, ZIP",
      profile_service: "Preferred service", profile_none: "No preference",
      profile_save: "Save", profile_saved: "Saved.",
      profile_save_error: "Couldn't save. Check your connection and try again.",
      profile_logout: "Log out"
    },
    es: {
      page_title: "PrimeGuard Preservation LLC — Servicios de propiedad en Miami-Dade",
      meta_desc: "Lavado a presión, cuidado del césped, retiro de escombros, limpieza pre-entrega y reparaciones en todo el condado de Miami-Dade — además de contratación federal registrada en SAM.gov. Precios claros y evidencia fotográfica en cada visita.",
      nav_services: "Servicios", nav_work: "Trabajos", nav_reviews: "Reseñas",
      nav_government: "Gobierno", nav_about: "Nosotros", nav_contact: "Contacto",
      book_now: "Reservar ahora", lang_label: "Idioma",
      hero_kicker: "Condado de Miami-Dade · Servicios de propiedad",
      hero_title_a: "Cuidado de propiedades,", hero_title_b: "perfeccionado.",
      hero_sub: "Cinco servicios esenciales, una sola llamada inteligente. Profesionales verificados, precios claros y evidencia fotográfica en cada visita — en todo el condado de Miami-Dade.",
      search_ph: "¿Qué servicio necesita? Pruebe «césped»…",
      search_aria: "Buscar servicios", search_clear_aria: "Borrar búsqueda",
      chip_pressure: "Lavado a presión", chip_lawn: "Cuidado del césped", chip_junk: "Retiro de escombros",
      chip_makeready: "Pre-entrega", chip_handyman: "Reparaciones",
      strip1_t: "Profesionales verificados", strip1_s: "Cada técnico pasa verificación de antecedentes",
      strip2_t: "Evidencia fotográfica", strip2_s: "Fotos de antes y después en cada visita",
      strip3_t: "Precios por adelantado", strip3_s: "Usted aprueba el precio primero",
      strip4_t: "Locales", strip4_s: "Con sede en el condado de Miami-Dade",
      svc_kicker: "Lo que hacemos", svc_title: "Servicios y precios",
      svc_lead: "Trabajo honesto a precios honestos. Confirmamos el presupuesto final antes de empezar — sin sorpresas.",
      svc1_t: "Lavado a presión",
      svc1_d: "Entradas, aceras, patios y exteriores como nuevos. Años de suciedad, eliminados en una tarde.",
      svc2_t: "Cuidado del césped",
      svc2_d: "Corte, bordeado y limpieza con un horario confiable — durante todo el año en el sur de la Florida.",
      svc3_t: "Retiro de escombros",
      svc3_d: "Retiramos escombros de jardín, muebles viejos y trastos. Usted señala, nosotros cargamos, y desaparece.",
      svc4_t: "Limpieza pre-entrega",
      svc4_d: "Limpiezas de entrega que dejan alquileres y propiedades listos para huéspedes — cocinas, baños, pisos y detalles.",
      svc5_t: "Servicios de reparaciones",
      svc5_d: "Reparaciones menores y listas de pendientes, bien hechas desde la primera vez. Una llamada resuelve toda la lista.",
      from: "desde", quote_link: "Pida un presupuesto",
      plans_kicker: "Suscripciones", plans_title: "Prográmelo y olvídese",
      plans_lead: "Cuidado recurrente a precio fijo. Sin contratos: cancele cuando quiera.",
      plan_choose: "Elegir plan",
      plan_selected: "Usted seleccionó", plan_onetime: "Único",
      plan_name_1: "Plan de cuidado del césped",
      plan_desc_1: "Corte quincenal, bordeado y limpieza. Servicio semanal disponible.",
      plan_inc_1a: "Corte y bordeado cada dos semanas",
      plan_inc_1b: "Limpieza y retiro de recortes",
      plan_inc_1c: "Programación todo el año",
      plan_inc_1d: "Cancele cuando quiera",
      plan_name_2: "Plan de lavado a presión",
      plan_desc_2: "Lavado completo de entrada y acera, programado automáticamente cada 3 meses.",
      plan_inc_2a: "Lavado de entrada y acera",
      plan_inc_2b: "Programación automática cada 3 meses",
      plan_inc_2c: "Reserva prioritaria",
      plan_inc_2d: "Cancele cuando quiera",
      plan_name_3: "Plan de mantenimiento del hogar",
      plan_desc_3: "Visita mensual de reparaciones para su lista de pendientes.",
      plan_inc_3a: "Visita mensual de reparaciones",
      plan_inc_3b: "Lista de pendientes y reparaciones menores",
      plan_inc_3c: "Programación prioritaria",
      plan_inc_3d: "Cancele cuando quiera",
      referred_label: "¿Quién lo refirió?", referred_ph: "Nombre (opcional)",
      lead_plan_label: "Plan", lead_referred_label: "Referido por",
      no_match: "Sin resultados para", no_match_sub: "Díganos lo que necesita — probablemente lo hacemos.",
      call: "Llamar",
      work_kicker: "Nuestro trabajo", work_title: "Antes y después",
      work_lead: "Las fotos reales de nuestros proyectos están en camino.",
      before: "Antes", after: "Después",
      work_caption: "Fotos del proyecto próximamente",
      work_caption_1: "Lavado a presión",
      work_caption_2: "Cuidado del césped",
      work_caption_3: "Remoción de escombros",
      reviews_kicker: "Reseñas", reviews_title: "Lo que dicen nuestros clientes",
      reviews_empty: "Estamos empezando. Sea el primero en dejarnos una reseña.",
      example_tag: "Ejemplo",
      sample_review_1: "\"Mi entrada parece nueva. Llegaron puntuales y el precio fue exactamente el cotizado.\"",
      sample_name_1: "Maria R.", sample_service_1: "Lavado a presión",
      sample_review_2: "\"El jardín nunca se había visto tan bien. Reservar tomó dos minutos y el equipo fue profesional.\"",
      sample_name_2: "James T.", sample_service_2: "Cuidado del césped",
      sample_review_3: "\"Se llevaron años de trastos en una tarde. Precio justo, sin complicaciones.\"",
      sample_name_3: "Denise W.", sample_service_3: "Remoción de escombros",
      review_google: "Reseña en Google", review_facebook: "Reseña en Facebook",
      review_thumbtack: "Reseña en Thumbtack",
      about_kicker: "Quiénes somos", about_title: "Un estándar superior en el cuidado de propiedades",
      about_p1: "PrimeGuard Preservation es una empresa de servicios de propiedad en Miami-Dade basada en una idea simple: el trabajo debe ser excelente, el precio debe ser claro, y usted nunca debería preguntarse qué pasó mientras estaba fuera.",
      about_p2: "Cada visita la realiza un profesional verificado y se documenta con fotos de antes y después, para que vea exactamente en qué se invirtió su dinero. Propietarios, arrendadores y administradores de propiedades en todo el condado nos confían los detalles que mantienen una propiedad impecable.",
      about_li1: "Profesionales verificados con antecedentes comprobados en cada trabajo",
      about_li2: "Documentación fotográfica de antes y después, en cada visita",
      about_li3: "Precios por adelantado — aprobados por usted antes de empezar",
      about_li4: "Una llamada para cinco servicios, en todo el condado de Miami-Dade",
      gov_kicker: "Sector público", gov_title: "Contratación gubernamental e institucional",
      gov_lead: "PrimeGuard Preservation LLC es un contratista federal registrado en SAM.gov. Aplicamos nuestra disciplina comercial en servicios de propiedad — equipos verificados, documentación fotográfica, precios por adelantado — al trabajo en instalaciones gubernamentales, y estamos listos para licitar como contratista principal o apoyar a contratistas principales como subcontratistas.",
      gov_card1_t: "Registrados y listos",
      gov_note: "Registro activo en SAM.gov. Declaración de capacidades disponible a solicitud.",
      gov_card2_t: "Áreas de capacidad",
      gov_li1: "Mantenimiento de terrenos e instalaciones", gov_li2: "Servicios de limpieza",
      gov_li3: "Preservación de propiedades", gov_li4: "Retiro de escombros",
      gov_cta_p: "Oficiales de contratación y gerentes de instalaciones: cuéntenos sobre su requerimiento.",
      email_word: "Correo electrónico",
      contact_kicker: "Contáctenos", contact_title: "Solicite un servicio",
      contact_lead: "Llámenos, escríbanos o envíe el formulario — respondemos en horario de oficina.",
      info_phone: "Teléfono", info_email: "Correo electrónico", info_hours: "Horario", info_area: "Área de servicio",
      call_now: "Llamar ahora",
      form_title: "Obtenga un presupuesto rápido", form_name: "Nombre completo", form_phone: "Teléfono",
      form_email: "Correo electrónico", form_service: "Servicio necesario", choose_service: "Elija un servicio",
      opt_else: "Otro", form_details: "Detalles",
      ph_name: "Su nombre", ph_details: "Cuéntenos sobre el trabajo — tamaño, ubicación, tiempo.",
      send_request: "Enviar solicitud",
      form_note_mailto: "Esto abre su aplicación de correo con la solicitud lista para enviar. No necesita cuenta.",
      form_note_api: "Respondemos en horario de oficina, normalmente el mismo día.",
      form_success: "¡Gracias! Le llamaremos en breve.",
      form_error: "Hubo un problema al enviar su solicitud. Por favor llámenos.",
      footer_rights: "Todos los derechos reservados.",
      booking_title: "Reserve su servicio",
      booking_soon: "La reserva en línea llegará pronto — llámenos al",
      close: "Cerrar",
      login: "Iniciar sesión", login_aria: "Inicie sesión en su cuenta", my_account: "Mi cuenta",
      auth_title_login: "Bienvenido de nuevo", auth_title_signup: "Cree su cuenta",
      auth_tab_login: "Iniciar sesión", auth_tab_signup: "Registrarse",
      auth_email: "Correo electrónico", auth_password: "Contraseña",
      auth_submit_login: "Iniciar sesión", auth_submit_signup: "Crear cuenta",
      auth_or: "o", auth_google: "Continuar con Google",
      auth_error_default: "Hubo un problema. Inténtelo de nuevo.",
      auth_error_credential: "El correo o la contraseña no coinciden. Inténtelo de nuevo.",
      auth_error_inuse: "Ese correo ya tiene una cuenta. Inicie sesión.",
      auth_error_weak: "La contraseña necesita al menos 6 caracteres.",
      auth_error_email: "Ese correo electrónico no parece válido.",
      auth_error_many: "Demasiados intentos. Inténtelo en unos minutos.",
      auth_error_popup: "Se bloqueó la ventana de acceso. Permita las ventanas emergentes e inténtelo de nuevo.",
      auth_soon_title: "Las cuentas llegarán pronto",
      auth_soon_body: "Estamos terminando los detalles de las cuentas de clientes. Puede solicitar un servicio como invitado, sin necesidad de cuenta.",
      profile_title: "Mi perfil",
      profile_name: "Nombre completo", profile_phone: "Teléfono",
      profile_address: "Dirección del servicio", ph_address: "Calle, ciudad, código postal",
      profile_service: "Servicio preferido", profile_none: "Sin preferencia",
      profile_save: "Guardar", profile_saved: "Guardado.",
      profile_save_error: "No se pudo guardar. Revise su conexión e inténtelo de nuevo.",
      profile_logout: "Cerrar sesión"
    }
  };

  var currentLang = "en";
  try {
    var savedLang = localStorage.getItem("pg-lang");
    if (savedLang === "es" || savedLang === "en") currentLang = savedLang;
  } catch (e) { /* storage unavailable — default EN */ }

  function t(key) {
    var d = I18N[currentLang] || I18N.en;
    return d[key] !== undefined ? d[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
  }

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

  /* ---------- Quote form -> lead POST (or mailto fallback) ---------- */
  var form = document.getElementById("quoteForm");
  var formStatus = document.getElementById("formStatus");
  var formNote = document.getElementById("formNote");
  var leadEndpoint = (cfg.leadEndpoint || "").trim();

  function renderFormNote() {
    formNote.textContent = leadEndpoint ? t("form_note_api") : t("form_note_mailto");
  }

  function setFormStatus(kind, msg) {
    formStatus.hidden = false;
    formStatus.className = "form-status " + kind;
    formStatus.textContent = msg;
  }
  function clearFormStatus() {
    formStatus.hidden = true;
    formStatus.textContent = "";
  }

  function mailtoFallback(lead) {
    var subject = "Service request: " + lead.service + " — " + lead.name;
    var body = [
      "Name: " + lead.name,
      "Phone: " + lead.phone,
      "Email: " + (lead.email || "(not provided)"),
      "Service: " + lead.service,
      "",
      "Details:",
      lead.message || "(none provided)"
    ].join("\n");
    window.location.href =
      "mailto:" + encodeURIComponent(cfg.email || "") +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearFormStatus();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var els = form.elements;
    // Honeypot: bots fill it, humans never see it — silently "succeed".
    if (els.company && els.company.value) {
      setFormStatus("success", t("form_success"));
      form.reset();
      return;
    }

    var lead = {
      name: els.name.value.trim(),
      phone: els.phone.value.trim(),
      email: els.email.value.trim(),
      service: els.service.value,
      message: planMessagePrefix(els) + els.message.value.trim(),
      language: currentLang,
      timestamp: new Date().toISOString(),
      source: "primeguard-site",
      uid: currentUser ? currentUser.uid : null
    };

    if (!leadEndpoint) { mailtoFallback(lead); return; }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    // Apps Script endpoints don't return CORS headers, so a normal
    // cross-origin fetch with a JSON content-type dies at preflight.
    // Send as no-cors + text/plain (a CORS "simple request"): the lead
    // is delivered, but the response is opaque, so resolution is treated
    // as success. (Server-side failures can't be detected this way; the
    // endpoint itself was verified separately.)
    fetch(leadEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(lead)
    }).then(function () {
      setFormStatus("success", t("form_success"));
      form.reset();
      clearPlanSelection();
    }).catch(function () {
      setFormStatus("error", t("form_error"));
    }).then(function () {
      btn.disabled = false;
    });
  });

  /* ---------- Subscription plans ---------- */
  // cfg.plans: [{ price, service }]. Display strings come from i18n
  // (plan_name_N / plan_desc_N / plan_inc_Nx); prices come from config.
  var plans = Array.isArray(cfg.plans) ? cfg.plans : [];
  var plansSection = document.getElementById("plans");
  var planNote = document.getElementById("planNote");
  var planNoteText = document.getElementById("planNoteText");
  var planNoteClear = document.getElementById("planNoteClear");
  var selectedPlan = -1; // index into plans; -1 = none (one-time request)

  function planLabel() {
    return selectedPlan >= 0 ? t("plan_name_" + (selectedPlan + 1)) : t("plan_onetime");
  }

  // Prefix packed into the lead message so the Apps Script needs no changes.
  function planMessagePrefix(els) {
    var ref = (els.referrer && els.referrer.value.trim()) || "-";
    return t("lead_plan_label") + ": " + planLabel() + "\n" +
           t("lead_referred_label") + ": " + ref + "\n---\n";
  }

  function renderPlanPrices() {
    document.querySelectorAll("[data-plan-price]").forEach(function (el) {
      var i = parseInt(el.getAttribute("data-plan-price"), 10);
      el.textContent = (plans[i] && plans[i].price) || "";
    });
  }

  function renderPlanNote() {
    if (!planNote) return;
    if (selectedPlan >= 0) {
      planNoteText.textContent = t("plan_selected") + ": " + t("plan_name_" + (selectedPlan + 1));
      planNote.hidden = false;
    } else {
      planNote.hidden = true;
    }
  }

  function selectPlan(i) {
    if (!(plans[i])) return;
    selectedPlan = i;
    // Preselect the matching service in the quote-form dropdown.
    var svc = plans[i].service;
    var sel = form.elements.service;
    if (sel && svc) {
      for (var k = 0; k < sel.options.length; k++) {
        if (sel.options[k].value === svc) { sel.selectedIndex = k; break; }
      }
    }
    renderPlanNote();
    var contact = document.getElementById("contact");
    if (contact) contact.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearPlanSelection() {
    selectedPlan = -1;
    renderPlanNote();
  }

  document.querySelectorAll("[data-plan-choose]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectPlan(parseInt(btn.getAttribute("data-plan-choose"), 10));
    });
  });
  if (planNoteClear) planNoteClear.addEventListener("click", clearPlanSelection);

  /* ---------- Booking modal ---------- */
  var modal = document.getElementById("bookingModal");
  var modalClose = document.getElementById("bookingClose");
  var bookingTitle = document.getElementById("bookingTitle");
  var bookingBody = document.getElementById("bookingBody");

  function bookingUrlValid() {
    var u = (cfg.bookingUrl || "").trim();
    return !!u && u !== "#";
  }

  function renderBooking() {
    bookingTitle.textContent = t("booking_title");
    bookingBody.innerHTML = "";
    if (bookingUrlValid()) {
      var frame = document.createElement("iframe");
      frame.src = cfg.bookingUrl.trim();
      frame.title = t("booking_title");
      frame.setAttribute("loading", "lazy");
      bookingBody.appendChild(frame);
    } else {
      var p = document.createElement("p");
      p.className = "booking-soon";
      p.appendChild(document.createTextNode(t("booking_soon") + " "));
      var a = document.createElement("a");
      a.href = cfg.phoneHref || "#";
      a.className = "btn btn-gold";
      a.textContent = cfg.phoneDisplay || t("call");
      p.appendChild(a);
      bookingBody.appendChild(p);
    }
  }

  function openBooking() {
    renderBooking();
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeBooking() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  document.querySelectorAll("[data-book-open]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      openBooking();
    });
  });
  modalClose.addEventListener("click", closeBooking);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeBooking();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeBooking();
  });

  /* ---------- Review buttons (shown only when URLs are configured) ---------- */
  function setupReviews() {
    var map = {
      reviewGoogle: cfg.reviewGoogle,
      reviewFacebook: cfg.reviewFacebook,
      reviewThumbtack: cfg.reviewThumbtack
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var u = (map[id] || "").trim();
      if (!u || u === "#") {
        el.style.display = "none";
      } else {
        el.href = u;
        el.style.display = "";
      }
    });
  }

  /* ---------- Language toggle ---------- */
  function applyI18n() {
    document.documentElement.setAttribute("lang", currentLang);
    document.title = t("page_title");
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", t("meta_desc"));
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.setAttribute("data-i18n-applied", "1");
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll(".lang-toggle button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === currentLang);
    });
    renderFormNote();
    renderPlanNote();
    if (!modal.hidden) renderBooking();
    updateAuthButtons();
  }

  document.querySelectorAll(".lang-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      if (lang === currentLang) return;
      currentLang = lang;
      try { localStorage.setItem("pg-lang", lang); } catch (e) { /* ignore */ }
      applyI18n();
    });
  });

  /* ============================================================
     Customer accounts (Firebase Auth + Firestore).
     SDK loaded via CDN (firebase-compat) — see index.html.
     Config: SITE_CONFIG.firebase (object), or null = "coming soon" mode.
     Never throws when the config is missing or the CDN is blocked.

     Firestore rules required (also saved in RULES.txt):
       rules_version = '2';
       service cloud.firestore {
         match /databases/{database}/documents {
           match /users/{uid} {
             allow read, write: if request.auth != null && request.auth.uid == uid;
           }
         }
       }
     ============================================================ */
  var firebaseCfg = cfg.firebase || null;
  var fbAuth = null, fbDb = null, currentUser = null, userProfile = {};

  function firebaseUsable() {
    return !!firebaseCfg && typeof firebase !== "undefined";
  }

  function initFirebase() {
    if (!firebaseUsable()) return false;
    try {
      if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(firebaseCfg);
      fbAuth = firebase.auth();
      fbDb = firebase.firestore();
      return true;
    } catch (e) {
      fbAuth = null; fbDb = null;
      return false;
    }
  }

  /* ----- Auth modal ----- */
  var authModal = document.getElementById("authModal");
  var authMain = document.getElementById("authMain");
  var authSoon = document.getElementById("authSoon");
  var authForm = document.getElementById("authForm");
  var authEmail = document.getElementById("authEmail");
  var authPassword = document.getElementById("authPassword");
  var authError = document.getElementById("authError");
  var authSubmit = document.getElementById("authSubmit");
  var authSubmitLabel = document.getElementById("authSubmitLabel");
  var authTitle = document.getElementById("authTitle");
  var authTabLogin = document.getElementById("authTabLogin");
  var authTabSignup = document.getElementById("authTabSignup");
  var authGoogle = document.getElementById("authGoogle");
  var authMode = "login";

  function openAuth() {
    closeMenu();
    authError.hidden = true;
    if (!fbAuth) {
      authMain.hidden = true;
      authSoon.hidden = false;
    } else {
      authSoon.hidden = true;
      authMain.hidden = false;
      setAuthMode("login");
    }
    authModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeAuth() {
    authModal.hidden = true;
    document.body.classList.remove("modal-open");
    authError.hidden = true;
    authForm.reset();
  }

  function setAuthMode(mode) {
    authMode = mode;
    authTabLogin.classList.toggle("active", mode === "login");
    authTabSignup.classList.toggle("active", mode === "signup");
    authTitle.setAttribute("data-i18n", mode === "login" ? "auth_title_login" : "auth_title_signup");
    authTitle.textContent = t(authTitle.getAttribute("data-i18n"));
    authSubmitLabel.setAttribute("data-i18n", mode === "login" ? "auth_submit_login" : "auth_submit_signup");
    authSubmitLabel.textContent = t(authSubmitLabel.getAttribute("data-i18n"));
    authError.hidden = true;
  }

  function authErrorMessage(code) {
    switch (code) {
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-credential":
        return t("auth_error_credential");
      case "auth/email-already-in-use":
        return t("auth_error_inuse");
      case "auth/weak-password":
        return t("auth_error_weak");
      case "auth/invalid-email":
        return t("auth_error_email");
      case "auth/too-many-requests":
        return t("auth_error_many");
      case "auth/popup-blocked":
      case "auth/popup-closed-by-user":
        return t("auth_error_popup");
      default:
        return t("auth_error_default");
    }
  }
  function showAuthError(code) {
    authError.textContent = authErrorMessage(code);
    authError.hidden = false;
  }

  authTabLogin.addEventListener("click", function () { setAuthMode("login"); });
  authTabSignup.addEventListener("click", function () { setAuthMode("signup"); });

  authForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!fbAuth) return;
    if (!authForm.checkValidity()) { authForm.reportValidity(); return; }
    authError.hidden = true;
    authSubmit.disabled = true;
    var email = authEmail.value.trim();
    var pw = authPassword.value;
    var p = authMode === "signup"
      ? fbAuth.createUserWithEmailAndPassword(email, pw)
      : fbAuth.signInWithEmailAndPassword(email, pw);
    p.then(function () {
      closeAuth();
    }).catch(function (err) {
      showAuthError(err && err.code);
    }).then(function () {
      authSubmit.disabled = false;
    });
  });

  authGoogle.addEventListener("click", function () {
    if (!fbAuth || typeof firebase === "undefined") return;
    authError.hidden = true;
    authGoogle.disabled = true;
    var provider = new firebase.auth.GoogleAuthProvider();
    fbAuth.signInWithPopup(provider).then(function () {
      closeAuth();
    }).catch(function (err) {
      showAuthError(err && err.code);
    }).then(function () {
      authGoogle.disabled = false;
    });
  });

  /* ----- Profile modal ----- */
  var profileModal = document.getElementById("profileModal");
  var profileForm = document.getElementById("profileForm");
  var profName = document.getElementById("profName");
  var profPhone = document.getElementById("profPhone");
  var profAddress = document.getElementById("profAddress");
  var profService = document.getElementById("profService");
  var profSave = document.getElementById("profSave");
  var profStatus = document.getElementById("profStatus");
  var profLogout = document.getElementById("profLogout");

  function openProfile() {
    closeMenu();
    loadProfileIntoForm();
    profStatus.hidden = true;
    profileModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeProfile() {
    profileModal.hidden = true;
    document.body.classList.remove("modal-open");
    profStatus.hidden = true;
  }

  function loadProfileIntoForm() {
    var p = userProfile || {};
    profName.value = p.name || "";
    profPhone.value = p.phone || "";
    profAddress.value = p.address || "";
    profService.value = p.service || "";
  }

  profileForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentUser || !fbDb) return;
    profStatus.hidden = true;
    profSave.disabled = true;
    var data = {
      name: profName.value.trim(),
      phone: profPhone.value.trim(),
      address: profAddress.value.trim(),
      service: profService.value,
      email: currentUser.email || "",
      updatedAt: new Date().toISOString()
    };
    fbDb.collection("users").doc(currentUser.uid).set(data, { merge: true }).then(function () {
      userProfile = Object.assign({}, userProfile, data);
      profStatus.className = "form-status success";
      profStatus.textContent = t("profile_saved");
      profStatus.hidden = false;
      updateAuthButtons();
      prefillQuoteForm();
    }).catch(function () {
      profStatus.className = "form-status error";
      profStatus.textContent = t("profile_save_error");
      profStatus.hidden = false;
    }).then(function () {
      profSave.disabled = false;
    });
  });

  profLogout.addEventListener("click", function () {
    if (fbAuth) fbAuth.signOut();
    closeProfile();
  });

  /* ----- Auth state -> header buttons + quote form prefill ----- */
  function firstName() {
    var n = ((userProfile && userProfile.name) || (currentUser && currentUser.displayName) || "").trim();
    if (n) return n.split(/\s+/)[0];
    var em = (currentUser && currentUser.email) || "";
    return em ? em.split("@")[0] : t("my_account");
  }

  function updateAuthButtons() {
    var loggedIn = !!currentUser;
    ["authBtnLabel", "authBtnLabelMobile"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (loggedIn) {
        el.removeAttribute("data-i18n"); // keep applyI18n from overwriting the name
        el.textContent = firstName();
      } else {
        el.setAttribute("data-i18n", "login");
        el.textContent = t("login");
      }
    });
  }

  function prefillQuoteForm() {
    if (!currentUser || !form) return;
    var map = {
      name: (userProfile && userProfile.name) || currentUser.displayName || "",
      phone: (userProfile && userProfile.phone) || "",
      email: currentUser.email || ""
    };
    ["name", "phone", "email"].forEach(function (k) {
      var field = form.elements[k];
      if (field && !field.value && map[k]) field.value = map[k];
    });
  }

  document.querySelectorAll("[data-auth-open]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      if (currentUser && fbAuth) openProfile();
      else openAuth();
    });
  });

  document.getElementById("authClose").addEventListener("click", closeAuth);
  authModal.addEventListener("click", function (e) {
    if (e.target === authModal) closeAuth();
  });
  document.getElementById("profileClose").addEventListener("click", closeProfile);
  profileModal.addEventListener("click", function (e) {
    if (e.target === profileModal) closeProfile();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!authModal.hidden) closeAuth();
    if (!profileModal.hidden) closeProfile();
  });

  if (initFirebase() && fbAuth) {
    fbAuth.onAuthStateChanged(function (user) {
      currentUser = user;
      userProfile = {};
      if (user && fbDb) {
        fbDb.collection("users").doc(user.uid).get().then(function (doc) {
          if (doc && doc.exists) userProfile = doc.data() || {};
          updateAuthButtons();
          prefillQuoteForm();
        }).catch(function () {
          updateAuthButtons();
          prefillQuoteForm();
        });
      } else {
        updateAuthButtons();
      }
    });
  }

  /* ---------- Init ---------- */
  setupReviews();
  renderPlanPrices();
  if (!plans.length && plansSection) plansSection.style.display = "none";
  applyI18n();
})();

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
  /* PWA-only mode: account.html, quote.html and vendor-dashboard.html
     run their own Firebase stack and do NOT use the site behaviors
     below (this file's i18n pass would overwrite their page titles
     and meta). They set
     window.__PG_PWA_ONLY__ before loading site.js so they receive only
     the standalone modules at the bottom of this file (mobile nav
     drawer + PWA install). Every other page leaves the flag unset
     and is completely unaffected. */
  if (window.__PG_PWA_ONLY__) return;
  var cfg = window.SITE_CONFIG || {};

  /* ============================================================
     i18n dictionary. Every user-facing string lives here.
     Formal "usted" Spanish throughout.
     ============================================================ */
  var I18N = {
    en: {
      page_title: "PrimeGuard Preservation LLC. Property Services in Miami-Dade",
      meta_desc: "Pressure washing, lawn care, junk removal, make-ready cleaning, and handyman services across Miami-Dade County. Plus SAM.gov-registered federal contracting. Upfront pricing, photo proof on every visit.",
      nav_services: "Services", nav_work: "Work", nav_reviews: "Reviews",
      nav_government: "Government", nav_about: "About", nav_contact: "Contact",
      nav_careers: "Careers",
      nav_plans: "Plans", nav_referrals: "Referrals",
      nav_faq: "FAQ",
      explore_kicker: "Explore PrimeGuard", explore_title: "More to explore",
      explore_lead: "The short version lives on this page. The full story lives on these pages.",
      ex_work_t: "Our Work", ex_work_d: "Before-and-after results from real jobs.",
      ex_reviews_t: "Customer Reviews", ex_reviews_d: "What Miami-Dade says about us.",
      ex_faq_t: "Questions", ex_faq_d: "Answers before you ask.",
      ex_plans_t: "Plans & Bundles", ex_plans_d: "Subscriptions and bundle pricing.",
      ex_ref_t: "Refer & Earn", ex_ref_d: "Give $20, get $20.",
      ex_gov_t: "Government", ex_gov_d: "Contracting and capability.",
      faq_lead: "Still curious after this? Call us. We reply during business hours.",
      book_now: "Book now", lang_label: "Language",
      hero_kicker: "Miami-Dade County · Property Services",
      hero_title_a: "Property care,", hero_title_b: "perfected.",
      hero_sub: "Five essential services, one smart call. Vetted pros, upfront pricing, and photo proof on every visit. Across Miami-Dade County.",
      search_ph: "What service do you need? Try “lawn”…",
      search_aria: "Search services", search_clear_aria: "Clear search",
      chip_pressure: "Pressure Washing", chip_lawn: "Lawn Care", chip_junk: "Junk Removal",
      chip_makeready: "Make-Ready", chip_handyman: "Handyman",
      strip1_t: "Vetted pros", strip1_s: "Every tech is background-checked",
      promo_kicker: "Free quotes", promo_title_a: "Take advantage of", promo_title_b: "FREE quotes",
      promo_sub: "Every estimate is free and no-pressure. Tell us about your project and we'll reply with upfront pricing, usually the same day.",
      promo_cta: "Get my free quote",
      strip2_t: "Photo proof", strip2_s: "Before & after photos every visit",
      strip3_t: "Upfront pricing", strip3_s: "You approve the price first",
      strip4_t: "Miami roots", strip4_s: "Born and raised in Miami-Dade",
      svc_kicker: "What we do", svc_title: "Services & pricing",
      svc_lead: "Straightforward work at straightforward prices. Final quote confirmed before we start. No surprises.",
      svc1_t: "Pressure Washing",
      svc1_d: "Driveways, walkways, patios, and exteriors brought back to clean. Years of grime, gone in an afternoon.",
      svc2_t: "Lawn Care",
      svc2_d: "Mowing, edging, and cleanup on a schedule you can count on. Through South Florida's year-round growing season.",
      svc3_t: "Debris & Junk Removal",
      svc3_d: "Yard debris, old furniture, and clutter hauled away. You point, we lift, it's gone.",
      svc4_t: "Make-Ready Cleaning",
      svc4_d: "Turnover cleans that get rentals and listings guest-ready. Kitchens, baths, floors, and details.",
      svc5_t: "Handyman Services",
      svc5_d: "Small repairs and punch-list items done right the first time. One call handles the whole list.",
      from: "from", quote_link: "Get a quote",
      plans_kicker: "Subscriptions", plans_title: "Set it and forget it",
      plans_page_title: "Plans & bundles",
      plans_page_lead: "Recurring care at a locked-in rate, or bundle services together and save. No contracts. Cancel anytime.",
      plans_lead: "Recurring care at a locked-in rate. No contracts. Cancel anytime.",
      plan_choose: "Choose plan",
      plan_included_title: "What's included:",
      plan_signup_title: "Join the plan", plan_continue_pay: "Continue to secure payment",
      plan_notify_me: "Notify me when payment opens",
      plan_secure_note: "Secure checkout powered by Stripe. Cancel anytime.",
      plan_prefer_call: "Prefer to talk it through?", plan_call_us: "Call us",
      plan_success_msg: "You're on the list! We'll call you shortly to complete your plan signup and schedule your first visit.",
      lead_address_label: "Service address", lead_payment_label: "Payment",
      lead_payment_stripe: "Redirected to Stripe checkout", lead_payment_pending: "Online payment pending. Call to complete",
      ph_address: "Street address, Miami, FL", form_required: "Please fill in every field.",
      form_address: "Service address",
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
      no_match: "No match for", no_match_sub: "Tell us what you need. We probably do it.",
      call: "Call",
      work_kicker: "Our work", work_title: "Before & after",
      work_lead: "Real project photos are on the way.",
      before: "Before", after: "After",
      work_caption: "Project photos coming soon",
      work_caption_1: "Pressure Washing",
      work_caption_2: "Lawn Care",
      work_caption_3: "Debris & Junk Removal",
      reviews_kicker: "Reviews", reviews_title: "What our customers say",
      reviews_empty: "Real work, real customers. Here's what they say.",
      example_tag: "Example",
      sample_review_1: "\"My driveway looks brand new. They showed up on time and the price was exactly what they quoted.\"",
      sample_name_1: "Maria R.", sample_service_1: "Pressure Washing",
      sample_review_2: "\"The yard has never looked this good. Booking took two minutes and the crew was professional.\"",
      sample_name_2: "James T.", sample_service_2: "Lawn Care",
      sample_review_3: "\"They hauled away years of junk in one afternoon. Fair price, no hassle.\"",
      sample_name_3: "Denise W.", sample_service_3: "Debris & Junk Removal",
      review_google: "Review on Google", review_facebook: "Review on Facebook",
      review_thumbtack: "Review on Thumbtack",
      about_kicker: "Our Miami roots", about_title: "Miami-Dade is home. We treat it like family.",
      about_p1: "PrimeGuard Preservation was born right here in Miami-Dade. Palm trees, golden hour, and all. We're your neighbors, and we built this company on a simple idea: the work should be excellent, the price should be clear, and you should never have to wonder what happened while you were away.",
      about_caption: "Miami-Dade is home.",
      about_p2: "Every visit is handled by a vetted professional and documented with before-and-after photos, so you see exactly what your money bought. Homeowners, landlords, and property managers across the county trust us with the details that keep a property looking sharp.",
      about_li1: "Background-checked, vetted pros on every job",
      about_li2: "Before-and-after photo documentation, every visit",
      about_li3: "Upfront pricing. Approved by you before work begins",
      about_li4: "One call for five services, across Miami-Dade County",
      gov_kicker: "Public sector", gov_title: "Government & institutional contracting",
      gov_lead: "PrimeGuard Preservation LLC is a SAM.gov-registered federal contractor. We bring our commercial property-services discipline. Vetted crews, photo documentation, upfront pricing. To government facilities work, and we are ready to bid as a prime or support primes as a subcontractor.",
      gov_card1_t: "Registered & ready",
      gov_note: "Active SAM.gov registration. Capability statement available on request.",
      gov_card2_t: "Capability areas",
      gov_li1: "Grounds & facilities maintenance", gov_li2: "Janitorial services",
      gov_li3: "Property preservation", gov_li4: "Debris removal",
      gov_cta_p: "Contracting officers and facility managers: tell us about your requirement.",
      email_word: "Email",
      contact_kicker: "Get in touch", contact_title: "Request service",
      contact_lead: "Call, email, or send the form. We reply during business hours.",
      exit_kicker: "Before you go", exit_title: "Wait, don't leave yet!",
      exit_sub: "Get a free estimate in under 60 seconds, and we will prioritize your booking.",
      exit_name_ph: "Your name", exit_phone_ph: "Phone number",
      exit_cta: "Get my free estimate", exit_dismiss: "No thanks, I will pay full price",
      exit_done_t: "You're in!", exit_done_s: "We'll call you shortly with your free estimate.",
      announce: "Limited slots this week. Get your free estimate today.",
      est_kicker: "Instant estimate", est_title: "What will it cost?",
      est_lead: "Pick a service and a size for a ballpark figure in seconds.",
      est_service: "Service", est_size: "Size",
      est_s: "Small", est_m: "Medium", est_l: "Large",
      est_result: "Your ballpark estimate",
      est_note: "Ballpark only. Your final quote is confirmed before we start. No surprises.",
      est_cta: "Get my exact quote",
      ba_hint: "Drag to compare",
      faq_kicker: "Questions", faq_title: "Before you ask",
      faq1_q: "Do I need to be home during the service?",
      faq1_a: "No. As long as we have access to the area, gates, and an outdoor water spigot if needed, we handle everything and send before & after photos.",
      faq2_q: "How fast can you come out?",
      faq2_a: "Most jobs are scheduled within 48 hours. Need it sooner? Call us and we will do our best to fit you in.",
      faq3_q: "What happens if it rains?",
      faq3_a: "We watch the forecast and reschedule outdoor work at no charge. You always know before we roll a truck.",
      faq4_q: "How do I pay?",
      faq4_a: "After the job is done and you are happy. We accept cards and cash. No deposits for most services.",
      faq5_q: "Are your pros vetted?",
      faq5_a: "Yes. Every tech is background-checked and trained on our checklist before touching your property.",
      faq6_q: "What if I am not happy with the work?",
      faq6_a: "Tell us within 48 hours and we will come back and make it right. Free. That is our promise.",
      gua_kicker: "Our promise", gua_title: "Love it, or we make it right.",
      gua_sub: "If anything isn't perfect, tell us within 48 hours and we'll come back and fix it. Free.",
      gua_cta: "Book risk-free",
      bun_kicker: "Bundle & save", bun_title: "Services that go together",
      bun_lead: "Combine services and save. One bundled price, one visit, and you approve everything before we start.",
      bun_cta: "Get bundle quote",
      ben1_t: "One bundled price", ben1_d: "Combine services into a single quote and save compared to booking each one separately.",
      ben2_t: "One visit, everything done", ben2_d: "Our crew tackles the yard, the exterior, and the fix-it list in the same trip. Less disruption, faster results.",
      ben3_t: "You approve first", ben3_d: "Every bundle price is confirmed with you before we schedule anything. No surprises, ever.",
      plan_modal_kicker: "You're one step away",
      plan_trust_1: "Secure Stripe checkout", plan_trust_2: "Cancel anytime", plan_trust_3: "Vetted pros",
      bb_title: "Or build your own bundle",
      bb_lead: "Pick the services you need. Your price updates live. No phone call needed.",
      bb_total: "Estimated total", bb_continue: "Continue",
      bb_note: "Final quote confirmed before we start. No surprises.",
      plan_tag_popular: "Most popular",
      plan_per_visit_1: "Biweekly visits · billed monthly",
      plan_save_1: "Members save on every visit",
      plan_save_2: "You save $20 vs one-time ($169)",
      plan_save_3: "You save $6/mo",
      plan_modal_per_1: "Biweekly visits · billed monthly",
      plan_modal_per_2: "Per visit · auto-scheduled every 3 months",
      plan_modal_per_3: "One visit per month · billed monthly",
      plan_modal_note: "No payment due today. We confirm your start date first.",
      plan_members: "Plan members save on every visit. Cancel anytime.",
      bb_subtotal: "Subtotal",
      bb_discount: "Bundle discount",
      bb_you_save: "You save",
      bb_best_value: "Best value",
      bb_combo_tag: "Most-booked combo",
      bb_unlock15: "Add 1 more service to unlock 15% off",
      ord_kicker: "Almost done", ord_title: "Your order",
      ord_date: "Preferred date",
      ord_notes_ph: "Anything we should know?",
      ord_submit: "Place my order",
      ord_secure: "No payment due today. We confirm your final price before any work begins.",
      ord_done_t: "Order received!",
      ord_done_s: "Your ticket is in the system. We will call you shortly to confirm your price and schedule.",
      ord_ref: "Reference",
      ord_err: "Please fill in your name, phone, and address.",
      ref_kicker: "Refer & earn", ref_title: "Give $20, get $20",
      ref_lead: "Know someone who needs property care? Share your personal code. They get $20 off their first service, and you get a $20 credit after their job is done.",
      ref_name: "Your name", ref_gen: "Get my code",
      ref_your_code: "Your code", ref_copy: "Copy", ref_copied: "Copied!",
      ref_how: "They just mention your code in the quote form. That is all it takes.",
      ref_step1_t: "Get your code",
      ref_step1_d: "Type your name below and generate your personal referral code. It is yours to keep.",
      ref_step2_t: "Share it",
      ref_step2_d: "Text it to a neighbor, post it in your group chat, mention it over the fence. However you share, it works.",
      ref_step3_t: "You both get $20",
      ref_step3_d: "They mention your code in the quote form and get $20 off their first service. After their job is done, you get a $20 credit.",
      ref_cta: "Get a free quote",
      ref_need_name: "Enter your name first.", ref_gen_again: "Get a new code",
      vendors_kicker: "Partner with us", vendors_title: "Steady work for your crew",
      vendors_lead: "We bring in the customers and handle scheduling and billing. Your crew does the work you are already good at. Every job comes with a written work order, and you get paid per job completed.",
      vendors_step1_t: "Register", vendors_step1_d: "Fill out the form below. It takes two minutes and puts you in our system.",
      vendors_step2_t: "Get work orders", vendors_step2_d: "We send jobs your way with a written work order spelling out the scope and your pay before you start.",
      vendors_step3_t: "Do the work", vendors_step3_d: "Show up, do great work, and send before-and-after photos when you are done.",
      vendors_step4_t: "Get paid per job completed", vendors_step4_d: "No chasing invoices, no waiting 30 days. Send before-and-after photos, we verify the work and confirm with the customer, and you get paid.",
      vendors_note: "No fees to join. No cost to you. We make our money on the customer side.",
      vendors_signup: "Sign up as a vendor",
      info_phone: "Phone", info_email: "Email", info_hours: "Hours", info_area: "Service area",
      call_now: "Call now", chat_team: "Chat with our team",
      form_title: "Get a fast quote", form_name: "Full name", form_phone: "Phone",
      form_email: "Email", form_service: "Service needed", choose_service: "Choose a service",
      opt_else: "Something else", form_details: "Details",
      ph_name: "Your name", ph_details: "Tell us about the job. Size, location, timing.",
      send_request: "Send request",
      form_note_mailto: "This opens your email app with the request ready to send. No account needed.",
      form_note_api: "We reply during business hours. Usually the same day.",
      form_success: "Thanks! We'll call you shortly.",
      form_error: "Something went wrong sending your request. Please call us instead.",
      footer_rights: "All rights reserved.",
      booking_title: "Book your service",
      booking_soon: "Online booking coming soon. Call us at",
      close: "Close",
      login: "Log in", login_aria: "Log in to your account", my_account: "My account",
      auth_title_login: "Welcome back", auth_title_signup: "Create your account",
      profile_hello: "Hi",
      profile_my_account: "My account dashboard", profile_admin: "Admin dashboard",
      auth_choose_title: "Who's logging in?",
      auth_choose_customer: "I'm a customer", auth_choose_vendor: "I'm a vendor",
      auth_choose_customer_desc: "Track requests & jobs", auth_choose_vendor_desc: "Work orders, quotes & pay",
      auth_choose_sub: "Pick your portal to continue.",
      auth_tab_login: "Log in", auth_tab_signup: "Sign up",
      auth_email: "Email", auth_password: "Password",
      auth_submit_login: "Log in", auth_submit_signup: "Create account",
      auth_or: "or", auth_google: "Continue with Google",
      auth_error_default: "Something went wrong. Please try again.",
      auth_error_credential: "Email or password didn't match. Try again.",
      auth_error_inuse: "That email already has an account. Log in instead.",
      auth_error_weak: "Password needs at least 6 characters.",
      auth_error_email: "That email address doesn't look right.",
      auth_error_many: "Too many attempts. Try again in a few minutes.",
      auth_error_popup: "The sign-in window was blocked. Allow popups and try again.",
      auth_soon_title: "Accounts are coming soon",
      auth_soon_body: "We're putting the finishing touches on customer accounts. You can still request service as a guest. No account needed.",
      profile_title: "My profile",
      profile_name: "Full name", profile_phone: "Phone",
      profile_address: "Service address", ph_address: "Street, city, ZIP",
      profile_service: "Preferred service", profile_none: "No preference",
      profile_save: "Save", profile_saved: "Saved.",
      profile_save_error: "Couldn't save. Check your connection and try again.",
      profile_logout: "Log out"
    },
    es: {
      page_title: "PrimeGuard Preservation LLC. Servicios de propiedad en Miami-Dade",
      meta_desc: "Lavado a presión, cuidado del césped, retiro de escombros, limpieza pre-entrega y reparaciones en todo el condado de Miami-Dade. Además de contratación federal registrada en SAM.gov. Precios claros y evidencia fotográfica en cada visita.",
      nav_services: "Servicios", nav_work: "Trabajos", nav_reviews: "Reseñas",
      nav_government: "Gobierno", nav_about: "Nosotros", nav_contact: "Contacto",
      nav_careers: "Empleos",
      nav_plans: "Planes", nav_referrals: "Referidos",
      nav_faq: "Preguntas",
      explore_kicker: "Explora PrimeGuard", explore_title: "Descubre más",
      explore_lead: "La versión corta vive en esta página. La historia completa vive en estas páginas.",
      ex_work_t: "Nuestro trabajo", ex_work_d: "Resultados de antes y después en trabajos reales.",
      ex_reviews_t: "Reseñas de clientes", ex_reviews_d: "Lo que Miami-Dade dice de nosotros.",
      ex_faq_t: "Preguntas", ex_faq_d: "Respuestas antes de que preguntes.",
      ex_plans_t: "Planes y paquetes", ex_plans_d: "Suscripciones y precios de paquetes.",
      ex_ref_t: "Refiere y gana", ex_ref_d: "Da $20, recibe $20.",
      ex_gov_t: "Gobierno", ex_gov_d: "Contratación y capacidades.",
      faq_lead: "¿Aún tienes curiosidad? Llámanos. Respondemos en horario laboral.",
      book_now: "Reservar ahora", lang_label: "Idioma",
      hero_kicker: "Condado de Miami-Dade · Servicios de propiedad",
      hero_title_a: "Cuidado de propiedades,", hero_title_b: "perfeccionado.",
      hero_sub: "Cinco servicios esenciales, una sola llamada inteligente. Profesionales verificados, precios claros y evidencia fotográfica en cada visita. En todo el condado de Miami-Dade.",
      search_ph: "¿Qué servicio necesita? Pruebe «césped»…",
      search_aria: "Buscar servicios", search_clear_aria: "Borrar búsqueda",
      chip_pressure: "Lavado a presión", chip_lawn: "Cuidado del césped", chip_junk: "Retiro de escombros",
      chip_makeready: "Pre-entrega", chip_handyman: "Reparaciones",
      strip1_t: "Profesionales verificados", strip1_s: "Cada técnico pasa verificación de antecedentes",
      promo_kicker: "Cotizaciones gratis", promo_title_a: "Aprovecha las", promo_title_b: "cotizaciones GRATIS",
      promo_sub: "Cada estimado es gratis y sin presión. Cuéntanos sobre tu proyecto y te responderemos con precios por adelantado, usualmente el mismo día.",
      promo_cta: "Obtener mi cotización gratis",
      strip2_t: "Evidencia fotográfica", strip2_s: "Fotos de antes y después en cada visita",
      strip3_t: "Precios por adelantado", strip3_s: "Usted aprueba el precio primero",
      strip4_t: "Raíces en Miami", strip4_s: "Nacidos y criados en Miami-Dade",
      svc_kicker: "Lo que hacemos", svc_title: "Servicios y precios",
      svc_lead: "Trabajo honesto a precios honestos. Confirmamos el presupuesto final antes de empezar. Sin sorpresas.",
      svc1_t: "Lavado a presión",
      svc1_d: "Entradas, aceras, patios y exteriores como nuevos. Años de suciedad, eliminados en una tarde.",
      svc2_t: "Cuidado del césped",
      svc2_d: "Corte, bordeado y limpieza con un horario confiable. Durante todo el año en el sur de la Florida.",
      svc3_t: "Retiro de escombros",
      svc3_d: "Retiramos escombros de jardín, muebles viejos y trastos. Usted señala, nosotros cargamos, y desaparece.",
      svc4_t: "Limpieza pre-entrega",
      svc4_d: "Limpiezas de entrega que dejan alquileres y propiedades listos para huéspedes. Cocinas, baños, pisos y detalles.",
      svc5_t: "Servicios de reparaciones",
      svc5_d: "Reparaciones menores y listas de pendientes, bien hechas desde la primera vez. Una llamada resuelve toda la lista.",
      from: "desde", quote_link: "Pida un presupuesto",
      plans_kicker: "Suscripciones", plans_title: "Prográmelo y olvídese",
      plans_lead: "Cuidado recurrente a precio fijo. Sin contratos: cancele cuando quiera.",
      plans_page_title: "Planes y paquetes",
      plans_page_lead: "Cuidado recurrente a precio fijo, o combine servicios y ahorre. Sin contratos: cancele cuando quiera.",
      plan_choose: "Elegir plan",
      plan_included_title: "Qué incluye:",
      plan_signup_title: "Únete al plan", plan_continue_pay: "Continuar al pago seguro",
      plan_notify_me: "Avísame cuando el pago esté listo",
      plan_secure_note: "Pago seguro con Stripe. Cancela cuando quieras.",
      plan_prefer_call: "¿Prefieres hablarlo?", plan_call_us: "Llámanos",
      plan_success_msg: "¡Estás en la lista! Te llamaremos pronto para completar tu registro y programar tu primera visita.",
      lead_address_label: "Dirección del servicio", lead_payment_label: "Pago",
      lead_payment_stripe: "Redirigido al pago de Stripe", lead_payment_pending: "Pago en línea pendiente. Llamar para completar",
      ph_address: "Dirección, Miami, FL", form_required: "Completa todos los campos.",
      form_address: "Dirección del servicio",
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
      no_match: "Sin resultados para", no_match_sub: "Díganos lo que necesita. Probablemente lo hacemos.",
      call: "Llamar",
      work_kicker: "Nuestro trabajo", work_title: "Antes y después",
      work_lead: "Las fotos reales de nuestros proyectos están en camino.",
      before: "Antes", after: "Después",
      work_caption: "Fotos del proyecto próximamente",
      work_caption_1: "Lavado a presión",
      work_caption_2: "Cuidado del césped",
      work_caption_3: "Remoción de escombros",
      reviews_kicker: "Reseñas", reviews_title: "Lo que dicen nuestros clientes",
      reviews_empty: "Trabajo real, clientes reales. Esto es lo que dicen.",
      example_tag: "Ejemplo",
      sample_review_1: "\"Mi entrada parece nueva. Llegaron puntuales y el precio fue exactamente el cotizado.\"",
      sample_name_1: "Maria R.", sample_service_1: "Lavado a presión",
      sample_review_2: "\"El jardín nunca se había visto tan bien. Reservar tomó dos minutos y el equipo fue profesional.\"",
      sample_name_2: "James T.", sample_service_2: "Cuidado del césped",
      sample_review_3: "\"Se llevaron años de trastos en una tarde. Precio justo, sin complicaciones.\"",
      sample_name_3: "Denise W.", sample_service_3: "Remoción de escombros",
      review_google: "Reseña en Google", review_facebook: "Reseña en Facebook",
      review_thumbtack: "Reseña en Thumbtack",
      about_kicker: "Nuestras raíces en Miami", about_title: "Miami-Dade es nuestro hogar. Lo tratamos como familia.",
      about_p1: "PrimeGuard Preservation nació aquí mismo en Miami-Dade. Palmeras, hora dorada y todo. Somos sus vecinos, y construimos esta empresa sobre una idea simple: el trabajo debe ser excelente, el precio debe ser claro, y usted nunca debería preguntarse qué pasó mientras estaba fuera.",
      about_caption: "Miami-Dade es nuestro hogar.",
      about_p2: "Cada visita la realiza un profesional verificado y se documenta con fotos de antes y después, para que vea exactamente en qué se invirtió su dinero. Propietarios, arrendadores y administradores de propiedades en todo el condado nos confían los detalles que mantienen una propiedad impecable.",
      about_li1: "Profesionales verificados con antecedentes comprobados en cada trabajo",
      about_li2: "Documentación fotográfica de antes y después, en cada visita",
      about_li3: "Precios por adelantado. Aprobados por usted antes de empezar",
      about_li4: "Una llamada para cinco servicios, en todo el condado de Miami-Dade",
      gov_kicker: "Sector público", gov_title: "Contratación gubernamental e institucional",
      gov_lead: "PrimeGuard Preservation LLC es un contratista federal registrado en SAM.gov. Aplicamos nuestra disciplina comercial en servicios de propiedad. Equipos verificados, documentación fotográfica, precios por adelantado. Al trabajo en instalaciones gubernamentales, y estamos listos para licitar como contratista principal o apoyar a contratistas principales como subcontratistas.",
      gov_card1_t: "Registrados y listos",
      gov_note: "Registro activo en SAM.gov. Declaración de capacidades disponible a solicitud.",
      gov_card2_t: "Áreas de capacidad",
      gov_li1: "Mantenimiento de terrenos e instalaciones", gov_li2: "Servicios de limpieza",
      gov_li3: "Preservación de propiedades", gov_li4: "Retiro de escombros",
      gov_cta_p: "Oficiales de contratación y gerentes de instalaciones: cuéntenos sobre su requerimiento.",
      email_word: "Correo electrónico",
      contact_kicker: "Contáctenos", contact_title: "Solicite un servicio",
      contact_lead: "Llámenos, escríbanos o envíe el formulario. Respondemos en horario de oficina.",
      exit_kicker: "Antes de irse", exit_title: "¡Espere, no se vaya todavía!",
      exit_sub: "Reciba un estimado gratis en menos de 60 segundos, y priorizaremos su reserva.",
      exit_name_ph: "Su nombre", exit_phone_ph: "Número de teléfono",
      exit_cta: "Quiero mi estimado gratis", exit_dismiss: "No gracias, pagaré el precio completo",
      exit_done_t: "¡Listo!", exit_done_s: "Le llamaremos en breve con su estimado gratis.",
      announce: "Cupos limitados esta semana. Pida su estimado gratis hoy.",
      est_kicker: "Estimado instantáneo", est_title: "¿Cuánto costará?",
      est_lead: "Elija un servicio y un tamaño para un estimado aproximado en segundos.",
      est_service: "Servicio", est_size: "Tamaño",
      est_s: "Pequeño", est_m: "Mediano", est_l: "Grande",
      est_result: "Su estimado aproximado",
      est_note: "Solo aproximado. Su precio final se confirma antes de empezar. Sin sorpresas.",
      est_cta: "Quiero mi precio exacto",
      ba_hint: "Arrastre para comparar",
      faq_kicker: "Preguntas", faq_title: "Antes de preguntar",
      faq1_q: "¿Necesito estar en casa durante el servicio?",
      faq1_a: "No. Siempre que tengamos acceso al área, los portones y la llave de agua exterior si es necesario, nos encargamos de todo y le enviamos fotos del antes y después.",
      faq2_q: "¿Qué tan rápido pueden venir?",
      faq2_a: "La mayoría de los trabajos se programan en 48 horas. ¿Lo necesita antes? Llámenos y haremos lo posible por atenderle.",
      faq3_q: "¿Qué pasa si llueve?",
      faq3_a: "Vigilamos el pronóstico y reprogramamos el trabajo exterior sin costo. Usted siempre lo sabrá antes de que salgamos.",
      faq4_q: "¿Cómo pago?",
      faq4_a: "Después del trabajo, cuando usted esté satisfecho. Aceptamos tarjetas y efectivo. Sin depósitos en la mayoría de los servicios.",
      faq5_q: "¿Su personal está verificado?",
      faq5_a: "Sí. Cada técnico pasa verificación de antecedentes y capacitación antes de tocar su propiedad.",
      faq6_q: "¿Qué pasa si no quedo satisfecho?",
      faq6_a: "Avísenos en 48 horas y regresaremos a corregirlo. Gratis. Esa es nuestra promesa.",
      gua_kicker: "Nuestra promesa", gua_title: "Le encantará, o lo corregimos.",
      gua_sub: "Si algo no queda perfecto, avísenos en 48 horas y regresaremos a corregirlo. Gratis.",
      gua_cta: "Reserve sin riesgo",
      bun_kicker: "Combine y ahorre", bun_title: "Servicios que van juntos",
      bun_lead: "Combine servicios y ahorre. Un solo precio, una sola visita, y usted aprueba todo antes de empezar.",
      ben1_t: "Un solo precio", ben1_d: "Combine servicios en un estimado único y ahorre en comparación con reservarlos por separado.",
      ben2_t: "Una visita, todo listo", ben2_d: "Nuestro equipo se encarga del jardín, el exterior y las reparaciones en el mismo viaje. Menos interrupciones, resultados más rápidos.",
      ben3_t: "Usted aprueba primero", ben3_d: "Cada precio se confirma con usted antes de programar nada. Sin sorpresas, nunca.",
      bun_cta: "Pedir precio del paquete",
      bun1_t: "Combo de Atractivo Exterior", bun1_s: "Corte de césped + Lavado a presión",
      bun1_d: "El golpe doble para un atractivo instantáneo. Líneas frescas, entrada impecable.",
      bun2_t: "Paquete de Entrega", bun2_s: "Retiro de escombros + Limpieza",
      bun2_d: "De desordenado a listo para huéspedes en días. Lo despejamos y lo dejamos brillar.",
      bun3_t: "Renovación Total", bun3_s: "Césped + Lavado a presión + Reparaciones",
      bun3_d: "Todo resuelto en una visita. Patio, exterior y la lista de reparaciones. Listo.",
      plan_modal_kicker: "Estás a un paso",
      plan_trust_1: "Pago seguro con Stripe", plan_trust_2: "Cancele cuando quiera", plan_trust_3: "Personal verificado",
      bb_title: "O arme su propio paquete",
      bb_lead: "Elija los servicios que necesita. Su precio se actualiza en vivo. Sin llamadas.",
      bb_total: "Total estimado", bb_continue: "Continuar",
      bb_note: "Precio final confirmado antes de empezar. Sin sorpresas.",
      plan_tag_popular: "El más popular",
      plan_per_visit_1: "Visitas cada dos semanas · facturación mensual",
      plan_save_1: "Los miembros ahorran en cada visita",
      plan_save_2: "Ahorras $20 vs el precio único ($169)",
      plan_save_3: "Ahorras $6/mes",
      plan_modal_per_1: "Visitas cada dos semanas · facturación mensual",
      plan_modal_per_2: "Por visita · programado automáticamente cada 3 meses",
      plan_modal_per_3: "Una visita por mes · facturación mensual",
      plan_modal_note: "Sin pago hoy. Primero confirmamos tu fecha de inicio.",
      plan_members: "Los miembros del plan ahorran en cada visita. Cancela cuando quieras.",
      bb_subtotal: "Subtotal",
      bb_discount: "Descuento del paquete",
      bb_you_save: "Ahorras",
      bb_best_value: "Mejor valor",
      bb_combo_tag: "La combinación más pedida",
      bb_unlock15: "Agrega 1 servicio más para desbloquear el 15% de descuento",
      ord_kicker: "Casi listo", ord_title: "Su pedido",
      ord_date: "Fecha preferida",
      ord_notes_ph: "¿Algo que debamos saber?",
      ord_submit: "Hacer mi pedido",
      ord_secure: "Sin pago hoy. Confirmamos su precio final antes de empezar.",
      ord_done_t: "¡Pedido recibido!",
      ord_done_s: "Su ticket está en el sistema. Le llamaremos en breve para confirmar precio y horario.",
      ord_ref: "Referencia",
      ord_err: "Complete su nombre, teléfono y dirección.",
      ref_kicker: "Refiera y gane", ref_title: "Regale $20, gane $20",
      ref_lead: "¿Conoce a alguien que necesite cuidado de propiedad? Comparta su código personal. Ellos reciben $20 de descuento en su primer servicio y usted recibe $20 de crédito cuando terminen su trabajo.",
      ref_name: "Su nombre", ref_gen: "Obtener mi código",
      ref_your_code: "Su código", ref_copy: "Copiar", ref_copied: "¡Copiado!",
      ref_how: "Solo mencionan su código en el formulario. Así de fácil.",
      ref_step1_t: "Obtenga su código",
      ref_step1_d: "Escriba su nombre abajo y genere su código personal de referido. Es suyo para siempre.",
      ref_step2_t: "Compártalo",
      ref_step2_d: "Envíelo por texto a un vecino, publíquelo en su chat grupal, menciónelo. Como lo comparta, funciona.",
      ref_step3_t: "Ambos reciben $20",
      ref_step3_d: "Ellos mencionan su código en el formulario y reciben $20 de descuento en su primer servicio. Después de su trabajo, usted recibe un crédito de $20.",
      ref_cta: "Obtenga un estimado gratis",
      ref_need_name: "Ingrese su nombre primero.", ref_gen_again: "Obtener un código nuevo",
      vendors_kicker: "Asóciese con nosotros", vendors_title: "Trabajo constante para su equipo",
      vendors_lead: "Nosotros conseguimos los clientes y manejamos la programación y la facturación. Su equipo hace el trabajo que ya sabe hacer. Cada trabajo incluye una orden escrita, y le pagamos por trabajo completado.",
      vendors_step1_t: "Regístrese", vendors_step1_d: "Complete el formulario a continuación. Toma dos minutos y lo pone en nuestro sistema.",
      vendors_step2_t: "Reciba órdenes de trabajo", vendors_step2_d: "Le enviamos trabajos con una orden escrita que detalla el alcance y su pago antes de empezar.",
      vendors_step3_t: "Haga el trabajo", vendors_step3_d: "Preséntese, haga un excelente trabajo y envíe fotos del antes y después al terminar.",
      vendors_step4_t: "Cobro por trabajo completado", vendors_step4_d: "Sin perseguir facturas, sin esperar 30 días. Envíe fotos del antes y después, verificamos el trabajo y confirmamos con el cliente, y le pagamos.",
      vendors_note: "Sin cargos para unirse. Sin costo para usted. Nosotros ganamos por el lado del cliente.",
      vendors_signup: "Regístrese como proveedor",
      info_phone: "Teléfono", info_email: "Correo electrónico", info_hours: "Horario", info_area: "Área de servicio",
      call_now: "Llamar ahora", chat_team: "Chatear con nuestro equipo",
      form_title: "Obtenga un presupuesto rápido", form_name: "Nombre completo", form_phone: "Teléfono",
      form_email: "Correo electrónico", form_service: "Servicio necesario", choose_service: "Elija un servicio",
      opt_else: "Otro", form_details: "Detalles",
      ph_name: "Su nombre", ph_details: "Cuéntenos sobre el trabajo. Tamaño, ubicación, tiempo.",
      send_request: "Enviar solicitud",
      form_note_mailto: "Esto abre su aplicación de correo con la solicitud lista para enviar. No necesita cuenta.",
      form_note_api: "Respondemos en horario de oficina, normalmente el mismo día.",
      form_success: "¡Gracias! Le llamaremos en breve.",
      form_error: "Hubo un problema al enviar su solicitud. Por favor llámenos.",
      footer_rights: "Todos los derechos reservados.",
      booking_title: "Reserve su servicio",
      booking_soon: "La reserva en línea llegará pronto. Llámenos al",
      close: "Cerrar",
      login: "Iniciar sesión", login_aria: "Inicie sesión en su cuenta", my_account: "Mi cuenta",
      auth_title_login: "Bienvenido de nuevo", auth_title_signup: "Cree su cuenta",
      profile_hello: "Hola",
      profile_my_account: "Panel de mi cuenta", profile_admin: "Panel de administración",
      auth_choose_title: "¿Quién inicia sesión?",
      auth_choose_customer: "Soy cliente", auth_choose_vendor: "Soy proveedor",
      auth_choose_customer_desc: "Sigue solicitudes y trabajos", auth_choose_vendor_desc: "Órdenes, cotizaciones y pagos",
      auth_choose_sub: "Elige tu portal para continuar.",
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
  } catch (e) { /* storage unavailable. Default EN */ }

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
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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

  /* ---------- Mobile hamburger menu ----------
     Wired by the standalone nav-drawer module at the bottom of this
     file (it must also run on the PWA-only pages, which skip this
     IIFE). Nothing to do here. */

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

  /* ---------- Hero search: smart filter + instant answers ---------- */
  var searchInput = document.getElementById("serviceSearch");
  var searchClear = document.getElementById("searchClear");
  var searchEmpty = document.getElementById("searchEmpty");
  var searchEmptyTerm = document.getElementById("searchEmptyTerm");
  var searchAnswer = document.getElementById("searchAnswer");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".service-card"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var hasSearch = !!(searchInput && cards.length);

  // Extra words each service should be found by (typos, synonyms, related jobs).
  var SEARCH_SYN = {
    "svc-pressure-washing": "power wash powerwash driveway concrete patio deck fence mold mildew grime house wash soft wash roof exterior",
    "svc-lawn-care": "landscaping landscaper landscape grass mow mowing lawncare turf sod edging weed weeds hedge hedges bush bushes trimming tree trees palm palms leaf leaves",
    "svc-junk-removal": "junk trash garbage haul hauling mattress appliance clutter cleanout dump eviction unwanted",
    "svc-make-ready": "cleaning clean cleaner maid turnover airbnb deep housekeeping",
    "svc-handyman": "repair fix install installation mount mounting drywall paint painting caulk plumbing leak faucet fan light fixture door patch"
  };

  // Common questions -> instant answers (shown when no service card matches).
  function searchAnswerFor(q) {
    var cfg = window.SITE_CONFIG || {};
    var H = cfg.hours || "", A = cfg.serviceArea || "";
    if (/\b(how much|howmuch|price|cost|costing|pricing|cheap|expensive|rate|rates|quote)\b/.test(q))
      return { t: "What does it cost?", d: "Most visits run $45\u2013$339 depending on the service and size. Get your ballpark in seconds:", link: "quote.html", cta: "Get my instant quote" };
    if (/\b(where|area|areas|serve|serving|location|located|near|nearby|city|cities)\b/.test(q))
      return { t: "Where we work", d: "We serve " + A + " \u2014 Kendall, Miami, Homestead, Hialeah, Cutler Bay and nearby neighborhoods." };
    if (/\b(when|hours|open|close|closing|schedule|availability|available|appointment|book|booking)\b/.test(q))
      return { t: "Hours & booking", d: "We are open " + H + ". Request anytime and we will confirm your free quote fast.", link: "#contact", cta: "Get my free quote" };
    if (/\b(who|about|company|licensed|insured|trust|review|reviews)\b/.test(q))
      return { t: "Who is PrimeGuard?", d: "PrimeGuard Preservation LLC \u2014 Miami's black-and-gold standard for lawn care, pressure washing, junk removal, make-ready cleaning, and handyman work.", link: "#about", cta: "More about us" };
    return null;
  }

  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  function cardMatches(hayWords, toks) {
    return toks.some(function (t) {
      return hayWords.some(function (w) {
        return w === t || w === t + "s" || t === w + "s" ||
          (t.length >= 4 && (w.indexOf(t) === 0 || t.indexOf(w) === 0));
      });
    });
  }

  function applyFilter(term) {
    var q = normalize(term);
    var toks = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    var visible = 0;
    cards.forEach(function (card) {
      var hay = (normalize(card.getAttribute("data-name")) + " " +
        normalize(card.getAttribute("data-desc")) + " " +
        normalize(SEARCH_SYN[card.id] || "")).split(/\s+/).filter(Boolean);
      var match = !q || cardMatches(hay, toks);
      card.classList.toggle("hidden", !match);
      if (match) visible++;
    });
    var empty = visible === 0 && !!q;
    searchEmpty.hidden = !empty;
    if (empty) {
      searchEmptyTerm.textContent = term;
      var ans = searchAnswerFor(q);
      if (searchAnswer) {
        if (ans) {
          searchAnswer.innerHTML = "";
          var h = document.createElement("h4"); h.textContent = ans.t;
          var p = document.createElement("p"); p.textContent = ans.d;
          searchAnswer.appendChild(h); searchAnswer.appendChild(p);
          if (ans.link) {
            var a = document.createElement("a");
            a.className = "btn btn-gold"; a.href = ans.link; a.textContent = ans.cta;
            searchAnswer.appendChild(a);
          }
          searchAnswer.hidden = false;
        } else { searchAnswer.hidden = true; }
      }
    }
    searchClear.hidden = !q;
    chips.forEach(function (chip) {
      chip.classList.toggle("active", q !== "" && normalize(chip.getAttribute("data-chip")) === q);
    });
    return visible;
  }

  if (hasSearch) {
    searchInput.addEventListener("input", function () {
      applyFilter(searchInput.value);
    });

    if (searchClear) searchClear.addEventListener("click", function () {
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
  }

  /* ---------- Quote form -> lead POST (or mailto fallback) ---------- */
  var form = document.getElementById("quoteForm");
  var formStatus = document.getElementById("formStatus");
  var formNote = document.getElementById("formNote");
  var leadEndpoint = (cfg.leadEndpoint || "").trim();
  var hasQuoteForm = !!(form && formStatus && formNote);

  function renderFormNote() {
    if (!formNote) return;
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
    var subject = "Service request: " + lead.service + ". " + lead.name;
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

  if (hasQuoteForm) form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearFormStatus();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var els = form.elements;
    // Honeypot: bots fill it, humans never see it. Silently "succeed".
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
      referralCode: (els.referrer && els.referrer.value.trim()) || "",
      language: currentLang,
      timestamp: new Date().toISOString(),
      source: "primeguard-site",
      uid: currentUser ? currentUser.uid : null
    };

    // Mirror to the customer's account so it shows in their dashboard.
    if (currentUser && firebaseUsable() && fbDb) {
      fbDb.collection("service_requests").add({
        uid: currentUser.uid,
        name: lead.name, phone: lead.phone, email: lead.email,
        service: lead.service, message: lead.message,
        referralCode: lead.referralCode,
        status: "new", source: "primeguard-site",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () { /* the lead sheet is the primary record */ });
    }

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

  if (hasQuoteForm) renderFormNote();

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
    openPlanModal(i);
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
  var hasBooking = !!(modal && modalClose && bookingTitle && bookingBody);

  function bookingUrlValid() {
    var u = (cfg.bookingUrl || "").trim();
    return !!u && u !== "#";
  }

  function renderBooking() {
    if (!hasBooking) return;
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
    if (!hasBooking) return;
    renderBooking();
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeBooking() {
    if (!hasBooking) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  document.querySelectorAll("[data-book-open]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      openBooking();
    });
  });
  if (hasBooking) {
    modalClose.addEventListener("click", closeBooking);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeBooking();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeBooking();
    });
  }

  /* ---------- Plan signup modal ---------- */
  var planModal = document.getElementById("planModal");
  var planClose = document.getElementById("planClose");
  var planSummaryName = document.getElementById("planSummaryName");
  var planSummaryPrice = document.getElementById("planSummaryPrice");
  var planSummaryDesc = document.getElementById("planSummaryDesc");
  var planSummaryWas = document.getElementById("planSummaryWas");
  var planSummarySave = document.getElementById("planSummarySave");
  var planSummaryPer = document.getElementById("planSummaryPer");
  var PLAN_WAS = ["", "", "$65"];
  var planForm = document.getElementById("planForm");
  var planFormError = document.getElementById("planFormError");
  var planPayBtn = document.getElementById("planPayBtn");
  var planSuccess = document.getElementById("planSuccess");
  var signupPlan = -1;

  function stripeLinks() {
    return Array.isArray(cfg.stripeLinks) ? cfg.stripeLinks : [];
  }
  function openPlanModal(i) {
    signupPlan = i;
    if (planSummaryName) planSummaryName.textContent = t("plan_name_" + (i + 1));
    if (planSummaryPrice) planSummaryPrice.textContent = (plans[i] && plans[i].price) || "";
    if (planSummaryDesc) planSummaryDesc.textContent = t("plan_desc_" + (i + 1));
    var was = PLAN_WAS[i] || "";
    if (planSummaryWas) { planSummaryWas.textContent = was; planSummaryWas.hidden = !was; }
    var saveTxt = t("plan_save_" + (i + 1));
    if (planSummarySave) {
      planSummarySave.textContent = saveTxt;
      planSummarySave.hidden = !saveTxt || saveTxt.indexOf("plan_save_") === 0;
    }
    if (planSummaryPer) planSummaryPer.textContent = t("plan_modal_per_" + (i + 1));
    var incList = document.getElementById("planSummaryInc");
    if (incList) {
      incList.innerHTML = "";
      ["a", "b", "c", "d"].forEach(function (sfx) {
        var txt = t("plan_inc_" + (i + 1) + sfx);
        if (txt && txt.indexOf("plan_inc_") !== 0) {
          var li = document.createElement("li");
          li.textContent = txt;
          incList.appendChild(li);
        }
      });
    }
    if (planForm) planForm.hidden = false;
    if (planSuccess) planSuccess.hidden = true;
    if (planFormError) planFormError.hidden = true;
    // If Stripe isn't wired yet, the pay button becomes a "notify me" signup.
    var link = (stripeLinks()[i] || "").trim();
    if (planPayBtn) {
      var label = planPayBtn.querySelector("span");
      if (label) label.textContent = link ? t("plan_continue_pay") : t("plan_notify_me");
    }
    if (planModal) {
      planModal.hidden = false;
      document.body.classList.add("modal-open");
    }
  }
  function closePlanModal() {
    if (planModal) planModal.hidden = true;
    document.body.classList.remove("modal-open");
  }
  if (planClose) planClose.addEventListener("click", closePlanModal);
  if (planModal) planModal.addEventListener("click", function (e) {
    if (e.target === planModal) closePlanModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && planModal && !planModal.hidden) closePlanModal();
  });
  if (planForm) planForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = planForm.elements.name.value.trim();
    var phone = planForm.elements.phone.value.trim();
    var email = planForm.elements.email.value.trim();
    var address = planForm.elements.address.value.trim();
    if (!name || !phone || !email || !address) {
      if (planFormError) {
        planFormError.textContent = t("form_required");
        planFormError.hidden = false;
      }
      return;
    }
    if (planFormError) planFormError.hidden = true;
    var link = (stripeLinks()[signupPlan] || "").trim();
    var msg = t("lead_plan_label") + ": " + t("plan_name_" + (signupPlan + 1)) +
      " (" + ((plans[signupPlan] && plans[signupPlan].price) || "") + ")\n" +
      t("lead_address_label") + ": " + address + "\n---\n" +
      t("lead_payment_label") + ": " + (link ? t("lead_payment_stripe") : t("lead_payment_pending"));
    var lead = {
      name: name, phone: phone, email: email, service: "",
      message: msg, language: currentLang,
      timestamp: new Date().toISOString(),
      source: "primeguard-site-plan",
      uid: currentUser ? currentUser.uid : null
    };
    function afterSave() {
      if (link) {
        var url = link + (link.indexOf("?") >= 0 ? "&" : "?") +
          "prefilled_email=" + encodeURIComponent(email);
        window.location.href = url;
      } else {
        planForm.hidden = true;
        if (planSuccess) planSuccess.hidden = false;
      }
    }
    if (!leadEndpoint) { mailtoFallback(lead); afterSave(); return; }
    fetch(leadEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(lead)
    }).then(afterSave).catch(afterSave);
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
    if (modal && !modal.hidden) renderBooking();
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
     SDK loaded via CDN (firebase-compat). See index.html.
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
  var authChoose = document.getElementById("authChoose");
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

  /* The nav drawer's closeMenu lives in its own IIFE at the bottom of
     this file and is NOT in scope here — openAuth()/openProfile()
     calling it threw a ReferenceError and the modal never opened
     (the real "Log in button does nothing" bug, caught in live
     verification 2026-10-15). This local version mirrors the drawer's
     close behavior defensively. */
  function closeMenu() {
    var nav = document.getElementById("mainNav");
    var toggle = document.getElementById("navToggle");
    var backdrop = document.getElementById("navBackdrop");
    if (nav) nav.classList.remove("open");
    if (toggle) {
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }
    if (backdrop) backdrop.classList.remove("show");
    document.body.classList.remove("nav-open");
  }

  function openAuth() {
    closeMenu();
    authError.hidden = true;
    if (!fbAuth) {
      authChoose.hidden = true;
      authMain.hidden = true;
      authSoon.hidden = false;
    } else {
      authSoon.hidden = true;
      authMain.hidden = true;
      authChoose.hidden = false;
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

  if (authTabLogin) authTabLogin.addEventListener("click", function () { setAuthMode("login"); });
  if (authTabSignup) authTabSignup.addEventListener("click", function () { setAuthMode("signup"); });

  if (authForm) authForm.addEventListener("submit", function (e) {
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

  if (authGoogle) authGoogle.addEventListener("click", function () {
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

  /* ----- Account menu ----- */
  var profileModal = document.getElementById("profileModal");
  var profLogout = document.getElementById("profLogout");
  var profileAdminLink = document.getElementById("profileAdminLink");
  var ADMIN_EMAIL = "edblucorp@gmail.com";

  function openProfile() {
    closeMenu();
    var nm = document.getElementById("profileMenuName");
    if (nm) nm.textContent = firstName();
    // Show the admin shortcut only to the owner and acquisition managers.
    if (profileAdminLink) {
      profileAdminLink.hidden = true;
      if (currentUser && fbDb) {
        if (currentUser.email === ADMIN_EMAIL) {
          profileAdminLink.hidden = false;
        } else {
          fbDb.collection("staff").doc(currentUser.uid).get().then(function (s) {
            if (s.exists && !profileModal.hidden) profileAdminLink.hidden = false;
          }).catch(function () {});
        }
      }
    }
    profileModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeProfile() {
    profileModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  if (profLogout) profLogout.addEventListener("click", function () {
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
      if (!authModal) { window.location.href = "/index.html#login"; return; }
      if (currentUser && fbAuth) openProfile();
      else openAuth();
    });
  });

  if (authModal) {
  document.getElementById("authClose").addEventListener("click", closeAuth);
  document.getElementById("authChooseCustomer").addEventListener("click", function () {
    authChoose.hidden = true;
    authSoon.hidden = true;
    authMain.hidden = false;
    setAuthMode("login");
  });
  document.getElementById("authChooseVendor").addEventListener("click", function () {
    window.location.href = "vendor-dashboard.html";
  });
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
  }

  // Landing on index.html#login (the Log in button on every other page sends
  // people here): open the auth UI only AFTER Firebase is initialized and the
  // first auth-state answer is in. Opening it earlier showed the "coming
  // soon" panel instead of the login, because fbAuth was still null.
  var loginHashPending = !!authModal && window.location.hash === "#login";
  function handleLoginHash(user) {
    if (!loginHashPending) return;
    loginHashPending = false;
    if (user) openProfile(); else openAuth();
  }

  if (initFirebase() && fbAuth) {
    fbAuth.onAuthStateChanged(function (user) {
      currentUser = user;
      userProfile = {};
      handleLoginHash(user);
      if (user && fbDb) {
        fbDb.collection("customers").doc(user.uid).get().then(function (doc) {
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
  } else if (loginHashPending) {
    // Firebase unreachable: still answer the #login landing with the modal.
    loginHashPending = false;
    openAuth();
  }

  /* ---------- Exit-intent popup ("don't leave yet") ---------- */
  (function exitIntent() {
    var modal = document.getElementById("exitModal");
    if (!modal) return;
    try { if (sessionStorage.getItem("pg_exit_shown")) return; } catch (e) {}
    var shown = false;
    function show() {
      if (shown) return; shown = true;
      try { sessionStorage.setItem("pg_exit_shown", "1"); } catch (e) {}
      modal.hidden = false;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function hide() {
      modal.classList.remove("open");
      modal.hidden = true;
      document.body.style.overflow = "";
    }
    // Desktop: cursor heading for the top edge (toward back button / tab close)
    document.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget && e.clientY <= 8) show();
    });
    // Mobile / no-mouse fallback: 60s timer, only after real scrolling
    var scrolled = false;
    window.addEventListener("scroll", function () {
      if (window.scrollY > 500) scrolled = true;
    }, { passive: true });
    setTimeout(function () { if (scrolled) show(); }, 60000);
    modal.querySelector(".exit-close").addEventListener("click", hide);
    modal.querySelector(".exit-dismiss").addEventListener("click", hide);
    modal.addEventListener("click", function (e) { if (e.target === modal) hide(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && shown) hide(); });
    document.getElementById("exitForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var name = f.exitName.value.trim(), phone = f.exitPhone.value.trim();
      if (!name || !phone) return;
      var lead = {
        name: name, phone: phone,
        service: "Exit-intent offer",
        message: "Exit-intent popup lead from " + location.pathname,
        source: "exit-intent-popup",
        uid: currentUser ? currentUser.uid : null
      };
      var done = function () {
        modal.querySelector(".exit-card").innerHTML =
          '<button class="exit-close" aria-label="Close" type="button">&times;</button>' +
          '<h3 class="grad-text">' + t("exit_done_t") + "</h3>" +
          '<p class="exit-sub">' + t("exit_done_s") + "</p>";
        modal.querySelector(".exit-close").addEventListener("click", hide);
      };
      if (leadEndpoint) {
        fetch(leadEndpoint, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(lead)
        }).then(done).catch(done);
      } else { done(); }
    });
  })();

  /* ---------- Before/after slider ---------- */
  (function beforeAfter() {
    var slider = document.getElementById("baSlider");
    if (!slider) return;
    var before = document.getElementById("baBefore");
    var handle = document.getElementById("baHandle");
    var dragging = false;
    function setPos(clientX) {
      var r = slider.getBoundingClientRect();
      var pct = ((clientX - r.left) / r.width) * 100;
      pct = Math.max(2, Math.min(98, pct));
      before.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
      handle.style.left = pct + "%";
    }
    slider.addEventListener("pointerdown", function (e) {
      dragging = true;
      slider.setPointerCapture(e.pointerId);
      setPos(e.clientX);
    });
    slider.addEventListener("pointermove", function (e) {
      if (dragging) setPos(e.clientX);
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      slider.addEventListener(ev, function () { dragging = false; });
    });
  })();

  /* ---------- Quote prefill from service-page calculator ---------- */
  (function quotePrefill() {
    var raw = null;
    try { raw = sessionStorage.getItem("pg_quote"); } catch (e) {}
    if (!raw) return;
    var q; try { q = JSON.parse(raw); } catch (e) { return; }
    try { sessionStorage.removeItem("pg_quote"); } catch (e) {}
    var svcSel = document.querySelector('select[name="service"]');
    var msg = document.querySelector('textarea[name="message"]');
    if (svcSel && q.service) {
      var found = Array.prototype.some.call(svcSel.options, function (o) { return o.value === q.service; });
      if (found) svcSel.value = q.service;
    }
    if (msg) {
      var line = "Instant estimate: $" + q.estimate + " " + (q.unit || "") +
        " (" + q.service + ", " + q.size + ", " + q.extra + "). Please confirm my exact quote.";
      if (msg.value.indexOf("Instant estimate:") === -1) {
        msg.value = line + (msg.value ? "\n\n" + msg.value : "");
      }
    }
  })();

  /* ---------- Instant estimator ---------- */
  (function estimator() {
    var svc = document.getElementById("estService");
    var size = document.getElementById("estSize");
    var out = document.getElementById("estPrice");
    if (!svc || !size || !out) return;
    // Ballpark figures derived from advertised starting prices; final quote confirmed before work.
    var PRICES = {
      pressure: [149, 189, 249],
      lawn: [45, 60, 80],
      junk: [89, 129, 189],
      makeready: [179, 229, 299],
      handyman: [65, 130, 260]
    };
    function render() {
      var p = (PRICES[svc.value] || PRICES.pressure)[parseInt(size.value, 10) || 0];
      out.textContent = "$" + p;
    }
    svc.addEventListener("change", render);
    size.addEventListener("change", render);
    render();
  })();

  /* ---------- Bundle builder + ticket order ---------- */
  (function bundleBuilder() {
    var items = document.querySelectorAll(".bb-item");
    var totalEl = document.getElementById("bbTotal");
    var contBtn = document.getElementById("bbContinue");
    if (!items.length || !totalEl || !contBtn) return;
    var SVC_NAMES = { lawn: "svc2_t", pressure: "svc1_t", junk: "svc3_t", makeready: "svc4_t", handyman: "svc5_t" };
    function selected() {
      var out = [];
      items.forEach(function (label) {
        var box = label.querySelector('input[type="checkbox"]');
        if (box && box.checked) {
          var price = parseFloat(box.getAttribute("data-bb-price")) || 0;
          var size = parseFloat(label.querySelector("[data-bb-size]").value) || 1;
          out.push({
            key: box.getAttribute("data-bb-svc"),
            name: t(SVC_NAMES[box.getAttribute("data-bb-svc")] || "svc1_t"),
            price: Math.round(price * size)
          });
        }
      });
      return out;
    }
    // Bundle discount (Edwin, 2026-10-15): 2 services = 10% off the
    // subtotal, 3+ = 15% off. Item prices stay the advertised ones.
    function discountPctFor(count) {
      return count >= 3 ? 15 : count === 2 ? 10 : 0;
    }
    function render() {
      var sel = selected();
      var subtotal = sel.reduce(function (a, b) { return a + b.price; }, 0);
      var pct = discountPctFor(sel.length);
      var discount = Math.round(subtotal * pct / 100);
      var total = subtotal - discount;
      totalEl.textContent = "$" + total;
      contBtn.disabled = !sel.length;
      var subEl = document.getElementById("bbSubtotal");
      if (subEl) subEl.textContent = "$" + subtotal;
      var discRow = document.getElementById("bbDiscRow");
      if (discRow) {
        discRow.hidden = !(pct > 0);
        if (pct > 0) {
          document.getElementById("bbDiscLabel").textContent = t("bb_discount") + " (" + pct + "%)";
          document.getElementById("bbDiscAmt").textContent = "-$" + discount;
        }
      }
      var saveEl = document.getElementById("bbSave");
      if (saveEl) {
        saveEl.hidden = !(discount > 0);
        if (discount > 0) {
          saveEl.textContent = t("bb_you_save") + " $" + discount +
            (sel.length >= 3 ? " · " + t("bb_best_value") : "");
        }
      }
      var nudgeEl = document.getElementById("bbNudge");
      if (nudgeEl) {
        nudgeEl.hidden = sel.length !== 2;
        if (sel.length === 2) nudgeEl.textContent = t("bb_unlock15");
      }
      var comboEl = document.getElementById("bbCombo");
      if (comboEl) {
        var keys = sel.map(function (i) { return i.key; });
        comboEl.hidden = !(keys.indexOf("lawn") >= 0 && keys.indexOf("pressure") >= 0);
      }
      return { sel: sel, subtotal: subtotal, discountPct: pct, discountAmount: discount, total: total };
    }
    items.forEach(function (label) {
      label.querySelectorAll("input, select").forEach(function (el) {
        el.addEventListener("change", render);
      });
    });
    render();

    // Order modal
    var modal = document.getElementById("orderModal");
    var orderLines = document.getElementById("orderLines");
    var orderTotal = document.getElementById("orderTotal");
    var orderSummaryLine = document.getElementById("orderSummaryLine");
    var form = document.getElementById("orderForm");
    var success = document.getElementById("orderSuccess");
    var errEl = document.getElementById("orderFormError");
    var refCode = document.getElementById("orderRefCode");
    var current = { sel: [], subtotal: 0, discountPct: 0, discountAmount: 0, total: 0 };
    function openOrder() {
      if (!modal) return;
      current = render();
      orderLines.innerHTML = "";
      current.sel.forEach(function (it) {
        var div = document.createElement("div");
        div.className = "order-line";
        var a = document.createElement("span"); a.textContent = it.name;
        var b = document.createElement("span"); b.textContent = "$" + it.price;
        div.appendChild(a); div.appendChild(b);
        orderLines.appendChild(div);
      });
      orderTotal.textContent = "$" + current.total;
      var oSub = document.getElementById("orderSubtotal");
      if (oSub) oSub.textContent = "$" + current.subtotal;
      var oDiscRow = document.getElementById("orderDiscRow");
      if (oDiscRow) {
        oDiscRow.hidden = !(current.discountPct > 0);
        if (current.discountPct > 0) {
          document.getElementById("orderDiscLabel").textContent = t("bb_discount") + " (" + current.discountPct + "%)";
          document.getElementById("orderDiscAmt").textContent = "-$" + current.discountAmount;
        }
      }
      var oSave = document.getElementById("orderSave");
      if (oSave) {
        oSave.hidden = !(current.discountAmount > 0);
        if (current.discountAmount > 0) {
          oSave.textContent = t("bb_you_save") + " $" + current.discountAmount +
            (current.sel.length >= 3 ? " · " + t("bb_best_value") : "");
        }
      }
      orderSummaryLine.textContent = current.sel.map(function (i) { return i.name; }).join(" + ");
      form.hidden = false; success.hidden = true; errEl.hidden = true;
      modal.hidden = false;
      document.body.classList.add("modal-open");
    }
    function closeOrder() {
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    }
    contBtn.addEventListener("click", openOrder);
    var closeBtn = document.getElementById("orderClose");
    if (closeBtn) closeBtn.addEventListener("click", closeOrder);
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeOrder(); });
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.name.value.trim(), phone = form.phone.value.trim(), address = form.address.value.trim();
      if (!name || !phone || !address) {
        errEl.textContent = t("ord_err"); errEl.hidden = false; return;
      }
      errEl.hidden = true;
      var ref = "PG-" + Date.now().toString(36).toUpperCase().slice(-6);
      var ticket = {
        type: "ticket-order", status: "new", ref: ref,
        items: current.sel, total: current.total,
        subtotal: current.subtotal, discountPct: current.discountPct, discountAmount: current.discountAmount,
        name: name, phone: phone, email: form.email.value.trim(),
        address: address, date: form.date.value.trim(), notes: form.notes.value.trim(),
        source: "bundle-builder", page: location.pathname,
        uid: currentUser ? currentUser.uid : null
      };
      // Mirror EVERY order to the admin's request feed (guest or not) so nothing is missed.
      if (firebaseUsable() && fbDb) {
        fbDb.collection("service_requests").add({
          uid: currentUser ? currentUser.uid : null,
          name: name, phone: phone, email: ticket.email,
          service: "Bundle order " + ref,
          message: current.sel.map(function (i) { return i.name + " $" + i.price; }).join("; ") +
            " | Subtotal $" + current.subtotal +
            (current.discountAmount > 0 ? " | Bundle discount " + current.discountPct + "% -$" + current.discountAmount : "") +
            " | Total $" + current.total + (ticket.notes ? " | Notes: " + ticket.notes : ""),
          status: "new", source: "bundle-builder", ref: ref,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () { /* the lead sheet is the primary record */ });
      }
      var done = function () {
        refCode.textContent = ref;
        form.hidden = true; success.hidden = false;
      };
      if (leadEndpoint) {
        fetch(leadEndpoint, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(ticket)
        }).then(done).catch(done);
      } else { done(); }
    });
  })();

  /* ---------- Referral code generator ---------- */
  (function referrals() {
    var nameInput = document.getElementById("refName");
    var genBtn = document.getElementById("refGen");
    var row = document.getElementById("refCodeRow");
    var codeEl = document.getElementById("refCode");
    var copyBtn = document.getElementById("refCopy");
    if (!genBtn || !nameInput) return;
    function makeCode(name) {
      var base = name.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
      var num = Math.floor(100 + Math.random() * 900);
      return base + "-" + num;
    }
    function showCode(code) {
      codeEl.textContent = code;
      row.hidden = false;
      if (copyBtn) copyBtn.textContent = t("ref_copy");
    }
    // Register the code so the owner is tracked (admin sees who owns which code).
    function registerCode(code, name) {
      try {
        if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) return;
        var db = firebase.firestore();
        var u = (typeof currentUser !== "undefined") ? currentUser : null;
        db.collection("referral_codes").add({
          code: code, name: name,
          uid: u ? u.uid : null, email: u && u.email ? u.email : null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () { /* registry is best-effort */ });
        if (u) db.collection("customers").doc(u.uid).set({ referralCode: code }, { merge: true }).catch(function () {});
      } catch (e) { /* never break the generator */ }
    }
    genBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.placeholder = t("ref_need_name");
        return;
      }
      var code = makeCode(name);
      showCode(code);
      registerCode(code, name);
    });
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var code = codeEl.textContent;
      function ok() { copyBtn.textContent = t("ref_copied"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(ok).catch(ok);
      } else { ok(); }
    });
    // Returning members see their existing code instead of making a new one.
    try {
      if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (u) {
          if (!u) return;
          firebase.firestore().collection("customers").doc(u.uid).get().then(function (d) {
            var c = d.exists && d.data().referralCode;
            if (c) {
              showCode(c);
              genBtn.textContent = t("ref_gen_again") || "Get a new code";
            }
          }).catch(function () {});
        });
      }
    } catch (e) {}
  })();

  /* ---------- Init ---------- */
  setupReviews();
  renderPlanPrices();
  if (!plans.length && plansSection) plansSection.style.display = "none";
  applyI18n();
})();

/* ============================================================
   Mobile nav drawer (hamburger -> left slide-over)
   ------------------------------------------------------------
   - The round gold-on-black toggle sits LEFT of the brand and
     opens #mainNav as a left drawer over a dimmed backdrop —
     the same pattern as LoraLedger and the admin dashboard.
   - Self-contained and deliberately OUTSIDE the main IIFE above:
     account.html and quote.html load site.js in PWA-only mode
     (the main IIFE returns early for them), and their hamburger
     must still work. account.js / vendor.js no longer wire the
     toggle themselves.
   - Pages without #navToggle / #mainNav (admin, vendor
     dashboard) simply skip everything below.
   ============================================================ */
(function () {
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("mainNav");
  if (!toggle || !nav) return;

  var backdrop = document.getElementById("navBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "navBackdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
  }

  function isOpen() { return nav.classList.contains("open"); }
  function openMenu() {
    nav.classList.add("open");
    toggle.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    backdrop.classList.add("show");
    document.body.classList.add("nav-open");
  }
  function closeMenu() {
    nav.classList.remove("open");
    toggle.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    backdrop.classList.remove("show");
    document.body.classList.remove("nav-open");
  }

  toggle.addEventListener("click", function () {
    if (isOpen()) closeMenu(); else openMenu();
  });
  backdrop.addEventListener("click", closeMenu);
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 1024) closeMenu();
  });
})();

/* ============================================================
   PWA: installable app (service worker + install experience)
   ------------------------------------------------------------
   - Registers /sw.js (see sw.js for the caching rules; staff and
     vendor surfaces are never intercepted there).
   - Captures Chrome's beforeinstallprompt and offers a one-tap
     install via a floating banner and the footer "Get the app"
     button (.pg-get-app). iOS has no install prompt, so there the
     buttons open a short "Add to Home Screen" instruction card.
   - Never shows install UI when the site is already running as
     the installed app, and respects a 30-day dismissal.
   - Path-aware: the vendor dashboard (/vendor-dashboard*) gets
     the "PrimeGuard Vendor" wording and its own install flow;
     admin pages get no install UI at all. The /sw.js
     registration below runs on every page regardless (it sits
     above the install-UI gate).
   - This block is intentionally self-contained and also runs on
     account.html / quote.html / vendor-dashboard.html, which
     load site.js in PWA-only mode (see the guard at the top).
   ============================================================ */
(function () {
  var LS_INSTALLED = "pg_app_installed";
  var LS_DISMISSED = "pg_install_dismissed";
  var DISMISS_MS = 30 * 24 * 60 * 60 * 1000; /* re-ask after 30 days */
  var path = window.location.pathname || "";
  var IS_ADMIN = path.indexOf("/admin") === 0;
  var IS_VENDOR = path.indexOf("/vendor-dashboard") === 0;
  /* Only staff (admin) surfaces are fully excluded from install UI.
     The vendor dashboard has its own app (vendor-manifest.webmanifest,
     start_url /vendor-dashboard.html) and gets vendor wording below
     via APP_NAME and the IS_VENDOR branch in the banner copy. */
  var EXCLUDED = IS_ADMIN;
  var APP_NAME = IS_VENDOR ? "PrimeGuard Vendor app" : "PrimeGuard app";

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) { /* ignore */ }
    return window.navigator.standalone === true;
  }
  function isInstalled() {
    return isStandalone() || lsGet(LS_INSTALLED) === "1";
  }
  function isIOS() {
    var ua = window.navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
    /* iPadOS 13+ reports as desktop Safari but has touch points. */
    return window.navigator.platform === "MacIntel" &&
           window.navigator.maxTouchPoints > 1;
  }
  function recentlyDismissed() {
    var t = parseInt(lsGet(LS_DISMISSED) || "0", 10);
    return t && (Date.now() - t) < DISMISS_MS;
  }

  /* ---------- Service worker registration ---------- */
  try {
    if ("serviceWorker" in window.navigator &&
        (window.location.protocol === "https:" ||
         window.location.hostname === "localhost" ||
         window.location.hostname === "127.0.0.1")) {
      window.addEventListener("load", function () {
        window.navigator.serviceWorker.register("/sw.js").catch(function () {
          /* Registration is progressive enhancement only. */
        });
      });
    }
  } catch (e) { /* never break the page over the app shell */ }

  if (EXCLUDED) return; /* No install UI on staff (admin) surfaces. */

  /* ---------- Install prompt capture ---------- */
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    window.setTimeout(maybeShowBanner, 1200);
  });
  window.addEventListener("appinstalled", function () {
    lsSet(LS_INSTALLED, "1");
    hideBanner();
    hideCard();
  });

  /* ---------- Styles (injected; scoped to .pg-app-*) ---------- */
  var css = [
    ".pg-app-banner{position:fixed;left:50%;bottom:16px;transform:translate(-50%,180%);width:min(560px,calc(100% - 24px));z-index:1200;display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:20px;background:linear-gradient(160deg,#1a1a1e,#0b0b0d 72%);border:1px solid rgba(212,168,67,.55);box-shadow:0 22px 50px rgba(0,0,0,.6),0 0 34px rgba(212,168,67,.16);color:#f5f1e6;font-family:Inter,system-ui,-apple-system,sans-serif;transition:transform .45s cubic-bezier(.22,1,.36,1);}",
    ".pg-app-banner.pg-show{transform:translate(-50%,0);}",
    ".pg-app-banner img{width:52px;height:52px;border-radius:13px;flex:none;box-shadow:0 0 0 1px rgba(212,168,67,.45);}",
    ".pg-app-txt{flex:1;min-width:0;font-size:.9rem;line-height:1.45;color:#e9e2cf;}",
    ".pg-app-txt strong{display:block;color:#ffd873;font-size:.99rem;margin-bottom:2px;font-family:Sora,Inter,system-ui,sans-serif;}",
    ".pg-app-btn{flex:none;background:linear-gradient(180deg,#ffd873,#dfa437);color:#241b07;font-weight:800;font-size:.9rem;border:none;border-radius:999px;padding:11px 20px;cursor:pointer;font-family:inherit;box-shadow:0 8px 22px rgba(255,190,80,.35);}",
    ".pg-app-x{flex:none;align-self:flex-start;background:none;border:none;color:#bfae8d;font-size:1.35rem;line-height:1;cursor:pointer;padding:2px 4px;font-family:inherit;}",
    "@media (max-width:640px){.pg-app-banner{left:12px;width:calc(100% - 96px);transform:translate(0,180%);}.pg-app-banner.pg-show{transform:translate(0,0);}}",
    ".pg-app-cardwrap{position:fixed;inset:0;z-index:1300;background:rgba(5,5,9,.68);display:flex;align-items:center;justify-content:center;padding:18px;}",
    ".pg-app-card{width:min(420px,100%);background:linear-gradient(165deg,#1a1a1e,#0e0e10);border:1px solid rgba(212,168,67,.5);border-radius:22px;padding:26px 24px;color:#f0e9d8;box-shadow:0 30px 80px rgba(0,0,0,.65);text-align:center;font-family:Inter,system-ui,-apple-system,sans-serif;}",
    ".pg-app-card img{width:64px;height:64px;border-radius:15px;margin-bottom:12px;box-shadow:0 0 0 1px rgba(212,168,67,.45);}",
    ".pg-app-card h3{color:#ffd873;margin:0 0 8px;font-size:1.2rem;font-family:Sora,Inter,system-ui,sans-serif;}",
    ".pg-app-card p{color:#d8cdb2;line-height:1.6;font-size:.94rem;margin:0 0 18px;}",
    ".pg-hide{display:none !important;}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Banner ---------- */
  var banner = null;
  function buildBanner() {
    if (banner) return banner;
    banner = document.createElement("div");
    banner.className = "pg-app-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Install the " + APP_NAME);
    banner.innerHTML =
      '<img src="/assets/icon-192.png" alt="PrimeGuard app icon">' +
      '<div class="pg-app-txt"><strong>Get the ' + APP_NAME + "</strong>" +
      (IS_VENDOR
        ? "Quote requests, jobs and updates right on your home screen.</div>"
        : "Track your requests, photos, quotes and updates, right from your home screen.</div>") +
      '<button type="button" class="pg-app-btn">Install app</button>' +
      '<button type="button" class="pg-app-x" aria-label="Not now">&times;</button>';
    banner.querySelector(".pg-app-btn").addEventListener("click", triggerInstall);
    banner.querySelector(".pg-app-x").addEventListener("click", function () {
      lsSet(LS_DISMISSED, String(Date.now()));
      hideBanner();
    });
    document.body.appendChild(banner);
    return banner;
  }
  function showBanner() {
    buildBanner();
    /* Next frame so the slide-in transition plays. */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (banner) banner.classList.add("pg-show");
      });
    });
  }
  function hideBanner() { if (banner) banner.classList.remove("pg-show"); }

  function maybeShowBanner() {
    if (isInstalled() || recentlyDismissed() || banner && banner.classList.contains("pg-show")) return;
    if (deferredPrompt || isIOS()) showBanner();
  }

  /* ---------- Info / instruction card ---------- */
  var cardWrap = null, cardTitle = null, cardBody = null;
  function buildCard() {
    if (cardWrap) return cardWrap;
    cardWrap = document.createElement("div");
    cardWrap.className = "pg-app-cardwrap pg-hide";
    cardWrap.innerHTML =
      '<div class="pg-app-card" role="dialog" aria-modal="true">' +
      '<img src="/assets/icon-192.png" alt="PrimeGuard app icon">' +
      "<h3></h3><p></p>" +
      '<button type="button" class="pg-app-btn">Done</button></div>';
    cardTitle = cardWrap.querySelector("h3");
    cardBody = cardWrap.querySelector("p");
    cardWrap.querySelector(".pg-app-btn").addEventListener("click", hideCard);
    cardWrap.addEventListener("click", function (e) {
      if (e.target === cardWrap) hideCard();
    });
    document.body.appendChild(cardWrap);
    return cardWrap;
  }
  function showCard(title, body) {
    buildCard();
    cardTitle.textContent = title;
    cardBody.textContent = body;
    cardWrap.classList.remove("pg-hide");
  }
  function hideCard() { if (cardWrap) cardWrap.classList.add("pg-hide"); }

  /* ---------- The one install flow (banner button + footer) ---------- */
  function triggerInstall() {
    if (isInstalled()) {
      hideBanner();
      showCard("You're all set",
        "The " + APP_NAME + " is already on this device. Look for the gold PrimeGuard icon on your home screen.");
      return;
    }
    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      promptEvent.userChoice.then(function (choice) {
        if (choice && choice.outcome === "accepted") {
          lsSet(LS_INSTALLED, "1");
          hideBanner();
        } else {
          /* Declined the native prompt: don't nag again for 30 days. */
          lsSet(LS_DISMISSED, String(Date.now()));
          hideBanner();
        }
      }).catch(function () { /* prompt already consumed */ });
      return;
    }
    if (isIOS()) {
      hideBanner();
      showCard("Add " + (IS_VENDOR ? "PrimeGuard Vendor" : "PrimeGuard") + " to your home screen",
        "Tap the Share button, then 'Add to Home Screen' \u2014 that's it. The gold PrimeGuard icon will sit on your home screen like any other app.");
      return;
    }
    hideBanner();
    showCard("Get the " + APP_NAME,
      "Open this site on your phone and tap Install, or add it to your home screen from your browser menu.");
  }

  /* Footer "Get the app" buttons (same markup on every page). */
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.classList && el.classList.contains("pg-get-app")) {
        e.preventDefault();
        triggerInstall();
        return;
      }
      el = el.parentElement;
    }
  });

  /* iOS never fires beforeinstallprompt, so offer the banner on load. */
  if (document.readyState === "complete" || document.readyState === "interactive") {
    window.setTimeout(maybeShowBanner, 1200);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(maybeShowBanner, 1200);
    });
  }
})();

/* Show/hide password eye on every password field (Edwin, Oct 18) */
(function () {
  function decorate(inp) {
    if (!inp || inp.dataset.pwEye || !inp.parentNode) return; inp.dataset.pwEye = "1";
    var wrap = document.createElement("span");
    wrap.style.cssText = "position:relative;display:block";
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    inp.style.paddingRight = "44px";
    var b = document.createElement("button");
    b.type = "button"; b.textContent = "\u{1F441}"; b.setAttribute("aria-label", "Show password");
    b.style.cssText = "position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:17px;line-height:1;padding:6px;color:#7a7668;z-index:3";
    b.addEventListener("click", function () {
      var show = inp.type === "password";
      inp.type = show ? "text" : "password";
      b.textContent = show ? "\u{1F648}" : "\u{1F441}";
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    wrap.appendChild(b);
  }
  function scan() { document.querySelectorAll('input[type="password"]').forEach(decorate); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
  if (window.MutationObserver) new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();

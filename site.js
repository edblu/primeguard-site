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
      nav_careers: "Careers",
      book_now: "Book now", lang_label: "Language",
      hero_kicker: "Miami-Dade County · Property Services",
      hero_title_a: "Property care,", hero_title_b: "perfected.",
      hero_sub: "Five essential services, one smart call. Vetted pros, upfront pricing, and photo proof on every visit — across Miami-Dade County.",
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
      plan_included_title: "What's included:",
      plan_signup_title: "Join the plan", plan_continue_pay: "Continue to secure payment",
      plan_notify_me: "Notify me when payment opens",
      plan_secure_note: "Secure checkout powered by Stripe. Cancel anytime.",
      plan_prefer_call: "Prefer to talk it through?", plan_call_us: "Call us",
      plan_success_msg: "You're on the list! We'll call you shortly to complete your plan signup and schedule your first visit.",
      lead_address_label: "Service address", lead_payment_label: "Payment",
      lead_payment_stripe: "Redirected to Stripe checkout", lead_payment_pending: "Online payment pending — call to complete",
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
      exit_kicker: "Before you go", exit_title: "Wait, don't leave yet!",
      exit_sub: "Get a free estimate in under 60 seconds, and we will prioritize your booking.",
      exit_name_ph: "Your name", exit_phone_ph: "Phone number",
      exit_cta: "Get my free estimate", exit_dismiss: "No thanks, I will pay full price",
      exit_done_t: "You're in!", exit_done_s: "We'll call you shortly with your free estimate.",
      announce: "Limited slots this week — get your free estimate today",
      est_kicker: "Instant estimate", est_title: "What will it cost?",
      est_lead: "Pick a service and a size for a ballpark figure in seconds.",
      est_service: "Service", est_size: "Size",
      est_s: "Small", est_m: "Medium", est_l: "Large",
      est_result: "Your ballpark estimate",
      est_note: "Ballpark only — your final quote is confirmed before we start. No surprises.",
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
      faq4_a: "After the job is done and you are happy. We accept cards and cash — no deposits for most services.",
      faq5_q: "Are your pros vetted?",
      faq5_a: "Yes. Every tech is background-checked and trained on our checklist before touching your property.",
      faq6_q: "What if I am not happy with the work?",
      faq6_a: "Tell us within 48 hours and we will come back and make it right — free. That is our promise.",
      gua_kicker: "Our promise", gua_title: "Love it, or we make it right.",
      gua_sub: "If anything isn't perfect, tell us within 48 hours and we'll come back and fix it — free.",
      gua_cta: "Book risk-free",
      bun_kicker: "Bundle & save", bun_title: "Services that go together",
      bun_lead: "Book them together and save. Bundle pricing is confirmed in your free quote — you always approve before we start.",
      bun_cta: "Get bundle quote",
      bun1_t: "Curb Appeal Combo", bun1_s: "Lawn Care + Pressure Washing",
      bun1_d: "The one-two punch for instant curb appeal. Fresh stripes, spotless driveway.",
      bun2_t: "Turnover Package", bun2_s: "Junk Removal + Make-Ready Cleaning",
      bun2_d: "From cluttered to guest-ready in days. We clear it out, then make it shine.",
      bun3_t: "Whole Property Refresh", bun3_s: "Lawn Care + Pressure Washing + Handyman",
      bun3_d: "Every corner handled in one visit. Yard, exterior, and the fix-it list — done.",
      plan_modal_kicker: "You're one step away",
      plan_trust_1: "Secure Stripe checkout", plan_trust_2: "Cancel anytime", plan_trust_3: "Vetted pros",
      bb_title: "Or build your own bundle",
      bb_lead: "Pick the services you need. Your price updates live. No phone call needed.",
      bb_total: "Estimated total", bb_continue: "Continue",
      bb_note: "Final quote confirmed before we start. No surprises.",
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
      ref_need_name: "Enter your name first.",
      vendors_kicker: "Partner with us", vendors_title: "Steady work for your crew",
      vendors_lead: "We bring in the customers and handle scheduling and billing. Your crew does the work you are already good at. Every job comes with a written work order, and we pay the same day.",
      vendors_step1_t: "Register", vendors_step1_d: "Fill out the form below. It takes two minutes and puts you in our system.",
      vendors_step2_t: "Get work orders", vendors_step2_d: "We send jobs your way with a written work order spelling out the scope and your pay before you start.",
      vendors_step3_t: "Do the work", vendors_step3_d: "Show up, do great work, and send before-and-after photos when you are done.",
      vendors_step4_t: "Get paid same day", vendors_step4_d: "No chasing invoices, no waiting 30 days. Verified work gets paid the same day.",
      vendors_note: "No fees to join. No cost to you. We make our money on the customer side.",
      vendors_signup: "Sign up as a vendor",
      info_phone: "Phone", info_email: "Email", info_hours: "Hours", info_area: "Service area",
      call_now: "Call now", chat_team: "Chat with our team",
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
      nav_careers: "Empleos",
      book_now: "Reservar ahora", lang_label: "Idioma",
      hero_kicker: "Condado de Miami-Dade · Servicios de propiedad",
      hero_title_a: "Cuidado de propiedades,", hero_title_b: "perfeccionado.",
      hero_sub: "Cinco servicios esenciales, una sola llamada inteligente. Profesionales verificados, precios claros y evidencia fotográfica en cada visita — en todo el condado de Miami-Dade.",
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
      plan_included_title: "Qué incluye:",
      plan_signup_title: "Únete al plan", plan_continue_pay: "Continuar al pago seguro",
      plan_notify_me: "Avísame cuando el pago esté listo",
      plan_secure_note: "Pago seguro con Stripe. Cancela cuando quieras.",
      plan_prefer_call: "¿Prefieres hablarlo?", plan_call_us: "Llámanos",
      plan_success_msg: "¡Estás en la lista! Te llamaremos pronto para completar tu registro y programar tu primera visita.",
      lead_address_label: "Dirección del servicio", lead_payment_label: "Pago",
      lead_payment_stripe: "Redirigido al pago de Stripe", lead_payment_pending: "Pago en línea pendiente — llamar para completar",
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
      exit_kicker: "Antes de irse", exit_title: "¡Espere, no se vaya todavía!",
      exit_sub: "Reciba un estimado gratis en menos de 60 segundos, y priorizaremos su reserva.",
      exit_name_ph: "Su nombre", exit_phone_ph: "Número de teléfono",
      exit_cta: "Quiero mi estimado gratis", exit_dismiss: "No gracias, pagaré el precio completo",
      exit_done_t: "¡Listo!", exit_done_s: "Le llamaremos en breve con su estimado gratis.",
      announce: "Cupos limitados esta semana — pida su estimado gratis hoy",
      est_kicker: "Estimado instantáneo", est_title: "¿Cuánto costará?",
      est_lead: "Elija un servicio y un tamaño para un estimado aproximado en segundos.",
      est_service: "Servicio", est_size: "Tamaño",
      est_s: "Pequeño", est_m: "Mediano", est_l: "Grande",
      est_result: "Su estimado aproximado",
      est_note: "Solo aproximado — su precio final se confirma antes de empezar. Sin sorpresas.",
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
      faq4_a: "Después del trabajo, cuando usted esté satisfecho. Aceptamos tarjetas y efectivo — sin depósitos en la mayoría de los servicios.",
      faq5_q: "¿Su personal está verificado?",
      faq5_a: "Sí. Cada técnico pasa verificación de antecedentes y capacitación antes de tocar su propiedad.",
      faq6_q: "¿Qué pasa si no quedo satisfecho?",
      faq6_a: "Avísenos en 48 horas y regresaremos a corregirlo — gratis. Esa es nuestra promesa.",
      gua_kicker: "Nuestra promesa", gua_title: "Le encantará, o lo corregimos.",
      gua_sub: "Si algo no queda perfecto, avísenos en 48 horas y regresaremos a corregirlo — gratis.",
      gua_cta: "Reserve sin riesgo",
      bun_kicker: "Combine y ahorre", bun_title: "Servicios que van juntos",
      bun_lead: "Resérvelos juntos y ahorre. El precio del paquete se confirma en su estimado gratis — usted siempre aprueba antes de empezar.",
      bun_cta: "Pedir precio del paquete",
      bun1_t: "Combo de Atractivo Exterior", bun1_s: "Corte de césped + Lavado a presión",
      bun1_d: "El golpe doble para un atractivo instantáneo. Líneas frescas, entrada impecable.",
      bun2_t: "Paquete de Entrega", bun2_s: "Retiro de escombros + Limpieza",
      bun2_d: "De desordenado a listo para huéspedes en días. Lo despejamos y lo dejamos brillar.",
      bun3_t: "Renovación Total", bun3_s: "Césped + Lavado a presión + Reparaciones",
      bun3_d: "Todo resuelto en una visita. Patio, exterior y la lista de reparaciones — listo.",
      plan_modal_kicker: "Estás a un paso",
      plan_trust_1: "Pago seguro con Stripe", plan_trust_2: "Cancele cuando quiera", plan_trust_3: "Personal verificado",
      bb_title: "O arme su propio paquete",
      bb_lead: "Elija los servicios que necesita. Su precio se actualiza en vivo. Sin llamadas.",
      bb_total: "Total estimado", bb_continue: "Continuar",
      bb_note: "Precio final confirmado antes de empezar. Sin sorpresas.",
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
      ref_need_name: "Ingrese su nombre primero.",
      vendors_kicker: "Asóciese con nosotros", vendors_title: "Trabajo constante para su equipo",
      vendors_lead: "Nosotros conseguimos los clientes y manejamos la programación y la facturación. Su equipo hace el trabajo que ya sabe hacer. Cada trabajo incluye una orden escrita, y pagamos el mismo día.",
      vendors_step1_t: "Regístrese", vendors_step1_d: "Complete el formulario a continuación. Toma dos minutos y lo pone en nuestro sistema.",
      vendors_step2_t: "Reciba órdenes de trabajo", vendors_step2_d: "Le enviamos trabajos con una orden escrita que detalla el alcance y su pago antes de empezar.",
      vendors_step3_t: "Haga el trabajo", vendors_step3_d: "Preséntese, haga un excelente trabajo y envíe fotos del antes y después al terminar.",
      vendors_step4_t: "Cobro el mismo día", vendors_step4_d: "Sin perseguir facturas, sin esperar 30 días. El trabajo verificado se paga el mismo día.",
      vendors_note: "Sin cargos para unirse. Sin costo para usted. Nosotros ganamos por el lado del cliente.",
      vendors_signup: "Regístrese como proveedor",
      info_phone: "Teléfono", info_email: "Correo electrónico", info_hours: "Horario", info_area: "Área de servicio",
      call_now: "Llamar ahora", chat_team: "Chatear con nuestro equipo",
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

  /* ---------- Plan signup modal ---------- */
  var planModal = document.getElementById("planModal");
  var planClose = document.getElementById("planClose");
  var planSummaryName = document.getElementById("planSummaryName");
  var planSummaryPrice = document.getElementById("planSummaryPrice");
  var planSummaryDesc = document.getElementById("planSummaryDesc");
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
    function render() {
      var sel = selected();
      var total = sel.reduce(function (a, b) { return a + b.price; }, 0);
      totalEl.textContent = "$" + total;
      contBtn.disabled = !sel.length;
      return { sel: sel, total: total };
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
    var current = { sel: [], total: 0 };
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
        name: name, phone: phone, email: form.email.value.trim(),
        address: address, date: form.date.value.trim(), notes: form.notes.value.trim(),
        source: "bundle-builder", page: location.pathname,
        uid: currentUser ? currentUser.uid : null
      };
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
    genBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.placeholder = t("ref_need_name");
        return;
      }
      codeEl.textContent = makeCode(name);
      row.hidden = false;
      if (copyBtn) copyBtn.textContent = t("ref_copy");
    });
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var code = codeEl.textContent;
      function ok() { copyBtn.textContent = t("ref_copied"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(ok).catch(ok);
      } else { ok(); }
    });
  })();

  /* ---------- Init ---------- */
  setupReviews();
  renderPlanPrices();
  if (!plans.length && plansSection) plansSection.style.display = "none";
  applyI18n();
})();

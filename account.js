// PrimeGuard customer account logic (Firebase Auth + Firestore).
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  var configured = !!cfg && cfg.apiKey;

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  /* ---------- i18n (EN/ES), mirrors site.js: .lang-toggle + data-i18n + t(key), localStorage "pg-lang" ---------- */
  var currentLang = "en";
  try { var __pgl = localStorage.getItem("pg-lang"); if (__pgl === "en" || __pgl === "es") currentLang = __pgl; } catch (e) {}
  var pgUser = null;   // set in onAuthStateChanged; used by re-renders on language toggle
  var pgName = "";     // set in onAuthStateChanged; used by renderGreeting

  /* ---------- Live data: Firestore snapshot listeners ----------
     Each main list registers ONE onSnapshot listener; later changes
     re-render automatically, no page refresh. Repeat calls replay the
     cached snapshot into the same render path, which keeps language
     toggles and post-action re-renders working like the old fetches. */
  var liveSubs = {}, liveCache = {};
  function liveOn(key, query, onData, onErr) {
    if (liveSubs[key]) {
      if (liveCache[key] && onData) onData(liveCache[key]);
      return;
    }
    try {
      liveSubs[key] = query.onSnapshot(function (qs) {
        liveCache[key] = qs;
        if (onData) onData(qs);
      }, function (err) {
        delete liveSubs[key];
        if (onErr) onErr(err);
      });
    } catch (e) { if (onErr) onErr(e); }
  }
  function liveOffAll() {
    Object.keys(liveSubs).forEach(function (k) { try { liveSubs[k](); } catch (e) {} });
    liveSubs = {};
    liveCache = {};
    // Per-work-order tracker listeners (ccalLiveIds) hold their
    // unsubscribe functions; release them too.
    Object.keys(ccalLiveIds).forEach(function (id) { try { if (typeof ccalLiveIds[id] === "function") ccalLiveIds[id](); } catch (e) {} });
    ccalLiveIds = {};
  }
  var I18N = { en: {
    page_title: "My Account | PrimeGuard",
    meta_desc: "Track your PrimeGuard requests, schedules, and photos in your account.",
    lang_label: "Language",
    nav_services: "Services", nav_plans: "Plans", nav_work: "Work", nav_reviews: "Reviews", nav_about: "About", nav_contact: "Contact",
    nav_faq: "FAQ", nav_referrals: "Referrals", nav_government: "Government", nav_careers: "Careers",
    book_now: "Book now",
    portal_kicker: "Customer portal", my_account: "My Account",
    hero_lead: "Sign in to see your schedule, upcoming visits, before/after photos, requests and plan details.",
    coming_title: "Online accounts are coming soon",
    coming_body_html: "One quick call or tap and we take it from there. Reach us at <a href=\"tel:+17864229674\">(786) 422-9674</a>, or leave your details on the contact form and we call you back.",
    welcome_pg: "Welcome to PrimeGuard",
    login_banner_sub: "Log in or create your free account to see your visits, photos and plan.",
    role_customer: "👋 I'm a customer", role_vendor: "🧰 I'm a vendor",
    tab_login: "Log in", tab_signup: "Create account",
    welcome_back: "Welcome back",
    email: "Email", password: "Password", login_btn: "Log in", google_btn: "Continue with Google", forgot: "Forgot password?",
    create_account: "Create your account", full_name: "Full name", phone: "Phone", signup_btn: "Create account",
    help_title: "How to log in",
    help_1_html: "Pick <strong>Customer</strong> or <strong>Vendor</strong> above: customers land here; vendors use the vendor side.",
    help_2_html: "Use the same email and password you signed up with, or tap <strong>Continue with Google</strong>.",
    help_3_html: "New vendor? <a href=\"vendor-register.html\">Register your crew</a> first, then come back and log in.",
    help_4_html: "Forgot your password? Tap <strong>Forgot password?</strong> under the Log in button and we'll email you a reset link.",
    signing_in: "Signing in...", creating_account: "Creating account...", creating_pswd: "Password must be at least 6 characters.",
    forgot_need_email: "Type your email above first, then tap Forgot password.",
    reset_sent: "Reset link sent to {email}.",
    err_cred: "That email and password don't match our records. Check for typos — or if you signed up with Google, use Continue with Google.",
    err_email_in_use: "That email already has an account. Try logging in instead.",
    err_weak_password: "Password needs at least 6 characters.",
    err_too_many: "Too many attempts. Wait a minute and try again, or reset your password.",
    err_network: "Connection problem. Check your internet and try again.",
    err_captcha: "That security check expired. Please try again.",
    err_default: "Something went wrong. Please try again.",
    greet_morning: "Good morning", greet_afternoon: "Good afternoon", greet_evening: "Good evening", greet_there: "there",
    dash_sub: "Your home, cared for. Track requests, revisit past jobs, and manage everything in one sunny place.",
    stat_active: "Active requests", stat_done: "Jobs completed", stat_since: "Member since", loading: "Loading…",
    action_needed: "⚡ Action needed",
    your_quotes: "Your quotes", your_calendar: "📅 Your calendar",
    achievements: "🏅 Achievements", gallery_title: "📸 My home gallery",
    dow_0: "Su", dow_1: "Mo", dow_2: "Tu", dow_3: "We", dow_4: "Th", dow_5: "Fr", dow_6: "Sa",
    prev_month: "Previous month", next_month: "Next month",
    connect_title: "Connect my calendar",
    connect_sub: "See your PrimeGuard visits right inside Google Calendar or your iPhone calendar. We keep this link updated for you.",
    ccal_create_link_btn: "Create my calendar link",
    ccal_how: "Google Calendar: Settings, then Add calendar, then From URL, paste the link. iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.",
    ccal_regen: "Get a new link (the old one stops working)",
    next_label: "Next: {date}",
    st_new: "New", st_received: "Received", st_in_progress: "In progress", st_scheduled: "Scheduled", st_accepted: "Accepted",
    st_confirmed: "Confirmed", st_approved: "Approved", st_quoted: "Quoted", st_review: "Under review", st_done: "Done",
    st_completed: "Completed", st_cancelled: "Cancelled", st_canceled: "Canceled", st_declined: "Declined", st_pending: "Pending",
    st_evaluation: "Evaluation", st_evaluation_scheduled: "Evaluation scheduled",
    tl_received: "Received", tl_scheduled: "Scheduled", tl_in_progress: "In progress", tl_done: "Done",
    tl_cancelled: "Cancelled",
    cal_on_way: "On the way", cal_arrived: "Arrived", cal_arrived_crew: "Crew arrived",
    cal_completed: "Completed", cal_past: "Past visit", cal_next_visit: "Next visit", cal_none_day: "No visits this day.",
    crew_label: "Crew: ", crew_default: "PrimeGuard crew", visit_default: "PrimeGuard visit",
    tracker_title: "🚗 Live visit tracker",
    live_0: "This tracker goes live the moment your crew starts the trip.",
    live_1: "Your crew is on the way. This page updates the moment they arrive.",
    live_2: "Your crew has arrived and is getting to work.",
    live_3review: "Your crew finished this visit. Here are the photos.",
    live_3: "All done, confirmed by our office. Here are the photos from the visit.",
    svc_requests: "Service requests", new_request: "New request", job_history: "Job history",
    settings_btn: "⚙ Settings", settings: "Settings", admin_dash: "Admin dashboard", close_settings: "Close settings",
    empty_requests: "No requests yet. Tell us what your home needs.",
    cta_req_service: "Request service", load_err_requests: "Couldn't load requests right now.",
    empty_jobs: "No jobs yet. Your completed and upcoming jobs will live here.",
    cta_browse: "Browse services", load_err_jobs: "Couldn't load jobs right now.",
    video_n: "🎬 Video {n}", video_link: "🎬 Video link", add_media: "Add photos / video", edit: "Edit", book_again: "Book again",
    mp_photos: "Photos",
    mp_videos_html: "Videos <span style=\"font-weight:400;color:#a89a7d\">(25 MB max each. Bigger? Use the link field below)</span>",
    mp_link_ph: "Google Photos, iCloud, YouTube…", mp_save_btn: "Add to request", mp_cancel: "Cancel",
    mp_pick_first: "Pick a photo or video first, or paste a video link.",
    mp_uploading_short: "Uploading…",
    mp_skipped_note: " Note: {names} was over 25 MB and wasn't attached. Paste a link to it instead.",
    mp_nothing_new: "Nothing new to add.", mp_added: "Added to your request. Thank you!",
    mp_add_err: "Couldn't add that. Please try again, or call us at (786) 422-9674.",
    approve_q: "Approve", decline_q: "Decline",
    quote_update_err: "Couldn't update that quote. Please call us at (786) 422-9674.",
    quote_count_one: "{n} quote", quote_count_many: "{n} quotes",
    signed_badge: "Signed ✓", awaiting_sig: "Awaiting your signature", review_sign_btn: "Review & sign",
    signed_on: "Signed {date}", pay_full_part: " · Full payment", pay_deposit20: " · 20% deposit", valid_until: "Valid until {date}",
    referrals: "🎁 Referrals", ref_intro: "Give $20, get $20. Share your code with friends.",
    copy: "Copy", copy_link: "Copy link", copied: "Copied ✓", copied_bang: "Copied!",
    ref_link_intro: "Or send your personal link, the credit applies automatically:",
    friends_joined: "friends joined", credit_earned: "credit earned", ref_load_error: "Couldn’t load your referral info.",
    my_plan: "💎 My plan", plan_manage: "Manage plan", plan_next_billing: "Next billing: {date}",
    plan_none: "Lock in a lower rate with a subscription. Lawn, pressure washing, or handyman.",
    plan_browse: "Browse plans", plan_load_err: "Couldn’t load your plan.",
    my_props: "🏠 My properties", prop_label_ph: "Label (e.g. Rental on 8th St)", prop_label_aria: "Property label",
    prop_addr_ph: "Street, City, ZIP", prop_addr_aria: "Property address", add: "Add",
    prop_delete_confirm: "Remove this property?", prop_save_err: "Couldn’t save. Please try again.",
    props_empty: "Only one home? Nothing to do here. Add rentals or family homes you manage.",
    badge_founder: "Founding Member", badge_founder_hint: "Joined in 2026",
    badge_first: "First Service", badge_first_hint: "Complete 1 service",
    badge_loyal: "Loyal Customer", badge_loyal_hint: "Complete 5 services",
    badge_royal: "Royalty", badge_royal_hint: "Complete 10 services",
    badge_ref1: "Referral Star", badge_ref1_hint: "1 friend joined",
    badge_ref5: "Super Connector", badge_ref5_hint: "5 friends joined",
    badge_plan: "Plan Member", badge_plan_hint: "Join a plan",
    badge_mogul: "Property Mogul", badge_mogul_hint: "Add 2 properties",
    badge_earned_word: "Earned!",
    season_in_miami: "in Miami", seasonal_btn: "Get seasonal service",
    step_service: "Service", step_details: "Details", step_review: "Review",
    req_new_title: "New request", req_edit_title: "Edit request",
    rw_h2: "What does your home need?", rw_sub: "Choose a service to see exactly what's included. Then request it right here.",
    rw_fine_html: "Prefer to talk? Call <a href=\"tel:+17864229674\">(786) 422-9674</a>",
    from_word: "from", whats_included: "What's included",
    how_it_works_html: "📌 <strong>How it works:</strong> send your request here → we confirm details &amp; price with you → nothing is scheduled until you approve it.",
    details_label: "Tell us exactly what you want done",
    details_ph: "Tell us exactly what you want done: what needs doing, where on the property, how big the area is, anything tricky we should know, and how we get in (gate, dogs, etc.). The more detail, the more accurate your quote.",
    show_us: "Show us", optional: "(optional)",
    show_hint: "Show us: add photos or a short video of the area so we can see exactly what you mean.",
    add_photos: "📷 Add photos", add_video: "🎬 Add a video",
    video_link_label: "Or paste a video link", video_link_ph: "Or paste a video link (Google Photos, iCloud, YouTube…)",
    how_often: "How often?", freq_hint: "One-time is perfect for trying us out.",
    freq_once: "One-time", freq_weekly: "Weekly", freq_biweekly: "Biweekly", freq_monthly: "Monthly",
    back: "Back", back_plain: "← Back", back_services: "← All services", review_btn: "Review →",
    review_h2: "Review your request", requesting_as: "Requesting as",
    send_request: "Send my request", save_changes: "Save changes", sending: "Sending...", saving: "Saving...",
    send_fine_html: "You pay nothing today. We confirm the details and price with you before anything is scheduled.<br>Prefer to talk? Call <a href=\"tel:+17864229674\">(786) 422-9674</a>",
    rev_service: "Service", rev_frequency: "Frequency", rev_details: "Details", rev_photos: "Photos", rev_videos: "Videos", rev_video_link: "Video link",
    attached: "{n} attached", rev_from: " (from {price})",
    done_received: "Request received!", done_saved: "Changes saved!",
    done_summary_new: "Your {svc} request ({freq}) is in. We'll be in touch shortly to confirm the details.",
    done_summary_edit: "Your {svc} request has been updated.",
    done_skipped_note: " Note: {names} was over the 25 MB video limit and wasn't attached. You can add a link to it from your request list anytime.",
    send_err: "Couldn't send. Please try again.",
    next_steps_html: "<strong>What happens next:</strong><br>1. We confirm your details and price (usually same day).<br>2. You approve it. Nothing scheduled without your OK.<br>3. Our crew gets it done. You get before &amp; after photos.",
    done_btn: "Done",
    vid_on_one: "🎬 1 video already on this request.", vid_on_many: "🎬 {n} videos already on this request.",
    vid_too_big_attach: "🎬 {name} ({size}) — too big to attach (25 MB max)",
    vid_over_msg: "That video is over 25 MB, so we can't attach it here. No problem: paste a link to it in the link field below (Google Photos, iCloud, YouTube) and we'll watch it there.",
    footer_hours: "Mon-Fri, 8:00 AM - 5:00 PM · Sat, 8:00 AM - 12:00 PM", get_app: "📲 Get the app", rights: "All rights reserved.",
    service_address: "Service address", addr_ph: "Street, City, ZIP", save_profile: "Save profile", profile_saved: "Profile saved.", logout: "Log out"
  } };
  function t(key) { var d = I18N[currentLang] || I18N.en; return d[key] != null ? d[key] : (I18N.en[key] != null ? I18N.en[key] : key); }
  function fillT(key, vars) { var s = t(key); Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(vars[k])); }); return s; }
  function pgLocale() { return currentLang === "es" ? "es-US" : "en-US"; }
  function pluralT(n, oneKey, manyKey) { return fillT(n === 1 ? oneKey : manyKey, { n: n }); }
  var STATUS_KEYS = { "new": "st_new", "received": "st_received", "in progress": "st_in_progress", "in_progress": "st_in_progress", "inprogress": "st_in_progress",
    "scheduled": "st_scheduled", "accepted": "st_accepted", "confirmed": "st_confirmed", "approved": "st_approved", "quoted": "st_quoted",
    "review": "st_review", "done": "st_done", "completed": "st_completed", "cancelled": "st_cancelled", "canceled": "st_canceled",
    "declined": "st_declined", "pending": "st_pending", "evaluation": "st_evaluation", "evaluation_scheduled": "st_evaluation_scheduled", "evaluation scheduled": "st_evaluation_scheduled" };
  function statusLabel(st) { var k = STATUS_KEYS[String(st || "").toLowerCase()]; return k ? t(k) : String(st || ""); }
  I18N.es = {
    page_title: "Mi cuenta | PrimeGuard",
    meta_desc: "Consulta tus solicitudes, visitas y fotos de PrimeGuard en tu cuenta.",
    lang_label: "Idioma",
    nav_services: "Servicios", nav_plans: "Planes", nav_work: "Trabajos", nav_reviews: "Reseñas", nav_about: "Nosotros", nav_contact: "Contacto",
    nav_faq: "Preguntas", nav_referrals: "Referidos", nav_government: "Gobierno", nav_careers: "Empleo",
    book_now: "Reservar",
    portal_kicker: "Portal del cliente", my_account: "Mi cuenta",
    hero_lead: "Inicia sesión para ver tu calendario, próximas visitas, fotos de antes y después, solicitudes y los detalles de tu plan.",
    coming_title: "Las cuentas en línea llegan pronto",
    coming_body_html: "Una llamada o un toque y nosotros nos encargamos. Llámanos al <a href=\"tel:+17864229674\">(786) 422-9674</a>, o déjanos tus datos en el formulario de contacto y te llamamos de vuelta.",
    welcome_pg: "Bienvenido a PrimeGuard",
    login_banner_sub: "Inicia sesión o crea tu cuenta gratis para ver tus visitas, fotos y plan.",
    role_customer: "👋 Soy cliente", role_vendor: "🧰 Soy proveedor",
    tab_login: "Iniciar sesión", tab_signup: "Crear cuenta",
    welcome_back: "Bienvenido de nuevo",
    email: "Correo electrónico", password: "Contraseña", login_btn: "Iniciar sesión", google_btn: "Continuar con Google", forgot: "¿Olvidaste tu contraseña?",
    create_account: "Crea tu cuenta", full_name: "Nombre completo", phone: "Teléfono", signup_btn: "Crear cuenta",
    help_title: "Cómo iniciar sesión",
    help_1_html: "Elige <strong>Cliente</strong> o <strong>Proveedor</strong> arriba: los clientes llegan aquí; los proveedores usan el lado de proveedores.",
    help_2_html: "Usa el mismo correo y contraseña con los que te registraste, o toca <strong>Continuar con Google</strong>.",
    help_3_html: "¿Eres un proveedor nuevo? <a href=\"vendor-register.html\">Registra tu equipo</a> primero, luego vuelve e inicia sesión.",
    help_4_html: "¿Olvidaste tu contraseña? Toca <strong>¿Olvidaste tu contraseña?</strong> debajo del botón de Iniciar sesión y te enviaremos un enlace para restablecerla.",
    signing_in: "Iniciando sesión...", creating_account: "Creando tu cuenta...", creating_pswd: "La contraseña debe tener al menos 6 caracteres.",
    forgot_need_email: "Escribe tu correo arriba primero, luego toca ¿Olvidaste tu contraseña?",
    reset_sent: "Enlace de restablecimiento enviado a {email}.",
    err_cred: "Ese correo y contraseña no coinciden con nuestros registros. Revisa que no haya errores, o si te registraste con Google, usa Continuar con Google.",
    err_email_in_use: "Ese correo ya tiene una cuenta. Prueba iniciar sesión.",
    err_weak_password: "La contraseña necesita al menos 6 caracteres.",
    err_too_many: "Demasiados intentos. Espera un minuto e inténtalo de nuevo, o restablece tu contraseña.",
    err_network: "Problema de conexión. Revisa tu internet e inténtalo de nuevo.",
    err_captcha: "Esa verificación de seguridad venció. Inténtalo de nuevo.",
    err_default: "Algo salió mal. Inténtalo de nuevo.",
    greet_morning: "Buenos días", greet_afternoon: "Buenas tardes", greet_evening: "Buenas noches", greet_there: "amigo",
    dash_sub: "Tu hogar, bien cuidado. Sigue tus solicitudes, revisa trabajos pasados y gestiona todo en un solo lugar.",
    stat_active: "Solicitudes activas", stat_done: "Trabajos completados", stat_since: "Cliente desde", loading: "Cargando…",
    action_needed: "⚡ Acción necesaria",
    your_quotes: "Tus cotizaciones", your_calendar: "📅 Tu calendario",
    achievements: "🏅 Logros", gallery_title: "📸 Galería de mi hogar",
    dow_0: "Do", dow_1: "Lu", dow_2: "Ma", dow_3: "Mi", dow_4: "Ju", dow_5: "Vi", dow_6: "Sá",
    prev_month: "Mes anterior", next_month: "Mes siguiente",
    connect_title: "Conectar mi calendario",
    connect_sub: "Ve tus visitas de PrimeGuard dentro de Google Calendar o el calendario de tu iPhone. Mantenemos este enlace actualizado para ti.",
    ccal_create_link_btn: "Crear mi enlace de calendario",
    ccal_how: "Google Calendar: Ajustes, luego Agregar calendario, luego Desde URL, pega el enlace. iPhone: Ajustes, Calendario, Cuentas, Agregar cuenta, Otro, Agregar calendario suscrito, pega el enlace.",
    ccal_regen: "Obtener un enlace nuevo (el anterior deja de funcionar)",
    next_label: "Próxima: {date}",
    st_new: "Nuevo", st_received: "Recibido", st_in_progress: "En curso", st_scheduled: "Programado", st_accepted: "Aceptado",
    st_confirmed: "Confirmado", st_approved: "Aprobado", st_quoted: "Cotizado", st_review: "En revisión", st_done: "Terminado",
    st_completed: "Completado", st_cancelled: "Cancelado", st_canceled: "Cancelado", st_declined: "Rechazado", st_pending: "Pendiente",
    st_evaluation: "Evaluación", st_evaluation_scheduled: "Evaluación programada",
    tl_received: "Recibido", tl_scheduled: "Programado", tl_in_progress: "En curso", tl_done: "Terminado",
    tl_cancelled: "Cancelado",
    cal_on_way: "En camino", cal_arrived: "Llegó", cal_arrived_crew: "El equipo llegó",
    cal_completed: "Completado", cal_past: "Visita pasada", cal_next_visit: "Próxima visita", cal_none_day: "No hay visitas este día.",
    crew_label: "Equipo: ", crew_default: "Equipo de PrimeGuard", visit_default: "Visita de PrimeGuard",
    tracker_title: "🚗 Rastreador de visita en vivo",
    live_0: "Este rastreador se activa en el momento en que tu equipo emprende el viaje.",
    live_1: "Tu equipo va en camino. Esta página se actualiza en el momento en que lleguen.",
    live_2: "Tu equipo llegó y se está poniendo a trabajar.",
    live_3review: "Tu equipo terminó esta visita. Aquí están las fotos.",
    live_3: "Todo listo, confirmado por nuestra oficina. Aquí están las fotos de la visita.",
    svc_requests: "Solicitudes de servicio", new_request: "Nueva solicitud", job_history: "Historial de trabajos",
    settings_btn: "⚙ Ajustes", settings: "Ajustes", admin_dash: "Panel de administración", close_settings: "Cerrar ajustes",
    empty_requests: "Aún no tienes solicitudes. Cuéntanos qué necesita tu hogar.",
    cta_req_service: "Pedir un servicio", load_err_requests: "No se pudieron cargar las solicitudes ahora.",
    empty_jobs: "Aún no hay trabajos. Tus trabajos completados y próximos aparecen aquí.",
    cta_browse: "Ver servicios", load_err_jobs: "No se pudieron cargar los trabajos ahora.",
    video_n: "🎬 Video {n}", video_link: "🎬 Enlace de video", add_media: "Agregar fotos / video", edit: "Editar", book_again: "Reservar de nuevo",
    mp_photos: "Fotos",
    mp_videos_html: "Videos <span style=\"font-weight:400;color:#a89a7d\">(25 MB máx. cada uno. ¿Más grande? Usa el campo de enlace abajo)</span>",
    mp_link_ph: "Google Photos, iCloud, YouTube…", mp_save_btn: "Agregar a la solicitud", mp_cancel: "Cancelar",
    mp_pick_first: "Elige primero una foto o un video, o pega un enlace de video.",
    mp_uploading_short: "Subiendo…",
    mp_skipped_note: " Nota: {names} pesaba más de 25 MB y no se adjuntó. Mejor pega un enlace a ese video.",
    mp_nothing_new: "Nada nuevo para agregar.", mp_added: "Agregado a tu solicitud. ¡Gracias!",
    mp_add_err: "No se pudo agregar. Inténtalo de nuevo, o llámanos al (786) 422-9674.",
    approve_q: "Aprobar", decline_q: "Rechazar",
    quote_update_err: "No se pudo actualizar esa cotización. Llámanos al (786) 422-9674.",
    quote_count_one: "{n} cotización", quote_count_many: "{n} cotizaciones",
    signed_badge: "Firmado ✓", awaiting_sig: "Esperando tu firma", review_sign_btn: "Revisar y firmar",
    signed_on: "Firmado el {date}", pay_full_part: " · Pago completo", pay_deposit20: " · Depósito del 20%", valid_until: "Válido hasta el {date}",
    referrals: "🎁 Referidos", ref_intro: "Da $20, recibe $20. Comparte tu código con amigos.",
    copy: "Copiar", copy_link: "Copiar enlace", copied: "Copiado ✓", copied_bang: "¡Copiado!",
    ref_link_intro: "O envía tu enlace personal, el crédito se aplica automáticamente:",
    friends_joined: "amigos se unieron", credit_earned: "crédito ganado", ref_load_error: "No se pudo cargar tu información de referidos.",
    my_plan: "💎 Mi plan", plan_manage: "Gestionar plan", plan_next_billing: "Próxima facturación: {date}",
    plan_none: "Asegura una tarifa más baja con una suscripción. Césped, lavado a presión o handyman.",
    plan_browse: "Ver planes", plan_load_err: "No se pudo cargar tu plan.",
    my_props: "🏠 Mis propiedades", prop_label_ph: "Etiqueta (ej. Alquiler en la calle 8)", prop_label_aria: "Etiqueta de la propiedad",
    prop_addr_ph: "Calle, ciudad, código postal", prop_addr_aria: "Dirección de la propiedad", add: "Agregar",
    prop_delete_confirm: "¿Eliminar esta propiedad?", prop_save_err: "No se pudo guardar. Inténtalo de nuevo.",
    props_empty: "¿Solo una casa? No hay nada que hacer aquí. Agrega alquileres o casas de familiares que gestiones.",
    badge_founder: "Miembro fundador", badge_founder_hint: "Se unió en 2026",
    badge_first: "Primer servicio", badge_first_hint: "Completa 1 servicio",
    badge_loyal: "Cliente leal", badge_loyal_hint: "Completa 5 servicios",
    badge_royal: "Realeza", badge_royal_hint: "Completa 10 servicios",
    badge_ref1: "Estrella de referidos", badge_ref1_hint: "1 amigo se unió",
    badge_ref5: "Súper conector", badge_ref5_hint: "5 amigos se unieron",
    badge_plan: "Miembro del plan", badge_plan_hint: "Únete a un plan",
    badge_mogul: "Magnate de propiedades", badge_mogul_hint: "Agrega 2 propiedades",
    badge_earned_word: "¡Logrado!",
    season_in_miami: "en Miami", seasonal_btn: "Pedir servicio de temporada",
    step_service: "Servicio", step_details: "Detalles", step_review: "Revisión",
    req_new_title: "Nueva solicitud", req_edit_title: "Editar solicitud",
    rw_h2: "¿Qué necesita tu hogar?", rw_sub: "Elige un servicio para ver exactamente qué incluye. Luego pídelo aquí mismo.",
    rw_fine_html: "¿Prefieres hablar? Llámanos al <a href=\"tel:+17864229674\">(786) 422-9674</a>",
    from_word: "desde", whats_included: "Qué incluye",
    how_it_works_html: "📌 <strong>Cómo funciona:</strong> envía tu solicitud aquí → confirmamos los detalles y el precio contigo → nada se programa hasta que lo apruebes.",
    details_label: "Cuéntanos exactamente qué quieres que hagamos",
    details_ph: "Cuéntanos exactamente qué quieres que hagamos: qué hay que hacer, en qué parte de la propiedad, qué tan grande es el área, cualquier detalle complicado que debamos saber, y cómo entramos (portón, perros, etc.). Mientras más detalle, más exacta será tu cotización.",
    show_us: "Muéstranos", optional: "(opcional)",
    show_hint: "Muéstranos: agrega fotos o un video corto del área para que veamos exactamente a qué te refieres.",
    add_photos: "📷 Agregar fotos", add_video: "🎬 Agregar un video",
    video_link_label: "O pega un enlace de video", video_link_ph: "O pega un enlace de video (Google Photos, iCloud, YouTube…)",
    how_often: "¿Con qué frecuencia?", freq_hint: "Una sola vez es perfecto para probarnos.",
    freq_once: "Una vez", freq_weekly: "Semanal", freq_biweekly: "Cada dos semanas", freq_monthly: "Mensual",
    back: "Atrás", back_plain: "← Atrás", back_services: "← Todos los servicios", review_btn: "Revisar →",
    review_h2: "Revisa tu solicitud", requesting_as: "Solicitando como",
    send_request: "Enviar mi solicitud", save_changes: "Guardar cambios", sending: "Enviando...", saving: "Guardando...",
    send_fine_html: "Hoy no pagas nada. Confirmamos los detalles y el precio contigo antes de programar nada.<br>¿Prefieres hablar? Llámanos al <a href=\"tel:+17864229674\">(786) 422-9674</a>",
    rev_service: "Servicio", rev_frequency: "Frecuencia", rev_details: "Detalles", rev_photos: "Fotos", rev_videos: "Videos", rev_video_link: "Enlace de video",
    attached: "{n} adjuntos", rev_from: " (desde {price})",
    done_received: "¡Solicitud recibida!", done_saved: "¡Cambios guardados!",
    done_summary_new: "Tu solicitud de {svc} ({freq}) ya entró. Te contactaremos pronto para confirmar los detalles.",
    done_summary_edit: "Tu solicitud de {svc} ha sido actualizada.",
    done_skipped_note: " Nota: {names} superó el límite de 25 MB de video y no se adjuntó. Puedes agregar un enlace a ese video desde tu lista de solicitudes cuando quieras.",
    send_err: "No se pudo enviar. Inténtalo de nuevo.",
    next_steps_html: "<strong>Qué sigue:</strong><br>1. Confirmamos tus detalles y precio (normalmente el mismo día).<br>2. Tú lo apruebas. Nada se programa sin tu OK.<br>3. Nuestro equipo lo hace. Recibes fotos de antes y después.",
    done_btn: "Listo",
    vid_on_one: "🎬 1 video ya está en esta solicitud.", vid_on_many: "🎬 {n} videos ya están en esta solicitud.",
    vid_too_big_attach: "🎬 {name} ({size}) — demasiado grande para adjuntar (25 MB máx.)",
    vid_over_msg: "Ese video pesa más de 25 MB, así que no podemos adjuntarlo aquí. No hay problema: pega un enlace a ese video en el campo de enlace abajo (Google Photos, iCloud, YouTube) y lo vemos ahí.",
    footer_hours: "Lun-Vie, 8:00 AM - 5:00 PM · Sáb, 8:00 AM - 12:00 PM", get_app: "📲 Descarga la app", rights: "Todos los derechos reservados.",
    service_address: "Dirección del servicio", addr_ph: "Calle, ciudad, código postal", save_profile: "Guardar perfil", profile_saved: "Perfil guardado.", logout: "Cerrar sesión"
  };
  function applyI18n() {
    document.documentElement.lang = currentLang;
    document.title = t("page_title");
    var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", t("meta_desc"));
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    document.querySelectorAll(".lang-toggle button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-lang") === currentLang); });
    rerenderDynamic();
  }
  function rerenderDynamic() {
    // On a language toggle, re-run the existing render flow in the new
    // language (fresh renders from the loaders; no page reload).
    try { if (typeof renderGreeting === "function") renderGreeting(); } catch (e) {}
    try { if (typeof renderSvcCards === "function") renderSvcCards(); } catch (e) {}
    try { if (typeof renderSeason === "function") renderSeason(); } catch (e) {}
    if (!pgUser) return;
    try { loadRequests(pgUser.uid); } catch (e) {}
    try { loadJobs(pgUser.uid); } catch (e) {}
    try { loadCustomerQuotes(pgUser); } catch (e) {}
    try { loadReferral(pgUser); loadPlan(pgUser); loadProps(pgUser); } catch (e) {}
    try { if (typeof ccalUser !== "undefined" && ccalUser) { renderCcal(); renderCcalConnect(); } } catch (e) {}
    try { if (typeof renderBadges === "function") renderBadges(); } catch (e) {}
  }
  document.querySelectorAll(".lang-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      if (lang !== "en" && lang !== "es") return;
      currentLang = lang;
      try { localStorage.setItem("pg-lang", lang); } catch (e) {}
      applyI18n();
    });
  });
  applyI18n();


  if (!configured) {
    show($("account-coming-soon"));
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var authForms = $("auth-forms"), dashboard = $("account-dashboard");

  // Auth tabs
  $("tab-login").addEventListener("click", function () {
    $("tab-login").classList.add("active"); $("tab-signup").classList.remove("active");
    show($("form-login")); hide($("form-signup"));
  });
  $("tab-signup").addEventListener("click", function () {
    $("tab-signup").classList.add("active"); $("tab-login").classList.remove("active");
    show($("form-signup")); hide($("form-login"));
  });

  // Mobile hamburger menu: wired by site.js's standalone nav-drawer
  // module (this page loads site.js in PWA-only mode, and that module
  // runs there too). Do not wire #navToggle here — double handlers
  // would toggle the drawer open and shut on a single click.

  // Promo banner slot (Midnight Gold dashboard). Driven by SITE_CONFIG.promoBanner.
  // Empty/missing title = banner stays hidden.
  (function () {
    try {
      var p = (window.SITE_CONFIG && window.SITE_CONFIG.promoBanner) || {};
      if (!p.title) return;
      var b = document.getElementById("promoBanner");
      if (!b) return;
      document.getElementById("promoTitle").textContent = p.title;
      document.getElementById("promoSub").textContent = p.sub || "";
      document.getElementById("promoCta").textContent = p.cta || "Learn more";
      b.href = p.link || "#";
      b.classList.remove("hidden");
    } catch (e) {}
  })();

  // Settings slide-over panel
  var settingsPanel = $("settingsPanel"), settingsOverlay = $("settingsOverlay");
  function openSettings() {
    settingsPanel.classList.add("open"); settingsOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSettings() {
    settingsPanel.classList.remove("open"); settingsOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  $("settingsOpenBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", closeSettings);

  // (tabs removed. The page now scrolls hero → requests → jobs → settings)

  var yr = $("acct-year");
  if (yr) yr.textContent = new Date().getFullYear();

  // Friendly auth errors: never show raw Firebase text to users.
  function friendlyAuthError(err) {
    var code = (err && err.code) || "";
    var map = {
      "auth/invalid-credential": "err_cred",
      "auth/wrong-password": "err_cred",
      "auth/user-not-found": "err_cred",
      "auth/email-already-in-use": "err_email_in_use",
      "auth/weak-password": "err_weak_password",
      "auth/too-many-requests": "err_too_many",
      "auth/network-request-failed": "err_network"
    };
    if (map[code]) return t(map[code]);
    var msg = (err && err.message) || t("err_default");
    msg = msg.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[a-z0-9-]+\)\.?$/i, "").trim();
    return msg || t("err_default");
  }

  function authError(err, elId) {
    var el = $(elId); el.textContent = friendlyAuthError(err);
    show(el);
  }

  // Busy state so a submit click never looks dead.
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true; btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  // Email/password login
  $("form-login").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("login-error")); hide($("login-reset-ok"));
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, t("signing_in"));
    auth.signInWithEmailAndPassword($("login-email").value.trim(), $("login-password").value.trim())
      .then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); authError(err, "login-error"); });
  });

  // Forgot password (mirrors the vendor dashboard pattern)
  $("login-forgot").addEventListener("click", function (e) {
    e.preventDefault(); hide($("login-error")); hide($("login-reset-ok"));
    var email = $("login-email").value.trim();
    if (!email) {
      var el = $("login-error");
      el.textContent = t("forgot_need_email");
      show(el); return;
    }
    auth.sendPasswordResetEmail(email).then(function () {
      var ok = $("login-reset-ok");
      ok.textContent = fillT("reset_sent", { email: email });
      show(ok);
    }).catch(function (err) { authError(err, "login-error"); });
  });

  // Email/password signup
  $("form-signup").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("signup-error"));
    var name = $("signup-name").value.trim();
    var email = $("signup-email").value.trim();
    var phone = $("signup-phone").value.trim();
    var pw = $("signup-password").value;
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, t("creating_account"));
    auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
      return db.collection("customers").doc(cred.user.uid).set({
        name: name, email: email, phone: phone, address: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); authError(err, "signup-error"); });
  });

  // Google sign-in (shared, mobile-safe)
  function googleSignIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function (cred) {
      var ref = db.collection("customers").doc(cred.user.uid);
      return ref.get().then(function (snap) {
        if (!snap.exists) {
          return ref.set({
            name: cred.user.displayName || "", email: cred.user.email || "",
            phone: "", address: "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    }).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request")) {
        auth.signInWithRedirect(provider);
      } else {
        authError(err, "login-error"); show($("form-login")); hide($("form-signup"));
      }
    });
  }
  $("google-login").addEventListener("click", googleSignIn);
  $("google-signup").addEventListener("click", googleSignIn);

  // Logout
  $("logout-btn").addEventListener("click", function () { auth.signOut(); });

  // Profile save (settings tab)
  $("profile-form").addEventListener("submit", function (e) {
    e.preventDefault(); hide($("profile-error")); hide($("profile-ok"));
    var user = auth.currentUser; if (!user) return;
    db.collection("customers").doc(user.uid).set({
      name: $("profile-name").value.trim(),
      phone: $("profile-phone").value.trim(),
      address: $("profile-address").value.trim(),
      email: user.email || ""
    }, { merge: true }).then(function () {
      show($("profile-ok"));
      pgName = $("profile-name").value.trim();
      if (pgName) renderGreeting();
    }).catch(function (err) { authError(err, "profile-error"); });
  });

  function daypart() {
    var h = new Date().getHours();
    if (h < 12) return t("greet_morning");
    if (h < 18) return t("greet_afternoon");
    return t("greet_evening");
  }
  function renderGreeting() {
    var g = $("dashboard-greeting"); if (g) g.textContent = daypart();
    var n = $("dashboard-name");
    if (n) n.textContent = String(pgName || "").trim().split(/\s+/)[0] || t("greet_there");
  }

  function pillFor(status) {
    var s = String(status || "new").toLowerCase().replace(/[\s-]+/g, "_");
    var cls = "pill-new", label = statusLabel(status || "New");
    if (s === "done" || s === "completed") { cls = "pill-done"; }
    else if (s === "in_progress" || s === "scheduled" || s === "accepted" || s === "confirmed" || s === "review") { cls = "pill-progress"; }
    else if (s === "cancelled" || s === "canceled" || s === "declined") { cls = "pill-cancel"; }
    return '<span class="pill ' + cls + '">' + esc(label) + "</span>";
  }

  function fmtDate(ts) {
    try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(pgLocale(), { month: "short", day: "numeric", year: "numeric" }) : ""; }
    catch (e) { return ""; }
  }
  function fmtDateKey(key) {
    if (!key) return "";
    var p = String(key).split("-");
    if (p.length !== 3) return String(key);
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString(pgLocale(), { month: "short", day: "numeric", year: "numeric" });
  }
  function freqLabel(f) {
    var m = { "One-time": "freq_once", "Weekly": "freq_weekly", "Biweekly": "freq_biweekly", "Monthly": "freq_monthly" };
    return m[f] ? t(m[f]) : String(f || "");
  }
  function tsMillis(ts) {
    try {
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      var t = new Date(ts).getTime();
      return isNaN(t) ? 0 : t;
    } catch (e) { return 0; }
  }

  // Staff-only "Admin dashboard" entry: visible when a staff/{uid} doc exists
  // or for the owner account; stays hidden for regular customers and on any error.
  function checkStaffEntry(user) {
    var btn = $("pgAdminBtn");
    if (!btn) return;
    // The button is hidden with an inline style="display:none" in the HTML,
    // so toggle the inline style directly — the class-based show()/hide()
    // helpers cannot override it (that mismatch kept the button invisible).
    btn.style.display = "none";
    if (!user) return;
    try {
      if (user.email === "edblucorp@gmail.com") { btn.style.display = ""; return; }
      db.collection("staff").doc(user.uid).get().then(function (snap) {
        if (snap && snap.exists) btn.style.display = "";
      }).catch(function () { /* leave hidden */ });
    } catch (e) { /* leave hidden */ }
  }

  // Auth state
  auth.onAuthStateChanged(function (user) {
    if (user) {
      pgUser = user;
      hide(authForms); hide($("account-hero-static")); show(dashboard);
      checkStaffEntry(user);
      var ref = db.collection("customers").doc(user.uid);
      ref.get().then(function (snap) {
        var d = snap.exists ? snap.data() : {};
        pgName = d.name || user.displayName || "";
        renderGreeting();
        $("profile-name").value = d.name || user.displayName || "";
        $("profile-phone").value = d.phone || "";
        $("profile-address").value = d.address || "";
        custInfo.name = d.name || user.displayName || "";
        custInfo.phone = d.phone || "";
        custInfo.email = d.email || user.email || "";
        var since = "-";
        if (d.createdAt && d.createdAt.toDate) since = d.createdAt.toDate().getFullYear();
        else if (user.metadata && user.metadata.creationTime) since = new Date(user.metadata.creationTime).getFullYear();
        $("stat-since").textContent = since;
        badgeCtx.memberYear = parseInt(since, 10) || 0; renderBadges();
      }).catch(function () {
        pgName = user.displayName || "";
        renderGreeting();
      });
      loadRequests(user.uid); loadJobs(user.uid); loadExtras(user); loadCustomerQuotes(user); loadCustCalendar(user);
    } else {
      liveOffAll();
      ccalLiveIds = {};
      ccalWos = [];
      pgUser = null; pgName = "";
      show(authForms); show($("account-hero-static")); hide(dashboard);
      checkStaffEntry(null);
    }
  });

  function emptyState(box, text, ctaHref, ctaText) {
    var cta = "";
    if (ctaHref === "modal") {
      cta = '<button type="button" class="btn btn-gold btn-sm" data-open-req>' + esc(ctaText) + "</button>";
    } else if (ctaHref) {
      cta = '<a class="btn btn-gold btn-sm" href="' + ctaHref + '">' + esc(ctaText) + "</a>";
    }
    box.innerHTML = '<div class="acct-empty"><p>' + esc(text) + "</p>" + cta + "</div>";
  }

  function loadRequests(uid) {
    // (no orderBy: composite index not guaranteed. Sort client-side)
    liveOn("req:" + uid, db.collection("service_requests").where("uid", "==", uid).limit(25), function (qs) {
        var box = $("requests-list");
        var active = 0;
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().createdAt) - tsMillis(a.data().createdAt); });
        docs = docs.slice(0, 10);
        if (!docs.length) {
          emptyState(box, t("empty_requests"), "modal", t("cta_req_service"));
          renderQuotes([]);
        } else {
          box.innerHTML = "";
          var quotes = [];
          docs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "new").toLowerCase();
            if (st === "quoted") { quotes.push(doc); return; } // shown in Action needed
            if (["new", "received", "in_progress", "scheduled", "accepted", "confirmed"].indexOf(st.replace(/[\s-]+/g, "_")) > -1) active++;
            var editable = st.replace(/[\s-]+/g, "_") === "new";
            var div = document.createElement("div"); div.className = "req-row";
            var mediaHtml = "";
            var rPhotos = Array.isArray(d.photos) ? d.photos : [];
            var rVideos = Array.isArray(d.videos) ? d.videos : [];
            if (rPhotos.length) {
              mediaHtml += '<div class="job-thumbs">' + rPhotos.slice(0, 4).map(function (u) {
                return '<img src="' + esc(u) + '" alt="Request photo" loading="lazy">';
              }).join("") + "</div>";
            }
            if (rVideos.length || d.videoLink) {
              mediaHtml += '<div class="req-vids">' + rVideos.map(function (u, i) {
                return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(fillT("video_n", { n: i + 1 })) + "</a>";
              }).join("") + (d.videoLink ? '<a href="' + esc(d.videoLink) + '" target="_blank" rel="noopener">' + esc(t("video_link")) + "</a>" : "") + "</div>";
            }
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span class="req-date"></span>' + timelineFor(st) + mediaHtml + '</div>' + pillFor(d.status) +
              '<button type="button" class="req-edit" data-add-media="' + doc.id + '">' + esc(t("add_media")) + "</button>" +
              (editable ? '<button type="button" class="req-edit" data-edit-req="' + doc.id + '">' + esc(t("edit")) + "</button>" : "");
            div.querySelector("strong").textContent = d.service || "Service request";
            div.querySelector(".req-date").textContent = fmtDate(d.createdAt);
            box.appendChild(div);
            var panel = document.createElement("div");
            panel.className = "req-media-panel hidden";
            panel.setAttribute("data-media-panel", doc.id);
            panel.innerHTML =
              '<label>' + esc(t("mp_photos")) + '<input type="file" accept="image/*" multiple data-mp-photos></label>' +
              '<label>' + t("mp_videos_html") + '<input type="file" accept="video/*" multiple data-mp-videos></label>' +
              '<label>' + esc(t("video_link_label")) + '<input type="text" data-mp-link placeholder="' + esc(t("mp_link_ph")) + '"></label>' +
              '<p class="req-media-msg" data-mp-msg></p>' +
              '<div class="req-media-btns"><button type="button" class="btn btn-gold btn-sm" data-mp-save>' + esc(t("mp_save_btn")) + "</button>" +
              '<button type="button" class="req-edit" data-mp-cancel>' + esc(t("mp_cancel")) + "</button></div>";
            box.appendChild(panel);
          });
          renderQuotes(quotes);
        }
        $("stat-requests").textContent = active;
      }, function () {
        emptyState($("requests-list"), t("load_err_requests"), null, null);
      });
  }

  function loadJobs(uid) {
    // (no orderBy: composite index not guaranteed. Sort client-side)
    liveOn("jobs:" + uid, db.collection("jobs").where("uid", "==", uid).limit(25), function (qs) {
        var box = $("jobs-list");
        var done = 0;
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().scheduledAt) - tsMillis(a.data().scheduledAt); });
        docs = docs.slice(0, 10);
        if (!docs.length) {
          emptyState(box, t("empty_jobs"), "index.html#services", t("cta_browse"));
          renderGallery([]);
        } else {
          box.innerHTML = "";
          var gallery = [];
          docs.forEach(function (doc) {
            var d = doc.data();
            var st = String(d.status || "scheduled").toLowerCase();
            if (st === "done" || st === "completed") done++;
            var div = document.createElement("div"); div.className = "req-row";
            var thumbs = "";
            if (Array.isArray(d.photos) && d.photos.length) {
              d.photos.slice(0, 4).forEach(function (u) { gallery.push({ url: u, service: d.service || "Job" }); });
              thumbs = '<div class="job-thumbs">' + d.photos.slice(0, 4).map(function (u) {
                return '<img src="' + esc(u) + '" alt="Job photo" loading="lazy">';
              }).join("") + "</div>";
            }
            var again = (st === "done" || st === "completed")
              ? '<button type="button" class="req-again" data-again="' + esc(d.service || "Lawn Care") + '">' + esc(t("book_again")) + "</button>" : "";
            div.innerHTML = '<span class="req-dot"></span><div class="req-main"><strong></strong><span class="req-date"></span>' + thumbs + "</div>" + pillFor(d.status) + again;
            div.querySelector("strong").textContent = d.service || "Job";
            div.querySelector(".req-date").textContent = fmtDate(d.scheduledAt);
            box.appendChild(div);
          });
          renderGallery(gallery);
        }
        $("stat-jobs").textContent = done;
        badgeCtx.jobsDone = done; renderBadges();
      }, function () {
        emptyState($("jobs-list"), t("load_err_jobs"), null, null);
      });
  }
  /* ---------- Dashboard extras: quotes, reorder, referrals, gallery, plan, properties, seasonal ---------- */

  function timelineFor(st) {
    var stages = [t("tl_received"), t("tl_scheduled"), t("tl_in_progress"), t("tl_done")];
    var idx = 0;
    if (["scheduled", "confirmed", "approved"].indexOf(st) > -1) idx = 1;
    else if (st === "in_progress") idx = 2;
    else if (["done", "completed"].indexOf(st) > -1) idx = 3;
    else if (["cancelled", "declined"].indexOf(st) > -1)
      return '<div class="req-tl"><span class="tl-cancel">' + esc(t("tl_cancelled")) + "</span></div>";
    var dots = "";
    for (var i = 0; i < 4; i++) dots += '<i class="' + (i <= idx ? "on" : "") + '"></i>';
    return '<div class="req-tl">' + dots + "<span>" + stages[idx] + "</span></div>";
  }

  function renderQuotes(list) {
    var sec = $("quoteSection"), box = $("quotes-list");
    if (!sec || !box) return;
    if (!list.length) { hide(sec); return; }
    show(sec);
    $("quoteCount").textContent = pluralT(list.length, "quote_count_one", "quote_count_many");
    box.innerHTML = "";
    list.forEach(function (doc) {
      var d = doc.data();
      var el = document.createElement("div"); el.className = "quote-card";
      el.innerHTML =
        '<div class="q-main"><strong></strong><span class="q-det"></span><span class="q-notes"></span></div>' +
        '<div class="q-side"><div class="q-price"></div>' +
        '<div class="q-btns"><button type="button" class="btn btn-gold btn-sm" data-qok>' + esc(t("approve_q")) + "</button>" +
        '<button type="button" class="btn-ghost-w btn-sm" data-qno>' + esc(t("decline_q")) + "</button></div></div>";
      el.querySelector("strong").textContent = d.service || "Service";
      el.querySelector(".q-det").textContent = d.message || "";
      el.querySelector(".q-notes").textContent = d.quoteNotes || "";
      el.querySelector(".q-price").textContent = d.quotePrice || "-";
      el.querySelector("[data-qok]").addEventListener("click", function () { decideQuote(doc.id, "approved"); });
      el.querySelector("[data-qno]").addEventListener("click", function () { decideQuote(doc.id, "declined"); });
      box.appendChild(el);
    });
  }

  function decideQuote(id, status) {
    var u = auth.currentUser; if (!u) return;
    db.collection("service_requests").doc(id)
      .update({ status: status, decidedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { loadRequests(u.uid); })
      .catch(function () { alert(t("quote_update_err")); });
  }


  /* ---------- Your calendar: visits + personal calendar connect ---------- */
  var PG_FEED_BASE_C = "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec";
  var CCAL_DATE_FIELDS = ["scheduledFor", "scheduledDate", "serviceDate", "appointmentDate", "date", "when"];
  var ccalMap = {}, ccalCursor = null, ccalSelected = "", ccalNextKey = "", ccalUser = null, ccalProfile = null, ccalWired = false;
  var ccalWos = [];        // raw work order rows behind ccalMap (live tracker reads these)
  var ccalLiveIds = {};    // work order ids with a live snapshot listener attached
  function ccalPad(n) { return (n < 10 ? "0" : "") + n; }
  function ccalKey(d) { return d.getFullYear() + "-" + ccalPad(d.getMonth() + 1) + "-" + ccalPad(d.getDate()); }
  function ccalParse(x) {
    if (!x) return null;
    if (typeof x.toDate === "function") { try { return x.toDate(); } catch (e) { return null; } }
    if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
    if (typeof x === "object" && typeof x.seconds === "number") return new Date(x.seconds * 1000);
    if (typeof x === "string" || typeof x === "number") { var d = new Date(x); return isNaN(d.getTime()) ? null : d; }
    return null;
  }
  function ccalBuild(wos) {
    ccalMap = {};
    function pushEv(w, d) {
      var k = ccalKey(d);
      if (!ccalMap[k]) ccalMap[k] = [];
      ccalMap[k].push({ w: w, date: new Date(d) });
    }
    (wos || []).forEach(function (w) {
      var anchor = w.planAnchor ? ccalParse(w.planAnchor) : null;
      var count = parseInt(w.visitCount, 10) || 0;
      if (anchor && count > 1) {
        var step = w.cadence === "weekly" ? 7 : 14;
        var t = ccalParse(w.scheduledFor);
        for (var i = 0; i < count; i++) {
          var d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i * step);
          if (t && (t.getHours() || t.getMinutes())) d.setHours(t.getHours(), t.getMinutes(), 0, 0);
          pushEv(w, d);
        }
      } else {
        var placed = false;
        for (var j = 0; j < CCAL_DATE_FIELDS.length; j++) {
          var dd = ccalParse(w[CCAL_DATE_FIELDS[j]]);
          if (dd) { pushEv(w, dd); placed = true; break; }
        }
        if (!placed) { var cd = ccalParse(w.createdAt); if (cd) pushEv(w, cd); }
      }
    });
    var todayK = ccalKey(new Date());
    ccalNextKey = "";
    Object.keys(ccalMap).sort().forEach(function (k) { if (!ccalNextKey && k >= todayK) ccalNextKey = k; });
  }
  function ccalStatus(ev) {
    var st = String(ev.w.status || "");
    // Live tracking stages (2026-10-17) outrank the calendar labels.
    if (st === "en_route") return { label: t("cal_on_way"), cls: "next" };
    if (st === "arrived") return { label: t("cal_arrived_crew"), cls: "next" };
    var todayK = ccalKey(new Date());
    var k = ccalKey(ev.date);
    var done = ["done", "completed", "review"].indexOf(st) >= 0;
    if (k < todayK) return done ? { label: t("cal_completed"), cls: "done" } : { label: t("cal_past"), cls: "" };
    if (k === ccalNextKey) return { label: t("cal_next_visit"), cls: "next" };
    return { label: t("st_scheduled"), cls: "" };
  }
  function ccalTime(ev) {
    var d = ev.date;
    return (d.getHours() || d.getMinutes()) ? d.toLocaleTimeString(pgLocale(), { hour: "numeric", minute: "2-digit" }) : "";
  }
  function renderCcal() {
    var grid = $("ccalGrid"); if (!grid) return;
    if (!ccalCursor) { var now = new Date(); ccalCursor = new Date(now.getFullYear(), now.getMonth(), 1); }
    var y = ccalCursor.getFullYear(), m = ccalCursor.getMonth();
    var titleEl = $("ccalTitle");
    if (titleEl) titleEl.textContent = ccalCursor.toLocaleDateString(pgLocale(), { month: "long", year: "numeric" });
    var pill = $("ccalNext");
    if (pill) {
      if (ccalNextKey && ccalMap[ccalNextKey]) {
        var nx = ccalMap[ccalNextKey].slice().sort(function (a, b) { return a.date - b.date; })[0];
        pill.textContent = fillT("next_label", { date: nx.date.toLocaleDateString(pgLocale(), { weekday: "short", month: "short", day: "numeric" }) }) + (ccalTime(nx) ? " · " + ccalTime(nx) : "");
      } else pill.textContent = "";
    }
    var firstDow = new Date(y, m, 1).getDay();
    var dim = new Date(y, m + 1, 0).getDate();
    var todayK = ccalKey(new Date());
    if (!ccalSelected) ccalSelected = ccalNextKey || todayK;
    var html = "";
    for (var b = 0; b < firstDow; b++) html += '<div class="ccal-cell empty"></div>';
    for (var day = 1; day <= dim; day++) {
      var k = ccalKey(new Date(y, m, day));
      var evs = ccalMap[k] || [];
      var dots = "";
      for (var i = 0; i < Math.min(evs.length, 3); i++) dots += '<span class="ccal-dot"></span>';
      html += '<button type="button" class="ccal-cell' + (k === todayK ? " today" : "") + (k === ccalSelected ? " sel" : "") + (k === ccalNextKey ? " nextv" : "") + '" data-ccal-day="' + k + '"><span>' + day + '</span><span class="ccal-dots">' + dots + "</span></button>";
    }
    grid.innerHTML = html;
    renderCcalDay();
  }
  function renderCcalDay() {
    var box = $("ccalDay"); if (!box) return;
    var evs = (ccalMap[ccalSelected] || []).slice().sort(function (a, b) { return a.date - b.date; });
    var dObj = ccalParse(ccalSelected + "T12:00:00");
    var head = dObj ? dObj.toLocaleDateString(pgLocale(), { weekday: "long", day: "numeric", month: "long" }) : ccalSelected;
    if (!evs.length) {
      box.innerHTML = '<div class="ccal-dayh">' + esc(head) + '</div><p class="ccal-none">' + esc(t("cal_none_day")) + "</p>";
      renderCustTracker();
      return;
    }
    box.innerHTML = '<div class="ccal-dayh">' + esc(head) + "</div>" + evs.map(function (ev) {
      var w = ev.w, st = ccalStatus(ev);
      var crew = w.vendorBusiness || t("crew_default");
      var meta = [ccalTime(ev), t("crew_label") + crew, w.address || ""].filter(Boolean).join(" · ");
      var photos = "";
      if (st.cls === "done" && Array.isArray(w.photos) && w.photos.length) {
        photos = '<div class="ccal-photos">' + w.photos.slice(0, 4).map(function (p) {
          var src = typeof p === "string" ? p : (p && (p.url || p.src)) || "";
          return src ? '<img src="' + esc(src) + '" alt="Visit photo" loading="lazy">' : "";
        }).join("") + "</div>";
      }
      return '<div class="ccal-ev"><div class="ccal-ev-tx"><strong>' + esc(w.title || w.category || t("visit_default")) + "</strong>" +
        (meta ? "<small>" + esc(meta) + "</small>" : "") + photos + '</div><span class="ccal-chip ' + st.cls + '">' + esc(st.label) + "</span></div>";
    }).join("");
    renderCustTracker();
  }

  /* Live visit tracker (2026-10-17): when the crew starts the trip,
     today's next-visit card becomes a live tracker. Stages come
     straight off the work order: Scheduled, On the way (enRouteAt),
     Arrived (arrivedAt), Done (status review/done, photos shown).
     Snapshot listeners on the work orders keep it current while the
     page is open; stage push notifications go out through the same
     push_tokens plumbing the portal already uses (send-push.mjs on
     the office side reads those docs). */
  function renderCustTracker() {
    var box = $("ccalTracker");
    if (!box) return;
    var todayK = ccalKey(new Date());
    var pick = null, pickEv = null;
    function score(w) {
      var st = String(w.status || "");
      if (st === "en_route" || st === "arrived") return 3;
      if (st === "review" || st === "done") return 2;
      if (w.enRouteAt || w.arrivedAt) return 2;
      return 1;
    }
    // A crew live right now wins, even over the calendar math.
    ccalWos.forEach(function (w) {
      var st = String(w.status || "");
      if ((st === "en_route" || st === "arrived") && (!pick || score(w) > score(pick))) pick = w;
    });
    if (!pick) {
      (ccalMap[todayK] || []).forEach(function (ev) {
        if (!pick || score(ev.w) > score(pick)) { pick = ev.w; pickEv = ev; }
      });
    }
    if (!pick) { box.innerHTML = ""; return; }
    var w = pick;
    var st = String(w.status || "");
    var idx = 0;
    if (w.enRouteAt || st === "en_route" || st === "arrived" || st === "review" || st === "done") idx = 1;
    if (w.arrivedAt || st === "arrived" || st === "review" || st === "done") idx = 2;
    if (st === "review" || st === "done") idx = 3;
    var names = [t("st_scheduled"), t("cal_on_way"), t("cal_arrived"), t("st_done")];
    var steps = names.map(function (n, i) {
      var cls = "ct-step" + (i < idx ? " on" : (i === idx ? " on now" : ""));
      return '<div class="' + cls + '">' + esc(n) + "</div>";
    }).join("");
    var live = "";
    if (idx === 1) live = t("live_1");
    else if (idx === 2) live = t("live_2");
    else if (idx === 3 && st === "review") live = t("live_3review");
    else if (idx === 3) live = t("live_3");
    else live = t("live_0");
    var photos = "";
    if (idx === 3 && Array.isArray(w.photos) && w.photos.length) {
      photos = '<div class="ccal-photos">' + w.photos.slice(0, 6).map(function (p) {
        var src = typeof p === "string" ? p : (p && (p.url || p.src)) || "";
        return src ? '<img src="' + esc(src) + '" alt="Visit photo" loading="lazy">' : "";
      }).join("") + "</div>";
    }
    var when = pickEv ? ccalTime(pickEv) : "";
    box.innerHTML = '<div class="ccal-track"><h4>' + esc(t("tracker_title")) + "</h4>" +
      '<p class="ct-sub">' + esc(w.title || w.category || t("visit_default")) + (when ? " · " + esc(when) : "") +
      " · " + esc(t("crew_label")) + esc(w.vendorBusiness || t("crew_default")) + "</p>" +
      '<div class="ct-steps">' + steps + "</div>" +
      (live ? '<p class="ct-live">' + esc(live) + "</p>" : "") + photos + "</div>";
  }
  function ccalNewToken() {
    var s = "", chars = "abcdef0123456789";
    for (var i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function ccalIcsText() {
    function escT(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function z(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrimeGuard//Customer Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PrimeGuard Visits"];
    var stamp = z(new Date());
    Object.keys(ccalMap).forEach(function (k) {
      ccalMap[k].forEach(function (ev, idx) {
        var w = ev.w;
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + (w.id || "wo") + "-" + k + "-" + idx + "@primeguardmia.com");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART:" + z(ev.date));
        lines.push("DTEND:" + z(new Date(ev.date.getTime() + 90 * 60000)));
        lines.push("SUMMARY:" + escT("PrimeGuard visit: " + (w.category || w.title || "Service")));
        if (w.address) lines.push("LOCATION:" + escT(w.address));
        lines.push("DESCRIPTION:" + escT("Your PrimeGuard service visit. Crew: " + (w.vendorBusiness || "PrimeGuard") + ". Questions? Call (786) 422-9674."));
        lines.push("END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function writeCustCalFeedSnapshot() {
    if (!ccalUser || !ccalProfile || !ccalProfile.calendarToken) return;
    try {
      db.collection("calendar_feeds").doc(ccalProfile.calendarToken).set({
        kind: "customer", ownerUid: ccalUser.uid, ics: ccalIcsText(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }
  function renderCcalConnect() {
    var box = $("ccalConnectBody"); if (!box || !ccalUser) return;
    var tok = ccalProfile && ccalProfile.calendarToken;
    if (!tok) {
      box.innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="ccalGenBtn">Create my calendar link</button>';
      var gb = $("ccalGenBtn");
      if (gb) gb.addEventListener("click", ccalSetToken);
      return;
    }
    var link = PG_FEED_BASE_C + "?feed=customer&id=" + encodeURIComponent(ccalUser.uid) + "&t=" + encodeURIComponent(tok);
    box.innerHTML = '<div class="ccal-linkrow"><input type="text" readonly id="ccalLink" value="' + esc(link) + '"><button type="button" class="btn btn-gold btn-sm" id="ccalCopy">Copy</button></div>' +
      '<p class="ccal-how">Google Calendar: Settings, then Add calendar, then From URL, paste the link. iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste the link.</p>' +
      '<button type="button" class="ccal-revoke" id="ccalRegen">Get a new link (the old one stops working)</button>';
    var cp = $("ccalCopy");
    if (cp) cp.addEventListener("click", function () {
      var i = $("ccalLink"); if (!i) return; i.select();
      try { navigator.clipboard.writeText(i.value); } catch (e) { try { document.execCommand("copy"); } catch (e2) {} }
      cp.textContent = "Copied \u2713";
      setTimeout(function () { var b = $("ccalCopy"); if (b) b.textContent = "Copy"; }, 1600);
    });
    var rg = $("ccalRegen");
    if (rg) rg.addEventListener("click", ccalSetToken);
  }
  function ccalSetToken() {
    if (!ccalUser) return;
    var old = ccalProfile && ccalProfile.calendarToken;
    var tok = ccalNewToken();
    db.collection("customers").doc(ccalUser.uid).set({ calendarToken: tok }, { merge: true }).then(function () {
      if (!ccalProfile) ccalProfile = {};
      ccalProfile.calendarToken = tok;
      if (old && old !== tok) db.collection("calendar_feeds").doc(old).delete().catch(function () {});
      renderCcalConnect();
      writeCustCalFeedSnapshot();
    }).catch(function () {});
  }
  function loadCustCalendar(u) {
    var sec = $("custCalSection");
    if (!sec || !u || !u.email) return;
    ccalUser = u;
    show(sec);
    if (!ccalWired) {
      ccalWired = true;
      var grid = $("ccalGrid");
      if (grid) grid.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest("[data-ccal-day]") : null;
        if (!t) return;
        ccalSelected = t.getAttribute("data-ccal-day");
        renderCcal();
      });
      var pv = $("ccalPrev"), nv = $("ccalNextBtn");
      if (pv) pv.addEventListener("click", function () { ccalCursor = new Date(ccalCursor.getFullYear(), ccalCursor.getMonth() - 1, 1); renderCcal(); });
      if (nv) nv.addEventListener("click", function () { ccalCursor = new Date(ccalCursor.getFullYear(), ccalCursor.getMonth() + 1, 1); renderCcal(); });
    }
    renderCcal();
    db.collection("customers").doc(u.uid).get().then(function (s) {
      ccalProfile = s.exists ? s.data() : {};
      renderCcalConnect();
      writeCustCalFeedSnapshot();
    }).catch(function () {});
    var email = String(u.email).toLowerCase();
    var seen = {}, woIds = [];
    function collect(qs) {
      qs.forEach(function (doc) {
        var d = doc.data();
        if (d.workOrderId && !seen[d.workOrderId]) { seen[d.workOrderId] = 1; woIds.push(d.workOrderId); addWo(d.workOrderId); }
      });
    }
    // Each newly discovered work order is fetched once, added to the
    // calendar rows, and then kept current by a per-doc snapshot
    // listener (the vendor's On my way tap and automatic arrival land
    // here within seconds, no refresh needed). The two quote queries
    // above are live listeners too, so a brand-new quote's work order
    // joins the calendar on its own.
    function addWo(id) {
      db.collection("work_orders").doc(id).get().then(function (s) {
        if (s.exists) {
          var row0 = Object.assign({ id: s.id }, s.data());
          var found0 = false;
          ccalWos = ccalWos.map(function (r) { if (r.id === id) { found0 = true; return row0; } return r; });
          if (!found0) ccalWos.push(row0);
        }
        ccalBuild(ccalWos);
        renderCcal();
        writeCustCalFeedSnapshot();
        if (ccalLiveIds[id]) return;
        ccalLiveIds[id] = 1;
        try {
          ccalLiveIds[id] = db.collection("work_orders").doc(id).onSnapshot(function (s2) {
            if (!s2.exists) return;
            var row = Object.assign({ id: s2.id }, s2.data());
            var found = false;
            ccalWos = ccalWos.map(function (r) { if (r.id === id) { found = true; return row; } return r; });
            if (!found) ccalWos.push(row);
            ccalBuild(ccalWos);
            renderCcal();
          }, function () {});
        } catch (e) {}
      }).catch(function () {});
    }
    liveOn("ccal-q1:" + email, db.collection("customer_quotes").where("customerEmail", "==", email).limit(25), collect, function () {});
    liveOn("ccal-q2:" + email, db.collection("customer_quotes").where("contact", "==", email).limit(25), collect, function () {});
  }

  // "Your quotes": the formal customer quotes staff built from a vendor
  // quote (customer_quotes collection), matched by the email the quote was
  // addressed to. Separate from the request quotes above. Any failure
  // (rules, network) hides the section silently.
  function loadCustomerQuotes(u) {
    var sec = $("custQuotesSection"), box = $("cust-quotes-list");
    if (!sec || !box || !u || !u.email) return;
    liveOn("cq:" + String(u.email).toLowerCase(), db.collection("customer_quotes").where("customerEmail", "==", String(u.email).toLowerCase()).limit(25), function (qs) {
        var docs = [];
        qs.forEach(function (doc) { docs.push(doc); });
        docs.sort(function (a, b) { return tsMillis(b.data().createdAt) - tsMillis(a.data().createdAt); });
        if (!docs.length) { hide(sec); return; }
        show(sec);
        $("custQuoteCount").textContent = pluralT(docs.length, "quote_count_one", "quote_count_many");
        box.innerHTML = "";
        docs.forEach(function (doc) {
          var d = doc.data();
          var signed = d.status === "signed";
          var el = document.createElement("div"); el.className = "quote-card";
          el.innerHTML =
            '<div class="q-main"><strong></strong><span class="q-det"></span></div>' +
            '<div class="q-side"><div class="q-price"></div>' +
            (signed
              ? '<span class="pill pill-done">' + esc(t("signed_badge")) + "</span>"
              : '<span class="pill pill-new">' + esc(t("awaiting_sig")) + "</span>" +
                '<div class="q-btns"><a class="btn btn-gold btn-sm" href="quote-sign.html?id=' + doc.id + '">' + esc(t("review_sign_btn")) + "</a></div>") +
            "</div>";
          el.querySelector("strong").textContent = d.service || "PrimeGuard quote";
          el.querySelector(".q-det").textContent = signed
            ? fillT("signed_on", { date: fmtDate(d.signedAt) }) + (d.payChoice === "deposit20" ? t("pay_deposit20") : t("pay_full_part"))
            : fillT("valid_until", { date: fmtDateKey(d.expiresAt) });
          el.querySelector(".q-price").textContent = "$" + (Number(d.total) || 0).toLocaleString();
          box.appendChild(el);
        });
      },
      function () { hide(sec); });
  }

  // One-tap reorder: opens the request window with a service preselected.
  function openReqService(name, addrNote) {
    openReq();
    if (addrNote) $("rwDetails").value = addrNote;
    rwSelect(name || "Lawn Care");
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-again]") : null;
    if (b) openReqService(b.getAttribute("data-again"));
  });

  function makeRefCode(name) {
    var base = String(name || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
    return base + "-" + Math.floor(100 + Math.random() * 900);
  }

  function loadReferral(u) {
    var body = $("referral-body"); if (!body) return;
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var code = d.referralCode || null;
      if (!code) {
        code = makeRefCode(d.name || u.displayName || "Friend");
        db.collection("customers").doc(u.uid).set({ referralCode: code }, { merge: true }).catch(function () {});
        db.collection("referral_codes").add({
          code: code, name: d.name || u.displayName || "", uid: u.uid, email: u.email || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      }
      $("refCodeVal").textContent = code;
      var rl = $("refLinkVal");
      if (rl) rl.textContent = "https://primeguardmia.com/quote.html?ref=" + code;
      db.collection("service_requests").where("referralCode", "==", code).get().then(function (qs) {
        $("refUses").textContent = qs.size;
        $("refCredit").textContent = "$" + (qs.size * 20);
        badgeCtx.refUses = qs.size; renderBadges();
        show($("refStats"));
      }).catch(function () { hide($("refStats")); });
    }).catch(function () { body.innerHTML = "<p>" + esc(t("ref_load_error")) + "</p>"; });
  }

  function loadPlan(u) {
    var body = $("plan-body"); if (!body) return;
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var p = d.plan || null;
      badgeCtx.hasPlan = !!(p && p.name); renderBadges();
      if (p && p.name) {
        body.innerHTML = '<div class="plan-name"></div><div class="plan-meta"></div>' +
          '<a class="btn btn-ghost btn-sm" href="plans.html" style="color:#ffd873;border-color:rgba(255,200,90,.4)">' + esc(t("plan_manage")) + "</a>";
        body.querySelector(".plan-name").textContent = p.name + (p.price ? ". " + p.price : "");
        body.querySelector(".plan-meta").textContent = p.nextBilling ? fillT("plan_next_billing", { date: p.nextBilling }) : "";
      } else {
        body.innerHTML = "<p>" + esc(t("plan_none")) + "</p>" +
          '<a class="btn btn-gold btn-sm" href="plans.html">' + esc(t("plan_browse")) + "</a>";
      }
    }).catch(function () { body.innerHTML = "<p>" + esc(t("plan_load_err")) + "</p>"; });
  }

  function renderGallery(items) {
    var card = $("galleryCard"), strip = $("gallery-strip");
    if (!card || !strip) return;
    if (!items.length) { hide(card); return; }
    show(card);
    strip.innerHTML = "";
    items.slice(0, 24).forEach(function (it) {
      var img = document.createElement("img");
      img.src = it.url; img.alt = it.service || "Job photo"; img.loading = "lazy";
      img.addEventListener("click", function () {
        $("lightboxImg").src = it.url; show($("lightbox")); document.body.style.overflow = "hidden";
      });
      strip.appendChild(img);
    });
  }

  var SEASON_TIPS = [
    { m: "January", mEs: "Enero", tip: "Dry season is here. Perfect time for exterior painting and pressure washing. Check irrigation for dry spots.", tipEs: "Llegó la temporada seca. Momento perfecto para pintura exterior y lavado a presión. Revisa el riego en busca de zonas secas." },
    { m: "February", mEs: "Febrero", tip: "Peak dry season: check the lawn for pests and trim trees before spring growth kicks in.", tipEs: "Plena temporada seca: revisa el césped en busca de plagas y poda los árboles antes del crecimiento de primavera." },
    { m: "March", mEs: "Marzo", tip: "Clean gutters before the rainy season arrives. Clogged gutters overflow into flower beds and foundations.", tipEs: "Limpia las canaletas antes de que llegue la temporada de lluvias. Las canaletas tapadas se desbordan hacia los canteros y los cimientos." },
    { m: "April", mEs: "Abril", tip: "Service your AC before the summer heat hits. A tune-up now beats a breakdown in August.", tipEs: "Hazle mantenimiento al aire acondicionado antes del calor del verano. Una revisión ahora vale más que una avería en agosto." },
    { m: "May", mEs: "Mayo", tip: "Rainy season is starting. Check drainage around the house and seal windows and doors.", tipEs: "Comienza la temporada de lluvias. Revisa el drenaje alrededor de la casa y sella ventanas y puertas." },
    { m: "June", mEs: "Junio", tip: "Hurricane season begins: trim tree limbs away from the roof and secure loose outdoor items.", tipEs: "Comienza la temporada de huracanes: poda las ramas cercanas al techo y asegura los objetos sueltos del exterior." },
    { m: "July", mEs: "Julio", tip: "Watch for lawn fungus in the heat and rain. Mow high and water early in the morning.", tipEs: "Vigila los hongos en el césped con el calor y la lluvia. Corta alto y riega temprano en la mañana." },
    { m: "August", mEs: "Agosto", tip: "Peak storm season: review your hurricane prep checklist and make sure drains run clear.", tipEs: "Plena temporada de tormentas: revisa tu lista de preparación para huracanes y asegúrate de que los drenajes corran libres." },
    { m: "September", mEs: "Septiembre", tip: "Peak hurricane month. Keep gutters, drains, and the roof clear of debris.", tipEs: "El mes más fuerte de huracanes. Mantén canaletas, drenajes y techo libres de escombros." },
    { m: "October", mEs: "Octubre", tip: "Storm season winds down: schedule a post-season roof check and yard cleanup.", tipEs: "La temporada de tormentas termina: agenda una revisión del techo y una limpieza del patio." },
    { m: "November", mEs: "Noviembre", tip: "Dry season returns. Ideal for pressure washing driveways and patios before the holidays.", tipEs: "Vuelve la temporada seca. Ideal para lavar a presión entradas y patios antes de las fiestas." },
    { m: "December", mEs: "Diciembre", tip: "Cool snaps can hurt tropical plants. Cover sensitive landscaping on cold nights.", tipEs: "Los frentes fríos pueden dañar las plantas tropicales. Cubre el jardín sensible en las noches frías." }
  ];
  function renderSeason() {
    var s = SEASON_TIPS[new Date().getMonth()];
    if ($("seasonMonth")) $("seasonMonth").textContent = currentLang === "es" ? s.mEs : s.m;
    if ($("seasonTip")) $("seasonTip").textContent = currentLang === "es" ? s.tipEs : s.tip;
  }

  function loadProps(u) {
    db.collection("customers").doc(u.uid).get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      renderProps(u, d.properties || []);
    }).catch(function () {});
  }
  function renderProps(u, props) {
    var box = $("props-list"); if (!box) return;
    badgeCtx.propCount = props.length; renderBadges();
    box.innerHTML = "";
    if (!props.length)
      box.innerHTML = '<p class="pfaint">' + esc(t("props_empty")) + "</p>";
    props.forEach(function (p) {
      var row = document.createElement("div"); row.className = "prop-row";
      row.innerHTML = '<div class="p-main"><strong></strong><span></span></div>' +
        '<button type="button" class="btn btn-gold btn-sm" data-preq>' + esc(t("cta_req_service")) + "</button>" +
        '<button type="button" class="prop-del" data-pdel aria-label="Remove property">×</button>';
      row.querySelector("strong").textContent = p.label || "Property";
      row.querySelector("span").textContent = p.address || "";
      row.querySelector("[data-preq]").addEventListener("click", function () {
        openReqService(null, "Property: " + (p.label || "") + ". " + (p.address || "") + "\n\n");
      });
      row.querySelector("[data-pdel]").addEventListener("click", function () {
        if (!confirm(t("prop_delete_confirm"))) return;
        db.collection("customers").doc(u.uid).set({
          properties: firebase.firestore.FieldValue.arrayRemove(p)
        }, { merge: true }).then(function () { loadProps(u); }).catch(function () {});
      });
      box.appendChild(row);
    });
  }

  var extrasWired = false;
  function loadExtras(u) {
    loadReferral(u); loadPlan(u); loadProps(u); renderSeason(); renderBadges();
    if (extrasWired) return;   // one-time click wiring below; loaders above are safe to re-run on a language toggle
    extrasWired = true;
    var rc = $("refCopy");
    if (rc) rc.addEventListener("click", function () {
      var c = $("refCodeVal").textContent;
      function ok() { rc.textContent = t("copied_bang"); setTimeout(function () { rc.textContent = t("copy"); }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok).catch(ok); else ok();
    });
    var rlc = $("refLinkCopy");
    if (rlc) rlc.addEventListener("click", function () {
      var c = ($("refLinkVal") || {}).textContent || "";
      function ok2() { rlc.textContent = t("copied_bang"); setTimeout(function () { rlc.textContent = t("copy_link"); }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok2).catch(ok2); else ok2();
    });
    var pa = $("propAdd");
    if (pa) pa.addEventListener("click", function () {
      var label = $("propLabel").value.trim(), addr = $("propAddr").value.trim();
      if (!addr) { $("propAddr").focus(); return; }
      db.collection("customers").doc(u.uid).set({
        properties: firebase.firestore.FieldValue.arrayUnion({ label: label || "Property", address: addr })
      }, { merge: true }).then(function () {
        $("propLabel").value = ""; $("propAddr").value = ""; loadProps(u);
      }).catch(function () { alert(t("prop_save_err")); });
    });
    var lb = $("lightbox");
    if (lb) {
      lb.addEventListener("click", function () { hide(lb); document.body.style.overflow = ""; });
    }
  }

  /* ---------- Achievements / badges ---------- */
  var badgeCtx = { jobsDone: 0, refUses: 0, hasPlan: false, propCount: 0, memberYear: 0 };
  var BADGES = [
    { id: "founder", icon: "🎖️", name: "Founding Member", hint: "Joined in 2026", earned: function (c) { return c.memberYear === 2026; } },
    { id: "first", icon: "🌟", name: "First Service", hint: "Complete 1 service", earned: function (c) { return c.jobsDone >= 1; } },
    { id: "loyal", icon: "🏠", name: "Loyal Customer", hint: "Complete 5 services", earned: function (c) { return c.jobsDone >= 5; } },
    { id: "royal", icon: "👑", name: "Royalty", hint: "Complete 10 services", earned: function (c) { return c.jobsDone >= 10; } },
    { id: "ref1", icon: "🎁", name: "Referral Star", hint: "1 friend joined", earned: function (c) { return c.refUses >= 1; } },
    { id: "ref5", icon: "🚀", name: "Super Connector", hint: "5 friends joined", earned: function (c) { return c.refUses >= 5; } },
    { id: "plan", icon: "💎", name: "Plan Member", hint: "Join a plan", earned: function (c) { return c.hasPlan; } },
    { id: "mogul", icon: "🏘️", name: "Property Mogul", hint: "Add 2 properties", earned: function (c) { return c.propCount >= 2; } }
  ];
  function renderBadges() {
    var grid = $("badgeGrid"); if (!grid) return;
    var n = 0;
    grid.innerHTML = "";
    BADGES.forEach(function (b) {
      var e = false;
      try { e = b.earned(badgeCtx); } catch (err) {}
      if (e) n++;
      var d = document.createElement("div");
      d.className = "badge" + (e ? "" : " locked");
      d.innerHTML = '<div class="medal">' + b.icon + '</div><div class="bname"></div><div class="bhint"></div>';
      d.querySelector(".bname").textContent = t("badge_" + b.id);
      d.querySelector(".bhint").textContent = e ? t("badge_earned_word") : t("badge_" + b.id + "_hint");
      grid.appendChild(d);
    });
    var c = $("badgeCount");
    if (c) c.textContent = n + " / " + BADGES.length;
  }

  /* ---------- Rich request window ---------- */
  var reqModal = $("reqModal");
  var custInfo = { name: "", phone: "", email: "" };
  var reqPhotos = [];      // dataURLs picked in the window
  var rwVideoFiles = [];   // File objects picked in the window (videos)
  var editingReqId = null; // service_requests doc id being edited, or null
  var rwSvc = null, rwFreq = "One-time";

  // SERVICES[].name stays canonical English: it is stored in Firestore
  // payloads and matched by admin/vendor flows. Only the display localizes
  // (nameEs/descEs/benefitsEs via svcCopy).
  var SERVICES = [
    { name: "Lawn Care", price: "$45", img: "assets/acard-lawn-care.jpg",
      desc: "Mowing, edging, and cleanup on a schedule you can count on. Through South Florida's year-round growing season.",
      benefits: ["Precision mow at the right height for your grass", "Crisp edging along driveways, walkways & beds", "Full blow-off. No clippings left behind", "One-time cleanups or a set schedule, your call", "A yard that looks sharp every single visit"],
      nameEs: "Cuidado del césped",
      descEs: "Corte, bordeado y limpieza con un horario en el que puedes confiar. Durante todo el año de crecimiento del sur de la Florida.",
      benefitsEs: ["Corte de precisión a la altura correcta para tu césped", "Bordeado nítido en entradas, aceras y canteros", "Soplado completo. Sin recortes olvidados", "Limpiezas únicas o un horario fijo, tú decides", "Un patio que se ve impecable en cada visita"] },
    { name: "Pressure Washing", price: "$149", img: "assets/acard-pressure-washing.jpg",
      desc: "Driveways, walkways, patios, and exteriors brought back to clean. Years of grime, gone in an afternoon.",
      benefits: ["Driveways, walkways, patios, siding & fences", "Mold, mildew & years of grime gone in an afternoon", "Curb appeal that transforms your home's look", "Safe wash methods for concrete, pavers & stucco", "We walk the results with you before we leave"],
      nameEs: "Lavado a presión",
      descEs: "Entradas, aceras, patios y exteriores que vuelven a lucir limpios. Años de suciedad, eliminados en una tarde.",
      benefitsEs: ["Entradas, aceras, patios, revestimientos y cercas", "Moho y años de suciedad eliminados en una tarde", "Una fachada que transforma el aspecto de tu casa", "Métodos de lavado seguros para concreto, adoquines y estuco", "Revisamos los resultados contigo antes de irnos"] },
    { name: "Debris & Junk Removal", price: "$89", img: "assets/acard-junk-removal.jpg",
      desc: "Yard debris, old furniture, and clutter hauled away. You point, we lift, it's gone.",
      benefits: ["Furniture, yard debris, appliances & clutter", "You point, we lift. Zero heavy lifting for you", "Fast pickup scheduling that fits your week", "Hauled away and disposed of responsibly", "Upfront price before anything leaves your property"],
      nameEs: "Remoción de escombros y basura",
      descEs: "Escombros del patio, muebles viejos y desorden retirados. Tú señalas, nosotros cargamos, y desaparece.",
      benefitsEs: ["Muebles, escombros de patio, electrodomésticos y desorden", "Tú señalas, nosotros cargamos. Cero esfuerzo para ti", "Recogida rápida programada a tu conveniencia", "Retirado y desechado de forma responsable", "Precio claro antes de que nada salga de tu propiedad"] },
    { name: "Make-Ready Cleaning", price: "$179", img: "assets/acard-make-ready.jpg",
      desc: "Turnover cleans that get rentals and listings guest-ready. Kitchens, baths, floors, and details.",
      benefits: ["Deep move-in / move-out cleans", "Kitchens, baths, floors & all the details", "Rentals and listings guest-ready, fast", "Checklist clean. Nothing gets missed", "Perfect for landlords, realtors & Airbnb hosts"],
      nameEs: "Limpieza de entrega",
      descEs: "Limpiezas de cambio de inquilino que dejan alquileres y propiedades listos para huéspedes. Cocinas, baños, pisos y detalles.",
      benefitsEs: ["Limpiezas profundas de entrada y salida", "Cocinas, baños, pisos y todos los detalles", "Alquileres y propiedades listos para huéspedes, rápido", "Limpieza con lista de verificación. Nada se escapa", "Perfecto para propietarios, agentes de bienes raíces y anfitriones de Airbnb"] },
    { name: "Handyman Services", price: "$65", img: "assets/acard-handyman.jpg",
      desc: "Small repairs and punch-list items done right the first time. One call handles the whole list.",
      benefits: ["Small repairs, installs & punch-list items", "One visit handles your whole list", "Done right the first time. Guaranteed", "Upfront pricing before work starts", "Respectful of your home: tidy work, every time"],
      nameEs: "Servicios de handyman",
      descEs: "Reparaciones pequeñas y pendientes hechos bien a la primera. Una sola llamada resuelve toda la lista.",
      benefitsEs: ["Reparaciones pequeñas, instalaciones y pendientes", "Una visita resuelve toda tu lista", "Bien hecho a la primera. Garantizado", "Precio claro antes de comenzar el trabajo", "Respeto por tu hogar: trabajo limpio, siempre"] }
  ];
  function svcCopy(s) {
    if (currentLang === "es") return { displayName: s.nameEs || s.name, desc: s.descEs || s.desc, benefits: s.benefitsEs || s.benefits };
    return { displayName: s.name, desc: s.desc, benefits: s.benefits };
  }

  // Build the service cards (rebuilt on a language toggle).
  function renderSvcCards() {
    var list = $("rwSvcList");
    if (!list) return;
    list.innerHTML = "";
    SERVICES.forEach(function (s) {
      var cp = svcCopy(s);
      var b = document.createElement("button");
      b.className = "rw-svc"; b.type = "button";
      b.innerHTML = '<img src="' + s.img + '" alt="' + esc(cp.displayName) + '" loading="lazy">' +
        '<div class="b"><h3>' + esc(cp.displayName) + '</h3>' +
        '<div class="pr">' + esc(t("from_word")) + ' <strong>' + esc(s.price) + '</strong></div>' +
        '<p>' + esc(cp.desc) + '</p></div>';
      b.addEventListener("click", function () { rwSelect(s.name); });
      list.appendChild(b);
    });
  }
  renderSvcCards();

  function rwStep(n) {
    [1, 2, 3].forEach(function (i) {
      var sec = $("rwStep" + i);
      if (sec) sec.classList.toggle("hidden", i !== n);
    });
    $("rwDone").classList.add("hidden");
    document.querySelectorAll("#rwSteps .rw-st").forEach(function (d) {
      var s = parseInt(d.getAttribute("data-s"), 10);
      d.classList.toggle("active", s === n);
      d.classList.toggle("done", s < n);
      d.querySelector(".dot").textContent = s < n ? "✓" : s;
    });
    var body = reqModal.querySelector(".rw-body");
    if (body) body.scrollTop = 0;
  }

  function rwSelect(name) {
    var s = null;
    SERVICES.forEach(function (x) { if (x.name === name) s = x; });
    if (!s) s = SERVICES[0];
    rwSvc = s;
    var cp = svcCopy(s);
    $("rwImg").src = s.img; $("rwImg").alt = cp.displayName;
    $("rwName").textContent = cp.displayName;
    $("rwPrice").textContent = s.price;
    $("rwBenefits").innerHTML = cp.benefits.map(function (b) {
      return '<li><span class="rw-ck">✓</span><span>' + esc(b) + '</span></li>';
    }).join("");
    rwStep(2);
  }

  function openReq() {
    rwSvc = null; rwFreq = "One-time"; editingReqId = null; reqPhotos = [];
    $("rwTitle").textContent = t("req_new_title");
    $("rwDetails").value = ""; $("rwPhotos").value = ""; $("rwPreview").innerHTML = "";
    rwVideoFiles = []; $("rwVideos").value = ""; $("rwVideoLink").value = "";
    $("rwVideoList").innerHTML = ""; $("rwVideoMsg").textContent = ""; hide($("rwVideoMsg"));
    hide($("reqError"));
    $("rwSend").textContent = t("send_request");
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (c, i) { c.classList.toggle("active", i === 0); });
    rwStep(1);
    reqModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function openReqEdit(id, d) {
    editingReqId = id; reqPhotos = [];
    rwFreq = d.frequency || "One-time";
    $("rwTitle").textContent = t("req_edit_title");
    $("rwDetails").value = d.message || "";
    $("rwPhotos").value = ""; $("rwPreview").innerHTML = "";
    rwVideoFiles = []; $("rwVideos").value = "";
    $("rwVideoLink").value = d.videoLink || "";
    $("rwVideoList").innerHTML = ""; $("rwVideoMsg").textContent = ""; hide($("rwVideoMsg"));
    if (Array.isArray(d.videos) && d.videos.length) {
      $("rwVideoList").textContent = d.videos.length === 1 ? t("vid_on_one") : fillT("vid_on_many", { n: d.videos.length });
    }
    hide($("reqError"));
    $("rwSend").textContent = t("save_changes");
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-freq") === rwFreq);
    });
    rwSelect(d.service || "Lawn Care"); // lands on step 2 with details prefilled
    reqModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeReq() {
    reqModal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  $("reqNewBtn").addEventListener("click", openReq);
  $("reqClose").addEventListener("click", closeReq);
  reqModal.addEventListener("click", function (e) { if (e.target === reqModal) closeReq(); });
  document.addEventListener("click", function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-open-req")) openReq();
    var eb = e.target && e.target.closest ? e.target.closest("[data-edit-req]") : null;
    if (eb) {
      var rid = eb.getAttribute("data-edit-req");
      db.collection("service_requests").doc(rid).get().then(function (snap) {
        if (snap.exists) openReqEdit(rid, snap.data());
      });
    }
  });

  // "Add photos / video" panels on request cards: append media to an existing request.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var ab = t.closest("[data-add-media]");
    if (ab) {
      var pid = ab.getAttribute("data-add-media");
      document.querySelectorAll("[data-media-panel]").forEach(function (p) {
        if (p.getAttribute("data-media-panel") === pid) p.classList.toggle("hidden");
        else p.classList.add("hidden");
      });
      return;
    }
    var cb = t.closest("[data-mp-cancel]");
    if (cb) { var cp = cb.closest("[data-media-panel]"); if (cp) cp.classList.add("hidden"); return; }
    var sb = t.closest("[data-mp-save]");
    if (sb) saveReqMedia(sb);
  });

  function saveReqMedia(btn) {
    var user = auth.currentUser; if (!user) return;
    var panel = btn.closest("[data-media-panel]"); if (!panel) return;
    var id = panel.getAttribute("data-media-panel");
    var msg = panel.querySelector("[data-mp-msg]");
    var photoFiles = Array.prototype.slice.call(panel.querySelector("[data-mp-photos]").files || []);
    var videoFiles = Array.prototype.slice.call(panel.querySelector("[data-mp-videos]").files || []);
    var link = panel.querySelector("[data-mp-link]").value.trim();
    if (!photoFiles.length && !videoFiles.length && !link) {
      msg.textContent = t("mp_pick_first");
      return;
    }
    btn.disabled = true;
    msg.textContent = t("mp_uploading_short");
    var ref = db.collection("service_requests").doc(id);
    ref.get().then(function (snap) {
      var d = snap.exists ? snap.data() : {};
      var exPhotos = Array.isArray(d.photos) ? d.photos.slice() : [];
      var exVideos = Array.isArray(d.videos) ? d.videos.slice() : [];
      return Promise.all([
        uploadPhotoFiles(photoFiles, "service-request-photos"),
        uploadVideoFiles(videoFiles, "service-request-photos")
      ]).then(function (res) {
        var update = {};
        if (res[0].length) update.photos = exPhotos.concat(res[0]);
        if (res[1].urls.length) update.videos = exVideos.concat(res[1].urls);
        if (link && !d.videoLink) update.videoLink = link;
        var skippedNote = res[1].skipped.length
          ? fillT("mp_skipped_note", { names: res[1].skipped.join(", ") })
          : "";
        if (!Object.keys(update).length) {
          msg.textContent = t("mp_nothing_new") + skippedNote;
          btn.disabled = false;
          return null;
        }
        // Same doc.update path the portal's edit-request save uses.
        return ref.update(update).then(function () {
          msg.textContent = t("mp_added") + skippedNote;
          setTimeout(function () { loadRequests(user.uid); }, 1200);
        });
      });
    }).catch(function () {
      msg.textContent = t("mp_add_err");
      btn.disabled = false;
    });
  }

  $("rwBack2").addEventListener("click", function () { rwStep(1); });
  $("rwBack2b").addEventListener("click", function () { rwStep(1); });
  $("rwBack3").addEventListener("click", function () { rwStep(2); });
  $("rwDoneBtn").addEventListener("click", closeReq);

  $("rwFreq").addEventListener("click", function (e) {
    var c = e.target.closest ? e.target.closest(".rw-chip") : null;
    if (!c) return;
    document.querySelectorAll("#rwFreq .rw-chip").forEach(function (x) { x.classList.remove("active"); });
    c.classList.add("active");
    rwFreq = c.getAttribute("data-freq");
  });

  // photo picker in the window
  $("rwPhotoBtn").addEventListener("click", function () { $("rwPhotos").click(); });
  $("rwPhotos").addEventListener("change", function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) {
      if (reqPhotos.length >= 6) return;
      var r = new FileReader();
      r.onload = function () {
        reqPhotos.push(r.result);
        var img = document.createElement("img");
        img.src = r.result; img.alt = "request photo";
        $("rwPreview").appendChild(img);
      };
      r.readAsDataURL(f);
    });
  });

  /* ----- Media upload helpers (shared: request window + request cards) ----- */
  var VIDEO_MAX_BYTES = 25 * 1024 * 1024;
  function fmtMB(b) { return (b / (1024 * 1024)).toFixed(1) + " MB"; }
  function uploadEndpoint() { return (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || ""; }
  function readAsDataURL(f) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.readAsDataURL(f);
    });
  }
  // Photos: same photo-upload pattern the window already uses (dataURLs in, URLs out).
  function uploadPhotoFiles(files, folder) {
    var ep = uploadEndpoint();
    if (!files.length || !ep) return Promise.resolve([]);
    return Promise.all(files.map(readAsDataURL)).then(function (dus) {
      dus = dus.filter(Boolean);
      if (!dus.length) return [];
      return fetch(ep, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "photo-upload", folder: folder, photos: dus }) })
        .then(function (r) { return r.json(); })
        .then(function (out) { return (out && out.urls) || []; })
        .catch(function () { return []; });
    });
  }
  // One video via the generic doc-upload pattern (FileReader -> POST). The saved
  // URL comes back as out.urls[0] (same {ok, urls} shape as photo-upload).
  function uploadOneVideo(f, folder) {
    var ep = uploadEndpoint();
    if (!ep) return Promise.resolve(null);
    return readAsDataURL(f).then(function (dataUrl) {
      if (!dataUrl) return null;
      return fetch(ep, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "doc-upload", folder: folder, name: f.name, mime: f.type, data: dataUrl }) })
        .then(function (r) { return r.json(); })
        .then(function (out) { return (out && out.ok && out.urls && out.urls.length) ? out.urls[0] : null; })
        .catch(function () { return null; });
    });
  }
  // Videos upload ONE BY ONE. Files over 25 MB are skipped (never fatal).
  function uploadVideoFiles(files, folder) {
    var urls = [], skipped = [];
    var chain = Promise.resolve();
    files.forEach(function (f) {
      if (f.size > VIDEO_MAX_BYTES) { skipped.push(f.name); return; }
      chain = chain.then(function () { return uploadOneVideo(f, folder); })
        .then(function (u) { if (u) urls.push(u); });
    });
    return chain.then(function () { return { urls: urls, skipped: skipped }; });
  }

  // video picker in the window
  $("rwVideoBtn").addEventListener("click", function () { $("rwVideos").click(); });
  $("rwVideos").addEventListener("change", function (e) {
    rwVideoFiles = Array.prototype.slice.call(e.target.files || []);
    var list = $("rwVideoList"); list.innerHTML = "";
    var over = 0;
    rwVideoFiles.forEach(function (f) {
      var d = document.createElement("div");
      if (f.size > VIDEO_MAX_BYTES) {
        over++;
        d.textContent = fillT("vid_too_big_attach", { name: f.name, size: fmtMB(f.size) });
        d.style.color = "#b3541e"; d.style.fontWeight = "700";
      } else {
        d.textContent = "🎬 " + f.name + " (" + fmtMB(f.size) + ")";
      }
      list.appendChild(d);
    });
    var msg = $("rwVideoMsg");
    if (over) {
      msg.textContent = t("vid_over_msg");
      show(msg);
    } else { msg.textContent = ""; hide(msg); }
  });

  $("rwToReview").addEventListener("click", function () {
    if (!rwSvc) return;
    var det = $("rwDetails").value.trim() || "-";
    $("rwRevName").textContent = custInfo.name || "you";
    $("rwRevContact").textContent = custInfo.phone || custInfo.email || "";
    $("rwRevBox").innerHTML =
      '<div class="rw-rrow"><span class="k">' + esc(t("rev_service")) + '</span><span class="v">' + esc(svcCopy(rwSvc).displayName) + esc(fillT("rev_from", { price: rwSvc.price })) + '</span></div>' +
      '<div class="rw-rrow"><span class="k">' + esc(t("rev_frequency")) + '</span><span class="v">' + esc(freqLabel(rwFreq)) + '</span></div>' +
      '<div class="rw-rrow"><span class="k">' + esc(t("rev_details")) + '</span><span class="v">' + esc(det) + '</span></div>' +
      (reqPhotos.length ? '<div class="rw-rrow"><span class="k">' + esc(t("rev_photos")) + '</span><span class="v">' + esc(fillT("attached", { n: reqPhotos.length })) + '</span></div>' : '') +
      (rwVideoFiles.filter(function (f) { return f.size <= VIDEO_MAX_BYTES; }).length ? '<div class="rw-rrow"><span class="k">' + esc(t("rev_videos")) + '</span><span class="v">' + esc(fillT("attached", { n: rwVideoFiles.filter(function (f) { return f.size <= VIDEO_MAX_BYTES; }).length })) + '</span></div>' : '') +
      ($("rwVideoLink").value.trim() ? '<div class="rw-rrow"><span class="k">' + esc(t("rev_video_link")) + '</span><span class="v">' + esc($("rwVideoLink").value.trim()) + '</span></div>' : '');
    rwStep(3);
  });

  $("rwSend").addEventListener("click", function () {
    hide($("reqError"));
    var user = auth.currentUser;
    if (!user || !rwSvc) return;
    var btn = $("rwSend");
    var isEdit = !!editingReqId;
    btn.disabled = true; btn.textContent = isEdit ? t("saving") : t("sending");

    function save(urls, vres) {
      var payload = {
        service: rwSvc.name, frequency: rwFreq,
        message: $("rwDetails").value.trim()
      };
      if (urls && urls.length) payload.photos = urls;
      if (vres && vres.urls.length) payload.videos = vres.urls;
      var vlink = $("rwVideoLink").value.trim();
      if (vlink) payload.videoLink = vlink;
      if (isEdit) {
        return db.collection("service_requests").doc(editingReqId).update(payload);
      }
      payload.uid = user.uid;
      payload.name = custInfo.name; payload.phone = custInfo.phone; payload.email = custInfo.email;
      payload.status = "new"; payload.source = "account-dashboard";
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection("service_requests").add(payload);
    }

    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    var uploadP = (reqPhotos.length && endpoint)
      ? fetch(endpoint, { method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ type: "photo-upload", folder: "service-request-photos", photos: reqPhotos }) })
        .then(function (r) { return r.json(); }).then(function (out) { return out.urls || []; })
        .catch(function () { return []; })
      : Promise.resolve([]);

    var videoP = uploadVideoFiles(rwVideoFiles, "service-request-photos");
    Promise.all([uploadP, videoP]).then(function (res) {
      return save(res[0], res[1]).then(function () { return res[1]; });
    }).then(function (vres) {
      $("rwStep3").classList.add("hidden");
      $("rwDone").classList.remove("hidden");
      $("rwDoneTitle").textContent = isEdit ? t("done_saved") : t("done_received");
      $("rwDoneSummary").textContent = isEdit
        ? fillT("done_summary_edit", { svc: rwSvc.name.toLowerCase() })
        : fillT("done_summary_new", { svc: rwSvc.name.toLowerCase(), freq: freqLabel(rwFreq).toLowerCase() });
      if (vres && vres.skipped.length) {
        $("rwDoneSummary").textContent += fillT("done_skipped_note", { names: vres.skipped.join(", ") });
      }
      document.querySelectorAll("#rwSteps .rw-st").forEach(function (d) {
        d.classList.remove("active"); d.classList.add("done");
        d.querySelector(".dot").textContent = "✓";
      });
      // Email Edwin instantly via the website lead endpoint (same alerts as the quote form).
      if (!isEdit) {
        try {
          var lep = (window.SITE_CONFIG && window.SITE_CONFIG.leadEndpoint) || "";
          if (lep) {
            fetch(lep, {
              method: "POST", mode: "no-cors",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                name: custInfo.name, phone: custInfo.phone, email: custInfo.email,
                service: "Dashboard request: " + rwSvc.name + " (" + rwFreq + ")",
                message: $("rwDetails").value.trim() +
                  ((vres && vres.urls.length) ? "\nVideos: " + vres.urls.join(", ") : "") +
                  ($("rwVideoLink").value.trim() ? "\nVideo link: " + $("rwVideoLink").value.trim() : ""),
                source: "account-dashboard", uid: user.uid,
                timestamp: new Date().toISOString()
              })
            }).catch(function () {});
          }
        } catch (e) {}
      }
      loadRequests(user.uid);
    }).catch(function (err) {
      var el = $("reqError");
      el.textContent = (err && err.message) || t("send_err");
      show(el);
    }).then(function () {
      btn.disabled = false; btn.textContent = isEdit ? t("save_changes") : t("send_request");
    });
  });

  // keep customer info fresh for request submissions
})();

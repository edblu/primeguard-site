// PrimeGuard vendor dashboard (Firebase Auth + Firestore).
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  if (!cfg || !cfg.apiKey) return;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var $ = function (id) { return document.getElementById(id); };
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // Friendly auth errors: never show raw Firebase text to users.
  function friendlyAuthError(err) {
    var code = (err && err.code) || "";
    var map = {
      "auth/invalid-credential": "err_invalid_long",
      "auth/wrong-password": "err_invalid_long",
      "auth/user-not-found": "err_invalid_long",
      "auth/email-already-in-use": "err_inuse",
      "auth/weak-password": "err_weak",
      "auth/too-many-requests": "err_many2",
      "auth/network-request-failed": "err_network2"
    };
    if (map[code]) return t(map[code]);
    var msg = (err && err.message) || t("err_generic");
    msg = msg.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[a-z0-9-]+\)\.?$/i, "").trim();
    return msg || t("err_generic");
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
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  // ---- EN/ES i18n (mirrors the main site pattern: site.js t() + applyI18n) ----
  // Language is shared with the main site via localStorage "pg-lang"; the vendor
  // portal defaults to Spanish when nothing is saved (vendors are Spanish-first).
  var currentLang = "es";
  try {
    var savedLang = localStorage.getItem("pg-lang");
    if (savedLang === "en" || savedLang === "es") currentLang = savedLang;
  } catch (e) { /* storage blocked: keep the Spanish default */ }
  function localeTag() { return currentLang === "es" ? "es-US" : "en-US"; }

  var I18N = {
    en: {
      page_title: "Vendor Dashboard | PrimeGuard Preservation",
      lang_label: "Language",
      portal: "Vendor portal",
      portal_kicker: "Vendor Portal",
      hello: "Hello",
      logout: "Log out",
      login_banner_line: "Your jobs, your quotes, your pay — per job completed.",
      role_customer: "I'm a customer",
      role_vendor: "I'm a vendor",
      role_admin: "Admin dashboard",
      login: "Log in",
      login_sub_pre: "Log in with your vendor account to see your jobs and submit quotes. New here?",
      login_register_link: "Register your crew",
      email: "Email",
      password: "Password",
      google_btn: "Continue with Google",
      forgot: "Forgot password?",
      new_here: "New to PrimeGuard?",
      create_account: "Create your vendor account",
      how_login: "How to log in",
      help_customer: "Customer",
      help_vendor: "Vendor",
      help_1a: "Pick",
      help_1b: "or",
      help_1c: "above — vendors land here; customers use the customer side.",
      help_2a: "Use the same email and password you registered with, or tap",
      help_2b: ".",
      help_3a: "New vendor?",
      help_3b: "first, then come back and log in.",
      help_4a: "Forgot your password? Tap",
      help_4b: "under the Log in button and we'll email you a reset link.",
      loading_panel: "Loading your dashboard…",
      open_menu: "Open menu",
      close_menu: "Close menu",
      menu_label: "Portal menu",
      tabs_label: "Vendor dashboard",
      nav_home: "Home",
      nav_next: "Your next job",
      nav_available: "Available jobs",
      nav_direct: "Direct jobs",
      nav_my: "My jobs",
      nav_calendar: "Calendar",
      nav_quote: "Submit my price",
      nav_done: "Done",
      nav_account: "Account",
      nav_pay: "Payment: how we pay you",
      nav_w9: "W-9 documents",
      nav_agreements: "Agreements",
      nav_alerts: "Alerts",
      nav_profile: "My profile",
      ms_pending: "To collect",
      ms_month: "This month",
      ms_done: "Jobs finished",
      ms_earned: "Earned",
      ms_open: "Open opportunities",
      app_title: "Your PrimeGuard app",
      app_sub: "New jobs reach your phone instantly.",
      app_install: "Install the app",
      sec_next: "Your next job",
      sec_docs: "Documents needed",
      docs_sub: "Upload these documents to keep receiving paid jobs.",
      sec_available: "Available jobs",
      available_sub: "PrimeGuard posts the job details and photos. Review them, accept the evaluation visit, and submit your price.",
      sec_direct: "Direct jobs",
      sec_my: "My jobs",
      sec_calendar: "Calendar",
      cal_sub: "Your scheduled visits. Tap a day to see that day's jobs.",
      prev_month: "Previous month",
      next_month: "Next month",
      dow_0: "S", dow_1: "M", dow_2: "T", dow_3: "W", dow_4: "T", dow_5: "F", dow_6: "S",
      cal_connect: "Connect your calendar",
      cal_connect_p: "Add your PrimeGuard jobs to your Google Calendar or iPhone calendar with your personal link. It updates on its own when a new job comes in.",
      cal_copy: "Copy link",
      cal_fine: "Google Calendar: Settings, Add calendar, From a URL, paste your link. iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar, paste your link.",
      cal_regen: "Generate a new link",
      sec_quote: "Submit my price",
      quote_sub: "Quote the job using the photos, videos and notes in the work order.",
      q_for: "Which request is this price for?",
      q_pick: "Select a quote request...",
      q_price: "Your price ($)",
      q_duration: "How long does it take?",
      q_duration_ph: "1 day",
      q_details: "Price details",
      q_notes_ph: "Labor, materials, haul-away included...",
      addon_title: "Maximize the visit: what else does this property need?",
      addon_hint: "Walk the whole property. Check every extra service it needs and put your price for each one. The office adds them to your quote.",
      addon_hedge: "Hedge and bush trimming",
      addon_beds: "Flower bed cleanup and weed removal",
      addon_mulch: "New mulch or decorative rock",
      addon_palm: "Palm and small tree trimming",
      addon_cleanup: "Full yard cleanup (leaves, branches, debris)",
      addon_pressure: "Pressure washing (driveway and sidewalks)",
      addon_edging: "Edging and full front finish",
      q_attach: "Attach your formal quote",
      q_optional: "(optional)",
      q_branded: "Got a branded quote with your logo? Attach it here. It makes your bid look professional and helps you win the job.",
      q_ok: "Quote submitted. PrimeGuard will review it.",
      q_submit: "Submit quote",
      sec_done: "Finished jobs",
      sec_more: "More",
      documents: "Documents",
      doc_w9_form: "Form W-9",
      w9_explainer: "Every vendor must submit a completed IRS Form W-9 within 7 days of registration. Payment can be held until it's in.",
      w9_download: "Download blank W-9 (fillable PDF)",
      w9_fine: "Already filled yours out? Upload it in the \"Documents needed\" section above and the office will mark it received.",
      agreements: "Agreements",
      agr_pdf: "PDF document",
      agr_view: "View",
      agr_nda_label: "I have read and agree to the Non-Circumvention, Non-Solicitation and Confidentiality Agreement",
      agr_ica_label: "I have read and agree to the Independent Contractor Services Agreement",
      agr_name: "Full legal name (your electronic signature)",
      agr_name_ph: "Your full legal name",
      agr_sign: "Sign agreements",
      alerts: "Alerts",
      alerts_t: "Job alerts",
      alerts_sub: "We alert this phone when a new job or a price request comes in.",
      alerts_btn: "🔔 Turn on alerts",
      profile: "My profile",
      tab_jobs: "Jobs",
      tab_my: "My jobs",
      tab_cal: "Calendar",
      tab_money: "My money",
      tab_more: "More",
      tab_home: "Home",
      home_week: "WEEK OF {a} TO {b}",
      home_jobs: "{n} jobs this week",
      home_onway: "On the way",
      home_next_pay: "Next pay: {date}",
      home_opps_sub: "Price requests waiting for your quote",
      qa_quote: "Quote",
      qa_photos: "Photos",
      qa_map: "Map",
      qa_docs: "Documents",
      pay_release: "Pay: {date} (3-day rule)",
      signed_in: "You're signed in",
      noprofile_pre: "You're signed in as",
      noprofile_post: ", but this account doesn't have a vendor profile yet — that's why there's no vendor dashboard to show. If you run a crew, create your vendor account right here with this same Google sign-in, no new password needed, it takes about two minutes. If you're a customer, your portal is on the customer side.",
      create_vendor_account: "Create your vendor account",
      goto_customer: "Go to the customer portal",
      foot_hours: "Mon-Fri, 8:00 AM - 5:00 PM · Sat, 8:00 AM - 12:00 PM",
      foot_main: "Main site",
      foot_services: "Services",
      foot_contact: "Contact",
      foot_app: "📲 Get the app",
      foot_note: "How pay works: finish the job, send before and after photos, and payment is released per job completed after PrimeGuard confirms the work.",
      foot_rights: "PrimeGuard Preservation LLC. All rights reserved.",
      // Dynamic strings (rendered by JS)
      there: "there",
      vendor_word: "Vendor",
      signing_in: "Signing in...",
      err_generic: "Something went wrong. Please try again.",
      err_invalid_long: "That email and password don't match our records. Check for typos, or if you signed up with Google, use Continue with Google.",
      err_inuse: "That email already has an account. Try logging in instead.",
      err_weak: "Password needs at least 6 characters.",
      err_many2: "Too many attempts. Wait a minute and try again, or reset your password.",
      err_network2: "Connection problem. Check your internet and try again.",
      forgot_noemail2: "Type your email above first.",
      reset_sent_pre: "Reset link sent to ",
      profile_snag: "We hit a snag loading your vendor profile. Check your connection and try refreshing the page.",
      st_approved: "APPROVED",
      st_rejected: "NOT APPROVED",
      st_pending: "PENDING REVIEW",
      banner_rejected: "Your registration was not approved. Contact PrimeGuard at (786) 422-9674 if you think this is a mistake.",
      banner_pending: "Your registration is under review. You'll be able to accept jobs once approved.",
      pill_approved: "✓ Approved",
      pill_review: "Under review",
      pf_business: "Business",
      pf_contact: "Contact",
      pf_phone: "Phone",
      pf_email: "Email",
      pf_services: "Services",
      pf_areas: "Areas",
      pf_crew: "Crew size",
      pf_equip: "Equipment",
      coi_received_line: "Certificate of insurance (COI): received ✓, on file with the office.",
      doc_due_asap: "as soon as possible",
      doc_overdue: "overdue: upload now",
      doc_w9_t2: "W-9 form",
      doc_coi_t2: "Certificate of insurance",
      doc_coi_req: "Required since you carry general liability",
      upload_btn: "Upload",
      doc_choose: "Choose the file first.",
      doc_setup: "Uploads are being set up. Please text the document to us for now.",
      doc_received: "Document received. Thank you.",
      doc_failed: "Upload failed. Please try again.",
      agr_signed_h: "Agreements signed ✓",
      agr_onfile: "On file: ",
      agr_resign_h: "Updated agreements: please re-sign",
      agr_resign_p: "We updated our vendor agreements. Please read the new versions below, check both boxes, and sign with your full legal name. It takes about a minute.",
      agr_signing: "Signing...",
      agr_thanks: "Thank you: your updated agreements are signed and on file.",
      agr_err_pre: "Something went wrong saving your signature: ",
      agr_err_post: " Please try again.",
      w9_received: "W-9: received ✓",
      w9_onfile_span: " — on file with the office.",
      w9_submitted: "W-9: submitted ✓",
      w9_sub_span: " — received, on file with the office.",
      w9_pending: "W-9: pending",
      w9_due_word: " — due ",
      w9_pending_span: " — download the blank form below, fill it in, and upload it in the \"Documents needed\" section above.",
      setup_title2: "Finish your setup",
      setup_complete: "Your setup is complete ✓",
      of_word: "of",
      setup_done_suffix: "done",
      setup_pay_label: "Payment information: how we pay you",
      setup_pay_hint: "Add your Zelle, bank transfer, or check details below so the office can pay you per job completed.",
      setup_onfile: "On file with the office.",
      setup_w9_label: "W-9 form",
      setup_w9_hint: "Still needed. Download the blank form and upload it in Documents needed.",
      setup_agr_label: "Signed agreements (NDA + contractor agreement)",
      setup_agr_hint: "Review and sign in the Agreements section.",
      setup_agr_done: "Signed and on file.",
      setup_coi_label: "Certificate of insurance",
      setup_coi_hint: "Upload it in the Documents needed section.",
      upd_btn: "Update",
      add_btn: "Add",
      go_btn: "Go",
      pay_method: "Payment method",
      method_zelle: "Zelle (fastest)",
      method_ach2: "Bank transfer (ACH)",
      method_check2: "Check by mail",
      pay_label_zelle2: "Zelle phone or email",
      pay_label_name: "Name on the account",
      pay_label_bank: "Bank name",
      pay_label_routing: "Routing number",
      pay_label_acct: "Account number",
      check_note_pre: "Checks are mailed to your business address on file: ",
      pay_save_btn: "Save payment info",
      alerts_line: "Job alerts: turn on notifications so you never miss a new job.",
      alerts_btn2: "Turn on notifications",
      val_zelle: "Add your Zelle phone or email and the name on the account.",
      val_ach: "Add your bank, routing, account number, and the name on the account.",
      val_missing: "Something is missing.",
      setup_saved2: "Payment info saved. The office can now pay you per job completed.",
      save_failed: "Save failed. Please try again.",
      ps_bank: "Bank transfer",
      ps_bank_word: "bank",
      ps_check: "Check by mail",
      accepted_on: "Accepted on",
      status_accepted: "Accepted",
      status_eval_accepted: "Evaluation accepted",
      checklist_h: "Checklist",
      ck_pressure: ["Before photos uploaded", "Full surface washed", "Area rinsed and clean", "After photos uploaded"],
      ck_lawn: ["Before photos uploaded", "Lawn fully mowed", "Edging and trimming done", "Entry, driveway and sidewalks blown clean", "Gate closed and property secure", "After photos uploaded"],
      ck_default: ["Before photos uploaded", "Work completed as ordered", "Area clean when finished", "After photos uploaded"],
      hero_none_h: "No accepted jobs yet",
      hero_none_p: "When you accept a job, here you'll see the address, the schedule, and the buttons to get directions, upload photos, and mark it done. Check the available jobs below.",
      pay_word: "Pay",
      pay_note: "Paid on completion,<br>with the photos",
      tqp: "You set the price",
      btn_directions: "Get directions",
      btn_upload: "Upload photos",
      btn_complete2: "Mark complete",
      btn_price: "Give my price",
      btn_price_sent: "Price sent ✓",
      ina_h: "Your account isn't active",
      ina_call: "Call PrimeGuard at",
      ina_h_alt: "Tu cuenta no está activa",
      ina_call_alt: "Llama a PrimeGuard al",
      cnt_new1: " NEW",
      cnt_newn: " NEW",
      cnt_avail: " AVAILABLE",
      cnt_active: " IN PROGRESS",
      cnt_jobs: " JOBS",
      cnt_day: " DAY",
      cnt_days: " DAYS",
      mn_one: " job finished",
      mn_many: " jobs finished",
      pend_n: " job(s) waiting for confirmation",
      pend_none: "Nothing waiting for confirmation",
      cal_none_day: "No jobs this day.",
      job_word: "Job",
      view_job: "View job",
      cal_err2: "Could not create your link. Check your connection and try again.",
      cal_copied_btn: "Copied!",
      cal_regen_err: "Could not generate the new link.",
      watch_video: "▶ Watch video",
      list_empty: "Nothing here right now. New jobs appear here automatically.",
      btn_accept_eval2: "Accept evaluation",
      btn_accept_job: "Accept job",
      active_none: "No active work. Accept a job above to get started.",
      step_eval: "Evaluation visit accepted",
      step_price: "Price sent",
      step_wo: "Work order received",
      step_before: "Before photos uploaded",
      step_work: "Work finished",
      step_after: "After photos uploaded: payment is released",
      done_none2: "You haven't finished any jobs yet.",
      paid_per: "Paid per job",
      confirm_complete: "Mark this job complete? Make sure your after photos are uploaded.",
      alert_checklist_pre: "Complete the checklist before marking the job complete. Missing ",
      alert_checklist_post: " step(s).",
      photo_setup: "Photo upload is being set up. Please send photos by text for now.",
      upload_failed: "Upload failed",
      q_pick_first: "Pick the quote request first.",
      q_uploading: "Uploading quote...",
      q_submitting: "Submitting...",
      status_enroute: "On the way",
      status_arrived: "Arrived",
      btn_enroute: "🚗 On my way",
      track_enroute_line: "On my way. Your location is shared with the office and the customer until you mark the job complete.",
      track_arrived_line: "Arrived. The customer can see you are at the property.",
      track_consent_note: "The first time, a short location consent appears for you to accept.",
      step_enroute: "On the way (location shared)",
      step_arrived: "Arrived at the property",
      setup_consent_label: "Location tracking consent",
      setup_consent_done: "Accepted and on file. Live arrival tracking is active on your jobs.",
      setup_consent_hint: "You accept it the first time you tap On my way on a job.",
      consent_h: "Location sharing for this trip",
      consent_body: "When you tap Accept and start, this portal shares your phone's location only while this job is in progress, from your On my way tap until you mark the job complete. It is used to confirm your arrival at the property and to show the customer your visit progress (on the way, arrived). Sharing stops automatically when you mark the job complete. Nothing is collected before you start or after you finish.",
      consent_accept: "Accept and start",
      consent_cancel: "Not now",
      enroute_failed: "The trip could not be started. Please try again."
    },
    es: {
      page_title: "Panel del Vendedor | PrimeGuard Preservation",
      lang_label: "Idioma",
      portal: "Portal de vendedores",
      portal_kicker: "Portal de Vendedores",
      hello: "Hola",
      logout: "Salir",
      login_banner_line: "Tus trabajos, tus cotizaciones, tu pago: por trabajo terminado.",
      role_customer: "Soy cliente",
      role_vendor: "Soy vendedor",
      role_admin: "Panel de administración",
      login: "Iniciar sesión",
      login_sub_pre: "Inicia sesión con tu cuenta de vendedor para ver tus trabajos y enviar precios. ¿Nuevo aquí?",
      login_register_link: "Registra tu equipo",
      email: "Correo electrónico",
      password: "Contraseña",
      google_btn: "Continuar con Google",
      forgot: "¿Olvidaste tu contraseña?",
      new_here: "¿Nuevo en PrimeGuard?",
      create_account: "Crea tu cuenta de vendedor",
      how_login: "Cómo iniciar sesión",
      help_customer: "Cliente",
      help_vendor: "Vendedor",
      help_1a: "Elige",
      help_1b: "o",
      help_1c: "arriba: los vendedores entran aquí; los clientes usan el lado del cliente.",
      help_2a: "Usa el mismo correo y contraseña con los que te registraste, o toca",
      help_2b: ".",
      help_3a: "¿Vendedor nuevo?",
      help_3b: "primero, y luego vuelve e inicia sesión.",
      help_4a: "¿Olvidaste tu contraseña? Toca",
      help_4b: "debajo del botón de iniciar sesión y te enviamos un enlace para restablecerla.",
      loading_panel: "Cargando tu panel…",
      open_menu: "Abrir menú",
      close_menu: "Cerrar menú",
      menu_label: "Menú del portal",
      tabs_label: "Panel del vendedor",
      nav_home: "Inicio",
      nav_next: "Tu próximo trabajo",
      nav_available: "Trabajos disponibles",
      nav_direct: "Trabajos directos",
      nav_my: "Mis trabajos",
      nav_calendar: "Calendario",
      nav_quote: "Enviar mi precio",
      nav_done: "Terminados",
      nav_account: "Cuenta",
      nav_pay: "Pago: cómo te pagamos",
      nav_w9: "Documentos W-9",
      nav_agreements: "Acuerdos",
      nav_alerts: "Avisos",
      nav_profile: "Mi perfil",
      ms_pending: "Por cobrar",
      ms_month: "Este mes",
      ms_done: "Trabajos terminados",
      ms_earned: "Ganado",
      ms_open: "Oportunidades abiertas",
      app_title: "Tu app de PrimeGuard",
      app_sub: "Los trabajos nuevos te llegan al teléfono al instante.",
      app_install: "Instalar la app",
      sec_next: "Tu próximo trabajo",
      sec_docs: "Documentos necesarios",
      docs_sub: "Sube estos documentos para seguir recibiendo trabajos pagados.",
      sec_available: "Trabajos disponibles",
      available_sub: "PrimeGuard publica los detalles y las fotos del trabajo. Revísalos, acepta la visita de evaluación y envía tu precio.",
      sec_direct: "Trabajos directos",
      sec_my: "Mis trabajos",
      sec_calendar: "Calendario",
      cal_sub: "Tus visitas programadas. Toca un día para ver los trabajos de ese día.",
      prev_month: "Mes anterior",
      next_month: "Mes siguiente",
      dow_0: "D", dow_1: "L", dow_2: "M", dow_3: "M", dow_4: "J", dow_5: "V", dow_6: "S",
      cal_connect: "Conecta tu calendario",
      cal_connect_p: "Agrega tus trabajos de PrimeGuard a tu Google Calendar o al calendario de tu iPhone con tu enlace personal. Se actualiza solo cuando entra un trabajo nuevo.",
      cal_copy: "Copiar enlace",
      cal_fine: "Google Calendar: Configuración, Agregar calendario, Desde una URL, pega tu enlace. iPhone: Ajustes, Calendario, Cuentas, Agregar cuenta, Otro, Agregar calendario suscrito, pega tu enlace.",
      cal_regen: "Generar un enlace nuevo",
      sec_quote: "Enviar mi precio",
      quote_sub: "Cotiza el trabajo con las fotos, los videos y las notas de la orden de trabajo.",
      q_for: "¿Para qué solicitud es este precio?",
      q_pick: "Selecciona una solicitud...",
      q_price: "Tu precio ($)",
      q_duration: "¿Cuánto tiempo toma?",
      q_duration_ph: "1 día",
      q_details: "Detalles del precio",
      q_notes_ph: "Mano de obra, materiales, recogida de escombros...",
      addon_title: "Maximiza la visita: ¿qué más necesita esta propiedad?",
      addon_hint: "Revisa toda la propiedad. Marca cada servicio extra que necesita y pon tu precio por cada uno. La oficina los suma a tu cotización.",
      addon_hedge: "Recorte de arbustos y setos",
      addon_beds: "Limpieza de canteros y maleza",
      addon_mulch: "Mulch nuevo o piedra decorativa",
      addon_palm: "Recorte de palmas y árboles pequeños",
      addon_cleanup: "Limpieza general del patio (hojas, ramas, escombros)",
      addon_pressure: "Lavado a presión (driveway y aceras)",
      addon_edging: "Bordes y acabado completo del frente",
      q_attach: "Adjunta tu cotización formal",
      q_optional: "(opcional)",
      q_branded: "¿Tienes una cotización con tu logo? Adjúntala aquí. Tu precio se ve más profesional y te ayuda a ganar el trabajo.",
      q_ok: "Cotización enviada. PrimeGuard la revisará.",
      q_submit: "Enviar cotización",
      sec_done: "Trabajos terminados",
      sec_more: "Más",
      documents: "Documentos",
      doc_w9_form: "Formulario W-9",
      w9_explainer: "Todo vendedor debe entregar el formulario W-9 del IRS completo dentro de los 7 días del registro. El pago puede retenerse hasta que lo recibamos.",
      w9_download: "Descargar W-9 en blanco (PDF rellenable)",
      w9_fine: "¿Ya lo llenaste? Súbelo en la sección \"Documentos necesarios\" arriba y la oficina lo marca como recibido.",
      agreements: "Acuerdos",
      agr_pdf: "Documento PDF",
      agr_view: "Ver",
      agr_nda_label: "He leído y acepto el Acuerdo de No Elusión, No Captación y Confidencialidad",
      agr_ica_label: "He leído y acepto el Acuerdo de Servicios de Contratista Independiente",
      agr_name: "Nombre legal completo (tu firma electrónica)",
      agr_name_ph: "Tu nombre legal completo",
      agr_sign: "Firmar acuerdos",
      alerts: "Avisos",
      alerts_t: "Avisos de trabajos",
      alerts_sub: "Te avisamos en este teléfono cuando entre un trabajo nuevo o una solicitud de precio.",
      alerts_btn: "🔔 Activar avisos",
      profile: "Mi perfil",
      tab_jobs: "Trabajos",
      tab_my: "Mis trabajos",
      tab_cal: "Calendario",
      tab_money: "Mi dinero",
      tab_more: "Más",
      tab_home: "Inicio",
      home_week: "SEMANA DEL {a} AL {b}",
      home_jobs: "{n} trabajos esta semana",
      home_onway: "En camino",
      home_next_pay: "Próximo pago: {date}",
      home_opps_sub: "Solicitudes esperando tu precio",
      qa_quote: "Cotizar",
      qa_photos: "Fotos",
      qa_map: "Mapa",
      qa_docs: "Documentos",
      pay_release: "Pago: {date} (regla de 3 dias)",
      signed_in: "Ya iniciaste sesión",
      noprofile_pre: "Iniciaste sesión como",
      noprofile_post: ", pero esta cuenta aún no tiene un perfil de vendedor: por eso no hay un panel para mostrar. Si tienes un equipo, crea tu cuenta de vendedor aquí mismo con este mismo inicio de sesión de Google, sin contraseña nueva, toma unos dos minutos. Si eres cliente, tu portal está en el lado del cliente.",
      create_vendor_account: "Crea tu cuenta de vendedor",
      goto_customer: "Ir al portal del cliente",
      foot_hours: "lun-vie, 8:00 AM - 5:00 PM · sáb, 8:00 AM - 12:00 PM",
      foot_main: "Sitio principal",
      foot_services: "Servicios",
      foot_contact: "Contacto",
      foot_app: "📲 Descarga la app",
      foot_note: "Cómo funciona el pago: termina el trabajo, envía fotos del antes y el después, y el pago se libera por trabajo terminado después de que PrimeGuard confirma el trabajo.",
      foot_rights: "PrimeGuard Preservation LLC. Todos los derechos reservados.",
      there: "amigo",
      vendor_word: "Vendedor",
      signing_in: "Iniciando sesión...",
      err_generic: "Algo salió mal. Inténtalo de nuevo.",
      err_invalid_long: "Ese correo y contraseña no coinciden con nuestros registros. Revisa que no haya errores, o si te registraste con Google, usa Continuar con Google.",
      err_inuse: "Ese correo ya tiene una cuenta. Intenta iniciar sesión.",
      err_weak: "La contraseña necesita al menos 6 caracteres.",
      err_many2: "Demasiados intentos. Espera un minuto e inténtalo de nuevo, o restablece tu contraseña.",
      err_network2: "Problema de conexión. Revisa tu internet e inténtalo de nuevo.",
      forgot_noemail2: "Escribe tu correo arriba primero.",
      reset_sent_pre: "Enlace de restablecimiento enviado a ",
      profile_snag: "Hubo un problema cargando tu perfil de vendedor. Revisa tu conexión e intenta refrescar la página.",
      st_approved: "APROBADO",
      st_rejected: "NO APROBADO",
      st_pending: "EN REVISIÓN",
      banner_rejected: "Tu registro no fue aprobado. Comunícate con PrimeGuard al (786) 422-9674 si crees que es un error.",
      banner_pending: "Tu registro está en revisión. Podrás aceptar trabajos en cuanto seas aprobado.",
      pill_approved: "✓ Aprobado",
      pill_review: "En revisión",
      pf_business: "Negocio",
      pf_contact: "Contacto",
      pf_phone: "Teléfono",
      pf_email: "Correo",
      pf_services: "Servicios",
      pf_areas: "Áreas",
      pf_crew: "Tamaño del equipo",
      pf_equip: "Equipo",
      coi_received_line: "Certificado de seguro (COI): recibido ✓, en archivo con la oficina.",
      doc_due_asap: "lo antes posible",
      doc_overdue: "vencido: súbelo ahora",
      doc_w9_t2: "Formulario W-9",
      doc_coi_t2: "Certificado de seguro",
      doc_coi_req: "Requerido porque tienes seguro de responsabilidad general",
      upload_btn: "Subir",
      doc_choose: "Elige el archivo primero.",
      doc_setup: "Las subidas se están configurando. Por ahora envíanos el documento por mensaje de texto.",
      doc_received: "Documento recibido. Gracias.",
      doc_failed: "La subida falló. Inténtalo de nuevo.",
      agr_signed_h: "Acuerdos firmados ✓",
      agr_onfile: "En archivo: ",
      agr_resign_h: "Acuerdos actualizados: vuelve a firmar",
      agr_resign_p: "Actualizamos nuestros acuerdos de vendedor. Lee las versiones nuevas abajo, marca ambas casillas y firma con tu nombre legal completo. Toma un minuto.",
      agr_signing: "Firmando...",
      agr_thanks: "Gracias: tus acuerdos actualizados están firmados y en archivo.",
      agr_err_pre: "Algo salió mal al guardar tu firma: ",
      agr_err_post: " Inténtalo de nuevo.",
      w9_received: "W-9: recibido ✓",
      w9_onfile_span: " — en archivo con la oficina.",
      w9_submitted: "W-9: enviado ✓",
      w9_sub_span: " — recibido, en archivo con la oficina.",
      w9_pending: "W-9: pendiente",
      w9_due_word: " — vence ",
      w9_pending_span: " — descarga el formulario en blanco abajo, llénalo y súbelo en la sección \"Documentos necesarios\" de arriba.",
      setup_title2: "Termina tu configuración",
      setup_complete: "Tu configuración está completa ✓",
      of_word: "de",
      setup_done_suffix: "listos",
      setup_pay_label: "Datos de pago: cómo te pagamos",
      setup_pay_hint: "Agrega tus datos de Zelle, transferencia bancaria o cheque abajo para que la oficina te pague por trabajo terminado.",
      setup_onfile: "En archivo con la oficina.",
      setup_w9_label: "Formulario W-9",
      setup_w9_hint: "Todavía falta. Descarga el formulario en blanco y súbelo en Documentos necesarios.",
      setup_agr_label: "Acuerdos firmados (NDA + acuerdo de contratista)",
      setup_agr_hint: "Revisa y firma en la sección Acuerdos.",
      setup_agr_done: "Firmados y en archivo.",
      setup_coi_label: "Certificado de seguro",
      setup_coi_hint: "Súbelo en la sección Documentos necesarios.",
      upd_btn: "Actualizar",
      add_btn: "Agregar",
      go_btn: "Ir",
      pay_method: "Método de pago",
      method_zelle: "Zelle (el más rápido)",
      method_ach2: "Transferencia bancaria (ACH)",
      method_check2: "Cheque por correo",
      pay_label_zelle2: "Teléfono o correo de Zelle",
      pay_label_name: "Nombre en la cuenta",
      pay_label_bank: "Nombre del banco",
      pay_label_routing: "Número de ruta (routing)",
      pay_label_acct: "Número de cuenta",
      check_note_pre: "Los cheques se envían por correo a la dirección de tu negocio en archivo: ",
      pay_save_btn: "Guardar datos de pago",
      alerts_line: "Avisos de trabajos: activa las notificaciones para no perderte ningún trabajo nuevo.",
      alerts_btn2: "Activar notificaciones",
      val_zelle: "Agrega tu teléfono o correo de Zelle y el nombre en la cuenta.",
      val_ach: "Agrega tu banco, número de ruta, número de cuenta y el nombre en la cuenta.",
      val_missing: "Falta algo.",
      setup_saved2: "Datos de pago guardados. La oficina ya puede pagarte por trabajo terminado.",
      save_failed: "No se pudo guardar. Inténtalo de nuevo.",
      ps_bank: "Transferencia bancaria",
      ps_bank_word: "banco",
      ps_check: "Cheque por correo",
      accepted_on: "Aceptado el",
      status_accepted: "Aceptado",
      status_eval_accepted: "Evaluación aceptada",
      checklist_h: "Lista de verificación",
      ck_pressure: ["Fotos de antes subidas", "Superficie lavada completa", "Área enjuagada y limpia", "Fotos de después subidas"],
      ck_lawn: ["Fotos de antes subidas", "Césped cortado completo", "Bordes y trimming hechos", "Entrada, driveway y aceras soplados", "Portón cerrado y propiedad segura", "Fotos de después subidas"],
      ck_default: ["Fotos de antes subidas", "Trabajo completado según la orden", "Área limpia al terminar", "Fotos de después subidas"],
      hero_none_h: "Sin trabajos aceptados todavía",
      hero_none_p: "Cuando aceptes un trabajo, aquí verás la dirección, el horario y los botones para llegar, subir las fotos y marcarlo terminado. Revisa los trabajos disponibles abajo.",
      pay_word: "Paga",
      pay_note: "Pago al terminar,<br>con las fotos",
      tqp: "Tú pones el precio",
      btn_directions: "Cómo llegar",
      btn_upload: "Subir fotos",
      btn_complete2: "Marcar terminado",
      btn_price: "Dar mi precio",
      btn_price_sent: "Precio enviado ✓",
      ina_h: "Tu cuenta no está activa",
      ina_call: "Llama a PrimeGuard al",
      ina_h_alt: "Your account isn't active",
      ina_call_alt: "Call PrimeGuard at",
      cnt_new1: " NUEVA",
      cnt_newn: " NUEVAS",
      cnt_avail: " DISPONIBLES",
      cnt_active: " EN CURSO",
      cnt_jobs: " TRABAJOS",
      cnt_day: " DÍA",
      cnt_days: " DÍAS",
      mn_one: " trabajo terminado",
      mn_many: " trabajos terminados",
      pend_n: " trabajo(s) esperando confirmación",
      pend_none: "Nada esperando confirmación",
      cal_none_day: "Sin trabajos este día.",
      job_word: "Trabajo",
      view_job: "Ver trabajo",
      cal_err2: "No se pudo crear tu enlace. Revisa tu conexión e inténtalo de nuevo.",
      cal_copied_btn: "¡Copiado!",
      cal_regen_err: "No se pudo generar el enlace nuevo.",
      watch_video: "▶ Ver video",
      list_empty: "Nada por aquí ahora. Los trabajos nuevos aparecen aquí automáticamente.",
      btn_accept_eval2: "Aceptar evaluación",
      btn_accept_job: "Aceptar trabajo",
      active_none: "Sin trabajo activo. Acepta un trabajo arriba para empezar.",
      step_eval: "Visita de evaluación aceptada",
      step_price: "Precio enviado",
      step_wo: "Orden de trabajo recibida",
      step_before: "Fotos de antes subidas",
      step_work: "Trabajo terminado",
      step_after: "Fotos de después subidas: se libera el pago",
      done_none2: "Todavía no terminas trabajos.",
      paid_per: "Pagado por trabajo",
      confirm_complete: "¿Marcar este trabajo como terminado? Asegúrate de que las fotos del después ya estén subidas.",
      alert_checklist_pre: "Completa la lista de verificación antes de marcar terminado. Faltan ",
      alert_checklist_post: " paso(s).",
      photo_setup: "La subida de fotos se está configurando. Por ahora envía las fotos por mensaje de texto.",
      upload_failed: "La subida falló",
      q_pick_first: "Elige primero la solicitud de cotización.",
      q_uploading: "Subiendo cotización...",
      q_submitting: "Enviando...",
      status_enroute: "En camino",
      status_arrived: "Llegó",
      btn_enroute: "🚗 Voy en camino",
      track_enroute_line: "En camino. Tu ubicación se comparte con la oficina y la clienta hasta que marques el trabajo terminado.",
      track_arrived_line: "Llegaste. La clienta ya ve que estás en la propiedad.",
      track_consent_note: "La primera vez aparece un consentimiento corto de ubicación para que lo aceptes.",
      step_enroute: "En camino (ubicación compartida)",
      step_arrived: "Llegó a la propiedad",
      setup_consent_label: "Consentimiento de ubicación",
      setup_consent_done: "Aceptado y en archivo. El seguimiento de llegada está activo en tus trabajos.",
      setup_consent_hint: "Lo aceptas la primera vez que tocas Voy en camino en un trabajo.",
      consent_h: "Ubicación para este viaje",
      consent_body: "Al tocar Aceptar y empezar, este portal comparte la ubicación de tu teléfono solo mientras este trabajo está en curso, desde que tocas Voy en camino hasta que marcas el trabajo terminado. Se usa para confirmar tu llegada a la propiedad y mostrarle a la clienta el progreso de la visita (en camino, llegó). El envío se detiene automáticamente cuando marcas el trabajo terminado. No se recoge nada antes de empezar ni después de terminar.",
      consent_accept: "Aceptar y empezar",
      consent_cancel: "Ahora no",
      enroute_failed: "No se pudo iniciar el viaje. Inténtalo de nuevo."
    }
  };

  function t(key) {
    var dict = I18N[currentLang] || I18N.es;
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    if (Object.prototype.hasOwnProperty.call(I18N.es, key)) return I18N.es[key];
    return key;
  }

  // Static strings: [data-i18n] text, [data-i18n-ph] placeholders, [data-i18n-aria]
  // aria-labels, exactly like the main site's applyI18n. Then re-render the dynamic
  // content from the already-loaded data (no page reload).
  var tr = t; // alias for scopes where a local "t" (event target) shadows t()
  function applyI18n() {
    document.documentElement.lang = currentLang;
    document.title = t("page_title");
    document.querySelectorAll("[data-i18n]").forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (n) { n.setAttribute("placeholder", t(n.getAttribute("data-i18n-ph"))); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (n) { n.setAttribute("aria-label", t(n.getAttribute("data-i18n-aria"))); });
    document.querySelectorAll(".lang-toggle button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-lang") === currentLang); });
    if (vendor) {
      renderHeader(); renderProfile(); renderDocs(); renderAgreements(); renderW9(); renderSetup();
      loadAll();
    }
  }

  document.querySelectorAll(".lang-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      var lang = b.getAttribute("data-lang");
      if ((lang === "en" || lang === "es") && lang !== currentLang) {
        currentLang = lang;
        try { localStorage.setItem("pg-lang", lang); } catch (e) { /* storage blocked */ }
        applyI18n();
      }
    });
  });
  applyI18n();
  // ---- end i18n ----


  var me = null;       // firebase user
  var vendor = null;    // vendors/{uid} data
  var myEvals = [];     // quote requests I accepted for evaluation (for quote form dropdown)
  var openQRs = [];     // open quote requests visible to me (for quote form dropdown)
  var myQuoted = {};    // workOrderId -> true, quote requests I already submitted a quote for
  var sessionPhotosByWo = {}; // workOrderId -> [urls] uploaded from this device during this portal session (grouped into visitLog on Mark complete)
  var homeDayKey = "";        // selected day (vcalKey) on the Inicio week strip; "" = today
  var myReviewJobs = [];      // my jobs in status "review" (vendor-complete, pay pending release)
  var currentView = "home";   // active portal view: home | jobs | my | cal | money | more
  var VD_VIEWS = ["home", "jobs", "my", "cal", "money", "more"];

  /* ---------- Live data: Firestore snapshot listeners ----------
     Each main list registers ONE onSnapshot listener (first loadAll
     call); later changes re-render automatically, no page refresh.
     Repeat loadAll() calls replay the cached snapshot into the same
     render path, which keeps language toggles and post-action
     re-renders working exactly like the old one-time fetches did. */
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
  }

  var _yr = document.getElementById("vd-year");
  if (_yr) _yr.textContent = new Date().getFullYear();

  // ---------- Login ----------
  $("vd-loginform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("vd-login-error");
    hide(errEl);
    var btn = e.target.querySelector('button[type="submit"]');
    setBusy(btn, true, t("signing_in"));
    auth.signInWithEmailAndPassword($("vd-login-email").value.trim(), $("vd-login-password").value.trim())
      .then(function () { setBusy(btn, false); })
      .catch(function (err) { setBusy(btn, false); errEl.textContent = friendlyAuthError(err); show(errEl); });
  });
  $("vd-logout").addEventListener("click", function (e) { e.preventDefault(); auth.signOut(); });
  $("vd-noprofile-logout").addEventListener("click", function () { auth.signOut(); });

  // ---------- Left slide-over menu (burger + drawer) ----------
  // Burger, backdrop and drawer live inside #vd-dash, so they only
  // exist while the dashboard is shown (same scoping as the tab bar).
  var drawerEl = $("vd-drawer"), backdropEl = $("vd-drawer-backdrop"), burgerEl = $("vd-burger");
  function drawerOpen() { return drawerEl && drawerEl.classList.contains("open"); }
  function openDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.add("open");
    if (backdropEl) backdropEl.classList.add("open");
    if (burgerEl) burgerEl.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden"; // lock page scroll behind the drawer
  }
  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove("open");
    if (backdropEl) backdropEl.classList.remove("open");
    if (burgerEl) burgerEl.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (burgerEl) burgerEl.addEventListener("click", openDrawer);
  if (backdropEl) backdropEl.addEventListener("click", closeDrawer);
  if ($("vd-drawer-close")) $("vd-drawer-close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && drawerOpen()) closeDrawer();
  });
  // Drawer links: close first, switch to the section's view, then
  // glide to the section inside that view.
  if (drawerEl) drawerEl.querySelectorAll(".vd-drawer-link").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) !== "#") return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      closeDrawer();
      goTo(target);
    });
  });
  // Drawer "Salir": one logout behavior only — fire the hero's
  // existing #vd-logout handler.
  if ($("vd-drawer-logout")) $("vd-drawer-logout").addEventListener("click", function () {
    closeDrawer();
    var lo = $("vd-logout");
    if (lo) lo.click();
  });

  // Count badge on a drawer link: number when n > 0, hidden otherwise.
  function setDrawerBadge(id, n) {
    var b = $(id);
    if (!b) return;
    if (n > 0) { b.textContent = n; b.classList.remove("hidden"); }
    else { b.textContent = ""; b.classList.add("hidden"); }
  }

  // "Cuenta" attention dots, from the same vendor fields renderW9 /
  // renderAgreements already read: W-9 still pending, or the current
  // agreements version not yet signed.
  function renderDrawerDots() {
    if (!vendor) return;
    var w9 = $("vd-nav-dot-w9");
    if (w9) {
      var st = String(vendor.w9Status || "pending").toLowerCase();
      var w9Done = st === "received" || st === "approved" || st === "submitted";
      w9.classList.toggle("hidden", w9Done);
    }
    var payDot = $("vd-nav-dot-pay");
    if (payDot) payDot.classList.toggle("hidden", payoutComplete(vendor));
    var ag = $("vd-nav-dot-agree");
    if (ag) {
      var signed = vendor.agreements && vendor.agreements.version === AGREEMENTS_VERSION;
      ag.classList.toggle("hidden", !!signed);
    }
  }

  $("vd-google").addEventListener("click", function () {
    var errEl = $("vd-login-error"); hide(errEl);
    var provider = new firebase.auth.GoogleAuthProvider();
    // Mobile browsers often block popups: fall back to full-page redirect.
    auth.signInWithPopup(provider).catch(function (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request" || err.code === "auth/popup-window-closed")) {
        auth.signInWithRedirect(provider);
      } else {
        errEl.textContent = friendlyAuthError(err); show(errEl);
      }
    });
  });

  $("vd-forgot").addEventListener("click", function (e) {
    e.preventDefault();
    var errEl = $("vd-login-error"); hide(errEl); hide($("vd-reset-ok"));
    var email = $("vd-login-email").value.trim();
    if (!email) { errEl.textContent = t("forgot_noemail2"); show(errEl); return; }
    auth.sendPasswordResetEmail(email).then(function () {
      $("vd-reset-ok").textContent = t("reset_sent_pre") + email + ".";
      show($("vd-reset-ok"));
    }).catch(function (err) { errEl.textContent = friendlyAuthError(err); show(errEl); });
  });

  // "Admin dashboard" role option in the login chooser: ALWAYS visible
  // (role-always-visible, Edwin, Oct 19: he could not see the admin side
  // at login because it only appeared after a staff sign-in). Access is
  // still enforced by admin.html itself, which rejects non-staff accounts.
  function checkStaffEntry(user) {
    var btn = $("vdRoleAdmin");
    if (!btn) return;
    btn.style.display = "";
  }

  auth.onAuthStateChanged(function (user) {
    me = user;
    if (!user) { checkStaffEntry(null); liveOffAll(); stopWatch(); trackWoId = null; show($("vd-loginwrap")); hide($("vd-dash")); hide($("vd-topbar")); hide($("vd-noprofile")); hide($("vd-loading")); return; }
    checkStaffEntry(user);
    // Signed in: hide the login, but keep the dashboard (and its fixed
    // burger) hidden until the profile result is known — showing it here
    // and hiding it again for no-profile accounts was the hamburger
    // flash on refresh. #vd-loading covers the wait instead.
    hide($("vd-loginwrap")); hide($("vd-noprofile")); hide($("vd-dash")); hide($("vd-topbar"));
    show($("vd-loading"));
    db.collection("vendors").doc(user.uid).get().then(function (snap) {
      hide($("vd-loading"));
      if (!snap.exists) {
        // Signed in but no vendor profile: explain it on a friendly panel
        // instead of silently bouncing to the register page (the old
        // redirect read as "it logs me in, then kicks me out").
        // (vd-dash / vd-topbar were never shown, so nothing to hide.)
        $("vd-noprofile-email").textContent = user.email || "your account";
        show($("vd-noprofile"));
        return;
      }
      vendor = snap.data();
      show($("vd-dash")); show($("vd-topbar"));
      renderHeader();
      renderProfile();
      renderDocs();
      renderAgreements();
      renderW9();
      renderSetup();
      loadAll();
    }).catch(function () {
      // Profile load failed: stay on this page, back to the login view
      // with a friendly message. Never bounce.
      hide($("vd-loading")); hide($("vd-dash")); hide($("vd-topbar")); hide($("vd-noprofile"));
      show($("vd-loginwrap"));
      var errEl = $("vd-login-error");
      errEl.textContent = t("profile_snag");
      show(errEl);
    });
  });

  function renderHeader() {
    $("vd-biz").textContent = vendor.business || t("vendor_word");
    // Photo hero sub-line shows the primary area, plus "+n" when the
    // vendor covers more (profile section still lists them all).
    var areas = vendor.areas || [];
    $("vd-area").textContent = areas.length ? areas[0] + (areas.length > 1 ? " +" + (areas.length - 1) : "") : "";
    $("vd-hello").textContent = (vendor.name || t("there")).split(" ")[0];
    // Drawer header mirrors the same identity: business name + an
    // initials avatar (first letters of the first two words of the
    // business, falling back to the contact name).
    var dBiz = $("vd-drawer-biz");
    if (dBiz) dBiz.textContent = vendor.business || vendor.name || t("vendor_word");
    var dIni = $("vd-drawer-initials");
    if (dIni) {
      var words = String(vendor.business || vendor.name || "PrimeGuard").split(/\s+/).filter(Boolean);
      dIni.textContent = words.slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("") || "PG";
    }
  }

  function renderProfile() {
    var v = vendor;
    var st = v.status || (v.verified ? "approved" : "pending");
    var stTxt = st === "approved" ? t("st_approved") : st === "rejected" ? t("st_rejected") : t("st_pending");
    $("cnt-verified").textContent = stTxt;
    var banner = $("vd-status-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "vd-status-banner";
      banner.style.cssText = "margin:0 0 16px;padding:14px 18px;border-radius:14px;font-size:.92rem;font-weight:600;";
      var sec = document.querySelector("#vd-dash .vsec");
      if (sec) sec.parentNode.insertBefore(banner, sec);
    }
    if (st === "approved") {
      banner.style.display = "none";
    } else {
      banner.style.display = "block";
      banner.style.border = "1px solid rgba(212,168,67,.45)";
      banner.style.background = "rgba(212,168,67,.08)";
      banner.style.color = "#f5d67b";
      banner.textContent = st === "rejected"
        ? t("banner_rejected")
        : t("banner_pending");
    }
    // Photo hero status pill: same status the profile/banners already
    // compute — gold for approved, frosted for everything else.
    var pill = $("vd-status-pill");
    if (pill) {
      if (st === "approved") { pill.className = "vd-ph-pill"; pill.textContent = t("pill_approved"); }
      else if (st === "pending") { pill.className = "vd-ph-pill vd-ph-pill-frost"; pill.textContent = t("pill_review"); }
      else { pill.className = "vd-ph-pill vd-ph-pill-frost"; pill.textContent = stTxt; }
    }
    // Drawer header status line: same computed status, Spanish labels.
    var dStatus = $("vd-drawer-status");
    if (dStatus) {
      dStatus.textContent = st === "approved" ? t("pill_approved") : st === "pending" ? t("pill_review") : stTxt;
    }
    $("vd-profile").innerHTML = [
      [t("pf_business"), v.business], [t("pf_contact"), v.name], [t("pf_phone"), v.phone],
      [t("pf_email"), v.email], [t("pf_services"), (v.services || []).join(", ")],
      [t("pf_areas"), (v.areas || []).join(", ")], [t("pf_crew"), v.crewSize],
      [t("pf_equip"), v.equipment || "-"]
    ].map(function (f) {
      return '<div class="vfield"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1] || "-") + '</strong></div>';
    }).join("");
  }

  // ---------- Documents reminder (W-9 / insurance) ----------
  function renderDocs() {
    var v = vendor, sec = $("vd-docs-sec"), list = $("vd-docs-list");
    // Quiet COI line in the Documentos area (upload itself lives in the
    // alert section below, same as before).
    var coiLine = $("vd-coi-line");
    if (coiLine) {
      if (v.insured === "yes" && v.coiStatus === "received") {
        coiLine.innerHTML = "<strong>" + esc(t("coi_received_line")) + "</strong>";
        coiLine.classList.remove("hidden");
      } else {
        coiLine.innerHTML = "";
        coiLine.classList.add("hidden");
      }
    }
    var needW9 = v.w9Status !== "received";
    var needCoi = v.insured === "yes" && v.coiStatus !== "received";
    if (!needW9 && !needCoi) { sec.classList.add("hidden"); return; }
    sec.classList.remove("hidden");
    var html = "";
    if (needW9) {
      var due = v.w9Due ? new Date(v.w9Due) : null;
      var days = due ? Math.ceil((due - Date.now()) / 86400000) : null;
      var dueTxt = days === null ? t("doc_due_asap") : days > 0 ? (currentLang === "es" ? "quedan " + days + (days === 1 ? " día" : " días") : days + (days === 1 ? " day" : " days") + " left") : t("doc_overdue");
      html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.25)">' +
        '<div style="flex:1;min-width:200px"><strong>' + esc(t("doc_w9_t2")) + '</strong><div style="font-size:.85rem;color:var(--muted)">' + dueTxt + '</div></div>' +
        '<input type="file" id="vd-w9-file" accept=".pdf,.jpg,.jpeg,.png" style="font-size:.85rem">' +
        '<button class="btn btn-gold" id="vd-w9-btn" style="padding:10px 18px;font-size:.9rem">' + esc(t("upload_btn")) + '</button></div>';
    }
    if (needCoi) {
      html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.25)">' +
        '<div style="flex:1;min-width:200px"><strong>' + esc(t("doc_coi_t2")) + '</strong><div style="font-size:.85rem;color:var(--muted)">' + esc(t("doc_coi_req")) + '</div></div>' +
        '<input type="file" id="vd-coi-file" accept=".pdf,.jpg,.jpeg,.png" style="font-size:.85rem">' +
        '<button class="btn btn-gold" id="vd-coi-btn" style="padding:10px 18px;font-size:.9rem">' + esc(t("upload_btn")) + '</button></div>';
    }
    list.innerHTML = html;
    var w9b = $("vd-w9-btn");
    if (w9b) w9b.addEventListener("click", function () { uploadVendorDoc("vd-w9-file", "vendor-w9", { w9Status: "received", w9Url: "uploaded", w9Due: null }); });
    var coib = $("vd-coi-btn");
    if (coib) coib.addEventListener("click", function () { uploadVendorDoc("vd-coi-file", "vendor-coi", { coiStatus: "received", coiUrl: "uploaded" }); });
  }

  function uploadVendorDoc(inputId, folder, update) {
    var f = $(inputId).files[0];
    if (!f) { alert(t("doc_choose")); return; }
    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    if (!endpoint) { alert(t("doc_setup")); return; }
    var fr = new FileReader();
    fr.onload = function () {
      fetch(endpoint, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "doc-upload", folder: folder, name: f.name, mime: f.type, data: fr.result })
      }).then(function () {
        return db.collection("vendors").doc(me.uid).update(update);
      }).then(function () {
        return db.collection("vendors").doc(me.uid).get();
      }).then(function (snap) {
        vendor = snap.data(); renderDocs(); renderW9(); renderSetup();
        alert(t("doc_received"));
      }).catch(function () { alert(t("doc_failed")); });
    };
    fr.readAsDataURL(f);
  }

  // ---------- Agreements (re-sign updated versions) ----------
  var AGREEMENTS_VERSION = "2026-10-15";
  var NDA_URL = "https://primeguardmia.com/assets/PrimeGuard-NDA-NonCircumvention.pdf";
  var ICA_URL = "https://primeguardmia.com/assets/PrimeGuard-Independent-Contractor-Agreement.pdf";

  // Location tracking consent (2026-10-17 build, short in-app version):
  // its own version, separate from the NDA/ICA version above. The
  // vendor accepts the short one-screen notice the first time they tap
  // "On my way"; the acceptance is stored on the vendor doc as
  // locationConsent {accepted, acceptedAt, version} and is what
  // activates live tracking on their jobs.
  var CONSENT_VERSION = "2026-10-17";
  function consentSigned() {
    return !!(vendor && vendor.locationConsent && vendor.locationConsent.version === CONSENT_VERSION);
  }

  function fmtDate(x, withYear) {
    if (!x) return "";
    var d = (x && typeof x.toDate === "function") ? x.toDate() : new Date(x);
    if (!d || isNaN(d.getTime())) return "";
    var opts = { month: "short", day: "numeric" };
    if (withYear) opts.year = "numeric";
    return d.toLocaleDateString(localeTag(), opts);
  }

  function renderAgreements() {
    var statusEl = $("va-status"), form = $("va-form");
    if (!statusEl || !form || !vendor) return;
    renderDrawerDots();
    var ag = vendor.agreements || {};
    var agSec = $("vd-agreements");
    if (agSec) agSec.classList.toggle("vd-doc-done", ag.version === AGREEMENTS_VERSION);
    if (ag.version === AGREEMENTS_VERSION) {
      hide(form);
      var when = fmtDate(ag.signedAt, true);
      statusEl.innerHTML =
        '<p style="font-size:.95rem;margin-bottom:10px"><strong style="color:var(--gold-bright)">' + esc(t("agr_signed_h")) + '</strong> — ' +
        esc(ag.signedName || "") + (when ? ", " + esc(when) : "") + "</p>" +
        '<p style="font-size:.9rem;color:var(--muted)">' + esc(t("agr_onfile")) +
        '<a href="' + NDA_URL + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">Non-Circumvention, Non-Solicitation and Confidentiality Agreement</a> · ' +
        '<a href="' + ICA_URL + '" target="_blank" rel="noopener" style="color:var(--gold-bright)">Independent Contractor Services Agreement</a></p>';
      return;
    }
    statusEl.innerHTML =
      '<h3 style="font-size:1.05rem;margin-bottom:6px">' + esc(t("agr_resign_h")) + '</h3>' +
      '<p style="color:var(--muted);font-size:.9rem;margin-bottom:14px;max-width:640px">' + esc(t("agr_resign_p")) + '</p>';
    var nameEl = $("va-name");
    if (nameEl && !nameEl.value) nameEl.value = ag.signedName || vendor.name || "";
    show(form);
    vaValidate();
  }

  function vaValidate() {
    var btn = $("va-sign");
    if (!btn) return;
    var name = ($("va-name").value || "").trim();
    var twoWords = name.split(/\s+/).filter(Boolean).length >= 2;
    btn.disabled = !($("va-nda").checked && $("va-ica").checked && twoWords);
  }

  ["va-nda", "va-ica"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("change", vaValidate);
  });
  if ($("va-name")) $("va-name").addEventListener("input", vaValidate);

  $("va-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("va-error"), okEl = $("va-ok");
    hide(errEl); hide(okEl);
    var old = (vendor && vendor.agreements) || {};
    var btn = $("va-sign");
    btn.disabled = true; btn.textContent = t("agr_signing");
    db.collection("vendors").doc(me.uid).update({
      agreements: {
        nda: true,
        contractorAgreement: true,
        signedName: $("va-name").value.trim(),
        signedAt: firebase.firestore.FieldValue.serverTimestamp(),
        version: AGREEMENTS_VERSION,
        previousSignedAt: old.signedAt || null
      }
    }).then(function () {
      return db.collection("vendors").doc(me.uid).get();
    }).then(function (snap) {
      vendor = snap.data();
      renderAgreements();
      okEl.textContent = t("agr_thanks");
      show(okEl);
    }).catch(function (err) {
      errEl.textContent = t("agr_err_pre") + (err.message || err) + t("agr_err_post");
      show(errEl);
      btn.disabled = false; btn.textContent = t("agr_sign");
      vaValidate();
    });
  });

  // ---------- W-9 status (upload lives in Documents needed above) ----------
  function renderW9() {
    var el = $("vd-w9-status");
    if (!el || !vendor) return;
    renderDrawerDots();
    var st = String(vendor.w9Status || "pending").toLowerCase();
    var w9Sec = $("vd-w9-sec");
    if (w9Sec) w9Sec.classList.toggle("vd-doc-done", st === "received" || st === "approved" || st === "submitted");
    if (st === "received" || st === "approved") {
      el.innerHTML = '<strong style="color:var(--gold-bright)">' + esc(t("w9_received")) + '</strong> <span style="color:var(--muted)">' + esc(t("w9_onfile_span")) + '</span>';
    } else if (st === "submitted") {
      el.innerHTML = '<strong style="color:var(--gold-bright)">' + esc(t("w9_submitted")) + '</strong> <span style="color:var(--muted)">' + esc(t("w9_sub_span")) + '</span>';
    } else {
      var due = fmtDate(vendor.w9Due, false);
      el.innerHTML = '<strong style="color:#f5d67b">' + esc(t("w9_pending")) + (due ? esc(t("w9_due_word")) + esc(due) : "") + '</strong> <span style="color:var(--muted)">' + esc(t("w9_pending_span")) + '</span>';
    }
  }

  /* ---------- Finish-your-setup checklist + payment info (v16) ----------
     Edwin's design (2026-10-17): after signup the portal shows the vendor
     a checklist of everything still owed, and one of the items is their
     payment information (Zelle preferred, ACH, or check). Saved on the
     vendor doc as payoutMethod / payoutZelle / payoutName / payoutBankName
     / payoutRouting / payoutAccount so the office knows where to send pay
     the moment a job closes. */
  function payoutComplete(v) {
    if (!v || !v.payoutMethod) return false;
    if (v.payoutMethod === "zelle") return !!(v.payoutZelle && v.payoutName);
    if (v.payoutMethod === "ach") return !!(v.payoutAccount && v.payoutName);
    if (v.payoutMethod === "check") return true;
    return false;
  }
  function payoutSummary(v) {
    if (v.payoutMethod === "zelle") return "Zelle \u00b7 " + (v.payoutZelle || "") + (v.payoutName ? " (" + v.payoutName + ")" : "");
    if (v.payoutMethod === "ach") return t("ps_bank") + " \u00b7 " + (v.payoutBankName || t("ps_bank_word")) + " \u2026" + String(v.payoutAccount || "").slice(-4) + (v.payoutName ? " (" + v.payoutName + ")" : "");
    if (v.payoutMethod === "check") return t("ps_check") + " \u00b7 " + (v.address || "");
    return "";
  }
  var setupPayOpen = false;
  function renderSetup() {
    var box = $("vd-setup");
    if (!box || !vendor) return;
    renderDrawerDots();
    var v = vendor;
    var w9st = String(v.w9Status || "pending").toLowerCase();
    var w9Done = w9st === "received" || w9st === "approved" || w9st === "submitted";
    var agreeDone = !!(v.agreements && v.agreements.version === AGREEMENTS_VERSION);
    var payDone = payoutComplete(v);
    var items = [
      { label: t("setup_pay_label"), done: payDone, hint: payDone ? payoutSummary(v) : t("setup_pay_hint"), anchor: null, pay: true },
      { label: t("setup_w9_label"), done: w9Done, hint: w9Done ? t("setup_onfile") : t("setup_w9_hint"), anchor: "#vd-w9-sec" },
      { label: t("setup_agr_label"), done: agreeDone, hint: agreeDone ? t("setup_agr_done") : t("setup_agr_hint"), anchor: "#vd-agreements" },
      { label: t("setup_consent_label"), done: consentSigned(), hint: consentSigned() ? t("setup_consent_done") : t("setup_consent_hint"), anchor: null }
    ];
    if (v.insured === "yes") {
      var coiDone = String(v.coiStatus || "").toLowerCase() === "received";
      items.push({ label: t("setup_coi_label"), done: coiDone, hint: coiDone ? t("setup_onfile") : t("setup_coi_hint"), anchor: "#vd-w9-sec" });
    }
    var doneN = items.filter(function (i) { return i.done; }).length;
    var html = '<div class="vd-doccard" style="margin-bottom:18px"><div class="t">' + esc(t("setup_title2")) + '</div>' +
      '<h4>' + (doneN === items.length ? esc(t("setup_complete")) : doneN + " " + t("of_word") + " " + items.length + " " + t("setup_done_suffix")) + "</h4>";
    items.forEach(function (it) {
      html += '<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed rgba(255,255,255,.09)">' +
        '<span style="font-size:1.05rem;line-height:1.3">' + (it.done ? "\u2705" : "\u2b1c") + "</span>" +
        '<div style="flex:1"><strong style="font-size:.95rem">' + esc(it.label) + '</strong><div style="font-size:.84rem;color:var(--muted)">' + esc(it.hint) + "</div></div>" +
        (it.pay ? '<button class="btn btn-gold" id="vd-pay-toggle" type="button" style="padding:8px 16px;font-size:.85rem">' + (it.done ? t("upd_btn") : t("add_btn")) + "</button>"
                 : (!it.done && it.anchor ? '<a class="btn btn-ghost" href="' + it.anchor + '" style="padding:8px 16px;font-size:.85rem;text-decoration:none">' + esc(t("go_btn")) + '</a>' : "")) +
        "</div>";
    });
    var showForm = setupPayOpen || !payDone;
    html += '<form id="vd-pay-form" class="vform' + (showForm ? "" : " hidden") + '" style="margin-top:14px;max-width:640px">' +
      '<label>' + esc(t("pay_method")) + '<select id="vd-paymethod" style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#141417;color:var(--text);font-size:1rem;margin-top:6px">' +
      '<option value="zelle">' + esc(t("method_zelle")) + '</option><option value="ach">' + esc(t("method_ach2")) + '</option><option value="check">' + esc(t("method_check2")) + '</option></select></label>' +
      '<div id="vd-pay-zelle"><label>' + esc(t("pay_label_zelle2")) + '<input type="text" id="vd-zelle" value="' + esc(v.payoutZelle || "") + '"></label>' +
      '<label>' + esc(t("pay_label_name")) + '<input type="text" id="vd-payname" value="' + esc(v.payoutName || "") + '"></label></div>' +
      '<div id="vd-pay-ach" class="hidden"><label>' + esc(t("pay_label_bank")) + '<input type="text" id="vd-bankname" value="' + esc(v.payoutBankName || "") + '"></label>' +
      '<label>' + esc(t("pay_label_routing")) + '<input type="text" id="vd-routing" inputmode="numeric" value="' + esc(v.payoutRouting || "") + '"></label>' +
      '<label>' + esc(t("pay_label_acct")) + '<input type="text" id="vd-account" inputmode="numeric" value="' + esc(v.payoutAccount || "") + '"></label>' +
      '<label>' + esc(t("pay_label_name")) + '<input type="text" id="vd-achname" value="' + esc(v.payoutName || "") + '"></label></div>' +
      '<p id="vd-pay-check" class="hidden" style="font-size:.88rem;color:var(--muted)">' + esc(t("check_note_pre")) + esc(v.address || "") + ".</p>" +
      '<p id="vd-pay-msg" style="font-size:.88rem;margin:8px 0"></p>' +
      '<button class="btn btn-gold" id="vd-pay-save" type="submit" style="padding:11px 22px">' + esc(t("pay_save_btn")) + '</button></form>';
    html += '<p style="font-size:.84rem;color:var(--muted);margin-top:12px">' + esc(t("alerts_line")) + ' <button class="btn btn-ghost" id="vd-setup-push" type="button" style="padding:7px 14px;font-size:.82rem;margin-left:6px">' + esc(t("alerts_btn2")) + '</button></p>';
    html += "</div>";
    box.innerHTML = html;
    var sel = $("vd-paymethod");
    if (sel) {
      sel.value = v.payoutMethod || "zelle";
      var sync = function () {
        var m = sel.value;
        $("vd-pay-zelle").classList.toggle("hidden", m !== "zelle");
        $("vd-pay-ach").classList.toggle("hidden", m !== "ach");
        $("vd-pay-check").classList.toggle("hidden", m !== "check");
      };
      sel.addEventListener("change", sync); sync();
    }
    var tog = $("vd-pay-toggle");
    if (tog) tog.addEventListener("click", function () { setupPayOpen = !setupPayOpen; renderSetup(); });
    var pushBtn = $("vd-setup-push");
    if (pushBtn) pushBtn.addEventListener("click", function () { if (window.PGpush) PGpush.enable("vendor"); });
    var form = $("vd-pay-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = sel.value;
      var data = {
        payoutMethod: m,
        payoutZelle: $("vd-zelle").value.trim(),
        payoutName: $("vd-payname").value.trim(),
        payoutBankName: $("vd-bankname").value.trim(),
        payoutRouting: $("vd-routing").value.trim(),
        payoutAccount: $("vd-account").value.trim(),
        payoutUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (m === "ach" && $("vd-achname").value.trim()) data.payoutName = $("vd-achname").value.trim();
      var msg = $("vd-pay-msg");
      var probe = Object.assign({}, vendor, data);
      if (!payoutComplete(probe)) {
        msg.style.color = "#e8a33d";
        msg.textContent = m === "zelle" ? t("val_zelle") : m === "ach" ? t("val_ach") : t("val_missing");
        return;
      }
      $("vd-pay-save").disabled = true;
      db.collection("vendors").doc(me.uid).update(data).then(function () {
        return db.collection("vendors").doc(me.uid).get();
      }).then(function (snap) {
        vendor = snap.data(); setupPayOpen = false;
        renderSetup(); renderDrawerDots();
        alert(t("setup_saved2"));
      }).catch(function () {
        msg.style.color = "#e88"; msg.textContent = t("save_failed");
        $("vd-pay-save").disabled = false;
      });
    });
  }

  // ---------- "My Day" helpers (money strip + next-job hero) ----------
  // Presentation only: these read fields the page already loads; no new
  // queries, no new writes, no invented figures.
  function parseDate(x) {
    if (!x) return null;
    if (typeof x.toDate === "function") { try { return x.toDate(); } catch (e) { return null; } }
    if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
    if (typeof x === "object" && typeof x.seconds === "number") return new Date(x.seconds * 1000);
    if (typeof x === "string" || typeof x === "number") {
      var d = new Date(x);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function fmtDateEs(d) {
    try { return d.toLocaleDateString(localeTag(), { weekday: "short", month: "short", day: "numeric" }); }
    catch (e) { return fmtDate(d); }
  }

  // Pay exactly as the office wrote it ("$45" or "45"); "" when unset.
  function fmtPay(w) {
    var raw = String((w && (w.payAgreed || w.pay)) || "").trim();
    if (!raw) return "";
    return raw.indexOf("$") >= 0 ? raw : "$" + raw;
  }

  // 3-day pay rule: pay releases 3 days after the vendor completed the
  // job (completedAt + 3 days). Null when there is no completion date.
  function payReleaseDate(w) {
    var cd = parseDate(w && w.completedAt);
    if (!cd) return null;
    var d = new Date(cd.getTime());
    d.setDate(d.getDate() + 3);
    return d;
  }
  function payReleaseText(w) {
    var d = payReleaseDate(w);
    if (!d) return "";
    return t("pay_release").replace("{date}", fmtDateEs(d));
  }

  function heroPhoto(w) {
    if (w.photos && w.photos.length) return w.photos[0];
    var s = ((w.category || "") + " " + (w.title || "")).toLowerCase();
    if (/lawn|césped|cesped|grass|mow|yard|jardín|jardin/.test(s)) return "assets/hero-lawn-daylight.jpg";
    if (/pressure|lavado|washing/.test(s)) return "assets/hero-pw-daylight.jpg";
    if (/junk|escombro|haul|debris|basura/.test(s)) return "assets/hero-junk-daylight.jpg";
    if (/handyman|repair|repar|plumb|electric/.test(s)) return "assets/hero-handyman-daylight.jpg";
    if (/make.?ready|paint|pintura|clean/.test(s)) return "assets/hero-makeready-daylight.jpg";
    return "assets/careers-crew.jpg";
  }

  var WO_DATE_FIELDS = ["scheduledFor", "scheduledDate", "serviceDate", "appointmentDate", "date", "when", "requestedWhen", "timing", "schedule", "preferredTime"];
  function jobWhen(w) {
    for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
      var val = w[WO_DATE_FIELDS[i]];
      if (val === null || val === undefined || val === "") continue;
      if (typeof val === "string") {
        if (val.indexOf(":") >= 0) return val; // carries its own time text
        var d = parseDate(val);
        if (d) return fmtDateEs(d);
        return val;
      }
      var dd = parseDate(val);
      if (dd) return fmtDateEs(dd);
    }
    var acc = parseDate(w.acceptedAt);
    if (acc) return t("accepted_on") + " " + fmtDateEs(acc);
    return "";
  }

  function statusLabelEs(w) {
    if (!w) return "";
    if (w.status === "accepted") return t("status_accepted");
    if (w.status === "evaluation_accepted") return t("status_eval_accepted");
    if (w.status === "en_route") return t("status_enroute");
    if (w.status === "arrived") return t("status_arrived");
    return String(w.status || "").replace(/_/g, " ");
  }

  // Next job to work: not the ones already finished (status "review" is
  // vendor-complete, waiting on the office). Earliest scheduled date when
  // the work order carries one; otherwise the most recently accepted.
  function pickHero(active) {
    var cands = active.filter(function (w) { return w.status !== "review"; });
    if (!cands.length) return null;
    function sched(w) {
      for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
        var d = parseDate(w[WO_DATE_FIELDS[i]]);
        if (d) return d.getTime();
      }
      return null;
    }
    cands.sort(function (a, b) {
      var sa = sched(a), sb = sched(b);
      if (sa !== null && sb !== null) return sa - sb;
      if (sa !== null) return -1;
      if (sb !== null) return 1;
      var aa = (parseDate(a.acceptedAt) || parseDate(a.createdAt) || new Date(0)).getTime();
      var ab = (parseDate(b.acceptedAt) || parseDate(b.createdAt) || new Date(0)).getTime();
      return ab - aa;
    });
    return cands[0];
  }

  var SVG_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  var SVG_NAV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
  var SVG_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  // Job checklists (Oct 18, Jobber-steal): per-service steps the vendor
  // ticks off; Mark complete is blocked until every step is checked.
  function checklistFor(w) {
    var cat = ((w.category || "") + " " + (w.title || "")).toLowerCase();
    if (/pressure|presión|presion|wash/.test(cat)) return t("ck_pressure");
    if (/lawn|landscap|césped|cesped|jardín|jardin|grass|mow|cut|corte/.test(cat)) return t("ck_lawn");
    return t("ck_default");
  }
  function checklistState(w) { return (w && w.checklist && typeof w.checklist === "object") ? w.checklist : {}; }
  function checklistDoneCount(w) { var st = checklistState(w); return checklistFor(w).filter(function (_, i) { return !!st[i]; }).length; }
  function checklistBarHtml(w) {
    var items = checklistFor(w), n = checklistDoneCount(w), pct = Math.round(n / items.length * 100);
    return '<div class="vd-checkbar"><div class="vd-checkbar-top"><span>' + esc(t("checklist_h")) + '</span><strong>' + n + "/" + items.length + '</strong></div><div class="vd-checktrack"><i style="width:' + pct + '%"></i></div></div>';
  }
  function checklistHtml(w) {
    var items = checklistFor(w), st = checklistState(w);
    return '<div class="vd-checklist">' + checklistBarHtml(w) + items.map(function (label, i) {
      return '<label class="vd-check"><input type="checkbox" data-checklist="' + w.id + '" data-idx="' + i + '"' + (st[i] ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
    }).join("") + "</div>";
  }

  function renderHero(w) {
    var box = $("vd-hero");
    if (!box) return;
    var cnt = $("vd-hero-cnt");
    if (cnt) cnt.textContent = w ? statusLabelEs(w) : "";
    if (!w) {
      box.innerHTML = '<div class="vd-hero vd-hero-empty"><div class="vd-hero-body">' +
        "<h3>" + esc(t("hero_none_h")) + "</h3>" +
        '<p class="vd-addr">' + esc(t("hero_none_p")) + '</p>' +
        "</div></div>";
      return;
    }
    var dest = w.address || (w.area ? w.area + ", Miami, FL" : "");
    var mapsBtn = dest
      ? '<a class="vd-btn vd-btn-gold" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '">' + SVG_NAV + esc(t("btn_directions")) + "</a>"
      : "";
    // Third action mirrors what this job kind already allows in the
    // active list — no new writes are invented here.
    var third;
    if (w.kind !== "quote_request") {
      third = '<button class="vd-btn vd-btn-dark" type="button" data-complete="' + w.id + '">' + SVG_CHECK + esc(t("btn_complete2")) + "</button>";
    } else if (!w.quoteSubmitted) {
      third = '<button class="vd-btn vd-btn-dark" type="button" data-give-quote="' + w.id + '">' + esc(t("btn_price")) + '</button>';
    } else {
      third = '<button class="vd-btn vd-btn-outline" type="button" disabled>' + esc(t("btn_price_sent")) + '</button>';
    }
    var pay = fmtPay(w);
    var payHtml = pay
      ? '<div><small>' + esc(t("pay_word")) + '</small><span class="vd-pay">' + esc(pay) + '</span></div><span class="vd-paynote">' + t("pay_note") + '</span>'
      : '<div><small>' + esc(t("pay_word")) + '</small><span class="vd-pay vd-pay-tqp">' + esc(t("tqp")) + '</span></div>';
    var when = jobWhen(w);
    box.innerHTML = '<article class="vd-hero" data-job-row="' + w.id + '">' +
      '<div class="vd-hero-photo"><img src="' + esc(heroPhoto(w)) + '" alt="">' +
      '<span class="vd-badge">' + esc(statusLabelEs(w)) + "</span></div>" +
      '<div class="vd-hero-body"><h3>' + esc(w.title) + "</h3>" +
      (when ? '<p class="vd-bigwhen">' + SVG_CLOCK + esc(when) + "</p>" : "") +
      '<p class="vd-addr">' + (w.area ? "<strong>" + esc(w.area) + "</strong>" : "") +
        (w.address ? " · " + esc(w.address) : "") +
        (w.details ? "<br>" + esc(w.details) : "") + "</p>" +
      '<div class="vd-payrow">' + payHtml + "</div>" +
      trackHtml(w, "vd-btn vd-btn-gold") +
      mapsBtn +
      '<button class="vd-btn vd-btn-outline" type="button" data-upload="' + w.id + '">' + SVG_CAM + esc(t("btn_upload")) + "</button>" +
      third +
      (w.kind !== "quote_request" ? checklistBarHtml(w) : "") +
      '<input type="file" accept="image/*" multiple class="hidden" id="up-' + w.id + '">' +
      "</div></article>";
  }

  /* ---------- Live job tracking (2026-10-17 build, rebased 2026-10-19) ----------
     ONE tap: the vendor taps "On my way" and that tap starts
     everything. The first tap shows the short location consent (one
     screen, accepted in the moment); the acceptance is saved on the
     vendor doc and the button never asks again. There is no "I
     arrived" button: while en route the portal watches this phone's
     location (throttled Firestore writes, about one per 45 seconds)
     and when two consecutive fixes land within TRACK_RADIUS_M of the
     property coordinates the job flips itself to "arrived". Tracking
     keeps running until the vendor marks the job complete, which
     stamps trackingStoppedAt and clears the watch. Fallbacks for
     arrival, whichever fires first: a one-shot location check when
     the portal loads with an en-route job on screen, and the phone's
     location at the first photo upload while en route. */
  var TRACK_RADIUS_M = 120;
  var TRACK_WRITE_MS = 45 * 1000;
  var trackWatchId = null;
  var trackWoId = null;
  var trackLastWrite = 0;
  var trackStreak = 0;
  var myJobsById = {};   // my accepted jobs by id, rebuilt by loadAll

  function haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Arrival test for one fix. force = accept a single in-radius fix
  // (photo-upload fallback: a photo at the property is strong proof).
  // Otherwise two consecutive in-radius fixes are required, so driving
  // past the street never marks a false arrival.
  function trackCheckArrival(w, lat, lng, force) {
    if (!w || w.status !== "en_route") return;
    if (typeof w.propertyLat !== "number" || typeof w.propertyLng !== "number") return;
    var d = haversineM(lat, lng, w.propertyLat, w.propertyLng);
    if (d > TRACK_RADIUS_M) { trackStreak = 0; return; }
    trackStreak++;
    if (trackStreak < 2 && !force) return;
    trackStreak = 0;
    w.status = "arrived";
    db.collection("work_orders").doc(w.id).update({
      status: "arrived",
      arrivedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLat: lat, lastLng: lng,
      lastLocAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(loadAll).catch(function () {});
  }

  function trackOnPosition(pos) {
    if (!trackWoId) return;
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    var w = myJobsById[trackWoId];
    if (w) { w.lastLat = lat; w.lastLng = lng; }
    trackCheckArrival(w, lat, lng, false);
    var now = Date.now();
    if (now - trackLastWrite < TRACK_WRITE_MS) return;
    trackLastWrite = now;
    db.collection("work_orders").doc(trackWoId).update({
      lastLat: lat, lastLng: lng,
      lastLocAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  }

  function startWatch(woId) {
    if (!("geolocation" in navigator)) return;
    if (trackWatchId !== null && trackWoId === woId) return;
    stopWatch();
    trackWoId = woId;
    trackStreak = 0;
    trackLastWrite = 0;
    try {
      trackWatchId = navigator.geolocation.watchPosition(trackOnPosition, function () {}, {
        enableHighAccuracy: true, maximumAge: 15000, timeout: 25000
      });
    } catch (e) { trackWatchId = null; }
  }

  function stopWatch() {
    if (trackWatchId !== null && "geolocation" in navigator) {
      try { navigator.geolocation.clearWatch(trackWatchId); } catch (e) {}
    }
    trackWatchId = null;
  }

  // Short in-app consent: a single screen shown before the FIRST
  // tracking start. Accepting saves locationConsent on the vendor doc
  // and then starts the trip the vendor asked for; cancelling (or
  // tapping outside) starts nothing.
  var consentPendingWo = null;
  function closeConsentPrompt() {
    var ov = $("vd-consent-modal");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    consentPendingWo = null;
  }
  function showConsentPrompt(woId) {
    closeConsentPrompt();
    consentPendingWo = woId;
    var ov = document.createElement("div");
    ov.id = "vd-consent-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:1200;background:rgba(24,20,10,.55);display:flex;align-items:center;justify-content:center;padding:18px");
    ov.innerHTML =
      '<div style="background:#fffdf6;border:1px solid #d9ab2b;border-radius:16px;max-width:430px;width:100%;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.35)">' +
      '<h3 style="font-size:1.08rem;margin-bottom:8px">📍 ' + esc(t("consent_h")) + "</h3>" +
      '<p style="font-size:.92rem;line-height:1.5;color:#4c4636">' + esc(t("consent_body")) + "</p>" +
      '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button type="button" class="vd-btn vd-btn-gold" id="vd-consent-accept" style="flex:1">' + esc(t("consent_accept")) + "</button>" +
      '<button type="button" class="vd-btn vd-btn-outline" id="vd-consent-cancel" style="flex:1">' + esc(t("consent_cancel")) + "</button>" +
      "</div></div>";
    document.body.appendChild(ov);
    $("vd-consent-cancel").addEventListener("click", closeConsentPrompt);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeConsentPrompt(); });
    $("vd-consent-accept").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true;
      var woId2 = consentPendingWo;
      db.collection("vendors").doc(me.uid).update({
        locationConsent: {
          accepted: true,
          acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
          version: CONSENT_VERSION
        }
      }).then(function () {
        if (vendor) vendor.locationConsent = { accepted: true, version: CONSENT_VERSION };
        closeConsentPrompt();
        renderSetup();
        if (woId2) startEnRoute(woId2);
      }).catch(function () {
        btn.disabled = false;
        alert(t("enroute_failed"));
      });
    });
  }

  function startEnRoute(woId) {
    var w = myJobsById[woId];
    if (!w) return;
    if (!consentSigned()) { showConsentPrompt(woId); return; }
    db.collection("work_orders").doc(woId).update({
      status: "en_route",
      enRouteAt: firebase.firestore.FieldValue.serverTimestamp(),
      trackingConsentVersion: CONSENT_VERSION,
      trackingStoppedAt: null
    }).then(function () {
      w.status = "en_route";
      startWatch(woId);
      loadAll();
    }).catch(function (err) {
      alert(t("enroute_failed") + " (" + (err.message || err) + ")");
    });
  }

  // The tracking block on a job card (hero and active list): the one
  // big button before the job starts, then a plain status line once
  // tracking is live. Before the consent is accepted the button still
  // renders active: the tap itself opens the short consent.
  function trackHtml(w, btnCls) {
    if (!w || w.kind === "quote_request") return "";
    if (w.status === "en_route") {
      return '<p style="font-size:.9rem;font-weight:600;margin:10px 0 2px">🚗 ' + esc(t("track_enroute_line")) + "</p>";
    }
    if (w.status === "arrived") {
      return '<p style="font-size:.9rem;font-weight:600;margin:10px 0 2px">📍 ' + esc(t("track_arrived_line")) + "</p>";
    }
    if (["accepted", "scheduled", "in_progress"].indexOf(w.status) < 0) return "";
    var btn = '<button class="' + btnCls + '" type="button" data-enroute="' + w.id + '">' + esc(t("btn_enroute")) + "</button>";
    if (!consentSigned()) {
      btn += '<p style="font-size:.82rem;color:var(--muted);margin:6px 0 2px">' + esc(t("track_consent_note")) + "</p>";
    }
    return btn;
  }

  // ---------- Work orders ----------
  // Visibility (Edwin, 2026-10-16): an open work order is NOT visible to a
  // vendor just because it exists. It shows only when the office sent it to
  // this vendor (vendorNotifyTarget is their id, or they are the assignee)
  // or posted it as available work (broadcast). A specific target locks the
  // job to that vendor; legacy docs with no specific target fall back to the
  // broadcast flag (undefined broadcast counts as posted, matching how the
  // pre-board portal behaved for those docs).
  function woVisibleToMe(w) {
    if (!w || !me) return false;
    if (w.vendorNotifyTarget && w.vendorNotifyTarget !== "broadcast") {
      return w.vendorNotifyTarget === me.uid || w.vendorId === me.uid;
    }
    return w.broadcast === true || w.vendorId === me.uid;
  }

  // Inactive accounts (archived or rejected by the office) get no job
  // board: every job surface is cleared and one panel explains why. Their
  // profile, agreements and documents stay reachable above.
  function vendorInactive() {
    if (!vendor) return false;
    var st = vendor.status || (vendor.verified ? "approved" : "pending");
    return st === "archived" || st === "rejected";
  }
  function renderInactivePanel() {
    // The explanation panel lives in the quote-request list (jobs view):
    // land there so an inactive vendor actually sees it.
    showView("jobs");
    ["list-qr", "list-jobs", "list-active", "list-done", "vd-hero"].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = "";
    });
    ["cnt-qr", "cnt-jobs", "cnt-active", "cnt-done", "vd-hero-cnt"].forEach(function (id) {
      var el = $(id); if (el) el.textContent = "";
    });
    // No job board for inactive accounts: no menu entry point, no badges.
    if (burgerEl) burgerEl.classList.add("hidden");
    setDrawerBadge("vd-nav-badge-avail", 0);
    setDrawerBadge("vd-nav-badge-active", 0);
    openQRs = [];
    var sel = $("q-workorder");
    if (sel) sel.innerHTML = '<option value="">' + esc(t("q_pick")) + '</option>';
    var qr = $("list-qr");
    if (qr) {
      qr.innerHTML = '<div class="vjob" style="max-width:720px"><h3>' + esc(t("ina_h")) + '</h3>' +
        '<p>' + esc(t("ina_call")) + ' <a href="tel:+17864229674">(786) 422-9674</a>.</p>' +
        '<p style="color:var(--muted)">' + esc(t("ina_h_alt")) + '. ' + esc(t("ina_call_alt")) + ' (786) 422-9674.</p></div>';
    }
  }

  // Quote form dropdown: open quote requests + ones I accepted for evaluation,
  // minus any I already quoted. Any open request can be quoted right from its card.
  function buildQuoteSelect() {
    var sel = $("q-workorder");
    if (!sel) return;
    var cur = sel.value;
    var quotable = [], seenQ = {};
    myEvals.concat(openQRs).forEach(function (w) {
      if (seenQ[w.id] || myQuoted[w.id]) return;
      seenQ[w.id] = true;
      quotable.push(w);
    });
    sel.innerHTML = '<option value="">' + esc(t("q_pick")) + '</option>' + quotable.map(function (w) {
      return '<option value="' + w.id + '">' + esc(w.title) + " - " + esc(w.area) + "</option>";
    }).join("");
    if (cur) sel.value = cur;
  }

  function loadAll() {
    if (vendorInactive()) { renderInactivePanel(); return; }
    if (burgerEl) burgerEl.classList.remove("hidden");
    liveOn("vd-quotes", db.collection("quotes").where("vendorId", "==", me.uid), function (qs) {
      myQuoted = {};
      qs.forEach(function (d) {
        var q = d.data();
        if (q.workOrderId) myQuoted[q.workOrderId] = true;
      });
      buildQuoteSelect();
    }, function () { myQuoted = {}; });
    // Scoped board queries (privacy hardening, 2026-10-16): the database
    // rules only let a vendor read broadcast jobs or jobs sent to them,
    // so the board asks for exactly those two sets instead of every open
    // work order. A missing broadcast flag now means private.
    function boardRender() {
      var boardSeen = {}, boardDocs = [];
      function boardCollect(qs) {
        if (!qs) return;
        qs.forEach(function (d) {
          if (boardSeen[d.id]) return;
          boardSeen[d.id] = 1;
          var w = d.data(); w.id = d.id;
          if (w.status !== "open") return;
          boardDocs.push(w);
        });
      }
      boardCollect(liveCache["vd-board-a"]);
      boardCollect(liveCache["vd-board-b"]);
      var jobs = [], qrs = [];
      boardDocs.forEach(function (w) {
        if (!woVisibleToMe(w)) return; // not sent to me and not posted as available work
        if (w.kind === "quote_request") qrs.push(w); else jobs.push(w);
      });
      openQRs = qrs;
      renderList($("list-qr"), qrs, "quote_request");
      renderList($("list-jobs"), jobs, "job");
      $("cnt-qr").textContent = qrs.length + (qrs.length === 1 ? t("cnt_new1") : t("cnt_newn"));
      setDrawerBadge("vd-nav-badge-avail", qrs.length);
      $("cnt-jobs").textContent = jobs.length + t("cnt_avail");
      $("st-open").textContent = jobs.length + qrs.length;
      buildQuoteSelect();
      renderHome();
    }
    liveOn("vd-board-a", db.collection("work_orders").where("broadcast", "==", true), boardRender, function () {});
    liveOn("vd-board-b", db.collection("work_orders").where("vendorNotifyTarget", "==", me.uid), boardRender, function () {});
    liveOn("vd-mine", db.collection("work_orders").where("vendorId", "==", me.uid), function (qs) {
      var active = [], done = [], earned = 0, pending = 0, pendingN = 0;
      myEvals = [];
      qs.forEach(function (d) {
        var w = d.data(); w.id = d.id;
        if (w.status === "open") return; // not accepted yet - shows in the open lists above
        if (w.status === "done") {
          done.push(w);
          earned += parseFloat(w.payAgreed || w.pay || 0) || 0;
        } else {
          active.push(w);
          if (w.status === "review") { pending += parseFloat(w.payAgreed || w.pay || 0) || 0; pendingN++; }
          if (w.kind === "quote_request" && w.status === "evaluation_accepted") myEvals.push(w);
        }
      });
      // Este mes (money strip): pay from jobs I completed — status
      // "review" (I marked it complete) or "done" (office closed it) —
      // whose completedAt falls in the current calendar month. Jobs
      // without a parseable completedAt are excluded here only; jobs
      // without pay count as 0, exactly like the totals below.
      var nowD = new Date(), mSum = 0, mCount = 0;
      active.concat(done).forEach(function (w) {
        if (w.status !== "review" && w.status !== "done") return;
        var cd = parseDate(w.completedAt);
        if (cd && cd.getFullYear() === nowD.getFullYear() && cd.getMonth() === nowD.getMonth()) {
          mSum += parseFloat(w.payAgreed || w.pay || 0) || 0;
          mCount++;
        }
      });
      var mEl = $("st-month"); if (mEl) mEl.textContent = "$" + mSum.toLocaleString();
      var mnEl = $("st-month-n"); if (mnEl) mnEl.textContent = mCount ? mCount + (mCount === 1 ? t("mn_one") : t("mn_many")) : "";
      myReviewJobs = active.filter(function (w) { return w.status === "review"; });
      // Live tracking state: cache my jobs for the tracking engine,
      // and if a job is already en route (the page reloaded mid-drive,
      // say), resume its location watch instead of losing the trip.
      myJobsById = {};
      active.concat(done).forEach(function (w) { myJobsById[w.id] = w; });
      var liveJob = null;
      active.forEach(function (w) { if (!liveJob && (w.status === "en_route" || w.status === "arrived")) liveJob = w; });
      if (liveJob) {
        startWatch(liveJob.id);
        // Arrival fallback: one location check as the job card opens.
        if (liveJob.status === "en_route" && "geolocation" in navigator) {
          try {
            navigator.geolocation.getCurrentPosition(function (pos) {
              trackCheckArrival(liveJob, pos.coords.latitude, pos.coords.longitude, false);
            }, function () {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
          } catch (e) {}
        }
      }
      var heroJob = pickHero(active);
      renderHero(heroJob);
      renderActive(active, heroJob ? heroJob.id : null);
      renderDone(done);
      buildVendorCalEvents(active, done);
      renderVendorCal();
      renderCalConnect();
      writeCalFeedSnapshot();
      renderHome();
      $("st-done").textContent = done.length;
      $("st-earned").textContent = "$" + earned.toLocaleString();
      $("st-pending").textContent = "$" + pending.toLocaleString();
      $("st-pending-n").textContent = pendingN ? pendingN + t("pend_n") : t("pend_none");
      $("cnt-active").textContent = active.length + t("cnt_active");
      setDrawerBadge("vd-nav-badge-active", active.length);
      $("cnt-done").textContent = done.length + t("cnt_jobs");
      buildQuoteSelect();
    });
  }


  /* ---------- Calendario (portal calendars, Edwin's directive 2026-10-16) ---------- */
  var PG_FEED_BASE = "https://script.google.com/macros/s/AKfycbwoa49MG6y8_QIcyNKysYkWpIPmoWXc_R_9EslcKtcg0DulQDAuZNqNcg3k3VdBsb-D/exec";
  var vcalCursor = null;
  var vcalSelected = "";
  var vcalMap = {};
  function vcalPad(n) { return (n < 10 ? "0" : "") + n; }
  function vcalKey(d) { return d.getFullYear() + "-" + vcalPad(d.getMonth() + 1) + "-" + vcalPad(d.getDate()); }
  function vcalTime(w) {
    for (var i = 0; i < WO_DATE_FIELDS.length; i++) {
      var dd = parseDate(w[WO_DATE_FIELDS[i]]);
      if (dd && (dd.getHours() || dd.getMinutes())) return dd.toLocaleTimeString(localeTag(), { hour: "numeric", minute: "2-digit" });
    }
    return "";
  }
  function buildVendorCalEvents(active, done) {
    vcalMap = {};
    function pushEv(w, d) {
      var k = vcalKey(d);
      if (!vcalMap[k]) vcalMap[k] = [];
      vcalMap[k].push({ w: w, date: new Date(d) });
    }
    (active || []).concat(done || []).forEach(function (w) {
      var anchor = w.planAnchor ? parseDate(w.planAnchor) : null;
      var count = parseInt(w.visitCount, 10) || 0;
      if (anchor && count > 1) {
        var step = w.cadence === "weekly" ? 7 : 14;
        var t = parseDate(w.scheduledFor);
        for (var i = 0; i < count; i++) {
          var d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i * step);
          if (t && (t.getHours() || t.getMinutes())) d.setHours(t.getHours(), t.getMinutes(), 0, 0);
          pushEv(w, d);
        }
      } else {
        var placed = false;
        for (var j = 0; j < WO_DATE_FIELDS.length; j++) {
          var dd = parseDate(w[WO_DATE_FIELDS[j]]);
          if (dd) { pushEv(w, dd); placed = true; break; }
        }
        if (!placed) { var cd = parseDate(w.createdAt); if (cd) pushEv(w, cd); }
      }
    });
    var cnt = $("cnt-cal");
    if (cnt) { var n = Object.keys(vcalMap).length; cnt.textContent = n ? n + (n === 1 ? t("cnt_day") : t("cnt_days")) : ""; }
  }
  function renderVendorCal() {
    var grid = $("vcal-grid"); if (!grid) return;
    if (!vcalCursor) { var now = new Date(); vcalCursor = new Date(now.getFullYear(), now.getMonth(), 1); }
    var y = vcalCursor.getFullYear(), m = vcalCursor.getMonth();
    var titleEl = $("vcal-title");
    if (titleEl) titleEl.textContent = vcalCursor.toLocaleDateString(localeTag(), { month: "long", year: "numeric" });
    var firstDow = new Date(y, m, 1).getDay();
    var dim = new Date(y, m + 1, 0).getDate();
    var todayK = vcalKey(new Date());
    if (!vcalSelected) vcalSelected = todayK;
    var html = "";
    for (var b = 0; b < firstDow; b++) html += '<div class="vcal-cell empty"></div>';
    for (var day = 1; day <= dim; day++) {
      var k = vcalKey(new Date(y, m, day));
      var evs = vcalMap[k] || [];
      var dots = "";
      for (var i = 0; i < Math.min(evs.length, 3); i++) dots += '<span class="vcal-dot"></span>';
      html += '<button type="button" class="vcal-cell' + (k === todayK ? " today" : "") + (k === vcalSelected ? " sel" : "") + '" data-vcal-day="' + k + '"><span>' + day + '</span><span class="vcal-dots">' + dots + "</span></button>";
    }
    grid.innerHTML = html;
    renderVendorCalDay();
  }
  function renderVendorCalDay() {
    var box = $("vcal-day"); if (!box) return;
    var evs = (vcalMap[vcalSelected] || []).slice().sort(function (a, b) { return a.date - b.date; });
    var dObj = parseDate(vcalSelected + "T12:00:00");
    var head = dObj ? dObj.toLocaleDateString(localeTag(), { weekday: "long", day: "numeric", month: "long" }) : vcalSelected;
    if (!evs.length) {
      box.innerHTML = '<div class="vcal-dayh">' + esc(head) + '</div><p class="vcal-none">' + esc(t("cal_none_day")) + '</p>';
      return;
    }
    box.innerHTML = '<div class="vcal-dayh">' + esc(head) + "</div>" + evs.map(function (ev) {
      var w = ev.w;
      var meta = [vcalTime(w), w.address || w.area || "", statusLabelEs(w)].filter(Boolean).join(" · ");
      return '<div class="vcal-ev"><div class="vcal-ev-tx"><strong>' + esc(w.title || w.category || t("job_word")) + "</strong>" +
        (meta ? "<small>" + esc(meta) + "</small>" : "") + "</div>" +
        '<a class="btn btn-ghost vcal-ev-btn" href="#sec-mistrabajos">' + esc(t("view_job")) + '</a></div>';
    }).join("");
  }
  function vcalNewToken() {
    var s = "", chars = "abcdef0123456789";
    for (var i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function vcalIcsText() {
    function escT(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function z(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrimeGuard//Vendor Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PrimeGuard Trabajos"];
    var stamp = z(new Date());
    Object.keys(vcalMap).forEach(function (k) {
      vcalMap[k].forEach(function (ev, idx) {
        var w = ev.w;
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + w.id + "-" + k + "-" + idx + "@primeguardmia.com");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART:" + z(ev.date));
        lines.push("DTEND:" + z(new Date(ev.date.getTime() + 90 * 60000)));
        lines.push("SUMMARY:" + escT(w.title || w.category || "Trabajo PrimeGuard"));
        var loc = w.address || w.area || "";
        if (loc) lines.push("LOCATION:" + escT(loc));
        lines.push("DESCRIPTION:" + escT("Trabajo de PrimeGuard. Estado: " + statusLabelEs(w)));
        // Reminders in the subscribed phone calendar: a day before and
        // two hours before the visit.
        lines.push("BEGIN:VALARM");
        lines.push("ACTION:DISPLAY");
        lines.push("TRIGGER:-P1D");
        lines.push("END:VALARM");
        lines.push("BEGIN:VALARM");
        lines.push("ACTION:DISPLAY");
        lines.push("TRIGGER:-PT2H");
        lines.push("END:VALARM");
        lines.push("END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function writeCalFeedSnapshot() {
    if (!me || !vendor || !vendor.calendarToken) return;
    try {
      db.collection("calendar_feeds").doc(vendor.calendarToken).set({
        kind: "vendor", ownerUid: me.uid, ics: vcalIcsText(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }
  function renderCalConnect() {
    var inp = $("vcal-link"); if (!inp || !me || !vendor) return;
    var err = $("vcal-err");
    function showLink() { inp.value = PG_FEED_BASE + "?feed=vendor&id=" + encodeURIComponent(me.uid) + "&t=" + encodeURIComponent(vendor.calendarToken || ""); }
    if (vendor.calendarToken) { showLink(); return; }
    var tok = vcalNewToken();
    db.collection("vendors").doc(me.uid).update({ calendarToken: tok }).then(function () {
      vendor.calendarToken = tok; showLink(); writeCalFeedSnapshot();
    }).catch(function () {
      if (err) { err.textContent = t("cal_err2"); err.classList.remove("hidden"); }
    });
  }
  (function bindVcal() {
    var prev = $("vcal-prev"), next = $("vcal-next"), grid = $("vcal-grid");
    if (prev) prev.addEventListener("click", function () { if (!vcalCursor) vcalCursor = new Date(); vcalCursor = new Date(vcalCursor.getFullYear(), vcalCursor.getMonth() - 1, 1); renderVendorCal(); });
    if (next) next.addEventListener("click", function () { if (!vcalCursor) vcalCursor = new Date(); vcalCursor = new Date(vcalCursor.getFullYear(), vcalCursor.getMonth() + 1, 1); renderVendorCal(); });
    if (grid) grid.addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("[data-vcal-day]") : null; if (!b) return; vcalSelected = b.getAttribute("data-vcal-day"); renderVendorCal(); });
    var copy = $("vcal-copy");
    if (copy) copy.addEventListener("click", function () {
      var inp = $("vcal-link"); if (!inp || !inp.value) return;
      inp.select();
      function done() { copy.textContent = t("cal_copied_btn"); setTimeout(function () { copy.textContent = t("cal_copy"); }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done).catch(function () { try { document.execCommand("copy"); } catch (e) {} done(); });
      else { try { document.execCommand("copy"); } catch (e) {} done(); }
    });
    var regen = $("vcal-regen");
    if (regen) regen.addEventListener("click", function () {
      if (!me) return;
      var tok = vcalNewToken();
      var oldTok = vendor.calendarToken;
      db.collection("vendors").doc(me.uid).update({ calendarToken: tok }).then(function () {
        vendor.calendarToken = tok; renderCalConnect(); writeCalFeedSnapshot();
        if (oldTok && oldTok !== tok) { try { db.collection("calendar_feeds").doc(oldTok).delete().catch(function () {}); } catch (e) {} }
      }).catch(function () { var err = $("vcal-err"); if (err) { err.textContent = t("cal_regen_err"); err.classList.remove("hidden"); } });
    });
  })();

  function photoThumbs(w) {
    var ph = w.photos || [];
    if (!ph.length) return "";
    return '<div class="vthumbs">' + ph.slice(0, 3).map(function (u) {
      return '<img src="' + esc(u) + '" alt="job photo" loading="lazy">';
    }).join("") + "</div>";
  }

  function videoLinks(w) {
    var vids = [];
    if (Array.isArray(w.videos)) vids = vids.concat(w.videos);
    if (w.videoLink) vids.push(w.videoLink);
    vids = vids.filter(function (u, i) {
      return typeof u === "string" && /^https?:\/\//i.test(u) && vids.indexOf(u) === i;
    });
    if (!vids.length) return "";
    return '<div class="vvids">' + vids.map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t("watch_video")) + '</a>';
    }).join("") + "</div>";
  }

  function renderList(box, arr, kind) {
    if (!arr.length) { box.innerHTML = '<div class="vempty">' + esc(t("list_empty")) + '</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      // Same actions the portal has always had (data-* hooks unchanged):
      // quote requests -> accept evaluation / give a quote; direct jobs
      // -> accept job. Labels are Spanish-first in the My Day skin.
      var btn = kind === "quote_request"
        ? '<button class="btn btn-gold" data-accept-eval="' + w.id + '">' + esc(t("btn_accept_eval2")) + '</button>' +
          (myQuoted[w.id] ? "" : '<button class="btn btn-gold" data-give-quote="' + w.id + '">' + esc(t("btn_price")) + '</button>')
        : '<button class="btn btn-gold" data-accept-job="' + w.id + '">' + esc(t("btn_accept_job")) + '</button>';
      var pay = fmtPay(w);
      var payHtml = pay
        ? '<div class="vd-payline"><small>' + esc(t("pay_word")) + '</small><strong>' + esc(pay) + "</strong></div>"
        : '<div class="vd-payline"><span class="vd-tqp">' + esc(t("tqp")) + '</span></div>';
      return '<div class="vjob"><div class="t">' + esc(w.category || w.kind) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" +
        photoThumbs(w) + videoLinks(w) +
        '<div class="meta"><strong>' + esc(w.area || "") + "</strong></div>" +
        payHtml + btn + "</div>";
    }).join("");
  }

  function renderActive(arr, heroId) {
    var box = $("list-active");
    if (!arr.length) { box.innerHTML = '<div class="vempty">' + esc(t("active_none")) + '</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      var steps;
      if (w.kind === "quote_request") {
        steps = step(w.status !== "open", t("step_eval")) +
                step(w.quoteSubmitted, t("step_price"));
      } else {
        steps = step(true, t("step_wo")) +
                step(w.status === "en_route" || w.status === "arrived" || w.status === "review" || w.status === "done", t("step_enroute")) +
                step(w.status === "arrived" || w.status === "review" || w.status === "done", t("step_arrived")) +
                step((w.beforePhotos || []).length > 0, t("step_before")) +
                step(false, t("step_work")) +
                step(w.status === "review" || w.status === "done", t("step_after"));
      }
      // Completed jobs (in review) carry their pay + the release date
      // under the 3-day rule, right where the vendor looks for it.
      var payLine = "";
      if (w.status === "review") {
        var rp = fmtPay(w);
        var rel = payReleaseText(w);
        if (rp || rel) {
          payLine = '<div class="vd-payline">' + (rp ? "<small>" + esc(t("pay_word")) + "</small><strong>" + esc(rp) + "</strong>" : "") +
            (rel ? '<span class="vd-paydate" style="display:inline;margin:0">' + esc(rel) + "</span>" : "") + "</div>";
        }
      }
      return '<div class="vjob" data-job-row="' + w.id + '"><div class="t">' + esc(w.status.replace(/_/g, " ").toUpperCase()) + '</div>' +
        "<h3>" + esc(w.title) + "</h3><p>" + esc(w.details || "") + "</p>" + photoThumbs(w) + videoLinks(w) +
        payLine +
        '<ul class="vsteps">' + steps + "</ul>" +
        (w.kind !== "quote_request" ? checklistHtml(w) : "") +
        trackHtml(w, "btn btn-gold") +
        '<button class="btn btn-gold" data-upload="' + w.id + '">' + esc(t("btn_upload")) + '</button>' +
        (w.kind !== "quote_request" ? '<button class="btn btn-ghost" data-complete="' + w.id + '">' + esc(t("btn_complete2")) + '</button>' : "") +
        (w.kind === "quote_request" && !w.quoteSubmitted ? '<button class="btn btn-gold" data-give-quote="' + w.id + '">' + esc(t("btn_price")) + '</button>' : "") +
        // The hero card carries this job's one file input; skip the
        // duplicate here so #up-{id} exists exactly once per job.
        (w.id === heroId ? "" : '<input type="file" accept="image/*" multiple class="hidden" id="up-' + w.id + '">') +
        "</div>";
    }).join("");
  }

  function step(done, label) {
    return '<li class="' + (done ? "sdone" : "stodo") + '"><span class="vdot">' + (done ? "✓" : "·") + "</span>" + esc(label) + "</li>";
  }

  function renderDone(arr) {
    var box = $("list-done");
    if (!arr.length) { box.innerHTML = '<div class="vempty">' + esc(t("done_none2")) + '</div>'; return; }
    box.innerHTML = arr.map(function (w) {
      var rel = payReleaseText(w);
      return '<div class="vhrow" data-job-row="' + w.id + '"><div class="info"><strong>' + esc(w.title) + '</strong><span>' + esc(w.area || "") + " · " + esc(w.completedAt || "") + "</span></div>" +
        '<div class="vpaid">$' + esc(w.payAgreed || w.pay || "?") + "<small>" + esc(t("paid_per")) + "</small>" +
        (rel ? '<span class="vd-paydate">' + esc(rel) + "</span>" : "") + "</div></div>";
    }).join("");
  }

  // ---------- Inicio: "Mi semana" home view ----------
  // Monday-first week for the home strip (the month calendar keeps its
  // Sunday-first grid, untouched). Days, jobs and money all come from
  // data the portal already loads: vcalMap, the money strip, my jobs.
  function homeWeekDates() {
    var now = new Date();
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    var out = [];
    for (var i = 0; i < 7; i++) out.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    return out;
  }

  function renderHome() {
    var strip = $("vhome-strip");
    if (!strip) return;
    if (!homeDayKey) homeDayKey = vcalKey(new Date());
    renderHomeWeek();
    renderHomeDay();
    // Money band: this month mirrors the Mi dinero tile. "On the way"
    // is the pay sitting in review, with its earliest release date.
    var mEl = $("vhome-month");
    if (mEl) { var sm = $("st-month"); mEl.textContent = sm ? sm.textContent : "$0"; }
    var sum = 0, next = null;
    myReviewJobs.forEach(function (w) {
      sum += parseFloat(w.payAgreed || w.pay || 0) || 0;
      var d = payReleaseDate(w);
      if (d && (!next || d < next)) next = d;
    });
    var oEl = $("vhome-onway");
    if (oEl) oEl.textContent = "$" + sum.toLocaleString();
    var nEl = $("vhome-nextpay");
    if (nEl) nEl.textContent = next ? t("home_next_pay").replace("{date}", fmtDateEs(next)) : (myReviewJobs.length ? "" : t("pend_none"));
    var opp = $("vhome-opp-n");
    if (opp) opp.textContent = openQRs.length;
  }

  function renderHomeWeek() {
    var strip = $("vhome-strip");
    if (!strip) return;
    var dates = homeWeekDates();
    var keys = dates.map(function (d) { return vcalKey(d); });
    if (keys.indexOf(homeDayKey) < 0) homeDayKey = vcalKey(new Date());
    var lbl = $("vhome-week-label");
    if (lbl) lbl.textContent = t("home_week").replace("{a}", fmtDate(dates[0])).replace("{b}", fmtDate(dates[6]));
    var n = 0;
    keys.forEach(function (k) { n += (vcalMap[k] || []).length; });
    var nEl = $("vhome-week-n");
    if (nEl) nEl.textContent = t("home_jobs").replace("{n}", n);
    var todayK = vcalKey(new Date());
    strip.innerHTML = dates.map(function (d) {
      var k = vcalKey(d);
      var has = (vcalMap[k] || []).length > 0;
      return '<button type="button" class="vhome-day-cell' + (k === homeDayKey ? " sel" : "") + (k === todayK ? " today" : "") + '" data-home-day="' + k + '">' +
        '<span class="vhome-dow">' + esc(d.toLocaleDateString(localeTag(), { weekday: "narrow" })) + '</span>' +
        '<span class="vhome-dnum">' + d.getDate() + '</span>' +
        '<span class="vhome-dots">' + (has ? "<i></i>" : "") + "</span></button>";
    }).join("");
  }

  function renderHomeDay() {
    var box = $("vhome-day");
    if (!box) return;
    var evs = (vcalMap[homeDayKey] || []).slice().sort(function (a, b) { return a.date - b.date; });
    if (!evs.length) {
      box.innerHTML = '<p class="vcal-none" style="padding:8px 0 4px">' + esc(t("cal_none_day")) + "</p>";
      return;
    }
    box.innerHTML = evs.map(function (ev) {
      var w = ev.w;
      var meta = [vcalTime(w), w.address || w.area || "", statusLabelEs(w)].filter(Boolean).join(" · ");
      return '<div class="vhome-ev"><div class="vhome-ev-tx"><strong>' + esc(w.title || w.category || t("job_word")) + "</strong>" +
        (meta ? "<small>" + esc(meta) + "</small>" : "") + "</div>" +
        '<button type="button" class="vhome-ev-btn" data-home-job="' + w.id + '">' + esc(t("view_job")) + "</button></div>";
    }).join("");
  }

  // Jump to one of my job cards: switch to its view first, then scroll
  // to the card and flash its outline so the eye lands on it.
  function goToJob(id) {
    showView("my");
    setTimeout(function () {
      var card = document.querySelector('[data-job-row="' + id + '"]');
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("vd-flash");
        setTimeout(function () { card.classList.remove("vd-flash"); }, 2400);
      } else {
        var sec = $("sec-mistrabajos");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 40);
  }

  // ---------- View navigation ----------
  // Every dashboard section carries data-view; only the active view's
  // sections are visible. Tabs, the drawer, in-page anchors and the
  // home quick actions all funnel through goTo()/showView().
  function viewOfEl(el) {
    var n = el && el.closest ? el.closest("[data-view]") : null;
    return n ? n.getAttribute("data-view") : "home";
  }
  function showView(view) {
    currentView = VD_VIEWS.indexOf(view) >= 0 ? view : "home";
    document.querySelectorAll("#vd-dash [data-view]").forEach(function (sec) {
      sec.classList.toggle("vd-view-off", sec.getAttribute("data-view") !== currentView);
    });
    document.querySelectorAll(".vd-tab").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var tgt = href.charAt(0) === "#" ? document.querySelector(href) : null;
      a.classList.toggle("active", !!tgt && viewOfEl(tgt) === currentView);
    });
  }
  function goTo(target) {
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;
    showView(viewOfEl(el));
    document.querySelectorAll(".vd-drawer-link").forEach(function (a) {
      a.classList.toggle("active", !!el.id && a.getAttribute("href") === "#" + el.id);
    });
    setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 40);
  }

  // ---------- Actions (event delegation) ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.acceptJob) {
      db.collection("work_orders").doc(t.dataset.acceptJob).update({
        vendorId: me.uid, vendorBusiness: vendor.business, status: "accepted",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(loadAll);
    }
    if (t.dataset.acceptEval) {
      db.collection("work_orders").doc(t.dataset.acceptEval).update({
        vendorId: me.uid, vendorBusiness: vendor.business, status: "evaluation_accepted",
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(loadAll);
    }
    if (t.dataset.enroute) {
      startEnRoute(t.dataset.enroute);
    }
    if (t.dataset.complete) {
      if (!confirm(tr("confirm_complete"))) return;
      var cWoId = t.dataset.complete;
      var cRef = db.collection("work_orders").doc(cWoId);
      cRef.get().then(function (snap) {
        return snap.exists ? snap.data() : null;
      }, function () { return null; }).then(function (jw) {
        if (jw && jw.kind !== "quote_request") {
          var cItems = checklistFor(jw), cSt = checklistState(jw);
          var cMissing = cItems.filter(function (_, i) { return !cSt[i]; }).length;
          if (cMissing > 0) { alert(tr("alert_checklist_pre") + cMissing + tr("alert_checklist_post")); return null; }
        }
        // Tracking stops the moment the job is marked complete.
        var stopTrack = !!(jw && (jw.status === "en_route" || jw.status === "arrived" || jw.enRouteAt));
        if (stopTrack && trackWoId === cWoId) { stopWatch(); trackWoId = null; }
        var nowIso = new Date().toISOString();
        var visitEntry = {
          visitDate: nowIso,
          completedAt: nowIso,
          vendorId: me.uid,
          vendorBusiness: (jw && jw.vendorBusiness) || (vendor && vendor.business) || "",
          photos: (sessionPhotosByWo[cWoId] || []).slice(),
          note: ""
        };
        var cupd = {
          status: "review",
          completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          visitLog: firebase.firestore.FieldValue.arrayUnion(visitEntry)
        };
        if (stopTrack) cupd.trackingStoppedAt = firebase.firestore.FieldValue.serverTimestamp();
        return cRef.update(cupd);
      }).then(loadAll);
    }
    if (t.dataset.upload) {
      var inp = document.getElementById("up-" + t.dataset.upload);
      if (inp) inp.click();
    }
    if (t.dataset.giveQuote) {
      var qsel = $("q-workorder");
      if (qsel) qsel.value = t.dataset.giveQuote;
      var qform = $("vd-quoteform");
      if (qform) goTo(qform);
      setTimeout(function () {
        var qp = $("q-price");
        if (qp) qp.focus({ preventScroll: true });
      }, 500);
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.checklist) {
      var upd = {};
      upd["checklist." + t.dataset.idx] = !!t.checked;
      db.collection("work_orders").doc(t.dataset.checklist).update(upd).then(loadAll, loadAll);
      return;
    }
    if (t.id && t.id.indexOf("up-") === 0 && t.files.length) {
      var woId = t.id.slice(3);
      uploadPhotos(woId, t.files);
    }
  });

  // ---------- Photo upload via Apps Script + Drive ----------
  function uploadPhotos(woId, files) {
    var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
    if (!endpoint) { alert(t("photo_setup")); return; }
    var readers = Array.prototype.map.call(files, function (f) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () {
          var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res({ filename: f.name, mimeType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.82).split(",")[1] });
        };
        var fr = new FileReader();
        fr.onload = function () { img.src = fr.result; };
        fr.readAsDataURL(f);
      });
    });
    Promise.all(readers).then(function (photos) {
      return fetch(endpoint, {
        method: "POST", mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "photo-upload", workOrderId: woId, vendorId: me.uid, photos: photos })
      }).then(function (r) { return r.json(); });
    }).then(function (out) {
      if (!out.ok) throw new Error(out.error || "upload failed");
      (sessionPhotosByWo[woId] = sessionPhotosByWo[woId] || []).push.apply(sessionPhotosByWo[woId], out.urls);
      return db.collection("work_orders").doc(woId).update({
        photos: firebase.firestore.FieldValue.arrayUnion.apply(null, out.urls)
      });
    }).then(function () {
      // Arrival fallback: a photo uploaded while en route checks this
      // phone's location once. A fix inside the property radius
      // confirms arrival even if the live watch missed it (the photo
      // itself was taken at the property).
      var w = myJobsById[woId];
      if (w && w.status === "en_route" && "geolocation" in navigator) {
        try {
          navigator.geolocation.getCurrentPosition(function (pos) {
            trackCheckArrival(w, pos.coords.latitude, pos.coords.longitude, true);
          }, function () {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
        } catch (e) {}
      }
    }).then(loadAll).catch(function (err) { alert(t("upload_failed") + ": " + err.message); });
  }

  // ---------- Quote form ----------
  $("vd-quoteform").addEventListener("submit", function (e) {
    e.preventDefault();
    var errEl = $("q-error"), okEl = $("q-ok");
    errEl.classList.add("hidden"); okEl.classList.add("hidden");
    var woId = $("q-workorder").value;
    if (!woId) { errEl.textContent = t("q_pick_first"); errEl.classList.remove("hidden"); return; }
    var pdfFile = $("q-pdf").files[0] || null;
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = pdfFile ? t("q_uploading") : t("q_submitting");
    function collectAddons() {
      var out = [];
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-row"), function (row) {
        var chk = row.querySelector(".q-addon-check");
        var priceEl = row.querySelector(".q-addon-price");
        if (!chk || !chk.checked) return;
        var p = parseFloat(String(priceEl.value || "").replace(/[^0-9.]/g, ""));
        if (!(p > 0)) return;
        out.push({ label: chk.dataset.label, price: p });
      });
      return out;
    }
    var quoteAddons = collectAddons();
    function saveQuote(pdfUrl) {
      return db.collection("quotes").add({
        workOrderId: woId,
        vendorId: me.uid,
        vendorBusiness: vendor.business,
        vendorPhone: vendor.phone,
        price: $("q-price").value.trim(),
        duration: $("q-duration").value.trim(),
        notes: $("q-notes").value.trim(),
        addons: quoteAddons,
        quotePdfUrl: pdfUrl || null,
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    function uploadPdf() {
      if (!pdfFile) return Promise.resolve(null);
      var endpoint = (window.SITE_CONFIG && window.SITE_CONFIG.photoEndpoint) || "";
      if (!endpoint) return Promise.resolve(null);
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () {
          fetch(endpoint, {
            method: "POST", mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ type: "doc-upload", folder: "vendor-quotes", name: pdfFile.name, mime: pdfFile.type, data: fr.result })
          }).then(function () { res("uploaded"); }).catch(function () { res(null); });
        };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(pdfFile);
      });
    }
    uploadPdf().then(saveQuote).then(function () {
      return db.collection("work_orders").doc(woId).update({ quoteSubmitted: true, vendorAddons: quoteAddons });
    }).then(function () {
      okEl.classList.remove("hidden");
      $("q-price").value = ""; $("q-duration").value = ""; $("q-notes").value = ""; $("q-pdf").value = "";
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-check"), function (c) { c.checked = false; });
      Array.prototype.forEach.call(document.querySelectorAll(".q-addon-price"), function (p) { p.value = ""; });
      btn.disabled = false; btn.textContent = t("q_submit");
      loadAll();
    }).catch(function (err) { errEl.textContent = err.message; errEl.classList.remove("hidden"); btn.disabled = false; btn.textContent = t("q_submit"); });
  });

  // ---------- Bottom tab bar + view navigation bindings ----------
  // Tabs switch views (no more one long scroll): each tab funnels into
  // goTo(), which shows the target's view and glides to it. The gold
  // "active" state is owned by showView(). Any other in-page anchor
  // inside the dashboard (the calendar's "Ver trabajo", the setup Go
  // buttons) gets the same treatment: correct view first, then anchor.
  (function () {
    document.querySelectorAll(".vd-tab").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var href = a.getAttribute("href") || "";
        if (href.charAt(0) !== "#") return;
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        goTo(target);
      });
    });
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      if (a.classList.contains("vd-drawer-link") || a.classList.contains("vd-tab")) return; // own handlers above / at the drawer
      var dash = $("vd-dash");
      if (!dash || !dash.contains(a)) return;
      var href = a.getAttribute("href") || "";
      if (href.length < 2) return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      goTo(target);
    });
    // Inicio quick actions + the open-opportunities card.
    document.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { goTo(b.getAttribute("data-goto")); });
    });
    // Inicio week strip: tapping a day selects it; a day job's button
    // opens that job's card in Mis trabajos.
    var strip = $("vhome-strip");
    if (strip) strip.addEventListener("click", function (e) {
      var cell = e.target.closest ? e.target.closest("[data-home-day]") : null;
      if (!cell) return;
      homeDayKey = cell.getAttribute("data-home-day");
      renderHomeWeek();
      renderHomeDay();
    });
    var dayBox = $("vhome-day");
    if (dayBox) dayBox.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-home-job]") : null;
      if (!btn) return;
      goToJob(btn.getAttribute("data-home-job"));
    });
    // Drawer scroll-spy, kept from the single-scroll page and scoped
    // to the current view: within a multi-section view (Mis trabajos,
    // Trabajos, Más) the drawer link for the section on screen lights
    // up. Tab active state stays view-level, owned by showView().
    var drawerLinks = Array.prototype.slice.call(document.querySelectorAll(".vd-drawer-link"));
    var drawerMap = [
      ["sec-dinero", "#vd-topbar"],
      ["sec-proximo", "#sec-proximo"],
      ["sec-disponibles", "#sec-disponibles"],
      ["sec-jobs", "#sec-jobs"],
      ["sec-mistrabajos", "#sec-mistrabajos"],
      ["sec-calendario", "#sec-calendario"],
      ["sec-cotizar", "#sec-cotizar"],
      ["sec-done", "#sec-done"],
      ["vd-w9-sec", "#vd-w9-sec"],
      ["vd-agreements", "#vd-agreements"],
      ["vd-avisos", "#vd-avisos"],
      ["vd-perfil", "#vd-perfil"]
    ];
    var ticking = false;
    function update() {
      ticking = false;
      var dash = $("vd-dash");
      if (!dash || dash.classList.contains("hidden")) return;
      var dCurrent = null;
      for (var j = 0; j < drawerMap.length; j++) {
        var dEl = document.getElementById(drawerMap[j][0]);
        if (dEl && dEl.offsetParent !== null && viewOfEl(dEl) === currentView && dEl.getBoundingClientRect().top <= 160) dCurrent = drawerMap[j][1];
      }
      if (dCurrent === null) return;
      drawerLinks.forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("href") === dCurrent);
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    showView("home");
  })();
})();

// PrimeGuard customer quote signing page.
// Public by design: the customer opens quote-sign.html?id=<customer_quotes doc>
// from their email, reviews the quote, picks full payment or a 20% deposit,
// and signs by typing their full legal name. No account is needed; Firestore
// rules allow a single-doc public get and a tightly constrained sign update
// (status "sent" -> "signed", signing fields only).
// Payment: after signing, the page offers a "Pay now" button that asks the
// Apps Script backend for a Stripe Checkout session. The backend recomputes
// the amount from the signed Firestore quote (never from the browser) and
// returns the checkout URL. If online payment is not configured or the call
// fails, the page falls back to promising an emailed payment link, so the
// customer is never dead-ended.
(function () {
  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }
  function money(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "$" + v.toLocaleString(undefined, { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  }
  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = "0" + m;
    var day = String(d.getDate()); if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }
  // Firestore date fields arrive in different shapes depending on how
  // they were written: an ISO / "YYYY-MM-DD" string, a Firestore
  // Timestamp instance (toDate() / seconds), or a plain
  // { seconds, nanoseconds } object. Normalize all of them to a Date
  // and render a friendly US date; anything missing or unparseable
  // renders "" (never the raw object text, never "Invalid Date").
  function fmtDate(v) {
    if (v == null || v === "") return "";
    try {
      var d = null;
      if (typeof v === "string") {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
        if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        else { var p = new Date(v); if (!isNaN(p.getTime())) d = p; }
      } else if (typeof v.toDate === "function") {
        d = v.toDate();
      } else if (v.seconds != null && isFinite(Number(v.seconds))) {
        d = new Date(Number(v.seconds) * 1000 + Math.floor((Number(v.nanoseconds) || 0) / 1e6));
      } else if (v instanceof Date) {
        d = v;
      }
      if (!d || isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch (e) { return ""; }
  }

  var id = "", paidParam = "";
  try {
    var qsParams = new URLSearchParams(window.location.search);
    id = qsParams.get("id") || "";
    paidParam = qsParams.get("paid") || "";
  } catch (e) {}

  // Same Apps Script exec the rest of the site posts to (config.js).
  var payEndpoint = (window.SITE_CONFIG && (window.SITE_CONFIG.leadEndpoint || window.SITE_CONFIG.photoEndpoint)) || "";

  function message(html) {
    hide($("qs-loading")); hide($("qs-main")); hide($("qs-signed"));
    var m = $("qs-message");
    m.innerHTML = html;
    show(m);
  }
  function notFound() {
    message('<h1 class="qs-title">We could not find this quote</h1>' +
      '<p class="qs-meta">The link may be incomplete. Call us at (786) 422-9674 and we will sort it out.</p>');
  }

  if (!cfg || !cfg.apiKey || !id || typeof firebase === "undefined") { notFound(); return; }
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  var db = firebase.firestore();
  var ref = db.collection("customer_quotes").doc(id);
  var quote = null;

  ref.get().then(function (snap) {
    hide($("qs-loading"));
    if (!snap.exists) { notFound(); return; }
    quote = snap.data() || {};
    if (quote.status === "signed") { renderSigned(quote, paidParam); return; }
    if (quote.status !== "sent") { notFound(); return; }
    if (quote.expiresAt && String(quote.expiresAt) < todayKey()) {
      message('<h1 class="qs-title">This quote has expired</h1>' +
        '<p class="qs-meta">Call us at (786) 422-9674 and we will refresh it for you.</p>');
      return;
    }
    renderForm(quote);
  }).catch(function () {
    message('<h1 class="qs-title">Something went wrong</h1>' +
      '<p class="qs-meta">We could not load this quote. Call us at (786) 422-9674 and we will sort it out.</p>');
  });

  // ---- Payment panel (Stripe Checkout via the Apps Script) ----
  // The stored payChoice is "full" or "deposit20"; the backend
  // accepts "full" / "deposit" and re-verifies everything itself.
  function choiceOf(q) {
    var c = String((q && q.payChoice) || "").toLowerCase();
    return (c === "deposit20" || c === "deposit") ? "deposit" : "full";
  }
  function dueOf(q) {
    var total = Number(q.total) || 0;
    var dep = choiceOf(q) === "deposit";
    var due = dep ? (Number(q.amountDueNow) || Math.round(total * 0.2)) : total;
    return { total: total, due: due, dep: dep, balance: Math.round((total - due) * 100) / 100 };
  }

  function payPanelHtml(q, paidReturn) {
    if (paidReturn === "1") {
      return '<div class="qs-pay qs-pay-done">' +
        '<h2 class="qs-h2" style="margin-top:0">Payment received. Thank you!</h2>' +
        '<p class="qs-meta">We will confirm your start date shortly. Your receipt was emailed by our payment processor.</p></div>';
    }
    var d = dueOf(q);
    var retry = paidReturn === "0"
      ? '<p class="qs-meta">No charge was made. You can try again whenever you are ready.</p>' : "";
    var amountLine = d.dep
      ? '<strong>' + esc(money(d.due)) + ' due today.</strong> The ' + esc(money(d.balance)) + ' balance is due when the job is done.'
      : '<strong>' + esc(money(d.due)) + ' due today.</strong> One payment, and we schedule your job right away.';
    return '<div class="qs-pay">' +
      '<h2 class="qs-h2" style="margin-top:0">One last step: secure your spot</h2>' +
      retry +
      '<p class="qs-meta">' + amountLine + '</p>' +
      '<button type="button" class="btn btn-gold btn-lg qs-pay-btn" id="qs-pay-btn">Pay ' + esc(money(d.due)) + ' now</button>' +
      '<p class="qs-meta hidden" id="qs-pay-fallback" style="margin-top:12px"></p>' +
      '</div>';
  }

  function payFallback(due) {
    var f = $("qs-pay-fallback");
    if (!f) return;
    f.innerHTML = "Online payment is not available right this moment. We will email your secure payment link for <strong>" +
      esc(money(due)) + "</strong> and confirm your start date.";
    show(f);
  }

  function wirePay(q) {
    var btn = $("qs-pay-btn");
    if (!btn) return;
    var d = dueOf(q);
    btn.addEventListener("click", function () {
      if (!payEndpoint) { payFallback(d.due); return; }
      btn.disabled = true;
      btn.textContent = "Opening secure checkout...";
      fetch(payEndpoint, {
        method: "POST", mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ type: "stripe-checkout", quoteId: id, payChoice: d.dep ? "deposit" : "full" })
      }).then(function (r) { return r.json(); }).then(function (out) {
        if (out && out.ok && out.url) { window.location.href = out.url; return; }
        btn.disabled = false;
        btn.textContent = "Pay " + money(d.due) + " now";
        payFallback(d.due);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Pay " + money(d.due) + " now";
        payFallback(d.due);
      });
    });
  }

  function renderForm(q) {
    var baseTotal = Number(q.total) || 0;
    var total = baseTotal;
    var deposit = Math.round(total * 0.2);
    var balance = Math.round((total - deposit) * 100) / 100;
    function pickedAddons() {
      var picked = [];
      Array.prototype.forEach.call(document.querySelectorAll(".qs-addon input[type=checkbox]:checked"), function (cb) {
        picked.push({ label: cb.getAttribute("data-label") || "Add-on", amount: Number(cb.getAttribute("data-price")) || 0 });
      });
      return picked;
    }
    function recompute() {
      var extra = pickedAddons().reduce(function (s2, a) { return s2 + a.amount; }, 0);
      total = Math.round((baseTotal + extra) * 100) / 100;
      deposit = Math.round(total * 0.2);
      balance = Math.round((total - deposit) * 100) / 100;
      $("qs-total").textContent = money(total);
      $("qs-opt-full-t").textContent = "Pay in full: " + money(total);
      $("qs-opt-dep-t").textContent = "Pay 20% deposit to schedule: " + money(deposit) + " now";
      $("qs-opt-dep-d").textContent = money(deposit) + " today, and the " + money(balance) + " balance is due when the job is done.";
    }

    $("qs-for").innerHTML = "<strong>" + esc(q.customerName || "") + "</strong>" +
      (q.address ? "<br>" + esc(q.address) : "") +
      (q.service ? "<br>" + esc(q.service) : "");

    var items = Array.isArray(q.items) ? q.items : [];
    if (!items.length && total) items = [{ label: q.service || "Service", amount: total }];
    $("qs-items").innerHTML = items.map(function (it) {
      return '<div class="qs-line"><span>' + esc(it.label || "Service") + "</span><span>" + esc(money(it.amount)) + "</span></div>";
    }).join("");
    var addons = Array.isArray(q.addons) ? q.addons.filter(function (a) { return a && a.label && Number(a.amount) > 0; }) : [];
    if (addons.length) {
      var box = $("qs-addons");
      box.innerHTML = '<div class="qs-addon-head">Optional add-ons, only if you want them</div>' + addons.map(function (a) {
        return '<label class="qs-addon"><input type="checkbox" data-label="' + esc(a.label) + '" data-price="' + Number(a.amount) + '"><span>' + esc(a.label) + '</span><span class="amt">+ ' + esc(money(a.amount)) + "</span></label>";
      }).join("");
      box.style.display = "";
      Array.prototype.forEach.call(box.querySelectorAll("input[type=checkbox]"), function (cb) { cb.addEventListener("change", recompute); });
    }
    recompute();
    var expTxt = fmtDate(q.expiresAt);
    $("qs-expiry").textContent = expTxt ? "Valid until " + expTxt : "";
    if (q.notes) { var n = $("qs-notes"); n.textContent = q.notes; show(n); }

    $("qs-opt-full-d").textContent = "One payment, and we schedule your job right away.";

    // Email capture: pre-fill from the quote doc when we already have
    // one (the office sets customerEmail when the quote is built; older
    // quotes may only carry it inside contact / customerContact).
    var emailInput = $("qs-email"), optinInput = $("qs-marketing");
    if (emailInput) {
      var preEmail = q.customerEmail ||
        (/@/.test(q.contact || "") ? q.contact : "") ||
        (/@/.test(q.customerContact || "") ? q.customerContact : "");
      if (preEmail) emailInput.value = preEmail;
    }
    // SMS consent: pre-fill the mobile from the quote doc when we have
    // one (customerPhone, or a phone-shaped contact / customerContact).
    var phoneInput = $("qs-phone"), smsInput = $("qs-sms");
    if (phoneInput) {
      var phoneLike = function (s) {
        return s && !/@/.test(s) && (s.replace(/\D/g, "").length >= 10) ? s : "";
      };
      var prePhone = q.customerPhone || q.phone ||
        phoneLike(q.contact || "") || phoneLike(q.customerContact || "");
      if (prePhone) phoneInput.value = prePhone;
    }

    show($("qs-main"));

    var nameInput = $("qs-sign-name"), agree = $("qs-agree"), btn = $("qs-sign-btn");
    function payChoice() {
      var r = document.querySelector('input[name="qs-pay"]:checked');
      return r ? r.value : "";
    }
    function validate() {
      var words = nameInput.value.trim().split(/\s+/).filter(Boolean);
      btn.disabled = !(words.length >= 2 && agree.checked && payChoice());
    }
    nameInput.addEventListener("input", validate);
    agree.addEventListener("change", validate);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="qs-pay"]'), function (r) {
      r.addEventListener("change", validate);
    });

    $("qs-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("qs-err"); hide(err);
      var choice = payChoice();
      var signedName = nameInput.value.trim();
      if (!choice || !agree.checked || signedName.split(/\s+/).filter(Boolean).length < 2) {
        err.textContent = "Pick a payment option, type your full legal name, and check the agreement box.";
        show(err);
        return;
      }
      var emailVal = emailInput ? emailInput.value.trim() : "";
      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        err.textContent = "That email does not look complete. Fix it, or clear the field to sign without one.";
        show(err);
        return;
      }
      var phoneVal = phoneInput ? phoneInput.value.trim() : "";
      if (smsInput && smsInput.checked && phoneVal.replace(/\D/g, "").length < 10) {
        err.textContent = "To get texts, add your 10-digit mobile number, or uncheck the text box to sign without texts.";
        show(err);
        return;
      }
      var amountDueNow = choice === "deposit20" ? deposit : total;
      btn.disabled = true; btn.textContent = "Signing…";
      var picked = pickedAddons();
      var upd = {
        status: "signed",
        signedName: signedName,
        signedAt: firebase.firestore.FieldValue.serverTimestamp(),
        payChoice: choice,
        amountDueNow: amountDueNow,
        acceptedAddons: picked,
        total: total,
        baseTotal: baseTotal
      };
      // Email + marketing consent ride along with the signature. A
      // blank email never overwrites one already on the doc, and an
      // opt-in recorded earlier is never wiped by an untouched box
      // here; only a fresh check sets a new opt-in timestamp.
      if (emailVal) upd.customerEmail = emailVal;
      var optIn = !!((optinInput && optinInput.checked) || q.marketingOptIn === true);
      upd.marketingOptIn = optIn;
      if (optIn && optinInput && optinInput.checked) {
        upd.marketingOptInAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      // SMS consent rides along the same way: a blank phone never
      // overwrites one on the doc, and an earlier opt-in is never
      // wiped by an untouched box; only a fresh check timestamps it.
      if (phoneVal) upd.customerPhone = phoneVal;
      var smsOptIn = !!((smsInput && smsInput.checked) || q.smsOptIn === true);
      upd.smsOptIn = smsOptIn;
      if (smsOptIn && smsInput && smsInput.checked) {
        upd.smsOptInAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      ref.update(upd).then(function () {
        hide($("qs-main"));
        q.payChoice = choice;
        q.amountDueNow = amountDueNow;
        q.total = total;
        var s = $("qs-signed");
        s.innerHTML = '<div class="qs-ok-ico">✓</div>' +
          '<h1 class="qs-title">You\'re signed.</h1>' +
          '<p class="qs-meta">Thanks, ' + esc(signedName.split(/\s+/)[0]) + '. Your quote is accepted and saved.</p>' +
          payPanelHtml(q, "");
        show(s);
        wirePay(q);
      }).catch(function () {
        btn.disabled = false; btn.textContent = "Sign quote";
        err.textContent = "We could not save your signature. Check your connection and try again, or call us at (786) 422-9674.";
        show(err);
      });
    });
  }

  function renderSigned(q, paidReturn) {
    var d = dueOf(q);
    var when = fmtDate(q.signedAt);
    var s = $("qs-signed");
    s.innerHTML = '<div class="qs-ok-ico">✓</div>' +
      '<h1 class="qs-title">This quote is signed</h1>' +
      '<p class="qs-meta">Signed by <strong>' + esc(q.signedName || "") + "</strong>" + (when ? " on " + esc(when) : "") + ".</p>" +
      '<p class="qs-meta">Total: <strong>' + esc(money(d.total)) + "</strong> · " +
      (d.dep ? "20% deposit" : "Full payment") +
      (paidReturn === "1" ? "" : " · " + esc(money(d.due)) + " due now") + ".</p>" +
      payPanelHtml(q, paidReturn) +
      '<p class="qs-help" style="text-align:left">Questions? Call us at (786) 422-9674.</p>';
    show(s);
    if (paidReturn !== "1") wirePay(q);
  }
})();

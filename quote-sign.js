// PrimeGuard customer quote signing page.
// Public by design: the customer opens quote-sign.html?id=<customer_quotes doc>
// from their email, reviews the quote, picks full payment or a 20% deposit,
// and signs by typing their full legal name. No account is needed; Firestore
// rules allow a single-doc public get and a tightly constrained sign update
// (status "sent" -> "signed", signing fields only). Payment itself is NOT
// collected here: staff send a secure Stripe link for the amount due, which
// is what the success copy promises.
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
  function fmtKey(key) {
    if (!key) return "";
    var p = String(key).split("-");
    if (p.length !== 3) return String(key);
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }
  function fmtTs(ts) {
    try { return ts && ts.toDate ? ts.toDate().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""; }
    catch (e) { return ""; }
  }

  var id = "";
  try { id = new URLSearchParams(window.location.search).get("id") || ""; } catch (e) {}

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
    if (quote.status === "signed") { renderSigned(quote); return; }
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

  function renderForm(q) {
    var total = Number(q.total) || 0;
    var deposit = Math.round(total * 0.2);
    var balance = Math.round((total - deposit) * 100) / 100;

    $("qs-for").innerHTML = "<strong>" + esc(q.customerName || "") + "</strong>" +
      (q.address ? "<br>" + esc(q.address) : "") +
      (q.service ? "<br>" + esc(q.service) : "");

    var items = Array.isArray(q.items) ? q.items : [];
    if (!items.length && total) items = [{ label: q.service || "Service", amount: total }];
    $("qs-items").innerHTML = items.map(function (it) {
      return '<div class="qs-line"><span>' + esc(it.label || "Service") + "</span><span>" + esc(money(it.amount)) + "</span></div>";
    }).join("");
    $("qs-total").textContent = money(total);
    $("qs-expiry").textContent = q.expiresAt ? "Valid until " + fmtKey(q.expiresAt) : "";
    if (q.notes) { var n = $("qs-notes"); n.textContent = q.notes; show(n); }

    $("qs-opt-full-t").textContent = "Pay in full: " + money(total);
    $("qs-opt-full-d").textContent = "One payment, and we schedule your job right away.";
    $("qs-opt-dep-t").textContent = "Pay 20% deposit to schedule: " + money(deposit) + " now";
    $("qs-opt-dep-d").textContent = money(deposit) + " today, and the " + money(balance) + " balance is due when the job is done.";

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
      var amountDueNow = choice === "deposit20" ? deposit : total;
      btn.disabled = true; btn.textContent = "Signing…";
      ref.update({
        status: "signed",
        signedName: signedName,
        signedAt: firebase.firestore.FieldValue.serverTimestamp(),
        payChoice: choice,
        amountDueNow: amountDueNow
      }).then(function () {
        hide($("qs-main"));
        var s = $("qs-signed");
        s.innerHTML = '<div class="qs-ok-ico">✓</div>' +
          '<h1 class="qs-title">You\'re signed.</h1>' +
          '<p class="qs-meta">Thanks, ' + esc(signedName.split(/\s+/)[0]) + '. Next: we\'ll send your secure payment link for <strong>' +
          esc(money(amountDueNow)) + '</strong> and confirm your start date.</p>';
        show(s);
      }).catch(function () {
        btn.disabled = false; btn.textContent = "Sign quote";
        err.textContent = "We could not save your signature. Check your connection and try again, or call us at (786) 422-9674.";
        show(err);
      });
    });
  }

  function renderSigned(q) {
    var total = Number(q.total) || 0;
    var dueNow = q.payChoice === "deposit20"
      ? (Number(q.amountDueNow) || Math.round(total * 0.2))
      : total;
    var when = fmtTs(q.signedAt);
    var s = $("qs-signed");
    s.innerHTML = '<div class="qs-ok-ico">✓</div>' +
      '<h1 class="qs-title">This quote is signed</h1>' +
      '<p class="qs-meta">Signed by <strong>' + esc(q.signedName || "") + "</strong>" + (when ? " on " + esc(when) : "") + ".</p>" +
      '<p class="qs-meta">Total: <strong>' + esc(money(total)) + "</strong> · " +
      (q.payChoice === "deposit20" ? "20% deposit" : "Full payment") + " · " + esc(money(dueNow)) + " due now.</p>" +
      '<p class="qs-meta">Next: we send your secure payment link and confirm your start date. Questions? Call us at (786) 422-9674.</p>';
    show(s);
  }
})();

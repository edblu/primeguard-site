/* ============================================================
   VISIT TRACKER / TRAFFIC BEACON (Oct 19, v39)
   One "view" doc per page load + capped "click" docs (links and
   buttons) into the Firestore "visits" collection, read back only
   by the owner-only Traffic panel in the admin. Fire-and-forget:
   wrapped so it can never break or delay the page. Skips the
   admin, local dev, and headless browsers.
   Geo: city-level only, looked up once per session from the
   visitor's IP (ipapi.co, fallback ipwho.is). The IP address
   itself is NEVER stored; lat/lng are rounded to 1 decimal.
   ============================================================ */
(function () {
  try {
    var path = location.pathname || "/";
    var host = location.hostname || "";
    if (path.indexOf("admin") !== -1) return;
    if (path.indexOf("vendor-dashboard") !== -1 || path.indexOf("account") !== -1) return; // portals are operations, not website traffic (Edwin, Oct 19)
    if (host === "localhost" || host === "127.0.0.1") return;
    if (/HeadlessChrome/.test(navigator.userAgent || "")) return;
    var fc = (window.SITE_CONFIG && window.SITE_CONFIG.firebase) || null;
    if (!fc || !fc.apiKey || !fc.projectId) return;

    var sess = "";
    try {
      sess = sessionStorage.getItem("pg-sess") || "";
      if (!sess) {
        sess = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem("pg-sess", sess);
      }
    } catch (e) { sess = "s" + Date.now().toString(36); }

    // Traffic source: first external referrer wins for the session,
    // so internal page-to-page hops keep the real origin (GA-style).
    var refHost = "";
    try { refHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var source = "";
    try { source = sessionStorage.getItem("pg-src") || ""; } catch (e) {}
    if (!source) {
      source = "Direct";
      if (refHost && refHost !== host) {
        if (/google\./.test(refHost)) source = "Google";
        else if (/facebook\.|fb\./.test(refHost)) source = "Facebook";
        else if (/instagram/.test(refHost)) source = "Instagram";
        else source = ("Other: " + refHost).slice(0, 60);
        try { sessionStorage.setItem("pg-src", source); } catch (e) {}
      }
    }

    // --- Geo (city level, once per session, cached in pg-geo) ---
    var geo = null;
    try { var gj = sessionStorage.getItem("pg-geo"); if (gj) geo = JSON.parse(gj); } catch (e) {}
    function packGeo(city, region, country, lat, lng) {
      if (!city) return null;
      var g = { city: String(city), region: String(region || ""), country: String(country || "") };
      var la = Math.round(parseFloat(lat) * 10) / 10, ln = Math.round(parseFloat(lng) * 10) / 10;
      if (isFinite(la) && isFinite(ln)) { g.lat = la; g.lng = ln; }
      return g;
    }
    var geoReady = Promise.resolve();
    if (!geo) {
      geoReady = fetch("https://ipapi.co/json/").then(function (r) { return r.json(); })
        .then(function (j) { var g = packGeo(j && j.city, j && j.region, j && (j.country_name || j.country), j && j.latitude, j && j.longitude); if (!g) throw new Error("geo"); return g; })
        .catch(function () {
          return fetch("https://ipwho.is/").then(function (r) { return r.json(); })
            .then(function (j) { return (j && j.success !== false) ? packGeo(j.city, j.region, j.country, j.latitude, j.longitude) : null; })
            .catch(function () { return null; });
        })
        .then(function (g) { if (g) { geo = g; try { sessionStorage.setItem("pg-geo", JSON.stringify(g)); } catch (e) {} } });
    }

    // --- Write one event doc (SDK when the app is already up, else REST) ---
    function write(doc) {
      doc.ts = new Date().toISOString();
      doc.session = sess;
      if (geo && geo.city) {
        doc.city = geo.city; doc.region = geo.region; doc.country = geo.country;
        if (isFinite(geo.lat)) { doc.lat = geo.lat; doc.lng = geo.lng; }
      }
      try {
        if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length) {
          firebase.firestore().collection("visits").add(doc).catch(function () {});
          return;
        }
      } catch (e) {}
      try {
        var fields = {};
        Object.keys(doc).forEach(function (k) {
          var v = doc[k];
          fields[k] = (typeof v === "boolean") ? { booleanValue: v }
            : (typeof v === "number") ? { doubleValue: v } : { stringValue: String(v) };
        });
        fetch("https://firestore.googleapis.com/v1/projects/" + fc.projectId +
          "/databases/(default)/documents/visits?key=" + fc.apiKey, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: fields }), keepalive: true
        }).catch(function () {});
      } catch (e) {}
    }

    // --- Pageview: give geo a brief chance to land so the session's
    // first record usually carries its city; never wait long. ---
    var viewDoc = {
      type: "view", path: path, ref: refHost, source: source,
      lang: navigator.language || "",
      mobile: (((window.screen && screen.width) || 999) < 768)
    };
    var wroteView = false;
    function writeView() { if (wroteView) return; wroteView = true; write(viewDoc); }
    Promise.race([geoReady, new Promise(function (r) { setTimeout(r, 900); })]).then(writeView);
    setTimeout(writeView, 2500);

    // --- Clicks: delegated, A / BUTTON / role=button only, max 30
    // per page load. Never preventDefault; navigation is untouched. ---
    var clicks = 0;
    document.addEventListener("click", function (ev) {
      if (clicks >= 30) return;
      var el = ev.target;
      while (el && el !== document) {
        if (el.tagName === "A" || el.tagName === "BUTTON" ||
            (el.getAttribute && el.getAttribute("role") === "button")) break;
        el = el.parentElement;
      }
      if (!el || el === document) return;
      var target = "";
      if (el.tagName === "A") {
        var href = el.getAttribute("href") || "";
        if (/^(tel:|mailto:|#)/.test(href)) target = href;
        else { try { target = new URL(el.href).pathname || href; } catch (e) { target = href; } }
      } else {
        target = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      }
      if (!target) return;
      clicks++;
      write({ type: "click", path: path, target: String(target).slice(0, 80) });
    }, true);
  } catch (e) { /* the beacon must never surface an error */ }
})();

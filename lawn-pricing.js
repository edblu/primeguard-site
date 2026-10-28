/* PrimeGuard instant lawn pricing.
   Measures a lawn from public county property records, assigns a Rate Card
   v3 tier, and prices it as vendor pay times MARKUP. No API keys, no paid
   services. Sources:
   - Miami-Dade: MD_Emaps layer 70 (Property Records @ PaGIS), fields
     LOT_SIZE, BUILDING_ACTUAL_AREA, FLOOR_COUNT, TRUE_SITE_ADDR.
   - Broward: BCPA situs address points plus BCPA parcels (lot area by
     FOLIO) on bcgishub.broward.org, building living area from the Florida
     Department of Revenue statewide cadastral layer (TOT_LVG_AR).
   If every lookup fails, the caller falls back to a customer size estimate. */
(function () {
  "use strict";

  /* THE markup. Edwin: change this one number to reprice every instant
     lawn quote on the site. 1.20 means customer price = vendor pay + 20%. */
  var MARKUP = 1.20;

  var HARDSCAPE_PCT = 0.12; /* driveway, pool, patio allowance: 12% of lot */
  var FETCH_TIMEOUT_MS = 9000;

  var MD_URL = "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/70/query";
  var BR_SITUS_URL = "https://bcgishub.broward.org/server/rest/services/BCPA/BCPASitusAddress/MapServer/0/query";
  var BR_PARCEL_URL = "https://bcgishub.broward.org/server/rest/services/BCPA/Parcels/MapServer/0/query";
  var FDOR_URL = "https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

  var TIERS = [
    { key: "small", label: "Small yard", max: 3000, vendor: 50,
      desc: "Up to about 3,000 sq ft of grass: a townhome or compact lot" },
    { key: "medium", label: "Medium yard", max: 6000, vendor: 55,
      desc: "About 3,000 to 6,000 sq ft of grass: a typical single family yard" },
    { key: "large", label: "Large yard", max: 10000, vendor: 65,
      desc: "About 6,000 to 10,000 sq ft of grass: a corner lot or deep backyard" },
    { key: "estate", label: "Estate yard", max: Infinity, vendor: 65,
      desc: "Over 10,000 sq ft of grass: an oversized or acreage lot" }
  ];

  function tierFor(lawnSqft) {
    for (var i = 0; i < TIERS.length; i++) {
      if (lawnSqft <= TIERS[i].max) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function vendorFor(lawnSqft) {
    var t = tierFor(lawnSqft);
    if (t.key === "estate") {
      var extra = Math.ceil((lawnSqft - 10000) / 1000);
      return { tier: t, vendorAmount: 65 + 5 * Math.max(0, extra) };
    }
    return { tier: t, vendorAmount: t.vendor };
  }

  /* Price from a measured lawn size. Overgrown first visits add $15 to the
     vendor amount BEFORE markup, per the rate card reset modifier. */
  function priceForLawn(lawnSqft, overgrown) {
    var v = vendorFor(lawnSqft);
    var vendor = v.vendorAmount + (overgrown ? 15 : 0);
    return {
      tier: v.tier.key, tierLabel: v.tier.label, lawnSqft: lawnSqft,
      vendorAmount: vendor, customerPrice: Math.round(vendor * MARKUP),
      markupUsed: MARKUP, overgrown: !!overgrown
    };
  }

  /* Price from a fallback tier the customer picked themselves. Estate uses
     the estate base because the true size is unknown. */
  function priceForTier(tierKey, overgrown) {
    var t = null;
    TIERS.forEach(function (x) { if (x.key === tierKey) t = x; });
    if (!t) t = TIERS[1];
    var vendor = t.vendor + (overgrown ? 15 : 0);
    return {
      tier: t.key, tierLabel: t.label, lawnSqft: null,
      vendorAmount: vendor, customerPrice: Math.round(vendor * MARKUP),
      markupUsed: MARKUP, overgrown: !!overgrown
    };
  }

  function lawnFromLot(lotSqft, buildingSqft) {
    if (!lotSqft || lotSqft <= 0) return null;
    var footprint = buildingSqft || Math.round(lotSqft * 0.20);
    var lawn = lotSqft - footprint - Math.round(lotSqft * HARDSCAPE_PCT);
    if (lawn < 500) lawn = Math.min(500, lotSqft - footprint);
    if (lawn <= 0) return null;
    return Math.round(lawn / 10) * 10;
  }

  /* ---------- address parsing ---------- */
  var TYPE_MAP = {
    AVE: "AVE", AV: "AVE", AVENUE: "AVE", ST: "ST", STREET: "ST",
    BLVD: "BLVD", BOULEVARD: "BLVD", RD: "RD", ROAD: "RD", DR: "DR",
    DRIVE: "DR", CT: "CT", COURT: "CT", PL: "PL", PLACE: "PL",
    LN: "LN", LANE: "LN", TER: "TER", TERRACE: "TER", WAY: "WAY",
    CIR: "CIR", CIRCLE: "CIR", HWY: "HWY", PKWY: "PKWY",
    TRL: "TRL", MNR: "MNR", MANOR: "MNR", PLZ: "PLZ"
  };
  var DIRS = { N: 1, S: 1, E: 1, W: 1, NE: 1, NW: 1, SE: 1, SW: 1 };

  function parseAddress(raw) {
    var s = String(raw || "").toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
    /* ZIP is the LAST 5 digit group: a 5 digit house number comes first. */
    var zipMatches = s.match(/\b\d{5}(?:-\d{4})?\b/g) || [];
    var zip = zipMatches.length ? zipMatches[zipMatches.length - 1].slice(0, 5) : "";
    var body = s.replace(/\bFL\b|\bFLORIDA\b/g, " ");
    if (zip) {
      var zi = body.lastIndexOf(zip);
      if (zi !== -1) body = (body.slice(0, zi) + " " + body.slice(zi + 5)).replace(/-\d{4}\b/g, " ");
    }
    var toks = body.trim().split(" ").filter(Boolean);
    if (!toks.length || !/^\d+$/.test(toks[0])) return null;
    var house = toks[0];
    var rest = toks.slice(1);
    /* drop a trailing city: tokens after the street type are city words */
    var typeIdx = -1;
    rest.forEach(function (t, i) { if (TYPE_MAP[t] && typeIdx === -1) typeIdx = i; });
    var streetToks, type = "";
    if (typeIdx !== -1) { streetToks = rest.slice(0, typeIdx); type = TYPE_MAP[rest[typeIdx]]; }
    else { streetToks = rest.slice(0, Math.min(3, rest.length)); }
    var predir = "";
    if (streetToks.length && DIRS[streetToks[0]]) predir = streetToks.shift();
    var suffixDir = "";
    if (streetToks.length && DIRS[streetToks[streetToks.length - 1]]) suffixDir = streetToks.pop();
    /* County records drop ordinal suffixes: 111TH AVE is stored as 111 AVE. */
    var streetName = streetToks.map(function (t) {
      var m = t.match(/^(\d+)(ST|ND|RD|TH)$/);
      return m ? m[1] : t;
    }).join(" ");
    if (!streetName) return null;
    return { house: house, predir: predir, streetName: streetName, type: type,
             suffixDir: suffixDir, zip: zip,
             norm: (house + " " + (predir ? predir + " " : "") + streetName + (type ? " " + type : "")).trim() };
  }

  function normAddr(s) {
    return String(s || "").toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  }

  function scoreMatch(parsed, countyAddr) {
    var c = normAddr(countyAddr);
    if (c.indexOf(parsed.house + " ") !== 0) return -1;
    var nameOk = c.indexOf(parsed.streetName) !== -1;
    if (!nameOk) return -1;
    var score = 10;
    if (parsed.predir && c.indexOf(" " + parsed.predir + " ") !== -1) score += 3;
    if (parsed.type && new RegExp("\\b" + parsed.type + "\\b").test(c)) score += 2;
    return score;
  }

  function fetchJson(url, params) {
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    return fetch(url + "?" + qs, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (j) { if (timer) clearTimeout(timer); return j; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  /* ---------- Miami-Dade (MD_Emaps layer 70) ---------- */
  function measureMiamiDade(p) {
    var ofields = "FOLIO,LOT_SIZE,TRUE_SITE_ADDR,TRUE_SITE_ZIP_CODE,BUILDING_ACTUAL_AREA,FLOOR_COUNT,DOR_DESC";
    var like = p.house + (p.predir ? " " + p.predir : "") + " " + p.streetName + "%";
    return fetchJson(MD_URL, { where: "TRUE_SITE_ADDR LIKE '" + like.replace(/'/g, "''") + "'",
      outFields: ofields, returnGeometry: "false", f: "json", resultRecordCount: "8" })
    .then(function (j) {
      var feats = (j && j.features) || [];
      var best = null, bestScore = -1;
      feats.forEach(function (f) {
        var sc = scoreMatch(p, f.attributes.TRUE_SITE_ADDR);
        if (p.zip && String(f.attributes.TRUE_SITE_ZIP_CODE || "").indexOf(p.zip) === 0) sc += 2;
        if (sc > bestScore) { bestScore = sc; best = f; }
      });
      if (!best || bestScore < 0) return null;
      var a = best.attributes;
      var floors = Math.max(1, parseInt(a.FLOOR_COUNT, 10) || 1);
      var footprint = a.BUILDING_ACTUAL_AREA ? Math.round(a.BUILDING_ACTUAL_AREA / floors) : null;
      var lawn = lawnFromLot(a.LOT_SIZE, footprint);
      if (!lawn) return null;
      return { lotSqft: Math.round(a.LOT_SIZE), lawnSqft: lawn,
               buildingSqft: footprint, source: "county-parcel",
               county: "Miami-Dade", countyAddr: a.TRUE_SITE_ADDR };
    }).catch(function () { return null; });
  }

  /* ---------- Broward (BCPA situs + parcels, FDOR building area) ---------- */
  function measureBroward(p) {
    var where = "SITUS_HOUSE_NUMBER='" + p.house + "' AND SITUS_STREET_NAME='" +
      p.streetName.replace(/'/g, "''") + "'" + (p.zip ? " AND ZIP_CODE='" + p.zip + "'" : "");
    return fetchJson(BR_SITUS_URL, { where: where,
      outFields: "FULL_SITE_ADDRESS,FOLIO_NUMBER,CITY_NAME,ZIP_CODE",
      returnGeometry: "false", f: "json", resultRecordCount: "8" })
    .then(function (j) {
      var feats = (j && j.features) || [];
      var best = null, bestScore = -1;
      feats.forEach(function (f) {
        var sc = scoreMatch(p, f.attributes.FULL_SITE_ADDRESS);
        if (sc > bestScore) { bestScore = sc; best = f; }
      });
      if (!best || bestScore < 0) return null;
      var folio = best.attributes.FOLIO_NUMBER;
      return fetchJson(BR_PARCEL_URL, { where: "FOLIO='" + folio + "'",
        outFields: "FOLIO,SHAPE.AREA", returnGeometry: "false", f: "json" })
      .then(function (j2) {
        var pf = j2 && j2.features && j2.features[0];
        if (!pf) return null;
        var lot = Math.round(pf.attributes["SHAPE.AREA"]);
        if (!lot) return null;
        return fetchJson(FDOR_URL, { where: "PARCEL_ID='" + folio + "'",
          outFields: "PARCEL_ID,LND_SQFOOT,TOT_LVG_AR", returnGeometry: "false", f: "json" })
        .then(function (j3) {
          var ff = j3 && j3.features && j3.features[0];
          var living = ff ? ff.attributes.TOT_LVG_AR : null;
          var lawn = lawnFromLot(lot, living || null);
          if (!lawn) return null;
          return { lotSqft: lot, lawnSqft: lawn, buildingSqft: living || null,
                   source: "county-parcel", county: "Broward",
                   countyAddr: best.attributes.FULL_SITE_ADDRESS };
        }).catch(function () {
          var lawn = lawnFromLot(lot, null);
          if (!lawn) return null;
          return { lotSqft: lot, lawnSqft: lawn, buildingSqft: null,
                   source: "county-parcel", county: "Broward",
                   countyAddr: best.attributes.FULL_SITE_ADDRESS };
        });
      });
    }).catch(function () { return null; });
  }

  /* Try Miami-Dade first, then Broward. Resolves null when nothing usable
     comes back so the caller can fall back to a customer estimate. */
  function measure(rawAddress) {
    var p = parseAddress(rawAddress);
    if (!p) return Promise.resolve(null);
    return measureMiamiDade(p).then(function (r) {
      if (r) return r;
      return measureBroward(p);
    });
  }

  window.PGLawn = {
    MARKUP: MARKUP,
    TIERS: TIERS,
    parseAddress: parseAddress,
    measure: measure,
    priceForLawn: priceForLawn,
    priceForTier: priceForTier,
    lawnFromLot: lawnFromLot
  };
})();

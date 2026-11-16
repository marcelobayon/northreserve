/* =============================================================================
   links.js  ·  The ONE place all three brands get their money destinations.
   NorthReserve · Kawsah · Mitig8 all include this file. Change a URL here and
   it changes on every page of every brand at once.

   Include it BEFORE calc-network.js (and before any page script that links out):
     <script src="/links.js"></script>
     <script src="/calc-network.js"></script>

   Why this exists: the two things you actually get paid on — a started
   application and a booked call — must never be hard-coded on a page again.
   They live here. Everything else is traffic feeding these two doors.
   ============================================================================= */
(function () {
  "use strict";

  /* ======== EDIT THESE. This is the whole control panel. ===================== */
  var APPLY_URL    = "https://kawsahtech.typeform.com/to/p7uk14";   // <-- your 1003 / start-application link. NOT in your site anywhere yet.
  var CALENDAR_URL = "https://calendly.com/kawsah/15min";           // book a 15-min call (already live)
  var HYSA_URL     = "https://www.marcus.com/share/MAR-78Q-8PU2";   // high-yield savings affiliate
  var NMLS         = "1851997";
  /* =========================================================================== */

  /* The graph. Each feeder brand's front door — used for cross-brand links. */
  var BRANDS = {
    northreserve:  "https://northreserve.org",       // financial-health / awareness engine
    kawsah:        "https://www.kawsah.com",          // mortgage lead-gen brand
    mitig8:        "https://mitig8.cloud",            // self-employed borrower micro-graph + free calc
    mitig8_sales:  "https://stoplosingmortgages.com"  // paid Mitig8 AI tool sales page
  };

  function merge(a, b) { var r = {}, k; for (k in a) r[k] = a[k]; if (b) for (k in b) if (b[k] != null) r[k] = b[k]; return r; }

  /* Stamp any outbound money/cross-brand link with UTM so GA4 tells you which
     brand + tool + page drove each apply and each booking. */
  function tag(url, o) {
    o = o || {};
    try {
      var u = new URL(url, location.href);
      if (o.source)   u.searchParams.set("utm_source",   o.source);
      if (o.medium)   u.searchParams.set("utm_medium",   o.medium);
      if (o.campaign) u.searchParams.set("utm_campaign", o.campaign);
      if (o.content)  u.searchParams.set("utm_content",  o.content);
      return u.toString();
    } catch (e) { return url; }
  }

  /* Default source = the host doing the linking (northreserve.org, kawsah.com…),
     so you never have to remember to pass it. */
  function host() { try { return location.hostname.replace(/^www\./, "") || "site"; } catch (e) { return "site"; } }

  /* The two terminal actions the entire graph drains into, plus the affiliate. */
  function applyUrl(o)    { return tag(APPLY_URL,    merge({ source: host(), medium: "apply" },    o)); }
  function calendarUrl(o) { return tag(CALENDAR_URL, merge({ source: host(), medium: "calendar" }, o)); }
  function hysaUrl(o)     { return tag(HYSA_URL,     merge({ source: host(), medium: "affiliate" }, o)); }
  function brand(name, o) { return BRANDS[name] ? tag(BRANDS[name], merge({ source: host(), medium: "cross_brand" }, o)) : "#"; }

  /* Is the start-application link actually configured yet? Lets the escalation
     hide the Apply button until you paste the URL — no broken link ever ships. */
  function applyReady() { return /^https?:\/\//.test(APPLY_URL) && APPLY_URL.indexOf("PASTE-YOUR") === -1; }

  window.NRLinks = {
    APPLY_URL: APPLY_URL, CALENDAR_URL: CALENDAR_URL, HYSA_URL: HYSA_URL, NMLS: NMLS, BRANDS: BRANDS,
    tag: tag, applyUrl: applyUrl, calendarUrl: calendarUrl, hysaUrl: hysaUrl, brand: brand, applyReady: applyReady
  };
})();

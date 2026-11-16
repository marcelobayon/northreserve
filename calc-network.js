/* =============================================================================
   calc-network.js  ·  The NorthReserve "Next Best Move" engine + shared shell.
   Put at your site root; include LAST on each page: <script src="/calc-network.js"></script>

   The Mountain is the category; the calculators are features. This file is the
   connective layer that makes them one financial-decision network:
     • standardized event vocabulary (+ acquisition params + the KPI event)
     • one "Your Next Move" component every calculator renders identically
     • intent -> next tool + one economic path (compliance-aware)
   ============================================================================= */
(function () {
  "use strict";

  /* ---- Edit-once config ----------------------------------------------------
     Money destinations now live in /links.js (window.NRLinks) so all three
     brands share ONE source of truth. If links.js is loaded first, we use it;
     if not, these fallbacks keep every existing page working unchanged. */
  var L            = (typeof window !== "undefined" && window.NRLinks) ? window.NRLinks : null;
  var CALENDAR_URL = (L && L.CALENDAR_URL) || "https://calendly.com/kawsah/15min";              // mortgage booking
  var HYSA_URL     = (L && L.HYSA_URL)     || "https://www.marcus.com/share/MAR-78Q-8PU2";      // high-yield savings affiliate
  var NMLS         = (L && L.NMLS)         || "1851997";

  var CALCS = [
    { slug: "emergency-fund",        name: "Emergency Fund",        url: "/emergency-fund",        color: "#2A8ADD", blurb: "How many months of protection do you have?" },
    { slug: "next-1000",             name: "Next $1,000",           url: "/next-1000",             color: "#7F77DD", blurb: "Where should your next $1,000 go?" },
    { slug: "debt-freedom",          name: "Debt Freedom",          url: "/debt-freedom",          color: "#E2553D", blurb: "What pays off fastest — and moves your mountain most." },
    { slug: "home-buying-readiness", name: "Home Buying Readiness", url: "/home-buying-readiness", color: "#F2B441", blurb: "Are you actually ready to buy?" },
    { slug: "house-poor",            name: "House Poor",            url: "/house-poor",            color: "#E2553D", blurb: "Will the house own you?" },
    { slug: "rent-vs-buy",           name: "Rent vs Buy",           url: "/rent-vs-buy",           color: "#57C7DA", blurb: "Which one wins for your situation?" },
    { slug: "mortgage-qualification",name: "Qualification vs Comfort", url: "/mortgage-qualification", color: "#1E8A6E", blurb: "What a lender approves vs what you can comfortably afford." },
    { slug: "progress-tracker",      name: "Progress Tracker",      url: "/progress-tracker",      color: "#57C7DA", blurb: "Watch your Mountain Score climb, month by month." }
  ];
  var EXTRA = [
    { name: "Financial Mountain Assessment", url: "/assessment", color: "#1D6E45", blurb: "See your whole financial mountain — free." },
    { name: "The 5 Stages of Financial Health", url: "/stages", color: "#BA7517", blurb: "Find your stage, from Base Camper to Mountaineer." }
  ];

  /* intent -> ONE economic path. Do not build a marketplace; one path each.
     home/financing -> your NMLS-disclosed mortgage referral.
     savings        -> high-yield savings affiliate.
     debt/investing -> EDUCATION only (no product) — keeps a licensed LO clean.
     general        -> NorthReserve (assessment / app). */
  var INTENT_MAP = {
    home:      { kind: "mortgage",    partner: "mortgage",    label: "Talk to a licensed mortgage officer →" },
    financing: { kind: "mortgage",    partner: "mortgage",    label: "Talk to a licensed mortgage officer →" },
    savings:   { kind: "affiliate",   partner: "hysa",        label: "See a high-yield savings option →", url: HYSA_URL },
    debt:      { kind: "education",    partner: "internal",    label: "See your fastest debt payoff →",     url: "/debt-freedom" },
    investing: { kind: "education",    partner: "internal",    label: "How the summit works →",             url: "/retirement" },
    general:   { kind: "northreserve", partner: "northreserve",label: "See your Financial Mountain →",      url: "/assessment" }
  };
  // The single recommended "next tool" in the funnel, by current tool.
  var NEXT_TOOL = {
    "emergency-fund": "next-1000", "next-1000": "debt-freedom", "debt-freedom": "progress-tracker",
    "home-buying-readiness": "mortgage-qualification", "house-poor": "mortgage-qualification",
    "rent-vs-buy": "home-buying-readiness", "mortgage-qualification": "home-buying-readiness",
    "progress-tracker": "next-1000"
  };

  var LOGO = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<polygon points="6,52 24,30 32,38 40,16 58,52" fill="#176658"/>' +
    '<polygon points="40,16 58,52 38,52" fill="#125047"/>' +
    '<polygon points="24,30 32,38 26,52 14,52" fill="#1E8A6E"/>' +
    '<polygon points="40,16 35,25 45,25" fill="#E3F1EC"/>' +
    '<polygon points="44,3 46.2,6.8 50,9 46.2,11.2 44,15 41.8,11.2 38,9 41.8,6.8" fill="#F2B441"/></svg>';

  function findCalc(slug) { for (var i = 0; i < CALCS.length; i++) if (CALCS[i].slug === slug) return CALCS[i]; return null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---- Acquisition (first-touch, session-scoped; no database) ------------- */
  var ACQ = (function () {
    var q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    var stored = {}; try { stored = JSON.parse(sessionStorage.getItem("nr_acq") || "{}"); } catch (e) {}
    var refHost = ""; try { if (document.referrer) refHost = new URL(document.referrer).hostname; } catch (e) {}
    var acq = {
      source:   stored.source   || q.utm_source   || refHost || "direct",
      campaign: stored.campaign || q.utm_campaign || "",
      referral: stored.referral || q.ref          || "",
      landing:  stored.landing  || location.pathname
    };
    try { sessionStorage.setItem("nr_acq", JSON.stringify(acq)); } catch (e) {}
    return acq;
  })();

  /* ---- Standardized events (GA4 via gtag). Consistent vocabulary. --------- */
  var TOOL = "";
  function emit(name, params) {
    var p = { tool: TOOL, source: ACQ.source, campaign: ACQ.campaign, referral: ACQ.referral, landing: ACQ.landing };
    if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    try { if (window.gtag) window.gtag("event", name, p); } catch (e) {}
  }
  // KPI: fired ONCE per session on the first meaningful action after a result.
  function markMeaningful(type) {
    try { if (sessionStorage.getItem("nr_ma")) return; sessionStorage.setItem("nr_ma", "1"); } catch (e) {}
    emit("meaningful_action", { action_type: type });
  }

  var ev = {
    setTool: function (t) { TOOL = t || ""; },
    toolViewed:    function (t) { if (t) TOOL = t; emit("tool_viewed"); },
    toolStarted:   function () { emit("tool_started"); },
    toolCompleted: function (o) { emit("tool_completed", o || {}); },        // {result_category, priority, intent}
    resultViewed:  function (o) { emit("result_viewed", o || {}); },
    nextMoveViewed:function (o) { emit("next_move_viewed", o || {}); },
    nextMoveClicked:function (o){ emit("next_move_clicked", o || {}); markMeaningful("next_move"); },
    relatedToolClicked: function (o) { emit("related_tool_clicked", o || {}); markMeaningful("related_tool"); },
    emailCaptured: function (o) { emit("email_captured", o || {}); markMeaningful("email"); },
    shareStarted:  function (o) { emit("share_started", o || {}); markMeaningful("share"); },
    referralClicked:function (o){ emit("referral_clicked", o || {}); markMeaningful("referral"); }, // affiliate or mortgage CTA click
    conversion:    function (o) { emit("conversion", o || {}); },            // lead/booking submitted
    revenue:       function (o) { emit("revenue", o || {}); }                // {value, currency, partner} — server/postback
  };
  // Back-compat: legacy track() still works and now carries acquisition params.
  function track(name, params) { emit(name, params); }

  /* ---- Header / nav ------------------------------------------------------- */
  function renderHeader(id) {
    var el = document.getElementById(id); if (!el) return;
    el.className = "nrc-nav";
    el.innerHTML =
      '<div class="nrc-nav-inner">' +
        '<a class="nrc-brand" href="/">' + LOGO + 'North<span class="r">Reserve</span></a>' +
        '<nav class="nrc-links" id="nrcLinks">' +
          '<a href="/assessment">Assessment</a><a href="/tools">Free tools</a>' +
          '<a href="/enterprise">For employers</a>' +
          '<a href="/assessment" class="nrc-cta"><span class="nrc-ghost">See your Mountain</span></a>' +
        '</nav>' +
        '<button class="nrc-toggle" aria-label="Menu" type="button">&#9776;</button>' +
      '</div>';
    var toggle = el.querySelector(".nrc-toggle"), links = el.querySelector("#nrcLinks");
    if (toggle && links) toggle.addEventListener("click", function () { links.classList.toggle("open"); });
  }

  function renderNetwork(currentSlug, id) {
    var el = document.getElementById(id); if (!el) return;
    var cards = "";
    CALCS.forEach(function (c) { if (c.slug !== currentSlug) cards += card(c); });
    EXTRA.forEach(function (c) { cards += card(c); });
    el.className = "network";
    el.innerHTML = '<h2>Keep climbing — the rest of the toolkit</h2>' +
      '<p style="font-size:14px;color:#8DA09C;margin:0 0 4px">Free, private, about two minutes each. <a href="/tools" style="color:#F2B441;text-decoration:none">See all free tools →</a></p>' +
      '<div class="net-grid">' + cards + '</div>';
    Array.prototype.forEach.call(el.querySelectorAll("a.net-card"), function (a) {
      a.addEventListener("click", function () { ev.relatedToolClicked({ to: a.getAttribute("href"), placement: "network" }); });
    });
  }
  function card(c) {
    return '<a class="net-card" href="' + c.url + '" data-slug="' + (c.slug || "") + '" style="border-left-color:' + c.color + '">' +
      '<div class="nm">' + c.name + '</div><div class="bl">' + c.blurb + '</div></a>';
  }

  /* ---- THE NEXT BEST MOVE ENGINE ----------------------------------------
     Pure function: given a standardized result, resolve the economic path
     and the recommended next tool. Also used by WebMCP / programmatic callers. */
  function nextBestMove(result) {
    result = result || {};
    var intent = result.intent || "general";
    var eco = result.economic || INTENT_MAP[intent] || INTENT_MAP.general;
    if (eco.kind === "mortgage" && !eco.url) eco = { kind: "mortgage", partner: "mortgage", label: eco.label, url: CALENDAR_URL };
    var recSlug = result.recommendedTool || NEXT_TOOL[result.tool] || (CALCS[0] && CALCS[0].slug);
    return { intent: intent, economic: eco, recommendedTool: findCalc(recSlug) };
  }

  /* Renders ONE standardized block: Your Next Move -> Continue Your Mountain
     -> one recommended tool -> one economic CTA. Every calculator uses this. */
  function renderNextMove(id, result) {
    var el = document.getElementById(id); if (!el) return;
    var nbm = nextBestMove(result), eco = nbm.economic, rec = nbm.recommendedTool, intent = nbm.intent;
    var mono = "font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;";
    var isMortgage = eco && eco.kind === "mortgage";
    var utm = { campaign: intent, content: result.tool || "" };

    // Your Next Move — the advice, always first.
    var html =
      '<div class="move"><div class="k">Your next move</div><h3 style="margin:6px 0 0">' + esc(result.nextMove.title) + '</h3>' +
        (result.nextMove.detail ? '<p style="margin:8px 0 0;font-size:14.5px;color:#D9E6E2">' + esc(result.nextMove.detail) + '</p>' : '') +
      '</div>';

    // Build the economic (money) block once, so we can place it FIRST for a
    // ready buyer and LAST for everyone else.
    var ecoHtml = "";
    if (eco && eco.kind !== "none") {
      if (isMortgage) {
        var applyReady = !!(L && L.applyReady && L.applyReady());
        var calHref = esc(L ? L.calendarUrl(utm) : eco.url);
        ecoHtml = '<div style="margin-top:16px">';
        if (applyReady) {
          // Two tiers: ready-to-transact vs wants-to-talk. The apply is the KPI.
          ecoHtml +=
            '<a class="btn btn-primary btn-block" data-nm="eco" data-kind="mortgage" data-step="apply" href="' + esc(L.applyUrl(utm)) + '" target="_blank" rel="noopener">Start your application →</a>' +
            '<a class="btn btn-ghost btn-block" data-nm="eco" data-kind="mortgage" data-step="book" href="' + calHref + '" target="_blank" rel="noopener" style="margin-top:10px">Rather talk it through first? Book a 15-min call →</a>' +
            '<div style="font-size:11px;color:var(--slate);margin-top:8px;line-height:1.5">Both reach Marcelo Bayon, a licensed Mortgage Loan Officer, NMLS #' + NMLS + '. Starting an application shares the details you enter with him; booking a call does not. Neither is a preapproval or credit decision, and no credit is pulled. Equal Housing Opportunity.</div>';
        } else {
          ecoHtml +=
            '<a class="btn btn-ghost btn-block" data-nm="eco" data-kind="mortgage" data-step="book" href="' + calHref + '" target="_blank" rel="noopener">' + esc(eco.label) + '</a>' +
            '<div style="font-size:11px;color:var(--slate);margin-top:8px;line-height:1.5">Sends your interest to Marcelo Bayon, NMLS #' + NMLS + '. Not a preapproval, application, or credit decision. Equal Housing Opportunity.</div>';
        }
        ecoHtml += '</div>';
      } else {
        var external = (eco.kind === "affiliate");
        var rel = eco.kind === "affiliate" ? ' rel="noopener sponsored"' : "";
        var tgt = external ? ' target="_blank"' : "";
        ecoHtml = '<div style="margin-top:16px">' +
          '<a class="btn btn-ghost btn-block" data-nm="eco" data-kind="' + eco.kind + '" href="' + esc(eco.url) + '"' + tgt + rel + '>' + esc(eco.label) + '</a>' +
          '</div>';
      }
    }

    // For a mortgage result, the mortgage action IS the next move — lead with it.
    if (isMortgage) html += ecoHtml;

    // Continue your mountain -> assessment. Primary for non-mortgage; a quieter
    // ghost for a ready buyer (re-taking the assessment isn't their next step).
    html +=
      '<div style="border-top:1px solid var(--line);margin-top:20px;padding-top:18px">' +
        '<div style="' + mono + 'color:var(--glacier);margin-bottom:8px">Continue your mountain</div>' +
        '<a class="btn ' + (isMortgage ? 'btn-ghost' : 'btn-primary') + ' btn-block" data-nm="assessment" href="/assessment">See your full Financial Mountain →</a>' +
      '</div>';

    if (rec) html +=
      '<div style="margin-top:16px;font-size:14px"><span style="' + mono + 'color:var(--slate);display:block;margin-bottom:5px">Recommended next</span>' +
      '<a data-nm="tool" data-slug="' + rec.slug + '" href="' + rec.url + '" style="color:var(--glacier);text-decoration:none;font-weight:600">' + esc(rec.name) + ' →</a></div>';

    // Non-mortgage economic CTA sits last, as before.
    if (!isMortgage) html += ecoHtml;

    el.className = "next-move-block";
    el.innerHTML = html;
    ev.nextMoveViewed({ intent: intent, priority: result.priority || "", result_category: result.resultCategory || "" });

    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-nm]"); if (!a) return;
      var t = a.getAttribute("data-nm");
      if (t === "assessment") ev.nextMoveClicked({ intent: intent, action: "assessment" });
      else if (t === "tool") { ev.nextMoveClicked({ intent: intent, action: "recommended_tool", to: a.getAttribute("data-slug") }); }
      else if (t === "eco") {
        var kind = a.getAttribute("data-kind"), step = a.getAttribute("data-step") || "";
        ev.referralClicked({ intent: intent, kind: kind, partner: eco.partner, step: step });
        if (kind === "mortgage") ev.conversion({ kind: (step === "apply" ? "application_start" : "booking_click"), intent: intent });
        else if (kind === "affiliate") ev.conversion({ kind: "affiliate_click", intent: intent });
      }
    });
  }

  /* ---- Share -------------------------------------------------------------- */
  function shareButtons(id, getText, pageUrl, calcSlug) {
    var el = document.getElementById(id); if (!el) return;
    el.className = "share-row";
    el.innerHTML =
      '<button class="sbtn primary" data-ch="native" type="button">Share my result</button>' +
      '<button class="sbtn" data-ch="x" type="button">Post to X</button>' +
      '<button class="sbtn" data-ch="fb" type="button">Facebook</button>' +
      '<button class="sbtn" data-ch="copy" type="button">Copy link</button>';
    function urlWith(ref) { var base = pageUrl || location.href.split("?")[0]; return base + "?ref=" + encodeURIComponent(ref); }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ch]"); if (!b) return;
      var ch = b.getAttribute("data-ch"), text = (getText && getText()) || "";
      ev.shareStarted({ channel: ch });
      if (ch === "x") window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(urlWith("x")), "_blank", "noopener");
      else if (ch === "fb") window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(urlWith("fb")), "_blank", "noopener");
      else if (ch === "copy") { copy(text + " " + urlWith("copy")); flash(b, "Copied ✓"); }
      else { if (navigator.share) navigator.share({ text: text, url: urlWith("share") }).catch(function () {}); else { copy(text + " " + urlWith("copy")); flash(b, "Copied ✓"); } }
    });
  }
  function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) {} }
  function flash(b, msg) { var o = b.textContent; b.textContent = msg; setTimeout(function () { b.textContent = o; }, 1500); }

  /* ---- Single email capture -> Netlify ------------------------------------ */
  function postNetlify(formName, data) {
    data["form-name"] = formName;
    var body = Object.keys(data).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(data[k]); }).join("&");
    return fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body });
  }
  function renderEmailCapture(id, opts) {
    var el = document.getElementById(id); if (!el) return; opts = opts || {};
    el.className = "email-box";
    el.innerHTML = '<div class="eyebrow gold">' + (opts.title || "Get the full plan") + '</div>' +
      '<p style="margin:0 0 12px;font-size:14.5px">' + (opts.copy || "") + '</p>' +
      '<div class="email-row"><input class="input" type="email" inputmode="email" placeholder="you@email.com" aria-label="Email">' +
      '<button class="btn btn-primary" type="button">' + (opts.button || "Email it to me →") + '</button></div><div class="status"></div>';
    var input = el.querySelector("input"), btn = el.querySelector("button"), st = el.querySelector(".status");
    function submit() {
      var email = (input.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { st.className = "status bad"; st.textContent = "That email doesn't look right."; return; }
      st.className = "status"; st.textContent = "Sending…";
      var data = { email: email }, extra = opts.fields ? opts.fields() : {};
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) data[k] = extra[k];
      var done = false; function ok() { if (done) return; done = true; st.className = "status ok"; st.textContent = opts.done || "Sent — check your inbox."; ev.emailCaptured({ list: opts.formName }); }
      postNetlify(opts.formName, data).then(ok).catch(ok); setTimeout(ok, 2500);
    }
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  /* ---- Mortgage lead -> Apps Script --------------------------------------- */
  function postLead(scriptUrl, data) {
    if (!scriptUrl) return Promise.resolve();
    return fetch(scriptUrl, { method: "POST", body: new URLSearchParams(data) }).catch(function () {});
  }

  /* ---- WebMCP ------------------------------------------------------------- */
  function registerTool(def) {
    try {
      if (typeof navigator !== "undefined" && navigator.modelContext && navigator.modelContext.registerTool) {
        navigator.modelContext.registerTool(def);
        return function () { try { navigator.modelContext.unregisterTool(def.name); } catch (e) {} };
      }
    } catch (e) {}
    return function () {};
  }

  function renderDisclosure(cfg, id) {
    var el = document.getElementById(id); if (!el) return; cfg = cfg || {};
    var parts = ["This tool is educational and general in nature — a starting point for reflection, not personalized financial, investment, or tax advice."];
    if (cfg.affiliate) parts.push("Some links are affiliate or referral links; if you use them we may earn a commission, at no cost to you. It never changes the guidance you receive.");
    if (cfg.mortgage) parts.push("Mortgage help is provided by Marcelo Bayon, a licensed Mortgage Loan Officer, NMLS #" + (cfg.nmls || NMLS) + ". Booking a call or submitting the form sends your information to Marcelo so he can follow up — it is NOT a loan application, a preapproval, a commitment to lend, or a credit decision, and no credit is pulled. Equal Housing Opportunity.");
    parts.push("Your calculations run in your browser. NorthReserve does not manage your money or your accounts.");
    el.className = "disclosure";
    el.innerHTML = parts.join(" ") + '<div class="nr-foot" style="margin-top:16px"><b>NorthReserve</b> · Know where you stand. Climb with confidence.</div>';
  }

  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function parseMoney(v) { if (v == null) return 0; var n = parseFloat(String(v).replace(/[$,\s]/g, "")); return isFinite(n) ? Math.max(0, n) : 0; }

  window.NRCalc = {
    CALCS: CALCS, INTENT_MAP: INTENT_MAP, CALENDAR_URL: CALENDAR_URL, HYSA_URL: HYSA_URL,
    ev: ev, track: track, findCalc: findCalc,
    renderHeader: renderHeader, renderNetwork: renderNetwork,
    nextBestMove: nextBestMove, renderNextMove: renderNextMove,
    shareButtons: shareButtons, postNetlify: postNetlify, renderEmailCapture: renderEmailCapture,
    postLead: postLead, registerTool: registerTool, renderDisclosure: renderDisclosure,
    money: money, parseMoney: parseMoney
  };
})();

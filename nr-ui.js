/* =============================================================================
   nr-ui.js  ·  NorthReserve Mountain — shared UI chrome + page boot
   Depends on nr-core.js (window.NR). Renders nav, score ring, reservoir bars,
   stage pill, cross-graph suggestions, gate overlays, toasts; boots each page
   (mounts nav, registers the service worker, tracks a privacy-safe page view).
   ============================================================================= */
(function (w, d) {
  "use strict";
  var NR = w.NR = w.NR || {};
  if (!NR.config) { /* core not loaded */ return; }
  var R = NR.config.routes;

  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 28 L13 8 L18.5 18 L22 12 L30 28 Z" fill="#176658"/><path d="M13 8 L18.5 18 L15 18 L12.5 13 Z" fill="#1E8A6E"/><circle cx="23.5" cy="7.5" r="2.4" fill="#F2B441"/></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* -------- primary nav model -------- */
  var NAV = [
    { key: "home",     label: "Mountain",   href: R.home,     ic: "▲" },
    { key: "nextMove", label: "Next Move",  href: R.nextMove, ic: "◆" },
    { key: "checkin",  label: "Check-In",   href: R.checkin,  ic: "+", cta: true },
    { key: "range",    label: "Range",      href: R.range,    ic: "❖" },
    { key: "progress", label: "Progress",   href: R.progress, ic: "↗" }
  ];
  var TOP_EXTRA = [
    { key: "report", label: "Report", href: R.report },
    { key: "tools",  label: "Tools",  href: R.tools },
    { key: "guides", label: "Guides", href: R.guides }
  ];

  NR.ui = {
    esc: esc,
    LOGO: LOGO,

    topNav: function (active) {
      var links = NAV.filter(function (n) { return !n.cta; }).concat(TOP_EXTRA).map(function (n) {
        return '<a href="' + n.href + '"' + (n.key === active ? ' class="active"' : "") + '>' + esc(n.label) + '</a>';
      }).join("");
      var isMem = NR.membership.isMember();
      var acct = NR.account.signedIn() ? '<a class="nr-avatar' + (isMem ? ' member' : '') + '" href="' + R.account + '" title="Account">' + esc((NR.account.get().displayName || "You").slice(0, 1).toUpperCase()) + '</a>' + (isMem ? '<span class="nr-memberchip">Member</span>' : '')
                                       : '<a class="nr-btn sm" href="' + R.account + '">Save progress</a>';
      return '<header class="nr-top"><div class="nr-top-inner">' +
        '<a class="nr-brand" href="' + R.home + '">' + LOGO + '<span>North<span class="r">Reserve</span></span></a>' +
        '<nav class="nr-top-links">' + links + '</nav>' +
        '<div class="nr-top-acct">' + acct + '</div>' +
        '</div></header>';
    },

    bottomNav: function (active) {
      var items = NAV.map(function (n) {
        var cls = "nr-bn" + (n.cta ? " cta" : "") + (n.key === active ? " active" : "");
        if (n.cta) return '<a href="' + n.href + '" class="' + (n.key === active ? "active" : "") + '" style="position:relative;top:-6px"><span class="ic" style="display:flex;width:44px;height:44px;border-radius:50%;background:var(--gold);color:var(--basalt);align-items:center;justify-content:center;font-size:26px;box-shadow:0 10px 22px -10px rgba(242,180,65,.8)">+</span><span style="margin-top:2px">Check-In</span></a>';
        return '<a href="' + n.href + '" class="' + (n.key === active ? "active" : "") + '"><span class="ic">' + n.ic + '</span><span>' + esc(n.label) + '</span></a>';
      }).join("");
      return '<nav class="nr-bottom"><div class="nr-bottom-inner">' + items + '</div></nav>';
    },

    mount: function (active) {
      if (!d.getElementById("nr-top-nav")) { var t = d.createElement("div"); t.id = "nr-top-nav"; d.body.insertBefore(t, d.body.firstChild); }
      if (!d.getElementById("nr-bottom-nav")) { var b = d.createElement("div"); b.id = "nr-bottom-nav"; d.body.appendChild(b); }
      d.getElementById("nr-top-nav").innerHTML = this.topNav(active);
      d.getElementById("nr-bottom-nav").innerHTML = this.bottomNav(active);
    },

    /* score ring (SVG), colored by stage */
    ring: function (score, size) {
      score = Math.max(0, Math.min(100, +score || 0)); size = size || 132;
      var st = NR.stage.forScore(score), r = (size / 2) - 9, c = 2 * Math.PI * r, off = c * (1 - score / 100);
      return '<div class="nr-ring" style="width:' + size + 'px;height:' + size + 'px">' +
        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>' +
        '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" fill="none" stroke="' + st.color + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
        '</svg><div class="inner"><div class="num">' + Math.round(score) + '</div><div class="den">/ 100</div></div></div>';
    },

    stagePill: function (score) {
      var st = NR.stage.forScore(score);
      return '<span class="nr-stage-pill"><span class="dot" style="background:' + st.color + '"></span>' + esc(st.name) + '</span>';
    },

    deltaBadge: function (delta) {
      if (delta == null) return "";
      var cls = delta > 0 ? "up" : (delta < 0 ? "down" : "flat");
      var arrow = delta > 0 ? "↑" : (delta < 0 ? "↓" : "→");
      var txt = delta > 0 ? ("+" + delta + " since last check-in") : (delta < 0 ? (delta + " since last check-in") : "No change since last check-in");
      return '<span class="nr-delta ' + cls + '">' + arrow + " " + esc(txt) + "</span>";
    },

    /* reservoir bars — summit -> base (retirement at top, buffer at base) */
    reservoirs: function (mountain) {
      var order = ["retirement", "sinking", "emergency", "buffer"], nums = { retirement: "04", sinking: "03", emergency: "02", buffer: "01" };
      var rows = order.map(function (k) {
        var sc = mountain.scores[k] || 0, meta = NR.score.OPTIONS[k], status = NR.score.statusFor(sc).label;
        var weak = mountain.weakest === k;
        return '<div class="nr-res-row">' +
          '<div class="top"><span class="nr-res-name"><span class="n">' + nums[k] + '</span>' + esc(meta.label) + (weak ? ' <span class="gold" style="font-size:11px;font-family:var(--mono)"> - focus</span>' : "") + '</span>' +
          '<span class="nr-res-status">' + esc(status) + ' · ' + sc + '</span></div>' +
          '<div class="nr-res-track' + (weak ? ' nr-res-weak' : '') + '"><div class="nr-res-fill" style="width:' + sc + '%;background:' + meta.color + '"></div></div></div>';
      }).join("");
      return '<div class="nr-res">' + rows + '</div>';
    },

    crossGraph: function (cross) {
      if (!cross) return "";
      return '<a class="nr-cross" href="' + esc(cross.url) + '" target="_blank" rel="noopener" data-xg="' + esc(cross.kind) + '">' +
        '<span class="t"><b>Relevant to you:</b> ' + esc(cross.label) + '</span><span class="nr-textlink">Open →</span></a>';
    },

    gateVeil: function (opts) {
      opts = opts || {};
      return '<div class="nr-gate-veil"><div class="nr-lock">◈ Mountain Membership</div>' +
        '<h3>' + esc(opts.title || "Track your climb over time") + '</h3>' +
        '<p>' + esc(opts.body || "Save your Mountain history, goals, and monthly reports with a membership.") + '</p>' +
        '<a class="nr-btn" href="' + R.membership + '">See membership</a>' +
        '<div style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--slate);margin-top:10px">' + ((NR.config && NR.config.guaranteeDays) || 30) + '-DAY MONEY-BACK GUARANTEE</div></div>';
    },

    toast: function (msg, opts) {
      opts = opts || {};
      var el = d.getElementById("nr-toast");
      if (!el) { el = d.createElement("div"); el.id = "nr-toast"; el.className = "nr-toast"; d.body.appendChild(el); }
      el.innerHTML = '<span class="s">✦</span>' + esc(msg);
      void el.offsetWidth; el.classList.add("show");
      clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("show"); }, opts.ms || 3200);
    },

    /* ---- PWA install prompt ---- */
    _deferredPrompt: null,
    canInstall: function () { return !!NR.ui._deferredPrompt; },
    promptInstall: function () {
      var p = NR.ui._deferredPrompt; if (!p) return;
      p.prompt(); p.userChoice.then(function (c) { NR.track("pwa_install", { source: (c && c.outcome) || "unknown" }); NR.ui._deferredPrompt = null; });
    },

    registerSW: function () {
      if (!("serviceWorker" in w.navigator)) return;
      try { w.navigator.serviceWorker.register("/sw.js").catch(function () {}); } catch (e) {}
    },

    /* ---- page boot ---- */
    boot: function (opts) {
      opts = opts || {};
      d.body.classList.add("nr");
      d.body.setAttribute("data-membership", NR.membership.status());
      if (opts.active !== false) this.mount(opts.active || null);
      this.registerSW();
      w.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); NR.ui._deferredPrompt = e; d.body.setAttribute("data-can-install", "1"); });
      // privacy-safe page view
      var m = NR.store.loadMountain();
      NR.track("app_view", { route: opts.route || (opts.active || "app"), score: m ? m.overall : null, stage: m ? NR.stage.forScore(m.overall).key : null });
      if (typeof opts.ready === "function") { try { opts.ready(m); } catch (e) { if (w.console) console.error(e); } }
    },

    /* Require a saved mountain; if none, send to assessment with a gentle note. */
    requireMountain: function () {
      var m = NR.store.loadMountain();
      if (m) return m;
      return null;
    }
  };

})(window, document);

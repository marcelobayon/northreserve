/* =============================================================================
   nr-nav.js  ·  NorthReserve unified MARKETING navigation.
   Self-contained (no nr-core dependency): injects its own styles that match the
   in-app nav, reads localStorage to reflect sign-in / member state, hides any
   legacy nav on the page (header.nav, injected .nrc-nav, static header.nr-top),
   and renders one consistent bar. Marketing link set stays distinct from the
   in-app nav. Add to a marketing page with: <script src="/nr-nav.js"></script>
   ============================================================================= */
(function (w, d) {
  "use strict";
  if (w.__nrNavMounted) return;
  var R = { home: "/", assessment: "/assessment", tools: "/tools", guides: "/stages", membership: "/membership", app: "/app", account: "/account" };
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true" width="26" height="26"><path d="M2 28 L13 8 L18.5 18 L22 12 L30 28 Z" fill="#176658"/><path d="M13 8 L18.5 18 L15 18 L12.5 13 Z" fill="#1E8A6E"/><circle cx="23.5" cy="7.5" r="2.4" fill="#F2B441"/></svg>';

  function readJSON(k) { try { var r = w.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function state() {
    var p = readJSON("nr_profile");
    if (p && p.id) return { signedIn: true, member: p.membershipStatus === "member", name: p.displayName || p.email || "You" };
    return { signedIn: false, member: false, name: null };
  }

  var CSS =
    '.nrnav{position:sticky;top:0;z-index:70;background:#0A2A2E;border-bottom:1px solid rgba(87,199,218,.16);box-shadow:0 10px 24px -18px rgba(0,0,0,.7);font-family:"Satoshi",ui-sans-serif,system-ui,sans-serif}' +
    '.nrnav *{box-sizing:border-box}' +
    '.nrnav-inner{max-width:1040px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}' +
    '.nrnav-brand{display:flex;align-items:center;gap:9px;font-family:"Clash Display","Satoshi",sans-serif;font-weight:600;font-size:19px;letter-spacing:-.02em;color:#F4F6F3;text-decoration:none}' +
    '.nrnav-brand .r{color:#F2B441}.nrnav-brand svg{flex:none;border-radius:7px}' +
    '.nrnav-links{display:flex;align-items:center;gap:22px}' +
    '.nrnav-links a{color:#B8C6C3;font-size:14.5px;font-weight:500;text-decoration:none}.nrnav-links a:hover{color:#F4F6F3}' +
    '.nrnav-right{display:flex;align-items:center;gap:12px}' +
    '.nrnav-link{color:#B8C6C3;font-size:14px;text-decoration:none}.nrnav-link:hover{color:#F4F6F3}' +
    '.nrnav-btn{display:inline-flex;align-items:center;font-family:"Clash Display",sans-serif;font-weight:600;font-size:14px;background:#F2B441;color:#0A2A2E;border-radius:10px;padding:9px 15px;text-decoration:none;box-shadow:0 10px 22px -12px rgba(242,180,65,.7);transition:transform .14s}' +
    '.nrnav-btn:hover{color:#0A2A2E;transform:translateY(-1px)}' +
    '.nrnav-av{width:30px;height:30px;border-radius:50%;background:rgba(87,199,218,.14);border:1px solid rgba(87,199,218,.3);display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace;font-size:13px;color:#57C7DA;text-decoration:none}' +
    '.nrnav-av.member{border-color:#F2B441;color:#F2B441;box-shadow:0 0 0 2px rgba(242,180,65,.25)}' +
    '.nrnav-badge{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#F2B441;background:rgba(242,180,65,.12);border:1px solid rgba(242,180,65,.3);padding:3px 7px;border-radius:999px}' +
    '@media(max-width:720px){.nrnav-links{display:none}.nrnav-badge{display:none}}' +
    /* hide every legacy nav variant on pages that load this unified nav */
    'header.nav,.nrc-nav,header.nr-top{display:none !important}';

  function render() {
    var st = state();
    var right = st.signedIn
      ? '<a class="nrnav-av' + (st.member ? ' member' : '') + '" href="' + R.account + '" title="Account">' + esc((st.name || "You").slice(0, 1).toUpperCase()) + '</a>' +
        (st.member ? '<span class="nrnav-badge">Member</span>' : '') +
        '<a class="nrnav-btn" href="' + R.app + '">Open your Mountain</a>'
      : '<a class="nrnav-link" href="' + R.account + '">Sign in</a>' +
        '<a class="nrnav-btn" href="' + R.assessment + '">See your Mountain</a>';
    return '<div class="nrnav-inner">' +
      '<a class="nrnav-brand" href="' + R.home + '">' + LOGO + '<span>North<span class="r">Reserve</span></span></a>' +
      '<nav class="nrnav-links">' +
        '<a href="' + R.assessment + '">Assessment</a>' +
        '<a href="' + R.tools + '">Tools</a>' +
        '<a href="' + R.guides + '">Guides</a>' +
        '<a href="' + R.membership + '">Membership</a>' +
      '</nav>' +
      '<div class="nrnav-right">' + right + '</div>' +
      '</div>';
  }

  function mount() {
    if (w.__nrNavMounted || d.querySelector("header.nrnav")) { w.__nrNavMounted = true; return; }
    w.__nrNavMounted = true;
    if (!d.getElementById("nrnav-css")) { var style = d.createElement("style"); style.id = "nrnav-css"; style.textContent = CSS; (d.head || d.documentElement).appendChild(style); }
    var header = d.createElement("header"); header.className = "nrnav"; header.innerHTML = render();
    d.body.insertBefore(header, d.body.firstChild);
  }
  if (d.readyState !== "loading") mount(); else d.addEventListener("DOMContentLoaded", mount);
})(window, document);

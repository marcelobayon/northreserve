/* =============================================================================
   assessment-continue.js  ·  Closes the loop from the Assessment back into the
   NorthReserve network. Injects a "Continue your climb" block into the results:
     • Progress Tracker (pre-filled with the user's Mountain Score)
     • the two most relevant next calculators, chosen from their result
     • the app (waitlist)
   It reads the already-rendered result from the DOM, so the Assessment's core
   code is untouched. Add ONE line before </body> of assessment.html:
       <script src="/assessment-continue.js"></script>
   (Reuses the site's GA tag; fires the same event vocabulary as the calculators.)
   ============================================================================= */
(function () {
  "use strict";

  var TOOLS = {
    "emergency-fund":        { name: "Emergency Fund Calculator",  url: "/emergency-fund",        color: "#2A8ADD", blurb: "See your months of protection and your target." },
    "next-1000":             { name: "What's my next $1,000 move?", url: "/next-1000",            color: "#7F77DD", blurb: "The single best move for a spare $1,000." },
    "debt-freedom":          { name: "Debt Freedom Calculator",    url: "/debt-freedom",          color: "#E2553D", blurb: "How fast you could be debt-free." },
    "home-buying-readiness": { name: "Home Buying Readiness",       url: "/home-buying-readiness", color: "#F2B441", blurb: "Are you actually ready to buy?" },
    "house-poor":            { name: "House Poor Calculator",       url: "/house-poor",            color: "#E2553D", blurb: "Will a mortgage stretch you too thin?" },
    "mortgage-qualification":{ name: "Qualification vs Comfort",    url: "/mortgage-qualification",color: "#1E8A6E", blurb: "Lender max vs a comfortable price." }
  };

  function ga(name, params) { try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {} }

  function readScore() { var el = document.getElementById("scoreNum"); var m = (el ? el.textContent : "").match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
  function readZones() {
    var z = {}, map = { "Buffer": "buffer", "Emergency": "emergency", "Sinking Funds": "sinking", "Retirement": "retirement" };
    Array.prototype.forEach.call(document.querySelectorAll("#legend .zrow"), function (row) {
      var nm = row.querySelector(".zname"), vl = row.querySelector(".zval");
      if (nm && vl) { var k = map[nm.textContent.trim()]; if (k) z[k] = parseInt(vl.textContent, 10) || 0; }
    });
    return z;
  }

  // Result -> the two most relevant next tools. Solid foundation -> home path;
  // building foundation -> shore up the weakest reservoir first.
  function pickTools(z, score) {
    var picks = [];
    if (score >= 70) picks.push("home-buying-readiness", "mortgage-qualification");
    else {
      var order = ["buffer", "emergency", "sinking", "retirement"], weakest = "emergency", low = Infinity;
      order.forEach(function (k) { if (z[k] != null && z[k] < low) { low = z[k]; weakest = k; } });
      if (weakest === "buffer" || weakest === "emergency") picks.push("emergency-fund", "next-1000");
      else if (weakest === "sinking") picks.push("next-1000", "emergency-fund");
      else picks.push("next-1000", "home-buying-readiness");
    }
    var seen = {}, out = [];
    picks.forEach(function (s) { if (!seen[s] && TOOLS[s]) { seen[s] = 1; out.push(s); } });
    return out.slice(0, 2);
  }

  function build() {
    var results = document.getElementById("screen-results");
    if (!results || document.getElementById("nrContinue")) return;

    var score = readScore(), tools = pickTools(readZones(), score);
    var ptHref = "/progress-tracker" + (score ? "?score=" + score : "");
    var cards = tools.map(function (s) {
      var t = TOOLS[s];
      return '<a class="nr-cont-card" href="' + t.url + '" data-to="' + t.url + '" style="border-left-color:' + t.color + '">' +
             '<div class="nr-cc-nm">' + t.name + '</div><div class="nr-cc-bl">' + t.blurb + '</div></a>';
    }).join("");

    var box = document.createElement("div");
    box.id = "nrContinue";
    box.innerHTML =
      '<style>' +
      '#nrContinue{border-top:1px solid var(--line,rgba(87,199,218,.16));margin-top:22px;padding-top:22px}' +
      '#nrContinue .eye{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#F2B441;margin-bottom:8px}' +
      '#nrContinue h3{font-family:var(--disp,sans-serif);font-weight:600;font-size:20px;margin:0 0 6px;color:#F4F6F3}' +
      '#nrContinue p.sub{font-size:14px;color:#8DA09C;margin:0 0 16px}' +
      '#nrContinue .nr-pt{display:block;text-decoration:none;color:#F4F6F3;background:linear-gradient(160deg,#0E3A40,#0A2A2E);border:1px solid rgba(242,180,65,.34);border-radius:16px;padding:20px 22px;margin-bottom:12px}' +
      '#nrContinue .nr-pt .k{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#F2B441;margin-bottom:6px}' +
      '#nrContinue .nr-pt .t{font-family:var(--disp,sans-serif);font-weight:600;font-size:19px}' +
      '#nrContinue .nr-pt .d{font-size:14px;color:#D9E6E2;margin-top:4px}' +
      '#nrContinue .nr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '@media(max-width:540px){#nrContinue .nr-grid{grid-template-columns:1fr}}' +
      '#nrContinue .nr-cont-card{display:block;text-decoration:none;color:#F4F6F3;border:1px solid rgba(87,199,218,.16);border-left-width:3px;border-radius:12px;padding:14px 16px;background:rgba(14,58,64,.4)}' +
      '#nrContinue .nr-cc-nm{font-family:var(--disp,sans-serif);font-weight:600;font-size:15px}' +
      '#nrContinue .nr-cc-bl{font-size:12.5px;color:#CBD8D5;margin-top:3px}' +
      '#nrContinue .nr-app{margin-top:14px;font-size:14px;color:#DCE6E3}' +
      '#nrContinue .nr-app a{color:#F2B441;text-decoration:none;font-weight:600}' +
      '</style>' +
      '<div class="eye">Continue your climb</div>' +
      '<h3>Your next move above is step one.</h3>' +
      '<p class="sub">Here’s how to keep the momentum going.</p>' +
      '<a class="nr-pt" href="/app" data-pt="1" data-to="/app"><div class="k">Save your Mountain</div>' +
        '<div class="t">Track your climb for real →</div>' +
        '<div class="d">Keep your Mountain' + (score ? " (score " + score + ")" : "") + ', check in monthly, and watch it move. Free.</div></a>' +
      (cards ? '<div class="nr-grid">' + cards + '</div>' : "") +
      '<div class="nr-app">Your Mountain is ready — <a href="/app" data-to="/app">open it and start climbing</a>.</div>';

    var share = document.getElementById("nrShare"), disc = results.querySelector(".disclaimer");
    if (share && share.parentNode) share.parentNode.insertBefore(box, share);
    else if (disc) results.insertBefore(box, disc);
    else results.appendChild(box);

    ga("next_move_viewed", { tool: "assessment", score: score });
    box.addEventListener("click", function (e) {
      var a = e.target.closest("[data-to],[data-pt]"); if (!a) return;
      if (a.getAttribute("data-pt")) ga("mountain_save_click", { tool: "assessment", action: "save_mountain" });
      else ga("related_tool_clicked", { tool: "assessment", to: a.getAttribute("data-to") });
    });
  }

  function watch() {
    var results = document.getElementById("screen-results"); if (!results) return;
    function maybe() { if (results.classList.contains("on")) setTimeout(build, 1200); } // let the score finish animating
    maybe();
    if (window.MutationObserver) new MutationObserver(maybe).observe(results, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState !== "loading") watch(); else document.addEventListener("DOMContentLoaded", watch);
})();

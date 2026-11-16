/* =============================================================================
   nr-setups.js  ·  "Saved tool setups" — save the numbers you enter into any
   NorthReserve calculator and reload them anytime.
   Self-contained. Include LAST on calculator pages (after calc-network.js):
     <script src="/nr-setups.js"></script>

   Free:   1 saved setup (a taste).
   Member: unlimited, across every tool.
   Storage: localStorage "nr_setups" (per browser). Membership is read from
   "nr_profile" so no app-core dependency is needed on marketing pages.
   ============================================================================= */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.__nrSetupsMounted) return; w.__nrSetupsMounted = true;

  var KEY = "nr_setups";
  var FREE_LIMIT = 1;
  var MEMBERSHIP_URL = "/membership";

  /* ---- membership (read-only, from the local profile) -------------------- */
  function isMember() {
    try {
      var p = JSON.parse(w.localStorage.getItem("nr_profile") || "null");
      return !!(p && p.membershipStatus === "member");
    } catch (e) { return false; }
  }

  /* ---- current tool, derived from the path (no private calc state) ------- */
  function currentTool() {
    var path = location.pathname.replace(/\/+$/, "").replace(/\.html$/, "");
    if (path === "") path = "/";
    var list = (w.NRCalc && w.NRCalc.CALCS) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === path) return { slug: list[i].slug, name: list[i].name };
    }
    var slug = path.replace(/^\//, "") || "tool";
    return { slug: slug, name: slug.replace(/-/g, " ") };
  }
  var tool = currentTool();

  /* ---- storage ----------------------------------------------------------- */
  function all() { try { return JSON.parse(w.localStorage.getItem(KEY) || "[]") || []; } catch (e) { return []; } }
  function put(list) { try { w.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  function forTool(slug) { return all().filter(function (s) { return s.tool === slug; }); }
  function findById(id) { var a = all(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function removeById(id) { put(all().filter(function (s) { return s.id !== id; })); }
  function uid() { return "s_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }

  /* ---- capture / restore the calc's numeric inputs ----------------------- */
  var SKIP = { hidden: 1, email: 1, submit: 1, button: 1, file: 1, password: 1, checkbox: 1, radio: 1 };
  function fieldEls() {
    var scope = d.querySelector("main") || d.body;
    var els = scope.querySelectorAll("input[id], select[id], textarea[id]"), out = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], t = (el.type || "text").toLowerCase();
      if (SKIP[t]) continue;
      if (el.name === "bot-field") continue;
      if (el.closest && el.closest(".email-box")) continue;
      if (el.closest && el.closest("#nrSetupsPanel")) continue;   // never capture our own UI
      out.push(el);
    }
    return out;
  }
  function capture() {
    var els = fieldEls(), vals = {};
    for (var i = 0; i < els.length; i++) vals[els[i].id] = els[i].value;
    return vals;
  }
  /* Choice groups: segmented / option buttons (next-1000, emergency-fund target,
     etc). A group is keyed by its data-q or id; each button carries its value in
     data-v or data-m; the selected one has class "sel"/"active"/"selected" or
     aria-pressed="true". Restore by CLICKING, so each page's own handler runs. */
  function choiceButtons() { return (d.querySelector("main") || d.body).querySelectorAll("button[data-v], button[data-m]"); }
  function groupOf(b) { var g = b.closest ? b.closest("[data-q],[id]") : null; return g || b.parentNode; }
  function groupKey(g) { return (g && g.getAttribute && (g.getAttribute("data-q") || g.id)) || ""; }
  function valAttr(b) { return b.hasAttribute("data-v") ? "data-v" : (b.hasAttribute("data-m") ? "data-m" : null); }
  function isSel(b) { return !!(b.classList && (b.classList.contains("sel") || b.classList.contains("active") || b.classList.contains("selected"))) || b.getAttribute("aria-pressed") === "true"; }
  function captureChoices() {
    var btns = choiceButtons(), out = {}, i, b, g, key, attr;
    for (i = 0; i < btns.length; i++) {
      b = btns[i]; g = groupOf(b); key = groupKey(g); attr = valAttr(b);
      if (!key || !attr) continue;
      if (isSel(b)) out[key] = { v: b.getAttribute(attr), attr: attr };
    }
    return out;
  }
  function restoreChoices(choices) {
    var key, btns, i, b;
    for (key in choices) if (Object.prototype.hasOwnProperty.call(choices, key)) {
      btns = choiceButtons();
      for (i = 0; i < btns.length; i++) {
        b = btns[i];
        if (groupKey(groupOf(b)) === key && b.getAttribute(choices[key].attr) === choices[key].v) { b.click(); break; }
      }
    }
  }
  function applySetup(rec) {
    if (rec.choices) restoreChoices(rec.choices);
    var vals = rec.values || {}, id, el;
    for (id in vals) if (Object.prototype.hasOwnProperty.call(vals, id)) {
      el = d.getElementById(id);
      if (!el) continue;
      el.value = vals[id];
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    var btn = d.getElementById("calcBtn");            // most calcs compute on this click
    if (btn) btn.click();
    var p = d.getElementById("nrSetupsPanel");
    if (p && p.scrollIntoView) p.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---- analytics (reuse the calc event bus if present) ------------------- */
  function track(name) {
    try {
      if (w.NRCalc && w.NRCalc.track) w.NRCalc.track(name, { tool: tool.slug });
      else if (w.gtag) w.gtag("event", name, { tool: tool.slug });
    } catch (e) {}
  }

  /* ---- view -------------------------------------------------------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch (e) { return ""; } }

  function panelEl() {
    var el = d.getElementById("nrSetupsPanel");
    if (el) return el;
    el = d.createElement("section");
    el.id = "nrSetupsPanel";
    el.className = "nr-setups";
    el.setAttribute("aria-label", "Saved tool setups");
    var anchor = d.getElementById("result");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else (d.querySelector("main") || d.body).appendChild(el);
    el.addEventListener("click", onClick);
    return el;
  }

  function render() {
    var el = panelEl();
    var mine = forTool(tool.slug).sort(function (a, b) { return b.ts - a.ts; });
    var member = isMember();
    var atLimit = !member && mine.length >= FREE_LIMIT;

    var rows = "";
    for (var i = 0; i < mine.length; i++) {
      var s = mine[i];
      rows += '<li class="nr-setups-row">' +
        '<button class="nr-setups-load" type="button" data-load="' + esc(s.id) + '">' +
          '<span class="nr-setups-name">' + esc(s.name) + '</span>' +
          '<span class="nr-setups-date">' + esc(fmtDate(s.ts)) + '</span>' +
        '</button>' +
        '<button class="nr-setups-del" type="button" data-del="' + esc(s.id) + '" aria-label="Delete setup">&times;</button>' +
      '</li>';
    }

    var head = '<div class="nr-setups-head"><span class="nr-setups-k">Saved setups</span>' +
      (member ? '<span class="nr-setups-badge">Member</span>' : '') + '</div>';

    var list = rows
      ? '<ul class="nr-setups-list">' + rows + '</ul>'
      : '<p class="nr-setups-empty">Save what you entered above, then reload it anytime — here or in any other tool.</p>';

    var action;
    if (atLimit) {
      action = '<div class="nr-setups-lock">You have used your free save. ' +
        '<a href="' + MEMBERSHIP_URL + '">Members save unlimited setups across every tool &rarr;</a></div>';
    } else {
      action = '<div class="nr-setups-save">' +
          '<input class="nr-setups-input" id="nrSetupsName" type="text" maxlength="40" placeholder="Name this setup (e.g. ' + esc(tool.name) + ')">' +
          '<button class="nr-setups-btn" id="nrSetupsSaveBtn" type="button">Save this setup</button>' +
        '</div>' +
        '<div class="nr-setups-status" id="nrSetupsStatus" role="status"></div>' +
        (member ? '' : '<div class="nr-setups-hint">1 free save &middot; <a href="' + MEMBERSHIP_URL + '">members get unlimited &rarr;</a></div>');
    }

    el.innerHTML = head + list + action;
  }

  function status(msg) {
    var st = d.getElementById("nrSetupsStatus");
    if (!st) return;
    st.textContent = msg;
    setTimeout(function () { if (st.textContent === msg) st.textContent = ""; }, 2600);
  }

  function doSave() {
    var vals = capture(), choices = captureChoices(), hasAny = false, k;
    for (k in vals) if (vals[k] !== "" && vals[k] != null) { hasAny = true; break; }
    if (!hasAny) for (k in choices) if (Object.prototype.hasOwnProperty.call(choices, k)) { hasAny = true; break; }
    if (!hasAny) { status("Fill in the tool above first, then save."); return; }
    var nameEl = d.getElementById("nrSetupsName");
    var name = (nameEl && nameEl.value.trim()) || (tool.name + " · " + fmtDate(Date.now()));
    var list = all();
    list.push({ id: uid(), tool: tool.slug, toolName: tool.name, name: name, ts: Date.now(), values: vals, choices: choices });
    put(list);
    track("setup_saved");
    render();
    status("Saved. Reload it anytime from the list above.");
  }

  function onClick(e) {
    var t = e.target;
    if (t && t.id === "nrSetupsSaveBtn") { doSave(); return; }
    var loadBtn = t.closest ? t.closest("[data-load]") : null;
    if (loadBtn) { var s = findById(loadBtn.getAttribute("data-load")); if (s) { applySetup(s); track("setup_loaded"); } return; }
    var delBtn = t.closest ? t.closest("[data-del]") : null;
    if (delBtn) { removeById(delBtn.getAttribute("data-del")); track("setup_deleted"); render(); return; }
  }

  /* ---- styles ------------------------------------------------------------ */
  function injectCss() {
    if (d.getElementById("nr-setups-css")) return;
    var css =
      ".nr-setups{max-width:560px;margin:18px auto 0;padding:16px 18px;border:1px solid rgba(242,180,65,.28);border-radius:14px;background:rgba(18,32,29,.55);font-family:inherit}" +
      ".nr-setups-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}" +
      ".nr-setups-k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#F2B441}" +
      ".nr-setups-badge{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#07140f;background:#F2B441;border-radius:999px;padding:2px 8px}" +
      ".nr-setups-empty{margin:0;font-size:13.5px;color:#9fb4ae;line-height:1.5}" +
      ".nr-setups-list{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:6px}" +
      ".nr-setups-row{display:flex;align-items:stretch;gap:6px}" +
      ".nr-setups-load{flex:1;display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:9px 12px;color:#e7f0ed;cursor:pointer;text-align:left;font:inherit}" +
      ".nr-setups-load:hover{border-color:rgba(242,180,65,.5);background:rgba(242,180,65,.08)}" +
      ".nr-setups-name{font-weight:600;font-size:14px}" +
      ".nr-setups-date{font-size:12px;color:#8da09c;white-space:nowrap}" +
      ".nr-setups-del{width:38px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:transparent;color:#8da09c;font-size:18px;line-height:1;cursor:pointer}" +
      ".nr-setups-del:hover{color:#E2553D;border-color:rgba(226,85,61,.5)}" +
      ".nr-setups-save{display:flex;gap:8px;flex-wrap:wrap}" +
      ".nr-setups-input{flex:1;min-width:180px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:10px 12px;color:#fff;font:inherit;font-size:14px}" +
      ".nr-setups-input::placeholder{color:#6f847f}" +
      ".nr-setups-btn{background:#F2B441;color:#07140f;border:0;border-radius:9px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer}" +
      ".nr-setups-btn:hover{filter:brightness(1.06)}" +
      ".nr-setups-hint{margin-top:8px;font-size:12px;color:#8da09c}" +
      ".nr-setups-hint a,.nr-setups-lock a{color:#F2B441;text-decoration:none}" +
      ".nr-setups-hint a:hover,.nr-setups-lock a:hover{text-decoration:underline}" +
      ".nr-setups-lock{font-size:13.5px;color:#cdd8d4;line-height:1.5}" +
      ".nr-setups-status{margin-top:8px;font-size:12.5px;color:#F2B441;min-height:1em}" +
      "@media(max-width:520px){.nr-setups-btn{flex:1}}";
    var st = d.createElement("style");
    st.id = "nr-setups-css";
    st.textContent = css;
    d.head.appendChild(st);
  }

  /* ---- init -------------------------------------------------------------- */
  function boot() {
    // Only mount where there is something to save.
    if (!d.getElementById("result") && !d.getElementById("calcBtn") && fieldEls().length === 0) return;
    injectCss();
    render();
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

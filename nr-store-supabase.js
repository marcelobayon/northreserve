/* =============================================================================
   nr-store-supabase.js  ·  Local-first cross-device sync for NorthReserve Mountain
   -----------------------------------------------------------------------------
   WHY THIS SHAPE: the app reads synchronously from localStorage (instant, works
   offline). A network backend is async. So we do NOT replace the store driver.
   Instead localStorage stays the read-cache, and this layer:
     • on sign-in, PULLS the user's state from Supabase and hydrates localStorage
     • on every write, PUSHES the state up (debounced) and logs the check-in
     • reads membership from the server-owned profile (Stripe webhook sets it)

   DORMANT BY DEFAULT: if nr-config.js has no real Supabase keys, this file does
   nothing and the app behaves exactly as the local-only version. Nothing breaks.

   To swap Supabase for Firebase/other later: keep this file's public surface
   (NR.sync.*) and re-implement init/hydrate/pushState/logCheckin against the
   new SDK. No page or UI code changes.
   ============================================================================= */
(function (w, d) {
  "use strict";
  var NR = w.NR; if (!NR || !NR.store) return;
  var cfg = w.NR_CONFIG || {};
  NR.sync = { enabled: false, ready: false, client: null, user: null };

  function configured() {
    return cfg.supabaseUrl && cfg.supabaseAnonKey &&
      String(cfg.supabaseUrl).indexOf("PASTE") === -1 &&
      String(cfg.supabaseAnonKey).indexOf("PASTE") === -1;
  }
  if (!configured()) return; // local-only: app runs unchanged

  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  loadScript(SDK, init, function () { /* SDK failed to load -> stay local */ });

  function loadScript(src, ok, fail) {
    var s = d.createElement("script"); s.src = src; s.async = true;
    s.onload = ok; s.onerror = fail || function () {}; d.head.appendChild(s);
  }

  function init() {
    try {
      NR.sync.client = w.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { return; }
    NR.sync.enabled = true;
    wireWrites();
    overrideCheckout();
    NR.sync.client.auth.getSession().then(function (r) {
      setUser(r && r.data && r.data.session && r.data.session.user);
    });
    NR.sync.client.auth.onAuthStateChange(function (_ev, session) {
      setUser(session && session.user);
    });
    NR.sync.ready = true;
    dispatch("nr:sync-ready");
  }

  function setUser(user) {
    var was = NR.sync.user;
    NR.sync.user = user || null;
    if (user) { ensureProfile(user); hydrate(); if (/[?&]welcome=1/.test(w.location.search)) pollWelcome(); }
    else if (was) { try { sessionStorage.removeItem("nr_reloaded_tags"); } catch (e) {} }
    dispatch("nr:auth");
  }

  function ensureProfile(user) {
    var p = NR.account.get() || {};
    // profile row is auto-created by the DB trigger; we only (re)write email/name.
    NR.sync.client.from("profiles")
      .upsert({ id: user.id, email: user.email, display_name: p.displayName || null }, { onConflict: "id" })
      .then(function () {}, function () {});
  }

  var pushTimer = null;
  function schedulePush() { if (!NR.sync.user) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushState, 1200); }

  function pushState() {
    if (!NR.sync.user) return;
    var state = {
      mountain: NR.store.driver.loadMountain(),
      history: NR.store.getMountainHistory(),
      goals: NR.store.getGoals(),
      milestones: NR.store.getMilestones()
    };
    NR.sync.client.from("mountain_state")
      .upsert({ user_id: NR.sync.user.id, state: state, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .then(function () {}, function () {});
  }

  function hydrate() {
    if (!NR.sync.user) return;
    var uid = NR.sync.user.id;
    Promise.all([
      NR.sync.client.from("profiles").select("*").eq("id", uid).maybeSingle(),
      NR.sync.client.from("mountain_state").select("state,updated_at").eq("user_id", uid).maybeSingle()
    ]).then(function (res) {
      var prof = res[0] && res[0].data, ms = res[1] && res[1].data;
      var applied = false;

      // membership + identity come from the server (authoritative for entitlement)
      var local = NR.account.get() || {};
      var prevMembership = local.membershipStatus || "free";
      local.id = local.id || uid; local.supabaseId = uid;
      if (prof) {
        if (prof.email) local.email = prof.email;
        if (prof.display_name) local.displayName = prof.display_name;
        local.membershipStatus = prof.membership_status || "free";
        local.membershipPlan = prof.membership_plan || null;
        local.demoMembership = false; // server is authoritative for entitlement now
      }
      NR.account.set(local);
      var membershipChanged = (local.membershipStatus || "free") !== prevMembership;

      // state: adopt remote only when it is same-or-ahead of local (avoids clobber)
      var localHist = NR.store.getMountainHistory();
      var remote = ms && ms.state;
      var remoteHist = (remote && remote.history) || [];
      if (remote && remoteHist.length >= localHist.length && (remote.mountain || remoteHist.length)) {
        if (remote.mountain) NR.store.saveMountain(remote.mountain);
        if (remote.history) NR.store.driver.setHistory(remote.history);
        if (remote.goals) NR.store.driver.setGoals(remote.goals);
        if (remote.milestones) NR.store.driver.setMilestones(remote.milestones);
        applied = true;
      } else {
        pushState(); // local is ahead (or no remote yet) -> seed the server
      }

      dispatch("nr:synced");
      if (membershipChanged) maybeReloadOnce("membership:" + (local.membershipStatus || "free"));
      else if (applied) maybeReloadOnce("state");
    }, function () {});
  }

  // Scaffold refresh: after pulling fresh remote data on sign-in, reload once so
  // the current view reflects it. (Cleaner upgrade: have pages re-render on the
  // 'nr:synced' event instead of reloading. Documented in the report.)
  function maybeReloadOnce(tag) {
    tag = tag || "state";
    try {
      var done = sessionStorage.getItem("nr_reloaded_tags") || "";
      if (done.indexOf("|" + tag + "|") !== -1) return;
      sessionStorage.setItem("nr_reloaded_tags", done + "|" + tag + "|");
    } catch (e) { return; }
    w.location.reload();
  }

  // After returning from Stripe (/app?welcome=1) the membership webhook runs
  // asynchronously; poll the profile a few times so the unlock appears without a
  // manual refresh.
  function pollWelcome() {
    if (!NR.sync.user) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (!NR.sync.user || tries > 12) { clearInterval(t); return; }
      NR.sync.client.from("profiles").select("membership_status,membership_plan").eq("id", NR.sync.user.id).maybeSingle()
        .then(function (r) {
          var prof = r && r.data;
          if (prof && prof.membership_status === "member") {
            clearInterval(t);
            var local = NR.account.get() || {};
            if (local.membershipStatus !== "member") {
              local.membershipStatus = "member"; local.membershipPlan = prof.membership_plan || null; local.demoMembership = false;
              NR.account.set(local);
              maybeReloadOnce("membership:member");
            }
          }
        }, function () {});
    }, 2500);
  }

  function wireWrites() {
    var origCommit = NR.store.commit.bind(NR.store);
    NR.store.commit = function (mountain, opts) {
      var r = origCommit(mountain, opts);
      try { logCheckin(mountain, opts); } catch (e) {}
      schedulePush();
      return r;
    };
    var origGoal = NR.store.saveGoal.bind(NR.store);
    NR.store.saveGoal = function (g) { var r = origGoal(g); schedulePush(); return r; };
    var origDel = NR.store.deleteGoal.bind(NR.store);
    NR.store.deleteGoal = function (id) { var r = origDel(id); schedulePush(); return r; };
  }

  function logCheckin(mountain, opts) {
    if (!NR.sync.user || !mountain) return;
    var now = new Date();
    NR.sync.client.from("checkins").insert({
      user_id: NR.sync.user.id,
      overall: mountain.overall,
      stage: NR.stage.forScore(mountain.overall).key,
      month: now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2),
      source: (opts && opts.source) || "checkin"
    }).then(function () {}, function () {});
  }

  // Real Stripe checkout (via Netlify Function) replaces the demo activation.
  function overrideCheckout() {
    NR.membership.createCheckoutSession = function (plan) {
      if (!NR.sync.user) return Promise.resolve({ needAuth: true, plan: plan });
      return fetch((cfg.apiBase || "/.netlify/functions") + "/create-checkout-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan, email: NR.sync.user.email, userId: NR.sync.user.id, origin: w.location.origin })
      }).then(function (r) { return r.json(); })
        .then(function (j) { return { url: (j && j.url) || null, plan: plan }; })
        .catch(function () { return { error: true, plan: plan }; });
    };
  }

  function dispatch(name) { try { w.dispatchEvent(new Event(name)); } catch (e) {} }
})(window, document);

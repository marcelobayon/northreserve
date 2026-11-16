/* =============================================================================
   nr-core.js  ·  NorthReserve Mountain — application CORE (data + logic layer)
   -----------------------------------------------------------------------------
   The ONLY place that knows how the Mountain is scored, persisted, staged, and
   turned into a Next Move / Range / Milestones. The UI layer (nr-ui.js) and the
   /app/* pages read from window.NR and never recompute.

   DESIGN CONTRACT (locked with Marcelo, 2026-10-04):
     - 4 zones, retirement at the SUMMIT, buffer at the BASE. Unchanged.
     - Tracking unit is the 0-100 zone score. Dollars are guidance copy only.
     - The canonical current Mountain lives in localStorage['nr_mountain'] and is
       SHAPE-COMPATIBLE with what assessment.html already writes and mountain.html
       already reads. We extend around it; we never break it.

   PERSISTENCE IS ABSTRACTED. Everything that touches storage goes through
   NR.store.driver.*. Today the driver is localStorage. To move to Firebase /
   Supabase later, implement the same driver method surface and call
   NR.store.use(newDriver). No page or UI code changes.

   SECURITY: no secrets, no passwords, no bank linking. Analytics is privacy-safe
   (bands / labels only — never raw dollars, never email).
   ============================================================================= */
(function (w) {
  "use strict";
  var NR = w.NR = w.NR || {};
  NR.version = "1.0.0";

  /* ------------------------------------------------------------------ CONFIG */
  NR.config = {
    product: {
      name: "NorthReserve Mountain",
      promise: "See where you stand. Know your next move. Climb with confidence."
    },
    ga: "G-0Z24386PQN",
    guaranteeDays: 30,       // money-back guarantee window shown in copy
    /* ONE place for pricing. Change here, it changes everywhere. */
    pricing: {
      currency: "USD",
      monthly: 7.99,
      annual: 79,
      trialDays: 0,            // 0 = no free trial. Set >0 AND set STRIPE_TRIAL_DAYS env to the same number to enable.
      annualPerMonth: function () { return Math.round((this.annual / 12) * 100) / 100; }, // 6.58
      annualSavingsPct: function () { return Math.round((1 - (this.annual / (this.monthly * 12))) * 100); } // ~18
    },
    storageKeys: {
      mountain:   "nr_mountain",   // EXISTING canonical model — shared with assessment/mountain
      profile:    "nr_profile",
      history:    "nr_history",
      goals:      "nr_goals",
      milestones: "nr_milestones",
      settings:   "nr_settings"
    },
    /* Free vs Membership boundary. Flip a flag to move the paywall; nothing else changes. */
    gates: {
      fullHistory:   true,   // free sees current + most-recent delta; full timeline is member
      mountainRange: true,   // free sees ONE suggested peak; the full Range is member
      monthlyReport: true,
      savedTools:    true
    },
    freeHistoryVisible: 2,    // snapshots a free user can see (current + 1 prior)
    freeGoalLimit: 1,
    routes: {
      home:"/app", checkin:"/app/check-in", progress:"/app/progress", report:"/app/report",
      nextMove:"/app/next-move", range:"/app/range", settings:"/app/settings",
      account:"/account", membership:"/membership",
      assessment:"/assessment", mountain:"/mountain", tools:"/tools", guides:"/stages"
    }
  };

  /* -------------------------------------------------------------------- UTIL */
  NR.util = {
    now: function () { return Date.now(); },
    uid: function () { return "m_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); },
    clamp: function (n, lo, hi) { lo = (lo == null ? 0 : lo); hi = (hi == null ? 100 : hi); n = +n; if (!isFinite(n)) n = lo; return Math.max(lo, Math.min(hi, n)); },
    monthKey: function (ts) { var d = new Date(ts || Date.now()); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); },
    fmtDate: function (ts) { try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch (e) { return ""; } },
    fmtMonth: function (ts) { try { return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" }); } catch (e) { return ""; } },
    scoreBand: function (s) { s = +s || 0; if (s >= 85) return "85-100"; if (s >= 70) return "70-84"; if (s >= 50) return "50-69"; if (s >= 30) return "30-49"; return "0-29"; },
    money: function (n) { return "$" + Math.round(+n || 0).toLocaleString("en-US"); }
  };

  /* ------------------------------------------------------------------- SCORE */
  NR.score = {
    ZONES: ["buffer", "emergency", "sinking", "retirement"], // base -> summit
    WEIGHTS: { buffer: 0.15, emergency: 0.35, sinking: 0.20, retirement: 0.30 },
    /* Assessment option bands, MIRRORED so a check-in produces identical scores. */
    OPTIONS: {
      buffer: {
        label: "Buffer", eyebrow: "Reservoir 01 - Buffer", color: "#7F77DD",
        prompt: "After your bills are paid, how much breathing room is usually in your checking account?",
        choices: [
          { label: "Often near zero, or I've overdrafted", score: 5 },
          { label: "A little - under $500", score: 40 },
          { label: "A steady $500-$1,000 cushion", score: 78 },
          { label: "More than $1,000, always there", score: 100 }
        ]
      },
      emergency: {
        label: "Emergency", eyebrow: "Reservoir 02 - Emergency", color: "#2A8ADD",
        prompt: "If your income stopped tomorrow, how long could savings cover just the essentials?",
        help: "Rent/mortgage, utilities, food, insurance - the must-pays only.",
        choices: [
          { label: "Less than 2 weeks", score: 8 },
          { label: "About 1 month", score: 38 },
          { label: "2-3 months", score: 66 },
          { label: "3-6 months", score: 90 },
          { label: "More than 6 months", score: 100 }
        ]
      },
      sinking: {
        label: "Sinking Funds", eyebrow: "Reservoir 03 - Sinking Funds", color: "#BA7517",
        prompt: "For costs you know are coming but don't hit monthly - car repairs, holidays, insurance - do you set money aside ahead?",
        choices: [
          { label: "No - they hit me by surprise", score: 10 },
          { label: "Sometimes, informally", score: 42 },
          { label: "For a few of them", score: 70 },
          { label: "Yes, every month", score: 100 }
        ]
      },
      retirement: {
        label: "Retirement", eyebrow: "Reservoir 04 - Retirement", color: "#1D6E45",
        prompt: "Are you putting money toward retirement - a 401(k), IRA, or similar?",
        choices: [
          { label: "Not yet", score: 5 },
          { label: "A little, or on and off", score: 40 },
          { label: "Yes, consistently", score: 78 },
          { label: "Yes - around 15% of income or more", score: 100 }
        ]
      }
    },
    MODIFIERS: {
      match: {
        key: "match", eyebrow: "The free-money check",
        prompt: "If your employer matches retirement contributions, are you getting the full match?",
        choices: [
          { label: "There's a match and I'm not getting all of it", tag: "match_gap" },
          { label: "No match offered, or not sure", tag: "match_na" },
          { label: "Yes - I capture the full match", tag: "match_full" }
        ]
      },
      debt: {
        key: "debt", eyebrow: "One more thing",
        prompt: "Are you carrying high-interest debt (like a credit-card balance) month to month?",
        choices: [
          { label: "None", tag: "debt_none" },
          { label: "A little", tag: "debt_some" },
          { label: "Yes, a significant balance", tag: "debt_high" }
        ]
      }
    },
    clamp: function (n) { return Math.max(0, Math.min(100, n)); },
    /* Canonical formula — identical to assessment.html & mountain.html. KEEP IN SYNC. */
    compute: function (scores, mods) {
      mods = mods || {}; var z = scores || {};
      var overall = 0.15 * (z.buffer || 0) + 0.35 * (z.emergency || 0) + 0.20 * (z.sinking || 0) + 0.30 * (z.retirement || 0);
      if (mods.debt === "debt_high") overall -= 12;
      else if (mods.debt === "debt_some") overall -= 4;
      return Math.round(this.clamp(overall));
    },
    statusFor: function (s) {
      if (s >= 85) return { label: "Solid", cls: "solid" };
      if (s >= 65) return { label: "Healthy", cls: "healthy" };
      if (s >= 40) return { label: "Building", cls: "building" };
      return { label: "Needs attention", cls: "thin" };
    },
    weakestOf: function (scores) { var weakest = "buffer", low = Infinity, k; for (k in scores) { if (scores[k] < low) { low = scores[k]; weakest = k; } } return weakest; },
    strongestOf: function (scores) { var best = "buffer", hi = -Infinity, k; for (k in scores) { if (scores[k] > hi) { hi = scores[k]; best = k; } } return best; },
    zoneName: function (key) { return (NR.score.OPTIONS[key] || {}).label || key; },
    zoneColor: function (key) { return (NR.score.OPTIONS[key] || {}).color || "#57C7DA"; },
    /* Build a full canonical mountain object from scores + modifiers (parallels
       what assessment.html writes to localStorage). */
    build: function (scores, mods) {
      mods = mods || {};
      scores = {
        buffer: NR.util.clamp(scores.buffer), emergency: NR.util.clamp(scores.emergency),
        sinking: NR.util.clamp(scores.sinking), retirement: NR.util.clamp(scores.retirement)
      };
      var status = {}, k; for (k in scores) status[k] = NR.score.statusFor(scores[k]);
      var m = {
        v: 1, ts: NR.util.now(), scores: scores,
        overall: NR.score.compute(scores, mods),
        weakest: NR.score.weakestOf(scores),
        strongest: NR.score.strongestOf(scores),
        status: status,
        confidence: (mods.confidence == null ? null : mods.confidence),
        debt: mods.debt || "debt_none",
        match: mods.match || "match_na"
      };
      m.rec = NR.nextMove.recommend(scores, { debt: m.debt, match: m.match });
      return m;
    }
  };

  /* --------------------------------------------------------------- CROSS-GRAPH
     Thin wrapper over the existing NRLinks control panel (links.js). Guarded so
     the app still works if links.js is not loaded. Contextual only — never shown
     unless it matches the user's actual situation. */
  NR.links = {
    _has: function () { return typeof w.NRLinks !== "undefined"; },
    hysa: function (content) { if (!this._has()) return null; return { label: "Open a high-yield savings account", url: w.NRLinks.hysaUrl({ campaign: "mountain_app", content: content || "next_move" }), kind: "affiliate" }; },
    kawsah: function (content) { if (!this._has()) return null; return { label: "Explore your home-buying path", url: w.NRLinks.brand("kawsah", { campaign: "mountain_app", content: content || "home" }), kind: "cross_brand" }; },
    mitig8: function (content) { if (!this._has()) return null; return { label: "Self-employed income tools", url: w.NRLinks.brand("mitig8", { campaign: "mountain_app", content: content || "self_employed" }), kind: "cross_brand" }; },
    calendar: function (content) { if (!this._has()) return null; return { label: "Book a 15-minute call", url: w.NRLinks.calendarUrl({ campaign: "mountain_app", content: content || "call" }), kind: "call" }; }
  };

  /* --------------------------------------------------------------- NEXT MOVE */
  NR.nextMove = {
    /* Base recommendation — SAME waterfall logic & copy as assessment/mountain. */
    recommend: function (z, a) {
      a = a || {};
      if (z.buffer < 40) return { tag: "BUFFER", zone: "buffer", title: "Start with your Buffer.", body: "Your everyday cushion is thin - and that's where most day-to-day money stress lives. A small $500-$1,000 buffer means a slow week no longer turns into an overdraft. It's the fastest win on your whole mountain." };
      if (a.debt === "debt_high") return { tag: "DEBT", zone: "buffer", title: "Clear the high-interest debt next.", body: "A carried credit-card balance usually grows faster than savings can - so it outranks almost everything else. Putting extra toward it now stops the current that keeps pulling your progress backward." };
      if (a.match === "match_gap") return { tag: "RETIREMENT_MATCH", zone: "retirement", title: "Grab your full employer match.", body: "Leaving part of an employer match on the table is passing up an instant, guaranteed return. Nudging your contribution to capture the full match is often the single highest-return move on the mountain." };
      if (z.emergency < 40) return { tag: "EMERGENCY", zone: "emergency", title: "Build your base to one month.", body: "Your emergency reservoir is thin. You don't need the full 3-6 months yet - just one month of essentials changes how a surprise feels almost overnight." };
      if (z.sinking < 40) return { tag: "SINKING", zone: "sinking", title: "Set up your sinking funds.", body: "Car repairs, holidays, insurance - mostly aren't surprises, they're certainties without a plan. A little set aside each month turns a $1,200 shock into a non-event." };
      if (z.emergency < 70) return { tag: "EMERGENCY", zone: "emergency", title: "Keep filling your emergency base.", body: "You've got a real start. Climbing toward 3-6 months of essentials turns a setback from a spiral into an inconvenience. Keep the auto-transfer running." };
      if (z.retirement < 70) return { tag: "RETIREMENT", zone: "retirement", title: "Turn your attention to the summit.", body: "Your foundation is in good shape - which means time is now your biggest ally. Nudging your retirement contribution up with each raise is the long, steady climb that compounds the most." };
      return { tag: "ACCELERATE", zone: null, title: "You're climbing well - now accelerate.", body: "Your mountain is solid from base to summit. From here it's optimization: investing beyond the basics, paying down lower-interest debt, or funding bigger goals." };
    },
    META: {
      BUFFER: { target: 78, why: "A cash buffer is what keeps an ordinary bad week from becoming a financial event.", step: "Open a separate checking or savings sub-account and auto-transfer a small fixed amount each payday until it holds $500-$1,000.", tool: { name: "What's my next $1,000 move?", url: "/next-1000" }, cross: function () { return NR.links.hysa("buffer"); } },
      DEBT: { target: 100, why: "High-interest debt compounds against you faster than savings compound for you.", step: "List balances, target the highest APR first, and put every spare dollar there while paying minimums on the rest.", tool: { name: "Debt Freedom Calculator", url: "/debt-freedom" }, cross: null },
      RETIREMENT_MATCH: { target: 78, why: "An employer match is a guaranteed, immediate return you can't get anywhere else.", step: "Raise your contribution just enough to capture the full match - check your plan's match formula first.", tool: { name: "Retirement Calculator", url: "/retirement" }, cross: null },
      EMERGENCY: { target: 90, why: "An emergency fund is the difference between a setback and a spiral.", step: "Target 1 month of essentials first, then 3-6. Automate a weekly transfer into a high-yield savings account.", tool: { name: "Emergency Fund Calculator", url: "/emergency-fund" }, cross: function () { return NR.links.hysa("emergency"); } },
      SINKING: { target: 100, why: "Planning for known-but-irregular costs stops them from raiding your emergency base.", step: "List 2-3 predictable irregular costs, divide each by months until due, and set that aside monthly.", tool: { name: "What's my next $1,000 move?", url: "/next-1000" }, cross: null },
      RETIREMENT: { target: 100, why: "Time in the market is the compounding engine at the summit.", step: "Increase your contribution rate by 1% now, and again with every raise.", tool: { name: "Retirement Calculator", url: "/retirement" }, cross: null },
      ACCELERATE: { target: 100, why: "Your foundation is doing its job - now you optimize.", step: "Direct surplus toward bigger goals: taxable investing, extra principal, or a home down payment.", tool: { name: "Home Buying Readiness", url: "/home-buying-readiness" }, cross: function () { return NR.links.kawsah("accelerate"); } }
    },
    /* Rich, app-facing Next Move: base rec + target / distance / step / tool / cross-graph. */
    compute: function (mountain) {
      var z = mountain.scores, a = { debt: mountain.debt, match: mountain.match };
      var rec = NR.nextMove.recommend(z, a);
      var meta = NR.nextMove.META[rec.tag] || NR.nextMove.META.ACCELERATE;
      var zoneScore = rec.zone ? z[rec.zone] : mountain.overall;
      var distance = Math.max(0, meta.target - (zoneScore || 0));
      return {
        tag: rec.tag, zone: rec.zone, title: rec.title, body: rec.body, why: meta.why,
        targetScore: meta.target, currentScore: zoneScore, distance: distance,
        distanceText: distance <= 0 ? "You've reached this checkpoint - keep it there." :
          (distance <= 15 ? "You're close - about " + distance + " points to the next checkpoint." :
            "About " + distance + " points of progress reaches the next checkpoint."),
        step: meta.step, tool: meta.tool, crossGraph: meta.cross ? meta.cross() : null
      };
    }
  };

  /* ------------------------------------------------------------------- STAGE
     The established NorthReserve ladder (from /stages). Do not rename. */
  NR.stage = {
    STAGES: [
      { key: "base-camper",   name: "Base Camper",   min: 0,  max: 29,  color: "#7F77DD", blurb: "At the trailhead. Every climb starts here." },
      { key: "trekker",       name: "Trekker",       min: 30, max: 49,  color: "#BA7517", blurb: "Moving - but a real shock would still sting." },
      { key: "climber",       name: "Climber",       min: 50, max: 69,  color: "#F2B441", blurb: "Foundation forming, one clear obstacle left." },
      { key: "summit-seeker", name: "Summit Seeker", min: 70, max: 84,  color: "#57C7DA", blurb: "Building real, durable resilience." },
      { key: "mountaineer",   name: "Mountaineer",   min: 85, max: 100, color: "#1D6E45", blurb: "Strong from base to summit." }
    ],
    forScore: function (s) { s = +s || 0; var a = NR.stage.STAGES, i; for (i = 0; i < a.length; i++) { if (s <= a[i].max) return a[i]; } return a[a.length - 1]; },
    indexFor: function (s) { var st = NR.stage.forScore(s), i; for (i = 0; i < NR.stage.STAGES.length; i++) if (NR.stage.STAGES[i].key === st.key) return i; return 0; }
  };

  /* --------------------------------------------------------------- RANGE / PEAKS */
  NR.range = {
    PEAKS: [
      { type: "emergency_ready", label: "Emergency Ready", icon: "◈", blurb: "3-6 months of essentials set aside.",
        progress: function (m) { return m.scores.emergency; },
        checkpoint: function (m) { var e = m.scores.emergency; if (e < 38) return "Reach 1 month of essentials"; if (e < 66) return "Reach 2-3 months"; if (e < 90) return "Reach 3-6 months"; return "Fully stocked - maintain it"; },
        tool: { name: "Emergency Fund Calculator", url: "/emergency-fund" }, cross: function () { return NR.links.hysa("peak_emergency"); } },
      { type: "debt_free", label: "Debt Free", icon: "⚬", blurb: "No high-interest balances dragging you back.",
        progress: function (m) { return m.debt === "debt_none" ? 100 : (m.debt === "debt_some" ? 55 : 15); },
        checkpoint: function (m) { return m.debt === "debt_none" ? "Stay debt-free" : (m.debt === "debt_some" ? "Clear the remaining balance" : "Knock out the highest-APR balance first"); },
        tool: { name: "Debt Freedom Calculator", url: "/debt-freedom" }, cross: null },
      { type: "home_ready", label: "Home Ready", icon: "⌂", blurb: "Reserves and stability to buy without becoming house-poor.",
        progress: function (m) { var d = m.debt === "debt_none" ? 100 : (m.debt === "debt_some" ? 55 : 15); return Math.round(0.4 * m.scores.buffer + 0.4 * m.scores.emergency + 0.2 * d); },
        checkpoint: function (m) { return "Build reserves and keep debt low before you buy"; },
        tool: { name: "Home Buying Readiness", url: "/home-buying-readiness" }, cross: function () { return NR.links.kawsah("peak_home"); } },
      { type: "retirement_ready", label: "Retirement Ready", icon: "▲", blurb: "Consistent long-term investing at the summit.",
        progress: function (m) { return m.scores.retirement; },
        checkpoint: function (m) { var r = m.scores.retirement; if (r < 40) return "Start contributing something, consistently"; if (r < 78) return "Capture the full match, then automate increases"; return "Push toward 15%+ of income"; },
        tool: { name: "Retirement Calculator", url: "/retirement" }, cross: null },
      { type: "investment_ready", label: "Investment Ready", icon: "❖", blurb: "A base solid enough to invest beyond the essentials.",
        progress: function (m) { return Math.round(Math.min(m.scores.emergency, m.scores.sinking)); },
        checkpoint: function (m) { return "Fill emergency and sinking before taxable investing"; },
        tool: { name: "What's my next $1,000 move?", url: "/next-1000" }, cross: null },
      { type: "financial_independence", label: "Financial Independence", icon: "✦", blurb: "The whole mountain, strong from base to summit.",
        progress: function (m) { return m.overall; },
        checkpoint: function (m) { return "Keep every reservoir climbing together"; },
        tool: { name: "The 5 Stages (Field Guide)", url: "/stages" }, cross: null }
    ],
    status: function (p) { if (p >= 100) return "complete"; if (p >= 66) return "on-track"; if (p >= 33) return "building"; return "early"; },
    compute: function (m) {
      return NR.range.PEAKS.map(function (peak) {
        var p = NR.util.clamp(Math.round(peak.progress(m)));
        return { type: peak.type, label: peak.label, icon: peak.icon, blurb: peak.blurb, progress: p, status: NR.range.status(p), checkpoint: peak.checkpoint(m), tool: peak.tool, cross: peak.cross ? peak.cross() : null };
      });
    },
    /* The ONE peak a free user sees first = closest-to-done but not complete (momentum). */
    primary: function (m) {
      var all = NR.range.compute(m), open = all.filter(function (x) { return x.progress < 100; });
      open.sort(function (a, b) { return b.progress - a.progress; });
      return open[0] || all[0];
    }
  };

  /* ---------------------------------------------------------------- MILESTONES */
  NR.milestones = {
    CATALOG: [
      { type: "mountain_saved",       label: "Mountain Saved",              test: function (c) { return c.history.length >= 1; } },
      { type: "first_checkin",        label: "First Check-In",              test: function (c) { return c.history.length >= 2; } },
      { type: "buffer_built",         label: "Buffer Built ($1k cushion)",  test: function (c) { return c.m.scores.buffer >= 78; } },
      { type: "emergency_established",label: "Emergency Fund Established",   test: function (c) { return c.m.scores.emergency >= 66; } },
      { type: "emergency_filled",     label: "Emergency Reservoir Filled",  test: function (c) { return c.m.scores.emergency >= 90; } },
      { type: "sinking_funded",       label: "Sinking Funds Set Up",        test: function (c) { return c.m.scores.sinking >= 70; } },
      { type: "debt_cleared",         label: "High-Interest Debt Cleared",  test: function (c) { return c.m.debt === "debt_none"; } },
      { type: "retirement_on_track",  label: "Retirement On Track",         test: function (c) { return c.m.scores.retirement >= 78; } },
      { type: "score_plus_10",        label: "Mountain Score +10",          test: function (c) { return c.gain >= 10; } },
      { type: "stage_up",             label: "Reached a New Stage",         test: function (c) { return c.stageUp; } },
      { type: "first_goal",           label: "First Goal Set",              test: function (c) { return c.goals && c.goals.length >= 1; } }
    ],
    evaluate: function (m, history, goals, existing) {
      existing = existing || [];
      var have = {}; existing.forEach(function (x) { have[x.type] = x; });
      var first = history.length ? history[0] : null;
      var prevOverall = history.length >= 2 ? history[history.length - 2].overall : m.overall;
      var c = { m: m, history: history, goals: goals, gain: first ? (m.overall - first.overall) : 0, stageUp: NR.stage.indexFor(m.overall) > NR.stage.indexFor(prevOverall) };
      var newly = [];
      NR.milestones.CATALOG.forEach(function (def) {
        if (!have[def.type] && def.test(c)) { var ms = { id: NR.util.uid(), type: def.type, label: def.label, achievedAt: NR.util.now() }; have[def.type] = ms; newly.push(ms); }
      });
      var all = Object.keys(have).map(function (k) { return have[k]; });
      return { all: all, newly: newly };
    }
  };

  /* ----------------------------------------------------- STORE (PERSISTENCE SEAM) */
  function lsGet(key, fallback) { try { var r = w.localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; } }
  function lsSet(key, val) { try { w.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }

  var localDriver = {
    name: "local",
    loadMountain: function () { return lsGet(NR.config.storageKeys.mountain, null); },
    saveMountain: function (m) { return lsSet(NR.config.storageKeys.mountain, m); },
    getHistory: function () { return lsGet(NR.config.storageKeys.history, []); },
    setHistory: function (a) { return lsSet(NR.config.storageKeys.history, a); },
    getGoals: function () { return lsGet(NR.config.storageKeys.goals, []); },
    setGoals: function (a) { return lsSet(NR.config.storageKeys.goals, a); },
    getMilestones: function () { return lsGet(NR.config.storageKeys.milestones, []); },
    setMilestones: function (a) { return lsSet(NR.config.storageKeys.milestones, a); },
    getProfile: function () { return lsGet(NR.config.storageKeys.profile, null); },
    setProfile: function (p) { return lsSet(NR.config.storageKeys.profile, p); },
    getSettings: function () { return lsGet(NR.config.storageKeys.settings, {}); },
    setSettings: function (s) { return lsSet(NR.config.storageKeys.settings, s); },
    clearAll: function () { var k = NR.config.storageKeys, n; for (n in k) { try { w.localStorage.removeItem(k[n]); } catch (e) {} } }
  };

  NR.store = {
    driver: localDriver,
    use: function (d) { this.driver = d; },
    /* Backfill any missing derived fields so older nr_mountain blobs are safe. */
    normalize: function (m) {
      if (!m || !m.scores) return m;
      if (m.status == null) { m.status = {}; for (var k in m.scores) m.status[k] = NR.score.statusFor(m.scores[k]); }
      if (m.overall == null) m.overall = NR.score.compute(m.scores, { debt: m.debt, match: m.match });
      if (!m.weakest) m.weakest = NR.score.weakestOf(m.scores);
      if (!m.strongest) m.strongest = NR.score.strongestOf(m.scores);
      if (!m.rec) m.rec = NR.nextMove.recommend(m.scores, { debt: m.debt, match: m.match });
      return m;
    },
    /* ----- required API surface ----- */
    saveMountain: function (m) { return this.driver.saveMountain(m); },
    loadMountain: function () { return this.normalize(this.driver.loadMountain()); },
    getMountainHistory: function () { return this.driver.getHistory(); },
    getMountainRange: function () { var m = this.loadMountain(); return m ? NR.range.compute(m) : []; },
    getNextMove: function () { var m = this.loadMountain(); return m ? NR.nextMove.compute(m) : null; },
    getGoals: function () { return this.driver.getGoals(); },
    saveGoal: function (goal) {
      var g = this.driver.getGoals(), i = -1, x;
      goal.id = goal.id || NR.util.uid(); goal.updatedAt = NR.util.now(); goal.createdAt = goal.createdAt || goal.updatedAt; goal.status = goal.status || "active";
      for (x = 0; x < g.length; x++) { if (g[x].id === goal.id || g[x].type === goal.type) { i = x; break; } }
      if (i >= 0) g[i] = goal; else g.push(goal);
      this.driver.setGoals(g); return goal;
    },
    deleteGoal: function (id) { var g = this.driver.getGoals().filter(function (x) { return x.id !== id && x.type !== id; }); this.driver.setGoals(g); return g; },
    getMilestones: function () { return this.driver.getMilestones(); },
    /* The core write path: save a mountain AND snapshot history + milestones. */
    commit: function (mountain, opts) {
      opts = opts || {};
      this.saveMountain(mountain);
      var history = this.getMountainHistory();
      var prev = history.length ? history[history.length - 1] : null;
      var snap = {
        ts: mountain.ts || NR.util.now(), date: NR.util.fmtDate(mountain.ts || NR.util.now()),
        overall: mountain.overall, scores: mountain.scores, weakest: mountain.weakest,
        stage: NR.stage.forScore(mountain.overall).key,
        nextMoveTag: mountain.rec ? mountain.rec.tag : null, source: opts.source || "checkin"
      };
      // One snapshot per calendar month: update in place within the same month.
      if (prev && NR.util.monthKey(prev.ts) === NR.util.monthKey(snap.ts) && !opts.forceAppend) history[history.length - 1] = snap;
      else history.push(snap);
      this.driver.setHistory(history);
      var ev = NR.milestones.evaluate(mountain, history, this.getGoals(), this.getMilestones());
      this.driver.setMilestones(ev.all);
      return { mountain: mountain, prev: prev, delta: prev ? (mountain.overall - prev.overall) : 0, newMilestones: ev.newly, history: history };
    },
    /* Build a mountain from check-in inputs (scores + mods) and commit it. */
    updateCheckIn: function (inputs) {
      var m = NR.score.build(inputs.scores, { debt: inputs.debt, match: inputs.match, confidence: inputs.confidence });
      NR.account.ensure();
      return this.commit(m, { source: "checkin" });
    },
    /* Adopt the current nr_mountain (written by the assessment) as the saved
       mountain and create the first history snapshot. This is "Save Your Mountain". */
    adoptCurrent: function () {
      var m = this.loadMountain(); if (!m) return null;
      NR.account.ensure();
      return this.commit(m, { source: "saved", forceAppend: this.getMountainHistory().length === 0 });
    },
    hasSavedMountain: function () { return this.getMountainHistory().length > 0; }
  };

  /* --------------------------------------------------------------- ACCOUNT
     Local demo identity. No passwords, no bank linking. Identity = a local
     profile id (+ optional email for later cloud sync). Abstraction is ready for
     real auth: replace get/set/ensure with your provider's session. */
  NR.account = {
    get: function () { return NR.store.driver.getProfile(); },
    set: function (p) { return NR.store.driver.setProfile(p); },
    signedIn: function () { var p = this.get(); return !!(p && p.id); },
    ensure: function () {
      var p = this.get();
      if (!p || !p.id) { p = p || {}; p.id = p.id || NR.util.uid(); p.createdAt = p.createdAt || NR.util.now(); p.membershipStatus = p.membershipStatus || "free"; this.set(p); NR.track("account_created", {}); }
      return p;
    },
    update: function (patch) { var p = this.ensure(), k; for (k in patch) p[k] = patch[k]; p.updatedAt = NR.util.now(); this.set(p); return p; },
    /* Portable climb key (base64 JSON) so a user can move devices before real
       cloud sync exists. NOT encryption — just portability. */
    exportKey: function () {
      var blob = { v: 1, exportedAt: NR.util.now(), profile: this.get(), mountain: NR.store.driver.loadMountain(), history: NR.store.getMountainHistory(), goals: NR.store.getGoals(), milestones: NR.store.getMilestones() };
      try { return btoa(unescape(encodeURIComponent(JSON.stringify(blob)))); } catch (e) { return ""; }
    },
    importKey: function (str) {
      try {
        var blob = JSON.parse(decodeURIComponent(escape(atob(String(str).trim()))));
        if (blob.profile) this.set(blob.profile);
        if (blob.mountain) NR.store.saveMountain(blob.mountain);
        if (blob.history) NR.store.driver.setHistory(blob.history);
        if (blob.goals) NR.store.driver.setGoals(blob.goals);
        if (blob.milestones) NR.store.driver.setMilestones(blob.milestones);
        return true;
      } catch (e) { return false; }
    },
    reset: function () { NR.store.driver.clearAll(); }
  };

  /* --------------------------------------------------------------- MEMBERSHIP
     Payment is ABSTRACTED and MOCKED. No real charge, no secret keys client-side.
     To go live: implement createCheckoutSession() to POST to your server, which
     creates a Stripe Checkout Session (secret key server-side) and returns {url};
     then redirect. Membership status should be set by a Stripe webhook, not here. */
  NR.membership = {
    status: function () { var p = NR.account.get(); return (p && p.membershipStatus === "member") ? "member" : "free"; },
    isMember: function () { return NR.membership.status() === "member"; },
    plan: function () { var p = NR.account.get(); return p ? (p.membershipPlan || null) : null; },
    gated: function (feature) { return !!NR.config.gates[feature] && !NR.membership.isMember(); },
    createCheckoutSession: function (plan) { return Promise.resolve({ mock: true, plan: plan, url: null }); },
    /* DEMO activation only. Production: set by server-side Stripe webhook. */
    start: function (plan) {
      var p = NR.account.ensure();
      p.membershipStatus = "member"; p.membershipPlan = plan; p.membershipSince = NR.util.now(); p.demoMembership = true;
      NR.account.set(p); NR.track("membership_started", { membership_plan: plan });
      return p;
    },
    cancel: function () { var p = NR.account.get(); if (!p) return; p.membershipStatus = "free"; p.membershipPlan = null; p.canceledAt = NR.util.now(); NR.account.set(p); NR.track("membership_cancelled", {}); }
  };

  /* ---------------------------------------------------------------- ANALYTICS
     Privacy-safe. Only whitelisted, non-identifying params pass through.
     Never sends raw dollars, exact values, or email. */
  var ALLOWED = { score_band: 1, stage: 1, zone: 1, goal_type: 1, route: 1, membership_plan: 1, source: 1, calculator: 1, tool: 1, delta_band: 1 };
  NR.track = function (event, params) {
    params = params || {}; var out = {}, k;
    try { if (NR.store && NR.store.driver && NR.store.driver.getSettings && NR.store.driver.getSettings().analyticsOptOut) return; } catch (e) {}
    for (k in params) { if (ALLOWED[k] && params[k] != null) out[k] = params[k]; }
    if (params.score != null && out.score_band == null) out.score_band = NR.util.scoreBand(params.score);
    try { if (w.gtag) w.gtag("event", event, out); } catch (e) {}
    try { (w.dataLayer = w.dataLayer || []).push((function () { var o = { event: event }, j; for (j in out) o[j] = out[j]; return o; })()); } catch (e) {}
  };

  /* ------------------------------------------------------------------- WEBMCP
     Read-only, privacy-safe tools exposed to an on-page agent. Mirrors the
     existing navigator.modelContext.registerTool pattern (calc-network.js).
     NO personal identifiers are ever returned. */
  NR.mcp = {
    registered: false,
    _reg: function (def) { try { if (w.navigator && w.navigator.modelContext && w.navigator.modelContext.registerTool) { w.navigator.modelContext.registerTool(def); return true; } } catch (e) {} return false; },
    _text: function (obj) { return { content: [{ type: "text", text: (typeof obj === "string" ? obj : JSON.stringify(obj)) }] }; },
    register: function () {
      if (this.registered) return false;
      var T = this, mt = function () { return NR.store.loadMountain(); }, ok = false;
      ok = T._reg({ name: "northreserve_getMountainScore", description: "Current NorthReserve Mountain Score (0-100) and stage for the saved mountain on this device. No personal identifiers.", inputSchema: { type: "object", properties: {} }, execute: function () { var d = mt(); if (!d) return T._text("No saved mountain on this device yet."); return T._text({ score: d.overall, stage: NR.stage.forScore(d.overall).name, band: NR.util.scoreBand(d.overall) }); } }) || ok;
      ok = T._reg({ name: "northreserve_getMountainStage", description: "Current stage name, range and blurb for the saved mountain.", inputSchema: { type: "object", properties: {} }, execute: function () { var d = mt(); if (!d) return T._text("No saved mountain yet."); var s = NR.stage.forScore(d.overall); return T._text({ stage: s.name, range: s.min + "-" + s.max, blurb: s.blurb }); } }) || ok;
      ok = T._reg({ name: "northreserve_getNextMove", description: "The single recommended Next Move for the saved mountain.", inputSchema: { type: "object", properties: {} }, execute: function () { var d = mt(); if (!d) return T._text("No saved mountain yet."); var nm = NR.nextMove.compute(d); return T._text({ title: nm.title, why: nm.why, zone: nm.zone, step: nm.step, tool: nm.tool }); } }) || ok;
      ok = T._reg({ name: "northreserve_getReservoirStatus", description: "Per-reservoir 0-100 scores and status labels (buffer, emergency, sinking, retirement).", inputSchema: { type: "object", properties: {} }, execute: function () { var d = mt(); if (!d) return T._text("No saved mountain yet."); var out = {}, k; for (k in d.scores) out[k] = { score: d.scores[k], status: NR.score.statusFor(d.scores[k]).label }; return T._text(out); } }) || ok;
      ok = T._reg({ name: "northreserve_getMountainProgress", description: "Progress summary: number of check-ins, first vs current score, and trend. Bands only.", inputSchema: { type: "object", properties: {} }, execute: function () { var h = NR.store.getMountainHistory(); if (!h.length) return T._text("No check-ins yet."); var first = h[0].overall, last = h[h.length - 1].overall; return T._text({ checkins: h.length, first_band: NR.util.scoreBand(first), current_band: NR.util.scoreBand(last), trend: last > first ? "climbing" : (last < first ? "declining" : "steady") }); } }) || ok;
      this.registered = ok; return ok;
    }
  };

  /* register WebMCP tools once, guarded */
  try { NR.mcp.register(); } catch (e) {}

})(typeof window !== "undefined" ? window : this);

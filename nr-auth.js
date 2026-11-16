/* =============================================================================
   nr-auth.js  ·  Passwordless (magic-link) sign-in for NorthReserve Mountain.
   Depends on nr-core.js + nr-store-supabase.js. No passwords, no bank linking —
   a sign-in link is emailed; clicking it returns the user to /account signed in.
   When Supabase isn't configured, renderCard() returns "" and the account page
   behaves exactly as the local-only version.
   ============================================================================= */
(function (w, d) {
  "use strict";
  var NR = w.NR; if (!NR) return;

  NR.auth = {
    enabled: function () { return !!(NR.sync && NR.sync.enabled); },
    user: function () { return NR.sync && NR.sync.user; },

    signIn: function (email) {
      if (!NR.auth.enabled()) return Promise.resolve({ error: { message: "sync_not_configured" } });
      return NR.sync.client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: w.location.origin + NR.config.routes.account }
      });
    },

    signOut: function () {
      try { sessionStorage.removeItem("nr_sync_reloaded"); } catch (e) {}
      if (!NR.auth.enabled()) return Promise.resolve();
      return NR.sync.client.auth.signOut();
    },

    // HTML for the account page's sync section. "" when sync is off.
    renderCard: function () {
      if (!NR.auth.enabled()) return "";
      var u = NR.auth.user();
      if (u) {
        return '<div class="nr-card nr-section" id="nrAuthCard"><div class="nr-head-row"><h2 style="margin:0">Cross-device sync</h2>' +
          '<span class="nr-badge on-track">Synced</span></div>' +
          '<p style="margin:10px 0 0;font-size:14px">Signed in as <b class="snow">' + NR.ui.esc(u.email || "your account") + '</b>. Your Mountain is saved to your account and follows you to any device.</p>' +
          '<div class="nr-btn-row"><button class="nr-btn ghost sm" id="nrSignOutBtn">Sign out</button></div></div>';
      }
      return '<div class="nr-card gold nr-section" id="nrAuthCard"><div class="k">Save across devices</div>' +
        '<h2 style="margin:2px 0 6px">Keep your Mountain on every device</h2>' +
        '<p style="margin:0 0 14px;font-size:14px">Enter your email and we’ll send a one-tap sign-in link — no password. Your climb then syncs to your phone, laptop, anywhere.</p>' +
        '<div class="nr-field" style="margin:0"><label class="nr-label" for="nrSignInEmail">Email</label>' +
        '<input class="nr-input" id="nrSignInEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>' +
        '<div class="nr-btn-row"><button class="nr-btn" id="nrSignInBtn">Email me a sign-in link</button></div>' +
        '<div class="nr-privacy"><span class="s">◈</span> Passwordless. No bank linking. We only use your email to sign you in.</div></div>';
    },

    // Wire the card's buttons. Call after inserting renderCard() into the DOM.
    bind: function () {
      var inBtn = d.getElementById("nrSignInBtn");
      if (inBtn) inBtn.addEventListener("click", function () {
        var el = d.getElementById("nrSignInEmail"), email = el ? el.value.trim() : "";
        if (!email || email.indexOf("@") === -1) { NR.ui.toast("Enter a valid email."); return; }
        inBtn.disabled = true; inBtn.textContent = "Sending…";
        NR.auth.signIn(email).then(function (r) {
          if (r && r.error) { NR.ui.toast("Couldn’t send the link. Try again."); inBtn.disabled = false; inBtn.textContent = "Email me a sign-in link"; return; }
          NR.track("account_signin_requested", {});
          var card = d.getElementById("nrAuthCard");
          if (card) card.innerHTML = '<div class="k gold">Check your email</div><h2 style="margin:2px 0 6px">Your sign-in link is on its way</h2><p style="margin:0;font-size:14px">Open the email on this device (or any device) and tap the link to sign in and sync your Mountain.</p>';
        });
      });
      var outBtn = d.getElementById("nrSignOutBtn");
      if (outBtn) outBtn.addEventListener("click", function () {
        NR.auth.signOut().then(function () { NR.ui.toast("Signed out."); w.location.reload(); });
      });
    }
  };
})(window, document);

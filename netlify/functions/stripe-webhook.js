/* Netlify Function: Stripe webhook. The ONLY thing that grants/revokes membership.
   Verifies the Stripe signature, then updates the user's profile in Supabase using
   the SERVICE ROLE key (bypasses RLS). Point your Stripe webhook at:
     https://YOUR-SITE/.netlify/functions/stripe-webhook
   Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
   Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers["stripe-signature"];
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("[webhook] SIGNATURE verification FAILED: " + e.message + " — STRIPE_WEBHOOK_SECRET likely wrong or from the other mode (test vs live)");
    return { statusCode: 400, body: "Webhook signature verification failed: " + e.message };
  }

  // The Supabase URL is PUBLIC (not a secret). Prefer the env var; fall back to
  // the project URL so a misnamed/missing env var cannot break the webhook.
  // Resolve a VALID Supabase URL no matter how SUPABASE_URL was entered:
  //   full URL -> use it; bare project ref -> build it; empty/garbage -> fallback.
  const _rawUrl = (process.env.SUPABASE_URL || "").trim();
  const SUPABASE_URL = /^https?:\/\//i.test(_rawUrl) ? _rawUrl
    : /^[a-z0-9]{12,}$/i.test(_rawUrl) ? ("https://" + _rawUrl + ".supabase.co")
    : "https://jypszrlequrmjlipkgvm.supabase.co";
  const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const uid = (o) => (o.metadata && o.metadata.supabase_user_id) || o.client_reference_id || null;
  const planOf = (sub) => {
    try { return sub.items.data[0].price.recurring.interval === "year" ? "annual" : "monthly"; } catch (e) { return null; }
  };
  async function setMembership(userId, status, plan, customerId, subId) {
    if (!userId) { console.warn("[webhook] NO supabase_user_id on event — cannot map to a profile. Was this checkout created by the app?"); return; }
    const r = await supa.from("profiles").update({
      membership_status: status,
      membership_plan: plan || null,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subId || null
    }).eq("id", userId).select();
    const rows = (r && r.data && r.data.length) || 0;
    console.log("[webhook] membership -> " + status + " plan=" + (plan || "-") + " rowsUpdated=" + rows + (r && r.error ? " ERROR=" + r.error.message : ""));
    if (rows === 0 && !(r && r.error)) console.warn("[webhook] rowsUpdated=0 — SUPABASE_SERVICE_ROLE_KEY is probably NOT the secret/service_role key (RLS blocked the write), or no profile row exists for this user id.");
  }

  try {
    const o = evt.data.object;
    console.log("[webhook] received event=" + evt.type);
    switch (evt.type) {
      case "checkout.session.completed":
        await setMembership(uid(o), "member", (o.metadata && o.metadata.plan) || null, o.customer, o.subscription);
        break;
      case "customer.subscription.updated": {
        const active = o.status === "active" || o.status === "trialing";
        await setMembership(uid(o), active ? "member" : "free", planOf(o), o.customer, o.id);
        break;
      }
      case "customer.subscription.deleted":
        await setMembership(uid(o), "free", null, o.customer, o.id);
        break;
      default:
        break;
    }
  } catch (e) {
    return { statusCode: 500, body: "handler_error: " + e.message };
  }
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

/* Netlify Function: create a Stripe Checkout Session for a membership plan.
   POST { plan:'monthly'|'annual', email, userId, origin } -> { url }
   Secrets come from Netlify env vars — never from the client.
   Required env: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL */
const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: "stripe_not_configured" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}

  const plan = body.plan === "annual" ? "annual" : "monthly";
  const price = plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) return json(500, { error: "price_not_configured" });

  const origin = body.origin || process.env.URL || "https://northreserve.org";
  // Free trial: OFF unless STRIPE_TRIAL_DAYS is set (keep NR.config.pricing.trialDays in sync for copy).
  const trialDays = Math.max(0, Math.min(31, parseInt(process.env.STRIPE_TRIAL_DAYS || "0", 10) || 0));
  const keyMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "live"
                : (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test") ? "test" : "unknown";

  try {
    // Reuse a customer by email so repeat checkouts don't create duplicates.
    let customerId;
    if (body.email) {
      const existing = await stripe.customers.list({ email: body.email, limit: 1 });
      customerId = existing.data[0]
        ? existing.data[0].id
        : (await stripe.customers.create({ email: body.email, metadata: { supabase_user_id: body.userId || "" } })).id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Stripe "Managed Payments" (on by default on this account) requires a
      // product tax_code. We disable it per-session so checkout works without
      // per-product tax codes. To let Stripe manage tax instead, set a tax_code
      // on the product in the Dashboard and DELETE the next line.
      managed_payments: { enabled: false },
      customer: customerId,
      line_items: [{ price: price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: origin + "/app?welcome=1",
      cancel_url: origin + "/membership",
      client_reference_id: body.userId || undefined,
      metadata: { supabase_user_id: body.userId || "", plan: plan },
      subscription_data: Object.assign({ metadata: { supabase_user_id: body.userId || "", plan: plan } }, trialDays > 0 ? { trial_period_days: trialDays } : {})
    });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("[checkout] STRIPE ERROR type=" + (e && e.type) + " code=" + (e && e.code) + " msg=" + (e && e.message) + " | priceId=" + price + " keyMode=" + keyMode);
    return json(500, { error: e.message, code: e && e.code });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

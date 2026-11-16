# NorthReserve Mountain — Stripe + Backend Setup (step by step)

This turns the scaffolded membership into **real, paid, cross-device** memberships. It assumes you already have a Stripe account (so account creation is skipped) and that the app files from this build are deployed on Netlify.

**What you'll have at the end:** a user signs in with a magic link → clicks "Start climbing" → pays in Stripe → a Stripe webhook flips their membership to `member` in Supabase → their app unlocks on every device.

**Order matters.** Do Part 1 (Supabase) before Part 4 (webhook), because the webhook writes into Supabase.

> ⚠️ **One thing people get wrong:** the price shown in the app ($7.99 / $79) is set in `nr-core.js` (`NR.config.pricing`). The price actually **charged** is whatever your Stripe **Price** is. If they don't match, customers see one number and get billed another. Keep them in sync (Part 7).

---

## Part 1 — Supabase (the database + accounts the webhook writes to)

1. Go to **supabase.com → New project**. Pick a name (e.g. `northreserve`), a strong DB password (save it), and a region near your users. Wait ~2 min for it to provision.
2. Open **SQL Editor → New query**. Paste the entire contents of `supabase-schema.sql` (in your repo) and click **Run**. You should see "Success." This creates `profiles`, `mountain_state`, `checkins`, the security rules, and the retention view.
3. Open **Project Settings → API**. Copy three values:
   - **Project URL** → this is your `SUPABASE_URL` (also the client `supabaseUrl`). Public.
   - **anon / public key** → your `supabaseAnonKey`. Public (safe in the browser — RLS protects the data).
   - **service_role key** → your `SUPABASE_SERVICE_ROLE_KEY`. **SECRET.** Server-only. Never put this in the website or `nr-config.js`.
4. Open **Authentication → Providers → Email** and make sure **Email** is enabled. Turn **ON** "Enable email provider" and leave "Confirm email" on (magic links handle this). You do **not** need passwords.
5. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://northreserve.org`
   - **Redirect URLs:** add `https://northreserve.org/account` and, for local testing, `http://localhost:8888/account`.
   - Save.

> Magic-link emails come from Supabase's default sender while testing. Before launch, set up a custom SMTP sender (Authentication → Emails) so links come from your domain and don't land in spam.

---

## Part 2 — Fill in the client config

1. Open `nr-config.js` in your repo and paste your **public** Supabase values:
   ```js
   window.NR_CONFIG = {
     supabaseUrl:     "https://YOURPROJECT.supabase.co",
     supabaseAnonKey: "eyJ...your anon key...",
     apiBase: "/.netlify/functions"
   };
   ```
2. That's all that goes in the browser. Secrets stay in Netlify (Part 6).

> Until you do this step, the whole app keeps running in local-only mode (no accounts, no payments) — nothing breaks.

---

## Part 3 — Create the membership product + prices in Stripe

Work in **Test mode** first (toggle top-right of the Stripe dashboard says "Test mode").

1. **Products → Product catalog → + Add product.**
2. **Name:** `NorthReserve Mountain Membership`. **Description:** `Save your Mountain, check in monthly, and track your climb.` (Optional: add your icon as the image.)
3. Under **Pricing**, add the **monthly** price:
   - **Pricing model:** Recurring.
   - **Amount:** `7.99` **USD**, **Billing period:** Monthly.
   - Click **Add price** / save.
4. Add a **second** price to the **same product** (Product page → **+ Add another price**):
   - Recurring, **Amount:** `79.00` **USD**, **Billing period:** Yearly.
5. On the product page you now have two prices. Click each and copy its **Price ID** (looks like `price_1Q...`):
   - Monthly price ID → you'll set this as `STRIPE_PRICE_MONTHLY`.
   - Annual price ID → `STRIPE_PRICE_ANNUAL`.
   - (A Price ID starts with `price_`. The Product ID `prod_` is not what the code needs.)
6. Get your secret key: **Developers → API keys → Secret key** (test). Copy it → `STRIPE_SECRET_KEY`. Starts with `sk_test_` in test mode.

---

## Part 4 — Create the Stripe webhook

1. **Developers → Webhooks → + Add endpoint.**
2. **Endpoint URL:** `https://northreserve.org/.netlify/functions/stripe-webhook`
3. **Events to send** → **Select events**, add exactly these three:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Add endpoint**, then on the endpoint page click **Reveal** under **Signing secret**. Copy it → `STRIPE_WEBHOOK_SECRET`. Starts with `whsec_`.

---

## Part 5 — Turn on the Customer Portal (so members can cancel/manage)

1. **Settings → Billing → Customer portal.**
2. Toggle it **Active**. Allow customers to **cancel subscriptions** and **update payment methods**.
3. Save. When a member cancels there, Stripe fires `customer.subscription.deleted`, and the webhook sets them back to `free` automatically.

> (Optional, later) You can add a "Manage billing" button in `/account` that opens the portal via a small `create-portal-session` function. Not required to launch.

---

## Part 6 — Set the server secrets in Netlify

**Netlify → your site → Site configuration → Environment variables → Add a variable** (add each, scope = all):

| Variable | Value | Secret? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | 🔒 yes |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | 🔒 yes |
| `STRIPE_PRICE_MONTHLY` | `price_...` (the $7.99/mo price) | no |
| `STRIPE_PRICE_ANNUAL` | `price_...` (the $79/yr price) | no |
| `SUPABASE_URL` | `https://YOURPROJECT.supabase.co` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from Part 1 | 🔒 yes |

Netlify auto-provides `URL` (your site URL) for the success/cancel redirects — you don't set it.

Then **redeploy** (Deploys → Trigger deploy → Deploy site) so the functions pick up the new env vars and install their dependencies (`stripe`, `@supabase/supabase-js` from `netlify/functions/package.json`).

---

## Part 7 — Keep the displayed price in sync with Stripe

If you charge something other than $7.99 / $79, change **both**:
- **What's shown:** `NR.config.pricing` in `nr-core.js` (`monthly`, `annual`).
- **What's charged:** the Stripe Price amounts (make new Prices — Stripe prices are immutable; you create a new one and swap the env var).

---

## Part 8 — Test the whole flow (test mode)

1. Open your site → `/account` → enter your email → **Email me a sign-in link** → open the email → you land on `/account` **signed in** ("Synced").
2. Go to `/membership` → **Start climbing** (annual).
3. On Stripe Checkout, pay with the test card **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP.
4. You're redirected to `/app?welcome=1`. Within a few seconds the webhook runs and your `/app` shows **Member**, `/app/range` shows all peaks, `/app/progress` shows full history.
5. Verify server-side: Supabase → **Table editor → profiles** → your row shows `membership_status = member`.
6. Test cancel: Stripe test customer → Customer portal (or Stripe dashboard → Customers → cancel the subscription) → within seconds your profile flips back to `free` and the app re-locks.
7. (Optional) Watch webhooks live with the Stripe CLI: `stripe listen --forward-to https://northreserve.org/.netlify/functions/stripe-webhook` and `stripe trigger checkout.session.completed`.

---

## Part 9 — Go live

1. Flip Stripe to **Live mode** (top-right toggle).
2. Recreate the **Product + two Prices** in live mode (or use "Copy to live mode" on the product). Copy the **live** Price IDs.
3. **Developers → API keys** → copy the **live** secret key (`sk_live_...`).
4. Create a **live webhook** endpoint (same URL, same 3 events) → copy its **live** signing secret.
5. In Netlify, swap the four Stripe env vars to their **live** values (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`). Redeploy.
6. Do one real purchase with a real card, confirm it flips to `member`, then refund it from the Stripe dashboard if it was just a test.
7. Remove the "Live billing isn't connected yet / preview" line from `/membership` once real (it's the `<p class="muted">…preview…</p>` near the bottom of `membership.html`, and the member-view preview note).

---

## Part 10 — Reading your actual hypothesis: do people come back?

In Supabase → **SQL Editor**, run:

```sql
-- % of people who saved a mountain and came back in a LATER month
select round(100.0 * avg(case when returned then 1 else 0 end), 1) as pct_returned,
       count(*) as total_users
from public.nr_retention;

-- monthly active users (distinct people who checked in each month)
select month, count(distinct user_id) as active_users
from public.checkins
group by month order by month;
```

`pct_returned` is the number that proves or kills the hypothesis. Watch it over your first 60–90 days.

---

## Troubleshooting

- **Checkout button does nothing / "Couldn't start checkout":** functions can't reach Stripe. Check `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are set and you redeployed. Check **Netlify → Functions → logs**.
- **Paid but still shows Free:** the webhook didn't land. Stripe → Webhooks → your endpoint → check recent deliveries for errors. A `400 signature` means `STRIPE_WEBHOOK_SECRET` is wrong/mismatched (test vs live). A `500` means `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` is wrong.
- **"Sign in to start your membership" loop:** you're not signed in. Magic-link sign-in (Part 8 step 1) must happen before checkout so the subscription attaches to your account.
- **Magic-link email never arrives:** check spam; confirm Email provider is enabled and the Redirect URL matches exactly (Part 1 steps 4–5).

---

## Security checklist

- ✅ `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` are **only** in Netlify env vars, never in the repo or `nr-config.js`.
- ✅ The browser can't self-grant membership: the `profiles_guard` trigger (in the schema) blocks any client change to `membership_status`; only the webhook (service role) can.
- ✅ Webhook verifies the Stripe signature before trusting anything.
- ✅ Row-Level Security means each user reads/writes only their own data.
- ⚠️ Add custom SMTP before launch so magic links come from your domain.

---

## Free trial & money-back guarantee (added)

- **Money-back guarantee (ON now):** `/membership` and the upgrade gates show a "{N}-day money-back guarantee" where N = `NR.config.guaranteeDays` (default 30) in `nr-core.js`. It is copy + your operational promise — honor refunds in Stripe (Payments → the charge → Refund). Change the window by editing `guaranteeDays`.
- **Free trial (OFF by default):** to offer a card-required free trial, set BOTH, kept in sync:
  1. Netlify env var `STRIPE_TRIAL_DAYS = <days>` (e.g. 14) — Stripe collects the card but doesn't charge until the trial ends. Redeploy.
  2. `NR.config.pricing.trialDays = <same number>` in `nr-core.js` — flips the membership CTAs to "Start N-day free trial". Redeploy.
  Set both back to `0` / unset to turn it off.
- **Recommendation:** leave the trial off until you have a paid-conversion baseline; lead with the money-back guarantee (lower friction, still a real "they paid" signal).

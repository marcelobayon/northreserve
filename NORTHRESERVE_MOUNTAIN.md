# NorthReserve Mountain — Implementation Report

**Date:** 2026-10-04
**Scope:** Added a persistent, installable **application layer** on top of the existing NorthReserve static site. Nothing was rebuilt. The Mountain, assessment, calculators, guides, AR viewer, WebMCP, analytics, and affiliate architecture are untouched except for three surgical funnel edits.

**Two locked decisions (confirmed with you before building):**
1. **4-zone model kept as-is** — Buffer / Emergency / Sinking / Retirement, retirement at the **summit**, buffer at the **base**. No 5-zone migration. The app consumes the existing `nr_mountain` contract unchanged.
2. **Tracking unit = 0–100 zone score.** Dollars stay as guidance copy only. No dollar engine, no bank linking.

---

## 1. Summary of what changed

**New (17 files):** `nr-core.js`, `nr-ui.js`, `nr-app.css`, `app.html`, `app-check-in.html`, `app-progress.html`, `app-next-move.html`, `app-range.html`, `app-settings.html`, `account.html`, `membership.html`, `manifest.webmanifest`, `sw.js`, `app-offline.html`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

**Edited (4 files, surgically):**
- `_redirects` — appended 8 clean-URL rewrites for the app layer.
- `assessment-continue.js` — the assessment result's primary CTA now reads **"Save your Mountain → /app"** (was "the app is coming / waitlist").
- `mountain.html` — the viewer's secondary CTA now reads **"Save your Mountain → /app"** for a real mountain (was "join the early-access waitlist"). Hidden in `?embed=1` mode, so it won't appear inside the dashboard's embedded mountain.
- `index.html` — added a small "Already have your Mountain? Open the app →" link under the hero.

**Architecture:** business logic (`nr-core.js`) is fully separated from UI (`nr-ui.js` + pages). All persistence goes through `NR.store.driver.*` — one seam to swap localStorage for Firebase/Supabase later. The app is a multi-page static site (same pattern as the rest of NorthReserve), so SEO pages stay static and the app pages are just more static HTML that happen to be `noindex`.

**Verification done:** `node --check` on every script; a 13-scenario headless-Chromium smoke test (member/free/unsaved/empty across all pages) — **13/13 passed, zero JS errors**; a logic harness confirming scoring parity with the assessment formula, save→check-in→history→milestones→range, monthly snapshot collapsing, membership gating, and export/import roundtrip.

---

## 2. New routes (clean URLs via `_redirects`)

| Route | File | Index? |
|---|---|---|
| `/app` | `app.html` | noindex — dashboard |
| `/app/check-in` | `app-check-in.html` | noindex |
| `/app/progress` | `app-progress.html` | noindex |
| `/app/next-move` | `app-next-move.html` | noindex |
| `/app/range` | `app-range.html` | noindex |
| `/app/settings` | `app-settings.html` | noindex |
| `/account` | `account.html` | noindex |
| `/membership` | `membership.html` | **indexable** (marketing) |

`/mountain` (the 3D/AR viewer) is **unchanged** and stays the free acquisition/delight feature. The dashboard embeds it via `/mountain?embed=1&b=&e=&s=&r=&...` so there's one mountain renderer, not two.

---

## 3. New modules / components

- **`nr-core.js`** — the data + logic layer (`window.NR`): `config`, `util`, `score`, `nextMove`, `links`, `stage`, `range`, `milestones`, `store`, `account`, `membership`, `track`, `mcp`.
- **`nr-ui.js`** — shared chrome: top nav + mobile bottom nav, score ring (SVG), reservoir bars, stage pill, delta badge, cross-graph card, gate overlay, toast, PWA install handling, page boot (`NR.ui.boot`).
- **`nr-app.css`** — the app design system, reusing your brand tokens (Basalt/Glacier/Gold, Clash Display/Satoshi/JetBrains Mono).
- Pages are thin: each calls `NR.ui.boot()` and renders from `NR.store` + `NR.ui`.

---

## 4. Data model (localStorage keys, all behind `NR.store`)

- **`nr_mountain`** *(existing, unchanged shape)* — current mountain: `{v, ts, scores{buffer,emergency,sinking,retirement}, overall, weakest, strongest, status, confidence, debt, match, rec}`. Written by the assessment and by check-ins; read by the viewer and the app.
- **`nr_profile`** — `{id, createdAt, displayName?, email?, membershipStatus, membershipPlan?, membershipSince?}`. No password. `id` is a random local id.
- **`nr_history`** — array of snapshots: `{ts, date, overall, scores, weakest, stage, nextMoveTag, source}`. **One snapshot per calendar month** (same-month check-ins update in place).
- **`nr_goals`** — pinned Mountain Range peaks: `{id, type, label, status, createdAt, updatedAt}`.
- **`nr_milestones`** — `{id, type, label, achievedAt}`.
- **`nr_settings`** — `{analyticsOptOut?}`.

**Persistence API (the swap-later seam):** `saveMountain`, `loadMountain`, `updateCheckIn(inputs)`, `getMountainHistory`, `getNextMove`, `getMountainRange`, `getGoals`, `saveGoal`, `deleteGoal`, `getMilestones`, plus `commit()` and `adoptCurrent()`. Implement the same method surface in a `firebase`/`supabase` driver and call `NR.store.use(driver)` — no page or UI code changes.

---

## 5. Membership architecture

- **Pricing lives in ONE place:** `NR.config.pricing = { monthly: 7.99, annual: 79, ... }` with derived `annualPerMonth()` ($6.58) and `annualSavingsPct()` (18%). Change it there, it changes everywhere.
- **Free vs member boundary** is config (`NR.config.gates`), so you can move the paywall without touching UI:
  - **Free:** take the assessment, see + **save** your Mountain, **monthly check-in**, your **one Next Move**, all calculators/guides, the AR mountain, and the latest "your Mountain moved" delta.
  - **Member:** full **Mountain Score history** (climb line + timeline), the full **Mountain Range** of goals, the **milestone archive**, the **Monthly Report**, and saved tool setups.
- **Payment is abstracted and mocked:** `NR.membership.createCheckoutSession(plan)` / `getMembershipStatus()` / `start(plan)` / `cancel()`. The CTA calls `createCheckoutSession`; if it returns a `url` it redirects (real Stripe later), otherwise it activates a clearly-labeled **preview** locally. The membership page says in plain text that live billing isn't connected yet.

---

## 6. Analytics events added (GA4 `G-0Z24386PQN`, privacy-safe)

Routed through `NR.track(event, params)`, which **whitelists** params and sends **bands/labels only** — never raw dollars, exact values, or email. Honors the Settings opt-out.

`app_view`, `mountain_saved`, `account_created`, `checkin_started`, `checkin_completed`, `next_move_viewed`, `progress_viewed`, `range_viewed`, `goal_created`, `goal_completed`, `membership_viewed`, `membership_checkout_started`, `membership_started`, `membership_cancelled`, `cross_graph_route_clicked`, `pwa_install`, plus `mountain_save_click` on the assessment result and viewer CTAs.

Allowed params: `score_band`, `stage`, `zone`, `goal_type`, `route`, `membership_plan`, `source`, `calculator`, `tool`, `delta_band`. (Raw `score` passed in is auto-converted to `score_band`.)

---

## 7. WebMCP changes

Your existing `navigator.modelContext.registerTool` implementation (calc-network.js, funnel.js, calculators) is **untouched**. `nr-core.js` adds **read-only, PII-free** app tools, registered with the same guarded pattern: `northreserve_getMountainScore`, `northreserve_getMountainStage`, `northreserve_getNextMove`, `northreserve_getReservoirStatus`, `northreserve_getMountainProgress`. They return scores/bands/labels only — no email, no profile id.

---

## 8. PWA changes

- `manifest.webmanifest` — `name`, `short_name`, `start_url:/app`, `scope:/`, `display:standalone`, theme/background `#0A2A2E`, maskable + any-purpose icons, app shortcuts (Check-In / Progress / Range).
- `sw.js` — **network-first for navigations** (so marketing/SEO pages are never served stale), **stale-while-revalidate** for our own shell assets, offline fallback to `app-offline.html`. Third-party (GA, three.js CDNs) is passed straight through and never cached. Registered **only from app pages** (marketing pages never register it).
- Icons generated from your 1024px brand icon: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- Installable from the browser; "Install" button in Settings; iOS fallback instructions shown.

---

## 9. Dependencies added

**None at runtime.** No frameworks, no build step, no npm. Pure vanilla JS/CSS/HTML, same as the rest of the site. (Pillow was used once, server-side, only to generate the icon PNGs.)

---

## 10. Environment variables required

**None for the current build** — it's fully static. When you wire real Stripe (see §13), the secret config lives in a serverless function (Netlify Functions), not the static site: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and your Price IDs. Never put these in client JS.

---

## 11. What is MOCKED vs production-ready

**Production-ready (real, works today):**
- The whole free experience: assessment handoff, save, monthly check-in, scoring, Next Move, reservoirs, stages, Mountain Range computation, milestones, progress chart + in-app monthly report.
- Local persistence, export/import "climb key", analytics, WebMCP, PWA install/offline.

**Mocked / demo (clearly labeled):**
- **Accounts** — local profile only, no real auth, no server, no cross-device sync. A localStorage account lives in one browser.
- **Payments** — no real charge. "Start" activates a local preview flag. No Stripe wired.
- **Monthly Report email** — the in-app report is real; email delivery is not built (data is structured so it can be added — see §13).

---

## 12. Security concerns

- **No secrets in client code.** None exist yet; when Stripe is added, keys stay server-side.
- **No bank linking, no account numbers, no passwords** — by design.
- **localStorage is per-browser and not encrypted.** The "climb key" is base64, *not* encryption — it's portability, not security. Don't treat it as a secret.
- **Demo membership is client-side** and trivially flippable in devtools. That's fine for a preview; real entitlement must be set server-side by a Stripe webhook before anything of value is gated for money.
- WebMCP tools are read-only and return no PII.

---

## 13. Remaining work before accepting real payments

1. **Stand up a backend** (Netlify Functions is simplest here): `POST /create-checkout-session` (creates a Stripe Checkout Session server-side, returns `{url}`), and a **Stripe webhook** that sets membership entitlement.
2. **Real identity** — add auth (Supabase/Firebase Auth or Stripe customer email). Membership status must be read from the server, not localStorage.
3. **Point `NR.membership.createCheckoutSession`** at that function (it already redirects when a `url` comes back) and set membership from the webhook, not `start()`.
4. **Move persistence to the server** via a new `NR.store` driver (same method surface) so a paid mountain survives a cleared browser or a new device. **This is the one that actually matters for your retention hypothesis** — a localStorage mountain can't prove "people come back monthly" because it vanishes when they switch devices.
5. **Monthly Report email** — a scheduled function reads `nr_history` (server-side once persisted) and emails the "your Mountain moved" summary.
6. Remove the "preview / billing not live" notes on `/membership` once real.

---

## 14. Testing locally

From the site root (the folder with `index.html`):

```bash
# any static server works; clean URLs need the _redirects rules, which Netlify applies.
# simplest full-fidelity local test:
npx netlify-cli dev      # serves with _redirects + clean URLs at http://localhost:8888

# or a plain server (clean URLs like /app won't rewrite — open /app.html directly):
python3 -m http.server 8080
```

Then:
1. Open `/assessment`, complete it → you land on the result with **"Save your Mountain → /app"**.
2. Open `/app` → **Save my Mountain** → dashboard fills in (score, stage, embedded mountain, Next Move, reservoirs, Range).
3. `/app/check-in` → change a few answers → **Update my Mountain** → "your Mountain moved" with the delta.
4. `/app/progress` → climb chart + reservoir changes + milestones (free shows last 2 points + a gate; member shows all).
5. `/membership` → **Start climbing** → preview activates → `/app/range` now shows all peaks.
6. Install: desktop Chrome address-bar install icon, or Settings → Install. Toggle offline → app shell still loads.

Reset anytime: `/account` → **Erase my data**.

---

## 15. Deploying to Netlify

No build step. Deploy the folder as-is.

- **Drag-and-drop / Git:** publish the site root. `_redirects` is already in the root and carries both the original rewrites and the new `/app/*` ones — Netlify picks it up automatically.
- **Build settings:** none needed (publish directory = site root, build command = empty).
- **Verify after deploy:** `/app`, `/app/check-in`, `/membership` resolve as clean URLs; `/manifest.webmanifest` and `/sw.js` return 200; Lighthouse → PWA installable.
- **Service worker note:** `sw.js` is versioned (`nr-mountain-v1`). When you change cached assets, bump the cache name so clients refresh.
- **SEO:** app pages are `noindex`; `/membership` is indexable; all existing pages and metadata are unchanged.

---

## Known follow-ups (housekeeping, not blockers)

- The canonical scoring formula now lives in **three** places (`assessment.html`, `mountain.html`, `nr-core.js`). They match today. Best next refactor: have the assessment and viewer import `NR.score.compute` so there's a single source of truth.
- `links.js` still has `APPLY_URL = "https://PASTE-YOUR-START-APPLICATION-LINK"` (pre-existing). The app's cross-graph routes use the brand links (Kawsah/Mitig8) and the HYSA affiliate, which are configured; the mortgage Apply link is still a placeholder.

---

# ADDENDUM — Backend, payments & sync scaffold (2026-10-05)

This builds the piece that actually tests the hypothesis: **cross-device persistence** so "did they come back next month?" can be measured, plus real Stripe membership. It also fixes the `/app` membership-teaser clipping bug.

## New files
- `supabase-schema.sql` — DB schema: `profiles`, `mountain_state` (synced blob), `checkins` (retention source), Row-Level Security, a trigger that **blocks the browser from self-granting membership**, auto-profile-on-signup, and a `nr_retention` view.
- `nr-config.js` — PUBLIC client config (Supabase URL + anon key + API base). Blank/placeholder by default → app stays local-only.
- `nr-store-supabase.js` — **local-first sync**: localStorage stays the instant read-cache; hydrates from Supabase on sign-in, pushes writes up (debounced), logs each check-in, reads membership from the server-owned profile. Dormant until configured.
- `nr-auth.js` — passwordless magic-link sign-in UI + handlers.
- `netlify/functions/create-checkout-session.js` — creates a Stripe Checkout Session (subscription).
- `netlify/functions/stripe-webhook.js` — the ONLY thing that grants/revokes membership; verifies the Stripe signature, writes to Supabase via the service-role key.
- `netlify/functions/package.json`, `netlify.toml` — function deps + config.
- `STRIPE_SETUP.md` — click-by-click setup (product + prices, webhook, env vars, test, go-live).

## Edited
- 8 app pages wired with the 3 new scripts (`nr-config`, `nr-auth`, `nr-store-supabase`).
- `account.html` — magic-link sign-in / sync card (hidden when unconfigured).
- `membership.html` — checkout now handles real Stripe (`url` / `needAuth` / demo `mock`).
- `app.html` + `nr-app.css` — **teaser clipping fixed**: the dashboard range gate was an absolute overlay on a 120px card (clipped heading + button); replaced with a normal-flow card, and `.nr-gate` got a `min-height` backstop. Verified on desktop + mobile (button box 166×49, fully visible).

## Why local-first (correcting the earlier "one driver swap" claim)
localStorage is synchronous; the network is async. A naive driver swap would make `loadMountain()` return a Promise and break every page. Instead the remote layer sits *beside* the cache: reads stay synchronous and offline-capable, sync happens in the background. No page/UI rewrites.

## Activation state
- **As shipped:** local-only, exactly as before. All 8 pages verified to boot with zero JS errors while the backend scripts are dormant.
- **To go live:** fill `nr-config.js` + set Netlify env vars + run the SQL. Follow `STRIPE_SETUP.md`. No code changes required.

## Security (added)
- Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) live only in Netlify env vars.
- `profiles_guard` trigger blocks any client-side change to membership — only the webhook (service role) can.
- Webhook verifies Stripe signatures; RLS isolates every user's data.

## Known scaffold simplifications (clean upgrades, not blockers)
- **Re-render after sync = one guarded `location.reload()`** on first hydrate. Cleaner: have pages re-render on the `nr:synced` event (dispatched already) instead of reloading.
- **State merge = "remote wins when same-or-ahead"** by history length. Fine for one active device at a time; true multi-device concurrent editing would want per-field timestamps/CRDT.
- Add **custom SMTP** (magic-link deliverability), a **Customer Portal button** in `/account`, and keep `NR.config.pricing` in sync with Stripe Price amounts.

## The retention query (what you actually wanted)
```sql
select round(100.0*avg(case when returned then 1 else 0 end),1) as pct_returned, count(*) as total_users
from public.nr_retention;
```
`pct_returned` = share of savers who checked in again in a later month. That's the hypothesis, measured.

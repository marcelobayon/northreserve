/* =============================================================================
   nr-config.js  ·  PUBLIC client config for NorthReserve Mountain.
   Loaded first on every app page. Safe to commit: the Supabase anon key and URL
   are public by design — Row-Level Security (see supabase-schema.sql) is what
   protects data. SECRET keys (Stripe secret, Supabase service role) live ONLY
   in Netlify environment variables, never here.

   Until you paste real values below, the app runs exactly as before: local-only,
   no accounts, no sync, no real payments. Nothing breaks when this is blank.
   ============================================================================= */
window.NR_CONFIG = {
  // From Supabase: Project Settings -> API
  supabaseUrl:     "https://jypszrlequrmjlipkgvm.supabase.co",       // e.g. https://abcd1234.supabase.co
  supabaseAnonKey: "sb_publishable_WJ-0N9Rlz2HOoG2u9Uzwcg_0pNBl-bK",  // the "anon" / public key

  // Netlify Functions base (leave as-is for a standard Netlify deploy)
  apiBase: "/.netlify/functions"
};

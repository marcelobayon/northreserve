using UnityEngine;

// =============================================================================
//  NorthReserveTheme.cs   |   Assets/Scripts/UI/NorthReserveTheme.cs
//
//  ONE source of truth for the app's brand, mirroring the website's CSS
//  variables so the app and the site never drift apart.
//
//  This file holds NRBrand (a plain static class — colors + microcopy).
//  Its two companions live in their own files because Unity requires a
//  MonoBehaviour / ScriptableObject to match its file name:
//      • NorthReserveFonts.cs   — holds the three TMP fonts
//      • NRThemeApplier.cs      — paints any UI element a brand role
//
//  FONT SETUP (once): import Clash Display + Satoshi (Fontshare) and
//  JetBrains Mono (Google Fonts), run each through Window → TextMeshPro →
//  Font Asset Creator, then assign them on a NorthReserveFonts asset.
// =============================================================================

namespace FinancialMountain.UI
{
    /// <summary>Brand palette + voice, matching the website exactly.</summary>
    public static class NRBrand
    {
        // ── Core palette (website CSS variables) ─────────────────────────────
        public static readonly Color Basalt      = Hex("#0A2A2E"); // app background base
        public static readonly Color Ink         = Hex("#0E3A40"); // panels / cards
        public static readonly Color Ink2        = Hex("#10454C");
        public static readonly Color Pine        = Hex("#176658");
        public static readonly Color PineBright   = Hex("#1E8A6E"); // "good / solid" status
        public static readonly Color Glacier     = Hex("#57C7DA"); // links, eyebrows, "show me the data"
        public static readonly Color GlacierDeep  = Hex("#2A8FA8");
        public static readonly Color Gold        = Hex("#F2B441"); // ACTION ONLY — the one tap
        public static readonly Color GoldSoft    = Hex("#FFE6A6");
        public static readonly Color Snow        = Hex("#F4F6F3"); // primary text
        public static readonly Color Ridge       = Hex("#B8C6C3");
        public static readonly Color Slate       = Hex("#8DA09C"); // muted text
        public static readonly Color Coral       = Hex("#E2553D"); // errors / "needs attention"

        /// <summary>Text color to sit on top of a Gold button (never pure black).</summary>
        public static readonly Color OnGold      = Hex("#20160A");

        // ── Reservoir colors (base → summit) ─────────────────────────────────
        public static readonly Color ZBuffer     = Hex("#7F77DD");
        public static readonly Color ZEmergency  = Hex("#2A8ADD");
        public static readonly Color ZSinking    = Hex("#BA7517");
        public static readonly Color ZRetirement = Hex("#1D6E45");

        public static Color Reservoir(string key)
        {
            switch (key)
            {
                case "buffer":     return ZBuffer;
                case "emergency":  return ZEmergency;
                case "sinking":    return ZSinking;
                case "retirement": return ZRetirement;
                default:           return Glacier;
            }
        }

        // ── Voice / microcopy (keep identical to the site) ───────────────────
        public const string Wordmark    = "NorthReserve";
        public const string Tagline     = "Know where you stand. Climb with confidence.";
        public const string TrustLine   = "Your numbers never leave your phone.";
        public const string TrustRanges = "We ask for round numbers, never account logins.";
        public const string Calculating = "Reading your mountain…";

        // ── Layout tokens (match the site's feel) ────────────────────────────
        public const float RadiusCard    = 22f;
        public const float RadiusControl = 13f;

        private static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        }
    }
}

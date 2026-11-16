using UnityEngine;
using TMPro;

// =============================================================================
//  NorthReserveFonts.cs   |   Assets/Scripts/UI/NorthReserveFonts.cs
//
//  Holds the three brand TMP fonts in one place so the whole app pulls from
//  the same typefaces as the website. Create the asset via:
//      Assets → Create → NorthReserve → Fonts
//  then assign the three TMP font assets you generated with the TMP Font
//  Asset Creator.
// =============================================================================

namespace FinancialMountain.UI
{
    [CreateAssetMenu(menuName = "NorthReserve/Fonts", fileName = "NorthReserveFonts")]
    public class NorthReserveFonts : ScriptableObject
    {
        [Tooltip("Clash Display — headlines, wordmark, scores")]
        public TMP_FontAsset display;

        [Tooltip("Satoshi — body copy, options, help text")]
        public TMP_FontAsset body;

        [Tooltip("JetBrains Mono — numbers, eyebrows, data")]
        public TMP_FontAsset mono;
    }
}

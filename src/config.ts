// Config-only tuning values (plan.md §10 execution notes) — no logic here.
// Money everywhere in this app is integer CENTAVOS. Never floats.

export const config = {
  currency: {
    code: "MXN",
    symbol: "$",
    secondary: "USD",
    /** Smallest unit per major unit. */
    minorPerMajor: 100,
  },

  pricing: {
    /**
     * Retail price as a multiple of the house price. Matches Booth Mode's
     * config so a price derived in either app lands on the same number.
     * Only applied when selling_price is missing — an explicit price wins.
     */
    fairMarkup: 1.25,
    roundToWholePeso: true,
    defaultMarginPct: 0.4,
  },

  photo: {
    maxSizeKB: 300,
  },

  /**
   * Colors handed to tiers in sort order as they are discovered on import.
   * Tiers are data, not an enum — see core-data/types.ts. Must match Booth
   * Mode's palette so a tier keeps its color across the two apps.
   */
  tierPalette: ["#d9a441", "#5eb0e5", "#57c98a", "#e08641", "#d9628f", "#9b8cd9"],
  tierFallbackColor: "#8b93a3",
};

export type Config = typeof config;

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
    /** Default margin the costing slider opens on, as a % of the price. */
    defaultMarginPct: 40,
    /**
     * Rounding ladder for round-to-pretty. First matching rule wins; the price
     * goes up to the next step, less a peso (243 → 250 → 249, the plan's
     * example in §6 M2).
     *
     * The step has to scale with the price or the rounding becomes a price
     * rise: a flat $5 step turns a $3 sticker into $4, a 33% increase nobody
     * asked for. Under $20 the step is a single peso, which in practice means
     * cheap items only lose their centavos.
     */
    prettyLadder: [
      { upTo: 20, step: 1 },
      { upTo: 100, step: 5 },
      { upTo: 1000, step: 10 },
      { upTo: 5000, step: 50 },
      { upTo: Infinity, step: 100 },
    ],
  },

  costing: {
    /** Fallback hourly rates, in centavos. Per-machine rates override these. */
    defaultMachineRateCentsPerHour: 12000, // $120/h
    defaultLaborRateCentsPerHour: 15000, // $150/h
    /** Platform fee % applied to the selling price (Etsy et al). */
    defaultFeePct: 0,
    /**
     * Margin below which a costed product is flagged for a second look. Not a
     * verdict — some things are loss leaders on purpose — just a nudge.
     */
    thinMarginPct: 20,
  },

  /**
   * MXN per 1 USD. There is no network at the bench and a stale rate silently
   * misprices everything, so this starts unset and USD stays hidden until the
   * user enters one.
   */
  usdRate: null as number | null,

  photo: {
    /** Client-side compression target before upload (plan.md §6 M1). */
    maxSizeKB: 300,
    maxEdgePx: 1600,
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

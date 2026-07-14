// Config-only tuning values (plan.md §10 execution notes) — no logic here.

export const config = {
  currency: {
    primary: "MXN",
    secondary: "USD",
  },
  costing: {
    defaultMarginPct: 0.4,
    roundToPretty: true,
  },
  photo: {
    maxSizeKB: 300,
  },
};

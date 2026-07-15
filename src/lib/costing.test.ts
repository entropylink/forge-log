import { describe, expect, it } from "vitest";
import {
  computeCosting,
  marginAtPrice,
  materialLineCost,
  usagePctFromArea,
  type CostingInput,
} from "./costing";
import { formatMXN, formatUSD, prettyPrice } from "./money";
import type { Material } from "../core-data/types";

const BIRCH: Material = {
  id: "birch3",
  name: "Birch 3mm",
  category: "wood",
  thickness: 3,
  sheetW: 600,
  sheetH: 300,
  sheetCostCents: 12000, // $120 a sheet
};

const LEATHER: Material = {
  id: "leather",
  name: "Veg tan leather",
  category: "leather",
  thickness: 2,
  sheetW: 500,
  sheetH: 500,
  sheetCostCents: 45000, // $450
};

const NO_PRICE: Material = {
  id: "unknown",
  name: "Mystery acrylic",
  category: "acrylic",
  thickness: 3,
  sheetW: 600,
  sheetH: 400,
};

const MATERIALS = [BIRCH, LEATHER, NO_PRICE];
const RATES = new Map([
  ["laser", 12000], // $120/h
  ["cameo", 6000], // $60/h
]);

/** The defaults every golden case starts from, so each case shows only its point. */
function input(over: Partial<CostingInput> = {}): CostingInput {
  return {
    materialLines: [],
    machineLines: [],
    laborMinutes: 0,
    consumables: [],
    batchQty: 1,
    feePct: 0,
    marginPct: 0,
    ...over,
  };
}

const run = (over: Partial<CostingInput> = {}) => computeCosting(input(over), MATERIALS, RATES);

describe("materialLineCost", () => {
  it("takes the given share of the sheet price", () => {
    // 10% of a $120 sheet.
    expect(materialLineCost({ materialId: "birch3", usagePct: 10 }, BIRCH)).toBe(1200);
    expect(materialLineCost({ materialId: "birch3", usagePct: 100 }, BIRCH)).toBe(12000);
    expect(materialLineCost({ materialId: "birch3", usagePct: 0 }, BIRCH)).toBe(0);
  });

  it("rounds to the centavo", () => {
    // 1/3 of $120 = $39.999... → $40.00
    expect(materialLineCost({ materialId: "birch3", usagePct: 33.333 }, BIRCH)).toBe(4000);
  });

  it("costs nothing when the sheet has no price, rather than guessing", () => {
    expect(materialLineCost({ materialId: "unknown", usagePct: 50 }, NO_PRICE)).toBe(0);
    expect(materialLineCost({ materialId: "gone", usagePct: 50 }, undefined)).toBe(0);
  });
});

describe("usagePctFromArea", () => {
  it("converts a cut size into a share of the sheet", () => {
    // A 60×30 piece out of a 600×300 sheet is 1/100th.
    expect(usagePctFromArea(BIRCH, 60, 30)).toBeCloseTo(1, 6);
    // Half the sheet.
    expect(usagePctFromArea(BIRCH, 300, 300)).toBeCloseTo(50, 6);
    expect(usagePctFromArea(BIRCH, 600, 300)).toBeCloseTo(100, 6);
  });

  it("returns null for a sheet with no area", () => {
    expect(usagePctFromArea({ ...BIRCH, sheetW: 0 }, 10, 10)).toBeNull();
  });
});

// --- the ten golden cases (plan.md §6 M2 accept) ----------------------------
//
// Each is computed by hand in its comment. If one of these fails, the arithmetic
// is wrong — not the test.

describe("golden costing cases", () => {
  it("1. material only: 10% of a $120 sheet", () => {
    const r = run({ materialLines: [{ materialId: "birch3", usagePct: 10 }] });
    expect(r.breakdown.materialCents).toBe(1200);
    expect(r.unitCostCents).toBe(1200);
    // 0% margin, 0% fee → price is cost.
    expect(r.suggestedPriceCents).toBe(1200);
    expect(r.profitCents).toBe(0);
  });

  it("2. machine time: 15 min on a $120/h laser = $30", () => {
    const r = run({ machineLines: [{ machineId: "laser", minutes: 15 }] });
    expect(r.breakdown.machineCents).toBe(3000);
    expect(r.unitCostCents).toBe(3000);
  });

  it("3. labour: 20 min at $150/h = $50", () => {
    const r = run({ laborMinutes: 20, laborRateCentsPerHour: 15000 });
    expect(r.breakdown.laborCents).toBe(5000);
  });

  it("4. the full stack adds up", () => {
    // material 10% × $120        = $12.00
    // laser 15 min @ $120/h      = $30.00
    // labour 20 min @ $150/h     = $50.00
    // consumables $3 + $2        =  $5.00
    // packaging                  =  $8.00
    //                              -------
    //                              $105.00
    const r = run({
      materialLines: [{ materialId: "birch3", usagePct: 10 }],
      machineLines: [{ machineId: "laser", minutes: 15 }],
      laborMinutes: 20,
      laborRateCentsPerHour: 15000,
      consumables: [
        { label: "Glue", cents: 300 },
        { label: "Finish", cents: 200 },
      ],
      packagingCents: 800,
    });
    expect(r.breakdown).toEqual({
      materialCents: 1200,
      machineCents: 3000,
      laborCents: 5000,
      setupCents: 0,
      consumableCents: 500,
      packagingCents: 800,
    });
    expect(r.unitCostCents).toBe(10500);
  });

  it("5. margin is a share of the price, not a markup on cost", () => {
    // $60 cost at 40% margin → price $100, NOT $84.
    const r = run({
      materialLines: [{ materialId: "birch3", usagePct: 50 }], // $60
      marginPct: 40,
    });
    expect(r.unitCostCents).toBe(6000);
    expect(r.suggestedPriceCents).toBe(10000);
    expect(r.profitCents).toBe(4000);
    expect(r.effectiveMarginPct).toBeCloseTo(40, 6);
  });

  it("6. the platform fee comes out of the price, not on top of the cost", () => {
    // $60 cost, 40% margin, 10% fee.
    // price × (1 − 0.10 − 0.40) = 60  →  price = 60 / 0.5 = $120
    // fee = 10% × 120 = $12 ; profit = 120 − 60 − 12 = $48 = 40% of price ✓
    // (Treating the fee as a cost line would give $110 and quietly under-price.)
    const r = run({
      materialLines: [{ materialId: "birch3", usagePct: 50 }],
      marginPct: 40,
      feePct: 10,
    });
    expect(r.suggestedPriceCents).toBe(12000);
    expect(r.feeCents).toBe(1200);
    expect(r.profitCents).toBe(4800);
    expect(r.effectiveMarginPct).toBeCloseTo(40, 6);
  });

  it("7. setup time amortizes across the batch", () => {
    // 60 min setup @ $150/h = $150 for the batch.
    // Per unit: ×1 → $150 ; ×20 → $7.50 ; ×100 → $1.50
    const base = {
      materialLines: [{ materialId: "birch3", usagePct: 10 }], // $12
      setupMinutes: 60,
      laborRateCentsPerHour: 15000,
    };
    expect(run({ ...base, batchQty: 1 }).breakdown.setupCents).toBe(15000);
    expect(run({ ...base, batchQty: 20 }).breakdown.setupCents).toBe(750);
    expect(run({ ...base, batchQty: 100 }).breakdown.setupCents).toBe(150);

    // And the unit cost falls with it: $12 + $7.50 = $19.50 at ×20.
    const twenty = run({ ...base, batchQty: 20 });
    expect(twenty.unitCostCents).toBe(1950);
    expect(twenty.batchCostCents).toBe(39000); // 20 × $19.50
  });

  it("8. round-to-pretty lands on 249 and never dips below the margin", () => {
    // cost $146.35 at 40% margin → 14635 / 0.6 = $243.92 → pretty $249.
    const r = run({
      consumables: [{ label: "Odd", cents: 14635 }],
      marginPct: 40,
      roundToPretty: true,
    });
    expect(r.suggestedPriceCents).toBe(24900);
    // Prettifying rounds UP, so the realised margin is above the ask, never under.
    expect(r.effectiveMarginPct).toBeGreaterThan(40);
    expect(r.profitCents).toBe(10265); // 24900 − 14635
  });

  it("9. an impossible margin is refused, not fudged", () => {
    // 70% margin + 30% fee leaves nothing to cover cost: no price exists.
    const r = run({
      materialLines: [{ materialId: "birch3", usagePct: 50 }],
      marginPct: 70,
      feePct: 30,
    });
    expect(r.suggestedPriceCents).toBeNull();
    expect(r.profitCents).toBeNull();
    expect(r.warnings).toContain("impossible-margin");
    // The cost is still reported — it is known.
    expect(r.unitCostCents).toBe(6000);
  });

  it("10. a real product, end to end", () => {
    // LEATHER KEYCHAIN, sold at $188 in the vendor's catalog.
    //   leather 4% of a $450 sheet   = $18.00
    //   laser 6 min @ $120/h         = $12.00
    //   labour 8 min @ $150/h        = $20.00
    //   rivet + ring                 =  $6.00
    //   packaging                    =  $2.00
    //   setup 30 min @ $150/h ÷ 12   =  $6.25
    //                                  ------
    //                                  $64.25
    const r = run({
      materialLines: [{ materialId: "leather", usagePct: 4 }],
      machineLines: [{ machineId: "laser", minutes: 6 }],
      laborMinutes: 8,
      laborRateCentsPerHour: 15000,
      consumables: [{ label: "Rivet + ring", cents: 600 }],
      packagingCents: 200,
      setupMinutes: 30,
      batchQty: 12,
      marginPct: 40,
      feePct: 0,
    });

    expect(r.breakdown).toEqual({
      materialCents: 1800,
      machineCents: 1200,
      laborCents: 2000,
      setupCents: 625,
      consumableCents: 600,
      packagingCents: 200,
    });
    expect(r.unitCostCents).toBe(6425);
    // 6425 / 0.6 = 10708.33 → 10708
    expect(r.suggestedPriceCents).toBe(10708);

    // Against the price actually charged, $188, the real margin is far better:
    // 18800 − 6425 = 12375 profit, 65.8% of the price.
    const actual = marginAtPrice(r.unitCostCents, 18800);
    expect(actual.profitCents).toBe(12375);
    expect(actual.marginPct).toBeCloseTo(65.8, 1);
  });
});

describe("computeCosting edge cases", () => {
  it("uses the machine's own rate, and lets a line override it", () => {
    expect(run({ machineLines: [{ machineId: "cameo", minutes: 30 }] }).breakdown.machineCents)
      .toBe(3000); // 30 min @ $60/h
    expect(
      run({ machineLines: [{ machineId: "cameo", minutes: 30, rateCentsPerHour: 24000 }] })
        .breakdown.machineCents,
    ).toBe(12000); // 30 min @ $240/h
  });

  it("falls back to the default rate for an unknown machine", () => {
    // Rather than costing it at zero, which would understate the price.
    const r = run({ machineLines: [{ machineId: "nope", minutes: 60 }] });
    expect(r.breakdown.machineCents).toBe(12000); // the $120/h default
  });

  it("flags a material it cannot find instead of silently costing zero", () => {
    const r = run({ materialLines: [{ materialId: "ghost", usagePct: 50 }] });
    expect(r.warnings).toContain("missing-material");
    expect(r.breakdown.materialCents).toBe(0);
  });

  it("flags a costing with no cost at all", () => {
    expect(run().warnings).toContain("no-cost");
  });

  it("treats a zero batch as one unit rather than dividing by zero", () => {
    const r = run({ setupMinutes: 60, laborRateCentsPerHour: 15000, batchQty: 0 });
    expect(Number.isFinite(r.breakdown.setupCents)).toBe(true);
    expect(r.breakdown.setupCents).toBe(15000);
    expect(r.warnings).toContain("zero-batch");
  });

  it("ignores negative inputs rather than crediting them", () => {
    const r = run({
      laborMinutes: -30,
      consumables: [{ label: "Bad", cents: -500 }],
      packagingCents: -100,
    });
    expect(r.unitCostCents).toBe(0);
  });

  it("computes batch revenue and profit", () => {
    const r = run({
      materialLines: [{ materialId: "birch3", usagePct: 50 }], // $60
      marginPct: 40,
      batchQty: 20,
    });
    expect(r.suggestedPriceCents).toBe(10000);
    expect(r.batchRevenueCents).toBe(200000); // 20 × $100
    expect(r.batchProfitCents).toBe(80000); // 20 × $40
  });
});

describe("marginAtPrice", () => {
  it("reports a loss when the price is below cost", () => {
    const r = marginAtPrice(10000, 7500);
    expect(r.profitCents).toBe(-2500);
    expect(r.marginPct).toBeCloseTo(-33.3, 1);
  });

  it("accounts for the platform's cut", () => {
    // $100 price, $60 cost, 10% fee → 100 − 60 − 10 = $30.
    const r = marginAtPrice(6000, 10000, 10);
    expect(r.profitCents).toBe(3000);
    expect(r.marginPct).toBeCloseTo(30, 6);
  });
});

describe("prettyPrice", () => {
  it("rounds up to a price that reads like a price", () => {
    // Next step up, less a peso. The ladder coarsens as prices grow.
    expect(prettyPrice(24392)).toBe(24900); // $243.92 → next 10 → $249 (plan's example)
    expect(prettyPrice(4300)).toBe(4400); // $43 → next 5 → $44
  });

  it("leaves a price that is already on the step alone", () => {
    expect(prettyPrice(140000)).toBe(140000); // $1,400 is already round
    expect(prettyPrice(5000)).toBe(5000); // $50
  });

  it("keeps the step small on cheap items so it cannot inflate them", () => {
    // The vendor's catalog has $3 and $13 items. A flat $5 step would round the
    // sticker to $4 — a 33% price rise dressed up as tidying.
    expect(prettyPrice(300)).toBe(300); // $3 stays $3
    expect(prettyPrice(1300)).toBe(1300); // $13 stays $13
    expect(prettyPrice(1250)).toBe(1300); // $12.50 → $13, centavos gone
  });

  it("never rounds down below the input", () => {
    // Prettifying must never quietly price under the margin that was asked for.
    for (let cents = 100; cents < 500000; cents += 997) {
      expect(prettyPrice(cents)).toBeGreaterThanOrEqual(cents);
    }
  });

  it("leaves zero alone", () => {
    expect(prettyPrice(0)).toBe(0);
  });
});

describe("currency display", () => {
  it("formats MXN", () => {
    expect(formatMXN(24900)).toBe("$249.00");
    expect(formatMXN(750000)).toBe("$7,500.00");
  });

  it("shows USD only once a rate is set", () => {
    // No network at the bench: an invented rate would misprice everything.
    expect(formatUSD(24900, null)).toBeNull();
    expect(formatUSD(24900, 0)).toBeNull();
    expect(formatUSD(24900, 20)).toBe("US$12.45"); // $249 ÷ 20
    expect(formatUSD(750000, 17.5)).toBe("US$428.57");
  });
});

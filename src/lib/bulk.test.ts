import { describe, expect, it } from "vitest";
import {
  applyCost,
  costProgress,
  EMPTY_COST,
  filterProducts,
  hasCost,
  machinesInUse,
  NO_FILTER,
  previewApply,
  productMargin,
  productMarginPct,
  recipeToUnitCost,
  recipeUnitCostCents,
  tiersInUse,
  uncostedProducts,
} from "./bulk";
import { totalUnitCost } from "./money";
import type { CostRecipe, Material, Product, Tier } from "../core-data/types";

const LEATHER: Material = {
  id: "leather",
  name: "Veg tan",
  category: "leather",
  thickness: 2,
  sheetW: 500,
  sheetH: 500,
  sheetCostCents: 45000, // $450
};

const RATES = new Map([["laser", 12000]]); // $120/h

function product(over: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    sku: over.id,
    variants: ["—"],
    tierId: "mid",
    cost: EMPTY_COST,
    housePriceCents: 0,
    sellingPriceCents: 18800,
    stockByVariant: {},
    active: true,
    ...over,
  } as Product;
}

const KEYCHAIN_RECIPE: CostRecipe = {
  id: "r1",
  name: "Leather keychain",
  materialLines: [{ materialId: "leather", usagePct: 4 }], // $18
  machineLines: [{ machineId: "laser", minutes: 6 }], // $12
  laborMinutes: 8,
  laborRateCentsPerHour: 15000, // $20
  consumables: [{ label: "Rivet + ring", cents: 600 }],
  packagingCents: 200,
  setupMinutes: 30, // $75 over 12 = $6.25
  batchQty: 12,
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("recipeToUnitCost", () => {
  it("produces the same figure as the single-product form", () => {
    // Golden case 10 from costing.test.ts, reached through the bulk path.
    const cost = recipeToUnitCost(KEYCHAIN_RECIPE, [LEATHER], RATES);
    expect(cost).toEqual({
      materialCents: 1800,
      machineCents: 1200,
      // Setup folds into labour: $20 + $6.25. The shared template has no setup
      // column, and inventing one would fork the format.
      laborCents: 2625,
      consumableCents: 600,
      packagingCents: 200,
    });
    expect(totalUnitCost(cost)).toBe(6425); // $64.25
    expect(recipeUnitCostCents(KEYCHAIN_RECIPE, [LEATHER], RATES)).toBe(6425);
  });

  it("re-prices when the material sheet price changes", () => {
    // The reason a recipe stores inputs and not a frozen total.
    const dearer = { ...LEATHER, sheetCostCents: 90000 };
    expect(recipeUnitCostCents(KEYCHAIN_RECIPE, [dearer], RATES)).toBe(6425 + 1800);
  });

  it("spreads setup differently as the batch changes", () => {
    const ofOne = { ...KEYCHAIN_RECIPE, batchQty: 1 };
    // $75 of setup on a single unit instead of $6.25.
    expect(recipeUnitCostCents(ofOne, [LEATHER], RATES)).toBe(6425 - 625 + 7500);
  });

  it("costs a missing material at zero rather than guessing", () => {
    const orphan = { ...KEYCHAIN_RECIPE, materialLines: [{ materialId: "gone", usagePct: 50 }] };
    const cost = recipeToUnitCost(orphan, [LEATHER], RATES);
    expect(cost.materialCents).toBe(0);
  });
});

describe("hasCost / productMargin", () => {
  const costed = product({
    id: "a",
    name: "Costed",
    cost: { ...EMPTY_COST, materialCents: 6425 },
  });
  const bare = product({ id: "b", name: "Bare" });

  it("treats zero cost as uncaptured, not free", () => {
    expect(hasCost(costed)).toBe(true);
    expect(hasCost(bare)).toBe(false);
    // The trap: margin would otherwise read as the whole selling price.
    expect(productMargin(bare)).toBeNull();
    expect(productMarginPct(bare)).toBeNull();
  });

  it("computes margin against the selling price", () => {
    expect(productMargin(costed)).toBe(12375); // $188 − $64.25
    expect(productMarginPct(costed)).toBeCloseTo(65.8, 1);
  });

  it("reports a negative margin rather than hiding it", () => {
    const losing = product({
      id: "c",
      name: "Losing",
      cost: { ...EMPTY_COST, materialCents: 20000 },
    });
    expect(productMargin(losing)).toBe(-1200);
    expect(productMarginPct(losing)).toBeCloseTo(-6.4, 1);
  });
});

describe("filterProducts", () => {
  const products = [
    product({ id: "1", name: "SEPARADOR M2", machine: "laser", tierId: "flagship" }),
    product({
      id: "2",
      name: "PUPPET",
      machine: "cameo",
      tierId: "mid",
      cost: { ...EMPTY_COST, laborCents: 5000 },
    }),
    product({ id: "3", name: "HACHA", machine: "craft", tierId: "hero" }),
    product({ id: "4", name: "POCIÓN 1", tierId: "impulse" }),
  ];

  it("passes everything through by default", () => {
    expect(filterProducts(products, NO_FILTER)).toHaveLength(4);
  });

  it("filters to the uncosted, which is the whole point", () => {
    const rows = filterProducts(products, { ...NO_FILTER, onlyUncosted: true });
    expect(rows.map((p) => p.name)).toEqual(["SEPARADOR M2", "HACHA", "POCIÓN 1"]);
  });

  it("filters by machine", () => {
    expect(
      filterProducts(products, { ...NO_FILTER, machine: "laser" }).map((p) => p.name),
    ).toEqual(["SEPARADOR M2"]);
  });

  it("filters by tier", () => {
    expect(
      filterProducts(products, { ...NO_FILTER, tierId: "hero" }).map((p) => p.name),
    ).toEqual(["HACHA"]);
  });

  it("searches name and sku, ignoring accents", () => {
    expect(filterProducts(products, { ...NO_FILTER, query: "pocion" }).map((p) => p.name)).toEqual(
      ["POCIÓN 1"],
    );
    expect(filterProducts(products, { ...NO_FILTER, query: "separ" })).toHaveLength(1);
    expect(filterProducts(products, { ...NO_FILTER, query: "3" }).map((p) => p.name)).toEqual([
      "HACHA",
    ]);
  });

  it("combines filters", () => {
    const rows = filterProducts(products, {
      query: "",
      machine: "cameo",
      tierId: null,
      onlyUncosted: true,
    });
    expect(rows).toEqual([]); // PUPPET is cameo but already costed
  });

  it("lists only the machines actually in use", () => {
    expect(machinesInUse(products)).toEqual(["cameo", "craft", "laser"]);
  });

  it("lists only the tiers actually in use, in order", () => {
    const tiers: Tier[] = [
      { id: "flagship", label: "Flagship", sortOrder: 0, color: "#1" },
      { id: "impulse", label: "Impulse", sortOrder: 1, color: "#2" },
      { id: "mid", label: "Mid", sortOrder: 2, color: "#3" },
      { id: "hero", label: "Hero", sortOrder: 3, color: "#4" },
      { id: "unused", label: "Unused", sortOrder: 4, color: "#5" },
    ];
    expect(tiersInUse(products, tiers).map((t) => t.id)).toEqual([
      "flagship",
      "impulse",
      "mid",
      "hero",
    ]);
  });
});

describe("costProgress", () => {
  const products = [
    product({ id: "1", name: "Good", cost: { ...EMPTY_COST, materialCents: 6425 } }), // 65.8%
    product({
      id: "2",
      name: "Thin",
      sellingPriceCents: 10000,
      cost: { ...EMPTY_COST, materialCents: 9000 },
    }), // 10%
    product({
      id: "3",
      name: "Losing",
      sellingPriceCents: 10000,
      cost: { ...EMPTY_COST, materialCents: 12000 },
    }), // −20%
    product({ id: "4", name: "Bare" }),
  ];

  it("counts what is done and what is left", () => {
    const p = costProgress(products, 20);
    expect(p).toMatchObject({ total: 4, costed: 3, uncosted: 1 });
    expect(p.pct).toBe(75);
  });

  it("surfaces products priced below what they cost", () => {
    const p = costProgress(products, 20);
    expect(p.losing.map((x) => x.name)).toEqual(["Losing"]);
  });

  it("surfaces thin margins without calling them losses", () => {
    const p = costProgress(products, 20);
    expect(p.thin.map((x) => x.name)).toEqual(["Thin"]);
  });

  it("never counts an uncosted product as either", () => {
    // Bare has no cost, so it is neither thin nor losing — it is unknown.
    const p = costProgress(products, 20);
    expect([...p.thin, ...p.losing].map((x) => x.name)).not.toContain("Bare");
  });

  it("handles an empty catalog without dividing by zero", () => {
    expect(costProgress([], 20)).toMatchObject({ total: 0, costed: 0, pct: 0 });
  });
});

describe("previewApply", () => {
  const targets = [
    product({ id: "1", name: "Cheap", sellingPriceCents: 5000 }),
    product({ id: "2", name: "Dear", sellingPriceCents: 18800 }),
    product({
      id: "3",
      name: "Already costed",
      sellingPriceCents: 18800,
      cost: { ...EMPTY_COST, materialCents: 100 },
    }),
  ];
  const cost = { ...EMPTY_COST, materialCents: 6425 };

  it("says how many it will touch and how many it will overwrite", () => {
    const preview = previewApply(cost, targets);
    expect(preview.count).toBe(3);
    expect(preview.overwrites).toBe(1);
    expect(preview.unitCostCents).toBe(6425);
  });

  it("warns which products the cost would put underwater, before applying", () => {
    // $64.25 against a $50 price. Applying to 20 at once could bury half of them.
    const preview = previewApply(cost, targets);
    expect(preview.wouldLose.map((p) => p.name)).toEqual(["Cheap"]);
  });

  it("counts a price exactly equal to cost as a loss", () => {
    const breakeven = [product({ id: "x", name: "Breakeven", sellingPriceCents: 6425 })];
    expect(previewApply(cost, breakeven).wouldLose).toHaveLength(1);
  });
});

describe("applyCost", () => {
  it("replaces the cost and copies rather than mutating", () => {
    const original = product({ id: "1", name: "P" });
    const cost = { ...EMPTY_COST, materialCents: 500 };
    const updated = applyCost(original, cost);

    expect(updated.cost.materialCents).toBe(500);
    expect(original.cost.materialCents).toBe(0);
    expect(updated.cost).not.toBe(cost);
  });
});

describe("uncostedProducts", () => {
  it("lists what still needs doing", () => {
    const products = [
      product({ id: "1", name: "A", cost: { ...EMPTY_COST, materialCents: 1 } }),
      product({ id: "2", name: "B" }),
    ];
    expect(uncostedProducts(products).map((p) => p.name)).toEqual(["B"]);
  });
});

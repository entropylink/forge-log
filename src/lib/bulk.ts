// Bulk costing (the 61-uncosted-products problem). Pure; no storage, no React.
//
// Costing one product at a time is the right tool for one product and the wrong
// one for a catalog. Everything here exists to cost many at once without
// inventing any of the numbers:
//
//   - A recipe is applied through the SAME engine as the single-product form
//     (lib/costing), so a figure never depends on which screen produced it.
//   - Applying a recipe to a product that already has costs overwrites them.
//     That is what "apply" means, so the caller is expected to have said so.
//   - Nothing is guessed to fill a gap: a product with no cost stays with no
//     cost, and reads as unknown rather than as free.

import { breakdownToUnitCost, computeCosting } from "./costing";
import { totalUnitCost } from "./money";
import type {
  Cents,
  CostRecipe,
  Machine,
  Material,
  Product,
  Tier,
  UnitCost,
} from "../core-data/types";

export const EMPTY_COST: UnitCost = {
  materialCents: 0,
  machineCents: 0,
  laborCents: 0,
  consumableCents: 0,
  packagingCents: 0,
};

export function hasCost(product: Product): boolean {
  return totalUnitCost(product.cost) > 0;
}

/** Margin in centavos at the product's own selling price. Null when uncosted. */
export function productMargin(product: Product): Cents | null {
  const cost = totalUnitCost(product.cost);
  if (cost === 0) return null;
  return product.sellingPriceCents - cost;
}

export function productMarginPct(product: Product): number | null {
  const margin = productMargin(product);
  if (margin === null || product.sellingPriceCents === 0) return null;
  return (margin / product.sellingPriceCents) * 100;
}

// --- recipes ----------------------------------------------------------------

export function emptyRecipe(): Omit<CostRecipe, "id" | "updatedAt"> {
  return {
    name: "",
    materialLines: [],
    machineLines: [],
    laborMinutes: 0,
    consumables: [],
    packagingCents: 0,
    setupMinutes: 0,
    batchQty: 1,
  };
}

/**
 * Turn a recipe into a unit cost, through the costing engine rather than a
 * second implementation of the same sums.
 *
 * Margin and fee are zero here: the recipe describes what a thing costs, and
 * what to charge for it is a separate decision made per product.
 */
export function recipeToUnitCost(
  recipe: CostRecipe,
  materials: readonly Material[],
  machineRates: ReadonlyMap<string, Cents>,
): UnitCost {
  const result = computeCosting(
    {
      materialLines: recipe.materialLines,
      machineLines: recipe.machineLines,
      laborMinutes: recipe.laborMinutes,
      laborRateCentsPerHour: recipe.laborRateCentsPerHour,
      consumables: recipe.consumables,
      packagingCents: recipe.packagingCents,
      setupMinutes: recipe.setupMinutes,
      batchQty: recipe.batchQty,
      feePct: 0,
      marginPct: 0,
    },
    materials,
    machineRates,
  );
  return breakdownToUnitCost(result.breakdown);
}

/** The unit cost a recipe would produce, for previewing before applying. */
export function recipeUnitCostCents(
  recipe: CostRecipe,
  materials: readonly Material[],
  machineRates: ReadonlyMap<string, Cents>,
): Cents {
  return totalUnitCost(recipeToUnitCost(recipe, materials, machineRates));
}

export function recipeFromProduct(
  product: Product,
): Pick<CostRecipe, "name"> & { cost: UnitCost } {
  return { name: product.name, cost: { ...product.cost } };
}

// --- selection & filtering --------------------------------------------------

export interface ProductFilter {
  query: string;
  machine: string | null;
  tierId: string | null;
  onlyUncosted: boolean;
}

export const NO_FILTER: ProductFilter = {
  query: "",
  machine: null,
  tierId: null,
  onlyUncosted: false,
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function filterProducts(
  products: readonly Product[],
  filter: ProductFilter,
): Product[] {
  const q = norm(filter.query);
  return products.filter((p) => {
    if (filter.onlyUncosted && hasCost(p)) return false;
    if (filter.machine !== null && (p.machine ?? "") !== filter.machine) return false;
    if (filter.tierId !== null && p.tierId !== filter.tierId) return false;
    if (q !== "" && !norm(`${p.sku} ${p.name}`).includes(q)) return false;
    return true;
  });
}

/** Machine values actually present in the catalog, for the filter chips. */
export function machinesInUse(products: readonly Product[]): string[] {
  return [...new Set(products.map((p) => p.machine).filter((m): m is string => !!m))].sort();
}

export function tiersInUse(
  products: readonly Product[],
  tiers: readonly Tier[],
): Tier[] {
  const used = new Set(products.map((p) => p.tierId));
  return tiers.filter((t) => used.has(t.id)).sort((a, b) => a.sortOrder - b.sortOrder);
}

// --- progress ---------------------------------------------------------------

export interface CostProgress {
  total: number;
  costed: number;
  uncosted: number;
  pct: number;
  /** Products priced at or below what they cost to make. */
  losing: Product[];
  /** Costed products whose margin is thin enough to be worth a second look. */
  thin: Product[];
}

export function costProgress(
  products: readonly Product[],
  thinMarginPct: number,
): CostProgress {
  const costed = products.filter(hasCost);
  const losing: Product[] = [];
  const thin: Product[] = [];

  for (const product of costed) {
    const pct = productMarginPct(product);
    if (pct === null) continue;
    if (pct <= 0) losing.push(product);
    else if (pct < thinMarginPct) thin.push(product);
  }

  return {
    total: products.length,
    costed: costed.length,
    uncosted: products.length - costed.length,
    pct: products.length === 0 ? 0 : (costed.length / products.length) * 100,
    losing,
    thin,
  };
}

/** What applying this cost to these products would do, before it is done. */
export interface ApplyPreview {
  count: number;
  /** Already costed — applying replaces what is there. */
  overwrites: number;
  unitCostCents: Cents;
  /** Products this cost would price at or below water. */
  wouldLose: Product[];
}

export function previewApply(
  cost: UnitCost,
  targets: readonly Product[],
): ApplyPreview {
  const unitCostCents = totalUnitCost(cost);
  return {
    count: targets.length,
    overwrites: targets.filter(hasCost).length,
    unitCostCents,
    // Surfaced before the click, because a recipe applied to 20 products can
    // quietly put half of them underwater.
    wouldLose: targets.filter((p) => p.sellingPriceCents <= unitCostCents),
  };
}

export function applyCost(product: Product, cost: UnitCost): Product {
  return { ...product, cost: { ...cost } };
}

// --- the CSV escape hatch ---------------------------------------------------

/**
 * Products that would still be uncosted after this session — the ones worth
 * exporting to a spreadsheet and filling in there.
 */
export function uncostedProducts(products: readonly Product[]): Product[] {
  return products.filter((p) => !hasCost(p));
}

export function machineLabelFor(machineId: string, machines: readonly Machine[]): string {
  const machine = machines.find((m) => m.id === machineId);
  return machine ? `${machine.brand} ${machine.model}` : machineId;
}

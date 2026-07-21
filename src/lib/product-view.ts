// Search / filter / sort for the product catalog. Pure and offline: a workshop
// has dozens of products, not millions, so a scan is instant and legible.
//
// Kept in step with Booth Mode's src/lib/product-view.ts — same option shape and
// the shared sort keys (name, price, margin, tier) behave identically. Forge
// adds a cost sort (a workshop question); Booth adds stock/to-make sorts.

import { stripDiacritics } from "../core-data/template";
import { totalUnitCost } from "./money";
import type { Product } from "../core-data/types";

export const SORT_KEYS = ["name", "price", "margin", "cost", "tier"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ViewOptions {
  /** Free text matched against product name, SKU and variants. */
  query: string;
  /** Restrict to one tier; "" means all tiers. */
  tierId: string;
  sort: SortKey;
}

const norm = (s: string): string => stripDiacritics(s.toLowerCase()).replace(/\s+/g, " ").trim();

/** Unit margin, or null when the product has no cost entered yet. */
export function productMargin(p: Product): number | null {
  const cost = totalUnitCost(p.cost);
  return cost === 0 ? null : p.sellingPriceCents - cost;
}

/** null (unknown) sorts to the bottom of a high→low sort. */
const forDesc = (n: number | null): number => (n === null ? -Infinity : n);

export function viewProducts(
  products: readonly Product[],
  opts: ViewOptions,
  /** Tier display order, so a "by tier" sort groups tiers as the user arranged them. */
  tierRank: (tierId: string) => number,
): Product[] {
  const q = norm(opts.query);
  const filtered = products.filter((p) => {
    if (opts.tierId !== "" && p.tierId !== opts.tierId) return false;
    if (q !== "" && !norm(`${p.name} ${p.sku} ${p.variants.join(" ")}`).includes(q)) return false;
    return true;
  });

  const byName = (a: Product, b: Product): number => a.name.localeCompare(b.name);

  const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
    name: byName,
    price: (a, b) => b.sellingPriceCents - a.sellingPriceCents || byName(a, b),
    margin: (a, b) => forDesc(productMargin(b)) - forDesc(productMargin(a)) || byName(a, b),
    cost: (a, b) => totalUnitCost(b.cost) - totalUnitCost(a.cost) || byName(a, b),
    tier: (a, b) => tierRank(a.tierId) - tierRank(b.tierId) || byName(a, b),
  };

  return [...filtered].sort(cmp[opts.sort]);
}

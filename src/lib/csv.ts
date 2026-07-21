// Maps the canonical stock template (core-data/template.ts) to and from Forge
// Log's model: Tier and Product.
//
// The file format itself lives in template.ts and is shared byte-for-byte with
// Booth Mode. This file is only the adapter.
//
// Forge Log is the workshop side of the fence: it owns products, costs, tiers
// and what is physically in stock. It has no fairs, so the fair-specific
// columns are written empty on export:
//
//   goal_qty    0     — the target belongs to a Booth Mode stock plan
//   packed_qty  0     — nothing is packed until there is a fair
//   made        false — production status is per-fair
//
// Booth Mode fills those in. Forge Log never invents them.

import { config } from "../config";
import {
  emptyTemplateCSV,
  parseTemplateCSV,
  serializeTemplateCSV,
  stripDiacritics,
  TEMPLATE_HEADER,
  type InferredColumn,
  type TemplateIssue,
  type TemplateOutRow,
} from "../core-data/template";
import type { Cents, Product, Tier, UnitCost } from "../core-data/types";

export const NO_VARIANT = "—";

export interface ImportResult {
  tiers: Tier[];
  products: Product[];
  /** Structured so each app can phrase them in its own language. */
  issues: TemplateIssue[];
  inferred: InferredColumn[];
  unknownColumns: string[];
}

export function slugId(name: string): string {
  return (
    stripDiacritics(name.trim().toLowerCase())
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

/**
 * "Flagship – go deep" -> "flagship". Splits only on a dash *surrounded by
 * spaces*, so "Off-theme – minimal" keeps its hyphen and becomes "off-theme".
 */
export function tierIdFromLabel(label: string): string {
  const head = label.split(/\s+[–—-]\s+/)[0] ?? label;
  return slugId(head);
}

/** The one place the cost lines are added up. */
export function totalUnitCost(cost: UnitCost): Cents {
  return (
    cost.materialCents +
    cost.machineCents +
    cost.laborCents +
    cost.consumableCents +
    cost.packagingCents
  );
}

/** The retail price implied by a house price, when none was given explicitly. */
export function retailPriceFromHouse(housePriceCents: Cents): Cents {
  const raw = housePriceCents * config.pricing.fairMarkup;
  return config.pricing.roundToWholePeso
    ? Math.round(raw / config.currency.minorPerMajor) * config.currency.minorPerMajor
    : Math.round(raw);
}

export function importCatalogCSV(text: string): ImportResult {
  const parsed = parseTemplateCSV(text);
  const issues = [...parsed.issues];

  const tiersById = new Map<string, Tier>();
  const productsById = new Map<string, Product>();
  const seenSku = new Map<string, string>();

  for (const row of parsed.rows) {
    let tierId = "sin-tier";
    if (row.tier !== "") {
      tierId = tierIdFromLabel(row.tier);
      const existing = tiersById.get(tierId);
      // Two different labels collapsing to one id — keep them apart.
      if (existing && existing.label !== row.tier) tierId = slugId(row.tier);
      if (!tiersById.has(tierId)) {
        tiersById.set(tierId, {
          id: tierId,
          label: row.tier,
          sortOrder: tiersById.size,
          color:
            config.tierPalette[tiersById.size % config.tierPalette.length] ??
            config.tierFallbackColor,
        });
      }
    }

    let sellingPriceCents = row.sellingPriceCents;
    if (sellingPriceCents === null && row.housePriceCents !== null) {
      sellingPriceCents = retailPriceFromHouse(row.housePriceCents);
    }
    if (sellingPriceCents === null) {
      issues.push({ kind: "bad-value", row: row.rowNum, column: "selling_price", value: "" });
      continue;
    }

    const id = row.sku !== "" ? `sku-${slugId(row.sku)}` : slugId(row.product);
    if (row.sku !== "") {
      const claimedBy = seenSku.get(row.sku);
      if (claimedBy !== undefined && claimedBy !== row.product) {
        issues.push({ kind: "bad-value", row: row.rowNum, column: "sku", value: row.sku });
        continue;
      }
      seenSku.set(row.sku, row.product);
    }

    const variant = row.variant || NO_VARIANT;

    // A variant name becomes a KEY of stockByVariant, i.e. a Firestore field name
    // on sync. Firestore rejects field names matching /^__.*__$/, and one such
    // name silently aborts the entire sync pass. Reject it at import instead.
    if (/^__.*__$/.test(variant)) {
      issues.push({ kind: "bad-value", row: row.rowNum, column: "variant", value: variant });
      continue;
    }

    let product = productsById.get(id);
    if (!product) {
      product = {
        id,
        sku: row.sku,
        name: row.product,
        variants: [],
        tierId,
        machine: row.machine || undefined,
        cost: {
          materialCents: row.costMaterialCents,
          machineCents: row.costMachineCents,
          laborCents: row.costLaborCents,
          consumableCents: row.costConsumableCents,
          packagingCents: row.costPackagingCents,
        },
        housePriceCents: row.housePriceCents ?? sellingPriceCents,
        sellingPriceCents,
        stockByVariant: {},
        productionMinutes: row.productionMinutes ?? undefined,
        restockThreshold: row.restockThreshold ?? undefined,
        active: row.active,
        notes: row.notes || undefined,
      };
      productsById.set(id, product);
    }

    if (!product.variants.includes(variant)) product.variants.push(variant);
    product.stockByVariant[variant] = row.currentQty;
  }

  return {
    tiers: [...tiersById.values()],
    products: [...productsById.values()],
    issues,
    inferred: parsed.inferred,
    unknownColumns: parsed.unknownColumns,
  };
}

/**
 * Emit the catalog as the canonical template — the file Booth Mode imports.
 *
 * One row per product::variant, so a product with two variants writes two rows,
 * exactly as Booth Mode reads them back.
 */
export function exportCatalogCSV(
  products: readonly Product[],
  tiers: readonly Tier[],
): string {
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const rows: TemplateOutRow[] = [];

  for (const product of products) {
    const unitCostCents = totalUnitCost(product.cost);
    // Cost 0 means "not captured", not "free" — margin stays unknown.
    const marginUnitCents =
      unitCostCents === 0 ? null : product.sellingPriceCents - unitCostCents;
    const marginPct =
      marginUnitCents === null || product.sellingPriceCents === 0
        ? null
        : (marginUnitCents / product.sellingPriceCents) * 100;

    const variants = product.variants.length > 0 ? product.variants : [NO_VARIANT];
    for (const variant of variants) {
      rows.push({
        sku: product.sku,
        product: product.name,
        variant: variant === NO_VARIANT ? "" : variant,
        tier: tierById.get(product.tierId)?.label ?? "",
        machine: product.machine ?? "",
        costMaterialCents: product.cost.materialCents,
        costMachineCents: product.cost.machineCents,
        costLaborCents: product.cost.laborCents,
        costConsumableCents: product.cost.consumableCents,
        costPackagingCents: product.cost.packagingCents,
        housePriceCents: product.housePriceCents,
        sellingPriceCents: product.sellingPriceCents,
        currentQty: product.stockByVariant[variant] ?? 0,
        // Fair-side columns: Forge Log has no fair, so it asserts nothing.
        goalQty: 0,
        made: false,
        packedQty: 0,
        productionMinutes: product.productionMinutes ?? null,
        restockThreshold: product.restockThreshold ?? null,
        active: product.active,
        notes: product.notes ?? "",
        unitCostCents,
        marginUnitCents,
        marginPct,
        toMake: 0,
        goalValueCents: 0,
        goalProfitCents: null,
      });
    }
  }

  return serializeTemplateCSV(rows);
}

export { TEMPLATE_HEADER, emptyTemplateCSV };

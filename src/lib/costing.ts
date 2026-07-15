// Costing engine (plan.md §6 M2). Pure functions; no storage, no React.
//
// The question this answers is "what do I charge?", and getting it wrong is
// expensive in a way a UI bug is not — so every figure here is derived from
// explicit inputs and the awkward cases are handled rather than rounded past.
//
// Two conventions worth stating, because they are where costing tools usually
// go wrong:
//
//   MARGIN IS A SHARE OF THE PRICE, not a markup on cost. 40% margin on a $60
//   cost means a $100 price, not $84. This matches how Booth Mode reports
//   margin (inventory.ts) and how sellers actually talk.
//
//   PLATFORM FEES COME OUT OF THE PRICE. Etsy takes its cut of what the buyer
//   pays, not of what the item cost to make, so the fee has to be solved for
//   alongside the margin rather than added to the cost pile:
//
//       price × (1 − fee% − margin%) = cost
//
//   Treating the fee as a cost line understates the price every time.

import { config } from "../config";
import { ratePerMinute, roundHalfUp, prettyPrice, sumCents } from "./money";
import type { Cents, Material } from "../core-data/types";

export interface MaterialLine {
  materialId: string;
  /** Share of one sheet consumed by one unit, 0-100. */
  usagePct: number;
}

export interface MachineLine {
  machineId: string;
  minutes: number;
  /** Overrides the machine's own rate when set. */
  rateCentsPerHour?: Cents;
}

export interface ConsumableLine {
  label: string;
  cents: Cents;
}

export interface CostingInput {
  materialLines: MaterialLine[];
  machineLines: MachineLine[];
  laborMinutes: number;
  laborRateCentsPerHour?: Cents;
  consumables: ConsumableLine[];
  packagingCents?: Cents;
  /** One-off bench time for the whole batch, amortized across batchQty. */
  setupMinutes?: number;
  batchQty: number;
  /** Share of the selling price taken by the platform, 0-100. */
  feePct: number;
  /** Target share of the selling price kept as profit, 0-100. */
  marginPct: number;
  roundToPretty?: boolean;
}

export interface CostBreakdown {
  materialCents: Cents;
  machineCents: Cents;
  laborCents: Cents;
  setupCents: Cents;
  consumableCents: Cents;
  packagingCents: Cents;
}

export interface CostingResult {
  breakdown: CostBreakdown;
  /** What one unit costs to make, setup amortized in. */
  unitCostCents: Cents;
  batchCostCents: Cents;
  /** null when margin + fee leave nothing to price against — see below. */
  suggestedPriceCents: Cents | null;
  /** The platform's cut at the suggested price. */
  feeCents: Cents;
  /** What actually lands in your pocket per unit, after cost and fee. */
  profitCents: Cents | null;
  /** Realised margin. Differs from the requested one once prettified. */
  effectiveMarginPct: number | null;
  batchRevenueCents: Cents | null;
  batchProfitCents: Cents | null;
  /** Problems worth showing rather than swallowing. */
  warnings: CostingWarning[];
}

export type CostingWarning =
  | "impossible-margin"
  | "no-cost"
  | "zero-batch"
  | "missing-material";

/** Cost of one unit's share of a sheet. */
export function materialLineCost(line: MaterialLine, material: Material | undefined): Cents {
  if (!material || material.sheetCostCents === undefined) return 0;
  const pct = Math.max(0, line.usagePct);
  return roundHalfUp((material.sheetCostCents * pct) / 100);
}

/** Usage % implied by cutting a w×h piece out of the sheet. */
export function usagePctFromArea(
  material: Material,
  w: number,
  h: number,
): number | null {
  const sheetArea = material.sheetW * material.sheetH;
  if (sheetArea <= 0) return null;
  return ((w * h) / sheetArea) * 100;
}

export function computeCosting(
  input: CostingInput,
  materials: readonly Material[],
  machineRates: ReadonlyMap<string, Cents>,
): CostingResult {
  const warnings: CostingWarning[] = [];
  const materialById = new Map(materials.map((m) => [m.id, m]));

  // A batch of zero would divide setup by zero; treat it as one unit.
  const batchQty = input.batchQty > 0 ? Math.floor(input.batchQty) : 1;
  if (input.batchQty <= 0) warnings.push("zero-batch");

  let materialCents = 0;
  for (const line of input.materialLines) {
    const material = materialById.get(line.materialId);
    if (!material) {
      warnings.push("missing-material");
      continue;
    }
    materialCents += materialLineCost(line, material);
  }

  let machineCents = 0;
  for (const line of input.machineLines) {
    const rate =
      line.rateCentsPerHour ??
      machineRates.get(line.machineId) ??
      config.costing.defaultMachineRateCentsPerHour;
    machineCents += ratePerMinute(rate, Math.max(0, line.minutes));
  }

  const laborRate = input.laborRateCentsPerHour ?? config.costing.defaultLaborRateCentsPerHour;
  const laborCents = ratePerMinute(laborRate, Math.max(0, input.laborMinutes));

  // Setup is paid once per batch, so its per-unit share shrinks as the batch
  // grows. This is the whole point of batch mode.
  const setupTotalCents = ratePerMinute(laborRate, Math.max(0, input.setupMinutes ?? 0));
  const setupCents = roundHalfUp(setupTotalCents / batchQty);

  const consumableCents = sumCents(input.consumables.map((c) => Math.max(0, c.cents)));
  const packagingCents = Math.max(0, input.packagingCents ?? 0);

  const breakdown: CostBreakdown = {
    materialCents,
    machineCents,
    laborCents,
    setupCents,
    consumableCents,
    packagingCents,
  };

  const unitCostCents =
    materialCents + machineCents + laborCents + setupCents + consumableCents + packagingCents;

  if (unitCostCents === 0) warnings.push("no-cost");

  // price × (1 − fee% − margin%) = cost. If the two shares reach 100% there is
  // no price that satisfies them — refuse rather than emit a vast number.
  const feePct = Math.max(0, input.feePct);
  const marginPct = Math.max(0, input.marginPct);
  const retained = 1 - (feePct + marginPct) / 100;

  if (retained <= 0) {
    warnings.push("impossible-margin");
    return {
      breakdown,
      unitCostCents,
      batchCostCents: unitCostCents * batchQty,
      suggestedPriceCents: null,
      feeCents: 0,
      profitCents: null,
      effectiveMarginPct: null,
      batchRevenueCents: null,
      batchProfitCents: null,
      warnings,
    };
  }

  const rawPrice = roundHalfUp(unitCostCents / retained);
  const suggestedPriceCents = input.roundToPretty ? prettyPrice(rawPrice) : rawPrice;

  const feeCents = roundHalfUp((suggestedPriceCents * feePct) / 100);
  const profitCents = suggestedPriceCents - unitCostCents - feeCents;
  const effectiveMarginPct =
    suggestedPriceCents === 0 ? null : (profitCents / suggestedPriceCents) * 100;

  return {
    breakdown,
    unitCostCents,
    batchCostCents: unitCostCents * batchQty,
    suggestedPriceCents,
    feeCents,
    profitCents,
    effectiveMarginPct,
    batchRevenueCents: suggestedPriceCents * batchQty,
    batchProfitCents: profitCents * batchQty,
    warnings,
  };
}

/** Margin at a price the user has already set, rather than one we suggest. */
export function marginAtPrice(
  unitCostCents: Cents,
  priceCents: Cents,
  feePct = 0,
): { profitCents: Cents; marginPct: number | null } {
  const feeCents = roundHalfUp((priceCents * Math.max(0, feePct)) / 100);
  const profitCents = priceCents - unitCostCents - feeCents;
  return {
    profitCents,
    marginPct: priceCents === 0 ? null : (profitCents / priceCents) * 100,
  };
}

/** The CostingInput a product's stored UnitCost implies, for round-tripping. */
export function breakdownToUnitCost(breakdown: CostBreakdown): {
  materialCents: Cents;
  machineCents: Cents;
  laborCents: Cents;
  consumableCents: Cents;
  packagingCents: Cents;
} {
  return {
    materialCents: breakdown.materialCents,
    // Setup is bench time, so it belongs with labor in the shared shape —
    // the template has no setup column and inventing one would fork the format.
    machineCents: breakdown.machineCents,
    laborCents: breakdown.laborCents + breakdown.setupCents,
    consumableCents: breakdown.consumableCents,
    packagingCents: breakdown.packagingCents,
  };
}

// Core data schema (plan.md §5).
//
// The Tier / UnitCost / Product block below is SHARED with Booth Mode and is
// duplicated byte-for-byte in ../booth-mode/src/core-data/types.ts. It is the
// contract between the two apps, alongside core-data/template.ts. Change it in
// one repo and you MUST change the other.
//
// All money fields are integer CENTAVOS.

export type Cents = number;

// ---------------------------------------------------------------------------
// SHARED with Booth Mode — keep byte-identical.
// ---------------------------------------------------------------------------

/**
 * A merchandising tier — a hypothesis about how a product will sell, which
 * decides how deep to stock it ("Flagship – go deep", "Hero – exhibition").
 *
 * Named data rather than a 1-5 enum, because the tiers are strategy roles that
 * get revised as real sales data arrives. Forge Log owns editing them; Booth
 * Mode reads them and produces the sales figures that justify moving a product
 * between them.
 */
export interface Tier {
  id: string;
  label: string;
  sortOrder: number;
  color: string;
  notes?: string;
}

/** Per-unit cost breakdown. Mirrors the Costing line types below. */
export interface UnitCost {
  materialCents: Cents;
  machineCents: Cents;
  laborCents: Cents;
  consumableCents: Cents;
  packagingCents: Cents;
}

export interface Product {
  id: string;
  /** The vendor's own catalog number. Stable across re-imports. */
  sku: string;
  name: string;
  variants: string[];
  tierId: string;
  /** Production method — joins to the machine catalog below. */
  machine?: string;
  photoRef?: string;

  cost: UnitCost;
  /** The vendor's standard/direct price. */
  housePriceCents: Cents;
  /** What is actually charged at the fair. */
  sellingPriceCents: Cents;

  /** Workshop stock on hand, per variant. */
  stockByVariant: Record<string, number>;
  /** Minutes to make one. */
  productionMinutes?: number;
  restockThreshold?: number;
  active: boolean;
  notes?: string;
  costingRef?: string;
}

export const EMPTY_COST: UnitCost = {
  materialCents: 0,
  machineCents: 0,
  laborCents: 0,
  consumableCents: 0,
  packagingCents: 0,
};

// ---------------------------------------------------------------------------
// Forge Log's own entities.
// ---------------------------------------------------------------------------

export interface Machine {
  id: string;
  brand: string;
  model: string;
  type: "diode" | "co2" | "fiber" | "vinyl";
  wattageOrForce?: number;
  bedW: number;
  bedH: number;
  source: "catalog" | "custom";
  /** Short key written to the shared template's `machine` column: "laser". */
  slug?: string;
  notes?: string;
}

export interface Material {
  id: string;
  name: string;
  category: "wood" | "acrylic" | "leather" | "vinyl" | "paper" | "metal" | "other";
  thickness: number;
  sheetW: number;
  sheetH: number;
  sheetCostCents?: Cents;
  supplier?: string;
  notes?: string;
}

export interface Setting {
  id: string;
  machineId: string;
  materialId: string;
  operation: "cut" | "engrave" | "score" | "mark" | "weed";
  params: Record<string, number>;
  resultRating: 1 | 2 | 3 | 4 | 5;
  photoRefs: string[];
  notes?: string;
  testedAt: string;
  verified: boolean;
}

export interface CostingLine {
  type: "material" | "machineTime" | "labor" | "consumable" | "packaging" | "fee";
  qty: number;
  unitCostCents: Cents;
}

export interface Costing {
  id: string;
  productId?: string;
  lines: CostingLine[];
  marginPct: number;
  computed?: {
    costCents: Cents;
    suggestedPriceCents: Cents;
  };
}

// v1.5
export interface Offcut {
  id: string;
  materialId: string;
  w: number;
  h: number;
  thickness: number;
  qty: number;
  binLocation?: string;
  photoRef?: string;
  addedAt: string;
}

// v2 (Bench)
export interface QuoteJob {
  id: string;
  clientRef: string;
  lines: CostingLine[];
  depositPct: number;
  deadline?: string;
  status: "quote" | "accepted" | "in_progress" | "ready" | "delivered" | "paid";
  publicToken?: string;
  events: unknown[];
}

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

export type MachineType = "diode" | "co2" | "fiber" | "vinyl";

export interface Machine {
  id: string;
  brand: string;
  model: string;
  type: MachineType;
  /** Watts for lasers, grams of down-force for cutters. null = unknown. */
  wattageOrForce: number | null;
  /** Working area in mm. null = unknown; the app asks rather than guessing. */
  bedW: number | null;
  bedH: number | null;
  source: "catalog" | "custom";
  /** Short key written to the shared template's `machine` column: "laser". */
  slug?: string;
  /**
   * Whether the user has confirmed the specs. Catalog entries ship false:
   * they are community-sourced (plan.md §12) and "will my job fit on the bed"
   * is not a question to answer from an unverified table.
   */
  specsVerified: boolean;
  /** Bench rate for costing, in centavos per hour. */
  rateCentsPerHour?: Cents;
  /** Whether this machine is in the user's workshop. */
  active: boolean;
  notes?: string;
}

export type MaterialCategory =
  | "wood"
  | "acrylic"
  | "leather"
  | "vinyl"
  | "paper"
  | "metal"
  | "other";

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  thickness: number;
  /** Sheet size in mm. */
  sheetW: number;
  sheetH: number;
  sheetCostCents?: Cents;
  supplier?: string;
  notes?: string;
}

export type Operation = "cut" | "engrave" | "score" | "mark" | "weed";

export interface Setting {
  id: string;
  machineId: string;
  materialId: string;
  operation: Operation;
  /** Keys depend on machine type — see lib/params.ts. */
  params: Record<string, number>;
  resultRating: 1 | 2 | 3 | 4 | 5;
  /** Ids into the photos table. Local blobs until Storage sync (P2). */
  photoRefs: string[];
  notes?: string;
  testedAt: string;
  /** The user ran this and it worked. Ranks above unverified in search. */
  verified: boolean;
  updatedAt: string;
}

/** A test-result photo, compressed client-side and held locally until P2 sync. */
export interface Photo {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  /** Set once uploaded to Storage (P2). */
  remoteUrl?: string;
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

/**
 * A reusable cost pattern — "leather keychain", "small candle" — applied to
 * many products at once.
 *
 * It stores the *inputs* (which sheet, how much of it, how many minutes) rather
 * than a frozen total, so re-applying after a material price rises produces the
 * new cost instead of the old one. Margin and fee are deliberately absent: they
 * are decisions per product, not properties of how a thing is made.
 */
export interface CostRecipe {
  id: string;
  name: string;
  materialLines: { materialId: string; usagePct: number }[];
  machineLines: { machineId: string; minutes: number }[];
  laborMinutes: number;
  laborRateCentsPerHour?: Cents;
  consumables: { label: string; cents: Cents }[];
  packagingCents: Cents;
  setupMinutes: number;
  /** Batch the setup time is spread across. */
  batchQty: number;
  notes?: string;
  updatedAt: string;
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

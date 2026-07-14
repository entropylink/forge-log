// Core data schema (plan.md §5). Duplicated locally with Booth Mode's
// core-data/types.ts until these apps share a real package — keep the
// `Product` shape in sync by hand until then.

export interface Machine {
  id: string;
  brand: string;
  model: string;
  type: "diode" | "co2" | "fiber" | "vinyl";
  wattageOrForce?: number;
  bedW: number;
  bedH: number;
  source: "catalog" | "custom";
  notes?: string;
}

export interface Material {
  id: string;
  name: string;
  category: "wood" | "acrylic" | "leather" | "vinyl" | "paper" | "metal" | "other";
  thickness: number;
  sheetW: number;
  sheetH: number;
  sheetCostMXN?: number;
  sheetCostUSD?: number;
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

// SHARED with Booth Mode — keep this shape identical across both repos.
export interface Product {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  variants: string[];
  photoRef?: string;
  defaultPriceMXN: number;
  costingId?: string;
  stockByVariant: Record<string, number>;
}

export interface CostingLine {
  type: "material" | "machineTime" | "labor" | "consumable" | "fee";
  qty: number;
  unitCost: number;
}

export interface Costing {
  id: string;
  productId?: string;
  lines: CostingLine[];
  marginPct: number;
  computed?: {
    cost: number;
    suggestedPrice: number;
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

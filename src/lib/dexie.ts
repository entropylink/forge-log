// Local-first Dexie (IndexedDB) store (plan.md §4). Source of truth on device;
// Firestore sync (P2) reconciles per-record updatedAt.

import Dexie, { type Table } from "dexie";
import type {
  Costing,
  Machine,
  Material,
  Offcut,
  Product,
  Setting,
  Tier,
} from "../core-data/types";

export class ForgeLogDB extends Dexie {
  machines!: Table<Machine, string>;
  materials!: Table<Material, string>;
  settings!: Table<Setting, string>;
  tiers!: Table<Tier, string>;
  products!: Table<Product, string>;
  costings!: Table<Costing, string>;
  offcuts!: Table<Offcut, string>;

  constructor() {
    super("forge-log");
    this.version(1).stores({
      machines: "id",
      materials: "id",
      settings: "id, machineId, materialId",
      tiers: "id, sortOrder",
      products: "id, sku, tierId, active",
      costings: "id, productId",
      offcuts: "id, materialId",
    });
  }
}

export const db = new ForgeLogDB();

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

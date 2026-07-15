// Local-first Dexie (IndexedDB) store (plan.md §4). Source of truth on device;
// Firestore sync (P2) will reconcile per-record updatedAt.

import Dexie, { type Table } from "dexie";
import { catalogMachines, CATALOG_VERSION } from "./catalog";
import type {
  Costing,
  Machine,
  Material,
  Offcut,
  Photo,
  Product,
  Setting,
  Tier,
} from "../core-data/types";

export class ForgeLogDB extends Dexie {
  machines!: Table<Machine, string>;
  materials!: Table<Material, string>;
  settings!: Table<Setting, string>;
  photos!: Table<Photo, string>;
  tiers!: Table<Tier, string>;
  products!: Table<Product, string>;
  costings!: Table<Costing, string>;
  offcuts!: Table<Offcut, string>;

  constructor() {
    super("forge-log");
    this.version(1).stores({
      machines: "id, brand, type, active",
      materials: "id, category",
      settings: "id, machineId, materialId, operation, [machineId+materialId]",
      photos: "id",
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

const CATALOG_KEY = "forge-log.catalogVersion";

/**
 * Seed the machine catalog on first run, and top it up when the pack version
 * moves (plan.md §5: "catalog updates OTA as JSON").
 *
 * Only ever *adds*. A machine the user has activated, re-rated or corrected the
 * bed size on is theirs — a catalog refresh must not overwrite that work.
 */
export async function seedCatalog(): Promise<void> {
  const seenVersion = Number(localStorage.getItem(CATALOG_KEY) ?? "0");
  const count = await db.machines.count();
  if (count > 0 && seenVersion >= CATALOG_VERSION) return;

  const existing = new Set((await db.machines.toArray()).map((m) => m.id));
  const toAdd = catalogMachines().filter((m) => !existing.has(m.id));
  if (toAdd.length > 0) await db.machines.bulkAdd(toAdd);

  localStorage.setItem(CATALOG_KEY, String(CATALOG_VERSION));
}

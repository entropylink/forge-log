// Local-first Dexie (IndexedDB) store (plan.md §4). Source of truth on device;
// Firestore sync (P2) will reconcile per-record updatedAt.

import Dexie, { type Table } from "dexie";
import { catalogMachines, CATALOG_VERSION } from "./catalog";
import type {
  Costing,
  CostRecipe,
  Machine,
  Material,
  Offcut,
  Photo,
  Product,
  Setting,
  Tier,
} from "../core-data/types";

/** A soft-delete marker, so a delete propagates through sync (see sync/merge.ts). */
export interface TombRow {
  collection: string;
  id: string;
  deletedAt: string;
}

/**
 * Set true by the sync engine while it applies REMOTE records, so the write
 * hooks below preserve the remote `updatedAt` instead of stamping "now" — which
 * would defeat last-write-wins. User writes run with this false and get stamped.
 */
let applyingSync = false;
export function setApplyingSync(v: boolean): void {
  applyingSync = v;
}

const nowIso = (): string => new Date().toISOString();

/** Tables whose rows carry a `updatedAt` LWW clock and sync as definitions. */
const SYNC_RECORD_TABLES = [
  "products",
  "tiers",
  "machines",
  "materials",
  "settings",
  "costings",
  "recipes",
] as const;

export class ForgeLogDB extends Dexie {
  machines!: Table<Machine, string>;
  materials!: Table<Material, string>;
  settings!: Table<Setting, string>;
  photos!: Table<Photo, string>;
  tiers!: Table<Tier, string>;
  products!: Table<Product, string>;
  costings!: Table<Costing, string>;
  recipes!: Table<CostRecipe, string>;
  offcuts!: Table<Offcut, string>;
  tombstones!: Table<TombRow, [string, string]>;

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

    // v2: reusable cost recipes for bulk costing. Additive — Dexie carries the
    // existing tables forward untouched.
    this.version(2).stores({ recipes: "id, name" });

    // v3: sync. Tombstones table for deletes; write hooks stamp updatedAt.
    this.version(3).stores({ tombstones: "[collection+id], collection" });

    for (const name of SYNC_RECORD_TABLES) {
      const table = this.table(name);
      table.hook("creating", (_pk, obj: { updatedAt?: string }) => {
        if (!applyingSync && !obj.updatedAt) obj.updatedAt = nowIso();
      });
      table.hook("updating", () => (applyingSync ? undefined : { updatedAt: nowIso() }));
    }
  }
}

export const db = new ForgeLogDB();

/**
 * Delete a definition record AND drop a tombstone, so the delete survives sync
 * instead of the record resurrecting from another device. Use this everywhere a
 * synced record is deleted.
 */
export async function softDelete(collection: string, id: string): Promise<void> {
  await db.transaction("rw", db.table(collection), db.tombstones, async () => {
    await db.table(collection).delete(id);
    await db.tombstones.put({ collection, id, deletedAt: nowIso() });
  });
}

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

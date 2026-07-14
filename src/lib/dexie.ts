// Local-first Dexie (IndexedDB) store (plan.md §4). Schema to be filled in
// at P0 once core-data types stabilize.

import Dexie, { type Table } from "dexie";
import type { Machine, Material, Setting, Product, Costing, Offcut } from "../core-data/types";

export class ForgeLogDB extends Dexie {
  machines!: Table<Machine, string>;
  materials!: Table<Material, string>;
  settings!: Table<Setting, string>;
  products!: Table<Product, string>;
  costings!: Table<Costing, string>;
  offcuts!: Table<Offcut, string>;

  constructor() {
    super("forge-log");
    this.version(1).stores({
      machines: "id",
      materials: "id",
      settings: "id, machineId, materialId",
      products: "id",
      costings: "id, productId",
      offcuts: "id, materialId",
    });
  }
}

export const db = new ForgeLogDB();

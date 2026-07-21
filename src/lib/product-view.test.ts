import { describe, expect, it } from "vitest";
import { viewProducts, type ViewOptions } from "./product-view";
import type { Product, UnitCost } from "../core-data/types";

const cost = (materialCents: number): UnitCost => ({
  materialCents,
  machineCents: 0,
  laborCents: 0,
  consumableCents: 0,
  packagingCents: 0,
});

function product(over: Partial<Product>): Product {
  return {
    id: over.id ?? "p",
    sku: "",
    name: "Item",
    variants: ["—"],
    tierId: "t1",
    cost: cost(0),
    housePriceCents: 0,
    sellingPriceCents: 0,
    stockByVariant: {},
    active: true,
    ...over,
  };
}

const opts = (o: Partial<ViewOptions>): ViewOptions => ({
  query: "",
  tierId: "",
  sort: "name",
  ...o,
});

const rank = (id: string): number => (id === "t1" ? 0 : id === "t2" ? 1 : 99);

describe("viewProducts — search", () => {
  const products = [
    product({ id: "a", name: "Separador Roble", sku: "SKU9" }),
    product({ id: "b", name: "Poción Azul", sku: "PZ1", variants: ["Nogal"] }),
  ];

  it("matches on name, case- and accent-insensitively", () => {
    expect(viewProducts(products, opts({ query: "pocion" }), rank).map((p) => p.id)).toEqual(["b"]);
  });
  it("matches on sku and variant", () => {
    expect(viewProducts(products, opts({ query: "sku9" }), rank).map((p) => p.id)).toEqual(["a"]);
    expect(viewProducts(products, opts({ query: "nogal" }), rank).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("viewProducts — filter by tier", () => {
  it("keeps only the chosen tier", () => {
    const products = [product({ id: "a", tierId: "t1" }), product({ id: "b", tierId: "t2" })];
    expect(viewProducts(products, opts({ tierId: "t2" }), rank).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("viewProducts — sort", () => {
  const products = [
    product({ id: "mid", name: "B", sellingPriceCents: 5000, cost: cost(1000), tierId: "t2" }),
    product({ id: "lo", name: "C", sellingPriceCents: 2500, cost: cost(0), tierId: "t1" }),
    product({ id: "hi", name: "A", sellingPriceCents: 9000, cost: cost(2000), tierId: "t2" }),
  ];

  it("name A→Z", () => {
    expect(viewProducts(products, opts({ sort: "name" }), rank).map((p) => p.name)).toEqual(["A", "B", "C"]);
  });
  it("price high→low", () => {
    expect(viewProducts(products, opts({ sort: "price" }), rank).map((p) => p.id)).toEqual(["hi", "mid", "lo"]);
  });
  it("margin high→low, uncosted last", () => {
    // hi: 9000-2000=7000, mid: 5000-1000=4000, lo: no cost → null → last
    expect(viewProducts(products, opts({ sort: "margin" }), rank).map((p) => p.id)).toEqual(["hi", "mid", "lo"]);
  });
  it("cost high→low", () => {
    expect(viewProducts(products, opts({ sort: "cost" }), rank).map((p) => p.id)).toEqual(["hi", "mid", "lo"]);
  });
  it("by tier, then name", () => {
    expect(viewProducts(products, opts({ sort: "tier" }), rank).map((p) => p.id)).toEqual(["lo", "hi", "mid"]);
  });
});

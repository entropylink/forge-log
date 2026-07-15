import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  emptyTemplateCSV,
  exportCatalogCSV,
  importCatalogCSV,
  retailPriceFromHouse,
  tierIdFromLabel,
  totalUnitCost,
} from "./csv";
import { TEMPLATE_HEADER, parseTemplateCSV } from "../core-data/template";
import { EMPTY_COST } from "../core-data/types";

const REAL_CSV = readFileSync(
  fileURLToPath(new URL("./__fixtures__/feria-stock-plan.csv", import.meta.url)),
  "utf8",
);

describe("tierIdFromLabel", () => {
  it("matches Booth Mode's tier ids exactly", () => {
    // Both apps must land on the same id or the tiers fork between them.
    expect(tierIdFromLabel("Flagship – go deep")).toBe("flagship");
    expect(tierIdFromLabel("Off-theme – minimal")).toBe("off-theme");
    expect(tierIdFromLabel("Hero – exhibition")).toBe("hero");
  });
});

describe("retailPriceFromHouse", () => {
  it("uses the same 1.25 markup and rounding as Booth Mode", () => {
    expect(retailPriceFromHouse(6000)).toBe(7500);
    expect(retailPriceFromHouse(25000)).toBe(31300);
    expect(retailPriceFromHouse(300)).toBe(400);
  });
});

describe("totalUnitCost", () => {
  it("adds every cost line", () => {
    expect(totalUnitCost(EMPTY_COST)).toBe(0);
    expect(
      totalUnitCost({
        materialCents: 1200,
        machineCents: 300,
        laborCents: 2000,
        consumableCents: 100,
        packagingCents: 400,
      }),
    ).toBe(4000);
  });
});

describe("importing the vendor's real sheet as a catalog", () => {
  const result = importCatalogCSV(REAL_CSV);

  it("imports every product without errors", () => {
    expect(result.issues).toEqual([]);
    expect(result.products).toHaveLength(61);
  });

  it("recovers the same five tiers Booth Mode does", () => {
    expect(result.tiers.map((t) => t.id)).toEqual([
      "flagship",
      "impulse",
      "mid",
      "hero",
      "off-theme",
    ]);
  });

  it("reads workshop stock into stockByVariant", () => {
    const separador = result.products.find((p) => p.name === "SEPARADOR M2");
    expect(separador?.stockByVariant["—"]).toBe(32);
  });

  it("reads the production method that joins to the machine catalog", () => {
    const tower = result.products.find((p) => p.name === "DICE TOWER");
    expect(tower?.machine).toBe("laser");
  });
});

describe("exporting the catalog", () => {
  const { products, tiers } = importCatalogCSV(REAL_CSV);
  const exported = exportCatalogCSV(products, tiers);

  it("writes the canonical header", () => {
    expect(exported.split("\n")[0]).toBe(TEMPLATE_HEADER.join(","));
    expect(emptyTemplateCSV().trim()).toBe(TEMPLATE_HEADER.join(","));
  });

  it("round-trips through its own importer", () => {
    const back = importCatalogCSV(exported);
    expect(back.issues).toEqual([]);
    expect(back.tiers).toEqual(tiers);
    expect(back.products).toEqual(products);
  });

  it("asserts nothing about the fair columns it cannot know", () => {
    const { rows } = parseTemplateCSV(exported);
    expect(rows.every((r) => r.goalQty === 0)).toBe(true);
    expect(rows.every((r) => r.packedQty === 0)).toBe(true);
    expect(rows.every((r) => r.made === false)).toBe(true);
  });

  it("leaves margin blank while cost is uncaptured, rather than claiming 100%", () => {
    const { rows } = parseTemplateCSV(exported);
    expect(rows.every((r) => totalUnitCost({
      materialCents: r.costMaterialCents,
      machineCents: r.costMachineCents,
      laborCents: r.costLaborCents,
      consumableCents: r.costConsumableCents,
      packagingCents: r.costPackagingCents,
    }) === 0)).toBe(true);

    const marginCol = TEMPLATE_HEADER.indexOf("margin_unit");
    const body = exported.trim().split("\n").slice(1);
    expect(body.every((line) => line.split(",")[marginCol] === "")).toBe(true);
  });

  it("writes one row per variant", () => {
    const twoVariants = [
      {
        id: "p1",
        sku: "10",
        name: "Coasters",
        variants: ["Roble", "Nogal"],
        tierId: "mid",
        cost: EMPTY_COST,
        housePriceCents: 9600,
        sellingPriceCents: 12000,
        stockByVariant: { Roble: 5, Nogal: 3 },
        active: true,
      },
    ];
    const csv = exportCatalogCSV(twoVariants, tiers);
    const { rows } = parseTemplateCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.variant)).toEqual(["Roble", "Nogal"]);
    expect(rows.map((r) => r.currentQty)).toEqual([5, 3]);
  });

  it("carries a full cost breakdown and margin when costs are captured", () => {
    const costed = [
      {
        id: "p1",
        sku: "53",
        name: "SEPARADOR M2",
        variants: ["—"],
        tierId: "flagship",
        cost: {
          materialCents: 1200,
          machineCents: 300,
          laborCents: 2000,
          consumableCents: 100,
          packagingCents: 400,
        },
        housePriceCents: 6000,
        sellingPriceCents: 7500,
        stockByVariant: { "—": 32 },
        productionMinutes: 8,
        active: true,
      },
    ];
    const csv = exportCatalogCSV(costed, tiers);
    const cells = csv.trim().split("\n")[1].split(",");

    expect(cells[TEMPLATE_HEADER.indexOf("unit_cost")]).toBe("40.00");
    expect(cells[TEMPLATE_HEADER.indexOf("margin_unit")]).toBe("35.00");
    expect(cells[TEMPLATE_HEADER.indexOf("margin_pct")]).toBe("46.7");

    const back = importCatalogCSV(csv);
    expect(back.products[0].cost).toEqual(costed[0].cost);
    expect(back.products[0].productionMinutes).toBe(8);
  });
});

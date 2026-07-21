import { describe, expect, it } from "vitest";
import { searchSettings, siblingSettings } from "./search";
import { buildTestGrid, fieldsFor, summarizeParams } from "./params";
import { catalogMachines, fitsOnBed, needsSpecConfirmation } from "./catalog";
import type { Machine, Material, Setting } from "../core-data/types";

const LASER: Machine = {
  id: "laser",
  brand: "xTool",
  model: "P2",
  type: "co2",
  wattageOrForce: 55,
  bedW: 600,
  bedH: 308,
  source: "catalog",
  slug: "laser",
  specsVerified: true,
  active: true,
};

const CUTTER: Machine = {
  id: "cameo",
  brand: "Silhouette",
  model: "Cameo 5",
  type: "vinyl",
  wattageOrForce: 5000,
  bedW: 305,
  bedH: 3000,
  source: "catalog",
  slug: "cameo",
  specsVerified: true,
  active: true,
};

const BIRCH3: Material = {
  id: "birch3",
  name: "Birch plywood",
  category: "wood",
  thickness: 3,
  sheetW: 600,
  sheetH: 300,
};
const BIRCH6: Material = { ...BIRCH3, id: "birch6", thickness: 6 };
const VINYL: Material = {
  id: "vinyl",
  name: "Oracal 651",
  category: "vinyl",
  thickness: 0.1,
  sheetW: 305,
  sheetH: 1000,
};

const MATERIALS = [BIRCH3, BIRCH6, VINYL];
const MACHINES = [LASER, CUTTER];

const day = (n: number): string => new Date(Date.UTC(2026, 6, n)).toISOString();

function setting(over: Partial<Setting> & Pick<Setting, "id">): Setting {
  return {
    machineId: "laser",
    materialId: "birch3",
    operation: "cut",
    params: { power: 80, speed: 15, passes: 1 },
    resultRating: 3,
    photoRefs: [],
    testedAt: day(1),
    verified: false,
    updatedAt: day(1),
    ...over,
  };
}

describe("searchSettings", () => {
  const settings = [
    setting({ id: "birch3-cut-good", resultRating: 5, verified: true, testedAt: day(10) }),
    setting({ id: "birch3-cut-poor", resultRating: 1, testedAt: day(10) }),
    setting({ id: "birch3-engrave", operation: "engrave", resultRating: 5, testedAt: day(10) }),
    setting({ id: "birch6-cut", materialId: "birch6", resultRating: 5, testedAt: day(10) }),
    setting({
      id: "vinyl-cut",
      machineId: "cameo",
      materialId: "vinyl",
      resultRating: 4,
      testedAt: day(10),
    }),
  ];
  const ctx = { settings, machines: MACHINES, materials: MATERIALS };

  it("finds the setting the plan's own example asks for", () => {
    // "3mm birch cut" — thickness, material, operation, all at once.
    const rows = searchSettings("3mm birch cut", ctx);
    expect(rows[0].setting.id).toBe("birch3-cut-good");
    // The 6mm sheet and the engrave setting rank below it.
    const ids = rows.map((r) => r.setting.id);
    expect(ids.indexOf("birch3-cut-good")).toBeLessThan(ids.indexOf("birch6-cut"));
    expect(ids.indexOf("birch3-cut-good")).toBeLessThan(ids.indexOf("birch3-engrave"));
  });

  it("ranks verified and well-rated above the rest, all else equal", () => {
    const rows = searchSettings("birch cut", ctx);
    const ids = rows.map((r) => r.setting.id);
    expect(ids.indexOf("birch3-cut-good")).toBeLessThan(ids.indexOf("birch3-cut-poor"));
  });

  it("matches on the machine as well as the material", () => {
    expect(searchSettings("cameo", ctx)[0].setting.id).toBe("vinyl-cut");
    expect(searchSettings("silhouette", ctx)[0].setting.id).toBe("vinyl-cut");
  });

  it("understands operations in Spanish", () => {
    const rows = searchSettings("grabar", ctx);
    expect(rows[0].setting.operation).toBe("engrave");
  });

  it("reads '3 mm' and '3mm' the same", () => {
    expect(searchSettings("3mm birch", ctx)[0].setting.materialId).toBe("birch3");
    expect(searchSettings("6mm birch", ctx)[0].setting.materialId).toBe("birch6");
  });

  it("ignores accents", () => {
    const withAccent = [...settings, setting({ id: "acc", notes: "probé con máscara" })];
    const rows = searchSettings("probe mascara", { ...ctx, settings: withAccent });
    expect(rows[0].setting.id).toBe("acc");
  });

  it("returns everything for an empty query, best first", () => {
    const rows = searchSettings("", ctx);
    expect(rows).toHaveLength(5);
    expect(rows[0].setting.id).toBe("birch3-cut-good");
  });

  it("returns nothing rather than everything for a query nobody matches", () => {
    expect(searchSettings("titanium", ctx)).toEqual([]);
  });

  it("joins the machine and material onto each row", () => {
    const row = searchSettings("vinyl", ctx)[0];
    expect(row.machine?.model).toBe("Cameo 5");
    expect(row.material?.name).toBe("Oracal 651");
  });
});

describe("siblingSettings", () => {
  it("lists the other settings for the same machine and material", () => {
    const settings = [
      setting({ id: "a", resultRating: 2 }),
      setting({ id: "b", resultRating: 5 }),
      setting({ id: "c", materialId: "birch6" }),
    ];
    const siblings = siblingSettings(settings[0], settings);
    expect(siblings.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("params", () => {
  it("gives a laser power and speed, and a cutter blade and force", () => {
    expect(fieldsFor("co2", "cut").map((f) => f.key)).toEqual([
      "power",
      "speed",
      "passes",
      "freq",
    ]);
    expect(fieldsFor("vinyl", "cut").map((f) => f.key)).toEqual([
      "bladeDepth",
      "force",
      "speed",
      "passes",
    ]);
  });

  it("only offers lpi where it means something", () => {
    expect(fieldsFor("diode", "cut").map((f) => f.key)).not.toContain("lpi");
    expect(fieldsFor("diode", "engrave").map((f) => f.key)).toContain("lpi");
  });

  it("summarizes a setting for a list row", () => {
    expect(summarizeParams("diode", "cut", { power: 80, speed: 15, passes: 2 })).toBe(
      "80% · 15mm/s · 2×",
    );
  });
});

describe("buildTestGrid", () => {
  it("sweeps power against speed for a laser", () => {
    const grid = buildTestGrid("co2", "cut");
    expect(grid.rowKey).toBe("power");
    expect(grid.colKey).toBe("speed");
    expect(grid.rowValues).toEqual([20, 40, 60, 80, 100]);
    expect(grid.cells).toHaveLength(25);
    expect(grid.cells[0].params).toMatchObject({ power: 20, passes: 1 });
  });

  it("sweeps blade depth against force for a cutter", () => {
    const grid = buildTestGrid("vinyl", "cut");
    expect(grid.rowKey).toBe("bladeDepth");
    expect(grid.colKey).toBe("force");
  });

  it("adds lpi only when engraving", () => {
    expect(buildTestGrid("co2", "engrave").cells[0].params.lpi).toBe(300);
    expect(buildTestGrid("co2", "cut").cells[0].params.lpi).toBeUndefined();
  });

  it("clamps the grid to a size a human will actually run", () => {
    expect(buildTestGrid("co2", "cut", 1).rowValues).toHaveLength(2);
    expect(buildTestGrid("co2", "cut", 99).rowValues).toHaveLength(8);
  });
});

describe("machine catalog", () => {
  const machines = catalogMachines();

  it("ships every entry unverified", () => {
    // Community-sourced (plan.md §12) — the user confirms before we rely on it.
    expect(machines.every((m) => m.specsVerified === false)).toBe(true);
    expect(machines.every((m) => m.active === false)).toBe(true);
    expect(machines.every((m) => m.source === "catalog")).toBe(true);
  });

  it("covers the brands the plan names", () => {
    const brands = new Set(machines.map((m) => m.brand));
    for (const brand of ["xTool", "Glowforge", "OMTech", "Silhouette", "Cricut", "Brother"]) {
      expect(brands.has(brand)).toBe(true);
    }
    expect(machines.length).toBeGreaterThanOrEqual(35);
  });

  it("ships the vendor's own machines with sourced starting specs, still unverified", () => {
    // v2 filled these from sourced specs (xTool M2 laser bed, Cameo 5α width),
    // but they stay unverified until the user confirms — the app still asks.
    const m2 = machines.find((m) => m.id === "xtool-m2");
    const alpha = machines.find((m) => m.id === "cameo-5-alpha");
    expect(m2?.bedW).toBe(426);
    expect(m2?.bedH).toBe(320);
    expect(alpha?.bedW).toBe(305);
    expect(m2?.specsVerified).toBe(false);
    expect(needsSpecConfirmation(m2!)).toBe(true);
    expect(needsSpecConfirmation(alpha!)).toBe(true);
  });

  it("still leaves genuinely unsourced specs null rather than inventing them", () => {
    // The honesty principle holds wherever a spec could not be sourced.
    const nulls = machines.filter((m) => m.bedW === null);
    expect(nulls.length).toBeGreaterThan(0);
    for (const m of nulls) expect(needsSpecConfirmation(m)).toBe(true);
  });

  it("carries the slug the shared template joins on", () => {
    expect(machines.find((m) => m.id === "xtool-p2")?.slug).toBe("laser");
    expect(machines.find((m) => m.id === "cameo-5")?.slug).toBe("cameo");
  });

  it("has unique ids", () => {
    expect(new Set(machines.map((m) => m.id)).size).toBe(machines.length);
  });
});

describe("fitsOnBed", () => {
  it("answers for a machine whose bed is known", () => {
    expect(fitsOnBed(LASER, 500, 300)).toBe(true);
    expect(fitsOnBed(LASER, 700, 300)).toBe(false);
  });

  it("tries the job rotated", () => {
    // 308×600 does not fit a 600×308 bed straight, but does turned 90°.
    expect(fitsOnBed(LASER, 308, 600)).toBe(true);
  });

  it("says 'unknown' rather than yes when the bed size is unknown", () => {
    // The dangerous answer here is a confident one.
    const unknown: Machine = { ...LASER, bedW: null, bedH: null };
    expect(fitsOnBed(unknown, 100, 100)).toBeNull();
  });
});

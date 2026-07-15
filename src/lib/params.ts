// Which knobs a setting has, per machine type (plan.md §5).
//
// A diode laser and a vinyl cutter share nothing but "speed": one has power and
// passes, the other has blade depth and force. Rather than one god-form with
// half the fields greyed out, the form is generated from this table.

import type { MachineType, Operation } from "../core-data/types";

export interface ParamField {
  key: string;
  /** i18n key under `params.` */
  labelKey: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Only shown for these operations. Absent = all. */
  operations?: Operation[];
}

const POWER: ParamField = { key: "power", labelKey: "power", unit: "%", min: 0, max: 100, step: 1 };
const SPEED_MM: ParamField = { key: "speed", labelKey: "speed", unit: "mm/s", min: 1, max: 1000, step: 1 };
const PASSES: ParamField = { key: "passes", labelKey: "passes", unit: "×", min: 1, max: 20, step: 1 };
const LPI: ParamField = {
  key: "lpi",
  labelKey: "lpi",
  unit: "lpi",
  min: 50,
  max: 1000,
  step: 10,
  operations: ["engrave", "mark"],
};
const FREQ: ParamField = { key: "freq", labelKey: "freq", unit: "kHz", min: 1, max: 200, step: 1 };
const BLADE: ParamField = { key: "bladeDepth", labelKey: "bladeDepth", unit: "", min: 0, max: 10, step: 1 };
const FORCE: ParamField = { key: "force", labelKey: "force", unit: "g", min: 1, max: 500, step: 1 };
const SPEED_UNITLESS: ParamField = { key: "speed", labelKey: "speed", unit: "", min: 1, max: 30, step: 1 };

export const PARAM_FIELDS: Record<MachineType, ParamField[]> = {
  diode: [POWER, SPEED_MM, PASSES, LPI],
  co2: [POWER, SPEED_MM, PASSES, LPI, FREQ],
  fiber: [POWER, SPEED_MM, PASSES, FREQ],
  vinyl: [BLADE, FORCE, SPEED_UNITLESS, PASSES],
};

export const OPERATIONS_BY_TYPE: Record<MachineType, Operation[]> = {
  diode: ["cut", "engrave", "score"],
  co2: ["cut", "engrave", "score", "mark"],
  fiber: ["engrave", "mark", "cut"],
  vinyl: ["cut", "score", "weed"],
};

export function fieldsFor(type: MachineType, operation: Operation): ParamField[] {
  return PARAM_FIELDS[type].filter(
    (f) => f.operations === undefined || f.operations.includes(operation),
  );
}

/** Human-readable one-liner: "80% · 15mm/s · 2×". */
export function summarizeParams(
  type: MachineType,
  operation: Operation,
  params: Record<string, number>,
): string {
  return fieldsFor(type, operation)
    .filter((f) => params[f.key] !== undefined)
    .map((f) => `${params[f.key]}${f.unit}`)
    .join(" · ");
}

// --- test grid (plan.md §6 M1) ----------------------------------------------

export interface TestGridCell {
  row: number;
  col: number;
  params: Record<string, number>;
}

export interface TestGrid {
  /** The varied axes, e.g. "power" and "speed". */
  rowKey: string;
  colKey: string;
  rowValues: number[];
  colValues: number[];
  cells: TestGridCell[];
}

/**
 * Suggest a matrix to run on a new material: the two axes that actually matter
 * swept across their range, everything else held at a sensible constant. The
 * user runs the grid, finds the cell that worked, and saves it as a Setting.
 *
 * The values are a spread across the machine's range, not advice about any
 * particular material — nobody can know that without cutting it.
 */
export function buildTestGrid(
  type: MachineType,
  operation: Operation,
  steps = 5,
): TestGrid {
  const n = Math.max(2, Math.min(8, steps));
  const spread = (min: number, max: number): number[] =>
    Array.from({ length: n }, (_, i) => Math.round(min + ((max - min) * i) / (n - 1)));

  if (type === "vinyl") {
    // Blade depth against force is the pair that decides a clean cut.
    const rowValues = spread(1, 6);
    const colValues = spread(30, 200);
    return grid("bladeDepth", "force", rowValues, colValues, { speed: 5, passes: 1 });
  }

  // Lasers: power against speed, one pass, everything else default.
  const rowValues = spread(20, 100);
  const colValues = spread(50, 400);
  const constants: Record<string, number> = { passes: 1 };
  if (operation === "engrave" || operation === "mark") constants.lpi = 300;
  return grid("power", "speed", rowValues, colValues, constants);
}

function grid(
  rowKey: string,
  colKey: string,
  rowValues: number[],
  colValues: number[],
  constants: Record<string, number>,
): TestGrid {
  const cells: TestGridCell[] = [];
  rowValues.forEach((rowValue, row) => {
    colValues.forEach((colValue, col) => {
      cells.push({
        row,
        col,
        params: { ...constants, [rowKey]: rowValue, [colKey]: colValue },
      });
    });
  });
  return { rowKey, colKey, rowValues, colValues, cells };
}

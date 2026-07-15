// Settings search (plan.md §6 M1): type "3mm birch cut" and get the setting
// you actually want, ranked by rating, verified flag and recency.
//
// Pure and offline. No index, no fuzzy library: a workshop has hundreds of
// settings, not millions, so a scan is instant and the ranking is legible.

import { stripDiacritics } from "../core-data/template";
import type { Machine, Material, Operation, Setting } from "../core-data/types";

export interface SearchRow {
  setting: Setting;
  machine: Machine | undefined;
  material: Material | undefined;
  score: number;
}

export interface SearchContext {
  settings: readonly Setting[];
  machines: readonly Machine[];
  materials: readonly Material[];
}

const OPERATION_WORDS: Record<string, Operation> = {
  cut: "cut",
  cortar: "cut",
  corte: "cut",
  engrave: "engrave",
  grabar: "engrave",
  grabado: "engrave",
  score: "score",
  marcar: "score",
  mark: "mark",
  marca: "mark",
  weed: "weed",
};

function norm(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, " ").trim();
}

/** "3mm" and "3 mm" both mean thickness 3. */
function thicknessFrom(tokens: string[]): number | null {
  for (const token of tokens) {
    const match = /^(\d+(?:\.\d+)?)(mm)?$/.exec(token);
    if (match && (match[2] === "mm" || Number(match[1]) <= 50)) return Number(match[1]);
  }
  return null;
}

/**
 * Rank settings against a free-text query.
 *
 * Everything a query token can match — material name, machine brand/model,
 * operation, thickness, notes — contributes, then quality breaks the tie:
 * a verified 5-star setting from last week beats an unverified 2-star one.
 */
export function searchSettings(query: string, ctx: SearchContext): SearchRow[] {
  const machineById = new Map(ctx.machines.map((m) => [m.id, m]));
  const materialById = new Map(ctx.materials.map((m) => [m.id, m]));

  const q = norm(query);
  const tokens = q === "" ? [] : q.split(" ");
  const wantedOperation = tokens.map((t) => OPERATION_WORDS[t]).find(Boolean);
  const wantedThickness = thicknessFrom(tokens);
  const now = Date.now();

  const rows: SearchRow[] = [];

  for (const setting of ctx.settings) {
    const machine = machineById.get(setting.machineId);
    const material = materialById.get(setting.materialId);

    const haystack = norm(
      [
        material?.name ?? "",
        material?.category ?? "",
        machine?.brand ?? "",
        machine?.model ?? "",
        setting.operation,
        setting.notes ?? "",
      ].join(" "),
    );

    let score = 0;
    let matchedAny = tokens.length === 0;

    for (const token of tokens) {
      if (OPERATION_WORDS[token]) continue; // scored below
      if (/^\d+(\.\d+)?(mm)?$/.test(token)) continue; // thickness, scored below
      if (haystack.includes(token)) {
        score += 10;
        matchedAny = true;
      } else {
        // A token nobody matches should push the row down, not silently pass.
        score -= 6;
      }
    }

    if (wantedOperation) {
      if (setting.operation === wantedOperation) {
        score += 12;
        matchedAny = true;
      } else {
        score -= 8;
      }
    }

    if (wantedThickness !== null && material) {
      if (material.thickness === wantedThickness) {
        score += 12;
        matchedAny = true;
      } else {
        score -= 4;
      }
    }

    if (!matchedAny) continue;

    // Quality, applied after relevance so it only ever breaks ties.
    score += setting.resultRating * 3;
    if (setting.verified) score += 8;

    const ageDays = (now - Date.parse(setting.testedAt)) / 86_400_000;
    if (Number.isFinite(ageDays)) score += Math.max(-5, 5 - ageDays / 60);

    rows.push({ setting, machine, material, score });
  }

  return rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.setting.resultRating - a.setting.resultRating ||
      (a.material?.name ?? "").localeCompare(b.material?.name ?? ""),
  );
}

/** Settings for one machine+material+operation — the duplicate-and-tweak list. */
export function siblingSettings(
  setting: Setting,
  settings: readonly Setting[],
): Setting[] {
  return settings
    .filter(
      (s) =>
        s.id !== setting.id &&
        s.machineId === setting.machineId &&
        s.materialId === setting.materialId,
    )
    .sort((a, b) => b.resultRating - a.resultRating);
}

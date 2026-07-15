// The machine catalog: a versioned JSON pack (plan.md §5), loaded into Dexie
// on first run and refreshable OTA later.
//
// Every entry ships `specsVerified: false`. The specs are community-sourced
// (plan.md §12) and several — including both of the vendor's own machines — have
// null bed sizes because they could not be sourced honestly. "Will my job fit"
// deserves a real answer, so the app asks rather than guessing.

import catalogPack from "../core-data/machine-catalog.json";
import type { Machine, MachineType } from "../core-data/types";

interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  type: string;
  slug: string;
  wattageOrForce: number | null;
  bedW: number | null;
  bedH: number | null;
}

export const CATALOG_VERSION: number = catalogPack.version;
export const CATALOG_NOTE: string = catalogPack.note;

export function catalogMachines(): Machine[] {
  return (catalogPack.machines as CatalogEntry[]).map((entry) => ({
    id: entry.id,
    brand: entry.brand,
    model: entry.model,
    type: entry.type as MachineType,
    wattageOrForce: entry.wattageOrForce,
    bedW: entry.bedW,
    bedH: entry.bedH,
    source: "catalog" as const,
    slug: entry.slug,
    specsVerified: false,
    active: false,
  }));
}

export function machineLabel(machine: Machine): string {
  return `${machine.brand} ${machine.model}`;
}

/** Specs the user still has to confirm before the app will rely on them. */
export function needsSpecConfirmation(machine: Machine): boolean {
  return !machine.specsVerified || machine.bedW === null || machine.bedH === null;
}

/** Whether a w×h job fits the bed. null when the bed size isn't known. */
export function fitsOnBed(
  machine: Machine,
  w: number,
  h: number,
): boolean | null {
  if (machine.bedW === null || machine.bedH === null) return null;
  const fitsStraight = w <= machine.bedW && h <= machine.bedH;
  const fitsRotated = h <= machine.bedW && w <= machine.bedH;
  return fitsStraight || fitsRotated;
}

export function catalogByBrand(): Map<string, Machine[]> {
  const byBrand = new Map<string, Machine[]>();
  for (const machine of catalogMachines()) {
    const list = byBrand.get(machine.brand) ?? [];
    list.push(machine);
    byBrand.set(machine.brand, list);
  }
  return byBrand;
}

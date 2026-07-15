// Live bindings from Dexie to the UI.

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./dexie";
import { config } from "../config";
import type {
  Costing,
  Machine,
  Material,
  Photo,
  Product,
  Setting,
  Tier,
} from "../core-data/types";

export function useMachines(): Machine[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.machines.toArray()).sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          a.brand.localeCompare(b.brand) ||
          a.model.localeCompare(b.model),
      ),
    [],
  );
}

export function useActiveMachines(): Machine[] | undefined {
  return useLiveQuery(async () => (await db.machines.toArray()).filter((m) => m.active), []);
}

export function useMaterials(): Material[] | undefined {
  return useLiveQuery(
    async () => (await db.materials.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export function useSettings(): Setting[] | undefined {
  return useLiveQuery(() => db.settings.toArray(), []);
}

export function useProducts(): Product[] | undefined {
  return useLiveQuery(
    async () => (await db.products.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
}

export function useTiers(): Tier[] | undefined {
  return useLiveQuery(
    async () => (await db.tiers.toArray()).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );
}

export function useTierMap(): Map<string, Tier> {
  const tiers = useTiers();
  return new Map((tiers ?? []).map((t) => [t.id, t]));
}

export function tierOf(tiers: Map<string, Tier>, tierId: string): Tier {
  return (
    tiers.get(tierId) ?? {
      id: tierId,
      label: tierId,
      sortOrder: 999,
      color: config.tierFallbackColor,
    }
  );
}

export function useCostings(): Costing[] | undefined {
  return useLiveQuery(() => db.costings.toArray(), []);
}

export function useCostingForProduct(productId: string | null): Costing | undefined {
  return useLiveQuery(async () => {
    if (!productId) return undefined;
    return db.costings.where("productId").equals(productId).first();
  }, [productId]);
}

export function usePhoto(photoId: string | undefined): Photo | undefined {
  return useLiveQuery(async () => {
    if (!photoId) return undefined;
    return db.photos.get(photoId);
  }, [photoId]);
}

/** Machine hourly rates for the costing engine. */
export function useMachineRates(): Map<string, number> {
  const machines = useMachines();
  return new Map(
    (machines ?? [])
      .filter((m) => m.rateCentsPerHour !== undefined)
      .map((m) => [m.id, m.rateCentsPerHour as number]),
  );
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Storage full or blocked — the in-memory value still works today.
      }
    },
    [key],
  );

  return [value, set];
}

/** The USD rate, set by hand because there is no network at the bench. */
export function useUsdRate(): [number | null, (rate: number | null) => void] {
  return useLocalStorage<number | null>("forge-log.usdRate", config.usdRate);
}

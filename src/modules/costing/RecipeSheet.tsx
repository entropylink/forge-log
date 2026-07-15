// Recipe editor. A recipe stores how a thing is made — which sheet, how much of
// it, how many minutes — not a frozen total, so re-applying after a material
// price rises gives the new cost rather than the old one.
//
// Margin and fee are deliberately not here: what to charge is a decision per
// product, not a property of the making.

import { useState, type ReactNode } from "react";
import { db, newId } from "../../lib/dexie";
import { emptyRecipe, recipeUnitCostCents } from "../../lib/bulk";
import { machineLabel } from "../../lib/catalog";
import { useActiveMachines, useMachineRates, useMaterials } from "../../lib/hooks";
import { formatMXN } from "../../lib/money";
import { config } from "../../config";
import { MoneyInput, NumberInput, Sheet, useT } from "../../ui/common";
import type { CostRecipe } from "../../core-data/types";

export function RecipeSheet({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: CostRecipe | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}): ReactNode {
  const t = useT();
  const materials = useMaterials() ?? [];
  const machines = useActiveMachines() ?? [];
  const machineRates = useMachineRates();

  const [draft, setDraft] = useState<Omit<CostRecipe, "id" | "updatedAt">>(
    recipe
      ? {
          name: recipe.name,
          materialLines: recipe.materialLines,
          machineLines: recipe.machineLines,
          laborMinutes: recipe.laborMinutes,
          laborRateCentsPerHour: recipe.laborRateCentsPerHour,
          consumables: recipe.consumables,
          packagingCents: recipe.packagingCents,
          setupMinutes: recipe.setupMinutes,
          batchQty: recipe.batchQty,
          notes: recipe.notes,
        }
      : emptyRecipe(),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (over: Partial<typeof draft>): void => setDraft({ ...draft, ...over });

  const preview = recipeUnitCostCents(
    { ...draft, id: "preview", updatedAt: "" },
    materials,
    machineRates,
  );

  async function save(): Promise<void> {
    if (draft.name.trim() === "") return setError(t("common.required"));
    const record: CostRecipe = {
      ...draft,
      name: draft.name.trim(),
      id: recipe?.id ?? newId("rec"),
      updatedAt: new Date().toISOString(),
    };
    await db.recipes.put(record);
    onSaved(record.name);
  }

  async function remove(): Promise<void> {
    if (!recipe) return;
    await db.recipes.delete(recipe.id);
    onSaved(recipe.name);
  }

  return (
    <Sheet title={recipe ? recipe.name : t("cost.newRecipe")} onClose={onClose}>
      <div className="field">
        <label htmlFor="r-name">{t("cost.recipeName")}</label>
        <input
          id="r-name"
          type="text"
          value={draft.name}
          placeholder={t("cost.recipeNameHint")}
          onChange={(e) => patch({ name: e.target.value })}
          autoFocus
        />
      </div>

      <div className="field">
        <div className="row between" style={{ marginBottom: 6 }}>
          <label style={{ margin: 0 }}>{t("cost.materials")}</label>
          <button
            className="btn sm"
            disabled={materials.length === 0}
            onClick={() =>
              patch({
                materialLines: [
                  ...draft.materialLines,
                  { materialId: materials[0].id, usagePct: 10 },
                ],
              })
            }
          >
            {t("common.add")}
          </button>
        </div>
        {draft.materialLines.map((line, i) => (
          <div className="cost-line" key={i}>
            <select
              className="grow"
              value={line.materialId}
              onChange={(e) => {
                const next = [...draft.materialLines];
                next[i] = { ...line, materialId: e.target.value };
                patch({ materialLines: next });
              }}
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.thickness}mm
                </option>
              ))}
            </select>
            <div style={{ width: 80 }}>
              <NumberInput
                value={line.usagePct}
                label={t("cost.usage")}
                onChange={(n) => {
                  const next = [...draft.materialLines];
                  next[i] = { ...line, usagePct: n ?? 0 };
                  patch({ materialLines: next });
                }}
              />
            </div>
            <span className="faint">%</span>
            <button
              className="btn sm ghost danger"
              aria-label={t("common.delete")}
              onClick={() =>
                patch({ materialLines: draft.materialLines.filter((_, j) => j !== i) })
              }
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="field">
        <div className="row between" style={{ marginBottom: 6 }}>
          <label style={{ margin: 0 }}>{t("cost.machineTime")}</label>
          <button
            className="btn sm"
            disabled={machines.length === 0}
            onClick={() =>
              patch({
                machineLines: [...draft.machineLines, { machineId: machines[0].id, minutes: 10 }],
              })
            }
          >
            {t("common.add")}
          </button>
        </div>
        {draft.machineLines.map((line, i) => (
          <div className="cost-line" key={i}>
            <select
              className="grow"
              value={line.machineId}
              onChange={(e) => {
                const next = [...draft.machineLines];
                next[i] = { ...line, machineId: e.target.value };
                patch({ machineLines: next });
              }}
            >
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {machineLabel(m)}
                </option>
              ))}
            </select>
            <div style={{ width: 80 }}>
              <NumberInput
                value={line.minutes}
                label={t("cost.minutes")}
                onChange={(n) => {
                  const next = [...draft.machineLines];
                  next[i] = { ...line, minutes: n ?? 0 };
                  patch({ machineLines: next });
                }}
              />
            </div>
            <span className="faint">min</span>
            <button
              className="btn sm ghost danger"
              aria-label={t("common.delete")}
              onClick={() => patch({ machineLines: draft.machineLines.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="field-row">
        <div className="field">
          <label>{t("cost.labor")} ({t("cost.minutes")})</label>
          <NumberInput value={draft.laborMinutes} onChange={(n) => patch({ laborMinutes: n ?? 0 })} />
        </div>
        <div className="field">
          <label>{t("cost.laborRate")}</label>
          <MoneyInput
            valueCents={draft.laborRateCentsPerHour ?? config.costing.defaultLaborRateCentsPerHour}
            onChange={(c) => patch({ laborRateCentsPerHour: c ?? undefined })}
            label={t("cost.laborRate")}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>{t("cost.setup")} ({t("cost.minutes")})</label>
          <NumberInput value={draft.setupMinutes} onChange={(n) => patch({ setupMinutes: n ?? 0 })} />
        </div>
        <div className="field">
          <label>{t("cost.batch")}</label>
          <NumberInput value={draft.batchQty} onChange={(n) => patch({ batchQty: n ?? 1 })} min={1} />
          <span className="faint">{t("cost.setupHint")}</span>
        </div>
      </div>

      <div className="field">
        <div className="row between" style={{ marginBottom: 6 }}>
          <label style={{ margin: 0 }}>{t("cost.consumables")}</label>
          <button
            className="btn sm"
            onClick={() => patch({ consumables: [...draft.consumables, { label: "", cents: 0 }] })}
          >
            {t("common.add")}
          </button>
        </div>
        {draft.consumables.map((line, i) => (
          <div className="cost-line" key={i}>
            <input
              type="text"
              className="grow"
              value={line.label}
              placeholder={t("cost.consumableLabel")}
              onChange={(e) => {
                const next = [...draft.consumables];
                next[i] = { ...line, label: e.target.value };
                patch({ consumables: next });
              }}
            />
            <div style={{ width: 100 }}>
              <MoneyInput
                valueCents={line.cents}
                label={t("cost.consumables")}
                onChange={(c) => {
                  const next = [...draft.consumables];
                  next[i] = { ...line, cents: c ?? 0 };
                  patch({ consumables: next });
                }}
              />
            </div>
            <button
              className="btn sm ghost danger"
              aria-label={t("common.delete")}
              onClick={() => patch({ consumables: draft.consumables.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="field">
        <label>{t("cost.packaging")}</label>
        <MoneyInput
          valueCents={draft.packagingCents}
          onChange={(c) => patch({ packagingCents: c ?? 0 })}
          label={t("cost.packaging")}
        />
      </div>

      <div className="price-hero" style={{ marginBottom: 12 }}>
        <div className="label">{t("cost.unitCost")}</div>
        <div className="amount tabular">{formatMXN(preview)}</div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {recipe ? (
          <button className="btn grow danger" onClick={() => void remove()}>
            {t("common.delete")}
          </button>
        ) : null}
        <button className="btn grow primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}

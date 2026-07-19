// Material admin. Sheet cost is what makes costing possible, so a material
// without one is flagged rather than silently costing zero.

import { useState, type ReactNode } from "react";
import { db, newId, softDelete } from "../../lib/dexie";
import { useMaterials } from "../../lib/hooks";
import { formatMXN } from "../../lib/money";
import { MoneyInput, NumberInput, Sheet, useT } from "../../ui/common";
import type { Material, MaterialCategory } from "../../core-data/types";

const CATEGORIES: MaterialCategory[] = [
  "wood",
  "acrylic",
  "leather",
  "vinyl",
  "paper",
  "metal",
  "other",
];

export function MaterialsSheet({ onClose }: { onClose: () => void }): ReactNode {
  const t = useT();
  const materials = useMaterials();
  const [editing, setEditing] = useState<Material | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Sheet title={t("material.title")} onClose={onClose}>
      <button className="btn sm primary" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>
        {t("material.add")}
      </button>

      {(materials ?? []).length === 0 ? (
        <p className="muted">{t("material.noneHint")}</p>
      ) : (
        (materials ?? []).map((material) => (
          <div className="setting-row" key={material.id}>
            <span className="grow">
              <span style={{ fontWeight: 700 }}>
                {material.name} <span className="faint">{material.thickness}mm</span>
              </span>
              <span className="faint" style={{ display: "block" }}>
                {t(`material.cat.${material.category}`)} · {material.sheetW}×{material.sheetH}mm ·{" "}
                {material.sheetCostCents === undefined ? (
                  <span style={{ color: "var(--warn)" }}>{t("material.noPrice")}</span>
                ) : (
                  formatMXN(material.sheetCostCents)
                )}
              </span>
            </span>
            <button className="btn sm" onClick={() => setEditing(material)}>
              {t("common.edit")}
            </button>
          </div>
        ))
      )}

      {creating || editing ? (
        <MaterialForm
          material={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </Sheet>
  );
}

function MaterialForm({
  material,
  onClose,
  onSaved,
}: {
  material: Material | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const t = useT();
  const [name, setName] = useState(material?.name ?? "");
  const [category, setCategory] = useState<MaterialCategory>(material?.category ?? "wood");
  const [thickness, setThickness] = useState<number | null>(material?.thickness ?? null);
  const [sheetW, setSheetW] = useState<number | null>(material?.sheetW ?? null);
  const [sheetH, setSheetH] = useState<number | null>(material?.sheetH ?? null);
  const [sheetCost, setSheetCost] = useState<number | null>(material?.sheetCostCents ?? null);
  const [supplier, setSupplier] = useState(material?.supplier ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (name.trim() === "") return setError(t("common.required"));

    await db.materials.put({
      id: material?.id ?? newId("mat"),
      name: name.trim(),
      category,
      thickness: thickness ?? 0,
      sheetW: sheetW ?? 0,
      sheetH: sheetH ?? 0,
      sheetCostCents: sheetCost ?? undefined,
      supplier: supplier.trim() || undefined,
      notes: material?.notes,
    });
    onSaved();
  }

  async function remove(): Promise<void> {
    if (!material) return;
    await softDelete("materials", material.id);
    onSaved();
  }

  return (
    <Sheet title={material ? material.name : t("material.add")} onClose={onClose}>
      <div className="field">
        <label htmlFor="mat-name">{t("material.name")}</label>
        <input
          id="mat-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="mat-cat">{t("material.category")}</label>
          <select
            id="mat-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`material.cat.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("material.thickness")} ({t("machine.mm")})</label>
          <NumberInput value={thickness} onChange={setThickness} step={0.1} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>{t("material.sheet")} — {t("machine.bedW")}</label>
          <NumberInput value={sheetW} onChange={setSheetW} />
        </div>
        <div className="field">
          <label>{t("machine.bedH")}</label>
          <NumberInput value={sheetH} onChange={setSheetH} />
        </div>
      </div>

      <div className="field">
        <label>{t("material.sheetCost")}</label>
        <MoneyInput valueCents={sheetCost} onChange={setSheetCost} label={t("material.sheetCost")} />
      </div>

      <div className="field">
        <label htmlFor="mat-sup">{t("material.supplier")}</label>
        <input
          id="mat-sup"
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {material ? (
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

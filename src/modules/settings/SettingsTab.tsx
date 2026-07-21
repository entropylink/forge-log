// M1 — Settings Library, the daily driver (plan.md §6). Phase P1.
//
// Search-first: the reason this module exists is to answer "what worked last
// time on 3mm birch" in one box, so the search sits above everything and the
// machine/material admin lives behind it.

import { useMemo, useState, type ReactNode } from "react";
import { db, newId } from "../../lib/dexie";
import { machineLabel, needsSpecConfirmation } from "../../lib/catalog";
import { compressImage } from "../../lib/photo";
import { buildTestGrid, fieldsFor, OPERATIONS_BY_TYPE, summarizeParams } from "../../lib/params";
import { searchSettings, siblingSettings } from "../../lib/search";
import { useMachines, useMaterials, useSettings } from "../../lib/hooks";
import {
  EmptyState,
  RatingPicker,
  Sheet,
  Stars,
  Toast,
  useT,
  useToast,
} from "../../ui/common";
import { MachinesSheet } from "./MachinesSheet";
import { MaterialsSheet } from "./MaterialsSheet";
import type { Machine, Material, Operation, Setting } from "../../core-data/types";

export function SettingsTab(): ReactNode {
  const t = useT();
  const machines = useMachines();
  const materials = useMaterials();
  const settings = useSettings();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Setting | null>(null);
  const [creating, setCreating] = useState(false);
  const [showMachines, setShowMachines] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [toast, showToast] = useToast();

  const activeMachines = useMemo(
    () => (machines ?? []).filter((m) => m.active),
    [machines],
  );

  const rows = useMemo(
    () =>
      searchSettings(query, {
        settings: settings ?? [],
        machines: machines ?? [],
        materials: materials ?? [],
      }),
    [query, settings, machines, materials],
  );

  if (!machines || !materials || !settings) return <p className="muted">{t("app.loading")}</p>;

  const unconfirmed = activeMachines.filter(needsSpecConfirmation);

  return (
    <>
      <div className="card">
        <input
          type="search"
          value={query}
          placeholder={t("setting.searchPlaceholder")}
          aria-label={t("common.search")}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button
            className="btn sm primary"
            disabled={activeMachines.length === 0 || materials.length === 0}
            onClick={() => setCreating(true)}
          >
            {t("setting.add")}
          </button>
          <button className="btn sm" onClick={() => setShowMachines(true)}>
            {t("machine.title")} ({activeMachines.length})
          </button>
          <button className="btn sm" onClick={() => setShowMaterials(true)}>
            {t("material.title")} ({materials.length})
          </button>
        </div>
        {activeMachines.length === 0 ? (
          <p className="faint" style={{ marginBottom: 0 }}>
            {t("setting.needMachine")}
          </p>
        ) : materials.length === 0 ? (
          <p className="faint" style={{ marginBottom: 0 }}>
            {t("setting.needMaterial")}
          </p>
        ) : null}
      </div>

      {unconfirmed.length > 0 ? (
        <div className="warn-box" style={{ marginBottom: 12 }}>
          {t("machine.unverifiedHint")}{" "}
          <button
            className="btn sm ghost"
            style={{ marginTop: 8 }}
            onClick={() => setShowMachines(true)}
          >
            {t("machine.confirmSpecs")} ({unconfirmed.length})
          </button>
        </div>
      ) : null}

      {settings.length === 0 ? (
        <EmptyState title={t("setting.none")} hint={t("setting.noneHint")} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("setting.noResults")} hint={t("setting.noResultsHint")} />
      ) : (
        <div className="card">
          {rows.map(({ setting, machine, material }) => (
            <div
              className="setting-row"
              key={setting.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditing(setting)}
              onKeyDown={(e) => e.key === "Enter" && setEditing(setting)}
            >
              {setting.verified ? <span className="verified-dot" /> : null}
              <span className="grow">
                <span style={{ fontWeight: 700 }}>
                  {material?.name ?? setting.materialId}
                  {material ? (
                    <span className="faint"> {material.thickness}mm</span>
                  ) : null}
                </span>
                <span className="faint" style={{ display: "block" }}>
                  {machine ? machineLabel(machine) : setting.machineId}
                </span>
              </span>
              <span className="op-badge">{t(`setting.op.${setting.operation}`)}</span>
              <span className="params">
                {machine
                  ? summarizeParams(machine.type, setting.operation, setting.params)
                  : ""}
              </span>
              <Stars n={setting.resultRating} />
            </div>
          ))}
        </div>
      )}

      {creating || editing ? (
        <SettingSheet
          setting={editing}
          machines={activeMachines}
          materials={materials}
          allSettings={settings}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(name) => {
            setCreating(false);
            setEditing(null);
            showToast(name);
          }}
          onDuplicate={(copy) => {
            setEditing(copy);
            setCreating(false);
            showToast(t("setting.duplicateHint"));
          }}
        />
      ) : null}

      {showMachines ? <MachinesSheet onClose={() => setShowMachines(false)} /> : null}
      {showMaterials ? <MaterialsSheet onClose={() => setShowMaterials(false)} /> : null}

      <Toast toast={toast} />
    </>
  );
}

function SettingSheet({
  setting,
  machines,
  materials,
  allSettings,
  onClose,
  onSaved,
  onDuplicate,
}: {
  setting: Setting | null;
  machines: Machine[];
  materials: Material[];
  allSettings: Setting[];
  onClose: () => void;
  onSaved: (name: string) => void;
  onDuplicate: (copy: Setting) => void;
}): ReactNode {
  const t = useT();
  const isNew = setting === null || !allSettings.some((s) => s.id === setting.id);

  const [machineId, setMachineId] = useState(setting?.machineId ?? machines[0]?.id ?? "");
  const [materialId, setMaterialId] = useState(setting?.materialId ?? materials[0]?.id ?? "");
  const [operation, setOperation] = useState<Operation>(setting?.operation ?? "cut");
  const [params, setParams] = useState<Record<string, number>>(setting?.params ?? {});
  const [rating, setRating] = useState<number>(setting?.resultRating ?? 3);
  const [verified, setVerified] = useState(setting?.verified ?? false);
  const [notes, setNotes] = useState(setting?.notes ?? "");
  const [photoRefs, setPhotoRefs] = useState<string[]>(setting?.photoRefs ?? []);
  const [showGrid, setShowGrid] = useState(false);
  const [busy, setBusy] = useState(false);

  const machine = machines.find((m) => m.id === machineId);
  const material = materials.find((m) => m.id === materialId);
  const fields = machine ? fieldsFor(machine.type, operation) : [];
  const operations = machine ? OPERATIONS_BY_TYPE[machine.type] : [];

  // Switching to a machine that can't do the current operation must not leave
  // the form in a state it will happily save.
  if (machine && operations.length > 0 && !operations.includes(operation)) {
    setOperation(operations[0]);
  }

  const siblings = setting ? siblingSettings(setting, allSettings) : [];

  async function addPhoto(file: File): Promise<void> {
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const id = newId("photo");
      await db.photos.add({
        id,
        blob: compressed.blob,
        width: compressed.width,
        height: compressed.height,
        bytes: compressed.bytes,
        createdAt: new Date().toISOString(),
      });
      setPhotoRefs([...photoRefs, id]);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!machine || !material) return;
    const now = new Date().toISOString();
    const record: Setting = {
      id: setting && !isNew ? setting.id : newId("set"),
      machineId,
      materialId,
      operation,
      params,
      resultRating: rating as 1 | 2 | 3 | 4 | 5,
      photoRefs,
      notes: notes.trim() || undefined,
      testedAt: setting?.testedAt ?? now,
      verified,
      updatedAt: now,
    };
    await db.settings.put(record);
    onSaved(`${material.name} · ${t(`setting.op.${operation}`)}`);
  }

  return (
    <Sheet title={isNew ? t("setting.add") : t("common.edit")} onClose={onClose}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="s-machine">{t("setting.machine")}</label>
          <select id="s-machine" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {machineLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-material">{t("setting.material")}</label>
          <select
            id="s-material"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.thickness}mm
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>{t("setting.operation")}</label>
        <div className="seg">
          {operations.map((op) => (
            <button
              key={op}
              type="button"
              aria-pressed={operation === op}
              onClick={() => setOperation(op)}
            >
              {t(`setting.op.${op}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="row between" style={{ marginBottom: 6 }}>
          <label style={{ margin: 0 }}>{t("setting.params")}</label>
          <button className="btn sm ghost" onClick={() => setShowGrid(true)}>
            {t("setting.testGridOpen")}
          </button>
        </div>
        <div className="field-row" style={{ flexWrap: "wrap" }}>
          {fields.map((f) => (
            <div key={f.key} style={{ minWidth: 92 }}>
              <label htmlFor={`p-${f.key}`}>
                {t(`params.${f.labelKey}`)} {f.unit ? `(${f.unit})` : ""}
              </label>
              <input
                id={`p-${f.key}`}
                type="text"
                inputMode="decimal"
                value={params[f.key] ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  const next = { ...params };
                  if (raw === "") delete next[f.key];
                  else next[f.key] = Math.min(f.max, Math.max(f.min, Number(raw)));
                  setParams(next);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t("setting.rating")}</label>
        <RatingPicker value={rating} onChange={setRating} />
      </div>

      <div className="field">
        <label>{t("setting.verified")}</label>
        <div className="seg">
          <button type="button" aria-pressed={verified} onClick={() => setVerified(true)}>
            {t("common.yes")}
          </button>
          <button type="button" aria-pressed={!verified} onClick={() => setVerified(false)}>
            {t("common.no")}
          </button>
        </div>
      </div>

      <div className="field">
        <label>{t("setting.photo")}</label>
        <div className="row wrap" style={{ gap: 8 }}>
          {photoRefs.map((id) => (
            <PhotoThumb key={id} photoId={id} onRemove={() => setPhotoRefs(photoRefs.filter((p) => p !== id))} />
          ))}
          <label className="btn sm" style={{ margin: 0, textTransform: "none", letterSpacing: 0 }}>
            {busy ? "…" : t("setting.addPhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="field">
        <label htmlFor="s-notes">{t("setting.notes")}</label>
        <textarea
          id="s-notes"
          value={notes}
          placeholder={t("setting.notesPlaceholder")}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {siblings.length > 0 ? (
        <div className="field">
          <label>{t("setting.siblings")}</label>
          {siblings.slice(0, 3).map((s) => (
            <div className="row between faint" key={s.id} style={{ padding: "4px 0" }}>
              <span className="params">
                {machine ? summarizeParams(machine.type, s.operation, s.params) : ""}
              </span>
              <Stars n={s.resultRating} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {setting && !isNew ? (
          <button
            className="btn grow"
            onClick={() =>
              onDuplicate({ ...setting, id: newId("set"), verified: false, photoRefs: [] })
            }
          >
            {t("common.duplicate")}
          </button>
        ) : null}
        <button className="btn grow primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>

      {showGrid && machine ? (
        <TestGridSheet
          machineType={machine.type}
          operation={operation}
          onClose={() => setShowGrid(false)}
          onPick={(cell) => {
            setParams(cell);
            setShowGrid(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}

function PhotoThumb({
  photoId,
  onRemove,
}: {
  photoId: string;
  onRemove: () => void;
}): ReactNode {
  const [url, setUrl] = useState<string | null>(null);

  useState(() => {
    void db.photos.get(photoId).then((p) => {
      if (p) setUrl(URL.createObjectURL(p.blob));
    });
  });

  if (!url) return <div className="photo-thumb" />;
  return (
    <button
      type="button"
      onClick={onRemove}
      style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
      aria-label="remove"
    >
      <img src={url} className="photo-thumb" alt="" />
    </button>
  );
}

function TestGridSheet({
  machineType,
  operation,
  onClose,
  onPick,
}: {
  machineType: Machine["type"];
  operation: Operation;
  onClose: () => void;
  onPick: (params: Record<string, number>) => void;
}): ReactNode {
  const t = useT();
  const grid = buildTestGrid(machineType, operation);

  return (
    <Sheet title={t("setting.testGrid")} onClose={onClose}>
      <p className="faint">{t("setting.testGridHint")}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="grid-table">
          <thead>
            <tr>
              <th>
                {t(`params.${grid.rowKey}`)} \ {t(`params.${grid.colKey}`)}
              </th>
              {grid.colValues.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rowValues.map((rowValue, row) => (
              <tr key={rowValue}>
                <th>{rowValue}</th>
                {grid.colValues.map((colValue, col) => {
                  const cell = grid.cells.find((c) => c.row === row && c.col === col);
                  return (
                    <td key={colValue}>
                      <button onClick={() => cell && onPick(cell.params)}>
                        {rowValue}/{colValue}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

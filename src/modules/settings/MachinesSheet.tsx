// Machine admin: activate from the catalog, confirm specs, add custom.
//
// The catalog is community-sourced (plan.md §12) and several entries — including
// both of the vendor's own machines — ship with null bed sizes because they
// could not be sourced honestly. Activating a machine therefore walks through
// confirming its specs, rather than quietly adopting numbers nobody checked.

import { useState, type ReactNode } from "react";
import { db, newId } from "../../lib/dexie";
import { machineLabel, needsSpecConfirmation } from "../../lib/catalog";
import { useMachines } from "../../lib/hooks";
import { formatMXN } from "../../lib/money";
import { MoneyInput, NumberInput, Sheet, useT } from "../../ui/common";
import type { Machine, MachineType } from "../../core-data/types";

const TYPES: MachineType[] = ["diode", "co2", "fiber", "vinyl"];

export function MachinesSheet({ onClose }: { onClose: () => void }): ReactNode {
  const t = useT();
  const machines = useMachines();
  const [editing, setEditing] = useState<Machine | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const mine = (machines ?? []).filter((m) => m.active);

  return (
    <Sheet title={t("machine.title")} onClose={onClose}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <button className="btn sm primary" onClick={() => setShowCatalog(true)}>
          {t("machine.catalog")}
        </button>
        <button className="btn sm" onClick={() => setCreating(true)}>
          {t("machine.custom")}
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="muted">{t("machine.noneActiveHint")}</p>
      ) : (
        mine.map((machine) => (
          <div className="setting-row" key={machine.id}>
            <span className="grow">
              <span style={{ fontWeight: 700 }}>{machineLabel(machine)}</span>
              <span className="faint" style={{ display: "block" }}>
                {t(`machine.types.${machine.type}`)}
                {machine.bedW !== null && machine.bedH !== null
                  ? ` · ${machine.bedW}×${machine.bedH}mm`
                  : ` · ${t("machine.unknownSpecs")}`}
                {machine.rateCentsPerHour
                  ? ` · ${formatMXN(machine.rateCentsPerHour)}/h`
                  : ""}
              </span>
            </span>
            {needsSpecConfirmation(machine) ? (
              <span className="op-badge" style={{ color: "var(--warn)" }}>
                {t("machine.unverified")}
              </span>
            ) : null}
            <button className="btn sm" onClick={() => setEditing(machine)}>
              {t("common.edit")}
            </button>
          </div>
        ))
      )}

      {showCatalog ? (
        <CatalogSheet
          onClose={() => setShowCatalog(false)}
          onPick={(machine) => {
            setShowCatalog(false);
            setEditing(machine);
          }}
        />
      ) : null}

      {creating ? (
        <MachineForm
          machine={null}
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      ) : null}

      {editing ? (
        <MachineForm
          machine={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : null}
    </Sheet>
  );
}

function CatalogSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (m: Machine) => void;
}): ReactNode {
  const t = useT();
  const machines = useMachines();
  const [query, setQuery] = useState("");

  const available = (machines ?? []).filter(
    (m) =>
      m.source === "catalog" &&
      !m.active &&
      machineLabel(m).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Sheet title={t("machine.catalog")} onClose={onClose}>
      <p className="warn-box" style={{ marginBottom: 12 }}>
        {t("machine.catalogNote")} {t("machine.unverifiedHint")}
      </p>
      <div className="field">
        <input
          type="search"
          value={query}
          placeholder={t("common.search")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {available.map((machine) => (
        <div className="setting-row" key={machine.id}>
          <span className="grow">
            <span style={{ fontWeight: 700 }}>{machineLabel(machine)}</span>
            <span className="faint" style={{ display: "block" }}>
              {t(`machine.types.${machine.type}`)}
              {machine.bedW !== null && machine.bedH !== null
                ? ` · ~${machine.bedW}×${machine.bedH}mm`
                : ` · ${t("common.unknown")}`}
            </span>
          </span>
          <button className="btn sm primary" onClick={() => onPick(machine)}>
            {t("machine.activate")}
          </button>
        </div>
      ))}
    </Sheet>
  );
}

function MachineForm({
  machine,
  onClose,
  onSaved,
}: {
  machine: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const t = useT();
  const [brand, setBrand] = useState(machine?.brand ?? "");
  const [model, setModel] = useState(machine?.model ?? "");
  const [type, setType] = useState<MachineType>(machine?.type ?? "diode");
  const [wattage, setWattage] = useState<number | null>(machine?.wattageOrForce ?? null);
  const [bedW, setBedW] = useState<number | null>(machine?.bedW ?? null);
  const [bedH, setBedH] = useState<number | null>(machine?.bedH ?? null);
  const [rate, setRate] = useState<number | null>(machine?.rateCentsPerHour ?? null);
  const [error, setError] = useState<string | null>(null);

  const isCatalog = machine?.source === "catalog";
  const unconfirmed = machine ? needsSpecConfirmation(machine) : true;

  async function save(): Promise<void> {
    if (brand.trim() === "" || model.trim() === "") return setError(t("common.required"));

    const record: Machine = {
      id: machine?.id ?? newId("mach"),
      brand: brand.trim(),
      model: model.trim(),
      type,
      wattageOrForce: wattage,
      bedW,
      bedH,
      source: machine?.source ?? "custom",
      slug: machine?.slug ?? (type === "vinyl" ? "cameo" : "laser"),
      // Saving this form IS the confirmation — but only if the specs are real.
      specsVerified: bedW !== null && bedH !== null,
      rateCentsPerHour: rate ?? undefined,
      active: true,
      notes: machine?.notes,
    };
    await db.machines.put(record);
    onSaved();
  }

  async function remove(): Promise<void> {
    if (!machine) return;
    // Catalog entries go back to the catalog; custom ones are deleted.
    if (isCatalog) await db.machines.update(machine.id, { active: false });
    else await db.machines.delete(machine.id);
    onSaved();
  }

  return (
    <Sheet title={machine ? machineLabel(machine) : t("machine.custom")} onClose={onClose}>
      {isCatalog && unconfirmed ? (
        <p className="warn-box" style={{ marginBottom: 12 }}>
          {t("machine.unverifiedHint")}
        </p>
      ) : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="m-brand">{t("machine.brand")}</label>
          <input id="m-brand" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-model">{t("machine.model")}</label>
          <input id="m-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="m-type">{t("machine.type")}</label>
        <select
          id="m-type"
          value={type}
          onChange={(e) => setType(e.target.value as MachineType)}
        >
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`machine.types.${ty}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <div className="field">
          <label>{type === "vinyl" ? t("machine.force") : t("machine.power")}</label>
          <NumberInput value={wattage} onChange={setWattage} placeholder={t("common.unknown")} />
        </div>
        <div className="field">
          <label>{t("machine.bedW")} ({t("machine.mm")})</label>
          <NumberInput value={bedW} onChange={setBedW} placeholder={t("common.unknown")} />
        </div>
        <div className="field">
          <label>{t("machine.bedH")} ({t("machine.mm")})</label>
          <NumberInput value={bedH} onChange={setBedH} placeholder={t("common.unknown")} />
        </div>
      </div>

      <div className="field">
        <label>{t("machine.rate")}</label>
        <MoneyInput valueCents={rate} onChange={setRate} label={t("machine.rate")} />
        <span className="faint">{t("machine.rateHint")}</span>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {machine?.active ? (
          <button className="btn grow danger" onClick={() => void remove()}>
            {t("machine.deactivate")}
          </button>
        ) : null}
        <button className="btn grow primary" onClick={() => void save()}>
          {bedW !== null && bedH !== null ? t("machine.confirmSpecs") : t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}

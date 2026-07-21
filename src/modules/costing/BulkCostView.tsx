// Bulk costing: a catalog of 61 products, none of them costed.
//
// Two speeds, because the work has two shapes:
//
//   Type it — the grid. Five cells per row, tab across, commit on blur. Right
//   for one-offs and for correcting what a recipe got approximately right.
//
//   Apply it — pick a source (a saved recipe, or a product already costed) and
//   push it onto everything selected. Right for the twelve near-identical
//   keychains.
//
// Edits are held locally and written on blur, not on every keystroke: 61 rows
// writing to IndexedDB per character would make the grid feel like tar.

import { useMemo, useState, type ReactNode } from "react";
import { db } from "../../lib/dexie";
import {
  applyCost,
  costProgress,
  filterProducts,
  hasCost,
  machinesInUse,
  NO_FILTER,
  previewApply,
  productMarginPct,
  recipeToUnitCost,
  recipeUnitCostCents,
  tiersInUse,
  uncostedProducts,
  type ProductFilter,
} from "../../lib/bulk";
import { exportCatalogCSV } from "../../lib/csv";
import { config } from "../../config";
import {
  tierOf,
  useMachineRates,
  useMaterials,
  useProducts,
  useRecipes,
  useTierMap,
  useTiers,
} from "../../lib/hooks";
import { formatMXN, formatMXNCompact, parseMXN, totalUnitCost } from "../../lib/money";
import { MoneyInput, Sheet, TierBadge, Toast, useT, useToast } from "../../ui/common";
import { RecipeSheet } from "./RecipeSheet";
import type { CostRecipe, Product, UnitCost } from "../../core-data/types";

const COST_FIELDS: (keyof UnitCost)[] = [
  "materialCents",
  "machineCents",
  "laborCents",
  "consumableCents",
  "packagingCents",
];

const FIELD_LABELS: Record<keyof UnitCost, string> = {
  materialCents: "cost.colMaterial",
  machineCents: "cost.colMachine",
  laborCents: "cost.colLabor",
  consumableCents: "cost.colConsumable",
  packagingCents: "cost.colPackaging",
};

export function BulkCostView(): ReactNode {
  const t = useT();
  const products = useProducts();
  const materials = useMaterials();
  const tiers = useTiers();
  const tierMap = useTierMap();
  const recipes = useRecipes();
  const machineRates = useMachineRates();
  const [toast, showToast] = useToast();

  const [filter, setFilter] = useState<ProductFilter>(NO_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<CostRecipe | "new" | null>(null);

  const rows = useMemo(
    () => filterProducts(products ?? [], filter),
    [products, filter],
  );
  const progress = useMemo(
    () => costProgress(products ?? [], config.costing.thinMarginPct),
    [products],
  );

  if (!products || !materials || !tiers) return <p className="muted">{t("app.loading")}</p>;

  if (products.length === 0) {
    return (
      <div className="empty">
        <strong>{t("cost.noProducts")}</strong>
        <span className="faint">{t("cost.noProductsHint")}</span>
      </div>
    );
  }

  const selectedProducts = products.filter((p) => selected.has(p.id));
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll(): void {
    if (allShownSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggle(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function commitCell(product: Product, field: keyof UnitCost, cents: number): Promise<void> {
    await db.products.update(product.id, {
      cost: { ...product.cost, [field]: Math.max(0, cents) },
    });
  }

  async function applyToSelected(cost: UnitCost): Promise<void> {
    await db.transaction("rw", db.products, async () => {
      for (const product of selectedProducts) {
        await db.products.put(applyCost(product, cost));
      }
    });
    showToast(t("cost.appliedTo", { n: selectedProducts.length }));
    setSelected(new Set());
    setApplying(false);
  }

  function exportUncosted(): void {
    // The honest fast path for a big catalog: fill the cost columns in a
    // spreadsheet and import it back. The template round-trips.
    const targets = uncostedProducts(products ?? []);
    const csv = exportCatalogCSV(targets.length > 0 ? targets : (products ?? []), tiers ?? []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uncosted-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="k-label">{t("cost.progress")}</div>
          <div className="k-value tabular">
            {progress.costed}
            <span className="faint" style={{ fontSize: "1rem" }}>
              {" "}
              / {progress.total}
            </span>
          </div>
          <div className="bar" style={{ marginTop: 6 }}>
            <span style={{ width: `${progress.pct}%`, background: "var(--ember)" }} />
          </div>
        </div>
        <div className="kpi">
          <div className="k-label">{t("cost.needsAttention")}</div>
          <div
            className={`k-value tabular ${progress.losing.length > 0 ? "neg" : "pos"}`}
          >
            {progress.losing.length}
          </div>
          <div className="faint">
            {progress.losing.length > 0
              ? t("cost.losingN", { n: progress.losing.length })
              : t("cost.thinN", { n: progress.thin.length })}
          </div>
        </div>
      </div>

      {progress.losing.length > 0 ? (
        <div className="warn-box" style={{ marginBottom: 12, borderColor: "var(--danger)", color: "var(--danger)" }}>
          <strong>{t("cost.losingHeader")}</strong>
          <div className="faint" style={{ color: "inherit" }}>
            {progress.losing
              .slice(0, 5)
              .map((p) => `${p.name} (${productMarginPct(p)?.toFixed(0)}%)`)
              .join(", ")}
            {progress.losing.length > 5 ? "…" : ""}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="field" style={{ marginBottom: 8 }}>
          <input
            type="search"
            value={filter.query}
            placeholder={t("cost.searchProducts")}
            aria-label={t("common.search")}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
        </div>

        <div className="picker-chips">
          <button
            className="chip"
            aria-pressed={filter.onlyUncosted}
            onClick={() => setFilter({ ...filter, onlyUncosted: !filter.onlyUncosted })}
          >
            {t("cost.onlyUncosted")}
          </button>
          {machinesInUse(products).map((machine) => (
            <button
              key={machine}
              className="chip"
              aria-pressed={filter.machine === machine}
              onClick={() =>
                setFilter({ ...filter, machine: filter.machine === machine ? null : machine })
              }
            >
              {machine}
            </button>
          ))}
          {tiersInUse(products, tiers).map((tier) => (
            <button
              key={tier.id}
              className="chip"
              aria-pressed={filter.tierId === tier.id}
              style={filter.tierId === tier.id ? { borderColor: tier.color, color: tier.color } : undefined}
              onClick={() =>
                setFilter({ ...filter, tierId: filter.tierId === tier.id ? null : tier.id })
              }
            >
              {tier.label}
            </button>
          ))}
        </div>

        <div className="row wrap between" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={toggleAll} disabled={rows.length === 0}>
              {allShownSelected ? t("cost.selectNone") : t("cost.selectAll", { n: rows.length })}
            </button>
            {selected.size > 0 ? (
              <button className="btn sm primary" onClick={() => setApplying(true)}>
                {t("cost.applyToN", { n: selected.size })}
              </button>
            ) : null}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setEditingRecipe("new")}>
              {t("cost.newRecipe")}
            </button>
            <button className="btn sm" onClick={exportUncosted}>
              {t("cost.exportUncosted")}
            </button>
          </div>
        </div>
        <p className="faint" style={{ marginBottom: 0 }}>
          {t("cost.spreadsheetHint")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>{t("cost.noMatches")}</strong>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="bulk-table">
            <thead>
              <tr>
                <th />
                <th style={{ textAlign: "left" }}>{t("product.name")}</th>
                {COST_FIELDS.map((f) => (
                  <th key={f}>{t(FIELD_LABELS[f])}</th>
                ))}
                <th>{t("cost.unitCost")}</th>
                <th>{t("product.sellingPrice")}</th>
                <th>{t("product.margin")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <BulkRow
                  key={product.id}
                  product={product}
                  tier={tierOf(tierMap, product.tierId)}
                  selected={selected.has(product.id)}
                  onToggle={() => toggle(product.id)}
                  onCommit={(field, cents) => void commitCell(product, field, cents)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {applying ? (
        <ApplySheet
          targets={selectedProducts}
          recipes={recipes ?? []}
          costedProducts={products.filter(hasCost)}
          materials={materials}
          machineRates={machineRates}
          onClose={() => setApplying(false)}
          onApply={applyToSelected}
          onEditRecipe={(r) => {
            setApplying(false);
            setEditingRecipe(r);
          }}
        />
      ) : null}

      {editingRecipe ? (
        <RecipeSheet
          recipe={editingRecipe === "new" ? null : editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSaved={(name) => {
            setEditingRecipe(null);
            showToast(name);
          }}
        />
      ) : null}

      <Toast toast={toast} />
    </>
  );
}

function BulkRow({
  product,
  tier,
  selected,
  onToggle,
  onCommit,
}: {
  product: Product;
  tier: ReturnType<typeof tierOf>;
  selected: boolean;
  onToggle: () => void;
  onCommit: (field: keyof UnitCost, cents: number) => void;
}): ReactNode {
  // Draft edits live here so typing doesn't hit IndexedDB per keystroke.
  const [draft, setDraft] = useState<Partial<Record<keyof UnitCost, string>>>({});

  const effective: UnitCost = { ...product.cost };
  for (const field of COST_FIELDS) {
    const raw = draft[field];
    if (raw === undefined) continue;
    const parsed = raw.trim() === "" ? 0 : parseMXN(raw);
    if (parsed !== null) effective[field] = Math.max(0, parsed);
  }

  const unitCost = totalUnitCost(effective);
  const costed = unitCost > 0;
  const marginCents = costed ? product.sellingPriceCents - unitCost : null;
  const marginPct =
    marginCents === null || product.sellingPriceCents === 0
      ? null
      : (marginCents / product.sellingPriceCents) * 100;

  const marginColor =
    marginPct === null
      ? "var(--text-faint)"
      : marginPct <= 0
        ? "var(--danger)"
        : marginPct < config.costing.thinMarginPct
          ? "var(--warn)"
          : "var(--ok)";

  return (
    <tr className={selected ? "sel" : ""}>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={product.name}
        />
      </td>
      <td className="name-cell">
        <span className="row" style={{ gap: 6 }}>
          <TierBadge tier={tier} />
          <span>
            {product.sku ? <span className="faint">{product.sku} · </span> : null}
            {product.name}
          </span>
        </span>
      </td>
      {COST_FIELDS.map((field) => (
        <td key={field}>
          <input
            type="text"
            inputMode="decimal"
            className="cell"
            aria-label={`${product.name} ${field}`}
            value={draft[field] ?? (product.cost[field] === 0 ? "" : (product.cost[field] / 100).toFixed(2))}
            placeholder="—"
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            onBlur={() => {
              const raw = draft[field];
              if (raw === undefined) return;
              const parsed = raw.trim() === "" ? 0 : parseMXN(raw);
              // Unparseable input reverts rather than silently zeroing a cost.
              if (parsed !== null) onCommit(field, parsed);
              setDraft({ ...draft, [field]: undefined });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </td>
      ))}
      <td className="num tabular">{costed ? formatMXNCompact(unitCost) : "—"}</td>
      <td className="num tabular faint">{formatMXNCompact(product.sellingPriceCents)}</td>
      <td className="num tabular" style={{ color: marginColor, fontWeight: 700 }}>
        {marginPct === null ? "—" : `${marginPct.toFixed(0)}%`}
      </td>
    </tr>
  );
}

/** Pick where the cost comes from, see what it will do, then do it. */
function ApplySheet({
  targets,
  recipes,
  costedProducts,
  materials,
  machineRates,
  onClose,
  onApply,
  onEditRecipe,
}: {
  targets: Product[];
  recipes: CostRecipe[];
  costedProducts: Product[];
  materials: NonNullable<ReturnType<typeof useMaterials>>;
  machineRates: Map<string, number>;
  onClose: () => void;
  onApply: (cost: UnitCost) => Promise<void>;
  onEditRecipe: (r: CostRecipe) => void;
}): ReactNode {
  const t = useT();
  const [source, setSource] = useState<"recipe" | "product" | "manual">(
    recipes.length > 0 ? "recipe" : "manual",
  );
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [copyFromId, setCopyFromId] = useState(costedProducts[0]?.id ?? "");
  const [manual, setManual] = useState<UnitCost>({
    materialCents: 0,
    machineCents: 0,
    laborCents: 0,
    consumableCents: 0,
    packagingCents: 0,
  });

  const cost: UnitCost = useMemo(() => {
    if (source === "recipe") {
      const recipe = recipes.find((r) => r.id === recipeId);
      return recipe
        ? recipeToUnitCost(recipe, materials, machineRates)
        : { materialCents: 0, machineCents: 0, laborCents: 0, consumableCents: 0, packagingCents: 0 };
    }
    if (source === "product") {
      const from = costedProducts.find((p) => p.id === copyFromId);
      return from
        ? { ...from.cost }
        : { materialCents: 0, machineCents: 0, laborCents: 0, consumableCents: 0, packagingCents: 0 };
    }
    return manual;
  }, [source, recipeId, copyFromId, manual, recipes, costedProducts, materials, machineRates]);

  const preview = previewApply(cost, targets);
  const selectedRecipe = recipes.find((r) => r.id === recipeId);

  return (
    <Sheet title={t("cost.applyToN", { n: targets.length })} onClose={onClose}>
      <div className="field">
        <label>{t("cost.source")}</label>
        <div className="seg">
          <button
            type="button"
            aria-pressed={source === "recipe"}
            disabled={recipes.length === 0}
            onClick={() => setSource("recipe")}
          >
            {t("cost.fromRecipe")}
          </button>
          <button
            type="button"
            aria-pressed={source === "product"}
            disabled={costedProducts.length === 0}
            onClick={() => setSource("product")}
          >
            {t("cost.fromProduct")}
          </button>
          <button type="button" aria-pressed={source === "manual"} onClick={() => setSource("manual")}>
            {t("cost.manual")}
          </button>
        </div>
      </div>

      {source === "recipe" ? (
        <div className="field">
          <label htmlFor="a-recipe">{t("cost.recipe")}</label>
          <select id="a-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {formatMXN(recipeUnitCostCents(r, materials, machineRates))}
              </option>
            ))}
          </select>
          {selectedRecipe ? (
            <button
              className="btn sm ghost"
              style={{ marginTop: 6 }}
              onClick={() => onEditRecipe(selectedRecipe)}
            >
              {t("common.edit")}
            </button>
          ) : null}
        </div>
      ) : null}

      {source === "product" ? (
        <div className="field">
          <label htmlFor="a-copy">{t("cost.copyFrom")}</label>
          <select id="a-copy" value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
            {costedProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMXN(totalUnitCost(p.cost))}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {source === "manual" ? (
        <div className="field-row" style={{ flexWrap: "wrap" }}>
          {COST_FIELDS.map((field) => (
            <div key={field} style={{ minWidth: 90 }}>
              <label>{t(FIELD_LABELS[field])}</label>
              <MoneyInput
                valueCents={manual[field]}
                onChange={(c) => setManual({ ...manual, [field]: c ?? 0 })}
                label={t(FIELD_LABELS[field])}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="card" style={{ margin: "12px 0" }}>
        <div className="row between">
          <span>{t("cost.unitCost")}</span>
          <strong className="tabular" style={{ color: "var(--ember)" }}>
            {formatMXN(preview.unitCostCents)}
          </strong>
        </div>
        <div className="row between faint">
          <span>{t("cost.willTouch", { n: preview.count })}</span>
          {preview.overwrites > 0 ? (
            <span style={{ color: "var(--warn)" }}>
              {t("cost.willOverwrite", { n: preview.overwrites })}
            </span>
          ) : null}
        </div>
      </div>

      {preview.wouldLose.length > 0 ? (
        <div
          className="warn-box"
          style={{ marginBottom: 12, borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          <strong>{t("cost.wouldLoseHeader", { n: preview.wouldLose.length })}</strong>
          <div className="faint" style={{ color: "inherit" }}>
            {preview.wouldLose
              .slice(0, 6)
              .map((p) => `${p.name} @ ${formatMXNCompact(p.sellingPriceCents)}`)
              .join(", ")}
            {preview.wouldLose.length > 6 ? "…" : ""}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="btn grow primary"
          disabled={preview.unitCostCents === 0}
          onClick={() => void onApply(cost)}
        >
          {t("cost.apply")}
        </button>
      </div>
    </Sheet>
  );
}

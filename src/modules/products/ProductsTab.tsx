// Products + Tiers — the workshop side of the catalog, and the bridge to
// Booth Mode.
//
// Tiers live here because they are bets on what sells, and this is where you
// revise them once Booth Mode's real numbers come back (plan.md §5 note in
// core-data/types.ts).

import { useRef, useState, type ReactNode } from "react";
import { db, newId, softDelete } from "../../lib/dexie";
import {
  emptyTemplateCSV,
  exportCatalogCSV,
  importCatalogCSV,
  tierIdFromLabel,
  totalUnitCost,
  type ImportResult,
} from "../../lib/csv";
import { config } from "../../config";
import { formatInferred, formatIssue } from "../../lib/issues";
import { tierOf, useMachines, useProducts, useTierMap, useTiers } from "../../lib/hooks";
import { viewProducts, SORT_KEYS, type SortKey } from "../../lib/product-view";
import { formatMXN, formatMXNCompact } from "../../lib/money";
import {
  EmptyState,
  MoneyInput,
  NumberInput,
  Sheet,
  TierBadge,
  Toast,
  useT,
  useToast,
} from "../../ui/common";
import type { Product, Tier } from "../../core-data/types";

export function ProductsTab(): ReactNode {
  const t = useT();
  const products = useProducts();
  const tiers = useTiers();
  const tierMap = useTierMap();
  const machines = useMachines();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTiers, setShowTiers] = useState(false);
  const [query, setQuery] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [report, setReport] = useState<ImportResult | null>(null);
  const [toast, showToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!products || !tiers) return <p className="muted">{t("app.loading")}</p>;

  async function onImport(file: File): Promise<void> {
    const result = importCatalogCSV(await file.text());
    if (result.products.length === 0) {
      setReport(result);
      return;
    }
    await db.tiers.bulkPut(result.tiers);
    await db.products.bulkPut(result.products);
    setReport(result);
  }

  function onExport(): void {
    const csv = exportCatalogCSV(products ?? [], tiers ?? []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const costed = products.filter((p) => totalUnitCost(p.cost) > 0).length;
  const shown = viewProducts(
    products,
    { query, tierId: filterTier, sort },
    (id) => tierMap.get(id)?.sortOrder ?? 999,
  );

  return (
    <>
      <div className="card">
        <h2>{t("product.title")}</h2>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            {t("product.import")}
          </button>
          <button className="btn sm" onClick={onExport} disabled={products.length === 0}>
            {t("product.export")}
          </button>
          <button
            className="btn sm"
            onClick={() => {
              const blob = new Blob([emptyTemplateCSV()], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("product.template")}
          </button>
          <button className="btn sm" onClick={() => setShowTiers(true)}>
            {t("tier.manage")} ({tiers.length})
          </button>
          <button className="btn sm" onClick={() => setCreating(true)}>
            {t("product.add")}
          </button>
        </div>
        <p className="faint" style={{ marginBottom: 0 }}>
          {t("product.exportHint")}
        </p>
        {products.length > 0 ? (
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <input
              type="text"
              value={query}
              placeholder={t("product.searchPlaceholder")}
              aria-label={t("product.searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: "1 1 100%" }}
            />
            <select
              value={filterTier}
              aria-label={t("product.allTiers")}
              onChange={(e) => setFilterTier(e.target.value)}
              style={{ flex: "1 1 0", minWidth: 0 }}
            >
              <option value="">{t("product.allTiers")}</option>
              {[...tiers]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.label}
                  </option>
                ))}
            </select>
            <select
              value={sort}
              aria-label={t("product.sortBy")}
              onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ flex: "1 1 0", minWidth: 0 }}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`product.sort.${k}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
            e.target.value = "";
          }}
        />
      </div>

      {products.length === 0 ? (
        <EmptyState title={t("product.none")} hint={t("product.noneHint")} />
      ) : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <div className="kpi">
              <div className="k-label">{t("product.title")}</div>
              <div className="k-value tabular">{products.length}</div>
              <div className="faint">{t("product.costed", { n: costed })}</div>
            </div>
            <div className="kpi">
              <div className="k-label">{t("product.noCost")}</div>
              <div
                className={`k-value tabular ${products.length - costed > 0 ? "neg" : "pos"}`}
              >
                {products.length - costed}
              </div>
              <div className="faint">{t("product.uncosted", { n: products.length - costed })}</div>
            </div>
          </div>

          <div className="card">
            {shown.length === 0 ? (
              <p className="faint" style={{ margin: 0, textAlign: "center" }}>
                {t("product.noMatches")}
              </p>
            ) : null}
            {shown.map((product) => {
              const cost = totalUnitCost(product.cost);
              const margin = cost === 0 ? null : product.sellingPriceCents - cost;
              return (
                <div
                  className="product-row"
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(product)}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(product)}
                >
                  <TierBadge tier={tierOf(tierMap, product.tierId)} />
                  <span className="grow">
                    <span style={{ fontWeight: 700 }}>
                      {product.sku ? <span className="faint">{product.sku} · </span> : null}
                      {product.name}
                    </span>
                    <span className="faint" style={{ display: "block" }}>
                      {formatMXNCompact(product.sellingPriceCents)}
                      {margin === null ? (
                        <span style={{ color: "var(--warn)" }}> · {t("product.noCost")}</span>
                      ) : (
                        <>
                          {" "}
                          · {t("product.cost")} {formatMXNCompact(cost)} ·{" "}
                          <span style={{ color: margin < 0 ? "var(--danger)" : "var(--ok)" }}>
                            {t("product.margin")} {formatMXNCompact(margin)}
                          </span>
                        </>
                      )}
                      {product.machine ? ` · ${product.machine}` : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showTiers ? <TiersSheet onClose={() => setShowTiers(false)} /> : null}

      {report ? (
        <ImportReport
          report={report}
          onClose={() => {
            setReport(null);
            showToast(t("product.importedProducts"));
          }}
        />
      ) : null}

      {creating || editing ? (
        <ProductForm
          product={editing}
          tiers={tiers}
          machineSlugs={[...new Set((machines ?? []).map((m) => m.slug).filter(Boolean))] as string[]}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(name) => {
            setCreating(false);
            setEditing(null);
            showToast(name);
          }}
        />
      ) : null}

      <Toast message={toast} />
    </>
  );
}

/** The tier editor the vendor asked for: tiers are revisable hypotheses. */
function TiersSheet({ onClose }: { onClose: () => void }): ReactNode {
  const t = useT();
  const tiers = useTiers();
  const products = useProducts();
  const [editing, setEditing] = useState<Tier | null>(null);
  const [creating, setCreating] = useState(false);

  const countFor = (tierId: string): number =>
    (products ?? []).filter((p) => p.tierId === tierId).length;

  async function move(tier: Tier, delta: number): Promise<void> {
    const list = [...(tiers ?? [])];
    const i = list.findIndex((x) => x.id === tier.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.tiers.bulkPut(list.map((x, index) => ({ ...x, sortOrder: index })));
  }

  return (
    <Sheet title={t("tier.title")} onClose={onClose}>
      <p className="faint">{t("tier.hypothesis")}</p>
      <button className="btn sm primary" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>
        {t("tier.add")}
      </button>

      {(tiers ?? []).length === 0 ? (
        <p className="muted">{t("tier.noneHint")}</p>
      ) : (
        (tiers ?? []).map((tier, i) => (
          <div className="product-row" key={tier.id}>
            <span className="tier-dot" style={{ background: tier.color }} />
            <span className="grow">
              <span style={{ fontWeight: 700 }}>{tier.label}</span>
              <span className="faint" style={{ display: "block" }}>
                {t("tier.productCount", { n: countFor(tier.id) })}
                {tier.notes ? ` · ${tier.notes}` : ""}
              </span>
            </span>
            <button
              className="btn sm ghost"
              aria-label={t("tier.moveUp")}
              disabled={i === 0}
              onClick={() => void move(tier, -1)}
            >
              ↑
            </button>
            <button
              className="btn sm ghost"
              aria-label={t("tier.moveDown")}
              disabled={i === (tiers ?? []).length - 1}
              onClick={() => void move(tier, 1)}
            >
              ↓
            </button>
            <button className="btn sm" onClick={() => setEditing(tier)}>
              {t("common.edit")}
            </button>
          </div>
        ))
      )}

      {creating || editing ? (
        <TierForm
          tier={editing}
          usedBy={editing ? countFor(editing.id) : 0}
          nextOrder={(tiers ?? []).length}
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

function TierForm({
  tier,
  usedBy,
  nextOrder,
  onClose,
  onSaved,
}: {
  tier: Tier | null;
  usedBy: number;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const t = useT();
  const [label, setLabel] = useState(tier?.label ?? "");
  const [color, setColor] = useState(tier?.color ?? config.tierPalette[nextOrder % config.tierPalette.length]);
  const [notes, setNotes] = useState(tier?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (label.trim() === "") return setError(t("common.required"));
    await db.tiers.put({
      // Renaming keeps the id, so the products pointing at it stay pointed.
      id: tier?.id ?? tierIdFromLabel(label),
      label: label.trim(),
      sortOrder: tier?.sortOrder ?? nextOrder,
      color,
      notes: notes.trim() || undefined,
    });
    onSaved();
  }

  async function remove(): Promise<void> {
    if (!tier) return;
    // Deleting a tier that products still use would orphan them.
    if (usedBy > 0) return setError(t("tier.deleteBlocked", { n: usedBy }));
    await softDelete("tiers", tier.id);
    onSaved();
  }

  return (
    <Sheet title={tier ? tier.label : t("tier.add")} onClose={onClose}>
      <div className="field">
        <label htmlFor="t-label">{t("tier.label")}</label>
        <input
          id="t-label"
          type="text"
          value={label}
          placeholder={t("tier.labelHint")}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field">
        <label>{t("tier.color")}</label>
        <div className="seg">
          {config.tierPalette.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ background: c, borderColor: c, minWidth: 40 }}
            >
              {color === c ? "✓" : " "}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="t-notes">{t("tier.notes")}</label>
        <textarea
          id="t-notes"
          value={notes}
          placeholder={t("tier.notesPlaceholder")}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {tier ? (
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

function ProductForm({
  product,
  tiers,
  machineSlugs,
  onClose,
  onSaved,
}: {
  product: Product | null;
  tiers: Tier[];
  machineSlugs: string[];
  onClose: () => void;
  onSaved: (name: string) => void;
}): ReactNode {
  const t = useT();
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [tierId, setTierId] = useState(product?.tierId ?? tiers[0]?.id ?? "");
  const [machine, setMachine] = useState(product?.machine ?? "");
  const [housePrice, setHousePrice] = useState<number | null>(product?.housePriceCents ?? null);
  const [sellingPrice, setSellingPrice] = useState<number | null>(
    product?.sellingPriceCents ?? null,
  );
  const [variantsText, setVariantsText] = useState((product?.variants ?? []).join(", "));
  const [minutes, setMinutes] = useState<number | null>(product?.productionMinutes ?? null);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (name.trim() === "") return setError(t("common.required"));
    if (sellingPrice === null) return setError(t("common.invalidAmount"));

    const variants = variantsText
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    const list = variants.length > 0 ? variants : ["—"];

    // Variant names become stockByVariant keys → Firestore field names on sync.
    // Firestore rejects names matching /^__.*__$/, so block them here.
    if (list.some((v) => /^__.*__$/.test(v))) return setError(t("common.invalidVariant"));

    const record: Product = {
      id: product?.id ?? newId("prod"),
      sku: sku.trim(),
      name: name.trim(),
      variants: list,
      // tierId is a required field every consumer joins on, and Booth Mode's form
      // enforces it. On a fresh Forge install with no tiers the select is empty
      // and tierId would be "", which then syncs across as an untiered product.
      // Fall back to the same "sin-tier" sentinel both apps' CSV importers use.
      tierId: tierId || "sin-tier",
      machine: machine || undefined,
      cost: product?.cost ?? {
        materialCents: 0,
        machineCents: 0,
        laborCents: 0,
        consumableCents: 0,
        packagingCents: 0,
      },
      housePriceCents: housePrice ?? sellingPrice,
      sellingPriceCents: sellingPrice,
      stockByVariant:
        product?.stockByVariant ?? Object.fromEntries(list.map((v) => [v, 0])),
      productionMinutes: minutes ?? undefined,
      restockThreshold: product?.restockThreshold,
      active: product?.active ?? true,
      notes: product?.notes,
    };
    await db.products.put(record);
    onSaved(record.name);
  }

  async function remove(): Promise<void> {
    if (!product) return;
    await softDelete("products", product.id);
    onSaved(product.name);
  }

  return (
    <Sheet title={product ? product.name : t("product.add")} onClose={onClose}>
      <div className="field-row">
        <div className="field" style={{ maxWidth: 110 }}>
          <label htmlFor="pr-sku">{t("product.sku")}</label>
          <input id="pr-sku" type="text" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pr-name">{t("product.name")}</label>
          <input
            id="pr-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="pr-tier">{t("product.tier")}</label>
          <select id="pr-tier" value={tierId} onChange={(e) => setTierId(e.target.value)}>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pr-machine">{t("product.machine")}</label>
          <select id="pr-machine" value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="">{t("common.none")}</option>
            {machineSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
            {machine && !machineSlugs.includes(machine) ? (
              <option value={machine}>{machine}</option>
            ) : null}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>{t("product.housePrice")}</label>
          <MoneyInput
            valueCents={housePrice}
            onChange={setHousePrice}
            label={t("product.housePrice")}
          />
        </div>
        <div className="field">
          <label>{t("product.sellingPrice")}</label>
          <MoneyInput
            valueCents={sellingPrice}
            onChange={setSellingPrice}
            label={t("product.sellingPrice")}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="pr-variants">{t("product.variants")}</label>
        <input
          id="pr-variants"
          type="text"
          value={variantsText}
          onChange={(e) => setVariantsText(e.target.value)}
        />
        <span className="faint">{t("product.variantsHint")}</span>
      </div>

      <div className="field">
        <label>{t("product.productionMinutes")}</label>
        <NumberInput value={minutes} onChange={setMinutes} />
      </div>

      {product && totalUnitCost(product.cost) > 0 ? (
        <p className="faint">
          {t("product.cost")}: {formatMXN(totalUnitCost(product.cost))}
        </p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        {product ? (
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

function ImportReport({
  report,
  onClose,
}: {
  report: ImportResult;
  onClose: () => void;
}): ReactNode {
  const t = useT();

  return (
    <Sheet title={t("product.importReport")} onClose={onClose}>
      <div className="stack">
        <div className="row between">
          <span>{t("product.importedProducts")}</span>
          <strong>{report.products.length}</strong>
        </div>
        <div className="row between">
          <span>{t("product.importedTiers")}</span>
          <strong>{report.tiers.length}</strong>
        </div>

        {report.tiers.length > 0 ? (
          <div className="row wrap" style={{ gap: 6 }}>
            {report.tiers.map((tier) => (
              <span key={tier.id} className="chip" style={{ color: tier.color }}>
                {tier.label}
              </span>
            ))}
          </div>
        ) : null}

        {report.inferred.length > 0 ? (
          <div className="warn-box">
            <strong>{t("product.inferred")}</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {report.inferred.map((line) => (
                <li key={line.index}>{formatInferred(t, line)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.unknownColumns.length > 0 ? (
          <div className="faint">
            {t("product.unknownColumns")}: {report.unknownColumns.join(", ")}
          </div>
        ) : null}

        {report.issues.length > 0 ? (
          <div className="warn-box" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            <strong>{t("product.importErrors", { count: report.issues.length })}</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {report.issues.slice(0, 12).map((issue, i) => (
                <li key={i}>{formatIssue(t, issue)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button className="btn primary block" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Sheet>
  );
}

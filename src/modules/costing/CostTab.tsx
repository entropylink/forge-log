// M2 — Costing (plan.md §6). Phase P3.
//
// Pick a product, enter what it takes to make, get a price. Saving writes the
// cost breakdown onto the Product, which is what Booth Mode reads to turn its
// "—" profit column into a real number.
//
// Every figure comes from lib/costing. This file does no arithmetic.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { db, newId } from "../../lib/dexie";
import { breakdownToUnitCost, computeCosting, type CostingInput } from "../../lib/costing";
import type { CostingLine } from "../../core-data/types";
import { machineLabel } from "../../lib/catalog";
import {
  useActiveMachines,
  useCostingForProduct,
  useMachineRates,
  useMaterials,
  useProducts,
  useUsdRate,
} from "../../lib/hooks";
import { formatMXN, formatUSD, totalUnitCost } from "../../lib/money";
import { config } from "../../config";
import {
  EmptyState,
  Money,
  MoneyInput,
  NumberInput,
  Sheet,
  Toast,
  useT,
  useToast,
} from "../../ui/common";
import { BulkCostView } from "./BulkCostView";
const EMPTY_INPUT: CostingInput = {
  materialLines: [],
  machineLines: [],
  laborMinutes: 0,
  consumables: [],
  batchQty: 1,
  feePct: 0,
  marginPct: config.pricing.defaultMarginPct,
  roundToPretty: false,
};

type Mode = "bulk" | "single";

export function CostTab(): ReactNode {
  const t = useT();
  // Bulk is the default: a catalog arrives with every product uncosted, and
  // costing them one at a time is the problem this tab exists to avoid.
  const [mode, setMode] = useState<Mode>("bulk");

  return (
    <>
      <div className="seg" style={{ marginBottom: 12 }}>
        {(["bulk", "single"] as Mode[]).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(`cost.mode.${m}`)}
          </button>
        ))}
      </div>
      {mode === "bulk" ? <BulkCostView /> : <SingleCostView />}
    </>
  );
}

function SingleCostView(): ReactNode {
  const t = useT();
  const products = useProducts();
  const materials = useMaterials();
  const machines = useActiveMachines();
  const machineRates = useMachineRates();
  const [usdRate, setUsdRate] = useUsdRate();
  const [toast, showToast] = useToast();

  const [productId, setProductId] = useState<string | null>(null);
  const [input, setInput] = useState<CostingInput>(EMPTY_INPUT);
  const [showRate, setShowRate] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = useCostingForProduct(productId);
  const product = (products ?? []).find((p) => p.id === productId) ?? null;

  // Selecting a product loads its saved costing input back into the form (the
  // record now stores the full input). Guarded by a ref so a slow load for an
  // earlier selection can't clobber a newer one.
  const selectedRef = useRef<string | null>(null);
  function selectProduct(id: string | null): void {
    selectedRef.current = id;
    setProductId(id);
    setInput(EMPTY_INPUT);
    if (!id) return;
    void db.costings
      .where("productId")
      .equals(id)
      .first()
      .then((existing) => {
        if (selectedRef.current === id && existing?.input) setInput(existing.input);
      });
  }

  const result = useMemo(
    () => computeCosting(input, materials ?? [], machineRates),
    [input, materials, machineRates],
  );

  if (!products || !materials || !machines) return <p className="muted">{t("app.loading")}</p>;

  if (products.length === 0) {
    return <EmptyState title={t("cost.noProducts")} hint={t("cost.noProductsHint")} />;
  }

  const patch = (over: Partial<CostingInput>): void => setInput({ ...input, ...over });

  async function saveToProduct(): Promise<void> {
    // Re-entrancy guard: a double-tap on the Save button (easy on a touch
    // screen) would otherwise run two saves; the second, seeing saved?.id still
    // undefined, mints a fresh newId and writes a duplicate Costing row.
    if (!product || saving) return;
    setSaving(true);
    const b = result.breakdown;
    const cost = breakdownToUnitCost(b);

    // Faithful, type-tagged breakdown (setup folds into labor) for any consumer
    // of the synced Costing record — no longer material-only-and-zeroed.
    const lines: CostingLine[] = (
      [
        ["material", b.materialCents],
        ["machineTime", b.machineCents],
        ["labor", b.laborCents + b.setupCents],
        ["consumable", b.consumableCents],
        ["packaging", b.packagingCents],
      ] as const
    )
      .filter(([, cents]) => cents > 0)
      .map(([type, cents]) => ({ type, qty: 1, unitCostCents: cents }));

    try {
      await db.products.update(product.id, { cost });
      await db.costings.put({
        id: saved?.id ?? newId("cost"),
        productId: product.id,
        input, // the full editor input, so re-opening reloads it exactly
        lines,
        marginPct: input.marginPct,
        computed: {
          costCents: result.unitCostCents,
          suggestedPriceCents: result.suggestedPriceCents ?? 0,
        },
      });
      showToast(t("cost.saved", { name: product.name }));
    } catch (e) {
      showToast(t("common.saveError", { error: e instanceof Error ? e.message : String(e) }), "error");
    } finally {
      setSaving(false);
    }
  }

  const usd = result.suggestedPriceCents === null ? null : formatUSD(result.suggestedPriceCents, usdRate);

  return (
    <>
      <div className="card">
        <h2>{t("cost.title")}</h2>
        <div className="field">
          <label htmlFor="c-product">{t("cost.product")}</label>
          <select
            id="c-product"
            value={productId ?? ""}
            onChange={(e) => selectProduct(e.target.value || null)}
          >
            <option value="">{t("cost.pickProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku ? `${p.sku} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {product ? (
          <p className="faint" style={{ marginBottom: 0 }}>
            {t("cost.currentPrice")}: {formatMXN(product.sellingPriceCents)}
            {totalUnitCost(product.cost) > 0
              ? ` · ${t("product.cost")} ${formatMXN(totalUnitCost(product.cost))}`
              : ` · ${t("product.noCost")}`}
          </p>
        ) : null}
      </div>

      {product ? (
        <>
          <MaterialLines
            input={input}
            patch={patch}
            materials={materials}
            result={result}
          />

          <MachineLines input={input} patch={patch} machines={machines} />

          <div className="card">
            <h2>{t("cost.labor")}</h2>
            <div className="field-row">
              <div className="field">
                <label>{t("cost.minutes")}</label>
                <NumberInput
                  value={input.laborMinutes}
                  onChange={(n) => patch({ laborMinutes: n ?? 0 })}
                />
              </div>
              <div className="field">
                <label>{t("cost.laborRate")}</label>
                <MoneyInput
                  valueCents={input.laborRateCentsPerHour ?? config.costing.defaultLaborRateCentsPerHour}
                  onChange={(c) => patch({ laborRateCentsPerHour: c ?? undefined })}
                  label={t("cost.laborRate")}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t("cost.setup")} ({t("cost.minutes")})</label>
                <NumberInput
                  value={input.setupMinutes ?? 0}
                  onChange={(n) => patch({ setupMinutes: n ?? 0 })}
                />
                <span className="faint">{t("cost.setupHint")}</span>
              </div>
              <div className="field">
                <label>{t("cost.batch")}</label>
                <NumberInput
                  value={input.batchQty}
                  onChange={(n) => patch({ batchQty: n ?? 1 })}
                  min={1}
                />
              </div>
            </div>
          </div>

          <Consumables input={input} patch={patch} />

          <div className="card">
            <h2>{t("cost.margin")}</h2>
            <div className="field">
              <label htmlFor="c-margin">
                {t("cost.margin")}: {input.marginPct}%
              </label>
              <input
                id="c-margin"
                type="range"
                min={0}
                max={90}
                step={1}
                value={input.marginPct}
                onChange={(e) => patch({ marginPct: Number(e.target.value) })}
              />
              <span className="faint">{t("cost.marginHint")}</span>
            </div>
            <div className="field">
              <label htmlFor="c-fee">
                {t("cost.fee")}: {input.feePct}%
              </label>
              <input
                id="c-fee"
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={input.feePct}
                onChange={(e) => patch({ feePct: Number(e.target.value) })}
              />
              <span className="faint">{t("cost.feeHint")}</span>
            </div>
            <div className="field">
              <label>{t("cost.roundPretty")}</label>
              <div className="seg">
                <button
                  type="button"
                  aria-pressed={input.roundToPretty === true}
                  onClick={() => patch({ roundToPretty: true })}
                >
                  {t("common.yes")}
                </button>
                <button
                  type="button"
                  aria-pressed={!input.roundToPretty}
                  onClick={() => patch({ roundToPretty: false })}
                >
                  {t("common.no")}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>{t("cost.breakdown")}</h2>
            <table className="cost-table">
              <tbody>
                <Row label={t("cost.materials")} cents={result.breakdown.materialCents} />
                <Row label={t("cost.machineTime")} cents={result.breakdown.machineCents} />
                <Row label={t("cost.labor")} cents={result.breakdown.laborCents} />
                <Row
                  label={`${t("cost.setup")} ${t("cost.batchOf", { n: input.batchQty })}`}
                  cents={result.breakdown.setupCents}
                />
                <Row label={t("cost.consumables")} cents={result.breakdown.consumableCents} />
                <Row label={t("cost.packaging")} cents={result.breakdown.packagingCents} />
                <tr className="total">
                  <td>{t("cost.unitCost")}</td>
                  <td className="num">
                    <Money cents={result.unitCostCents} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {result.warnings.includes("impossible-margin") ? (
            <div className="warn-box" style={{ marginBottom: 12 }}>
              {t("cost.impossible")}
            </div>
          ) : null}
          {result.warnings.includes("missing-material") ? (
            <div className="warn-box" style={{ marginBottom: 12 }}>
              {t("cost.missingMaterial")}
            </div>
          ) : null}

          <div
            className={`price-hero ${result.suggestedPriceCents === null ? "bad" : ""}`}
            style={{ marginBottom: 12 }}
          >
            <div className="label">{t("cost.suggestedPrice")}</div>
            <div className="amount tabular">
              {result.suggestedPriceCents === null
                ? "—"
                : formatMXN(result.suggestedPriceCents)}
            </div>
            {usd ? <div className="sub tabular">{usd}</div> : null}
            {result.profitCents !== null && result.effectiveMarginPct !== null ? (
              <div className="sub">
                {t("cost.profit")}: {formatMXN(result.profitCents)} ·{" "}
                {t("cost.effectiveMargin", { pct: result.effectiveMarginPct.toFixed(1) })}
              </div>
            ) : null}
            {result.feeCents > 0 ? (
              <div className="sub faint">
                {t("cost.fee")}: {formatMXN(result.feeCents)}
              </div>
            ) : null}
          </div>

          {input.batchQty > 1 && result.batchRevenueCents !== null ? (
            <div className="kpi-grid" style={{ marginBottom: 12 }}>
              <div className="kpi">
                <div className="k-label">{t("cost.batchCost")}</div>
                <div className="k-value tabular">{formatMXN(result.batchCostCents)}</div>
              </div>
              <div className="kpi">
                <div className="k-label">{t("cost.batchProfit")}</div>
                <div
                  className={`k-value tabular ${(result.batchProfitCents ?? 0) < 0 ? "neg" : "pos"}`}
                >
                  {formatMXN(result.batchProfitCents ?? 0)}
                </div>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="faint">{t("cost.atCurrentPrice")}</span>
              <strong className="tabular">{formatMXN(product.sellingPriceCents)}</strong>
            </div>
            {result.unitCostCents > 0 ? (
              <AtCurrentPrice
                unitCostCents={result.unitCostCents}
                priceCents={product.sellingPriceCents}
                feePct={input.feePct}
              />
            ) : (
              <p className="faint" style={{ margin: 0 }}>
                {t("cost.noCost")}
              </p>
            )}
          </div>

          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <button className="btn grow" onClick={() => setShowRate(true)}>
              {t("cost.usdRate")}
            </button>
            <button
              className="btn grow primary"
              disabled={result.unitCostCents === 0 || saving}
              onClick={() => void saveToProduct()}
            >
              {t("cost.saveToProduct")}
            </button>
          </div>
        </>
      ) : null}

      {showRate ? (
        <Sheet title={t("cost.usdRate")} onClose={() => setShowRate(false)}>
          <div className="field">
            <label>{t("cost.usdRate")}</label>
            <NumberInput
              value={usdRate}
              onChange={(n) => setUsdRate(n)}
              placeholder="17.50"
              step={0.01}
            />
            <span className="faint">{t("cost.usdRateHint")}</span>
          </div>
          <button className="btn primary block" onClick={() => setShowRate(false)}>
            {t("common.close")}
          </button>
        </Sheet>
      ) : null}

      <Toast toast={toast} />
    </>
  );
}

function Row({ label, cents }: { label: string; cents: number }): ReactNode {
  if (cents === 0) return null;
  return (
    <tr>
      <td className="muted">{label}</td>
      <td className="num">
        <Money cents={cents} />
      </td>
    </tr>
  );
}

function AtCurrentPrice({
  unitCostCents,
  priceCents,
  feePct,
}: {
  unitCostCents: number;
  priceCents: number;
  feePct: number;
}): ReactNode {
  const t = useT();
  const feeCents = Math.round((priceCents * feePct) / 100);
  const profit = priceCents - unitCostCents - feeCents;
  const pct = priceCents === 0 ? 0 : (profit / priceCents) * 100;

  return (
    <div className="row between">
      <span>{t("cost.profit")}</span>
      <strong className="tabular" style={{ color: profit < 0 ? "var(--danger)" : "var(--ok)" }}>
        {formatMXN(profit)} · {pct.toFixed(1)}%
      </strong>
    </div>
  );
}

function MaterialLines({
  input,
  patch,
  materials,
  result,
}: {
  input: CostingInput;
  patch: (o: Partial<CostingInput>) => void;
  materials: ReturnType<typeof useMaterials> & object;
  result: ReturnType<typeof computeCosting>;
}): ReactNode {
  const t = useT();

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t("cost.materials")}</h2>
        <button
          className="btn sm"
          disabled={materials.length === 0}
          onClick={() =>
            patch({
              materialLines: [
                ...input.materialLines,
                { materialId: materials[0].id, usagePct: 10 },
              ],
            })
          }
        >
          {t("cost.addMaterial")}
        </button>
      </div>

      {input.materialLines.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>
          {materials.length === 0 ? t("material.noneHint") : "—"}
        </p>
      ) : (
        input.materialLines.map((line, i) => (
          <div className="cost-line" key={i}>
            <select
              value={line.materialId}
              className="grow"
              onChange={(e) => {
                const next = [...input.materialLines];
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
            <div style={{ width: 92 }}>
              <NumberInput
                value={line.usagePct}
                label={t("cost.usage")}
                onChange={(n) => {
                  const next = [...input.materialLines];
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
                patch({ materialLines: input.materialLines.filter((_, j) => j !== i) })
              }
            >
              ✕
            </button>
          </div>
        ))
      )}

      {result.breakdown.materialCents > 0 ? (
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="faint">{t("cost.materials")}</span>
          <Money cents={result.breakdown.materialCents} />
        </div>
      ) : null}
    </div>
  );
}

function MachineLines({
  input,
  patch,
  machines,
}: {
  input: CostingInput;
  patch: (o: Partial<CostingInput>) => void;
  machines: NonNullable<ReturnType<typeof useActiveMachines>>;
}): ReactNode {
  const t = useT();

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t("cost.machineTime")}</h2>
        <button
          className="btn sm"
          disabled={machines.length === 0}
          onClick={() =>
            patch({
              machineLines: [...input.machineLines, { machineId: machines[0].id, minutes: 10 }],
            })
          }
        >
          {t("cost.addMachine")}
        </button>
      </div>

      {input.machineLines.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>
          {machines.length === 0 ? t("machine.noneActiveHint") : "—"}
        </p>
      ) : (
        input.machineLines.map((line, i) => (
          <div className="cost-line" key={i}>
            <select
              value={line.machineId}
              className="grow"
              onChange={(e) => {
                const next = [...input.machineLines];
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
            <div style={{ width: 92 }}>
              <NumberInput
                value={line.minutes}
                label={t("cost.minutes")}
                onChange={(n) => {
                  const next = [...input.machineLines];
                  next[i] = { ...line, minutes: n ?? 0 };
                  patch({ machineLines: next });
                }}
              />
            </div>
            <span className="faint">min</span>
            <button
              className="btn sm ghost danger"
              aria-label={t("common.delete")}
              onClick={() => patch({ machineLines: input.machineLines.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function Consumables({
  input,
  patch,
}: {
  input: CostingInput;
  patch: (o: Partial<CostingInput>) => void;
}): ReactNode {
  const t = useT();

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t("cost.consumables")}</h2>
        <button
          className="btn sm"
          onClick={() => patch({ consumables: [...input.consumables, { label: "", cents: 0 }] })}
        >
          {t("cost.addConsumable")}
        </button>
      </div>

      {input.consumables.map((line, i) => (
        <div className="cost-line" key={i}>
          <input
            type="text"
            className="grow"
            value={line.label}
            placeholder={t("cost.consumableLabel")}
            onChange={(e) => {
              const next = [...input.consumables];
              next[i] = { ...line, label: e.target.value };
              patch({ consumables: next });
            }}
          />
          <div style={{ width: 110 }}>
            <MoneyInput
              valueCents={line.cents}
              label={t("cost.consumables")}
              onChange={(c) => {
                const next = [...input.consumables];
                next[i] = { ...line, cents: c ?? 0 };
                patch({ consumables: next });
              }}
            />
          </div>
          <button
            className="btn sm ghost danger"
            aria-label={t("common.delete")}
            onClick={() => patch({ consumables: input.consumables.filter((_, j) => j !== i) })}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
        <label>{t("cost.packaging")}</label>
        <MoneyInput
          valueCents={input.packagingCents ?? 0}
          onChange={(c) => patch({ packagingCents: c ?? 0 })}
          label={t("cost.packaging")}
        />
      </div>
    </div>
  );
}

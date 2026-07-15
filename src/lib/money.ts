// Money engine. Every amount is integer centavos. Nothing here touches floats
// except through roundHalfUp, and nothing here touches React.
//
// Shares its centavo convention and formatting with Booth Mode so a figure
// derived in either app is the same figure.

import { config } from "../config";
import type { Cents, UnitCost } from "../core-data/types";

const { minorPerMajor, symbol } = config.currency;

/** Retail rounding: half away from zero. Math.round is half-up for positives. */
export function roundHalfUp(n: number): Cents {
  return Math.round(n);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** The one place the cost lines are added up. */
export function totalUnitCost(cost: UnitCost): Cents {
  return (
    cost.materialCents +
    cost.machineCents +
    cost.laborCents +
    cost.consumableCents +
    cost.packagingCents
  );
}

/**
 * "$1,250.50". Hand-rolled rather than Intl so output is identical across
 * Node/browser ICU builds — fixtures compare exact strings.
 */
export function formatMXN(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = Math.floor(abs / minorPerMajor);
  const minor = abs % minorPerMajor;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${symbol}${grouped}.${String(minor).padStart(2, "0")}`;
}

/** Compact form: "$250" when whole, "$249.50" otherwise. */
export function formatMXNCompact(cents: Cents): string {
  return cents % minorPerMajor === 0
    ? formatMXN(cents).replace(/\.00$/, "")
    : formatMXN(cents);
}

/**
 * USD alongside MXN (plan.md §6 M2 accept).
 *
 * Returns null when no rate is set. The app has no network at the bench, so
 * there is no live rate to fetch — and a stale or invented rate quietly
 * misprices everything. The user sets it, or USD stays hidden.
 */
export function formatUSD(cents: Cents, rateMXNPerUSD: number | null): string | null {
  if (rateMXNPerUSD === null || rateMXNPerUSD <= 0) return null;
  const usdCents = roundHalfUp(cents / rateMXNPerUSD);
  const negative = usdCents < 0;
  const abs = Math.abs(usdCents);
  const major = Math.floor(abs / minorPerMajor);
  const minor = abs % minorPerMajor;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}US$${grouped}.${String(minor).padStart(2, "0")}`;
}

/**
 * Parse user input ("1,250.5", "$249", "89.10") to centavos.
 * Returns null on anything malformed — callers must handle it.
 */
export function parseMXN(input: string): Cents | null {
  const s = input.trim().replace(/[$,\s]/g, "");
  if (s === "" || s === "." || s === "-" || s === "-.") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(s)) return null;

  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [intPart = "", fracPart = ""] = body.split(".");
  if (intPart === "" && fracPart === "") return null;

  const major = intPart === "" ? 0 : Number(intPart);
  const minor = Number((fracPart + "00").slice(0, 2));
  const cents = major * minorPerMajor + minor;
  return negative ? -cents : cents;
}

/** Cost of `minutes` at an hourly rate. */
export function ratePerMinute(hourlyRateCents: Cents, minutes: number): Cents {
  return roundHalfUp((hourlyRateCents * minutes) / 60);
}

/**
 * Round a price up to something that reads like a price (plan.md §6 M2).
 *
 * Rounds up to the next step, then drops a peso: 243 → 250 → **249**, which is
 * the plan's own example. Always rounds *up*, so prettifying can never quietly
 * price below the margin the user asked for.
 */
export function prettyPrice(cents: Cents): Cents {
  if (cents <= 0) return 0;
  const pesos = cents / minorPerMajor;
  const step =
    config.pricing.prettyLadder.find((rule) => pesos < rule.upTo)?.step ??
    config.pricing.prettyLadder[config.pricing.prettyLadder.length - 1].step;

  const stepCents = step * minorPerMajor;
  const rounded = Math.ceil(cents / stepCents) * stepCents;
  const pretty = rounded - minorPerMajor;
  // Below one step there is nothing to prettify into; keep the honest number.
  return pretty < cents ? rounded : pretty;
}

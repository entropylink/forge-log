// Shared UI primitives. Targets are oversized: plan.md §7 says this gets used
// with gloves on, next to a running laser.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMXN, parseMXN } from "../lib/money";
import type { Cents, Tier } from "../core-data/types";

export function useT(): ReturnType<typeof useTranslation>["t"] {
  return useTranslation().t;
}

/** "Flagship – go deep" reads as "Flagship" on a badge; the rest is the title. */
export function tierShort(tier: Tier): string {
  return (tier.label.split(/\s+[–—-]\s+/)[0] ?? tier.label).trim();
}

export function TierBadge({ tier }: { tier: Tier }): ReactNode {
  return (
    <span className="tier-badge" style={{ color: tier.color }} title={tier.label}>
      {tierShort(tier)}
    </span>
  );
}

export function Money({ cents, className = "" }: { cents: Cents; className?: string }): ReactNode {
  return <span className={`money ${className}`}>{formatMXN(cents)}</span>;
}

export function Stars({ n }: { n: number }): ReactNode {
  return (
    <span className="stars" aria-label={`${n}/5`}>
      {"★".repeat(n)}
      {"☆".repeat(5 - n)}
    </span>
  );
}

export function MoneyInput({
  valueCents,
  onChange,
  label,
  placeholder,
  autoFocus,
}: {
  valueCents: Cents | null;
  onChange: (cents: Cents | null) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}): ReactNode {
  const [text, setText] = useState(() =>
    valueCents === null ? "" : (valueCents / 100).toFixed(2),
  );

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      autoFocus={autoFocus}
      placeholder={placeholder ?? "0.00"}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMXN(e.target.value));
      }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  min = 0,
  max = 100000,
  step = 1,
  placeholder,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}): ReactNode {
  const [text, setText] = useState(value === null ? "" : String(value));

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder ?? ""}
      aria-label={label}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "") return onChange(null);
        const n = Number(raw.replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(n)) return onChange(null);
        onChange(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => {
        if (value !== null && text.trim() !== "") setText(String(value));
      }}
      data-step={step}
    />
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }): ReactNode {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function useToast(ms = 1800): [string | null, (m: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string) => {
      setMessage(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  return [message, show];
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint ? <span className="faint">{hint}</span> : null}
    </div>
  );
}

export function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}): ReactNode {
  return (
    <div className="seg">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
          {n}★
        </button>
      ))}
    </div>
  );
}

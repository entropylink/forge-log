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

// Only the TOP-most open sheet reacts to Escape/Tab, so a sheet opened inside
// another doesn't collapse the whole stack at once.
const sheetStack: symbol[] = [];
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Read the latest onClose without depending on its identity: nearly every call
  // site passes an inline arrow, so a new function is created on each parent
  // re-render (e.g. a background-sync liveQuery tick, or typing in a NumberInput
  // that re-renders the parent). If the effect below keyed on onClose, every such
  // re-render would tear it down and re-run it — stealing focus back to the first
  // field mid-typing and re-pushing this sheet to the top of the stack, which
  // mis-routes Escape/Tab when sheets are nested.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = Symbol();
    sheetStack.push(id);
    const restore = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
    };

    // Move focus into the dialog on open — but only if focus isn't already inside
    // it. An autoFocus field may have claimed it (e.g. the Name input), and we
    // must not yank the caret off it to the DOM-first field.
    if (!dialogRef.current?.contains(document.activeElement)) {
      (focusables()[0] ?? dialogRef.current)?.focus();
    }

    const onKey = (e: KeyboardEvent): void => {
      if (sheetStack[sheetStack.length - 1] !== id) return; // not the top sheet
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap Tab within the dialog.
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = sheetStack.lastIndexOf(id);
      if (i >= 0) sheetStack.splice(i, 1);
      restore?.focus?.(); // return focus to whatever opened the sheet
    };
    // Mount-only: onClose is read through onCloseRef so a fresh inline-arrow
    // identity on re-render doesn't re-run this effect (which would steal focus
    // and reorder the sheet stack). See onCloseRef note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="sheet-backdrop"
      data-noswipe
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export interface ToastMsg {
  text: string;
  tone: "ok" | "error";
}

export function Toast({ toast }: { toast: ToastMsg | null }): ReactNode {
  if (!toast) return null;
  const isError = toast.tone === "error";
  return (
    <div
      className={`toast ${isError ? "error" : ""}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {toast.text}
    </div>
  );
}

/** Transient message. Pass tone "error" for failures (red, and it lingers). */
export function useToast(
  ms = 1800,
): [ToastMsg | null, (text: string, tone?: "ok" | "error") => void] {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, tone: "ok" | "error" = "ok") => {
      setToast({ text, tone });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : ms);
    },
    [ms],
  );

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  return [toast, show];
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

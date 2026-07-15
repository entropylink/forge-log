# Forge Log

Maker OS for laser & vinyl workshops: material settings library, job costing,
quotes→commissions (Bench), offcut inventory (Scrap Yard).

Full spec: [plan.md](./plan.md)

## Status

Skeleton, **plus a working stock-template import/export** — the contract with
the sibling app **Booth Mode** (`../booth-mode`), which is built. No other
feature is implemented yet. See plan.md §10 for build phases.

## Stack

Vite + React + TypeScript, Capacitor (iOS/Android), Dexie (local-first),
Firebase (Auth/Firestore/Storage/Functions), Stripe billing, i18next (EN/ES).

## The shared stock template

`src/core-data/template.ts` is the CSV contract with Booth Mode and is
**duplicated byte-for-byte** in `../booth-mode/src/core-data/template.ts`.
Change it here and you must change it there. Booth Mode's
`src/lib/interop.test.ts` imports a real file emitted by this repo's
`exportCatalogCSV` and fails if the two drift apart.

Full column reference: `../booth-mode/docs/stock-template.md`.

**The division of labour.** Forge Log is the workshop side: it owns costs,
production times, machines, tiers and `current_qty`. It writes
`goal_qty`/`packed_qty`/`made` as empty because it has no fair to have an
opinion about — Booth Mode owns those.

The loop: Forge Log exports the catalog → Booth Mode sets targets, packs, sells
→ the sales data shows which tiers were wrong → you revise the tiers here.

The `Tier` / `UnitCost` / `Product` block in `src/core-data/types.ts` is likewise
shared and must stay identical across the two repos.

**Tiers are data, not a 1–5 enum.** They're hypotheses about what will sell
("Flagship – go deep", "Hero – exhibition") and get revised against real sales.
Forge Log owns editing them.

## Run

```bash
npm install
npm test      # vitest — template import/export and the Booth Mode contract
npm run dev
```

# Forge Log

Maker OS for laser & vinyl workshops: material settings library, job costing,
quotes→commissions (Bench), offcut inventory (Scrap Yard).

Full spec: [plan.md](./plan.md)

Shares product/inventory schema with the sibling app **Booth Mode**
(`../booth-mode`) — see plan.md §5 for the shared `Product` shape. This repo
is currently standalone (not a monorepo package) — schema is duplicated
locally in `src/core-data/types.ts` until sync is built (v1.5+, plan.md §5/§10).

## Stack

Vite + React + TypeScript, Capacitor (iOS/Android), Dexie (local-first),
Firebase (Auth/Firestore/Storage/Functions), Stripe billing, i18next (EN/ES).

## Status

Skeleton only — no features implemented yet. See plan.md §10 for build phases.

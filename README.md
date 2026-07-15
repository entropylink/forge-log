# Forge Log

Maker OS for laser & vinyl workshops: material settings library, job costing,
quotes→commissions (Bench), offcut inventory (Scrap Yard).

Full spec: [plan.md](./plan.md)

## Status — v1 offline core built

| Phase | Deliverable | State |
|---|---|---|
| P0 | Scaffold, core-data schemas, tokens, i18n, Dexie | done |
| P1 | Machine catalog + Material + Settings CRUD, offline, search (M1) | done |
| P2 | Photo capture→compress→Storage; Auth + Firestore sync | capture + compression done; **sync/auth need a Firebase project** |
| P3 | Costing module (M2) | done |
| P4 | Stripe billing + trial gating | not started (needs a Stripe account) |
| P5 | Capacitor builds, store metadata | not started (needs devices/store accounts) |
| P6 | Scrap Yard (v1.5) | not started |
| P7 | Bench (v2) | not started |

Everything built works offline. There is no Firebase call anywhere yet — photos
are compressed and held in IndexedDB, ready for the P2 upload.

## Run

```bash
npm install
npm run dev
npm test      # vitest — costing golden cases, settings search, the Booth Mode contract
npm run build
```

## Architecture

- `src/lib/costing.ts` — the price engine. Pure. **Margin is a share of the
  price, not a markup on cost**, and **platform fees come out of the price**, so
  the price is solved for rather than piled up: `price × (1 − fee% − margin%) = cost`.
  Treating the fee as a cost line under-prices every time.
- `src/lib/money.ts` — integer centavos, never floats. Shares its convention with
  Booth Mode so a figure derived in either app is the same figure.
- `src/lib/search.ts` — "3mm birch cut" → the setting you meant. Relevance first,
  then quality (rating, verified, recency) as the tie-break.
- `src/lib/params.ts` — which knobs a setting has, per machine type. A diode laser
  and a vinyl cutter share only "speed", so the form is generated, not branched.
- `src/core-data/template.ts` — the CSV contract with Booth Mode, **byte-identical**
  to `../booth-mode/src/core-data/template.ts`.

## The suite loop

Forge Log is the workshop: it owns costs, production times, machines, tiers and
`current_qty`. Booth Mode is the fair: it owns targets, packing, sales and cash.

They exchange one CSV. `../booth-mode/src/lib/interop.test.ts` imports real files
this repo emitted — including a costed LEATHER KEYCHAIN row — and asserts Booth
Mode turns them into real profit figures. It fails if the two ever drift.

**Tiers are hypotheses, not price bands.** "Flagship – go deep", "Hero –
exhibition" are bets on what sells. Forge Log owns editing them (Products →
Manage tiers); Booth Mode's sales numbers are what tells you a bet was wrong.

## The machine catalog

`src/core-data/machine-catalog.json` — 40 machines, a versioned pack that seeds
on first run and only ever *adds*, so your edits survive a refresh.

**Specs are community-sourced and ship unverified** (plan.md §12). Brand, model
and type are reliable; bed sizes and wattages are approximate working areas, and
are `null` wherever they could not be sourced honestly — including, deliberately,
the xTool M2 and Cameo 5α. "Will my job fit on the bed" is load-bearing, so
`fitsOnBed` returns `null` rather than a confident guess, and activating a
machine walks you through confirming its specs.

## Unknown beats wrong

The recurring rule across both apps: cost 0 means "not captured", not "free".
Margin is `null` rather than a fake 100%; an impossible margin (margin + fee ≥
100%) is refused rather than turned into a vast number; USD is hidden until you
set a rate, because there's no network at the bench and a stale rate misprices
everything.

## Known gaps

- **No sync.** P2's Firestore/Auth half needs a Firebase project. Settings,
  costings and photos are device-local.
- **No billing, no store builds.** P4/P5 need Stripe and store accounts.
- Scrap Yard and Bench are not built; the plan puts them after v1 ships.
- Costing lines are entered per-session and saved to the Product's cost
  breakdown. The `Costing` record is stored but not yet reloaded into the form
  for editing.
- `src/lib/__fixtures__/feria-stock-plan.csv` is the vendor's real catalog with
  real prices — a test fixture, and this repo is private.

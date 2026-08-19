# Forge Log — plan.md

> **Maker OS for laser & vinyl workshops**: material settings library, job costing, quotes→commissions (Bench), offcut inventory (Scrap Yard). One app, four modules, shared data with Booth Mode.
>
> Status: **built — v1 core offline (P0, P1, P3 complete; P2 partial)** · Source: Fable 5 planning session 2026-07-12 · Score 17/20 (rank #1)
> Suggested vault path: `domains/products/apps/forge-log/plan.md`
>
> **Estado real (2026-07-18):**
> - Built: P0, P1, P3 complete; from P2 only photo capture + client-side compression; 94 unit tests green.
> - No pnpm monorepo — the `core-data` contract is duplicated byte-identical across the two repos, guarded by an interop test (decision documented in code; differs from §4).
> - Not a PWA yet.
> - Firebase scaffolded but unused (dead code; config via env vars).
> - The §8 "CI grep check" does not exist.
> - `runs/` unused; P4–P7 not started.

---

## 1. Decisions locked (from planning session)

- All four modules in scope (Settings, Costing, Bench, Scrap Yard) — phased, not simultaneous.
- Machine support: full catalog of common machines, user-selectable + custom machines. Not hardcoded to xTool M2 / Cameo 5α (those are just the first two Francis activates).
- Priced from day 1 (no free tier; trial instead).
- Bilingual EN/ES, EN default.
- Shares inventory/product data with Booth Mode (see §5 and booth-mode-plan.md).

## 2. Problem & user

Every maker with a laser/vinyl cutter keeps settings in notebooks, prices by gut, quotes over DM, and hoards a mystery box of offcuts. Existing tools each cover one sliver: LightBurn's material library (desktop-only, no costing), Craftybase (~$24/mo, costing only, no settings), Etsy DMs (quotes). Nobody bundles the physical-shop loop: **settings → cost → quote → job → leftover material → next job cheaper.**

Primary user: solo/duo maker, 1–3 machines, sells on Etsy/fairs/commissions. Proven spender (owns $400–$3,000 of hardware). Francis is user #1 with xTool M2 + Cameo 5α.

## 3. Scope

**v1 (ship):** Settings module + Costing module + machine catalog + offline-first + sync + billing.
**v1.5:** Scrap Yard.
**v2:** Bench (quotes/commissions, public client links).
**Explicitly out (any version):** design tools (LightBurn/Silhouette Studio own that), machine control/streaming, marketplace, team/multi-user shops (solo-first; revisit at traction).

## 4. Architecture & stack

- **App:** Vite + React + TypeScript PWA, wrapped with **Capacitor** for iOS/Android store builds. Chosen over single-file house style because: camera capture, background sync, push, and store distribution exceed the single-file pattern's ceiling. House visual language still applies (§8).
- **Local-first:** Dexie (IndexedDB) is the source of truth on device. Workshop wifi is unreliable; every feature must work in airplane mode.
- **Sync/backend:** Firebase — Auth (email + Google), Firestore (sync), Storage (test-result photos), Cloud Functions + Hosting (Bench public quote/status pages in v2). Sync strategy: per-record `updatedAt` last-write-wins for settings/costing; **append-only event log** for anything money-related (Bench, and Booth Mode sales) with derived state.
- **Billing:** Stripe (supports MXN) via web checkout; store IAP only where policy forces it. License state cached locally, verified opportunistically.
- **Monorepo:** `apps/forge-log`, `apps/booth-mode`, `packages/core-data` (schemas, sync engine, product/inventory types shared with Booth Mode), `packages/ui` (Entropy design tokens).

## 5. Data model (core entities)

```
Machine        id, brand, model, type(diode|co2|fiber|vinyl), wattage/force, bedW, bedH,
               source(catalog|custom), notes
Material       id, name, category(wood|acrylic|leather|vinyl|paper|metal|other),
               thickness, sheetW, sheetH, sheetCostMXN/USD, supplier, notes
Setting        id, machineId, materialId, operation(cut|engrave|score|mark|weed),
               params{power,speed,passes,lpi,freq | bladeDepth,force,speed,passes},
               resultRating(1-5), photoRefs[], notes, testedAt, verified(bool)
Product        id, name, tier(1-5), variants[], photoRef, defaultPriceMXN,
               costingId, stockByVariant{}          ← SHARED with Booth Mode
Costing        id, productId?, lines[{type(material|machineTime|labor|consumable|fee),
               qty, unitCost}], marginPct, computed{cost, suggestedPrice}
Offcut         id, materialId, w, h, thickness, qty, binLocation, photoRef, addedAt   (v1.5)
Quote/Job      (v2 — Bench) id, clientRef, lines[], depositPct, deadline,
               status(quote|accepted|in_progress|ready|delivered|paid), publicToken, events[]
```

Machine **catalog** ships as a versioned JSON pack (~40 machines): xTool (D1/D1 Pro/M1/M2/S1/P2/F1/F2), Glowforge (Basic/Plus/Pro/Aura/Spark), OMTech (K40+/Polar/AF series), Atomstack, Sculpfun, Creality Falcon, Longer Ray, Monport, Thunder Nova, Gweike Cloud; vinyl: Silhouette Cameo 4/5/5α/Portrait 4, Cricut Maker 3/4, Explore 3, Joy Xtra, Brother ScanNCut SDX/DX. Catalog updates OTA as JSON; users add custom machines with the same shape.

## 6. Feature spec

### M1 — Settings Library (the daily driver)
- CRUD settings keyed by machine + material + operation. Duplicate-and-tweak flow (most settings are variations).
- Camera capture of test result directly from the setting form; photos compressed client-side (≤300KB) before Storage upload.
- Search-first UI: type "3mm birch cut" → results ranked by rating, verified flag, recency.
- Test-grid helper: generate a power/speed matrix suggestion for a new material; record which cell won.
- **Accept:** create, search, and edit settings fully offline; photo attaches; sync reconciles across 2 devices without dupes.

### M2 — Costing
- Cost lines: material (auto from Material sheet cost × usage %), machine time (per-machine hourly rate setting), labor (rate × minutes), consumables, platform fees %.
- Margin slider → suggested price; round-to-pretty (e.g., 249 MXN) toggle.
- Save as Costing attached to a Product (feeds Booth Mode pricing + Bench quotes).
- Batch mode: "×20 units" recomputes with setup-time amortization.
- **Accept:** 10 golden test cases (hand-computed) pass exactly; currency displays MXN and USD correctly.

### M3 — Scrap Yard (v1.5)
- Add offcut: pick material, enter W×H (+qty), snap photo, assign bin.
- Job planner check: given required W×H, list offcuts that fit (v1.5 = rectangle-fit only, largest-leftover-first; no polygon nesting — documented limitation).
- Consume flow: cutting from an offcut splits/updates it or deletes it.
- **Accept:** fit-check returns correct candidates for 15 fixture cases incl. rotation.

### M4 — Bench (v2)
- Quote builder from Costings/Products → shareable public link (Cloud Function-rendered, no login) → client taps Accept → becomes Job with deposit amount + deadline.
- Job pipeline board: quote / accepted / in progress / ready / delivered / paid.
- Client status page auto-updates from pipeline (kills "is it ready?" messages).
- Change-order button on any accepted job → priced addendum link.
- **Accept:** full happy path headlessly: quote created → link fetched → accepted → status page reflects each stage; money math exact.

## 7. Screens/UX map

Tab bar: **Settings · Cost · Products · Scrap (v1.5) · Bench (v2)** + global search. Machine/material pickers are persistent chips (last-used sticky). Big-thumb targets — this gets used with gloves next to a running laser.

## 8. i18n & house style

- i18next; EN default, `es-MX` complete at every release (string-freeze gate per phase). No hardcoded UI strings — CI grep check.
- Entropy tokens: space-dark shell, gold `#b89857` accent, Cinzel display / Crimson Pro body via `packages/ui`. Per-app accent: ember orange.

## 9. Pricing & billing

- Subscription model; includes the Booth Mode module. Pricing, trial policy, and competitive positioning are tracked outside this repo.

## 10. Build phases (plan-then-execute; each phase = one cheap-model session with gate)

| Phase | Deliverable | Gate (must pass before next) |
|---|---|---|
| P0 | Monorepo scaffold, `core-data` schemas, Entropy `ui` tokens, i18n wiring, Dexie layer | `pnpm test` green; strings audit script exists |
| P1 | Machine catalog + Material + Settings CRUD, offline, search | M1 accept criteria; Playwright offline run |
| P2 | Photo capture→compress→Storage; Auth + Firestore sync | 2-device sync fixture; no dupes; conflict test |
| P3 | Costing module | M2 golden cases pass |
| P4 | Stripe billing + trial gating | Sub lifecycle e2e (trial→paid→cancel) |
| P5 | Capacitor builds, store metadata (EN/ES), icons/splash | Installs on physical Android + iOS |
| P6 | Scrap Yard | M3 accept |
| P7 | Bench + Functions public pages | M4 accept |

Execution notes for cheaper models: never widen a phase; every session appends to `runs/forge-log/<date>.md` (vault-ops format); config values (rates, rounding rules) live in one `config.ts` — config-only tuning, abyss-gamefeel style.

## 11. QA discipline

Headless-first (abyss-selfqa pattern generalized): Playwright drives the PWA — offline toggle, primary flows, screenshot diffs; money math and fit-checks are pure functions with unit fixtures. **No phase closes on "looks right."**

## 12. Risks & mitigations

- **Suite scope-creep** → hard phase gates; Bench deliberately last.
- **Photo storage cost** → client-side compression, per-account quota, lifecycle rules.
- **Sync conflicts on money** → event-log append-only for Bench/Booth; derived balances.
- **Catalog accuracy** (machine specs) → mark catalog entries "community-sourced"; settings are user-verified anyway (verified flag).
- **Store review friction (Capacitor+Stripe web billing)** → follow current external-purchase rules per platform at P5; fallback IAP price points reserved.

## 13. Success metrics

Settings used on ≥80% of real cuts within 2 weeks (self-log); 10 external beta makers onboarded. Commercial go/no-go thresholds are tracked outside this repo.

## 14. Open questions

- Stripe MXN + SAT/invoicing (facturación) for Mexican customers — resolve before P4.
- Trial with/without card — A/B at launch.
- Catalog licensing: specs compiled from public sources; keep values ranges, not manufacturer-copied tables.

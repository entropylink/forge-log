// The workshop drill: the catalog must boot and be usable with no network, and a
// saved costing must reload back into the form (the record now stores the full
// input). Unit tests cover the arithmetic; this covers the real PWA
// (service-worker precache, IndexedDB durability, and the cost save/reload glue).
import { test, expect, type Page } from "@playwright/test";

async function seedProduct(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const q = indexedDB.open("forge-log");
      q.onsuccess = () => res(q.result);
    });
    const put = (store: string, value: unknown): Promise<void> =>
      new Promise((res) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => res();
      });
    const now = new Date().toISOString();
    await put("tiers", { id: "t1", label: "Flagship", sortOrder: 0, color: "#5eb0e5", updatedAt: now });
    await put("products", {
      id: "p1",
      sku: "S1",
      name: "Widget",
      variants: ["—"],
      tierId: "t1",
      cost: { materialCents: 0, machineCents: 0, laborCents: 0, consumableCents: 0, packagingCents: 0 },
      housePriceCents: 5000,
      sellingPriceCents: 5000,
      stockByVariant: { "—": 0 },
      active: true,
      updatedAt: now,
    });
    db.close();
  });
}

// A saved costing whose full input is stored, with a distinctive marginPct so we
// can prove the form reloaded it.
async function seedCosting(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const q = indexedDB.open("forge-log");
      q.onsuccess = () => res(q.result);
    });
    const put = (store: string, value: unknown): Promise<void> =>
      new Promise((res) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => res();
      });
    await put("costings", {
      id: "c1",
      productId: "p1",
      lines: [{ type: "labor", qty: 1, unitCostCents: 500 }],
      marginPct: 63,
      input: {
        materialLines: [],
        machineLines: [],
        laborMinutes: 20,
        consumables: [],
        batchQty: 1,
        feePct: 0,
        marginPct: 63,
        roundToPretty: false,
      },
      computed: { costCents: 500, suggestedPriceCents: 1400 },
      updatedAt: new Date().toISOString(),
    });
    db.close();
  });
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await seedProduct(page);
  await page.reload();
}

test("boots from cache and shows seeded catalog with the network cut", async ({ page, context }) => {
  await boot(page);
  await context.setOffline(true);
  await page.reload(); // must come from the SW precache
  // Products tab is the last tab (settings · cost · products).
  await page.locator("nav.tabbar button").last().click();
  await expect(page.getByText("Widget")).toBeVisible();
});

test("reloads a saved costing's full input back into the form", async ({ page }) => {
  await boot(page);
  await seedCosting(page);

  // Cost tab (middle) → single mode → pick the product.
  await page.locator("nav.tabbar button").nth(1).click();
  await page.locator(".seg").first().locator("button").nth(1).click(); // "single"
  await page.locator("#c-product").selectOption("p1");

  // The distinctive 63% margin from the saved input is now shown — the form
  // hydrated from the stored CostingInput rather than opening blank.
  await expect(page.getByText(/63\s*%/)).toBeVisible();
});

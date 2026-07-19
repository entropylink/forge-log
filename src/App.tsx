// App shell: Settings · Cost · Products (plan.md §7).
//
// Scrap Yard (v1.5) and Bench (v2) are deliberately absent — the plan puts them
// after v1 ships, and adding empty tabs now would just be scope creep with a
// tab bar.

import { useEffect, useState, type ReactNode } from "react";
import { seedCatalog } from "./lib/dexie";
import { toggleLang } from "./i18n";
import { SettingsTab } from "./modules/settings/SettingsTab";
import { CostTab } from "./modules/costing/CostTab";
import { ProductsTab } from "./modules/products/ProductsTab";
import { useT } from "./ui/common";
import { SyncSheet } from "./ui/SyncSheet";

type Tab = "settings" | "cost" | "products";
const TABS: Tab[] = ["settings", "cost", "products"];

export default function App(): ReactNode {
  const t = useT();
  const [tab, setTab] = useState<Tab>("settings");
  const [ready, setReady] = useState(false);
  const [showSync, setShowSync] = useState(false);

  // Seed the machine catalog on first run. Only ever adds, so a user's own
  // edits survive a catalog refresh (see seedCatalog).
  useEffect(() => {
    void seedCatalog().finally(() => setReady(true));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>{t("app.name")}</h1>
        <span className="spacer" />
        <button className="chip" onClick={() => setShowSync(true)} aria-label={t("sync.title")}>
          ⟳
        </button>
        <button className="chip" onClick={() => toggleLang()}>
          {t("app.lang")}
        </button>
      </header>

      <main className="main">
        {!ready ? (
          <p className="muted">{t("app.loading")}</p>
        ) : (
          <>
            {tab === "settings" ? <SettingsTab /> : null}
            {tab === "cost" ? <CostTab /> : null}
            {tab === "products" ? <ProductsTab /> : null}
          </>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((name) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => setTab(name)}
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </nav>

      {showSync ? <SyncSheet onClose={() => setShowSync(false)} /> : null}
    </div>
  );
}

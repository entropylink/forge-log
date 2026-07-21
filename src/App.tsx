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
import { useSwipeNav } from "./ui/gestures";
import { SyncSheet } from "./ui/SyncSheet";

type Tab = "settings" | "cost" | "products";
const TABS: Tab[] = ["settings", "cost", "products"];

export default function App(): ReactNode {
  const t = useT();
  const [tab, setTab] = useState<Tab>("settings");
  const [navDir, setNavDir] = useState<1 | -1>(1);
  const [ready, setReady] = useState(false);
  const [showSync, setShowSync] = useState(false);

  // Seed the machine catalog on first run. Only ever adds, so a user's own
  // edits survive a catalog refresh (see seedCatalog).
  useEffect(() => {
    void seedCatalog().finally(() => setReady(true));
  }, []);

  // Tab navigation, remembering direction so the new tab slides in the way the
  // finger moved. Used by both the tab bar and the swipe gesture.
  function go(next: Tab): void {
    setNavDir(TABS.indexOf(next) >= TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
  }
  const swipe = useSwipeNav(
    (dir) => {
      const next = TABS.indexOf(tab) + dir;
      if (next >= 0 && next < TABS.length) go(TABS[next]);
    },
    ready && !showSync,
  );

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

      <main className="main" {...swipe}>
        {!ready ? (
          <p className="muted">{t("app.loading")}</p>
        ) : (
          <div key={tab} className="tab-view" data-dir={navDir === 1 ? "next" : "prev"}>
            {tab === "settings" ? <SettingsTab /> : null}
            {tab === "cost" ? <CostTab /> : null}
            {tab === "products" ? <ProductsTab /> : null}
          </div>
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((name) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => go(name)}
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </nav>

      {showSync ? <SyncSheet onClose={() => setShowSync(false)} /> : null}
    </div>
  );
}

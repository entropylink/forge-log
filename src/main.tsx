import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles.css";

// Ask the browser to keep our IndexedDB — the only copy of the catalog and
// costings — from being evicted under storage pressure. Best-effort.
void navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

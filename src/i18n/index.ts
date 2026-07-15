// i18next wiring. EN is the default (plan.md §8); es-MX is complete at every
// release. No hardcoded UI strings.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

const LANG_KEY = "forge-log.lang";

export const SUPPORTED_LANGS = ["en", "es"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

function initialLang(): Lang {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "es" || saved === "en") return saved;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: initialLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  if (typeof localStorage !== "undefined") localStorage.setItem(LANG_KEY, lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function toggleLang(): void {
  setLang(i18n.language === "en" ? "es" : "en");
}

export default i18n;

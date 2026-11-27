import {
  LANGUAGES,
  resolveLocale,
  type Locale,
  type LanguagePreference,
} from "../../src/shared/i18n/languages";

export { LANGUAGES, resolveLocale };
export type { Locale, LanguagePreference };
export type CopyValues = Record<string, string | number>;
type Catalog = Record<string, string>;
// Each catalog is ~400 KB of JSON. A literal require per case lets Metro evaluate only the one a
// screen asks for, instead of building all eight on every cold start (including background launches).
// English and Turkish copy is written inline at each call, so the app normally loads at most one.
function requireCatalog(locale: Locale): Catalog {
  switch (locale) {
    case "en": return require("./locales/en.json");
    case "tr": return require("./locales/tr.json");
    case "de": return require("./locales/de.json");
    case "fr": return require("./locales/fr.json");
    case "es": return require("./locales/es.json");
    case "pt": return require("./locales/pt.json");
    case "zh-CN": return require("./locales/zh-CN.json");
    case "ja": return require("./locales/ja.json");
  }
}
const loaded: Partial<Record<Locale, Catalog>> = {};
export function catalogFor(locale: Locale): Catalog {
  return (loaded[locale] ??= requireCatalog(locale));
}
/** Every catalog, each loaded on first read. */
export const catalogs = Object.defineProperties(
  {} as Record<Locale, Catalog>,
  Object.fromEntries(
    LANGUAGES.map(({ value }) => [value, { enumerable: true, get: () => catalogFor(value) }]),
  ),
);
export function translate(
  locale: Locale,
  turkish: string,
  english: string,
  values?: CopyValues,
): string {
  const text =
    locale === "tr" ? turkish : locale === "en" ? english : (catalogFor(locale)[english] ?? english);
  return values
    ? text.replace(/\{(p\d+)\}/g, (placeholder, key: string) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder,
      )
    : text;
}

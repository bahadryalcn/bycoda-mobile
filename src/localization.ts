import {
  LANGUAGES,
  resolveLocale,
  type Locale,
  type LanguagePreference,
} from "../../src/shared/i18n/languages";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh-CN.json";
import ja from "./locales/ja.json";

export { LANGUAGES, resolveLocale };
export type { Locale, LanguagePreference };
export type CopyValues = Record<string, string | number>;
export const catalogs: Record<Locale, Record<string, string>> = {
  en,
  tr,
  de,
  fr,
  es,
  pt,
  "zh-CN": zh,
  ja,
};
export function translate(
  locale: Locale,
  turkish: string,
  english: string,
  values?: CopyValues,
): string {
  const text =
    locale === "tr" ? turkish : locale === "en" ? english : (catalogs[locale][english] ?? english);
  return values
    ? text.replace(/\{(p\d+)\}/g, (placeholder, key: string) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder,
      )
    : text;
}

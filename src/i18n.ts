import { getLocales, useLocales } from "expo-localization";
import { useMachines } from "./state/machines";
import { resolveLocale, translate } from "./localization";
export function tr(en: string, turkish: string): string {
  const language = useMachines.getState().language;
  const locale =
    language === "system"
      ? resolveLocale(getLocales().map((locale) => locale.languageTag))
      : language;
  return translate(locale, turkish, en);
}
export function useLanguage() {
  return useMachines((s) => s.language);
}
export function useLocale() {
  const language = useLanguage();
  const locales = useLocales();
  return language === "system"
    ? resolveLocale(locales.map((locale) => locale.languageTag))
    : language;
}

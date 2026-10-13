import { getLocales } from "expo-localization";
import { useMachines } from "@/state/machines";
import { resolveLocale } from "@/localization";
export const identifier = () =>
  `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const stamp = (value?: number | string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const language = useMachines.getState().language;
  const locale = language === "system" ? resolveLocale(getLocales().map((entry) => entry.languageTag)) : language;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
};

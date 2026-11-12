import { getLocales } from "expo-localization";
import { useMachines } from "@/state/machines";
import { resolveLocale } from "@/localization";
export const identifier = () =>
  `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const activeLocale = () => {
  const language = useMachines.getState().language;
  return language === "system" ? resolveLocale(getLocales().map((entry) => entry.languageTag)) : language;
};
export const stamp = (value?: number | string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(activeLocale(), { dateStyle: "medium", timeStyle: "short" });
};
/** Month and day without a time; the year appears only when it differs from `now`'s year. */
export const shortDate = (value: number, now = Date.now()) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(activeLocale(), sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
};

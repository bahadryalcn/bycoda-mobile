import { useLocale } from "../i18n";
import { translate, type CopyValues } from "../localization";
export function useCopy() {
  const locale = useLocale();
  return (tr: string, en: string, values?: CopyValues) => translate(locale, tr, en, values);
}

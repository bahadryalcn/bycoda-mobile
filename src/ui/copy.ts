import { useLocale } from "../i18n";
import { translate, type CopyValues, type Locale } from "../localization";
/** `locale` is attached for errorMessage, which then reads only the active catalog; plain test copies omit it. */
export type Copy = ((tr: string, en: string, values?: CopyValues) => string) & { readonly locale?: Locale };
export function useCopy(): Copy {
  const locale = useLocale();
  return Object.assign((tr: string, en: string, values?: CopyValues) => translate(locale, tr, en, values), { locale });
}

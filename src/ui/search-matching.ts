/** Match using the active app language, including Turkish dotted/dotless I. */
export function normalizeSearch(value: string, locale?: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase(locale);
}

export function matchesSearch(text: string, query: string, locale?: string): boolean {
  return normalizeSearch(text, locale).includes(normalizeSearch(query, locale));
}

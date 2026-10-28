/** Match using the active app language, including Turkish dotted/dotless I. */
export function matchesSearch(text: string, query: string, locale: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase(locale);
  return normalize(text).includes(normalize(query));
}

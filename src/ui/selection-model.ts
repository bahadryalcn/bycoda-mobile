import { matchesSearch } from "./search-matching";

export type SelectionOption<T extends string = string> = {
  value: T;
  label: string;
  /** Consecutive options with this label share a visible heading. */
  group?: string;
  /** A second heading inside a group, e.g. the model whose effort variants follow. */
  subgroup?: string;
  /** Complete name for the closed field's summary; defaults to "group · label". */
  summaryLabel?: string;
  detail?: string;
  /** Product names and alternate spellings use language-neutral matching. */
  searchKeywords?: string;
  disabled?: boolean;
};

/** An empty unselected value needs the placeholder; named default choices retain their label. */
export function selectionLabels<T extends string>(values: readonly T[], labels: ReadonlyMap<T, string>): string[] {
  return values.map((value) => labels.get(value) ?? value).filter((label) => label !== "");
}

export function filterSelection<T extends SelectionOption>(
  options: readonly T[],
  search: string,
  locale?: string,
) {
  return options.filter((option) =>
    matchesSearch(`${option.group ?? ""} ${option.subgroup ?? ""} ${option.label} ${option.detail ?? ""}`, search, locale) ||
    (option.searchKeywords !== undefined && matchesSearch(option.searchKeywords, search, "en")),
  );
}

/** Keep existing choices removable at the limit; never silently discard selections. */
export function toggleSelection<T extends string>(
  values: readonly T[],
  value: T,
  max?: number,
): T[] {
  if (values.includes(value)) return values.filter((item) => item !== value);
  return max !== undefined && values.length >= max ? [...values] : [...values, value];
}

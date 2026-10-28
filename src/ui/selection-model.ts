export type SelectionOption<T extends string = string> = {
  value: T;
  label: string;
  detail?: string;
  disabled?: boolean;
};

/** An empty unselected value needs the placeholder; named default choices retain their label. */
export function selectionLabels<T extends string>(values: readonly T[], labels: ReadonlyMap<T, string>): string[] {
  return values.map((value) => labels.get(value) ?? value).filter((label) => label !== "");
}

export function filterSelection<T extends SelectionOption>(
  options: readonly T[],
  search: string,
) {
  const term = search.trim().toLocaleLowerCase();
  return options.filter((option) =>
    `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(term),
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

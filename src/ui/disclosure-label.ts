/**
 * Accessible name for a Disclosure trigger. The collapsed summary (`detail`) is
 * visible only while collapsed, so it is appended to the name only then; once
 * expanded the name is the label alone. Keeps assistive tech in step with the
 * visible text without changing expanded state or actions.
 */
export function disclosureAccessibleLabel(label: string, detail: string | undefined, expanded: boolean): string {
  return [label, !expanded && detail].filter(Boolean).join(". ");
}

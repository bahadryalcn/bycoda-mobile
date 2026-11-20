/**
 * Spoken text of a record's identity. An explicit `accessibilityLabel` replaces the text of the
 * children, and `Hint` (Tooltip) fills one in with the hint when the child has none, so the title,
 * status and metadata must be spelled out here. The hint is a separate `accessibilityHint`; the
 * expanded/collapsed state comes from `accessibilityState`, so neither is repeated in the label.
 */
export function recordSpokenLabel({ title, status, metadata }: { title: string; status?: string; metadata?: string }): string {
  const parts: string[] = [];
  for (const part of [title, status, metadata]) {
    const text = part?.trim();
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.join(". ");
}

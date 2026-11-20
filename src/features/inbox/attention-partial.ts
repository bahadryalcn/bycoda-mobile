/**
 * Whether the Host left projects out of this attention read. Older Hosts never send the field,
 * so anything but a non-empty list counts as a complete read.
 */
export function attentionPartial(inbox: { unavailableProjectIds?: unknown } | undefined): boolean {
  return Array.isArray(inbox?.unavailableProjectIds) && inbox.unavailableProjectIds.length > 0;
}

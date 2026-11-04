/** Steward configuration writes wrap the target record; run/delete use stewardId. */
export function savedStewardId(
  variables: Record<string, unknown> | undefined,
): string | undefined {
  const steward = variables?.steward;
  return steward &&
    typeof steward === "object" &&
    "id" in steward &&
    typeof steward.id === "string"
    ? steward.id
    : undefined;
}

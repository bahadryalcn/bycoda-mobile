/** Localized copy lookup, same shape as `useCopy()` returns. */
export type CrewCopy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** Host verdicts are `pass` or `fail`; a missing verdict is still awaiting review. */
export function reviewVerdictLabel(verdict: "pass" | "fail" | undefined, copy: CrewCopy): string {
  if (verdict === "pass") return copy("Başarılı", "Passed");
  if (verdict === "fail") return copy("Başarısız", "Failed");
  return copy("İnceleme bekleniyor", "Awaiting review");
}

/** `owner` is the signed-in user, the coordinator session gets its role, other sessions read as members. */
export function messageSenderLabel(
  from: string,
  coordinatorSessionId: string | undefined,
  copy: CrewCopy,
): string {
  if (from === "owner") return copy("Sen", "You");
  if (from === coordinatorSessionId) return copy("Koordinatör", "Coordinator");
  return copy("Üye", "Member");
}

export type AccountMetadataChange =
  | { kind: "rename"; label: string }
  | { kind: "color"; color: string | null }
  | { kind: "default"; confirm: "DEFAULT_FOR_FUTURE_SESSIONS" }
  | { kind: "quotaRefresh"; confirm: "REFRESH_PROVIDER_QUOTA" };
export type AccountMetadataDraft = {
  kind: "rename" | "color" | "default" | "quotaRefresh";
  label: string;
  color: string | null;
  pending?: {
    operationId: string;
    targetDigest: string;
    environmentId: string;
    expectedAccountRevision: string;
    change: AccountMetadataChange;
  };
  finished?: boolean;
};
export function validateAccountChange(value: unknown): AccountMetadataChange {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== "object") throw Error("Invalid account metadata review");
  if (
    v.kind === "quotaRefresh" &&
    Object.keys(v).length === 2 &&
    v.confirm === "REFRESH_PROVIDER_QUOTA"
  )
    return { kind: "quotaRefresh", confirm: "REFRESH_PROVIDER_QUOTA" };
  if (
    v.kind === "rename" &&
    Object.keys(v).length === 2 &&
    typeof v.label === "string" &&
    v.label.trim() &&
    v.label.length <= 48 &&
    !/[\0\r\n]/.test(v.label)
  )
    return { kind: "rename", label: v.label.replace(/\s+/g, " ").trim() };
  if (
    v.kind === "color" &&
    Object.keys(v).length === 2 &&
    (v.color === null ||
      ["blue", "coral", "amber", "green", "pink", "purple", "teal", "slate", "orange"].includes(
        String(v.color),
      ))
  )
    return { kind: "color", color: v.color as string | null };
  if (
    v.kind === "default" &&
    Object.keys(v).length === 2 &&
    v.confirm === "DEFAULT_FOR_FUTURE_SESSIONS"
  )
    return { kind: "default", confirm: "DEFAULT_FOR_FUTURE_SESSIONS" };
  throw Error("Invalid account metadata change");
}
export function decodeAccountDraft(raw: string): AccountMetadataDraft {
  if (raw.length > 4096) throw Error("Invalid saved account metadata");
  const v = JSON.parse(raw) as AccountMetadataDraft;
  if (
    !v ||
    Object.keys(v).some((k) => !["kind", "label", "color", "pending", "finished"].includes(k)) ||
    !["rename", "color", "default", "quotaRefresh"].includes(v.kind) ||
    typeof v.label !== "string" ||
    v.label.length > 48 ||
    /[\0\r\n]/.test(v.label) ||
    (v.finished !== undefined && typeof v.finished !== "boolean")
  )
    throw Error("Invalid saved account metadata");
  validateAccountChange({ kind: "color", color: v.color });
  if (v.pending) {
    const p = v.pending;
    if (
      Object.keys(p).length !== 5 ||
      !/^[a-f0-9]{64}$/.test(p.targetDigest) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(p.operationId) ||
      typeof p.environmentId !== "string" ||
      !p.environmentId ||
      p.environmentId.length > 256 ||
      !/^[a-f0-9]{64}$/.test(p.expectedAccountRevision)
    )
      throw Error("Invalid saved account operation");
    validateAccountChange(p.change);
  }
  if (v.pending && v.finished) throw Error("Invalid saved account operation");
  return v;
}
export const encodeAccountDraft = (v: AccountMetadataDraft | null) =>
  v ? JSON.stringify(v) : null;

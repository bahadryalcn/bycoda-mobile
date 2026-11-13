import {
  SessionProviderSchema,
  SessionRuntimeModeSchema,
} from "../../../../src/shared/model/host-contracts";
import type { SessionSettingsDraft } from "./session-settings-types";

export type StoredSessionSettings = {
  baseline: SessionSettingsDraft;
  values: SessionSettingsDraft;
  authorityGeneration?: number;
  revision?: number;
};
function validDraft(value: unknown): value is SessionSettingsDraft {
  if (!value || typeof value !== "object") return false;
  const row = value as SessionSettingsDraft;
  return (
    typeof row.title === "string" &&
    SessionProviderSchema.safeParse(row.provider).success &&
    typeof row.model === "string" &&
    SessionRuntimeModeSchema.safeParse(row.mode).success &&
    (row.accountId === undefined || typeof row.accountId === "string") &&
    !!row.modelSettings &&
    typeof row.modelSettings === "object" &&
    !Array.isArray(row.modelSettings) &&
    Object.values(row.modelSettings).every((item) => typeof item === "string")
  );
}
export function decodeSessionSettingsDraft(raw: string): StoredSessionSettings {
  const value = JSON.parse(raw) as StoredSessionSettings;
  if (
    !value ||
    !validDraft(value.baseline) ||
    !validDraft(value.values) ||
    (value.revision !== undefined &&
      (!Number.isSafeInteger(value.revision) || value.revision < 0)) ||
    (value.authorityGeneration !== undefined &&
      (!Number.isSafeInteger(value.authorityGeneration) || value.authorityGeneration < 1))
  )
    throw new Error("Saved session settings could not be loaded.");
  return value;
}
export const encodeSessionSettingsDraft = (value: StoredSessionSettings | null) =>
  value === null ? null : JSON.stringify(value);

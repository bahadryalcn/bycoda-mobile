import type { HostSettingsState } from "../../remote/types";

export type SettingsFields = { maxRunning: string; dailyMinutes: string };
export type SettingsDraft = { override: SettingsFields | null };
export function readHostSettingsState(value: unknown): HostSettingsState {
  const row = value as HostSettingsState | null;
  if (!row || !Number.isSafeInteger(row.maxRunningTasks) || row.maxRunningTasks < 1 ||
    !Number.isSafeInteger(row.dailyAgentMinutes) || row.dailyAgentMinutes < 0 ||
    typeof row.usedMinutes !== "number" || !Number.isFinite(row.usedMinutes) || row.usedMinutes < 0 || typeof row.limitReached !== "boolean")
    throw new Error("Invalid computer task settings");
  return { maxRunningTasks: row.maxRunningTasks, dailyAgentMinutes: row.dailyAgentMinutes, usedMinutes: row.usedMinutes, limitReached: row.limitReached };
}
export const settingsFields = (
  settings: Pick<HostSettingsState, "maxRunningTasks" | "dailyAgentMinutes">,
): SettingsFields => ({
  maxRunning: String(settings.maxRunningTasks),
  dailyMinutes: String(settings.dailyAgentMinutes),
});
export function validSettingsFields(fields: SettingsFields): boolean {
  const max = Number(fields.maxRunning);
  const minutes = Number(fields.dailyMinutes);
  return (
    /^\d+$/.test(fields.maxRunning) &&
    /^\d+$/.test(fields.dailyMinutes) &&
    Number.isSafeInteger(max) &&
    max >= 1 &&
    Number.isSafeInteger(minutes) &&
    minutes >= 0
  );
}
/** An acknowledgement applies only to the submitted snapshot, never to later edits. */
export function acknowledgeSettingsDraft(
  current: SettingsDraft,
  submitted: SettingsFields,
): SettingsDraft {
  return current.override === submitted ? { override: null } : current;
}

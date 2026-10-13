import type { HostSettingsState } from "../../remote/types";

export type SettingsFields = { maxRunning: string; dailyMinutes: string };
export type SettingsDraft = { override: SettingsFields | null };
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
    !!fields.maxRunning.trim() &&
    !!fields.dailyMinutes.trim() &&
    Number.isInteger(max) &&
    max >= 1 &&
    max <= 8 &&
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

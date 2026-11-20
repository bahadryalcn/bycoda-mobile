import type { HostSettingsState } from "../../remote/types";
import type { AgentDefaultsRecord as HostAgentDefaultsRecord } from "../../../../src/features/tasks/model/hostSettings";

/** The mobile editor only reads and writes the fields it exposes. */
export type AgentDefaultsRecord = Omit<HostAgentDefaultsRecord, "usageLimitFailover">;

/** Capability-gated reply: never silently fill malformed behavior fields. */
export function readAgentDefaults(value: unknown): AgentDefaultsRecord {
  const row = (value as { agentDefaults?: unknown } | null)?.agentDefaults as AgentDefaultsRecord | undefined;
  if (!row || row.schemaVersion !== 1 || !Number.isSafeInteger(row.version) || row.version < 0 ||
    ![row.keepAwakeWhileAgentsWork, row.autoContinueInterrupted, row.resumeAtReset, row.archiveMergedSessions].every(value => typeof value === "boolean") ||
    !["0", "15m", "30m", "1h", "4h", "forever"].includes(row.keepAwakeHoldAfter) ||
    !["paced", "adaptive"].includes(row.streamingTextMode) ||
    !Number.isSafeInteger(row.archiveInactiveDays) || row.archiveInactiveDays < 0 || row.archiveInactiveDays > 3650)
    throw new Error("Invalid computer agent defaults");
  return { schemaVersion: 1, version: row.version, keepAwakeWhileAgentsWork: row.keepAwakeWhileAgentsWork,
    keepAwakeHoldAfter: row.keepAwakeHoldAfter, autoContinueInterrupted: row.autoContinueInterrupted,
    resumeAtReset: row.resumeAtReset, streamingTextMode: row.streamingTextMode,
    archiveMergedSessions: row.archiveMergedSessions, archiveInactiveDays: row.archiveInactiveDays };
}
/** Archive controls exist only on computers that advertise the archive safety capability. */
export const AUTO_ARCHIVE_CAPABILITY = "host.settings.autoArchive.v1";
export function withoutArchive(value: AgentDefaultsRecord): Omit<AgentDefaultsRecord, "archiveMergedSessions" | "archiveInactiveDays"> {
  const { archiveMergedSessions: _merged, archiveInactiveDays: _days, ...rest } = value;
  return rest;
}
export function inactiveDays(value: string): number | undefined {
  const days = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(days) && days >= 0 && days <= 3650 ? days : undefined;
}
/** `submitted` may omit the archive fields: only the keys it carries must be echoed back. */
export function confirmAgentDefaults(value: unknown, submitted: Partial<AgentDefaultsRecord> & { version: number }): AgentDefaultsRecord {
  const result = readAgentDefaults(value);
  if (result.version <= submitted.version || (Object.keys(submitted) as (keyof AgentDefaultsRecord)[])
    .some(key => key !== "version" && submitted[key] !== result[key])) throw new Error("Agent defaults were not confirmed");
  return result;
}

export type SettingsFields = { maxRunning: string; dailyMinutes: string };
/** Holds only the limits the user edited; every other field follows the latest host values. */
export type SettingsDraft = { override: Partial<SettingsFields> | null };
export type SettingsLimits = Pick<HostSettingsState, "maxRunningTasks" | "dailyAgentMinutes">;
/** The save carries just the edited limits, so a limit changed elsewhere is never overwritten. */
export function editedLimits(edited: Partial<SettingsFields>): Partial<SettingsLimits> {
  return {
    ...(edited.maxRunning !== undefined ? { maxRunningTasks: Number(edited.maxRunning) } : {}),
    ...(edited.dailyMinutes !== undefined ? { dailyAgentMinutes: Number(edited.dailyMinutes) } : {}),
  };
}
/** The host echo must match the limits that were sent; untouched limits may differ. */
export function confirmsEditedLimits(result: SettingsLimits, sent: Partial<SettingsLimits>): boolean {
  return (Object.keys(sent) as (keyof SettingsLimits)[]).every((key) => result[key] === sent[key]);
}
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
  submitted: Partial<SettingsFields>,
): SettingsDraft {
  return current.override === submitted ? { override: null } : current;
}

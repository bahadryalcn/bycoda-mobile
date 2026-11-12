import { DIAGNOSTIC_MAX_SOURCES, type DiagnosticSection } from "../account/contracts";
import { logDiagnostic } from "./diagnostic-log";

export const HOST_LOGS_METHOD = "diagnostics.logs.read";
export const HOST_LOGS_CAPABILITY = "diagnostics.logs.v1";
export const MAX_HOSTS = 3;
export const HOST_LOGS_DEADLINE_MS = 4000;

export interface HostLogsResult {
  hostVersion: string;
  sections: { name: string; text: string; truncated: boolean }[];
}
export interface HostLogMachine {
  id: string;
  capabilities?: string[];
}
export interface CollectedHostLogs {
  sections: DiagnosticSection[];
  hostVersions: string[];
}

// The latest logs are enough: `host-previous` and `host-stdout` are not uploaded.
const RENAMED: Record<string, string> = {
  host: "remote-host",
  "host-crash": "remote-host-crash",
  "host-environment": "remote-host-env",
};
/** Dropped first when the report has too many sources. */
const LOW_PRIORITY = /-(previous|stdout)(-\d)?$/;

/** Narrows an untrusted RPC answer; anything unexpected counts as "no logs". */
export function parseHostLogs(value: unknown): HostLogsResult | null {
  const record = value as { hostVersion?: unknown; sections?: unknown } | null;
  if (!record || typeof record.hostVersion !== "string" || !Array.isArray(record.sections)) return null;
  const sections = record.sections.flatMap((entry: unknown) => {
    const item = entry as { name?: unknown; text?: unknown; truncated?: unknown } | null;
    return typeof item?.name === "string" && item.name in RENAMED && typeof item.text === "string"
      ? [{ name: item.name, text: item.text, truncated: item.truncated === true }]
      : [];
  });
  return { hostVersion: record.hostVersion.slice(0, 32), sections };
}

/**
 * Reads the diagnostic logs of up to three Hosts in parallel, each with a deadline. A Host that
 * lacks the capability, fails or times out is skipped with an info breadcrumb.
 */
export async function collectHostLogs(
  machines: readonly HostLogMachine[],
  read: (machine: HostLogMachine) => Promise<unknown>,
  deadlineMs = HOST_LOGS_DEADLINE_MS,
): Promise<CollectedHostLogs> {
  const candidates = machines.slice(0, MAX_HOSTS);
  const results = await Promise.all(
    candidates.map(async (machine) => {
      if (!machine.capabilities?.includes(HOST_LOGS_CAPABILITY)) {
        logDiagnostic("info", "mobile.diagnostics", "host logs skipped", { reason: "unsupported" });
        return null;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const answer = await Promise.race([
          read(machine),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), deadlineMs);
          }),
        ]);
        const parsed = parseHostLogs(answer);
        if (!parsed) logDiagnostic("info", "mobile.diagnostics", "host logs skipped", { reason: "invalid" });
        return parsed;
      } catch (error) {
        logDiagnostic("info", "mobile.diagnostics", "host logs skipped", {
          reason: error instanceof Error && error.message === "timeout" ? "timeout" : "error",
        });
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  const sections: DiagnosticSection[] = [];
  const hostVersions: string[] = [];
  let index = 0;
  for (const result of results) {
    if (!result) continue;
    index += 1;
    hostVersions.push(result.hostVersion);
    for (const section of result.sections)
      sections.push({
        name: `${RENAMED[section.name]}${index > 1 ? `-${index}` : ""}`,
        text: section.text,
        truncated: section.truncated,
      });
  }
  return { sections, hostVersions };
}

/** Mobile sections first and always kept; Host sections fill the rest, previous/stdout dropped first. */
export function capSections(
  mobile: readonly DiagnosticSection[],
  host: readonly DiagnosticSection[],
  max = DIAGNOSTIC_MAX_SOURCES,
): DiagnosticSection[] {
  const keep = [...host];
  while (mobile.length + keep.length > max && keep.length > 0) {
    let drop = -1;
    for (let i = keep.length - 1; i >= 0; i -= 1)
      if (LOW_PRIORITY.test(keep[i]!.name)) {
        drop = i;
        break;
      }
    keep.splice(drop >= 0 ? drop : keep.length - 1, 1);
  }
  return [...mobile, ...keep];
}

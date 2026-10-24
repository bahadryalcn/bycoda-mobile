import { readDesktopManagement, type DesktopManagementReport } from "./provider-desktop-model";
export type AccountMetadataStatus = {
  state: "unknown" | "failed" | "applied";
  operationId: string;
  atomic: false;
  snapshot?: DesktopManagementReport;
  message?: string;
};
export function readAccountMetadataStatus(
  value: unknown,
  expected: { environmentId: string; sessionId: string; operationId: string },
): AccountMetadataStatus {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    typeof v !== "object" ||
    Object.keys(v).some(
      (k) => !["state", "operationId", "atomic", "snapshot", "message"].includes(k),
    ) ||
    v.operationId !== expected.operationId ||
    v.atomic !== false ||
    !["unknown", "failed", "applied"].includes(String(v.state)) ||
    (v.message !== undefined && (typeof v.message !== "string" || v.message.length > 500)) ||
    (v.state !== "applied" && v.snapshot !== undefined) ||
    (v.state === "applied" && v.snapshot === undefined)
  )
    throw Error("Account metadata result could not be verified");
  const snapshot =
    v.snapshot === undefined ? undefined : readDesktopManagement(v.snapshot, expected);
  return { ...v, snapshot } as AccountMetadataStatus;
}

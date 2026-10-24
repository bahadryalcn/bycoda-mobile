export type SshConnection = {
  id: string;
  name: string;
  host: string;
  port: number;
  hasIdentity: boolean;
  hasJump: boolean;
  hasProxy: boolean;
};
export type SshWorkspaceReview = {
  reviewId: string;
  expiresAt: number;
  operation: "connect" | "close";
  connection: SshConnection;
  configurationDigest: string;
  workspaceId?: string;
  terminalCount: number;
  nativeApprovalRequired: true;
  phoneTerminal: false;
};
export type SshWorkspaceStatus = {
  state: "unknown" | "pending" | "opening" | "opened-on-computer" | "exited" | "closed" | "failed";
  workspaceId?: string;
  connectionId?: string;
  terminalCount?: number;
  pendingNativeApproval?: boolean;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string =>
  typeof value === "string" && !!value && value.length <= max && !/[\0\r\n]/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const connection = (value: unknown): value is SshConnection =>
  object(value) &&
  exact(value, ["id", "name", "host", "port", "hasIdentity", "hasJump", "hasProxy"]) &&
  text(value.id) &&
  text(value.name) &&
  text(value.host, 255) &&
  Number.isInteger(value.port) &&
  Number(value.port) >= 1 &&
  Number(value.port) <= 65535 &&
  [value.hasIdentity, value.hasJump, value.hasProxy].every((field) => typeof field === "boolean");
export function readSshCatalog(value: unknown): SshConnection[] {
  if (
    !object(value) ||
    !exact(value, ["connections", "phoneTerminal", "sftp", "forwards", "runbooks"]) ||
    [value.phoneTerminal, value.sftp, value.forwards, value.runbooks].some(
      (field) => field !== false,
    ) ||
    !Array.isArray(value.connections) ||
    value.connections.length > 500 ||
    !value.connections.every(connection) ||
    new Set(value.connections.map((row) => row.id)).size !== value.connections.length
  )
    throw new Error("Invalid SSH workspace catalog");
  return value.connections;
}
export function readSshWorkspaceReview(
  value: unknown,
  operation: "connect" | "close",
  target: string,
): SshWorkspaceReview {
  if (
    !object(value) ||
    !exact(value, [
      "reviewId",
      "expiresAt",
      "operation",
      "connection",
      "configurationDigest",
      "workspaceId",
      "terminalCount",
      "nativeApprovalRequired",
      "phoneTerminal",
    ]) ||
    !text(value.reviewId) ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.operation !== operation ||
    !connection(value.connection) ||
    typeof value.configurationDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.configurationDigest) ||
    !Number.isSafeInteger(value.terminalCount) ||
    Number(value.terminalCount) < 0 ||
    Number(value.terminalCount) > 1 ||
    value.nativeApprovalRequired !== true ||
    value.phoneTerminal !== false ||
    (operation === "connect"
      ? value.connection.id !== target || value.workspaceId !== undefined
      : value.workspaceId !== target || !text(value.workspaceId))
  )
    throw new Error("Invalid SSH workspace review");
  return value as SshWorkspaceReview;
}
export function readSshWorkspaceStatus(value: unknown): SshWorkspaceStatus {
  if (
    !object(value) ||
    !exact(value, [
      "state",
      "workspaceId",
      "connectionId",
      "terminalCount",
      "pendingNativeApproval",
    ]) ||
    !["unknown", "pending", "opening", "opened-on-computer", "exited", "closed", "failed"].includes(
      String(value.state),
    ) ||
    (value.workspaceId !== undefined && !text(value.workspaceId)) ||
    (value.connectionId !== undefined && !text(value.connectionId)) ||
    (value.terminalCount !== undefined &&
      (!Number.isSafeInteger(value.terminalCount) ||
        Number(value.terminalCount) < 0 ||
        Number(value.terminalCount) > 1)) ||
    (value.pendingNativeApproval !== undefined && typeof value.pendingNativeApproval !== "boolean")
  )
    throw new Error("Invalid SSH workspace receipt");
  return value as SshWorkspaceStatus;
}

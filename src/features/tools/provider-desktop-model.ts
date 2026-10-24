export type DesktopQuota = {
  status: "idle" | "fetching" | "ok" | "error" | "unavailable";
  updatedAt: number;
  session: QuotaWindow | null;
  weekly: QuotaWindow | null;
  monthly: QuotaWindow | null;
  renewalPending: boolean;
};
type QuotaWindow = { usedPercent: number; windowMinutes: number; resetsAt: number | null };
export type DesktopManagementReport = {
  environmentId: string;
  sourceSessionId: string;
  projectCwd: string;
  workingCwd: string;
  sampledAt: number;
  revision: string;
  accountRevision: string;
  accounts: {
    provider: "claude" | "codex";
    id: string;
    label: string;
    color: string | null;
    isDefault: boolean;
    quota: DesktopQuota;
  }[];
  mcp: { provider: string; name: string; scope: string; transport: string; enabled: boolean }[];
  coverage: {
    accountMetadata: "desktop-owner";
    quotaSource: "desktop-cache";
    mcpSource: "desktop-cache" | "unavailable";
    truncated: boolean;
  };
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && Object.keys(v).every((key) => keys.includes(key));
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max && !/[\0\r\n]/.test(v);
const time = (v: unknown) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 8640000000000000;
const window = (v: unknown) =>
  v === null ||
  (record(v) &&
    exact(v, ["usedPercent", "windowMinutes", "resetsAt"]) &&
    typeof v.usedPercent === "number" &&
    Number.isFinite(v.usedPercent) &&
    v.usedPercent >= 0 &&
    v.usedPercent <= 100 &&
    typeof v.windowMinutes === "number" &&
    Number.isFinite(v.windowMinutes) &&
    v.windowMinutes > 0 &&
    (v.resetsAt === null || time(v.resetsAt)));
export function readDesktopManagement(
  value: unknown,
  expected: { environmentId: string; sessionId: string },
): DesktopManagementReport {
  const invalid = () => {
    throw Error("Invalid desktop account and MCP response");
  };
  if (
    !record(value) ||
    !exact(value, [
      "environmentId",
      "sourceSessionId",
      "projectCwd",
      "workingCwd",
      "sampledAt",
      "revision",
      "accountRevision",
      "accounts",
      "mcp",
      "coverage",
    ]) ||
    value.environmentId !== expected.environmentId ||
    value.sourceSessionId !== expected.sessionId ||
    !text(value.projectCwd, 4096) ||
    !text(value.workingCwd, 4096) ||
    !time(value.sampledAt) ||
    !/^[a-f0-9]{64}$/.test(String(value.revision)) ||
    !/^[a-f0-9]{64}$/.test(String(value.accountRevision))
  )
    return invalid();
  if (
    !Array.isArray(value.accounts) ||
    value.accounts.length > 128 ||
    !value.accounts.every(
      (a) =>
        record(a) &&
        exact(a, ["provider", "id", "label", "color", "isDefault", "quota"]) &&
        ["claude", "codex"].includes(String(a.provider)) &&
        text(a.id, 128) &&
        text(a.label, 160) &&
        (a.color === null ||
          ["blue", "coral", "amber", "green", "pink", "purple", "teal", "slate", "orange"].includes(
            String(a.color),
          )) &&
        typeof a.isDefault === "boolean" &&
        record(a.quota) &&
        exact(a.quota, ["status", "updatedAt", "session", "weekly", "monthly", "renewalPending"]) &&
        ["idle", "fetching", "ok", "error", "unavailable"].includes(String(a.quota.status)) &&
        time(a.quota.updatedAt) &&
        window(a.quota.session) &&
        window(a.quota.weekly) &&
        window(a.quota.monthly) &&
        typeof a.quota.renewalPending === "boolean",
    )
  )
    return invalid();
  if (new Set(value.accounts.map((a) => `${a.provider}:${a.id}`)).size !== value.accounts.length)
    return invalid();
  if (
    !Array.isArray(value.mcp) ||
    value.mcp.length > 256 ||
    !value.mcp.every(
      (m) =>
        record(m) &&
        exact(m, ["provider", "name", "scope", "transport", "enabled"]) &&
        ["claude", "claude_desktop", "codex", "cursor", "opencode"].includes(String(m.provider)) &&
        text(m.name, 160) &&
        ["local", "project", "user"].includes(String(m.scope)) &&
        ["stdio", "sse", "http", "streamable-http", "unknown"].includes(String(m.transport)) &&
        typeof m.enabled === "boolean",
    )
  )
    return invalid();
  if (
    !record(value.coverage) ||
    !exact(value.coverage, ["accountMetadata", "quotaSource", "mcpSource", "truncated"]) ||
    value.coverage.accountMetadata !== "desktop-owner" ||
    value.coverage.quotaSource !== "desktop-cache" ||
    !["desktop-cache", "unavailable"].includes(String(value.coverage.mcpSource)) ||
    typeof value.coverage.truncated !== "boolean"
  )
    return invalid();
  return value as DesktopManagementReport;
}

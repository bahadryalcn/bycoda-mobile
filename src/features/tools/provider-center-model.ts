import { REMOTE_PROVIDERS } from "@/domain/providers";
export type ProviderCenterAgent = { id: string; name: string; argumentCount: number; environmentKeyCount: number; contextWindow?: number };
export type ProviderCenterReport = {
  environmentId: string; sampledAt: number;
  providers: { id: string; label: string; launcher: "resolved" | "unavailable" | "unknown"; accountState: "desktop-only" }[];
  acp: { revision: string; agents: ProviderCenterAgent[] };
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.length > 0 && value.length <= limit && !/[\0\r\n]/.test(value);
const count = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 64;
/** Reject accidental raw config fields before TanStack Query may cache the response. */
export function readProviderCenter(value: unknown, environmentId: string): ProviderCenterReport {
  const invalid = () => { throw new Error("Invalid safe provider center response"); };
  if (!record(value) || !keys(value, ["environmentId", "sampledAt", "providers", "acp"]) || !text(value.environmentId, 256) || value.environmentId !== environmentId ||
    !Number.isSafeInteger(value.sampledAt) || Number(value.sampledAt) < 0 || Number(value.sampledAt) > 8640000000000000 || !Array.isArray(value.providers) || value.providers.length > 32 ||
    !value.providers.every((row) => record(row) && keys(row, ["id", "label", "launcher", "accountState"]) && REMOTE_PROVIDERS.includes(row.id as typeof REMOTE_PROVIDERS[number]) &&
      text(row.label, 160) && ["resolved", "unavailable", "unknown"].includes(String(row.launcher)) && row.accountState === "desktop-only") ||
    !record(value.acp) || !keys(value.acp, ["revision", "agents"]) || !/^[a-f0-9]{64}$/.test(String(value.acp.revision)) || !Array.isArray(value.acp.agents) || value.acp.agents.length > 256 ||
    !value.acp.agents.every((row) => record(row) && keys(row, ["id", "name", "argumentCount", "environmentKeyCount", "contextWindow"]) &&
      text(row.id, 128) && /^[a-z0-9][a-z0-9._-]*$/.test(row.id) && text(row.name, 160) && count(row.argumentCount) && count(row.environmentKeyCount) &&
      (row.contextWindow === undefined || Number.isSafeInteger(row.contextWindow) && Number(row.contextWindow) >= 1024 && Number(row.contextWindow) <= 10_000_000))) return invalid();
  if (new Set(value.providers.map((row) => row.id)).size !== value.providers.length || new Set(value.acp.agents.map((row) => row.id)).size !== value.acp.agents.length) return invalid();
  return value as ProviderCenterReport;
}

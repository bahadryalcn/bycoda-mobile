export type PreviewScope = { machineId: string; environmentId: string; projectId: string; deviceId: string };
export type PreviewIntent = { requestId: string; deviceId: string; url: string; installExpoGo: boolean; expectedText?: string };
export type DevicePreview = { id: string; requestId: string; deviceId: string; state: "queued" | "running" | "ready" | "blocked";
  verification: "launch-only" | "expected-text"; updatedAt: string; deviceName?: string; stages: { name: string; state: "running" | "done" | "blocked"; code?: string; message?: string }[];
  frame?: { mime: "image/png" | "image/jpeg"; base64: string; capturedAt: string } };
export type PreviewImpact = { activeCount: number; owned: { id: string; deviceId: string; state: "queued" | "running" }[]; otherActiveCount: number };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every((key) => names.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\0-\x08\x0b\x0c\x0e-\x1f]/.test(value);
export function readPreviewIntent(value: unknown): PreviewIntent {
  if (!record(value) || !keys(value, ["requestId", "deviceId", "url", "installExpoGo", "expectedText"]) || !text(value.requestId, 128) || !text(value.deviceId, 512) || !text(value.url, 2048) ||
    typeof value.installExpoGo !== "boolean" || value.expectedText !== undefined && !text(value.expectedText, 4096)) throw new Error("Invalid device preview intent");
  const url = new URL(value.url);
  if (!["exp:", "exps:", "http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error("Use a development server URL without credentials, query parameters or fragments.");
  return value as PreviewIntent;
}
export function readDevicePreview(value: unknown, intent: PreviewIntent, withFrame = false): DevicePreview {
  const invalid = () => { throw new Error("Invalid device preview status"); };
  if (!record(value) || !keys(value, ["id", "requestId", "deviceId", "state", "verification", "updatedAt", "deviceName", "stages", "frame"]) || !text(value.id, 128) || value.requestId !== intent.requestId ||
    !text(value.deviceId, 512) || !["queued", "running", "ready", "blocked"].includes(String(value.state)) || value.verification !== (intent.expectedText ? "expected-text" : "launch-only") ||
    !text(value.updatedAt, 64) || value.deviceName !== undefined && !text(value.deviceName, 512) || !Array.isArray(value.stages) || value.stages.length > 16 || !value.stages.every((row) => record(row) && keys(row, ["name", "state", "code", "message"]) &&
      text(row.name, 128) && ["running", "done", "blocked"].includes(String(row.state)) && (row.code === undefined || text(row.code, 128)) && (row.message === undefined || text(row.message, 1000)))) return invalid();
  // Boot may replace an Android AVD's ID with its running serial. The immutable
  // request ID binds that transition to the exact original device intent.
  if (value.frame !== undefined) {
    const frame = value.frame;
    if (!withFrame || !record(frame) || !keys(frame, ["mime", "base64", "capturedAt"]) || !["image/png", "image/jpeg"].includes(String(frame.mime)) || !text(frame.capturedAt, 64) ||
      !text(frame.base64, Math.ceil(4 * 1024 * 1024 / 3) * 4) || frame.base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(frame.base64)) return invalid();
    const size = frame.base64.length / 4 * 3 - (frame.base64.endsWith("==") ? 2 : frame.base64.endsWith("=") ? 1 : 0);
    if (size > 4 * 1024 * 1024) return invalid();
  }
  return value as DevicePreview;
}
export function readPreviewImpact(value: unknown): PreviewImpact {
  if (!record(value) || !keys(value, ["activeCount", "owned", "otherActiveCount"]) || !Number.isSafeInteger(value.activeCount) || Number(value.activeCount) < 0 || Number(value.activeCount) > 128 ||
    !Number.isSafeInteger(value.otherActiveCount) || Number(value.otherActiveCount) < 0 || !Array.isArray(value.owned) || value.owned.length > 128 || !value.owned.every((row) => record(row) && keys(row, ["id", "deviceId", "state"]) &&
      text(row.id, 128) && text(row.deviceId, 512) && ["queued", "running"].includes(String(row.state))) || new Set(value.owned.map((row) => row.id)).size !== value.owned.length || value.activeCount !== Number(value.otherActiveCount) + value.owned.length)
    throw new Error("Invalid device preview impact");
  return value as PreviewImpact;
}

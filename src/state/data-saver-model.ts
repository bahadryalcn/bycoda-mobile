export const DATA_SAVER_MODES = ["auto", "on", "off"] as const;
export type DataSaverMode = (typeof DATA_SAVER_MODES)[number];
export const DEFAULT_DATA_SAVER_MODE: DataSaverMode = "auto";
/** JPEG quality the Host browser frames use while data saver is active (Host range 20..80). */
export const DATA_SAVER_FRAME_QUALITY = 35;

export type NetworkSnapshot = {
  type?: string | null;
  details?: { isConnectionExpensive?: boolean | null } | null;
};

export function normalizeDataSaverMode(value: unknown): DataSaverMode {
  return DATA_SAVER_MODES.includes(value as DataSaverMode) ? (value as DataSaverMode) : DEFAULT_DATA_SAVER_MODE;
}

export function decodeDataSaverMode(raw: string | null): DataSaverMode {
  if (!raw) return DEFAULT_DATA_SAVER_MODE;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? normalizeDataSaverMode((value as { dataSaver?: unknown }).dataSaver)
      : DEFAULT_DATA_SAVER_MODE;
  } catch {
    return DEFAULT_DATA_SAVER_MODE;
  }
}

export function encodeDataSaverMode(dataSaver: DataSaverMode): string {
  return JSON.stringify({ version: 1, dataSaver: normalizeDataSaverMode(dataSaver) });
}

/** "on" always saves; "auto" saves on cellular or any connection the OS marks as metered. */
export function isDataSaverActive(mode: DataSaverMode, network: NetworkSnapshot | undefined): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return network?.type === "cellular" || network?.details?.isConnectionExpensive === true;
}

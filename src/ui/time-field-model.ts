export type TimeFieldProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
};

export function parseWallTime(value: string): { hour: number; minute: number } | undefined {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour!, minute: minute! };
}

/** UTC carries wall-clock fields; this does not convert the host timezone. */
export function wallTimePickerDate(value: string): Date {
  const { hour, minute } = parseWallTime(value) ?? { hour: 9, minute: 0 };
  return new Date(Date.UTC(2000, 0, 1, hour, minute));
}

export function selectedWallTime(eventType: string, date?: Date): string | undefined {
  if (eventType !== "set" || !date || !Number.isFinite(date.getTime())) return undefined;
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

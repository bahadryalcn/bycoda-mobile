export type ScheduledTimeProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
};

export function nextPublishTime() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

export function parseLocalPublishTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const result = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(result.getTime())) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  if (result.getHours() !== hour || result.getMinutes() !== minute) return null;
  return result;
}

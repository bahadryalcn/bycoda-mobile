import type { HostSessionSummary } from "./wire";

export type SnoozePreset = "hour" | "evening" | "tomorrow" | "week";

/** Calendar presets use phone-local dates, including DST transitions. */
export function sessionSnoozeTime(preset: SnoozePreset, now = Date.now()): number {
  if (preset === "hour") return now + 60 * 60 * 1000;
  const date = new Date(now);
  if (preset === "evening") {
    date.setHours(18, 0, 0, 0);
    if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  } else {
    date.setDate(date.getDate() + (preset === "tomorrow" ? 1 : 7));
    date.setHours(9, 0, 0, 0);
  }
  return date.getTime();
}

export function sessionIsSnoozed(session: Pick<HostSessionSummary, "snoozedUntil">, now = Date.now()) {
  return typeof session.snoozedUntil === "number" && session.snoozedUntil > now;
}

/** Field presence gates additive actions on older Hosts. */
export function sessionAttentionActions(session: Pick<HostSessionSummary, "unread" | "snoozedUntil">) {
  return { unread: typeof session.unread === "boolean", snooze: session.snoozedUntil !== undefined };
}

export function sessionSharePayload(title: string, link: string) {
  return { title, message: `${title}\n${link}` };
}

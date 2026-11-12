import { notificationEvent, type NotificationChannel, type NotificationEventKey, type NotificationSettings, type QuietHours } from "../contracts";

export function channelEnabled(settings: NotificationSettings, event: NotificationEventKey, channel: NotificationChannel): boolean {
  const found = settings.preferences.find((entry) => entry.scope === "user" && entry.event === event && entry.channel === channel);
  return found ? found.enabled : notificationEvent(event).defaultChannels.includes(channel);
}

/** Returns settings with one toggle changed; a mandatory event can never be turned off. */
export function setChannel(settings: NotificationSettings, event: NotificationEventKey, channel: NotificationChannel, enabled: boolean): NotificationSettings {
  const value = enabled || notificationEvent(event).mandatory;
  const rest = settings.preferences.filter((entry) => !(entry.scope === "user" && entry.event === event && entry.channel === channel));
  return { ...settings, preferences: [...rest, { scope: "user", event, channel, enabled: value }] };
}

export function withQuietHours(settings: NotificationSettings, quietHours: QuietHours | null): NotificationSettings {
  return { ...settings, quietHours };
}

/**
 * Settings sub-pages are pushed routes, so each one has a deep link (`bycoda://settings/<page>`)
 * that copy and notifications can point to. The root index is the Settings tab (`/settings`).
 */
export const settingsRoutes = {
  root: "/settings",
  account: "/account",
  computers: "/machines",
  general: "/settings/general",
  appearance: "/settings/appearance",
  chat: "/settings/chat",
  voice: "/settings/voice",
  /** Voice and microphone → Dictation options: custom words, fillers, silence filter and cleanup. */
  dictation: "/settings/dictation",
  assistant: "/settings/assistant",
  notifications: "/settings/notifications",
  security: "/settings/security",
  permissions: "/settings/permissions",
  privacy: "/settings/privacy",
  help: "/settings/help",
  feedback: "/feedback",
  about: "/settings/about",
} as const;

export type SettingsRoute = (typeof settingsRoutes)[keyof typeof settingsRoutes];

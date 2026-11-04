export const CHAT_TEXT_SIZES = ["compact", "standard", "large"] as const;
export type ChatTextSize = (typeof CHAT_TEXT_SIZES)[number];
export const DEFAULT_CHAT_TEXT_SIZE: ChatTextSize = "standard";

export class ChatAppearanceStorageError extends Error {
  constructor(readonly operation: "read" | "save") {
    super(operation === "read" ? "Chat appearance could not be loaded." : "Chat appearance could not be saved.");
    this.name = "ChatAppearanceStorageError";
  }
}

export function normalizeChatTextSize(value: unknown): ChatTextSize {
  if (typeof value !== "string") return DEFAULT_CHAT_TEXT_SIZE;
  switch (value.trim().toLowerCase()) {
    case "compact":
    case "small":
      return "compact";
    case "standard":
    case "default":
    case "normal":
      return "standard";
    case "large":
      return "large";
    default:
      return DEFAULT_CHAT_TEXT_SIZE;
  }
}

export function decodeChatTextSize(raw: string | null): ChatTextSize {
  if (!raw) return DEFAULT_CHAT_TEXT_SIZE;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "string") return normalizeChatTextSize(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return normalizeChatTextSize((value as { textSize?: unknown }).textSize);
    }
    return DEFAULT_CHAT_TEXT_SIZE;
  } catch {
    return normalizeChatTextSize(raw);
  }
}

export function encodeChatTextSize(textSize: ChatTextSize): string {
  return JSON.stringify({ version: 1, textSize: normalizeChatTextSize(textSize) });
}

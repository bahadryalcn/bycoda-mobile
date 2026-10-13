export const CHAT_TEXT_SIZES = ["compact", "standard", "large"] as const;
export type ChatTextSize = (typeof CHAT_TEXT_SIZES)[number];

export function normalizeChatTextSize(value: unknown): ChatTextSize {
  if (typeof value !== "string") return "compact";
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
      return "compact";
  }
}

export function decodeChatTextSize(raw: string | null): ChatTextSize {
  if (!raw) return "compact";
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "string") return normalizeChatTextSize(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return normalizeChatTextSize((value as { textSize?: unknown }).textSize);
    }
    return "compact";
  } catch {
    return normalizeChatTextSize(raw);
  }
}

export function encodeChatTextSize(textSize: ChatTextSize): string {
  return JSON.stringify({ version: 1, textSize: normalizeChatTextSize(textSize) });
}

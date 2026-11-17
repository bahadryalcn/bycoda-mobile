/** Chat display preferences: pure vocabulary, bounds, defaults and (de)serialization. */
export const TOOL_VISIBILITIES = ["all", "hide-successful", "hide-all", "zen"] as const;
export type ToolVisibility = (typeof TOOL_VISIBILITIES)[number];
export const CODE_SIZES = ["small", "standard", "large"] as const;
export type CodeSize = (typeof CODE_SIZES)[number];

export type ChatDisplay = {
  toolVisibility: ToolVisibility;
  codeSize: CodeSize;
  terminalSize: CodeSize;
  /** Off keeps code lines whole and scrolls sideways. */
  codeWrap: boolean;
};
export const DEFAULT_CHAT_DISPLAY: ChatDisplay = {
  toolVisibility: "all",
  codeSize: "standard",
  terminalSize: "standard",
  codeWrap: false,
};

export const CODE_SIZE_SCALE: Record<CodeSize, number> = { small: 0.9, standard: 1, large: 1.2 };
export const TERMINAL_FONT_SIZE: Record<CodeSize, number> = { small: 12, standard: 14, large: 17 };

export function normalizeChatDisplay(value: unknown): ChatDisplay {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<Record<keyof ChatDisplay, unknown>>) : {};
  const pick = <T extends string>(list: readonly T[], raw: unknown, fallback: T): T =>
    list.includes(raw as T) ? (raw as T) : fallback;
  return {
    toolVisibility: pick(TOOL_VISIBILITIES, stored.toolVisibility, DEFAULT_CHAT_DISPLAY.toolVisibility),
    codeSize: pick(CODE_SIZES, stored.codeSize, DEFAULT_CHAT_DISPLAY.codeSize),
    terminalSize: pick(CODE_SIZES, stored.terminalSize, DEFAULT_CHAT_DISPLAY.terminalSize),
    codeWrap: stored.codeWrap === true,
  };
}

export function decodeChatDisplay(raw: string | null): ChatDisplay {
  if (!raw) return DEFAULT_CHAT_DISPLAY;
  try {
    return normalizeChatDisplay(JSON.parse(raw));
  } catch {
    return DEFAULT_CHAT_DISPLAY;
  }
}

export const encodeChatDisplay = (value: ChatDisplay) =>
  JSON.stringify({ version: 1, ...normalizeChatDisplay(value) });

import { TERMINAL_FONT_SIZE, type CodeSize } from "./chat-display-model";

/**
 * The terminal document hard-codes xterm's font size; the owner's size is applied to the first
 * option declaration. // shortcut: string patch of the generated document, upgrade to a
 * `configure` packet field once terminal-document.ts accepts fontSize.
 */
export function withTerminalFontSize(html: string, size: CodeSize): string {
  return html.replace("fontSize:14,", `fontSize:${TERMINAL_FONT_SIZE[size]},`);
}

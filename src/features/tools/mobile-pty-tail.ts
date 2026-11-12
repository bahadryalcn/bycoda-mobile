import { base64ToBytes } from "../workspace/attachment-model";

const MAX_CHARS = 64_000;
// CSI sequences, OSC strings (BEL or ST terminated) and two-byte escapes.
const ANSI = /\u001b(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\u005c)?|[@-Z\u005c-_])/g;

/** The most recent terminal output as plain text, for sharing with the composer. */
export function createPtyTail() {
  const decoder = new TextDecoder("utf-8");
  let text = "";
  return {
    /** Appends one acknowledged output chunk (base64 bytes); invalid bytes become U+FFFD. */
    push(dataBase64: string) {
      text += decoder.decode(base64ToBytes(dataBase64), { stream: true });
      if (text.length > MAX_CHARS) text = text.slice(-MAX_CHARS);
    },
    clear() { text = ""; },
    /** Last `count` non-trailing-blank lines with escapes and carriage-return redraws resolved. */
    lines(count: number) {
      const lines = text.replace(ANSI, "").split("\n").map(line => line.replace(/\r+$/, "").split("\r").pop()!.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trimEnd());
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      return lines.slice(-count).join("\n");
    },
  };
}

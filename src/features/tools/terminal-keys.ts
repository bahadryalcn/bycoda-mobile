/**
 * Terminal keyboard input: the keys a phone keyboard lacks, the sticky Ctrl/Alt modifiers and
 * UTF-8/base64 framing for the terminal document. Pure; no React Native imports.
 */

/** Bytes for the key bar, the same a desktop (xterm) terminal sends. */
export const TERMINAL_KEY_SEQUENCES = {
  up: "\u001b[A",
  down: "\u001b[B",
  right: "\u001b[C",
  left: "\u001b[D",
  escape: "\u001b",
  tab: "\t",
  enter: "\r",
  /** Ctrl-L: bash, zsh, fish and PowerShell (PSReadLine) clear the screen and redraw the prompt. */
  clear: "\u000c",
  tilde: "~",
  pipe: "|",
  slash: "/",
  dash: "-",
} as const;
export type TerminalBarKey = keyof typeof TERMINAL_KEY_SEQUENCES;

/** Sticky one-shot modifiers armed from the key bar; the next key or typed character takes them. */
export type TerminalModifiers = { ctrl: boolean; alt: boolean };
export type TerminalModifier = keyof TerminalModifiers;
export const NO_TERMINAL_MODIFIERS: TerminalModifiers = Object.freeze({ ctrl: false, alt: false });

/** Ctrl + one character as its C0 control character, or undefined when it has none. */
export function terminalControlChar(char: string): string | undefined {
  if (char === " ") return "\u0000";
  if (char === "?") return "\u007f";
  if (char === "/") return "\u001f";
  if (char.length !== 1) return undefined;
  const code = char.charCodeAt(0);
  // @ A–Z [ \ ] ^ _ and ` a–z { | } ~  →  NUL … US, as a VT100 masks them.
  return code >= 64 && code <= 126 ? String.fromCharCode(code & 31) : undefined;
}

const CURSOR_KEY = /^\u001b(?:\[|O)([A-DHF])$/;

/**
 * Applies armed modifiers to one key or typed input. Cursor keys become xterm modified sequences
 * (`ESC [1;5A` for Ctrl-Up, `ESC [1;3A` for Alt-Up, `ESC [1;7A` for both). Otherwise Ctrl turns the
 * first character into its control character (the keyboard may commit a whole word at once; the
 * rest stays text) and Alt prefixes ESC, as a terminal with meta-sends-escape does. Other escape
 * sequences pass unchanged.
 */
export function withTerminalModifiers(data: string, { ctrl, alt }: TerminalModifiers): string {
  if (!data || (!ctrl && !alt)) return data;
  const cursor = CURSOR_KEY.exec(data);
  if (cursor) return `\u001b[1;${1 + (alt ? 2 : 0) + (ctrl ? 4 : 0)}${cursor[1]}`;
  if (data.startsWith("\u001b") && data !== "\u001b") return data;
  const [first, ...rest] = Array.from(data);
  const head = (ctrl ? terminalControlChar(first!) : undefined) ?? first!;
  return (alt ? "\u001b" : "") + head + rest.join("");
}

/** Sticky Ctrl only: the first typed character becomes its control character. */
export function withTerminalControl(data: string): string {
  return withTerminalModifiers(data, { ctrl: true, alt: false });
}

/** Bytes for a key-bar key under the armed modifiers. CLEAR is a command and always sends plain Ctrl-L. */
export function terminalKeyInput(key: TerminalBarKey, modifiers: TerminalModifiers = NO_TERMINAL_MODIFIERS): string {
  const data = TERMINAL_KEY_SEQUENCES[key];
  return key === "clear" ? data : withTerminalModifiers(data, modifiers);
}

/** UTF-8 bytes of `text`; lone surrogates become U+FFFD. Independent of engine TextEncoder support. */
export function terminalUtf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(bytes);
}

export function terminalBase64Utf8(text: string): string {
  const bytes = terminalUtf8Encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

function sequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

/**
 * Decodes base64 UTF-8 chunks from the terminal document. A character split across two chunks is
 * carried to the next one; invalid bytes become U+FFFD.
 */
export function createTerminalUtf8Reader() {
  let carry: number[] = [];
  return (base64: string): string => {
    const binary = atob(base64);
    const bytes = carry.concat(Array.from(binary, (char) => char.charCodeAt(0) & 255));
    carry = [];
    // Keep an incomplete trailing sequence for the next chunk.
    for (let back = 1; back <= Math.min(3, bytes.length); back++) {
      const lead = bytes[bytes.length - back]!;
      if ((lead & 0xc0) === 0x80) continue;
      const length = sequenceLength(lead);
      if (length > back) carry = bytes.splice(bytes.length - back);
      break;
    }
    let text = "";
    for (let index = 0; index < bytes.length;) {
      const lead = bytes[index]!;
      const length = sequenceLength(lead);
      if (!length || index + length > bytes.length) { text += "�"; index++; continue; }
      let code = length === 1 ? lead : lead & (0xff >> (length + 1));
      let valid = true;
      for (let offset = 1; offset < length; offset++) {
        const next = bytes[index + offset]!;
        if ((next & 0xc0) !== 0x80) { valid = false; break; }
        code = (code << 6) | (next & 63);
      }
      if (!valid || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) { text += "�"; index++; continue; }
      text += String.fromCodePoint(code);
      index += length;
    }
    return text;
  };
}

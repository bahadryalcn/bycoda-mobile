import { describe, expect, it } from "vitest";
import {
  createTerminalUtf8Reader, NO_TERMINAL_MODIFIERS, TERMINAL_KEY_SEQUENCES, terminalBase64Utf8, terminalControlChar,
  terminalKeyInput, terminalUtf8Encode, withTerminalControl, withTerminalModifiers,
} from "./terminal-keys";

const CTRL = { ctrl: true, alt: false };
const ALT = { ctrl: false, alt: true };
const BOTH = { ctrl: true, alt: true };

describe("terminal key bar", () => {
  it("sends xterm bytes for arrows, Esc, Tab, Enter, Clear and the shell symbols", () => {
    expect(TERMINAL_KEY_SEQUENCES).toEqual({
      up: "\u001b[A", down: "\u001b[B", right: "\u001b[C", left: "\u001b[D", escape: "\u001b", tab: "\t", enter: "\r",
      clear: "\u000c", tilde: "~", pipe: "|", slash: "/", dash: "-",
    });
    for (const key of Object.keys(TERMINAL_KEY_SEQUENCES) as (keyof typeof TERMINAL_KEY_SEQUENCES)[])
      expect(terminalKeyInput(key)).toBe(TERMINAL_KEY_SEQUENCES[key]);
  });
  it("maps Ctrl + letter and symbols to C0 control characters", () => {
    expect(terminalControlChar("c")).toBe("\u0003");
    expect(terminalControlChar("C")).toBe("\u0003");
    expect(terminalControlChar("d")).toBe("\u0004");
    expect(terminalControlChar("l")).toBe("\u000c");
    expect(terminalControlChar("[")).toBe("\u001b");
    expect(terminalControlChar("@")).toBe("\u0000");
    expect(terminalControlChar(" ")).toBe("\u0000");
    expect(terminalControlChar("?")).toBe("\u007f");
    expect(terminalControlChar("/")).toBe("\u001f");
    expect(terminalControlChar("|")).toBe("\u001c");
    expect(terminalControlChar("~")).toBe("\u001e");
    expect(terminalControlChar("1")).toBeUndefined();
    expect(terminalControlChar("-")).toBeUndefined();
    expect(terminalControlChar("ş")).toBeUndefined();
  });
  it("applies a sticky Ctrl to the first typed character only", () => {
    expect(withTerminalControl("c")).toBe("\u0003");
    expect(withTerminalControl("cat")).toBe("\u0003at");
    expect(withTerminalControl("ğ")).toBe("ğ");
    expect(withTerminalControl("")).toBe("");
    expect(withTerminalModifiers("cat", NO_TERMINAL_MODIFIERS)).toBe("cat");
  });
  it("prefixes ESC for Alt and combines it with Ctrl", () => {
    expect(withTerminalModifiers("b", ALT)).toBe("\u001bb");
    expect(withTerminalModifiers("ğx", ALT)).toBe("\u001bğx");
    expect(withTerminalModifiers("c", BOTH)).toBe("\u001b\u0003");
    expect(withTerminalModifiers("\r", ALT)).toBe("\u001b\r");
  });
  it("sends xterm modified cursor sequences for arrows, also from application cursor mode", () => {
    expect(terminalKeyInput("up", CTRL)).toBe("\u001b[1;5A");
    expect(terminalKeyInput("down", ALT)).toBe("\u001b[1;3B");
    expect(terminalKeyInput("right", BOTH)).toBe("\u001b[1;7C");
    expect(terminalKeyInput("left", CTRL)).toBe("\u001b[1;5D");
    expect(withTerminalModifiers("\u001bOA", CTRL)).toBe("\u001b[1;5A");
    expect(withTerminalModifiers("\u001b[H", ALT)).toBe("\u001b[1;3H");
    // Other escape sequences are not keys a modifier applies to.
    expect(withTerminalModifiers("\u001b[200~", BOTH)).toBe("\u001b[200~");
  });
  it("applies modifiers to Tab, Esc and the symbol keys; Clear always sends plain Ctrl-L", () => {
    expect(terminalKeyInput("tab", CTRL)).toBe("\t");
    expect(terminalKeyInput("tab", ALT)).toBe("\u001b\t");
    expect(terminalKeyInput("escape", ALT)).toBe("\u001b\u001b");
    expect(terminalKeyInput("escape", CTRL)).toBe("\u001b");
    expect(terminalKeyInput("slash", CTRL)).toBe("\u001f");
    expect(terminalKeyInput("pipe", ALT)).toBe("\u001b|");
    expect(terminalKeyInput("dash", CTRL)).toBe("-");
    expect(terminalKeyInput("clear", BOTH)).toBe("\u000c");
  });
});

describe("UTF-8 framing", () => {
  it("encodes text the way TextEncoder does", () => {
    for (const text of ["", "ascii", "ğüşıöç", "日本語", "😀 a"]) expect(Array.from(terminalUtf8Encode(text))).toEqual(Array.from(new TextEncoder().encode(text)));
    expect(terminalBase64Utf8("şı")).toBe(Buffer.from("şı", "utf8").toString("base64"));
  });
  it("decodes chunks and carries a character split between them", () => {
    const read = createTerminalUtf8Reader();
    const bytes = Buffer.from("aş😀b", "utf8");
    expect(read(bytes.subarray(0, 2).toString("base64"))).toBe("a");
    expect(read(bytes.subarray(2, 5).toString("base64"))).toBe("ş");
    expect(read(bytes.subarray(5).toString("base64"))).toBe("😀b");
    expect(createTerminalUtf8Reader()(Buffer.from([0xff, 0x41]).toString("base64"))).toBe("�A");
  });
});

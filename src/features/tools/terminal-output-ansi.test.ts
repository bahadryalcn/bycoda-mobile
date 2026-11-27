import { describe, expect, it } from "vitest";
import { plainAnsiRun, terminalAnsiRuns, terminalAnsiTextStyle } from "./terminal-output-ansi";

const ESC = "\u001b";
const palette = Array.from({ length: 16 }, (_, index) => `#0000${index.toString(16).padStart(2, "0")}`);

describe("terminalAnsiRuns", () => {
  it("keeps base colours as theme palette indexes and merges equal styles", () => {
    expect(terminalAnsiRuns(`a${ESC}[31mred${ESC}[1;94mbold${ESC}[0m plain${ESC}[m!`)).toEqual([
      { text: "a" },
      { text: "red", foreground: 1 },
      { text: "bold", foreground: 12, bold: true },
      { text: " plain!" },
    ]);
  });
  it("reads 256-colour and truecolor foregrounds and backgrounds", () => {
    expect(terminalAnsiRuns(`${ESC}[38;5;3mx${ESC}[38;5;196;48;2;1;2;3my${ESC}[38;5;244mz`)).toEqual([
      { text: "x", foreground: 3 },
      { text: "y", foreground: "rgb(255,0,0)", background: "rgb(1,2,3)" },
      { text: "z", foreground: "rgb(128,128,128)", background: "rgb(1,2,3)" },
    ]);
  });
  it("tracks text attributes and their individual resets", () => {
    const runs = terminalAnsiRuns(`${ESC}[2;3;4;7;9ma${ESC}[22;23mb${ESC}[24;27;29mc`);
    expect(runs).toEqual([
      { text: "a", dim: true, italic: true, underline: true, inverse: true, strike: true },
      { text: "b", underline: true, inverse: true, strike: true },
      { text: "c" },
    ]);
    expect(plainAnsiRun(runs[2])).toBe(true);
  });
  it("drops other control sequences and OSC strings without changing style", () => {
    expect(terminalAnsiRuns(`${ESC}]0;title\u0007${ESC}[32mok${ESC}[2K${ESC}[?25l done\r\n`)).toEqual([
      { text: "ok done\n", foreground: 2 },
    ]);
    // Malformed parameters are ignored as a whole.
    expect(terminalAnsiRuns(`${ESC}[3:1mtext`)).toEqual([{ text: "text" }]);
    expect(terminalAnsiRuns(`${ESC}[38;2;300;0;0mtext`)).toEqual([{ text: "text" }]);
  });
});

describe("terminalAnsiTextStyle", () => {
  it("resolves palette colours, inverse and dim against the reader's ink and surface", () => {
    expect(terminalAnsiTextStyle({ foreground: 1, bold: true, underline: true, strike: true }, palette, "#ffffff", "#000000"))
      .toEqual({ color: "#000001", fontWeight: "700", textDecorationLine: "underline line-through" });
    expect(terminalAnsiTextStyle({ inverse: true }, palette, "#ffffff", "#000000"))
      .toEqual({ color: "#000000", backgroundColor: "#ffffff" });
    expect(terminalAnsiTextStyle({ dim: true, italic: true }, palette, "#102030", "#000000"))
      .toEqual({ color: "rgba(16,32,48,0.6)", fontStyle: "italic" });
    expect(terminalAnsiTextStyle({ dim: true, foreground: "rgb(1,2,3)" }, palette, "#fff", "#000"))
      .toEqual({ color: "rgba(1,2,3,0.6)" });
  });
});

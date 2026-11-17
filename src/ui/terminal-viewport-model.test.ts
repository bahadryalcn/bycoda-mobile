import { describe, expect, it } from "vitest";
import { withTerminalFontSize } from "./terminal-viewport-model";
import { terminalDocument } from "./terminal-document";

describe("terminal font size", () => {
  it("rewrites the xterm option once", () => {
    const html = withTerminalFontSize(terminalDocument("n"), "large");
    expect(html).toContain("fontSize:17,");
    expect(html).not.toContain("fontSize:14,");
  });
  it("keeps the standard size unchanged", () => {
    expect(withTerminalFontSize("a fontSize:14,b", "standard")).toBe("a fontSize:14,b");
  });
});

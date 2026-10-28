import { expect, it } from "vitest";
import { readTerminalPacket, terminalDocument } from "./terminal-document";
it("has a trusted offline renderer without remote resources or HTML output interpolation", () => {
  const html = terminalDocument("document-nonce");
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("term.write(bytes");
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).toContain("disableStdin:true");
  expect(html).toContain("allowProposedApi:false");
  expect(html).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
});
it("rejects foreign documents, arbitrary bridge actions, invalid resize and oversized input", () => {
  expect(
    readTerminalPacket(JSON.stringify({ type: "input", nonce: "n", dataBase64: "Aw==" }), "n")
      ?.type,
  ).toBe("input");
  for (const packet of [
    { type: "input", nonce: "other", dataBase64: "Aw==" },
    { type: "invoke", nonce: "n" },
    { type: "resize", nonce: "n", cols: 900, rows: 2 },
    { type: "input", nonce: "n", dataBase64: "A".repeat(6000) },
  ])
    expect(readTerminalPacket(JSON.stringify(packet), "n")).toBeNull();
});

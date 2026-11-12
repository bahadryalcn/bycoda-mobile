import { expect, it } from "vitest";
import { createPtyTail } from "./mobile-pty-tail";
const b64 = (text: string) => { let raw = ""; for (const byte of new TextEncoder().encode(text)) raw += String.fromCharCode(byte); return btoa(raw); };
it("returns the last lines with colour codes, redraws and trailing blanks removed", () => {
  const tail = createPtyTail();
  tail.push(b64("one\r\ntwo\r\n\u001b[31mred\u001b[0m\r\nprogress 10%\rprogress 100%\r\n\r\n"));
  expect(tail.lines(3)).toBe("two\nred\nprogress 100%");
  expect(tail.lines(99)).toBe("one\ntwo\nred\nprogress 100%");
});
it("decodes multi-byte characters split across chunks and bounds memory", () => {
  const tail = createPtyTail(), bytes = new TextEncoder().encode("é");
  tail.push(btoa(String.fromCharCode(bytes[0]!))); tail.push(btoa(String.fromCharCode(bytes[1]!))); expect(tail.lines(1)).toBe("é");
  tail.push(b64("x".repeat(200_000))); expect(tail.lines(1).length).toBeLessThanOrEqual(64_000);
  tail.clear(); expect(tail.lines(5)).toBe("");
});

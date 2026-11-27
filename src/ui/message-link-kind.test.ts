import { expect, it } from "vitest";
import { linkIconKind } from "./message-link-kind";

it("names what an inline link opens", () => {
  expect(linkIconKind("https://example.com/docs")).toBe("web");
  expect(linkIconKind("<https://example.com>")).toBe("web");
  expect(linkIconKind("http://localhost:5173/")).toBe("local");
  expect(linkIconKind("http://127.0.0.1:3000")).toBe("local");
  expect(linkIconKind("bycoda://session/v1/abc")).toBe("session");
  expect(linkIconKind("https://link.bycoda.codes/session/v1/abc")).toBe("session");
});

it("leaves file references and unopenable targets to their own rendering", () => {
  expect(linkIconKind("src/app.ts:12")).toBeNull();
  expect(linkIconKind("/Users/me/project/README.md")).toBeNull();
  expect(linkIconKind("#section")).toBeNull();
  expect(linkIconKind("mailto:someone@example.com")).toBeNull();
  expect(linkIconKind("")).toBeNull();
});

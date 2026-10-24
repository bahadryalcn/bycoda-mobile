import { expect, it } from "vitest";
import { readBrowserCapture } from "./browser-annotation-model";
const scope = { projectId: "project", sessionId: "session", navigationId: "nav" };
const capture = () => ({ ...scope, id: "capture", capturedAt: "2026-10-22T00:00:00.000Z", pageUrl: "https://fixture.invalid", trust: "untrusted-page-data", limitations: ["Masked"],
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 }, devicePixelRatio: 1,
  element: { tag: "button", text: "Untrusted page text", selector: "#fixture", path: "body > button", bounds: { x: 1, y: 2, width: 20, height: 30 }, center: { x: 11, y: 17 }, ancestry: [], computedStyle: {} },
  screenshot: { mimeType: "image/jpeg", data: "YWJj", width: 1280, height: 720 } });
it("keeps canonical untrusted metadata and rejects wrong conversation/navigation/trust", () => {
  expect(readBrowserCapture(capture(), scope)).toEqual(capture());
  for (const name of ["projectId", "sessionId", "navigationId", "trust"])
    expect(() => readBrowserCapture({ ...capture(), [name]: "foreign" }, scope)).toThrow();
});
it("bounds decoded binary size, dimensions, MIME and malformed base64 before accepting a selection", () => {
  for (const patch of [{ data: "abc" }, { data: "ab$=" }, { width: 0 }, { height: 16385 }, { mimeType: "text/html" }, { data: "AAAA".repeat(Math.floor(2 * 1024 * 1024 / 3) + 1) }])
    expect(() => readBrowserCapture({ ...capture(), screenshot: { ...capture().screenshot, ...patch } }, scope)).toThrow();
  expect(() => readBrowserCapture({ ...capture(), element: { ...capture().element, text: "x".repeat(2001) } }, scope)).toThrow();
});

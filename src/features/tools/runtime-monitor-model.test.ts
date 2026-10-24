import { expect, it } from "vitest";
import { monitorUrl, readMonitors, uncertainMonitorWrite } from "./runtime-monitor-model";
it("matches host port and credential-free HTTP URL contracts", () => {
  expect(monitorUrl("3000")).toBe("http://localhost:3000/");
  expect(monitorUrl(" https://example.com ")).toBe("https://example.com/");
  for (const value of ["0", "65536", "file:///tmp/a", "https://user:password@host", "", "a".repeat(2049)]) expect(() => monitorUrl(value)).toThrow();
});
it("never displays or targets monitors from another project", () => {
  const row = { id: "one", projectId: "a", url: "http://localhost:3000/" };
  expect(readMonitors([row], "a")).toEqual([row]);
  expect(() => readMonitors([row], "b")).toThrow();
  expect(() => readMonitors([row, row], "a")).toThrow();
  expect(() => readMonitors(Array(9).fill(row), "a")).toThrow();
});
it("detects unknown delivery without treating ordinary errors as success", () => {
  expect(uncertainMonitorWrite({ uncertain: true })).toBe(true);
  expect(uncertainMonitorWrite(new Error("failed"))).toBe(false);
});

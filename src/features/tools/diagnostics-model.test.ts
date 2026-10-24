import { expect, it } from "vitest";
import { memoryLabel, readDiagnostics } from "./diagnostics-model";
const sample = { at: 1_800_000_000_000, host: { totalMemoryBytes: 1000, freeMemoryBytes: 100, logicalCpus: 8, loadAverage: null }, process: { pid: 20, rssBytes: 500, heapUsedBytes: 200, externalBytes: 50, cpuPercent: null, uptimeSeconds: 60 } };
const snapshot = () => ({ scope: "host-os-and-node-process", sampling: "on-demand", childProcessesIncluded: false, samples: [structuredClone(sample)] });
it("keeps on-demand Node-only semantics and nullable first CPU sample", () => {
  const result = readDiagnostics({ ...snapshot(), performance: { arbitrary: "not rendered" } });
  expect(result.samples[0].process.cpuPercent).toBeNull();
  expect(result).not.toHaveProperty("performance");
  expect(memoryLabel(1024 * 1024)).toBe("1.0 MB");
});
it("rejects unknown scope, unbounded samples and invalid metrics", () => {
  expect(() => readDiagnostics({ ...snapshot(), childProcessesIncluded: true })).toThrow();
  expect(() => readDiagnostics({ ...snapshot(), samples: Array(61).fill(sample) })).toThrow();
  const data = snapshot(); data.samples[0].process.rssBytes = NaN;
  expect(() => readDiagnostics(data)).toThrow();
});

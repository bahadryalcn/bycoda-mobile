export type ResourceSample = {
  at: number;
  host: { totalMemoryBytes: number; freeMemoryBytes: number; logicalCpus: number; loadAverage: number[] | null };
  process: { pid: number; rssBytes: number; heapUsedBytes: number; externalBytes: number; cpuPercent: number | null; uptimeSeconds: number };
};
export type ResourceDiagnostics = {
  scope: "host-os-and-node-process";
  sampling: "on-demand";
  childProcessesIncluded: false;
  samples: ResourceSample[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diagnostics response.");
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid diagnostics sample.");
  return value;
};
/** Consume only the fixed host fields; never render arbitrary performance payloads. */
export function readDiagnostics(value: unknown): ResourceDiagnostics {
  const data = object(value);
  if (data.scope !== "host-os-and-node-process" || data.sampling !== "on-demand" || data.childProcessesIncluded !== false ||
    !Array.isArray(data.samples) || data.samples.length > 60) throw new Error("Unsupported diagnostics response.");
  const samples = data.samples.map((entry): ResourceSample => {
    const sample = object(entry), host = object(sample.host), process = object(sample.process);
    const load = host.loadAverage;
    if (load !== null && (!Array.isArray(load) || load.length !== 3)) throw new Error("Invalid load average.");
    return {
      at: number(sample.at),
      host: { totalMemoryBytes: number(host.totalMemoryBytes), freeMemoryBytes: number(host.freeMemoryBytes), logicalCpus: number(host.logicalCpus), loadAverage: load === null ? null : (load as unknown[]).map(number) },
      process: { pid: number(process.pid), rssBytes: number(process.rssBytes), heapUsedBytes: number(process.heapUsedBytes), externalBytes: number(process.externalBytes), cpuPercent: process.cpuPercent === null ? null : number(process.cpuPercent), uptimeSeconds: number(process.uptimeSeconds) },
    };
  });
  return { scope: data.scope, sampling: data.sampling, childProcessesIncluded: false, samples };
}
export function memoryLabel(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

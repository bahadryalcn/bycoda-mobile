import { describe, expect, it } from "vitest";
import { AUTO_ARCHIVE_CAPABILITY, confirmAgentDefaults, inactiveDays, readAgentDefaults, withoutArchive } from "./settings-draft";

const defaults = { schemaVersion: 1 as const, version: 2, keepAwakeWhileAgentsWork: false, keepAwakeHoldAfter: "0" as const, autoContinueInterrupted: true, resumeAtReset: true, streamingTextMode: "paced" as const, archiveMergedSessions: false, archiveInactiveDays: 0 };
describe("computer agent defaults", () => {
  it("accepts full versioned replies and rejects missing/malformed fields", () => {
    expect(readAgentDefaults({ agentDefaults: defaults })).toEqual(defaults);
    for (const patch of [{ schemaVersion: 2 }, { version: -1 }, { version: 1.5 }, { keepAwakeWhileAgentsWork: "false" }, { keepAwakeHoldAfter: "10m" }, { archiveInactiveDays: Infinity }, { streamingTextMode: null }])
      expect(() => readAgentDefaults({ agentDefaults: { ...defaults, ...patch } })).toThrow();
    expect(() => readAgentDefaults({})).toThrow();
  });
  it("requires newer ACK and exact submitted values", () => {
    expect(confirmAgentDefaults({ agentDefaults: { ...defaults, version: 3 } }, defaults).version).toBe(3);
    expect(() => confirmAgentDefaults({ agentDefaults: defaults }, defaults)).toThrow();
    expect(() => confirmAgentDefaults({ agentDefaults: { ...defaults, version: 3, resumeAtReset: false } }, defaults)).toThrow();
  });
  it("keeps Host-only behavior out of the mobile write payload", () => {
    const record = readAgentDefaults({ agentDefaults: { ...defaults, usageLimitFailover: "order" } });
    expect(record).toEqual(defaults);
    expect(withoutArchive(record)).not.toHaveProperty("usageLimitFailover");
  });
  it("omits archive fields without the archive capability and still confirms", () => {
    const sent = withoutArchive(defaults);
    expect(sent).not.toHaveProperty("archiveMergedSessions");
    expect(sent).not.toHaveProperty("archiveInactiveDays");
    expect(confirmAgentDefaults({ agentDefaults: { ...defaults, version: 3 } }, sent).version).toBe(3);
    expect(AUTO_ARCHIVE_CAPABILITY).toBe("host.settings.autoArchive.v1");
  });
  it("accepts off and bounded whole days", () => {
    for (const value of ["0", "1", "3650"]) expect(inactiveDays(value)).toBe(Number(value));
    for (const value of ["", "-1", "1.5", "3651", "1e2", " 1"]) expect(inactiveDays(value)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  LOG_DETAILS_LIMIT,
  LOG_ENTRY_LIMIT,
  LOG_POLL_ACTIVE_MS,
  LOG_POLL_IDLE_AFTER,
  LOG_POLL_IDLE_MS,
  LOG_SEARCH_LIMIT,
  advanceLogPoll,
  initialLogPollState,
  logDetails,
  logLocation,
  logPollInterval,
  logSearch,
  visibleLogEntries,
} from "./runtime-log-presentation";
import { tunnelPresentation } from "./tunnel-presentation";
import type { RuntimeLogEntry } from "./types";

const entry = (id: string, projectId = "project"): RuntimeLogEntry =>
  ({ id, cursor: Number(id.replace(/\D/g, "")) || 0, timestamp: 1, sourceId: "source", source: "server", level: "info", message: id, projectId });

describe("stable runtime log rows", () => {
  it("lists the project's entries newest first without copying or mutating them", () => {
    const [a, b, other, c] = [entry("a1"), entry("b2"), entry("x3", "other"), entry("c4")];
    const source = [a, b, other, c];
    const visible = visibleLogEntries(source, "project");
    expect(visible).toEqual([c, b, a]);
    expect(visible.every((item) => source.includes(item))).toBe(true);
    expect(source).toEqual([a, b, other, c]);
  });
  it("keeps the newest entries within the buffer bound and returns one empty array for no rows", () => {
    const many = Array.from({ length: LOG_ENTRY_LIMIT + 30 }, (_, index) => entry(`e${index}`));
    const visible = visibleLogEntries(many, "project");
    expect(visible).toHaveLength(LOG_ENTRY_LIMIT);
    expect(visible[0]).toBe(many.at(-1));
    expect(visibleLogEntries(undefined, "project")).toBe(visibleLogEntries([entry("x", "other")], "project"));
  });
  it("slows the poll after consecutive unchanged reads and speeds up on any change", () => {
    const snapshot = { cursor: 2, entries: [entry("a1"), entry("b2")] };
    let state = advanceLogPoll(initialLogPollState, snapshot);
    expect(logPollInterval(state)).toBe(LOG_POLL_ACTIVE_MS);
    for (let read = 0; read < LOG_POLL_IDLE_AFTER; read++) state = advanceLogPoll(state, snapshot);
    expect(logPollInterval(state)).toBe(LOG_POLL_IDLE_MS);
    expect(advanceLogPoll(state, snapshot)).toBe(state);
    const changed = advanceLogPoll(state, { cursor: 3, entries: [...snapshot.entries, entry("c3")] });
    expect(logPollInterval(changed)).toBe(LOG_POLL_ACTIVE_MS);
    expect(advanceLogPoll(changed, undefined)).toBe(initialLogPollState);
  });
});

describe("bounded log presentation", () => {
  it("preserves the full invalid search rather than pretending a different prefix was searched", () => {
    for (const length of [LOG_SEARCH_LIMIT - 1, LOG_SEARCH_LIMIT, LOG_SEARCH_LIMIT + 1]) {
      const input = "x".repeat(length);
      expect(logSearch(`  ${input}  `)).toEqual({
        query: input,
        tooLong: length > LOG_SEARCH_LIMIT,
      });
    }
  });
  it("counts the complete serialized representation including quotes and escaping", () => {
    const exact = "x".repeat(LOG_DETAILS_LIMIT - 2);
    expect(logDetails(exact)).toEqual({ text: JSON.stringify(exact), truncated: false });
    expect(logDetails(exact + "x")).toMatchObject({ truncated: true });
    expect(logDetails(exact + "x").text).toHaveLength(LOG_DETAILS_LIMIT);
    expect(logDetails("\n".repeat(LOG_DETAILS_LIMIT / 2))).toMatchObject({ truncated: true });
    expect(logDetails(null)).toEqual({ text: "null", truncated: false });
  });
  it("formats a location without dangling colons for every optional part combination", () => {
    expect(logLocation({ file: "src/app.ts" })).toBe("src/app.ts");
    expect(logLocation({ file: "src/app.ts", line: null, column: null })).toBe("src/app.ts");
    expect(logLocation({ file: "src/app.ts", line: 12 })).toBe("src/app.ts:12");
    expect(logLocation({ file: "src/app.ts", line: 12, column: null })).toBe("src/app.ts:12");
    expect(logLocation({ file: "src/app.ts", line: 12, column: 4 })).toBe("src/app.ts:12:4");
    expect(logLocation({ file: "src/app.ts", column: 4 })).toBe("src/app.ts:4");
  });
});

describe("tunnel state presentation", () => {
  it("provides finite localized text and truthful semantic tones for every accepted state", () => {
    expect(
      ["starting", "ready", "stopping", "stopped", "error", "interrupted"].map((state) =>
        tunnelPresentation(state as Parameters<typeof tunnelPresentation>[0]),
      ),
    ).toEqual([
      { label: ["Başlatılıyor", "Starting"], tone: "info" },
      { label: ["Hazır", "Ready"], tone: "success" },
      { label: ["Durduruluyor", "Stopping"], tone: "info" },
      { label: ["Durduruldu", "Stopped"], tone: "default" },
      { label: ["Hata", "Error"], tone: "danger" },
      { label: ["Kesildi", "Interrupted"], tone: "warning" },
    ]);
    expect(tunnelPresentation("ready").label[1]).not.toMatch(/reachable|connected/i);
  });
});

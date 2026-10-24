import { describe, expect, it } from "vitest";
import {
  LOG_DETAILS_LIMIT,
  LOG_SEARCH_LIMIT,
  logDetails,
  logSearch,
} from "./runtime-log-presentation";
import { tunnelPresentation } from "./tunnel-presentation";

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

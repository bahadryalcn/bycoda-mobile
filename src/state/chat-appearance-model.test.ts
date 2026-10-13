import { describe, expect, it } from "vitest";
import {
  decodeChatTextSize,
  encodeChatTextSize,
  normalizeChatTextSize,
} from "./chat-appearance-model";

describe("chat text preference normalization", () => {
  it("restores supported sizes and earlier human-readable aliases", () => {
    for (const [value, expected] of [
      ["small", "compact"],
      [" COMPACT ", "compact"],
      ["default", "standard"],
      ["normal", "standard"],
      ["standard", "standard"],
      ["LARGE", "large"],
    ]) {
      expect(normalizeChatTextSize(value)).toBe(expected);
    }
    expect(decodeChatTextSize('{"version":1,"textSize":"large"}')).toBe("large");
    expect(decodeChatTextSize('"default"')).toBe("standard");
    expect(decodeChatTextSize("small")).toBe("compact");
  });

  it("falls back to compact for missing, malformed or invalid stored data", () => {
    for (const raw of [
      null,
      "",
      "{",
      "null",
      "17",
      "[]",
      '{"textSize":99}',
      '{"textSize":"huge"}',
    ]) {
      expect(decodeChatTextSize(raw)).toBe("compact");
    }
  });

  it("persists only a bounded presentation preference", () => {
    expect(JSON.parse(encodeChatTextSize("standard"))).toEqual({
      version: 1,
      textSize: "standard",
    });
  });
});

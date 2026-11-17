import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_DISPLAY, decodeChatDisplay, encodeChatDisplay, normalizeChatDisplay } from "./chat-display-model";

describe("chat display preferences", () => {
  it("defaults to show-all, standard sizes and horizontal scroll", () => {
    expect(decodeChatDisplay(null)).toEqual(DEFAULT_CHAT_DISPLAY);
    expect(decodeChatDisplay("not json")).toEqual(DEFAULT_CHAT_DISPLAY);
  });
  it("round-trips and drops unknown values", () => {
    const value = { toolVisibility: "zen", codeSize: "large", terminalSize: "small", codeWrap: true } as const;
    expect(decodeChatDisplay(encodeChatDisplay(value))).toEqual(value);
    expect(normalizeChatDisplay({ toolVisibility: "nope", codeSize: 3, codeWrap: "yes" })).toEqual(DEFAULT_CHAT_DISPLAY);
  });
});

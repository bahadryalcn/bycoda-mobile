import { describe, expect, it } from "vitest";
import { messageSummary } from "./message-summary";

describe("messageSummary", () => {
  it("reads handoff prose without Markdown syntax or link targets", () => {
    expect(messageSummary("## Session so far\n\n**User:** Fix [sign in](https://example.com).\n\n> Keep `OAuth` working."))
      .toBe("Session so far User: Fix sign in. Keep OAuth working.");
  });
  it("separates blocks, preserves inline spacing and decodes escapes", () => {
    expect(messageSummary("- **First** item\n- Second \\*item\\*\n\n```sh\npnpm test\n```"))
      .toBe("First item Second *item* pnpm test");
    expect(messageSummary("**Auth**entication\n\n![Diagram](https://example.com/image.png)"))
      .toBe("Authentication Diagram");
    expect(messageSummary(" \n\t")).toBe("");
  });
});

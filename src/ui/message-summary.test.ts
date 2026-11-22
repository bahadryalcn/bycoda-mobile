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
  it("omits only a matching leading heading when requested", () => {
    const options = { omitLeadingHeadingMatching: "Release plan" };
    expect(messageSummary("Release **plan**\n============\n\nChecklist.", options)).toBe("Checklist.");
    expect(messageSummary("## Release plan", options)).toBe("");
    expect(messageSummary("## Another section\n\n## Release plan", options)).toBe("Another section Release plan");
    expect(messageSummary("Release plan\n\nChecklist.", options)).toBe("Release plan Checklist.");
  });
  it("allows user-authored Markdown to retain text resembling provider metadata", () => {
    const literal = "<oai-mem-citation>\n<citation_entries>\nExample\n</citation_entries>\n<rollout_ids>\n</rollout_ids>\n</oai-mem-citation>";
    expect(messageSummary(literal)).toBe("");
    expect(messageSummary(literal, { hideInternalMetadata: false })).toContain("Example");
  });
});

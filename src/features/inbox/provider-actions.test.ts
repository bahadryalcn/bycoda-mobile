import { describe, expect, it } from "vitest";
import { providerPrActions } from "./provider-actions";

describe("provider inbox PR actions", () => {
  it("does not offer merging draft, closed or already merged pull requests", () => {
    expect(
      providerPrActions({ provider: "github", kind: "pr", state: "OPEN", draft: true }),
    ).toEqual(["ready", "close"]);
    expect(
      providerPrActions({ provider: "github", kind: "pr", state: "CLOSED", draft: false }),
    ).toEqual(["reopen"]);
    expect(
      providerPrActions({ provider: "github", kind: "pr", state: "MERGED", draft: false }),
    ).toEqual([]);
  });
  it("offers supported operations for an open ready PR without fabricating other providers support", () => {
    expect(
      providerPrActions({ provider: "github", kind: "pr", state: "open", draft: false }),
    ).toContain("squash");
    expect(
      providerPrActions({ provider: "gitlab", kind: "pr", state: "open", draft: false }),
    ).toEqual([]);
    expect(
      providerPrActions({ provider: "github", kind: "issue", state: "open", draft: false }),
    ).toEqual([]);
  });
});

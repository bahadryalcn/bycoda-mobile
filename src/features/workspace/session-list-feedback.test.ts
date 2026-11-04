import { describe, expect, it } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { sameSessionListConnectionFailure } from "./session-list-feedback";

describe("project session connection feedback", () => {
  const failure = (kind: ConstructorParameters<typeof RemoteHostError>[1], machine = "computer", uncertain = false) =>
    new RemoteHostError(machine, kind, "Host read failed", uncertain);

  it("combines two network failures for the same computer", () => {
    expect(sameSessionListConnectionFailure(failure("network"), failure("network"))).toBe(true);
    expect(sameSessionListConnectionFailure(failure("timeout"), failure("timeout"))).toBe(true);
  });
  it("preserves independent source, identity, permission and uncertain failures", () => {
    expect(sameSessionListConnectionFailure(failure("network", "first"), failure("network", "second"))).toBe(false);
    expect(sameSessionListConnectionFailure(failure("network"), failure("timeout"))).toBe(false);
    expect(sameSessionListConnectionFailure(failure("auth"), failure("auth"))).toBe(false);
    expect(sameSessionListConnectionFailure(failure("identity"), failure("identity"))).toBe(false);
    expect(sameSessionListConnectionFailure(failure("network", "computer", true), failure("network"))).toBe(false);
    expect(sameSessionListConnectionFailure(undefined, failure("network"))).toBe(false);
    expect(sameSessionListConnectionFailure(new Error("network"), new Error("network"))).toBe(false);
  });
});

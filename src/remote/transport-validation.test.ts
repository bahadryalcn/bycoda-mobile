import { describe, expect, it } from "vitest";
import { HOST_PROTOCOL_VERSION } from "../../../src/features/connections/model/protocol";
import { isHostIdentityMismatch, requireMobileHostDescriptor } from "./transport-validation";

const base = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  environmentId: "computer",
  name: "desk",
  providers: ["codex", "claude"],
  capabilities: ["transport.ws.v2"],
};

it("classifies the Host's identity code before interpreting legacy error text", () => {
  expect(isHostIdentityMismatch({ code: "HOST_IDENTITY_MISMATCH" }, "Re-pair required")).toBe(true);
  expect(isHostIdentityMismatch({ code: "HOST_ERROR" }, "Host identity changed.")).toBe(false);
  expect(isHostIdentityMismatch({}, "Host identity changed.")).toBe(true);
  expect(isHostIdentityMismatch({}, "Provider identity changed.")).toBe(false);
});

describe("requireMobileHostDescriptor", () => {
  it("accepts a Host that gained providers this build does not know", () => {
    const descriptor = requireMobileHostDescriptor({
      ...base,
      providers: ["codex", "brand-new-provider", "claude"],
    });
    expect(descriptor.providers).toEqual(["codex", "claude"]);
  });

  it("returns the descriptor untouched when every provider is known", () => {
    expect(requireMobileHostDescriptor(base)).toBe(base);
  });

  it("tells the user to update the app when the Host protocol is newer", () => {
    expect(() =>
      requireMobileHostDescriptor({ ...base, protocolVersion: HOST_PROTOCOL_VERSION + 1 }),
    ).toThrow(/Update this app/);
  });

  it("tells the user to update the Host when its protocol is older or missing", () => {
    expect(() =>
      requireMobileHostDescriptor({ ...base, protocolVersion: HOST_PROTOCOL_VERSION - 1 }),
    ).toThrow(/Update the bycoda Host/);
    expect(() => requireMobileHostDescriptor({ ...base, protocolVersion: undefined })).toThrow(
      /Update the bycoda Host/,
    );
  });

  it("still rejects a descriptor whose providers are not a list", () => {
    expect(() => requireMobileHostDescriptor({ ...base, providers: "codex" })).toThrow(
      /incompatible bycoda Host/,
    );
  });
});

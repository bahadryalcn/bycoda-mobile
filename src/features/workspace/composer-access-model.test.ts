import { expect, it } from "vitest";
import { accessConfigureCommand, composerAccessAvailable, unavailableAccessModes } from "./composer-access-model";
import type { HostSession } from "./wire";

const host = {
  authorityGeneration: 3,
  revision: 12,
  session: {
    id: "s",
    harness: "claude",
    providerAccountId: undefined,
    model: "claude:opus",
    modelSettings: { effort: "high" },
    runtimeMode: "supervised",
  },
} as unknown as HostSession;

it("changes only the access mode and keeps the reviewed model and authority", () => {
  expect(accessConfigureCommand(host, "full-access")).toEqual({
    type: "configure",
    sessionId: "s",
    authorityGeneration: 3,
    expectedRevision: 12,
    harness: "claude",
    providerAccountId: null,
    model: "claude:opus",
    modelSettings: { effort: "high" },
    runtimeMode: "full-access",
  });
});

it("hides the picker without a session or for a harness without access modes", () => {
  expect(composerAccessAvailable(undefined)).toBe(false);
  expect(composerAccessAvailable({ ...host, session: { ...host.session, harness: "fx" } })).toBe(
    false,
  );
  expect(composerAccessAvailable(host)).toBe(true);
});

it("reads the Host's unavailable modes for the session harness only", () => {
  const catalog = { runtimeModeLimits: { antigravity: { supervised: "Headless agy cannot ask." } } };
  expect(unavailableAccessModes(catalog, "antigravity")).toEqual({ supervised: "Headless agy cannot ask." });
  expect(unavailableAccessModes(catalog, "claude")).toEqual({});
  expect(unavailableAccessModes(undefined, "antigravity")).toEqual({});
});

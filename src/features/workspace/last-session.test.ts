import { describe, expect, it, vi } from "vitest";

// The module also hosts the mounted hook; its runtime imports are irrelevant to the pure helpers under test.
vi.mock("react-native", () => ({ Linking: {} }));
vi.mock("expo-router", () => ({ router: {}, useRootNavigationState: () => ({}) }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("../permissions/device-permissions", () => ({ notifications: {} }));
vi.mock("../../state/machines", () => ({ useMachines: () => ({}) }));

import { decodeLastSessionRoute, lastSessionRestoreTarget, type LastSessionRoute } from "./last-session";

const stored: LastSessionRoute = { machineId: "m1", projectId: "p1", id: "s1" };
const eligible = {
  stored,
  machineIds: ["m1", "m2"],
  activeMachineId: "m1",
  initialUrl: null,
  launchedFromNotification: false,
};

describe("decodeLastSessionRoute", () => {
  it("accepts only complete, bounded id strings", () => {
    expect(decodeLastSessionRoute(JSON.stringify(stored))).toEqual(stored);
    expect(decodeLastSessionRoute(JSON.stringify({ ...stored, id: "" }))).toBeNull();
    expect(decodeLastSessionRoute(JSON.stringify({ ...stored, projectId: 4 }))).toBeNull();
    expect(decodeLastSessionRoute(JSON.stringify({ ...stored, machineId: "x".repeat(201) }))).toBeNull();
    expect(decodeLastSessionRoute(JSON.stringify({ machineId: "m1", id: "s1" }))).toBeNull();
  });

  it("treats missing, corrupt or non-object storage as no record", () => {
    expect(decodeLastSessionRoute(null)).toBeNull();
    expect(decodeLastSessionRoute("{not json")).toBeNull();
    expect(decodeLastSessionRoute("null")).toBeNull();
    expect(decodeLastSessionRoute("42")).toBeNull();
  });
});

describe("lastSessionRestoreTarget", () => {
  it("restores the stored session for the active, still-paired computer", () => {
    expect(lastSessionRestoreTarget(eligible)).toEqual(stored);
  });

  it("does nothing without a stored record", () => {
    expect(lastSessionRestoreTarget({ ...eligible, stored: null })).toBeNull();
  });

  it("keeps an explicit deep link as the launch target", () => {
    expect(lastSessionRestoreTarget({ ...eligible, initialUrl: "bycoda://session/s2" })).toBeNull();
  });

  it("keeps a notification launch as the launch target", () => {
    expect(lastSessionRestoreTarget({ ...eligible, launchedFromNotification: true })).toBeNull();
  });

  it("never restores a computer that is no longer paired", () => {
    expect(lastSessionRestoreTarget({ ...eligible, machineIds: ["m2"], activeMachineId: "m2" })).toBeNull();
  });

  it("never switches computers implicitly", () => {
    expect(lastSessionRestoreTarget({ ...eligible, activeMachineId: "m2" })).toBeNull();
  });
});

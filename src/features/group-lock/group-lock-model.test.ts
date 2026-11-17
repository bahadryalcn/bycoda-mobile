import { describe, expect, it } from "vitest";
import type { HostProjectDirectory } from "@/domain/types";
import {
  cacheHoldsProject,
  groupLockView,
  parsePasswordResult,
  passwordOutcomeFromError,
  retrySeconds,
  supportsGroupLock,
  withGroupsLocked,
} from "./group-lock-model";

const directory: HostProjectDirectory = {
  version: 1,
  privacyReady: true,
  groups: [
    { id: "open", name: "Open" },
    { id: "work", name: "Work" },
  ],
  projects: [
    { id: "p1", cwd: "/a", name: "A", groupId: "work", registered: true },
    { id: "p2", cwd: "/b", name: "B", groupId: "open", registered: true },
  ],
  lockedGroups: [{ id: "vault", name: "Vault" }],
};

describe("password outcomes", () => {
  it("trusts only the three verdicts", () => {
    expect(parsePasswordResult({ result: "ok" })).toEqual({ state: "ok" });
    expect(parsePasswordResult({ result: "wrong", retryAfterMs: 1500 })).toEqual({ state: "wrong", retryAfterMs: 1500 });
    expect(parsePasswordResult({ result: "throttled", retryAfterMs: 30_000 })).toEqual({ state: "throttled", retryAfterMs: 30_000 });
    for (const bad of [undefined, null, {}, { result: "yes" }, "ok", { result: true }])
      expect(parsePasswordResult(bad)).toEqual({ state: "failed" });
    expect(parsePasswordResult({ result: "wrong", retryAfterMs: -4 })).toEqual({ state: "wrong", retryAfterMs: 0 });
  });
  it("tells an unavailable desktop from other failures", () => {
    expect(passwordOutcomeFromError(new Error("Open the bycoda app on that computer to unlock groups from this device."))).toEqual({ state: "unavailable" });
    expect(passwordOutcomeFromError(new Error("boom"))).toEqual({ state: "failed" });
  });
  it("rounds waits up", () => {
    expect(retrySeconds(1)).toBe(1);
    expect(retrySeconds(1001)).toBe(2);
  });
  it("needs the capability", () => {
    expect(supportsGroupLock(["projects.groupLock.remote.v1"])).toBe(true);
    expect(supportsGroupLock(undefined)).toBe(false);
  });
});

describe("group lock view", () => {
  it("lists locked stubs, the groups this phone unlocked and the hidden list only when sent", () => {
    const view = groupLockView(directory, new Set(["work", "gone"]));
    expect(view.locked.map((group) => group.id)).toEqual(["vault"]);
    expect(view.unlocked.map((group) => group.id)).toEqual(["work"]);
    expect(view.hidden).toBeUndefined();
    expect(groupLockView({ ...directory, hiddenGroups: [{ id: "h", name: "H" }] }, new Set()).hidden).toHaveLength(1);
  });
});

describe("locking", () => {
  it("removes the group and its projects at once and leaves a name-only stub", () => {
    const locked = withGroupsLocked(directory, new Set(["work"]));
    expect(locked.groups.map((group) => group.id)).toEqual(["open"]);
    expect(locked.projects.map((project) => project.id)).toEqual(["p2"]);
    expect(locked.lockedGroups?.map((group) => group.id)).toEqual(["vault", "work"]);
    expect(withGroupsLocked(directory, new Set(["nope"]))).toBe(directory);
  });
  it("finds cached data of the locked projects by key or payload, and spares the rest", () => {
    const ids = new Set(["p1"]);
    const query = (queryKey: unknown[], data?: unknown) => ({ queryKey, state: { data } });
    expect(cacheHoldsProject(query(["machine", "m", "sessions", "p1"]), "m", ids)).toBe(true);
    expect(cacheHoldsProject(query(["machine", "m", "session", "s9"], { projectId: "p1" }), "m", ids)).toBe(true);
    expect(cacheHoldsProject(query(["machine", "m", "x", { projectId: "p1" }]), "m", ids)).toBe(true);
    expect(cacheHoldsProject(query(["machine", "m", "session", "s1"], { projectId: "p2" }), "m", ids)).toBe(false);
    expect(cacheHoldsProject(query(["machine", "other", "sessions", "p1"]), "m", ids)).toBe(false);
    expect(cacheHoldsProject(query(["machine", "m", "projects", "p1"]), "m", ids)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import {
  inboxItemInput,
  inboxItemKey,
  inboxOriginKey,
  isInboxOriginCurrent,
  providerInboxAccess,
  providerInboxView,
} from "./provider-model";

const fixtureItem: RemoteInboxItem = {
  provider: "linear",
  kind: "linear",
  number: 7,
  id: "issue-uuid",
  identifier: "DEMO-7",
  repo: "demo/repo",
  projectPath: "/computer-a/demo",
  title: "Display title",
  state: "OPEN",
  url: "https://example.invalid/7",
  updatedAt: "",
  draft: false,
  labels: [],
  assignees: [],
};

describe("provider inbox operation origin", () => {
  it("requires both the original computer and project before applying an async completion", () => {
    const origin = { machineId: "machine-a", projectId: "shared-project-id" };
    expect(
      isInboxOriginCurrent(origin, {
        activeId: "machine-a",
        selectedProjectId: "shared-project-id",
      }),
    ).toBe(true);
    expect(
      isInboxOriginCurrent(origin, {
        activeId: "machine-b",
        selectedProjectId: "shared-project-id",
      }),
    ).toBe(false);
    expect(
      isInboxOriginCurrent(origin, {
        activeId: "machine-a",
        selectedProjectId: "different-project",
      }),
    ).toBe(false);
    expect(isInboxOriginCurrent(origin, { activeId: "machine-a", selectedProjectId: null })).toBe(
      false,
    );
  });

  it("keeps the confirmed item identity and path while excluding display-only metadata", () => {
    expect(inboxItemInput(fixtureItem, "project-a")).toEqual({
      projectId: "project-a",
      item: {
        provider: "linear",
        kind: "linear",
        number: 7,
        id: "issue-uuid",
        identifier: "DEMO-7",
        repo: "demo/repo",
        projectPath: "/computer-a/demo",
      },
    });
    expect(inboxItemInput(fixtureItem, null)).not.toHaveProperty("projectId");
  });

  it("keeps the same detail identity when a heartbeat disappears and disables new operations", () => {
    const online = providerInboxView(fixtureItem, { data: { available: true }, isSuccess: true });
    const unavailable = providerInboxView(fixtureItem, {
      data: { available: false },
      isSuccess: true,
    });
    expect(online.kind).toBe("detail");
    expect(unavailable).toMatchObject({ kind: "detail", item: fixtureItem, canRead: false });
    if (online.kind === "detail" && unavailable.kind === "detail") {
      expect(unavailable.item).toBe(online.item);
      expect(inboxItemKey(unavailable.item)).toBe(inboxItemKey(online.item));
    }
    expect(providerInboxAccess({ data: { available: false }, isSuccess: true }).canWrite).toBe(
      false,
    );
  });

  it("keeps the selected detail during a network error and restores access on a confirmed heartbeat", () => {
    const failed = { data: { available: true }, isSuccess: false };
    expect(providerInboxView(fixtureItem, failed)).toMatchObject({
      kind: "detail",
      item: fixtureItem,
    });
    expect(providerInboxAccess(failed)).toEqual({ canRead: false, canWrite: false });
    expect(providerInboxAccess({ data: { available: true }, isSuccess: true })).toEqual({
      canRead: true,
      canWrite: true,
    });
  });

  it.each([
    { data: undefined, isSuccess: false },
    { data: { available: true }, isSuccess: true, isEnabled: false },
    { data: { available: true }, isSuccess: true, fetchStatus: "paused" as const },
  ])("denies new writes when cached availability cannot grant live access: %j", (availability) => {
    expect(providerInboxAccess(availability).canWrite).toBe(false);
    expect(providerInboxView(fixtureItem, availability).kind).toBe("detail");
  });

  it("changes component identity for machine or project changes, while distinguishing all projects from a named project", () => {
    const original = inboxOriginKey({ machineId: "machine-a", projectId: "project-a" });
    expect(inboxOriginKey({ machineId: "machine-b", projectId: "project-a" })).not.toBe(original);
    expect(inboxOriginKey({ machineId: "machine-a", projectId: "project-b" })).not.toBe(original);
    expect(inboxOriginKey({ machineId: "machine-a", projectId: null })).not.toBe(
      inboxOriginKey({ machineId: "machine-a", projectId: "all" }),
    );
    expect(providerInboxView(null, { data: { available: true }, isSuccess: true }).kind).toBe(
      "browse",
    );
  });
});

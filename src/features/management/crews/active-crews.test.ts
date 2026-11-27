// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ActiveCrews } from "./active-crews";
import { CREW_ACTIVE_CAPABILITY } from "./identity-model";

const { read, navigate } = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn() }));
vi.mock("expo-router", () => ({ router: { navigate } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "pc", capabilities: [CREW_ACTIVE_CAPABILITY] }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: read }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./member-avatar", () => ({ MemberAvatar: () => null }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress }: { label: string; onPress(): void }) =>
    createElement("button", { onClick: onPress }, label);
  return { Stack: Group, SectionHeader: () => null, NavigationGroup: Group, NavigationRow: Button, Button };
});

it("reads a page while collapsed and lets the owner open a member beyond that page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const items = Array.from({ length: 9 }, (_, id) => ({
    memberId: String(id), memberName: `Member ${id}`, projectId: "project",
    sessionId: `session-${id}`, runId: "run", status: "running",
  }));
  // Another project's member is never listed on this project's page.
  items.splice(1, 0, { memberId: "other", memberName: "Other project member", projectId: "other",
    sessionId: "session-other", runId: "run", status: "running" });
  read.mockImplementation((_key, _method, { limit }) => ({
    data: { items: items.slice(0, limit), truncated: limit < items.length },
  }));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(ActiveCrews, { projectId: "project" })));
    expect(read.mock.lastCall?.[2]).toEqual({ limit: 8 });
    expect(container.textContent).not.toContain("Member 8");
    expect(container.textContent).not.toContain("Other project member");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Show more")!.click());
    expect(read.mock.lastCall?.[2]).toEqual({ limit: 200 });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Member 8")!.click());
    expect(navigate).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "session-8", machineId: "pc", projectId: "project" } });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Show less")!.click());
    expect(read.mock.lastCall?.[2]).toEqual({ limit: 8 });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

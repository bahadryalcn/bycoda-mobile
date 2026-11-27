// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachines } from "@/state/machines";
import { useCreateSession } from "./use-create-session";

const fixture = vi.hoisted(() => ({
  dispatch: vi.fn<() => Promise<{ sessionId: string }>>(),
  success: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create(() => ({ activeId: "computer", machines: [] as (typeof firstComputer)[] }));
  return { useMachines, useActiveMachine: () => useMachines((state) => state.machines[0]) };
});
vi.mock("@/state/model-catalog", () => ({ useModelCatalog: () => ({}) }));
vi.mock("@/ui/motion", () => ({ haptic: { success: fixture.success } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./shared", () => ({ useCommands: () => ({ mutateAsync: fixture.dispatch }) }));

const firstComputer = {
  id: "computer", endpoint: "https://first.test", environmentId: "first", lanKey: "first-key",
  providers: ["codex" as const],
};
const secondComputer = {
  ...firstComputer, endpoint: "https://second.test", environmentId: "second", lanKey: "second-key",
};
const switchComputer = (machine: typeof firstComputer) => useMachines.setState({
  machines: [machine] as ReturnType<typeof useMachines.getState>["machines"],
});
let root: ReturnType<typeof createRoot>;
let latest: ReturnType<typeof useCreateSession>;

function Probe() {
  latest = useCreateSession("project", { cwd: "/folder", draft: { model: "test-model" } });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.dispatch.mockReset();
  fixture.success.mockClear();
  switchComputer(firstComputer);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("rejects a retained Start action after the same computer row is re-paired", async () => {
  const oldCreate = latest.create;
  const onCreated = vi.fn();
  fixture.dispatch.mockResolvedValue({ sessionId: "new-session" });
  await act(async () => switchComputer(secondComputer));

  await expect(oldCreate(onCreated)).resolves.toBe(false);
  expect(fixture.dispatch).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
});

it("rechecks the connection before the deferred single flight dispatches", async () => {
  let result: Promise<boolean>;
  const onCreated = vi.fn();
  fixture.dispatch.mockResolvedValue({ sessionId: "new-session" });
  await act(async () => {
    result = latest.create(onCreated);
    switchComputer(secondComputer);
    await expect(result).resolves.toBe(false);
  });
  expect(fixture.dispatch).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
});

it("keeps a confirmed receipt without navigating or vibrating after a re-pair", async () => {
  const receipt = Promise.withResolvers<{ sessionId: string }>();
  fixture.dispatch.mockReturnValue(receipt.promise);
  const onCreated = vi.fn();
  let result: Promise<boolean>;
  await act(async () => { result = latest.create(onCreated); });
  expect(fixture.dispatch).toHaveBeenCalledOnce();

  await act(async () => {
    switchComputer(secondComputer);
    switchComputer(firstComputer);
    receipt.resolve({ sessionId: "old-session" });
    await expect(result).resolves.toBe(true);
  });
  expect(onCreated).not.toHaveBeenCalled();
  expect(fixture.success).not.toHaveBeenCalled();
});

it("starts one session for two rapid presses on the current connection", async () => {
  const receipt = Promise.withResolvers<{ sessionId: string }>();
  fixture.dispatch.mockReturnValue(receipt.promise);
  const onCreated = vi.fn();
  await act(async () => {
    const first = latest.create(onCreated, { runtimeMode: "supervised" });
    const second = latest.create(onCreated);
    receipt.resolve({ sessionId: "new-session" });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });
  expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: "create", projectId: "project", worktreeCwd: "/folder", harness: "codex",
    model: "test-model", runtimeMode: "supervised",
  }));
  expect(onCreated).toHaveBeenCalledExactlyOnceWith("new-session");
  expect(fixture.success).toHaveBeenCalledOnce();
});

it("starts an explicitly reviewed request without joining the retired connection’s flight", async () => {
  const firstReceipt = Promise.withResolvers<{ sessionId: string }>();
  fixture.dispatch.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce({ sessionId: "second-session" });
  const onFirst = vi.fn();
  const onSecond = vi.fn();
  let firstResult: Promise<boolean>;

  await act(async () => { firstResult = latest.create(onFirst); });
  await act(async () => switchComputer(secondComputer));
  await act(async () => { await expect(latest.create(onSecond)).resolves.toBe(true); });
  firstReceipt.resolve({ sessionId: "first-session" });
  await expect(firstResult!).resolves.toBe(true);
  expect(fixture.dispatch).toHaveBeenCalledTimes(2);
  expect(onFirst).not.toHaveBeenCalled();
  expect(onSecond).toHaveBeenCalledExactlyOnceWith("second-session");
});

it("sends the first turn with a caller's stable command ID so a resend replays the same create", async () => {
  fixture.dispatch.mockResolvedValue({ sessionId: "new-session" });
  const onCreated = vi.fn();
  const firstTurn = { type: "send" as const, commandId: "turn-1", sessionId: "" as const, text: "Fix the build" };
  await act(async () => {
    await expect(latest.create(onCreated, { commandId: "create-1", firstTurn })).resolves.toBe(true);
  });
  expect(fixture.dispatch).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: "create", projectId: "project", firstTurn }),
    { commandId: "create-1" },
  );
  expect(onCreated).toHaveBeenCalledExactlyOnceWith("new-session");
});

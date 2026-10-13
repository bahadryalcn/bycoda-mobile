import { describe, expect, it, vi } from "vitest";
import { ConnectionRecoveryError, reloadSavedConnections, selectSavedComputer } from "./recovery";

function fixture() {
  const state = {
    hydrated: true,
    storageError: null as string | null,
    connectionPending: false,
    activeId: "computer-a" as string | null,
    machines: [{ id: "computer-a" }, { id: "computer-b" }],
  };
  const actions = {
    flushDrafts: vi.fn().mockResolvedValue(undefined),
    assertAccess: vi.fn(),
    hydrate: vi.fn().mockResolvedValue(undefined),
    getState: () => state,
    selectMachine: vi.fn((id: string) => {
      state.activeId = id;
    }),
    navigate: vi.fn(),
  };
  return { state, actions };
}

describe("connection recovery with mounted workspace drafts", () => {
  it("leaves hydration and selection unchanged if retaining a draft fails", async () => {
    const { state, actions } = fixture();
    const failure = new Error("Draft storage failed.");
    actions.flushDrafts.mockRejectedValue(failure);
    await expect(reloadSavedConnections(actions)).rejects.toBe(failure);
    expect(actions.hydrate).not.toHaveBeenCalled();
    expect(state.hydrated).toBe(true);
    await expect(selectSavedComputer("computer-b", actions)).rejects.toBe(failure);
    expect(actions.selectMachine).not.toHaveBeenCalled();
    expect(actions.navigate).not.toHaveBeenCalled();
    expect(state.activeId).toBe("computer-a");
  });

  it("waits for retained edits before starting hydration", async () => {
    const { actions } = fixture();
    let finish!: () => void;
    actions.flushDrafts.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const recovery = reloadSavedConnections(actions);
    expect(actions.hydrate).not.toHaveBeenCalled();
    finish();
    await recovery;
    expect(actions.hydrate).toHaveBeenCalledTimes(1);
    expect(actions.assertAccess).toHaveBeenCalledTimes(3);
  });

  it.each([{ hydrated: false }, { storageError: "Metadata rewrite failed." }])(
    "rejects a resolved hydrate that leaves recovery unavailable: %j",
    async (change) => {
      const { state, actions } = fixture();
      actions.hydrate.mockImplementationOnce(async () => {
        Object.assign(state, change);
      });
      await expect(reloadSavedConnections(actions)).rejects.toBeInstanceOf(ConnectionRecoveryError);
    },
  );

  it("does not acknowledge recovery if access locks while hydrating", async () => {
    const { actions } = fixture();
    actions.assertAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("App is locked.");
      });
    await expect(reloadSavedConnections(actions)).rejects.toThrow("locked");
  });

  it.each([
    { hydrated: false },
    { storageError: "Storage unavailable." },
    { connectionPending: true },
    { machines: [] },
  ])(
    "rejects the current machine state after flushing instead of trusting an earlier render: %j",
    async (change) => {
      const { state, actions } = fixture();
      actions.flushDrafts.mockImplementationOnce(async () => {
        Object.assign(state, change);
      });
      await expect(selectSavedComputer("computer-b", actions)).rejects.toBeInstanceOf(
        ConnectionRecoveryError,
      );
      expect(actions.selectMachine).not.toHaveBeenCalled();
      expect(actions.navigate).not.toHaveBeenCalled();
      expect(state.activeId).toBe("computer-a");
    },
  );

  it("does not navigate when the store rejected the requested selection", async () => {
    const { state, actions } = fixture();
    actions.selectMachine.mockImplementationOnce(() => undefined);
    await expect(selectSavedComputer("computer-b", actions)).rejects.toBeInstanceOf(
      ConnectionRecoveryError,
    );
    expect(actions.navigate).not.toHaveBeenCalled();
    expect(state.activeId).toBe("computer-a");
  });

  it("navigates once after a successful current-state selection", async () => {
    const { state, actions } = fixture();
    actions.navigate.mockImplementationOnce(() => {
      expect(state.activeId).toBe("computer-b");
    });
    await selectSavedComputer("computer-b", actions);
    expect(actions.selectMachine).toHaveBeenCalledWith("computer-b");
    expect(actions.navigate).toHaveBeenCalledTimes(1);
  });

  it.each(["reload", "select"] as const)(
    "stops %s if the app locks while retaining edits",
    async (operation) => {
      const { actions } = fixture();
      actions.assertAccess
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new Error("App is locked.");
        });
      await expect(
        operation === "reload"
          ? reloadSavedConnections(actions)
          : selectSavedComputer("computer-b", actions),
      ).rejects.toThrow("locked");
      expect(actions.hydrate).not.toHaveBeenCalled();
      expect(actions.selectMachine).not.toHaveBeenCalled();
      expect(actions.navigate).not.toHaveBeenCalled();
    },
  );
});

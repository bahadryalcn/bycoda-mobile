import { describe, expect, it, vi } from "vitest";
import { ConnectionRecoveryError, matchesSavedComputer, removeSavedComputer, reloadSavedConnections, selectSavedComputer } from "./recovery";

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
    onSelected: vi.fn(),
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
    expect(actions.onSelected).not.toHaveBeenCalled();
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
      expect(actions.onSelected).not.toHaveBeenCalled();
      expect(state.activeId).toBe("computer-a");
    },
  );

  it("does not notify the caller when the store rejected the requested selection", async () => {
    const { state, actions } = fixture();
    actions.selectMachine.mockImplementationOnce(() => undefined);
    await expect(selectSavedComputer("computer-b", actions)).rejects.toBeInstanceOf(
      ConnectionRecoveryError,
    );
    expect(actions.onSelected).not.toHaveBeenCalled();
    expect(state.activeId).toBe("computer-a");
  });

  it("notifies the caller once after a successful current-state selection", async () => {
    const { state, actions } = fixture();
    actions.onSelected.mockImplementationOnce(() => {
      expect(state.activeId).toBe("computer-b");
    });
    await selectSavedComputer("computer-b", actions);
    expect(actions.selectMachine).toHaveBeenCalledWith("computer-b");
    expect(actions.onSelected).toHaveBeenCalledTimes(1);
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
      expect(actions.onSelected).not.toHaveBeenCalled();
    },
  );
});


describe("reviewed local connection removal", () => {
  const review = { id: "computer-a", endpoint: "https://original.invalid", environmentId: "env-a", lanKey: "key-a" };
  function removalFixture() {
    const state = { hydrated: true, storageError: null as string | null, connectionPending: false,
      machines: [{ ...review }], activeId: "another-computer" };
    const actions = { getState: () => state, assertAccess: vi.fn(), reviewValid: () => true,
      flushDrafts: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
    return { state, actions };
  }
  it("removes the exact reviewed origin even when another computer is active", async () => {
    const { actions } = removalFixture();
    await removeSavedComputer(review, actions);
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith(review.id, review);
    expect(actions.remove.mock.calls[0][1]).not.toBe(review);
  });
  it.each([{ endpoint: "https://replacement.invalid" }, { environmentId: "env-b" }, { lanKey: "key-b" }])(
    "rejects a same-id replacement before draft flushing: %j", async change => {
      const { state, actions } = removalFixture(); Object.assign(state.machines[0], change);
      expect(matchesSavedComputer(review, state)).toBe(false);
      await expect(removeSavedComputer(review, actions)).rejects.toBeInstanceOf(ConnectionRecoveryError);
      expect(actions.flushDrafts).not.toHaveBeenCalled(); expect(actions.remove).not.toHaveBeenCalled();
    });
  it.each(["replacement", "missing", "storage", "pending", "retired", "locked"]) (
    "rechecks %s after retaining workspace drafts", async reason => {
      const { state, actions } = removalFixture(); let valid = true; actions.reviewValid = () => valid;
      actions.flushDrafts.mockImplementation(async () => {
        if (reason === "replacement") state.machines[0].endpoint = "https://new.invalid";
        if (reason === "missing") state.machines = [];
        if (reason === "storage") state.storageError = "Cannot read saved connections";
        if (reason === "pending") state.connectionPending = true;
        if (reason === "retired") valid = false;
        if (reason === "locked") actions.assertAccess.mockImplementation(() => { throw new Error("Locked"); });
      });
      await expect(removeSavedComputer(review, actions)).rejects.toThrow();
      expect(actions.remove).not.toHaveBeenCalled();
    });
  it("leaves the reviewed connection when a draft or serialized removal fails", async () => {
    const { actions } = removalFixture(); actions.flushDrafts.mockRejectedValueOnce(new Error("Draft failed"));
    await expect(removeSavedComputer(review, actions)).rejects.toThrow("Draft failed"); expect(actions.remove).not.toHaveBeenCalled();
    actions.remove.mockRejectedValueOnce(new Error("Credential storage failed"));
    await expect(removeSavedComputer(review, actions)).rejects.toThrow("Credential storage failed");
  });
});

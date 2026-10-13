import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
const secrets = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
}));
const access = vi.hoisted(() => ({ assertAppAccess: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("expo-secure-store", () => secrets);
vi.mock("./security", () => access);
import { credentials, useMachines } from "./machines";
import { useConnectionStore } from "./connection-store";
import { LANGUAGES } from "../../../src/shared/i18n/languages";
const machine = {
  id: "computer-a",
  name: "Work",
  endpoint: "https://work.example",
  environmentId: "env-a",
  providers: ["gemini"] as const,
};
const token = "a".repeat(43);
const replacement = "b".repeat(43);
describe("connection persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    access.assertAppAccess.mockReset();
    access.assertAppAccess.mockImplementation(() => undefined);
    secrets.getItemAsync.mockResolvedValue(null);
    secrets.setItemAsync.mockResolvedValue(undefined);
    secrets.deleteItemAsync.mockResolvedValue(undefined);
    useMachines.setState({
      machines: [],
      projects: {},
      activeId: null,
      selectedProjectId: null,
      language: "system",
      hydrated: false,
      storageError: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });
  it("never overwrites unread storage after hydration fails", async () => {
    storage.getItem.mockRejectedValueOnce(new Error("Unavailable"));
    await useMachines.getState().hydrate();
    useMachines.getState().setLanguage("tr");
    useMachines.getState().selectProject("project-a");
    useMachines.getState().selectMachine("computer-a");
    await expect(useMachines.getState().removeMachine("computer-a")).rejects.toThrow("storage");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent hydration", async () => {
    await Promise.all([useMachines.getState().hydrate(), useMachines.getState().hydrate()]);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });
  it.each(LANGUAGES)("restores and persists the $value language", async ({ value }) => {
    storage.getItem.mockResolvedValueOnce(
      JSON.stringify({ machines: [], projects: {}, language: value }),
    );
    await useMachines.getState().hydrate();
    expect(useMachines.getState().language).toBe(value);
    useMachines.getState().setLanguage("system");
    await vi.waitFor(() =>
      expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).language).toBe("system"),
    );
    useMachines.getState().setLanguage(value);
    await vi.waitFor(() =>
      expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).language).toBe(value),
    );
  });
  it("discards an unsupported stored language", async () => {
    storage.getItem.mockResolvedValueOnce(
      JSON.stringify({ machines: [], projects: {}, language: "invalid" }),
    );
    await useMachines.getState().hydrate();
    expect(useMachines.getState().language).toBe("system");
  });
  it("scrubs imported secrets and unknown fields on disk before exposing valid connections", async () => {
    storage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        machines: [{ ...machine, token, password: replacement, unknown: { token } }],
        activeId: machine.id,
        projects: { [machine.id]: "project-a", orphan: token },
        language: "tr",
        tokens: { [machine.id]: token },
        secret: replacement,
      }),
    );
    await useMachines.getState().hydrate();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const clean = JSON.parse(String(storage.setItem.mock.calls[0][1]));
    expect(Object.keys(clean)).toEqual(["machines", "activeId", "projects", "language"]);
    expect(clean.machines[0]).not.toHaveProperty("token");
    expect(clean.machines[0]).not.toHaveProperty("password");
    expect(clean.machines[0]).not.toHaveProperty("unknown");
    expect(JSON.stringify(clean)).not.toContain(token);
    expect(JSON.stringify(clean)).not.toContain(replacement);
    expect(useMachines.getState()).toMatchObject({
      hydrated: true,
      storageError: null,
      activeId: machine.id,
      selectedProjectId: "project-a",
      language: "tr",
    });
    expect(secrets.getItemAsync).not.toHaveBeenCalled();
    expect(secrets.setItemAsync).not.toHaveBeenCalled();
    expect(secrets.deleteItemAsync).not.toHaveBeenCalled();
  });
  it("keeps access and new connection mutations closed while a metadata scrub is pending", async () => {
    storage.getItem.mockResolvedValueOnce(JSON.stringify({ machines: [{ ...machine, token }] }));
    let finish!: () => void;
    storage.setItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const loading = useMachines.getState().hydrate();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(useMachines.getState().hydrated).toBe(false);
    await expect(credentials.get(machine.id, machine)).rejects.toThrow("unavailable");
    await expect(
      useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token),
    ).rejects.toThrow("unavailable");
    expect(secrets.getItemAsync).not.toHaveBeenCalled();
    finish();
    await loading;
    expect(useMachines.getState()).toMatchObject({
      hydrated: true,
      storageError: null,
      activeId: machine.id,
    });
  });
  it("fails closed when scrubbing cannot save and retries without losing valid selections", async () => {
    let persisted = JSON.stringify({
      machines: [{ ...machine, token }],
      activeId: machine.id,
      projects: { [machine.id]: "project-a" },
      language: "en",
    });
    storage.getItem.mockImplementation(async () => persisted);
    storage.setItem.mockImplementation(async (_key, value) => {
      persisted = value;
    });
    storage.setItem.mockRejectedValueOnce(new Error("Unavailable"));
    await useMachines.getState().hydrate();
    expect(useMachines.getState().storageError).toBeTruthy();
    expect(persisted).toContain(token);
    await expect(credentials.get(machine.id, machine)).rejects.toThrow("unavailable");
    await useMachines.getState().hydrate();
    expect(useMachines.getState()).toMatchObject({
      storageError: null,
      activeId: machine.id,
      selectedProjectId: "project-a",
      language: "en",
    });
    expect(persisted).not.toContain(token);
    expect(JSON.parse(persisted).machines[0].environmentId).toBe(machine.environmentId);
  });
  it("does not rewrite metadata already saved through the canonical schema", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    const persisted = String(storage.setItem.mock.calls.at(-1)?.[1]);
    storage.getItem.mockResolvedValueOnce(persisted);
    storage.setItem.mockClear();
    await useMachines.getState().hydrate();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(useMachines.getState().machines[0].id).toBe(machine.id);
  });
  it("deduplicates concurrent hydration and its scrub write", async () => {
    storage.getItem.mockResolvedValueOnce(JSON.stringify({ machines: [{ ...machine, token }] }));
    await Promise.all([useMachines.getState().hydrate(), useMachines.getState().hydrate()]);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(useMachines.getState().machines[0]).not.toHaveProperty("token");
  });
  it.each(["save", "remove"] as const)(
    "waits for an earlier %s mutation before reading and scrubbing metadata",
    async (operation) => {
      let persisted: string | null = null;
      storage.getItem.mockImplementation(async () => persisted);
      storage.setItem.mockImplementation(async (_key, value) => {
        persisted = value;
      });
      await useMachines.getState().hydrate();
      await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
      let finish!: () => void;
      storage.setItem.mockImplementationOnce(
        (_key, value) =>
          new Promise<void>((resolve) => {
            finish = () => {
              persisted = value;
              resolve();
            };
          }),
      );
      const mutation =
        operation === "save"
          ? useMachines
              .getState()
              .saveMachine({ ...machine, name: "Updated", providers: ["gemini"] }, token)
          : useMachines.getState().removeMachine(machine.id);
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      storage.getItem.mockClear();
      const loading = useMachines.getState().hydrate();
      expect(storage.getItem).not.toHaveBeenCalled();
      finish();
      await Promise.all([mutation, loading]);
      expect(storage.getItem).toHaveBeenCalledTimes(1);
      expect(useMachines.getState().storageError).toBeNull();
      expect(useMachines.getState().machines.map((value) => value.name)).toEqual(
        operation === "save" ? ["Updated"] : [],
      );
    },
  );
  it("saves credential separately and remembers project independently per machine", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    useMachines.getState().selectProject("project-a");
    await useMachines
      .getState()
      .saveMachine(
        { ...machine, id: "computer-b", environmentId: "env-b", providers: ["claude"] },
        replacement,
      );
    useMachines.getState().selectProject("project-b");
    useMachines.getState().selectMachine("computer-a");
    expect(useMachines.getState().selectedProjectId).toBe("project-a");
    expect(secrets.setItemAsync).toHaveBeenCalledWith("bycoda.remote.computer-a", token, {
      keychainAccessible: "device-only",
    });
    expect(
      storage.setItem.mock.calls.every(
        ([, value]) => !String(value).includes(token) && !String(value).includes(replacement),
      ),
    ).toBe(true);
  });
  it("restores prior credential and selected machine if metadata cannot save", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    secrets.getItemAsync.mockResolvedValue(token);
    storage.setItem.mockRejectedValueOnce(new Error("Full disk"));
    await expect(
      useMachines
        .getState()
        .saveMachine({ ...machine, name: "Renamed", providers: ["gemini"] }, replacement),
    ).rejects.toThrow("could not be saved");
    expect(useMachines.getState().machines[0].name).toBe("Work");
    expect(secrets.setItemAsync).toHaveBeenLastCalledWith("bycoda.remote.computer-a", token, {
      keychainAccessible: "device-only",
    });
  });
  it("whitelists metadata before saving and keeps legacy credentials out of Zustand", async () => {
    await useMachines.getState().hydrate();
    const imported = {
      ...machine,
      providers: ["gemini"] as ["gemini"],
      token,
      password: replacement,
    };
    await useMachines.getState().saveMachine(imported, token);
    expect(useMachines.getState().machines[0]).not.toHaveProperty("token");
    expect(useConnectionStore.getState().tokens).toEqual({});
    expect(useConnectionStore.getState().machines[0].providers).toEqual(["gemini"]);
    expect(String(storage.setItem.mock.calls[0][1])).not.toContain(token);
    expect(String(storage.setItem.mock.calls[0][1])).not.toContain(replacement);
  });
  it("rejects insecure imports, invalid tokens and reassignment of a saved computer identity", async () => {
    await useMachines.getState().hydrate();
    await expect(
      useMachines
        .getState()
        .saveMachine(
          { ...machine, endpoint: "http://remote.example", providers: ["gemini"] },
          token,
        ),
    ).rejects.toThrow("Invalid");
    await expect(
      useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, "invalid"),
    ).rejects.toThrow("credential");
    expect(secrets.setItemAsync).not.toHaveBeenCalled();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    await expect(
      useMachines
        .getState()
        .saveMachine(
          { ...machine, environmentId: "different", providers: ["gemini"] },
          replacement,
        ),
    ).rejects.toThrow("another computer");
    expect(useMachines.getState().machines[0].environmentId).toBe("env-a");
    expect(secrets.setItemAsync).toHaveBeenCalledTimes(1);
  });
  it("keeps removal retryable when the keychain fails and restores its key on metadata failure", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    secrets.getItemAsync.mockResolvedValue(token);
    secrets.deleteItemAsync.mockRejectedValueOnce(new Error(`native error ${token}`));
    await expect(useMachines.getState().removeMachine(machine.id)).rejects.toThrow(
      "kept for retry",
    );
    expect(useMachines.getState().machines).toHaveLength(1);
    storage.setItem.mockRejectedValueOnce(new Error("Disk full"));
    await expect(useMachines.getState().removeMachine(machine.id)).rejects.toThrow(
      "could not be removed",
    );
    expect(useMachines.getState().machines).toHaveLength(1);
    expect(secrets.setItemAsync).toHaveBeenLastCalledWith("bycoda.remote.computer-a", token, {
      keychainAccessible: "device-only",
    });
  });
  it("serializes connection mutations so one failed rollback cannot erase a later computer", async () => {
    await useMachines.getState().hydrate();
    storage.setItem.mockRejectedValueOnce(new Error("One write failed"));
    const first = useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    const second = useMachines
      .getState()
      .saveMachine(
        { ...machine, id: "computer-b", environmentId: "env-b", providers: ["claude"] },
        replacement,
      );
    const results = await Promise.allSettled([first, second]);
    expect(results.map((value) => value.status)).toEqual(["rejected", "fulfilled"]);
    expect(useMachines.getState().machines.map((value) => value.id)).toEqual(["computer-b"]);
    expect(useMachines.getState().connectionPending).toBe(false);
  });
  it("does not hand a credential to a removed or stale endpoint transport", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    secrets.getItemAsync.mockResolvedValue(token);
    expect(await credentials.get(machine.id, machine)).toBe(token);
    secrets.getItemAsync.mockClear();
    expect(
      await credentials.get(machine.id, { ...machine, endpoint: "https://old.example" }),
    ).toBeNull();
    expect(secrets.getItemAsync).not.toHaveBeenCalled();
    await useMachines.getState().removeMachine(machine.id);
    secrets.getItemAsync.mockClear();
    expect(await credentials.get(machine.id, machine)).toBeNull();
    expect(secrets.getItemAsync).not.toHaveBeenCalled();
  });
  it("checks the app lock again after an asynchronous keychain read", async () => {
    await useMachines.getState().hydrate();
    await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
    secrets.getItemAsync.mockResolvedValue(token);
    access.assertAppAccess
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("App is locked.");
      });
    await expect(credentials.get(machine.id, machine)).rejects.toThrow("locked");
  });
  it.each([
    { hydrated: false, storageError: null },
    { hydrated: true, storageError: "Connection storage failed." },
  ])(
    "does not return a key after storage becomes unavailable during its native read: %j",
    async (latest) => {
      await useMachines.getState().hydrate();
      await useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token);
      let finish!: (value: string) => void;
      secrets.getItemAsync.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
      const reading = credentials.get(machine.id, machine);
      useMachines.setState(latest);
      finish(token);
      await expect(reading).rejects.toThrow("connections are unavailable");
    },
  );
  it("fails closed on malformed stored metadata instead of replacing it with an empty list", async () => {
    storage.getItem.mockResolvedValueOnce('{"machines":"broken"}');
    await useMachines.getState().hydrate();
    expect(useMachines.getState().storageError).toBeTruthy();
    await expect(
      useMachines.getState().saveMachine({ ...machine, providers: ["gemini"] }, token),
    ).rejects.toThrow("unavailable");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

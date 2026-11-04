import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
import { CHAT_APPEARANCE_STORAGE_KEY, createChatAppearanceStore } from "./chat-appearance";
import { ChatAppearanceStorageError } from "./chat-appearance-model";

function storage() {
  return {
    getItem: vi.fn(async (_key: string): Promise<string | null> => null),
    setItem: vi.fn(async (_key: string, _value: string) => {}),
  };
}

describe("local chat appearance persistence", () => {
  it("deduplicates hydration and restores the saved preference", async () => {
    const adapter = storage();
    adapter.getItem.mockResolvedValueOnce('{"version":1,"textSize":"large"}');
    const store = createChatAppearanceStore(adapter);
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    expect(adapter.getItem).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      textSize: "large",
      hydrated: true,
      storageError: null,
    });
  });

  it("does not overwrite a size chosen while older storage is being read", async () => {
    const adapter = storage();
    let resolveRead!: (value: string) => void;
    adapter.getItem.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const store = createChatAppearanceStore(adapter);
    const loading = store.getState().hydrate();
    const saving = store.getState().setTextSize("large");
    resolveRead('{"version":1,"textSize":"standard"}');
    await Promise.all([loading, saving]);
    expect(store.getState().textSize).toBe("large");
    expect(adapter.setItem).toHaveBeenLastCalledWith(
      CHAT_APPEARANCE_STORAGE_KEY,
      '{"version":1,"textSize":"large"}',
    );
  });

  it("keeps the local selected size and a visible error when persistence fails", async () => {
    const adapter = storage();
    adapter.setItem.mockRejectedValueOnce(new Error("Storage unavailable"));
    const store = createChatAppearanceStore(adapter);
    await store.getState().hydrate();
    await store.getState().setTextSize("standard");
    expect(store.getState().textSize).toBe("standard");
    expect(store.getState().storageError?.message).toBe("Chat appearance could not be saved.");
    await store.getState().setTextSize("large");
    expect(store.getState().storageError).toBeNull();
  });

  it("writes rapid changes in order so the latest selection survives restart", async () => {
    const adapter = storage();
    let releaseWrite!: () => void;
    let firstWriteStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    adapter.setItem.mockImplementationOnce(async () => {
      firstWriteStarted();
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
    });
    const store = createChatAppearanceStore(adapter);
    await store.getState().hydrate();
    const first = store.getState().setTextSize("standard");
    const second = store.getState().setTextSize("large");
    await started;
    expect(adapter.setItem).toHaveBeenCalledTimes(1);
    releaseWrite();
    await Promise.all([first, second]);
    expect(adapter.setItem.mock.calls.map((call) => JSON.parse(call[1]).textSize)).toEqual([
      "standard",
      "large",
    ]);
    expect(store.getState().textSize).toBe("large");
  });

  it("finishes hydration with a usable default if reading storage fails", async () => {
    const adapter = storage();
    adapter.getItem.mockRejectedValueOnce(new Error("Storage unavailable"));
    const store = createChatAppearanceStore(adapter);
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ hydrated: true, textSize: "standard" });
    expect(store.getState().storageError).toBeInstanceOf(Error);
  });

  it("explicitly retries a failed read once without writing a default preference", async () => {
    const adapter = storage();
    adapter.getItem.mockRejectedValueOnce(new Error("read failed"));
    const store = createChatAppearanceStore(adapter);
    await store.getState().hydrate();
    const error = store.getState().storageError!;
    expect(error).toBeInstanceOf(ChatAppearanceStorageError);
    expect((error as ChatAppearanceStorageError).operation).toBe("read");
    await store.getState().hydrate();
    expect(adapter.getItem).toHaveBeenCalledTimes(1);
    let release!: (value:string) => void;
    adapter.getItem.mockReturnValueOnce(new Promise(resolve => { release=resolve; }));
    const first=store.getState().retryStorage(error), second=store.getState().retryStorage(error);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(adapter.getItem).toHaveBeenCalledTimes(2);
    release('{"version":1,"textSize":"large"}');
    await first;
    expect(store.getState()).toMatchObject({textSize:"large",hydrated:true,storageError:null});
    expect(adapter.setItem).not.toHaveBeenCalled();
    await store.getState().retryStorage(error);
    expect(adapter.getItem).toHaveBeenCalledTimes(2);
  });

  it("does not let a delayed read retry overwrite a newer explicit choice", async () => {
    const adapter=storage();adapter.getItem.mockRejectedValueOnce(new Error("read failed"));
    const store=createChatAppearanceStore(adapter);await store.getState().hydrate();
    let release!: (value:string)=>void;
    adapter.getItem.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
    const retry=store.getState().retryStorage(store.getState().storageError!);
    await Promise.resolve();await store.getState().setTextSize("compact");
    release('{"version":1,"textSize":"large"}');await retry;
    expect(store.getState()).toMatchObject({textSize:"compact",storageError:null});
    expect(adapter.setItem).toHaveBeenCalledExactlyOnceWith(CHAT_APPEARANCE_STORAGE_KEY,'{"version":1,"textSize":"compact"}');
  });

  it("keeps a newer save failure when an older read retry also fails", async () => {
    const adapter=storage();adapter.getItem.mockRejectedValueOnce(new Error("read failed"));
    const store=createChatAppearanceStore(adapter);await store.getState().hydrate();
    let reject!: (error:Error)=>void;
    adapter.getItem.mockReturnValueOnce(new Promise((_resolve,fail)=>{reject=fail;}));
    const retry=store.getState().retryStorage(store.getState().storageError!);
    await Promise.resolve();adapter.setItem.mockRejectedValueOnce(new Error("write failed"));
    await store.getState().setTextSize("large");const error=store.getState().storageError;
    reject(new Error("late read failed"));await retry;
    expect(store.getState().storageError).toBe(error);
    expect((error as ChatAppearanceStorageError).operation).toBe("save");
    expect(store.getState().textSize).toBe("large");
  });

  it("retries only the failed saved choice and rejects a retired error callback", async () => {
    const adapter=storage(),store=createChatAppearanceStore(adapter);await store.getState().hydrate();
    adapter.setItem.mockRejectedValueOnce(new Error("write failed"));
    await store.getState().setTextSize("large");const error=store.getState().storageError!;
    expect((error as ChatAppearanceStorageError).operation).toBe("save");
    await Promise.all([store.getState().retryStorage(error),store.getState().retryStorage(error)]);
    expect(adapter.setItem.mock.calls.map(call=>JSON.parse(call[1]).textSize)).toEqual(["large","large"]);
    expect(store.getState().storageError).toBeNull();
    await store.getState().setTextSize("compact");await store.getState().retryStorage(error);
    expect(adapter.setItem).toHaveBeenCalledTimes(3);
    expect(store.getState().textSize).toBe("compact");
    expect(adapter.getItem).toHaveBeenCalledTimes(1);
  });
});

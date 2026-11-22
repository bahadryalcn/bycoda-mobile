import { describe, expect, it, vi } from "vitest";
import { createConnectionFeedbackStore } from "./connection-feedback-store";

describe("connection feedback store", () => {
  it("keeps the message in the topmost section even when a lower section fails first", () => {
    const store = createConnectionFeedbackStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.claim("work-caps", 2);
    expect(store.owner()).toBe("work-caps");
    store.claim("host-settings", 1);
    expect(store.owner()).toBe("host-settings");
    store.claim("host-settings", 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("hands the message to the next section when the owner recovers", () => {
    const store = createConnectionFeedbackStore();
    store.claim("a", 1);
    store.claim("b", 2);
    store.release("b");
    expect(store.owner()).toBe("a");
    store.release("a");
    expect(store.owner()).toBeUndefined();
  });

  it("retries each affected pane once and lets either recover independently", async () => {
    const store = createConnectionFeedbackStore();
    const list = vi.fn().mockResolvedValue(undefined);
    const detail = vi.fn().mockRejectedValue(new Error("Still disconnected"));
    const dismissed = vi.fn();
    store.claim("list", 1, list);
    store.claim("detail", 2, detail);
    store.claim("dismissed", 3, dismissed);
    store.release("dismissed");

    await Promise.all([store.retry(), store.retry()]);

    expect(list).toHaveBeenCalledOnce();
    expect(detail).toHaveBeenCalledOnce();
    expect(dismissed).not.toHaveBeenCalled();
    store.release("list");
    expect(store.owner()).toBe("detail");
    await store.retry();
    expect(list).toHaveBeenCalledOnce();
    expect(detail).toHaveBeenCalledTimes(2);
  });
});

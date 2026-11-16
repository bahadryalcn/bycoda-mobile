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
});

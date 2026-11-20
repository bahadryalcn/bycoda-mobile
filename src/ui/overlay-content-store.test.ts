import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createOverlayContentStore } from "./overlay-content-store";

describe("overlay content store", () => {
  it("notifies only the subscriber of the overlay whose content changed", () => {
    const store = createOverlayContentStore();
    const first = vi.fn();
    const second = vi.fn();
    store.set("a", "one");
    store.set("b", "two");
    store.subscribe("a", first);
    store.subscribe("b", second);

    store.set("a", "one, edited");

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(store.get("a")).toBe("one, edited");
  });

  it("does not notify when the same element is published again", () => {
    const store = createOverlayContentStore();
    const element = createElement("p", null, "stable");
    store.set("a", element);
    const listener = vi.fn();
    store.subscribe("a", listener);

    store.set("a", element);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe and forgets content on delete", () => {
    const store = createOverlayContentStore();
    store.set("a", "kept");
    const listener = vi.fn();
    const unsubscribe = store.subscribe("a", listener);

    unsubscribe();
    store.set("a", "next");
    expect(listener).not.toHaveBeenCalled();

    store.delete("a");
    expect(store.get("a")).toBeNull();
  });
});

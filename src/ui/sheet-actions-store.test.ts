import { describe, expect, it, vi } from "vitest";
import { createSheetActionsStore } from "./sheet-actions-store";

describe("Sheet action ownership", () => {
  it("updates and clears operation feedback with the current editor state", () => {
    const store = createSheetActionsStore();
    const onSubmit = vi.fn();
    store.set("editor", { submitLabel: "Save", onSubmit, feedback: "Connection failed" });
    expect(store.getSnapshot()[0][1].feedback).toBe("Connection failed");
    store.set("editor", { submitLabel: "Save", onSubmit, busy: true });
    expect(store.getSnapshot()[0][1].feedback).toBeUndefined();
    expect(store.getSnapshot()[0][1].busy).toBe(true);
  });
  it("keeps the latest draft callback and pending state without reordering actions", () => {
    const store = createSheetActionsStore();
    const oldSubmit = vi.fn();
    const submit = vi.fn();
    store.set("editor", { submitLabel: "Save", onSubmit: oldSubmit });
    store.set("secondary", { submitLabel: "Other", onSubmit: vi.fn() });
    store.set("editor", { submitLabel: "Save", onSubmit: submit, busy: true });
    expect(store.getSnapshot().map(([id]) => id)).toEqual(["editor", "secondary"]);
    const actions = store.getSnapshot()[0][1];
    expect(actions.busy).toBe(true);
    actions.onSubmit();
    expect(submit).toHaveBeenCalledOnce();
    expect(oldSubmit).not.toHaveBeenCalled();
  });

  it("removes closed editor actions without leaking across nested sheets", () => {
    const first = createSheetActionsStore();
    const nested = createSheetActionsStore();
    const listener = vi.fn();
    const unsubscribe = first.subscribe(listener);
    const actions = { submitLabel: "Save", onSubmit: vi.fn() };
    first.set("editor", actions);
    nested.set("confirmation", actions);
    first.remove("editor");
    expect(first.getSnapshot()).toEqual([]);
    expect(nested.getSnapshot()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    first.set("next", actions);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

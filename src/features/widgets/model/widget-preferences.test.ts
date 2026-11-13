import { afterEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
import { useWidgetPreferences, WIDGET_PREFERENCES_KEY } from "./widget-preferences";

afterEach(() => {
  useWidgetPreferences.setState({ showTitles: false, hydrated: false, pending: null, storageError: null });
  storage.getItem.mockReset(); storage.setItem.mockReset();
});
it("retains unread privacy protection and never overwrites unread storage", async () => {
  storage.getItem.mockRejectedValue(new Error("Storage offline"));
  await useWidgetPreferences.getState().hydrate();
  expect(useWidgetPreferences.getState()).toMatchObject({ hydrated: false, showTitles: false, pending: null, storageError: { operation: "read" } });
  await useWidgetPreferences.getState().setShowTitles(true);
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.getItem.mockResolvedValue('{"showTitles":true}');
  await useWidgetPreferences.getState().retryStorage(useWidgetPreferences.getState().storageError!);
  expect(useWidgetPreferences.getState()).toMatchObject({ hydrated: true, showTitles: true, storageError: null });
});
it("keeps a failed save choice in memory and retries that exact current choice", async () => {
  storage.getItem.mockResolvedValue('{"showTitles":true}'); await useWidgetPreferences.getState().hydrate();
  storage.setItem.mockRejectedValue(new Error("Storage full"));
  await useWidgetPreferences.getState().setShowTitles(false);
  const error = useWidgetPreferences.getState().storageError!;
  expect(useWidgetPreferences.getState()).toMatchObject({ hydrated: true, showTitles: false, pending: null, storageError: { operation: "save" } });
  storage.setItem.mockResolvedValue(undefined);
  await useWidgetPreferences.getState().retryStorage(error);
  expect(storage.setItem).toHaveBeenLastCalledWith(WIDGET_PREFERENCES_KEY, '{"showTitles":false}');
  expect(useWidgetPreferences.getState().storageError).toBeNull();
  await useWidgetPreferences.getState().retryStorage(error);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});
it("coalesces hydration and ignores duplicate writes while persistence is pending", async () => {
  let finishRead!: (raw: string | null) => void;
  storage.getItem.mockReturnValue(new Promise<string | null>(resolve => { finishRead = resolve; }));
  const first = useWidgetPreferences.getState().hydrate(), second = useWidgetPreferences.getState().hydrate();
  expect(useWidgetPreferences.getState().pending).toBe("read");
  await Promise.resolve(); finishRead(null); await Promise.all([first, second]);
  expect(storage.getItem).toHaveBeenCalledOnce();
  let finishWrite!: () => void;
  storage.setItem.mockReturnValue(new Promise<void>(resolve => { finishWrite = resolve; }));
  const write = useWidgetPreferences.getState().setShowTitles(true);
  expect(useWidgetPreferences.getState().pending).toBe("save");
  await useWidgetPreferences.getState().setShowTitles(false);
  expect(storage.setItem).toHaveBeenCalledOnce(); finishWrite(); await write;
  expect(useWidgetPreferences.getState()).toMatchObject({ showTitles: true, pending: null });
});
it.each(["{", '{"showTitles":"yes"}'])("surfaces malformed preference %s without overwriting its bytes", async raw => {
  storage.getItem.mockResolvedValue(raw); await useWidgetPreferences.getState().hydrate();
  expect(useWidgetPreferences.getState()).toMatchObject({ hydrated: false, showTitles: false, storageError: { operation: "read" } });
  expect(storage.setItem).not.toHaveBeenCalled();
});

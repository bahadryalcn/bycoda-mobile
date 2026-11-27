// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ rename: vi.fn(), revoke: vi.fn(), confirm: vi.fn(), sheet: null as null | { dirty?: boolean; dismissible?: boolean; onClose(): void }, form: null as null | { dirty?: boolean; busy?: boolean } }));
const items = [{ id: "desktop", name: "Work computer", platform: "windows", osVersion: "11", appVersion: "1.0", channel: "stable", kind: "desktop", createdAt: "2026-11-13T00:00:00Z", lastSeenAt: "2026-11-13T00:00:00Z", revokedAt: null }];
vi.mock("./use-graced-read-error", () => ({ useGracedReadError: (query: { error: unknown }) => query.error ?? null }));
vi.mock("./account-context", () => ({ useAccount: () => ({ runtime: { client: { listDevices: async () => ({ items }), renameDevice: fixture.rename, revokeDevice: fixture.revoke } }, status: "signedIn", device: { id: "phone" } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: fixture.confirm }));
vi.mock("lucide-react-native/icons/globe", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  return { Body: Group, Badge: () => null, Skeleton: () => null, Section: Group, Stack: Group, NavigationGroup: Group, Button, NavigationRow: Button, SettingIcon: () => null,
    Field: ({ label, value, onChangeText, editable }: { label: string; value: string; editable?: boolean; onChangeText: (value: string) => void }) => createElement("label", null, label, createElement("input", { "aria-label": label, value, disabled: editable === false, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) })),
    ErrorNotice: ({ error }: { error: Error | null }) => error ? createElement("p", null, error.message) : null,
    Sheet: (props: PropsWithChildren<{ dirty?: boolean; dismissible?: boolean; onClose(): void }>) => { fixture.sheet = props; return createElement("aside", null, props.children); },
    FormActions: (props: { dirty?: boolean; busy?: boolean; disabled?: boolean; submitLabel: string; onSubmit(): void; onCancel(): void }) => { fixture.form = props; return createElement("div", null, createElement(Button, { label: props.submitLabel, onPress: props.onSubmit, disabled: props.disabled, busy: props.busy }), createElement(Button, { label: "Cancel", onPress: props.onCancel, disabled: props.busy })); },
  };
});
import { DevicesSection } from "./DevicesSection";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, client: QueryClient;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); fixture.sheet = null; fixture.form = null; client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
const click = (text: string) => act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!.click());
const flush = () => act(async () => { await new Promise((done) => setTimeout(done, 0)); });
async function open() { await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(DevicesSection)))); await flush(); await click("Work computer"); }
const edit = (value: string) => act(() => { const input = container.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
it("registers dirty rename with shared Sheet and action guard", async () => {
  await open(); await edit("New computer name"); expect(fixture.sheet?.dirty).toBe(true); expect(fixture.form?.dirty).toBe(true);
  expect(container.querySelector("label")?.textContent).toBe("Device name");
  await click("Cancel"); expect(fixture.confirm).toHaveBeenCalled(); expect(container.querySelector("aside")).not.toBeNull();
});
it("blocks closing and conflicting actions until rename settles", async () => {
  const response = deferred<unknown>(); fixture.rename.mockReturnValue(response.promise); await open(); await edit("New computer name"); await click("Save"); await flush();
  expect(fixture.sheet?.dismissible).toBe(false); expect(container.querySelector("input")?.disabled).toBe(true);
  expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Sign out this device")?.disabled).toBe(true);
  await act(() => fixture.sheet!.onClose()); expect(container.querySelector("aside")).not.toBeNull();
  await act(async () => response.resolve({})); await flush(); expect(container.querySelector("aside")).toBeNull(); expect(fixture.rename).toHaveBeenCalledOnce();
});
it("keeps name after rename fails and does not revoke the device", async () => {
  fixture.rename.mockRejectedValue(new Error("Offline")); await open(); await edit("Keep my name"); await click("Save"); await flush();
  expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("Keep my name"); expect(container.textContent).toContain("Offline"); expect(fixture.revoke).not.toHaveBeenCalled();
});

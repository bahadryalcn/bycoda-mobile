// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ start: vi.fn(), refetch: vi.fn(), loading: false }));
const computer = { deviceId: "computer-a", environmentId: "env-a", name: "Work computer", platform: "windows", lastSeenAt: "2020-01-01T00:00:00Z", routes: [] };
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => false }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/network", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wifi", () => ({ default: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "gray" } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: (selector: (state: unknown) => unknown) => selector({ machines: [{ id: "saved-a", environmentId: "env-a" }] }) }));
vi.mock("./account-computers", async (original) => ({ ...await original<typeof import("./account-computers")>(), useAccountComputers: () => ({ state: fixture.loading ? { kind: "loading" } : { kind: "ready", computers: [computer] }, refetch: fixture.refetch }) }));
vi.mock("./use-account-pairing", () => ({ useAccountPairing: () => ({ state: { phase: "idle" }, start: fixture.start }) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Heading: Group, Section: Group, SectionHeader: Group, NavigationGroup: Group, Stack: Group,
    ErrorNotice: () => null, FormActions: () => null, Loading: () => null, Sheet: Group, StateView: () => null, Skeleton: () => null,
    Badge: ({ label, tone }: { label: string; tone?: string }) => createElement("span", { "data-tone": tone }, label),
    NavigationRow: ({ label, detail, trailing, onPress }: { label: string; detail: string; trailing: React.ReactNode; onPress(): void }) => createElement("button", { onClick: onPress }, label, detail, trailing) };
});
import { AccountComputersSection } from "./account-computers-section";
it("separates an offline computer's saved pairing from live connection status", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AccountComputersSection)));
    expect(container.textContent).toContain("Offline"); expect(container.textContent).toContain("Paired"); expect(container.textContent).not.toContain("Connected");
    expect(container.querySelector('[data-tone="success"]')).toBeNull();
    await act(async () => container.querySelector("button")!.click()); expect(fixture.start).toHaveBeenCalledExactlyOnceWith(computer);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("keeps the connect actions in place while the account's computers load", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  fixture.loading = true;
  try {
    await act(async () => root.render(createElement(AccountComputersSection, { others: createElement("p", null, "Scan QR code") })));
    expect(container.textContent).toBe("Scan QR code");
  } finally { fixture.loading = false; await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

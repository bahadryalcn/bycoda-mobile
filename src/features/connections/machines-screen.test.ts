import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/tokens", () => ({ colors: {}, metrics: {}, space: {} }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/brand", () => ({ LegalLinks: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("expo-router", () => ({ router: {}, Stack: { Screen: () => null } }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => true }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) },
}));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/state/security", () => ({ assertAppAccess: vi.fn() }));
vi.mock("../workspace/draft-guard", () => ({ flushWorkspaceDrafts: vi.fn() }));
vi.mock("./recovery", () => ({ reloadSavedConnections: vi.fn(), selectSavedComputer: vi.fn() }));
vi.mock("./pairing-entry", () => ({ PairingEntry: () => null }));
vi.mock("./pairing-scanner", () => ({ PairingScanner: () => null }));
vi.mock("./use-computer-connection", () => ({
  useComputerConnection: () => ({
    form: { values: { target: null }, dirty: false },
    entry: { kind: "choices" },
    operation: {},
    busy: false,
  }),
}));
vi.mock("@/state/machines", () => ({
  useMachines: () => ({
    hydrated: true,
    storageError: null,
    activeId: "first",
    machines: [
      { id: "first", name: "First computer", endpoint: "https://first.invalid" },
      { id: "second", name: "Second computer", endpoint: "https://second.invalid" },
    ],
  }),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrapper,
    Disclosure: Wrapper,
    NavigationGroup: Wrapper,
    Screen: Wrapper,
    ErrorNotice: () => null,
    Loading: () => null,
    MutationState: () => null,
    IconButton: () => null,
    Button: () => null,
    Sheet: () => null,
    NavigationRow: ({ label, selected }: { label: string; selected?: boolean }) =>
      createElement("button", { "aria-pressed": selected }, label),
  };
});
import { MachinesScreen } from "./machines-screen";

it("passes exclusive current-computer selection to the shared accessible row without claiming a live connection", () => {
  const html = renderToStaticMarkup(createElement(MachinesScreen));
  expect(html).toContain('aria-pressed="true">First computer');
  expect(html).toContain('aria-pressed="false">Second computer');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).not.toContain("Connected");
});

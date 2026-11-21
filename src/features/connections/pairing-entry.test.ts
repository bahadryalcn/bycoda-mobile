import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { PairingEntryProps } from "./connection-types";

vi.mock("react-native", () => ({ View: "View" }));
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" } }));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
vi.mock("lucide-react-native/icons/qr-code", () => ({ default: "QrCode" }));
vi.mock("lucide-react-native/icons/clipboard-paste", () => ({ default: "ClipboardPaste" }));
vi.mock("lucide-react-native/icons/pencil-line", () => ({ default: "PencilLine" }));
vi.mock("lucide-react-native/icons/wifi", () => ({ default: "Wifi" }));
vi.mock("lucide-react-native/icons/network", () => ({ default: "Network" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: "IconTile" }));
vi.mock("@/ui/info-hint", () => ({ HintLabel: "HintLabel" }));
vi.mock("@/ui/primitives", () => ({ Body: "Body", Button: "Button", Heading: "Heading", NavigationGroup: "NavigationGroup", NavigationRow: "NavigationRow", Row: "Row", Stack: "Stack" }));
vi.mock("./manual-connection-form", () => ({ ManualConnectionForm: "ManualConnectionForm" }));
vi.mock("./pairing-preview", () => ({ PairingPreview: "PairingPreview" }));
vi.mock("./pairing-paste", () => ({ PairingPaste: "PairingPaste" }));
import { PairingEntry } from "./pairing-entry";

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

it("opens QR scanning directly without asking users to choose a network first", () => {
  const begin = vi.fn();
  const controller = { entry: { kind: "choices" }, busy: false, begin } as unknown as PairingEntryProps["controller"];
  const nodes = elements(PairingEntry({ controller, disabled: false }));
  const scan = nodes.find(node => node.type === "Button" && node.props.label === "Scan QR code");
  expect(scan).toBeDefined();
  scan!.props.onPress();
  expect(begin).toHaveBeenCalledWith("scan");
  const paste = nodes.find(node => node.props.label === "Paste pairing code");
  expect(paste).toBeDefined();
  paste!.props.onPress();
  expect(begin).toHaveBeenCalledWith("paste");
});

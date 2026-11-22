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
vi.mock("@/ui/primitives", () => ({ Body: "Body", Button: "Button", Heading: "Heading", FormActions: "FormActions", Notice: "Notice", NavigationGroup: "NavigationGroup", NavigationRow: "NavigationRow", Row: "Row", Stack: "Stack" }));
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

it("offers a new code instead of submitting a rejected ticket again", () => {
  const begin = vi.fn();
  const cancel = vi.fn();
  const connect = vi.fn();
  const message = "This code is no longer available. Create a new code on your computer.";
  const controller = { entry: { kind: "rejected-code", message }, busy: false, begin, cancel, connect } as unknown as PairingEntryProps["controller"];
  const nodes = elements(PairingEntry({ controller, disabled: false }));
  expect(nodes.find(node => node.type === "Notice")?.props.message).toBe(message);
  const actions = nodes.find(node => node.type === "FormActions")!;
  expect(actions.props.submitLabel).toBe("Use a new code");
  expect(actions.props.onCancel).toBe(cancel);
  actions.props.onSubmit();
  expect(begin).toHaveBeenCalledExactlyOnceWith("choices");
  expect(connect).not.toHaveBeenCalled();
});

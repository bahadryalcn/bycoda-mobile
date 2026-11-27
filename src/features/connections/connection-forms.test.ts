import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/duotone-icon", () => ({ Laptop: "Laptop" }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: "IconTile" }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/tokens", () => ({ space: {}, gapIcon: 8, iconSize: {} }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: "Laptop" }));
vi.mock("@/ui/primitives", () => ({
  Body: "Body", ErrorNotice: "ErrorNotice", FormActions: "FormActions", Disclosure: "Disclosure",
  Field: "Field", IdentifierField: "IdentifierField", Stack: "Stack", Heading: "Heading", Row: "Row", RowIcon: "RowIcon", StatusText: "StatusText",
}));
import { ManualConnectionForm } from "./manual-connection-form";
import { ConnectionFeedback } from "./connection-feedback";
import { PairingPreview } from "./pairing-preview";
import type { ConnectionOperation, ManualConnectionFormProps } from "./connection-types";

function find(node: ReactNode, type: unknown): ReactElement<Record<string, any>> | undefined {
  if (!isValidElement<Record<string, any>>(node)) return undefined;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const match = find(child, type);
    if (match) return match;
  }
}

it("offers one retry on a temporary preview failure", () => {
  const connect = vi.fn(async () => undefined);
  const operation = { isError: true, error: new Error("The computer could not be reached.") } as ConnectionOperation;
  const form = find(PairingPreview({
    code: { name: "Test computer", endpoint: "https://qa.invalid" } as Parameters<typeof PairingPreview>[0]["code"],
    operation, disabled: false, busy: false, onConnect: connect, onCancel: vi.fn(),
  }), "FormActions")!;
  expect(form.props.submitLabel).toBe("Retry");
  expect(form.props.feedback.props.onRetry).toBeUndefined();
  form.props.onSubmit();
  expect(connect).toHaveBeenCalledOnce();
});

it("keeps connection feedback with the guarded action, without submitting or cancelling on render", () => {
  const connect = vi.fn(), cancel = vi.fn(), operation = { error: new Error("Connection refused") };
  const controller = {
    form: { values: { endpoint: "https://synthetic.invalid", token: "synthetic", name: "", target: null } },
    busy: false, connectionMode: "tailscale", operation, connect, cancel,
  } as unknown as ManualConnectionFormProps["controller"];
  const footer = () => find(ManualConnectionForm({ controller, disabled: false }), "FormActions")!;
  const actions = footer();
  expect(actions.props.feedback.type).toBe("ErrorNotice");
  expect(actions.props.feedback.props.error).toBe(operation.error);
  expect(actions.props.feedback.props.onRetry).toBeUndefined();
  expect(actions.props.disabled).toBe(false);
  expect(connect).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  actions.props.onSubmit();
  expect(connect).toHaveBeenCalledOnce();
  expect(actions.props.onCancel).toBe(cancel);
  controller.form.values.token = " ";
  expect(footer().props.disabled).toBe(true);
  controller.connectionMode = "lan";
  controller.form.values.target = { kind: "existing", id: "synthetic" };
  expect(footer().props.disabled).toBe(false);
  expect(footer().props.submitLabel).toBe("Save connection");
  controller.busy = true;
  expect(footer().props.cancelDisabled).toBe(true);
  expect(footer().props.feedback.type).toBe(ConnectionFeedback);
});

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/ui/primitives", () => ({
  Body: "Body", FormActions: "FormActions", Disclosure: "Disclosure",
  Field: "Field", IdentifierField: "IdentifierField", Stack: "Stack",
}));
import { ManualConnectionForm } from "./manual-connection-form";
import { ConnectionFeedback } from "./connection-feedback";
import type { ManualConnectionFormProps } from "./connection-types";

function find(node: ReactNode, type: unknown): ReactElement<Record<string, any>> | undefined {
  if (!isValidElement<Record<string, any>>(node)) return undefined;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const match = find(child, type);
    if (match) return match;
  }
}

it("keeps connection feedback with the guarded action, without submitting or cancelling on render", () => {
  const connect = vi.fn(), cancel = vi.fn(), operation = { error: new Error("Connection refused") };
  const controller = {
    form: { values: { endpoint: "https://synthetic.invalid", token: "synthetic", name: "", target: null } },
    busy: false, connectionMode: "tailscale", operation, connect, cancel,
  } as unknown as ManualConnectionFormProps["controller"];
  const footer = () => find(ManualConnectionForm({ controller, disabled: false }), "FormActions")!;
  const actions = footer();
  expect(actions.props.feedback.type).toBe(ConnectionFeedback);
  expect(actions.props.feedback.props.operation).toBe(operation);
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
  controller.busy = true;
  expect(footer().props.cancelDisabled).toBe(true);
});

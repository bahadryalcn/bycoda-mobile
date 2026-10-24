// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  value: { kind: "default", label: "Work", color: null } as {
    kind: string;
    label: string;
    color: string | null;
    pending?: unknown;
  },
  allowed: true,
  submit: vi.fn(),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    name: "Computer",
    capabilities: ["providers.desktop.quotaRefresh.v1", "providers.desktop.metadata.v1"],
  }),
}));
vi.mock("./provider-account-delivery", () => ({
  useProviderAccountDelivery: () => ({
    draft: {
      value: state.value,
      ready: true,
      error: null,
      setValue: (value: typeof state.value) => {
        state.value = value;
      },
    },
    busy: false,
    receipt: undefined,
    error: null,
    current: () => state.allowed,
    submit: state.submit,
    reconcile: vi.fn(),
  }),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: { children: import("react").ReactNode }) =>
    createElement("div", null, children);
  const Button = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, label);
  return {
    Body: Wrap,
    Stack: Wrap,
    Row: Wrap,
    Sheet: ({
      children,
      footer,
    }: {
      children: import("react").ReactNode;
      footer: import("react").ReactNode;
    }) => createElement("div", null, children, footer),
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    ErrorText: () => null,
    Button,
    Field: () => null,
    SelectField: () => null,
    ConfirmationCard: ({
      message,
      onConfirm,
      disabled,
    }: {
      message: string;
      onConfirm: () => void;
      disabled: boolean;
    }) =>
      createElement(
        "div",
        null,
        message,
        createElement(Button, { label: "Confirm", onPress: onConfirm, disabled }),
      ),
  };
});
import { ProviderAccountEditor } from "./provider-account-editor";
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () =>
    root!.render(
      createElement(ProviderAccountEditor, {
        scope: { machineId: "machine", sessionId: "session" },
        projectId: "project",
        report: {} as never,
        account: { provider: "claude", id: "default", label: "Work" } as never,
        onClose: vi.fn(),
      }),
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === label)!.click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  state.allowed = true;
  state.value = { kind: "default", label: "Work", color: null };
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("requires explicit future-default confirmation before submitting the exact finite change", async () => {
  state.submit.mockResolvedValue(undefined);
  await render();
  expect(state.submit).not.toHaveBeenCalled();
  await click("Review changes");
  expect(container.textContent).toContain(
    "Make this account the default for this provider's future conversations?",
  );
  expect(state.submit).not.toHaveBeenCalled();
  await click("Confirm");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "default",
    confirm: "DEFAULT_FOR_FUTURE_SESSIONS",
  });
});
it("retains reviewed context but blocks confirmation after target access changes", async () => {
  await render();
  await click("Review changes");
  state.allowed = false;
  await render();
  await click("Confirm");
  expect(state.submit).not.toHaveBeenCalled();
});
it("explains a one-shot quota request and requires its own explicit confirmation", async () => {
  state.value = { kind: "quotaRefresh", label: "Work", color: null };
  state.submit.mockResolvedValue(undefined);
  await render();
  expect(container.textContent).toContain("five-minute cooldown");
  await click("Review request");
  expect(state.submit).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "Read this account's Claude quota once from the computer?",
  );
  await click("Confirm");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "quotaRefresh",
    confirm: "REFRESH_PROVIDER_QUOTA",
  });
});

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
    finished?: boolean;
  },
  allowed: true,
  metadata: true,
  quota: true,
  busy: false,
  error: undefined as unknown,
  receipt: undefined as { state: string } | undefined,
  reconcile: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    name: "Computer",
    capabilities: [
      ...(state.quota ? ["providers.desktop.quotaRefresh.v1"] : []),
      ...(state.metadata
        ? ["providers.desktop.metadata.v1", "providers.desktop.accountKind.v1"]
        : []),
    ],
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
    busy: state.busy,
    receipt: state.receipt,
    error: state.error,
    current: () => state.allowed,
    submit: state.submit,
    reconcile: state.reconcile,
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
  return { ScopeLine: () => null,
    Body: Wrap,
    Stack: Wrap,
    Disclosure: Wrap,
    Row: Wrap,
    Sheet: ({
      children,
      footer,
    }: {
      children: import("react").ReactNode;
      footer: import("react").ReactNode;
    }) => createElement("div", null, children, footer),
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    ErrorText: ({ error }: { error: unknown }) =>
      error instanceof Error ? createElement("p", null, error.message) : null,
    FormActions: (props: import("@/ui/component-props").FormActionsProps) =>
      createElement(
        "section",
        { "data-form-actions": true },
        props.feedback,
        createElement(Button, {
          label: props.submitLabel,
          onPress: props.onSubmit,
          disabled: !!(props.disabled || props.busy),
        }),
        props.onCancel
          ? createElement(Button, {
              label: props.cancelLabel ?? "Cancel",
              onPress: props.onCancel,
              disabled: !!(props.cancelDisabled || props.busy),
            })
          : null,
      ),
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
  state.metadata = true;
  state.quota = true;
  state.busy = false;
  state.error = undefined;
  state.receipt = undefined;
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
  expect(container.querySelector("[data-form-actions]")!.textContent).not.toContain(
    "future conversations?",
  );
  await click("Save");
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
  await click("Save");
  expect(state.submit).not.toHaveBeenCalled();
});
it("explains a one-shot quota request and requires its own explicit confirmation", async () => {
  state.value = { kind: "quotaRefresh", label: "Work", color: null };
  state.submit.mockResolvedValue(undefined);
  await render();
  expect(container.textContent).toContain("Five-minute cooldown");
  await click("Review request");
  expect(state.submit).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "Read this account's Claude quota once from the computer?",
  );
  await click("Refresh quota");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "quotaRefresh",
    confirm: "REFRESH_PROVIDER_QUOTA",
  });
});

it("prioritizes the saved pending result over the earlier review and never resends on recovery", async () => {
  state.submit.mockResolvedValue(undefined);
  await render();
  await click("Review changes");
  await click("Save");
  state.value = { ...state.value, pending: { operationId: "saved-operation" } };
  state.error = new Error("Response interrupted");
  await render();
  expect(container.textContent).toContain("Only the saved operation's result is read");
  expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
    "Read result",
    "Close",
  ]);
  expect(container.querySelector("[data-form-actions]")!.textContent).toContain(
    "Response interrupted",
  );
  await click("Read result");
  expect(state.reconcile).toHaveBeenCalledOnce();
  expect(state.submit).toHaveBeenCalledOnce();
  state.allowed = false;
  await render();
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Read result",
    )!.disabled,
  ).toBe(true);
});

it("shows the final outcome with Close after review, without a second save or result read", async () => {
  await render();
  await click("Review changes");
  state.value = { ...state.value, finished: true };
  state.receipt = { state: "applied" };
  await render();
  expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
    "Close",
  ]);
  expect(container.querySelector("[data-form-actions]")!.textContent).toContain(
    "Account settings saved.",
  );
  expect(state.submit).not.toHaveBeenCalled();
  expect(state.reconcile).not.toHaveBeenCalled();
});

it("keeps validation feedback beside Review and locks both actions while delivery is busy", async () => {
  state.value = { kind: "rename", label: "", color: null };
  await render();
  await click("Review changes");
  expect(container.querySelector("[data-form-actions]")!.textContent).toContain(
    "Invalid account metadata change",
  );
  expect(container.textContent?.match(/Invalid account metadata change/g)).toHaveLength(1);
  state.busy = true;
  await render();
  expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  expect(state.submit).not.toHaveBeenCalled();
});

it("keeps quota observation available without authorizing unsupported metadata changes", async () => {
  state.metadata = false;
  state.submit.mockResolvedValue(undefined);
  await render();
  const review = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Review changes",
  )!;
  expect(review.disabled).toBe(true);
  expect(container.textContent).toContain("does not support account settings changes");
  state.value = { ...state.value, kind: "quotaRefresh" };
  await render();
  await click("Review request");
  await click("Refresh quota");
  expect(state.submit).toHaveBeenCalledWith({
    kind: "quotaRefresh",
    confirm: "REFRESH_PROVIDER_QUOTA",
  });
});

it("sends Personal for a legacy unset account kind after review", async () => {
  state.submit.mockResolvedValue(undefined);
  state.value = {
    kind: "accountKind",
    label: "Work",
    color: null,
    accountKind: null,
  } as typeof state.value;
  await render();
  await click("Review changes");
  await click("Save");
  expect(state.submit).toHaveBeenCalledWith({ kind: "accountKind", accountKind: "personal" });
});

// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AutomationEditorProps } from "./types";
import { RemoteHostError } from "@/remote/host-error";
const fixture = vi.hoisted(() => ({
  fields: new Map<string, { onChangeText(value: string): void; error?: string }>(),
  submit: undefined as undefined | { disabled: boolean; busy?: boolean; submitLabel: string; onSubmit(): void },
  mutate: vi.fn(),
  current: true,
  check: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => fixture.current }) }));
vi.mock("../shared/agent", () => ({ useEffectiveAgent: (value: unknown) => value }));
vi.mock("../shared/agent-fields", () => ({ AgentFields: () => null }));
vi.mock("../shared/schedule-fields", () => ({ ScheduleFields: () => null }));
vi.mock("./schedule-preview", () => ({ SchedulePreview: () => null }));
vi.mock("../../workspace/use-project-directory", () => ({
  useProjectList: () => ({ data: [], directoryReady: true, isProjectVisible: () => true }),
}));
vi.mock("@/ui/number-field", async () => ({
  NumberField: (await import("@/ui/primitives")).Field,
}));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/number-field")).NumberField as never));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: Group,
    showToast: fixture.toast,
    Disclosure: Group,
    Body: Group,
    NavigationGroup: Group,
    MutationState: () => null,
    ToggleField: () => null,
    SelectField: () => null,
    SegmentedControl: () => null,
    NavigationRow: () => null,
    Button: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { onClick: onPress }, label),
    Notice: ({ message, children }: PropsWithChildren<{ message: string }>) => createElement("div", null, message, children),
    ErrorNotice: () => null,
    Field: ({
      label,
      onChangeText,
      error,
    }: {
      label: string;
      onChangeText(value: string): void;
      error?: string;
    }) => {
      fixture.fields.set(label, { onChangeText, error });
      return createElement("div", null, label, error);
    },
    FormActions: (props: NonNullable<typeof fixture.submit> & { feedback?: import("react").ReactNode }) => {
      fixture.submit = props;
      return props.feedback ?? null;
    },
  };
});
import { AutomationEditor } from "./automation-editor";
it.each(["0", "1", "10080", "10081"])(
  "explains the continuous minimum-gap bound and keeps the canonical save guard for %s",
  async (text) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture.fields.clear();
    fixture.mutate.mockReset();
    fixture.current = true;
    const initial: AutomationEditorProps["initial"] = {
      id: "automation",
      name: "Nightly review",
      prompt: "Review results",
      projectId: "project",
      harness: "codex",
      model: "codex:model",
      modelSettings: {},
      runtimeMode: "supervised",
      maxRunMinutes: 0,
      enabled: true,
      scheduleKind: "daily",
      minute: 0,
      time: "09:00",
      dayOfWeek: 1,
      maxRunsPerDay: 0,
      trigger: { kind: "continuous", minimumGapMinutes: 5 },
    };
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(AutomationEditor, {
            initial,
            save: {
              isPending: false,
              mutate: fixture.mutate,
              mutateAsync: fixture.mutate,
            } as unknown as AutomationEditorProps["save"],
            busy: false,
            readSaved: fixture.check,
            onClose: vi.fn(),
          }),
        ),
      );
      await act(async () => fixture.fields.get("Minimum gap (minutes)")!.onChangeText(text));
      const valid = text === "1" || text === "10080";
      expect(fixture.fields.get("Minimum gap (minutes)")?.error).toBe(
        valid ? undefined : "Enter minutes from 1 to 10080.",
      );
      expect(fixture.submit?.disabled).toBe(!valid);
      const submit = fixture.submit!.onSubmit;
      if (valid) {
        await act(async () => { submit(); submit(); });
        expect(fixture.mutate).toHaveBeenCalledOnce();
        expect(fixture.mutate.mock.calls[0][0].automation.expectedAbsent).toBe(true);
        expect(fixture.mutate.mock.calls[0][0].automation.trigger.minimumGapMinutes).toBe(
          Number(text),
        );
        fixture.current = false;
        await act(async () => submit());
        expect(fixture.mutate).toHaveBeenCalledOnce();
      } else {
        await act(async () => submit());
        expect(fixture.mutate).not.toHaveBeenCalled();
      }
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it("checks an unconfirmed save without resending and closes only when the saved configuration matches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.current = true;
  fixture.mutate.mockReset().mockRejectedValueOnce(new RemoteHostError("host", "network", "Connection lost", true));
  fixture.check.mockReset();
  const draft: AutomationEditorProps["initial"] = {
    id: "stable-id", name: " Review ", prompt: "Read work", projectId: "project", harness: "codex",
    model: "codex:model", modelSettings: { effort: "medium", detail: "low" }, runtimeMode: "supervised",
    maxRunMinutes: 0, enabled: true, scheduleKind: "daily", minute: 0, time: "09:00", dayOfWeek: 1, maxRunsPerDay: 0,
  };
  fixture.check.mockRejectedValueOnce(new Error("Read failed")).mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ ...draft, prompt: "Unrelated instructions" }).mockResolvedValueOnce({
    ...draft, name: "Review", modelSettings: { detail: "low", effort: "medium" }, nextRunAt: 500, createdAt: 100, updatedAt: 100,
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  const onClose = vi.fn();
  const reset = vi.fn();
  const check = () => act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Check status")!.click());
  try {
    await act(async () => root.render(createElement(AutomationEditor, {
      initial: draft, save: { isPending: true } as AutomationEditorProps["save"],
      busy: true, onClose, readSaved: fixture.check,
    })));
    expect(fixture.submit).toMatchObject({ submitLabel: "Save", busy: true, disabled: true });
    await act(async () => root.render(createElement(AutomationEditor, {
      initial: draft, save: { isPending: false, mutateAsync: fixture.mutate, reset } as unknown as AutomationEditorProps["save"],
      busy: false, onClose, readSaved: fixture.check,
    })));
    await act(async () => fixture.submit!.onSubmit());
    expect(fixture.submit?.disabled).toBe(true);
    await act(async () => fixture.submit!.onSubmit());
    await check();
    expect(fixture.submit?.disabled).toBe(true);
    await check();
    expect(fixture.submit?.disabled).toBe(false);
    expect(fixture.mutate).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await check();
    expect(fixture.submit?.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(fixture.toast).not.toHaveBeenCalled();
    await check();
    expect(fixture.check).toHaveBeenCalledWith("stable-id");
    expect(fixture.mutate).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({ message: "Automation saved." });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

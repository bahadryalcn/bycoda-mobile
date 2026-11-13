// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AutomationEditorProps } from "./types";
const fixture = vi.hoisted(() => ({
  fields: new Map<string, { onChangeText(value: string): void; error?: string }>(),
  submit: undefined as undefined | { disabled: boolean; onSubmit(): void },
  mutate: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("../shared/agent", () => ({ useEffectiveAgent: (value: unknown) => value }));
vi.mock("../shared/agent-fields", () => ({ AgentFields: () => null }));
vi.mock("../shared/schedule-fields", () => ({ ScheduleFields: () => null }));
vi.mock("./schedule-preview", () => ({ SchedulePreview: () => null }));
vi.mock("@/ui/number-field", async () => ({
  NumberField: (await import("@/ui/primitives")).Field,
}));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: Group,
    Section: Group,
    Body: Group,
    NavigationGroup: Group,
    MutationState: () => null,
    ToggleField: () => null,
    SelectField: () => null,
    Button: () => null,
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
    FormActions: (props: { disabled: boolean; onSubmit(): void }) => {
      fixture.submit = props;
      return null;
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
            } as unknown as AutomationEditorProps["save"],
            busy: false,
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
      if (valid) {
        await act(async () => fixture.submit!.onSubmit());
        expect(fixture.mutate.mock.calls[0][0].automation.trigger.minimumGapMinutes).toBe(
          Number(text),
        );
      } else expect(fixture.mutate).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

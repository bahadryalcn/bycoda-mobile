import type { useHostMutation } from "@/state/queries";
import type { HostAutomation, HostAutomationInput } from "@/domain/types";
export type AutomationEditorFlow =
  | { kind: "new"; initial: HostAutomationInput }
  | { kind: "edit"; id: string }
  | null;
export type AutomationEditorProps = {
  initial: HostAutomationInput;
  save: ReturnType<typeof useHostMutation<HostAutomation>>;
  busy: boolean;
  onClose: () => void;
};
export type AutomationHistoryProps = { automationId: string; projectId: string };
export type AutomationCardProps = {
  item: HostAutomation;
  busy: boolean;
  editorOpen: boolean;
  historyId: string | null;
  onEdit: (id: string) => void;
  onHistory: (id: string | null) => void;
  save: ReturnType<typeof useHostMutation<HostAutomation>>;
  run: ReturnType<typeof useHostMutation>;
  remove: ReturnType<typeof useHostMutation>;
};

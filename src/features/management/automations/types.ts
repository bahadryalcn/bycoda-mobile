import type { useHostMutation } from "@/state/queries";
import type { HostAutomation, HostAutomationInput } from "@/domain/types";
import type { AutomationRunSummary } from "./automation-feedback";
export type AutomationEditorFlow =
  | { kind: "new"; initial: HostAutomationInput }
  | { kind: "edit"; id: string }
  | null;
export type AutomationEditorProps = {
  initial: HostAutomationInput & { updatedAt?: number };
  save: ReturnType<typeof useHostMutation<HostAutomation>>;
  busy: boolean;
  readSaved(id: string): Promise<HostAutomation | undefined>;
  onClose: () => void;
};
export type AutomationHistoryProps = {
  automationId: string;
  projectId: string;
  /** Latest summary is repeated inside history while the parent is concealed. */
  summary?: AutomationRunSummary;
  automationName?: string;
  onClose: () => void;
};
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

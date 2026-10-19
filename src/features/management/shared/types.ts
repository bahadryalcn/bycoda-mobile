import type { HostTaskInput } from "@/domain/types";
export type AgentDraft = Pick<
  HostTaskInput,
  "harness" | "model" | "runtimeMode" | "maxRunMinutes" | "modelSettings"
>;
export type AgentFieldsProps = {
  value: AgentDraft;
  onChange: (value: AgentDraft) => void;
  projectId?: string | null;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
  showRunLimit?: boolean;
};
export type ScopeProps = { allowAll?: boolean };
export type ScopeChooser = { search: string } | null;
export type StatusProps = { value: string };
export type ManagementScreenProps = { section: string };

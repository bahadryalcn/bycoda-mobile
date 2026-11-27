import type { HostTaskInput } from "@/domain/types";
import type { ModelRoutingRole } from "../../../../../src/shared/model/host-contracts/model-routing";
export type AgentDraft = Pick<
  HostTaskInput,
  "harness" | "model" | "runtimeMode" | "maxRunMinutes" | "modelSettings" | "providerAccountId" | "modelChoice"
>;
export type AgentFieldsProps = {
  part?: "settings";
  value: AgentDraft;
  onChange: (value: AgentDraft) => void;
  projectId?: string | null;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
  showRunLimit?: boolean;
  /** The Host role "Use settings" follows; with it the model field offers model routing. */
  routingRole?: ModelRoutingRole;
};
export type ScopeChooser = { search: string } | null;
export type StatusProps = { value: string };
export type ManagementScreenProps = { section: string };

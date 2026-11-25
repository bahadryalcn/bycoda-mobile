import type { HostSession } from "@/domain/types";
export type SessionSettingsProps = {
  onClose: () => void;
  value: HostSession;
  projectId: string;
  disabled: boolean;
  onCommand: (params: Record<string, unknown>) => Promise<unknown>;
  onUpdated: () => void;
  /** Opens the one "Model and access" editor (the composer's model sheet). */
  onOpenModel?: () => void;
};
type EditableSession = HostSession["session"];
export type SessionSettingsDraft = Pick<EditableSession, "title" | "model" | "modelSettings"> & {
  provider: EditableSession["harness"];
  accountId?: string;
  mode: EditableSession["runtimeMode"];
};

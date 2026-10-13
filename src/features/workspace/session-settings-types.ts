import type { HostSession } from "@/domain/types";
export type SessionSettingsProps = {
  onClose: () => void;
  value: HostSession;
  projectId: string;
  disabled: boolean;
  onCommand: (params: Record<string, unknown>) => Promise<unknown>;
  onUpdated: () => void;
};
type EditableSession = HostSession["session"];
export type SessionSettingsDraft = Pick<EditableSession, "title" | "model" | "modelSettings"> & {
  provider: EditableSession["harness"];
  mode: EditableSession["runtimeMode"];
};

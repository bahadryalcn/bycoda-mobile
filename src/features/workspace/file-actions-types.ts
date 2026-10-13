import type { useHostMutation } from "@/state/queries";
import type { HostFileEntry } from "@/remote/types";
export type FileActionMutation = Pick<
  ReturnType<typeof useHostMutation>,
  "isPending" | "error" | "mutateAsync"
>;
export type FileOperation = "rename_path" | "copy_path" | "move_path" | "delete_path";
export type FileActionDraft = { operation: FileOperation; name: string; destination: string };
export type FileActionsProps = {
  root: string;
  projectId: string;
  entry: HostFileEntry;
  onClose: () => void;
  onCompleted: () => void;
  action: FileActionMutation;
};

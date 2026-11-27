import type { useHostMutation } from "@/state/queries";
import type { HostFileEntry } from "@/remote/types";
export type FileActionMutation = Pick<
  ReturnType<typeof useHostMutation>,
  "isPending" | "error" | "mutateAsync"
>;
export type FileOperation = "rename_path" | "copy_path" | "move_path";
export type FileActionDraft = { name: string; destination: string };
export type FileActionsProps = {
  root: string;
  projectId: string;
  entry: HostFileEntry;
  onClose: () => void;
  /** Runs after success with a sentence naming the file and what happened to it. */
  onCompleted: (summary: string) => void;
  action: FileActionMutation;
};

import { useHostMutation } from "@/state/queries";
import { useRef, useState } from "react";
import { useCopy } from "@/ui/copy";
import { useProjectRefresh } from "./shared";
import type { Branches } from "./wire";
import type { GitFileAction, GitScope } from "./git-types";
import type { GitConfirmation } from "./workspace-state";

export function useGitActions({ projectId, cwd, root }: GitScope) {
  const copy = useCopy();
  const occupied = useRef(false);
  const [busy, setBusy] = useState(false);
  const exclusive = async <T>(work: () => Promise<T>): Promise<T> => {
    if (occupied.current)
      throw new Error(
        copy(
          "Git işlemi sürüyor. Bitmesini bekle.",
          "A Git action is running. Wait for it to finish.",
        ),
      );
    occupied.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      occupied.current = false;
      setBusy(false);
    }
  };
  const refreshProject = useProjectRefresh(projectId);
  const action = useHostMutation<unknown>("git.action", ["git", projectId]);
  const extended = useHostMutation<unknown>("workspace.run", ["git", projectId]);
  const switchBranch = useHostMutation<Branches>("git.switch", ["git", projectId]);
  const createBranch = useHostMutation<Branches>("git.createBranch", ["git", projectId]);

  const runFileAction = (value: GitFileAction, path?: string) =>
    exclusive(() => action.mutateAsync({ projectId, cwd, action: value, path }));

  const createNamedBranch = async (branch: string) => {
    await createBranch.mutateAsync({ projectId, cwd, branch });
    void refreshProject();
  };

  const fetch = async () => {
    await extended.mutateAsync({ command: "git_fetch", args: { cwd: root, prune: false } });
    void refreshProject();
  };

  const executeConfirmation = async (confirmation: GitConfirmation, message: string) => {
    switch (confirmation.kind) {
      case "operation":
        await extended.mutateAsync({
          command:
            confirmation.choice === "abort" ? "git_operation_abort" : "git_operation_continue",
          args: { cwd: root },
        });
        break;
      case "switch":
        await switchBranch.mutateAsync({
          projectId,
          cwd,
          branch: confirmation.branch,
          remote: confirmation.remote,
        });
        break;
      case "resolve":
        await extended.mutateAsync({
          command: "git_resolve_conflict",
          args: { cwd: root, relative: confirmation.path, side: confirmation.side },
        });
        break;
      case "discard":
        await action.mutateAsync({ projectId, cwd, action: "discard", path: confirmation.path });
        break;
      case "pull":
        await extended.mutateAsync({ command: "git_pull", args: { cwd: root } });
        break;
      case "commit":
      case "push":
        await action.mutateAsync({
          projectId,
          cwd,
          action: confirmation.kind,
          message: confirmation.kind === "commit" ? message.trim() : undefined,
        });
        break;
    }
    void refreshProject();
  };

  return {
    busy,
    action,
    extended,
    switchBranch,
    createBranch,
    runFileAction,
    createNamedBranch: (branch: string) => exclusive(() => createNamedBranch(branch)),
    fetch: () => exclusive(fetch),
    executeConfirmation: (confirmation: GitConfirmation, message: string) =>
      exclusive(() => executeConfirmation(confirmation, confirmation.context?.message ?? message)),
  };
}

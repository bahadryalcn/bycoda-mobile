import type { HostWorktrees } from "@/remote/types";
import type { WorkspaceSegment } from "./workspace-state";
export type ProjectScreenProps = {
  id: string;
  initialCwd?: string;
  initialSegment?: WorkspaceSegment;
  initialCreateSession?: boolean;
};
export type ProjectWorktrees = HostWorktrees;

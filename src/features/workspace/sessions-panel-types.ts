import type { RemoteProvider, WorkspaceTarget } from "@/remote/types";
import type { SessionLayout } from "./session-directory";
import type { QueryLike } from "@/ui/query-presentation";
import type { ReactNode } from "react";
export type ProjectSessionControls = {
  /** The collection's search icon; the page places it first in its actions. */
  searchTrigger: ReactNode;
  /** The collection's filter button (Archived); it follows the search icon. */
  filterTrigger?: ReactNode;
  showCreateInHeader: boolean;
  createDisabled: boolean;
  create: () => void;
  archived: boolean;
  toggleArchived: () => void;
};
export type ProjectSessionsProps = WorkspaceTarget & { initialCreating?: boolean; sessionLayout?: SessionLayout; directoryQuery?: QueryLike; projectName?: string; projectCwd?: string; canReadProject: () => boolean; renderFrame: (content: ReactNode, controls: ProjectSessionControls) => ReactNode };
export type SessionCreationDraft = { provider?: RemoteProvider; accountId?: string; model: string };

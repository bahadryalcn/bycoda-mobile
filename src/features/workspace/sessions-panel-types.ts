import type { RemoteProvider, WorkspaceTarget } from "@/remote/types";
export type ProjectSessionsProps = WorkspaceTarget;
export type SessionCreationDraft = { provider?: RemoteProvider; model: string };

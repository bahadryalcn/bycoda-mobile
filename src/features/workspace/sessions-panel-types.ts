import type { RemoteProvider, WorkspaceTarget } from "@/remote/types";
export type ProjectSessionsProps = WorkspaceTarget & { initialCreating?: boolean };
export type SessionCreationDraft = { provider?: RemoteProvider; model: string };

import type { RemoteProvider, WorkspaceTarget } from "@/remote/types";
import type { SessionLayout } from "./session-directory";
export type ProjectSessionsProps = WorkspaceTarget & { initialCreating?: boolean; sessionLayout?: SessionLayout };
export type SessionCreationDraft = { provider?: RemoteProvider; model: string };

/** Wire contracts shared with the desktop. These imports are erased by Metro. */
export type {
  HostDescriptor,
  HostProject,
  HostProjectDirectory,
  HostProjectGroup,
  HostDirectory,
  HostModelCatalog,
  HostSession,
  HostSessionSummary,
  HostCommand,
  CommandReceipt,
  SessionSync,
  SessionSyncResponse,
  MachineChanges,
  MachineChangesRequest,
  RemoteProvider,
} from "../../../src/features/connections/model/protocol";
export type { Session, Block, RuntimeMode } from "../../../src/features/sessions/model/session";
export type { UserQuestionReply } from "../../../src/features/sessions/model/userQuestion";
export type {
  GitDiffIndex,
  GitFileDiff,
  GitBranches,
  GitChangedFile,
  FsEntry,
} from "../../../src/platform/tauri/fs";
export type {
  HostTask,
  HostTaskInput,
  TaskStatus,
  TaskReviewNote,
} from "../../../src/features/tasks/model/hostTasks";
export type { HostGoal, HostGoalInput } from "../../../src/features/tasks/model/hostGoals";
export type {
  HostAutomation,
  HostAutomationInput,
  HostAutomationRun,
} from "../../../src/features/automations/model/hostAutomations";
export type {
  HostSettings,
  HostSettingsState,
} from "../../../src/features/tasks/model/hostSettings";
export type {
  SocialAccount,
  SocialThread,
  SocialPolicy,
  SocialSnapshot,
  SocialPlatform,
} from "../../../src/features/social/model/social";
export type { PrWatch, PrWatchInput } from "../remote/contracts/inbox";
export type { Note, NoteUpsert } from "../../../src/features/notes/notes";
export type { MobileInboxItem, MobileInbox as HostAttentionInbox } from "../remote/types";

/** Tokens are loaded from SecureStore, never persisted in this object by the API. */
export type HostConnection = {
  id: string;
  endpoint: string;
  lanKey?: string;
  environmentId?: string;
  token: string;
};
export type ProjectScope = { projectId: string; cwd?: string };
export { REMOTE_PROVIDERS } from "./providers";
export { machineQueryKey } from "./query-keys";

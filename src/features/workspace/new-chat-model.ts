import { lastUsedProject } from "./recent-projects";
import type { RuntimeMode } from "./creation-selection";
import { composerCrewHandles } from "./composer-crew-delivery";
import { ACCESS_MODES } from "./composer-access-model";
import type { NewChatAttachmentReference } from "./new-chat-attachments";

/** Route of the empty new-session screen. It sits beside `/session/[id]`; a static segment wins. */
export const NEW_CHAT_ROUTE_ID = "new";

// The key lives beside the new-session attachment owners so attachment custody can read it.
export { NEW_CHAT_DRAFT_KEY } from "./new-chat-attachments";

/** A prompt link's text goes into the draft only when the owner has not typed anything yet. */
export function seededNewChatText(current: string, prompt: string | undefined): string | undefined {
  return prompt?.trim() && !current.trim() ? prompt : undefined;
}

/** After a create, the draft is cleared only when it still holds the words that were sent. */
export function newChatDraftWasSent(current: string, sent: string): boolean {
  return !!sent && current.trim() === sent;
}

/**
 * Input the session composer turns into something other than a plain message: its own leading
 * commands (`/compact`, `/plan`, `/draft`, `/btw`) and `@crew:` delegations. A first turn carries
 * plain text only, so these wait until the session exists. Provider slash commands pass through.
 */
export type NewChatSessionOnly = "command" | "crew";
export function newChatSessionOnlyInput(text: string): NewChatSessionOnly | undefined {
  if (/^\s*\/(?:compact|plan|draft|btw)(?=\s|$)/i.test(text)) return "command";
  if (composerCrewHandles(text).length) return "crew";
  return undefined;
}

/** What the owner picked in the hero: a project belongs to the computer it was picked on. */
export type NewChatPick = { machineId: string; id: string; cwd: string };

type ProjectLike = { id: string; cwd: string };

const trimPath = (path: string) => path.trim().replace(/[\\/]+$/, "");

/**
 * The project the new session would start in. In order: the owner's pick on this computer; after a
 * computer switch the same folder on the new computer; the route's project (when it names this
 * computer); the shared project selection; then, when the owner already had a project or prefers
 * "new sessions use the last project", the most recently used project (else the first). Undefined
 * means the hero asks the owner to choose one.
 *
 * `projects` must already be the visible projects of the active computer, most recent first.
 */
export function resolveNewChatProject<P extends ProjectLike>({
  machineId,
  projects,
  recency,
  picked,
  route,
  scopeProjectId,
  useLast,
}: {
  machineId: string | undefined;
  projects: readonly P[];
  recency: { activity: Readonly<Record<string, number>>; opened: Readonly<Record<string, number>> };
  picked?: NewChatPick;
  route?: { machineId?: string; projectId?: string };
  scopeProjectId?: string | null;
  useLast: boolean;
}): P | undefined {
  if (!machineId || !projects.length) return undefined;
  const byId = (id: string | null | undefined) => (id ? projects.find((project) => project.id === id) : undefined);
  if (picked) {
    if (picked.machineId === machineId) {
      const same = byId(picked.id);
      if (same) return same;
    } else {
      const folder = trimPath(picked.cwd);
      const same = folder ? projects.find((project) => trimPath(project.cwd) === folder) : undefined;
      if (same) return same;
    }
  }
  const routed = route?.projectId && (!route.machineId || route.machineId === machineId) ? byId(route.projectId) : undefined;
  if (routed) return routed;
  const scoped = byId(scopeProjectId);
  if (scoped) return scoped;
  if (!useLast && !picked) return undefined;
  return lastUsedProject(projects, recency) ?? projects[0];
}

/**
 * The working folder sent with `create`: only a chosen worktree other than the project's main
 * folder. A folder chosen for another project never travels with a new pick.
 */
export function newChatWorktreeCwd(project: ProjectLike | undefined, checkout: { projectId: string; cwd: string } | undefined) {
  if (!project || !checkout || checkout.projectId !== project.id) return undefined;
  const cwd = checkout.cwd.trim();
  return cwd && trimPath(cwd) !== trimPath(project.cwd) ? cwd : undefined;
}

/** One send attempt. The same payload keeps its command IDs, so a retry after a lost reply is idempotent. */
export type NewChatAttempt = { key: string; createId: string; turnId: string };

export type NewChatPayload = {
  machineId: string;
  projectId: string;
  cwd?: string;
  provider?: string;
  accountId?: string;
  model: string;
  settings: Readonly<Record<string, string>>;
  runtimeMode: RuntimeMode;
  text: string;
  firstTurn: boolean;
  /** Staged attachment IDs, in order; a changed set is a different first turn. */
  attachments?: readonly string[];
};

/** Order-independent identity of everything the Host would receive. */
export function newChatAttemptKey(payload: NewChatPayload) {
  const settings = Object.keys(payload.settings).sort().map((key) => [key, payload.settings[key]]);
  return JSON.stringify([
    payload.machineId,
    payload.projectId,
    payload.cwd ?? "",
    payload.provider ?? "",
    payload.accountId ?? "",
    payload.model,
    settings,
    payload.runtimeMode,
    payload.text,
    payload.firstTurn,
    payload.attachments ?? [],
  ]);
}

/**
 * Reuses the previous attempt's command IDs while the payload is unchanged (the Host replays the
 * receipt of a command it already accepted and refuses a changed payload under the same ID);
 * any change gets fresh IDs.
 */
export function newChatAttempt(previous: NewChatAttempt | undefined, key: string, makeId: () => string): NewChatAttempt {
  return previous && previous.key === key ? previous : { key, createId: makeId(), turnId: makeId() };
}

/**
 * The prompt as the Host's nested first turn; it inherits the new session's ID. Uploaded
 * attachments travel with it, so the session and its first message with files are one command.
 */
export function newChatFirstTurn(text: string, commandId: string, attachments: readonly NewChatAttachmentReference[] = []) {
  return {
    type: "send" as const,
    commandId,
    sessionId: "" as const,
    text,
    ...(attachments.length ? { attachments: [...attachments] } : {}),
  };
}

/**
 * Sends need words or attachments (as an open session's composer), a project, a resolved model
 * and no create or upload in flight or awaiting recovery.
 */
export function newChatSendState({
  text,
  attachments = 0,
  uploading = false,
  project,
  canStart,
  locked,
  connected,
  sessionOnly,
}: {
  text: string;
  /** Staged attachments the first turn would carry. */
  attachments?: number;
  /** Attachments are being picked or uploaded. */
  uploading?: boolean;
  project: boolean;
  canStart: boolean;
  locked: boolean;
  connected: boolean;
  /** Set only when the create carries the text as its first turn. */
  sessionOnly?: NewChatSessionOnly;
}): { enabled: boolean; reason?: "empty" | "project" | "model" | "busy" | "offline" | NewChatSessionOnly } {
  if (locked || uploading) return { enabled: false, reason: "busy" };
  if (!connected) return { enabled: false, reason: "offline" };
  if (!project) return { enabled: false, reason: "project" };
  if (!text.trim() && !attachments) return { enabled: false, reason: "empty" };
  if (sessionOnly && text.trim()) return { enabled: false, reason: sessionOnly };
  if (!canStart) return { enabled: false, reason: "model" };
  return { enabled: true };
}

/**
 * The project a route names, as one comparable key; undefined when it names none (a plain "New
 * session"). The one empty new session is brought to the front again with new params, and only a
 * route that names a project replaces the owner's earlier pick and working folder.
 */
export function newChatRouteKey(route: { machineId?: string; projectId?: string; cwd?: string; project?: string }) {
  if (!route.projectId && !route.project) return undefined;
  return JSON.stringify([route.machineId ?? "", route.projectId ?? "", route.cwd ?? "", route.project ?? ""]);
}

/**
 * Claims the one create in flight synchronously: a double tap or a held Enter arrives before the
 * pending state re-renders, and must neither send twice nor reset the command it is waiting for.
 */
export function createNewChatSendGate() {
  let busy = false;
  return {
    claim(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
  };
}

/**
 * The working-folder choice appears only for a Git project: the Host lists a Git project's
 * worktrees (its main folder first) and refuses the listing for any other folder. A folder already
 * chosen (from a project screen) stays visible so it can be changed back.
 */
export function newChatCheckoutAvailable({
  cwd,
  canCreate,
  trees,
}: {
  cwd?: string;
  canCreate: boolean;
  trees: { worktrees: readonly { missing?: boolean; isMain?: boolean }[] } | undefined;
}) {
  if (cwd) return true;
  if (!trees?.worktrees.length) return false;
  return canCreate || trees.worktrees.some((tree) => !tree.missing && !tree.isMain);
}

/**
 * The access mode the create sends and the chip shows. The owner's choice while the chosen agent
 * can honour it; otherwise (a default or earlier choice the agent refuses, such as "Ask" for
 * headless Antigravity) the least permissive mode it can run, as the desktop's new-session mode.
 */
export function newChatRuntimeMode(
  requested: RuntimeMode,
  unavailable: Partial<Record<RuntimeMode, string>>,
): RuntimeMode {
  if (!unavailable[requested]) return requested;
  return ACCESS_MODES.find((mode) => !unavailable[mode]) ?? requested;
}

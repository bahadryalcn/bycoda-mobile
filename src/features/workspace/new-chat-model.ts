import { lastUsedProject } from "./recent-projects";
import type { RuntimeMode } from "./creation-selection";
import { composerCrewHandles } from "./composer-crew-delivery";
import { ACCESS_MODES } from "./composer-access-model";
import type { NewChatAttachmentReference } from "./new-chat-attachments";
import { activeComposerMode, stripComposerMode } from "./composer-mode";
import type { ComposerSuggestion } from "./composer-catalog-model";

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
 * Input only an open session can resolve: its own leading commands that act on an existing
 * conversation (`/compact`, `/btw`) and `@crew:` delegations. These wait until the session exists.
 * Plan mode and Save as draft travel with the first turn (see `newChatTurn`); provider slash
 * commands pass through as text.
 */
export type NewChatSessionOnly = "command" | "crew";
export function newChatSessionOnlyInput(text: string): NewChatSessionOnly | undefined {
  if (/^\s*\/(?:compact|btw)(?=\s|$)/i.test(text)) return "command";
  if (composerCrewHandles(text).length) return "crew";
  return undefined;
}

/**
 * How the first turn is delivered: a plain send, a send with the Host's `intent: "plan"`, or the
 * Host `draft` command (saved without starting the agent). The mode is the draft's leading
 * `/plan` or `/draft`, exactly as on an open session (`composer-mode.ts`); `body` is the text
 * without it.
 */
export type NewChatTurnKind = "send" | "plan" | "draft";
export function newChatTurn(text: string): { kind: NewChatTurnKind; body: string } {
  const mode = activeComposerMode(text);
  return { kind: mode ?? "send", body: (mode ? stripComposerMode(text) : text).trim() };
}

/**
 * The open session's suggestions as a new session can use them. Project files, folders, trackers,
 * notes, skills, Claude commands and templates need only the project and folder. What acts on an
 * existing conversation (compact, side question, history import, moving into a folder) and crew
 * delegations stay listed but unavailable with the reason; "New session" is this screen, so it goes.
 */
export function newChatSuggestions(
  items: readonly ComposerSuggestion[],
  reasons: { command: string; crew: string },
): ComposerSuggestion[] {
  return items.flatMap((item) => {
    if (item.id === "app:new") return [];
    if (item.unavailable) return [item];
    const crew = item.kind === "crew" || item.kind === "agent" || item.id === "source:crews";
    const command = item.action === "side-question" || item.action === "resume" || item.action === "move-to-folder" ||
      item.id === "app:compact";
    if (!crew && !command) return [item];
    // Unavailable rows never act, so the action that needs a session is dropped with it.
    const { action: _action, ...rest } = item;
    return [{ ...rest, unavailable: crew ? reasons.crew : reasons.command }];
  });
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

/**
 * One send attempt. The same payload keeps its command IDs, so a retry after a lost reply is
 * idempotent. The reference context resolved for it is kept too, so a resend never re-reads it.
 */
export type NewChatAttempt = { key: string; createId: string; turnId: string; contextReplay?: string };

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
  /** Plain send, Plan mode or Save as draft; a changed mode is a different first turn. */
  turn?: NewChatTurnKind;
  /** Staged attachment IDs, in order; a changed set is a different first turn. */
  attachments?: readonly string[];
  /** Resolved `@notes:` and issue/PR reference data the first turn carries beside its words. */
  contextReplay?: string;
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
    payload.turn ?? "send",
    payload.contextReplay ?? "",
  ]);
}

/**
 * Reuses the previous attempt's command IDs while the payload is unchanged (the Host replays the
 * receipt of a command it already accepted and refuses a changed payload under the same ID);
 * any change gets fresh IDs.
 */
export function newChatAttempt(
  previous: NewChatAttempt | undefined,
  key: string,
  makeId: () => string,
  contextReplay?: string,
): NewChatAttempt {
  return previous && previous.key === key
    ? previous
    : { key, createId: makeId(), turnId: makeId(), ...(contextReplay ? { contextReplay } : {}) };
}

/**
 * The reference context an unchanged payload already resolved. A resend after a lost reply reuses
 * it, so the same command IDs never carry different context (the Host would refuse the changed
 * payload); undefined means the context has to be resolved for this payload.
 */
export function newChatPinnedContext(
  previous: NewChatAttempt | undefined,
  payload: NewChatPayload,
): { contextReplay?: string } | undefined {
  if (!previous || previous.key !== newChatAttemptKey({ ...payload, contextReplay: previous.contextReplay })) return undefined;
  return previous.contextReplay ? { contextReplay: previous.contextReplay } : {};
}

/**
 * Which reference sources the first turn resolves into `contextReplay`, as an open session's
 * composer does at send: plain and Plan sends with an `@` mention (never Save as draft or a
 * provider slash command, whose arguments belong to the provider), each source only when the
 * computer offers it. Both need only the project, so a new session resolves them before create.
 */
export function newChatContextSources(
  text: string,
  kind: NewChatTurnKind,
  capabilities: readonly string[] | undefined,
): { workItems: boolean; notes: boolean } {
  const eligible = kind !== "draft" && text.includes("@") && (!/^\s*\//.test(text) || kind === "plan");
  return {
    workItems: eligible && !!capabilities?.includes("inbox.providers.desktop"),
    notes: eligible && !!capabilities?.includes("sessions.noteContext.v1"),
  };
}

/**
 * The prompt as the Host's nested first turn; it inherits the new session's ID. Uploaded
 * attachments travel with it, so the session and its first message with files are one command.
 * Plan mode sends with `intent: "plan"`; Save as draft is the Host `draft` command
 * (`CreateFirstTurnSchema` accepts both). `text` is the body without its mode command.
 * Resolved reference data rides on sends as `contextReplay`, outside the visible message; the Host
 * draft command has no such field, so a draft never carries it.
 */
export function newChatFirstTurn(
  text: string,
  commandId: string,
  attachments: readonly NewChatAttachmentReference[] = [],
  kind: NewChatTurnKind = "send",
  contextReplay?: string,
) {
  return {
    type: kind === "draft" ? ("draft" as const) : ("send" as const),
    commandId,
    sessionId: "" as const,
    text,
    ...(kind === "plan" ? { intent: "plan" as const } : {}),
    ...(attachments.length ? { attachments: [...attachments] } : {}),
    ...(contextReplay && kind !== "draft" ? { contextReplay } : {}),
  };
}

/**
 * Sends need words or attachments (as an open session's composer), a project, a resolved model
 * and no create or upload in flight or awaiting recovery. A mode command alone is not words: Plan
 * mode needs something to plan, and Save as draft needs words or a file (as on an open session).
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
  const turn = newChatTurn(text);
  if (!turn.body && (turn.kind === "plan" || !attachments)) return { enabled: false, reason: "empty" };
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

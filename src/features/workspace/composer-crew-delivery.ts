import type { HostTransport } from "@/remote/transport";
import { validateCrewDirectory } from "@/features/management/crews/model";
import {
  CREWS_MENTION_SCOPE,
  MAX_DELEGATIONS,
  crewMentionTargets,
  delegationNote,
  delegationRequestId,
  type CrewMentionTarget,
} from "../../../../src/features/sessions/model/crewMentions";
import { isSkillInvocationPosition } from "../../../../src/features/skills/model/skillTokens";

export function composerCrewHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(/(^|\s)@crews?:([a-z0-9][a-z0-9-]*)(?=[.,;:!?)\]}"']*(?:\s|$))/gi)) {
    if (isSkillInvocationPosition(text, match.index + match[1]!.length)) handles.add(match[2]!.toLowerCase());
    if (handles.size > MAX_DELEGATIONS) break;
  }
  return [...handles];
}

/** Resolve explicit Crew references against the same Host/project as the accepting session. */
export async function resolveComposerCrews(
  client: HostTransport,
  projectId: string,
  handles: string[],
  signal: AbortSignal,
) {
  const directory = validateCrewDirectory(
    await client.request("crews.list", { projectId, historyLimit: 1 }, { signal }), projectId,
  );
  const byHandle = new Map(crewMentionTargets({
    ...directory, machineId: client.machine.id, projectId,
    memberAsk: !!client.machine.capabilities?.includes("crews.member.ask.v1"),
  }).map((target) => [target.token, target]));
  return handles.map((handle) => ({ handle, target: byHandle.get(handle) }));
}

/** A retry of a partially accepted send repeats every target's original request ID. */
export async function deliverComposerCrews(
  client: HostTransport,
  input: { projectId: string; sessionId: string; intentId: string; text: string },
  targets: CrewMentionTarget[],
  signal: AbortSignal,
  check: () => void,
) {
  const notes: string[] = [];
  for (const target of targets) {
    check();
    const requestId = delegationRequestId(`${input.sessionId}:${input.intentId}`, target);
    const common = { projectId: input.projectId, prompt: input.text.trim(), requestId };
    if (target.kind === "member") {
      const response = await client.request<{ taskId?: string; id?: string }>("crews.member.ask",
        { ...common, memberId: target.id, parentSessionId: input.sessionId }, { signal, retry: false });
      notes.push(delegationNote(target, response.taskId ?? response.id));
    } else {
      const response = await client.request<{ id?: string; error?: string }>("crews.start",
        { ...common, definitionId: target.id, newConversation: true }, { signal, retry: false });
      if (response.error) throw new Error(response.error);
      notes.push(delegationNote(target, response.id));
    }
  }
  check();
  return notes.join("\n");
}

export function crewReferenceLabel(handle: string) {
  return `${CREWS_MENTION_SCOPE}${handle}`;
}

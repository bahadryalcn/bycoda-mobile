import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import type { InboxAvailabilityState, InboxItemInput, InboxOrigin } from "./provider-protocol";

const PROVIDER_NAMES: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  azuredevops: "Azure DevOps",
  linear: "Linear",
  jira: "Jira",
};

export const providerName = (provider: string) => PROVIDER_NAMES[provider] ?? provider;

export const inboxItemKey = (item: RemoteInboxItem) =>
  `${item.provider}:${item.repo}:${item.kind}:${item.id ?? item.number}`;

export const inboxOriginKey = (origin: InboxOrigin) =>
  JSON.stringify([origin.machineId, origin.projectId]);

export function inboxItemInput(item: RemoteInboxItem, projectId: string | null): InboxItemInput {
  return {
    item: {
      provider: item.provider,
      kind: item.kind,
      number: item.number,
      repo: item.repo,
      projectPath: item.projectPath,
      ...(item.id ? { id: item.id } : {}),
      ...(item.identifier ? { identifier: item.identifier } : {}),
    },
    ...(projectId ? { projectId } : {}),
  };
}

type CurrentInboxScope = { activeId: string | null; selectedProjectId: string | null };

export function isInboxOriginCurrent(origin: InboxOrigin, current: CurrentInboxScope): boolean {
  return origin.machineId === current.activeId && origin.projectId === current.selectedProjectId;
}

export function providerInboxAccess(availability: InboxAvailabilityState) {
  const ready =
    availability.data?.available === true &&
    availability.isSuccess &&
    availability.isEnabled !== false &&
    availability.fetchStatus !== "paused";
  return { canRead: ready, canWrite: ready };
}

export type ProviderInboxView =
  | { kind: "browse"; canRead: boolean }
  | { kind: "detail"; item: RemoteInboxItem; canRead: boolean };

/** Heartbeat changes access, never ownership of an already selected detail and its receipt. */
export function providerInboxView(
  selected: RemoteInboxItem | null,
  availability: InboxAvailabilityState,
): ProviderInboxView {
  const { canRead } = providerInboxAccess(availability);
  return selected ? { kind: "detail", item: selected, canRead } : { kind: "browse", canRead };
}

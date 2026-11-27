import { useSyncExternalStore } from "react";
import type { RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
import type { PrDiffAnchor, PrDiffFile } from "./provider-pr-diff-model";
import type { InboxOrigin } from "./provider-protocol";
import type { InboxRecordTarget } from "./inbox-record-route";

/**
 * The open review, as the file page pushed over it sees it. The review page owns the draft and
 * its delivery; while it stays mounted under the file page it publishes the files, pending
 * comments and editing callbacks here. A file page with no published review (a cold link) asks
 * the person to open the file from the review instead.
 */
export type PrReviewSession = {
  file: (path: string) => PrDiffFile | undefined;
  commitId?: string;
  comments: RemoteInboxReviewComment[];
  commenting: { enabled: boolean; reason?: string };
  save: (path: string, anchor: PrDiffAnchor, body: string, index?: number) => void;
  remove: (index: number) => void;
};

export const prReviewSessionKey = (origin: InboxOrigin, target: InboxRecordTarget) =>
  JSON.stringify([origin.machineId, origin.projectId, target.provider, target.repo, target.number, target.projectPath]);

const sessions = new Map<string, PrReviewSession>();
const listeners = new Set<() => void>();
export function publishPrReviewSession(key: string, session: PrReviewSession | null, owner?: PrReviewSession) {
  // A review page that unmounts retires only its own session, never a newer page's.
  if (!session && owner && sessions.get(key) !== owner) return;
  if (session) sessions.set(key, session); else sessions.delete(key);
  for (const listener of listeners) listener();
}
export function readPrReviewSession(key: string): PrReviewSession | null {
  return sessions.get(key) ?? null;
}
export function usePrReviewSession(key: string): PrReviewSession | null {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => readPrReviewSession(key));
}

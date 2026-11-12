import { create } from "zustand";

import type { WidgetSessionInput } from "./snapshot";

/** Structural slice of `useProjectActivity()`; the widget feature never imports workspace code. */
export interface ActivityLike {
  directory: readonly {
    project: { id: string; name: string };
    session: {
      id: string;
      title: string;
      status: "idle" | "running" | "interrupted";
      needsInput?: boolean;
      issue?: "retrying" | "failed";
      archived?: boolean;
      delegationParent?: unknown;
      updatedAt: number;
    };
  }[];
  directoryReady: boolean;
  privacyPending: boolean;
  privacyUnavailable: boolean;
  complete: boolean;
  error?: unknown;
}

export interface WidgetFeed {
  /** Computer the sessions belong to; a feed from another computer is never used. */
  machineId: string | null;
  ready: boolean;
  sessions: WidgetSessionInput[];
}

export const emptyFeed: WidgetFeed = { machineId: null, ready: false, sessions: [] };

/** Only a privacy-settled, complete, error-free directory may reach a widget. */
export function widgetFeedFromActivity(machineId: string | null, activity: ActivityLike): WidgetFeed {
  const ready =
    machineId !== null &&
    activity.directoryReady &&
    !activity.privacyPending &&
    !activity.privacyUnavailable &&
    activity.complete &&
    !activity.error;
  if (!ready) return { machineId, ready: false, sessions: [] };
  return {
    machineId,
    ready: true,
    sessions: activity.directory.map(({ project, session }) => ({
      id: session.id,
      projectId: project.id,
      projectName: project.name,
      title: session.title,
      status: session.status,
      needsInput: session.needsInput,
      issue: session.issue,
      archived: session.archived,
      child: !!session.delegationParent,
      updatedAt: session.updatedAt,
    })),
  };
}

export const useWidgetFeedStore = create<{ feed: WidgetFeed; set: (feed: WidgetFeed) => void }>(
  (set) => ({ feed: emptyFeed, set: (feed) => set({ feed }) }),
);

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { HostProjectDirectory } from "@/domain/types";
import { useActiveMachine } from "@/state/machines";
import { hostKey, useHostClient } from "@/state/queries";
import { projectPrivacyKey } from "../workspace/project-privacy-cache";
import {
  cacheHoldsProject,
  groupLockView,
  GROUP_LOCK_TIMEOUT_MS,
  parsePasswordResult,
  passwordOutcomeFromError,
  supportsGroupLock,
  withGroupsLocked,
  type PasswordOutcome,
} from "./group-lock-model";

/** Groups this phone unlocked, per computer. Memory only, like the Host's own grants. */
const useGrants = create<{
  byMachine: Record<string, readonly string[]>;
  add: (machineId: string, groupId: string) => void;
  remove: (machineId: string, groupIds: readonly string[]) => void;
}>((set) => ({
  byMachine: {},
  add: (machineId, groupId) =>
    set((state) => ({
      byMachine: {
        ...state.byMachine,
        [machineId]: [...new Set([...(state.byMachine[machineId] ?? []), groupId])],
      },
    })),
  remove: (machineId, groupIds) =>
    set((state) => ({
      byMachine: {
        ...state.byMachine,
        [machineId]: (state.byMachine[machineId] ?? []).filter((id) => !groupIds.includes(id)),
      },
    })),
}));

/**
 * Locked and hidden groups of the active computer, and the actions on them. Passwords go
 * straight to the request and are never kept in a mutation, query key or store.
 */
export function useGroupLock(directory: HostProjectDirectory | undefined) {
  const machine = useActiveMachine();
  const client = useHostClient();
  const cache = useQueryClient();
  const machineId = machine?.id;
  const supported = supportsGroupLock(machine?.capabilities) && !!client;
  const granted = useGrants((state) => (machineId ? state.byMachine[machineId] : undefined));
  const view = useMemo(
    () => groupLockView(directory, new Set(granted ?? [])),
    [directory, granted],
  );

  const refresh = useCallback(async () => {
    if (!machineId) return;
    // A refetch, not an invalidation: the directory stays readable while the Host answers.
    await cache.refetchQueries({ queryKey: hostKey(machineId, ["projects"]), type: "active" });
  }, [cache, machineId]);

  const attempt = useCallback(
    async (method: string, params: Record<string, unknown>): Promise<PasswordOutcome> => {
      if (!client) return { state: "failed" };
      try {
        return parsePasswordResult(
          await client.request(method, params, { timeoutMs: GROUP_LOCK_TIMEOUT_MS }),
        );
      } catch (error) {
        return passwordOutcomeFromError(error);
      }
    },
    [client],
  );

  const unlock = useCallback(
    async (groupId: string, password: string) => {
      const outcome = await attempt("projects.groups.unlock", { groupId, password });
      if (outcome.state === "ok" && machineId) {
        useGrants.getState().add(machineId, groupId);
        await refresh().catch(() => undefined);
      }
      return outcome;
    },
    [attempt, machineId, refresh],
  );

  const authorizeHidden = useCallback(
    async (password: string) => {
      const outcome = await attempt("projects.groups.authorizeHidden", { password });
      if (outcome.state === "ok") await refresh().catch(() => undefined);
      return outcome;
    },
    [attempt, refresh],
  );

  const setHidden = useCallback(
    async (groupId: string, hidden: boolean): Promise<boolean> => {
      if (!client) return false;
      try {
        await client.request(
          "projects.groups.setHidden",
          { groupId, hidden },
          { timeoutMs: GROUP_LOCK_TIMEOUT_MS },
        );
      } catch {
        return false;
      }
      await refresh().catch(() => undefined);
      return true;
    },
    [client, refresh],
  );

  /** Locks one group, or every group this phone unlocked, and forgets their cached data. */
  const lock = useCallback(
    async (groupId?: string): Promise<boolean> => {
      if (!client || !machineId || !directory) return false;
      try {
        await client.request("projects.groups.lock", groupId ? { groupId } : {});
      } catch {
        return false;
      }
      // Without an id the Host dropped every grant: close every group this phone unlocked.
      const closing = new Set(groupId ? [groupId] : (granted ?? []));
      const projectIds = new Set(
        directory.projects.filter((p) => p.groupId && closing.has(p.groupId)).map((p) => p.id),
      );
      cache.removeQueries({
        predicate: (query) => cacheHoldsProject(query, machineId, projectIds),
      });
      cache.setQueryData<HostProjectDirectory>(projectPrivacyKey(machineId, true), (current) =>
        current ? withGroupsLocked(current, closing) : current,
      );
      useGrants.getState().remove(machineId, [...closing]);
      await refresh().catch(() => undefined);
      return true;
    },
    [client, machineId, directory, granted, cache, refresh],
  );

  return { supported, ...view, unlock, authorizeHidden, setHidden, lock };
}

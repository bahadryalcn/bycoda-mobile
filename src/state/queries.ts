import { useEffect, useMemo } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { focusManager, onlineManager, useMutation, useQuery, useQueryClient, type MutateOptions } from "@tanstack/react-query";
import { HostTransport } from "../remote/transport";
import { credentials, useActiveMachine, useMachines } from "./machines";
import { assertAppAccess, useSecurity } from "./security";
import {
  assertProviderPermission,
  readPermittedCredential,
  useProviderPermission,
} from "../features/privacy/consent-access";
import { consentScope } from "../features/privacy/consent-store";
import {
  hostKey,
  hostMutationOptions,
  type HostWrite,
  type HostWriteContext,
} from "./host-request";

import { attachmentReleases } from "../features/workspace/attachment-ownership";

export { hostKey } from "./host-request";
/** Stack routes stay mounted. Only the visible foreground route should refresh host data. */
export function useHostReadActive() {
  const focused = useIsFocused();
  const available = useSecurity((state) =>
    state.status === "unlocked" && state.appState === "active" && state.windowFocused,
  );
  return focused && available;
}

export function useHostClient() {
  const machine = useActiveMachine();
  const unlocked = useSecurity((s) => s.status === "unlocked");
  const ready = useMachines((s) => s.hydrated && !s.storageError && !s.connectionPending);
  const scope = machine ? consentScope(machine.environmentId, machine.providers ?? []) : "";
  const consented = useProviderPermission((state) => state.scopes[scope] === true);
  const client = useMemo(() => {
    if (!machine || !unlocked || !ready || !consented) return null;
    const assertAccess = () => {
      assertAppAccess();
      assertProviderPermission(
        useMachines.getState().machines.find((value) => value.id === machine.id),
      );
    };
    return new HostTransport(
      machine,
      () => readPermittedCredential(() => credentials.get(machine.id, machine), assertAccess),
      undefined,
      assertAccess,
    );
  }, [
    machine?.id,
    machine?.endpoint,
    machine?.lanKey,
    machine?.environmentId,
    unlocked,
    ready,
    consented,
    scope,
    machine?.capabilities,
  ]);
  return client;
}

/** One app-level retry subscription; draft claims survive navigation and suspension. */
export function useAttachmentReleaseRetry() {
  const client = useHostClient();
  useEffect(() => {
    if (!client) return;
    const flush = () => {
      const access = useSecurity.getState();
      if (focusManager.isFocused() && access.status === "unlocked" && access.appState === "active" && access.windowFocused)
        void attachmentReleases.flush(client).catch(() => {});
    };
    flush();
    const online = onlineManager.subscribe((connected) => { if (connected) flush(); });
    const focus = focusManager.subscribe((focused) => { if (focused) flush(); });
    return () => { online(); focus(); };
  }, [client]);
}
export function useHostQuery<T>(
  key: readonly unknown[],
  method: string,
  params: Record<string, unknown> = {},
  options: { enabled?: boolean; interval?: number; queryFn?: (client: HostTransport, signal: AbortSignal) => Promise<T> } = {},
) {
  const machine = useActiveMachine();
  const client = useHostClient();
  const active = useHostReadActive();
  const query = useQuery<T>({
    queryKey: hostKey(machine?.id ?? null, [...key, { method, params }]),
    queryFn: ({ signal }) => {
      if (!client) throw new Error("Choose a computer first.");
      return options.queryFn ? options.queryFn(client, signal) : client.request<T>(method, params, { signal });
    },
    enabled: !!client && active && options.enabled !== false,
    staleTime: 4000,
    retry: false,
    // Hosts can be reachable on a LAN without internet connectivity.
    networkMode: "always",
    refetchInterval: options.interval ?? false,
    refetchIntervalInBackground: false,
  });
  const kind = (query.error as { kind?: string } | null)?.kind;
  if (query.isError && (kind === "auth" || kind === "identity")) {
    // A transient refresh failure may retain content; lost authorization or a
    // changed computer identity must not continue exposing cached host data.
    return { ...query, data: undefined, isLoadingError: true as const, isRefetchError: false as const };
  }
  return query;
}
export function useHostMutation<T = unknown>(method: string, invalidate: readonly unknown[] = []) {
  const machine = useActiveMachine();
  const client = useHostClient();
  const cache = useQueryClient();
  const mutation = useMutation<T, Error, HostWrite, HostWriteContext>({
    ...hostMutationOptions<T>(cache),
    mutationKey: hostKey(machine?.id ?? null, ["write", method]),
  });
  type Options = MutateOptions<T, Error, Record<string, unknown>, HostWriteContext>;
  const snapshot = (params: Record<string, unknown>): HostWrite => ({
    client,
    method,
    params,
    invalidate,
  });
  const callbacks = (
    options?: Options,
  ): MutateOptions<T, Error, HostWrite, HostWriteContext> | undefined =>
    options
      ? {
          onSuccess: (data, write, context, result) =>
            options.onSuccess?.(data, write.params, context, result),
          onError: (error, write, context, result) =>
            options.onError?.(error, write.params, context, result),
          onSettled: (data, error, write, context, result) =>
            options.onSettled?.(data, error, write.params, context, result),
        }
      : undefined;
  return {
    ...mutation,
    variables: mutation.variables?.params,
    mutate: (params: Record<string, unknown>, options?: Options) =>
      mutation.mutate(snapshot(params), callbacks(options)),
    mutateAsync: (params: Record<string, unknown>, options?: Options) =>
      mutation.mutateAsync(snapshot(params), callbacks(options)),
  };
}

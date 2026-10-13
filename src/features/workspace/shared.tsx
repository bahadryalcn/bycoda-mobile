import { useCallback } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { hostKey, useHostClient } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, Card, ErrorText, MutationState, Notice } from "@/ui/primitives";
import { colors } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import type { CommandReceipt } from "./wire";
import { dispatchCommand, UncertainCommand } from "./commands";
import { isProjectWorkspaceQuery } from "./project-cache";
import type { CommandInvocation, CommandErrorProps, CommandStatusCheck } from "./shared-types";
export { UncertainCommand } from "./commands";
export { SelectRow, ErrorText } from "@/ui/primitives";

export const palette = {
  base: colors.background,
  panel: colors.panel,
  raised: colors.raised,
  text: colors.text,
  muted: colors.muted,
  accent: colors.accent,
  active: colors.live,
  border: colors.border,
  good: colors.success,
  bad: colors.danger,
};
export const workspaceStyles = {
  stack: uiStyles.stack,
  row: uiStyles.row,
  mono: uiStyles.mono,
  press: uiStyles.press,
};

export function useProjectRefresh(projectId: string) {
  const cache = useQueryClient();
  const machineId = useActiveMachine()?.id ?? null;
  return useCallback(
    () =>
      cache.invalidateQueries({
        predicate: (query) => isProjectWorkspaceQuery(query.queryKey, machineId, projectId),
      }),
    [cache, machineId, projectId],
  );
}

export function useCommands(invalidate: readonly unknown[] = []) {
  const client = useHostClient();
  const machine = useActiveMachine();
  const cache = useQueryClient();
  const mutation = useMutation<CommandReceipt, Error, CommandInvocation>({
    retry: false,
    networkMode: "always",
    gcTime: 0,
    mutationFn: async (invocation) => {
      if (!invocation.client) throw new Error("Connect to a computer first.");
      return dispatchCommand(invocation.client, invocation.commandId, invocation.params);
    },
    onSuccess: (_receipt, invocation) => {
      void cache.invalidateQueries({
        queryKey: hostKey(invocation.machineId, invocation.invalidate),
      });
    },
  });
  const mutateAsync = useCallback(
    (params: Record<string, unknown>) =>
      mutation.mutateAsync({
        client,
        machineId: machine?.id ?? null,
        params,
        commandId: Crypto.randomUUID(),
        invalidate: [...invalidate],
      }),
    [mutation.mutateAsync, client, machine?.id, invalidate],
  );
  const mutate = useCallback(
    (params: Record<string, unknown>) => {
      void mutateAsync(params).catch(() => {});
    },
    [mutateAsync],
  );
  return { ...mutation, mutateAsync, mutate };
}

export function CommandError({ error, onRecovered, onDismiss }: CommandErrorProps) {
  const copy = useCopy();
  const client = error instanceof UncertainCommand ? error.client : null;
  const check = useMutation({
    networkMode: "always",
    retry: false,
    gcTime: 0,
    mutationFn: async (invocation: CommandStatusCheck) => ({
      commandId: invocation.commandId,
      receipt: await invocation.client.request<CommandReceipt | null>("commands.status", {
        commandId: invocation.commandId,
      }),
    }),
    onSuccess: (result, invocation) => {
      if (result.receipt) invocation.recovered?.(result.receipt);
    },
  });
  if (!error) return null;
  const current =
    error instanceof UncertainCommand && check.data?.commandId === error.commandId
      ? check.data
      : null;
  return (
    <Card>
      <View style={workspaceStyles.stack}>
        <ErrorText
          error={error}
          message={error instanceof UncertainCommand
            ? copy(
                "Bağlantı kesildi. Yeniden denemeden önce bilgisayarın komutu alıp almadığını kontrol et.",
                "Connection interrupted. Check whether the computer accepted this command before trying again.",
              )
            : undefined}
        />
        {error instanceof UncertainCommand && client ? (
          <Button
            label={copy("Komut durumunu kontrol et", "Check command status")}
            onPress={() => {
              void check
                .mutateAsync({ commandId: error.commandId, client, recovered: onRecovered })
                .catch(() => {});
            }}
            busy={check.isPending}
          />
        ) : null}
        <MutationState mutation={check} />
        {current ? (
          <Notice
            tone={current.receipt ? "success" : "warning"}
            message={
              current.receipt
                ? copy("Komut bilgisayara ulaştı.", "The computer accepted this command.")
                : copy(
                    "Kayıt bulunamadı. Tekrar denemeden önce güncel durumu yenileyin.",
                    "No receipt found. Refresh the current state before trying again.",
                  )
            }
          />
        ) : null}
        {current && !current.receipt && onDismiss ? (
          <>
            <Body muted>
              {copy(
                "Güncel durumu yenileyip komutun uygulanıp uygulanmadığını kontrol et. Devam etmek komutu yeniden göndermez.",
                "Refresh the current state and check whether the action happened. Continuing does not resend the command.",
              )}
            </Body>
            <Button
              label={copy("Kontrol ettim, devam et", "I checked, continue")}
              disabled={check.isPending}
              onPress={onDismiss}
            />
          </>
        ) : null}
      </View>
    </Card>
  );
}

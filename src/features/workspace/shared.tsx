import { useCallback, type PropsWithChildren } from "react";
import { View } from "react-native";
import { Badge as PanelBadge } from "panelui-native/components/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, Card, ErrorText, MutationState, Notice, Separator } from "@/ui/primitives";
import type { MobileColors } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { shortDate } from "../management/shared/format";
import type { CommandReceipt, HostSessionSummary } from "./wire";
import { dispatchCommand, UncertainCommand } from "./commands";
import { isProjectWorkspaceQuery } from "./project-cache";
import { invalidateCommandQueries } from "./command-cache";
import { sessionRowKind } from "./session-row-state";
import type { CommandInvocation, CommandErrorProps, CommandStatusCheck } from "./shared-types";
export { UncertainCommand } from "./commands";
export { SelectRow, ErrorText } from "@/ui/primitives";

export type CopyFn = ReturnType<typeof useCopy>;

/** Short relative stamps like desktop: whole elapsed units (floor), a short date after a week. */
export function relativeTime(value: number | undefined, copy: CopyFn, now = Date.now()) {
  if (!value || !Number.isFinite(value)) return "";
  const minutes = Math.floor((now - value) / 60_000);
  if (minutes < 1) return copy("Şimdi", "Now");
  if (minutes < 60) return copy("{p0} dk", "{p0} min", { p0: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy("{p0} sa", "{p0} h", { p0: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return copy("{p0} g", "{p0} d", { p0: days });
  return shortDate(value, now);
}

export type SessionStatus = { label: string; color: string };

/** Status is always spoken in the row detail too, so color is never the only signal. */
export function sessionStatus(
  session: Pick<HostSessionSummary, "needsInput" | "status" | "pinned" | "issue" | "waiting">,
  copy: CopyFn,
  colors: MobileColors,
  /** The session finished while the owner was elsewhere. */
  done = false,
): SessionStatus {
  switch (sessionRowKind(session, done)) {
    case "failed":
      return { label: copy("Başarısız", "Failed"), color: colors.danger };
    case "retrying":
      return { label: copy("Yeniden deneniyor", "Retrying"), color: colors.warning };
    case "interrupted":
      return { label: copy("Durduruldu", "Interrupted"), color: colors.warning };
    case "input":
      return { label: copy("Girdi gerekiyor", "Needs input"), color: colors.warning };
    case "working":
      return { label: copy("Çalışıyor", "Working"), color: colors.live };
    case "waiting":
      return { label: copy("Bekliyor", "Waiting"), color: colors.muted };
    case "done":
      return { label: copy("Tamam", "Done"), color: colors.success };
    default:
      if (session.pinned) return { label: copy("Sabit", "Pinned"), color: colors.muted };
      return { label: copy("Hazır", "Ready"), color: colors.muted };
  }
}

export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  useMobileTheme();
  return (
    <PanelBadge
      shape="dot"
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
    />
  );
}

/**
 * A virtualized list row (or a row with a trailing control beside it) with the same hairline a
 * `NavigationGroup` row draws, so flat lists match grouped rows everywhere.
 */
export function GroupedListRow({
  children,
  last,
}: PropsWithChildren<{ first: boolean; last: boolean }>) {
  return (
    <View>
      {children}
      {last ? null : <Separator />}
    </View>
  );
}

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
      void invalidateCommandQueries(
        cache,
        invocation.machineId,
        invocation.invalidate,
        invocation.params,
      );
    },
  });
  const mutateAsync = useCallback(
    (params: Record<string, unknown>) =>
      mutation.mutateAsync({
        client,
        machineId: machine?.id ?? null,
        params: { ...params },
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
  const { uiStyles } = useMobileTheme();
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
      <View style={uiStyles.stack}>
        <ErrorText
          error={error}
          message={
            error instanceof UncertainCommand
              ? copy(
                  "Bağlantı kesildi. Yeniden denemeden önce bilgisayarın komutu alıp almadığını kontrol et.",
                  "Connection interrupted. Check whether the computer accepted this command before trying again.",
                )
              : undefined
          }
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge, Body, Button, ErrorNotice, FormActions, Field, NavigationGroup, NavigationRow, Section, Sheet, Stack } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { Device } from "../contracts";
import { useAccount } from "./account-context";

const KEY = ["account", "devices"] as const;

/** Devices on the account: this phone is marked, any device can be renamed or signed out remotely. */
export function DevicesSection() {
  const copy = useCopy();
  const { runtime, device: self } = useAccount();
  const queries = useQueryClient();
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [name, setName] = useState("");
  const occupied = useRef(false);
  const renamingRef = useRef(renaming);
  renamingRef.current = renaming;
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => runtime!.client.listDevices(),
    enabled: !!runtime && !!self,
  });
  const refresh = () => queries.invalidateQueries({ queryKey: KEY });
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      runtime!.client.renameDevice({ params: { id: input.id }, body: { name: input.name } }),
    onSuccess: async (_saved, input) => {
      if (renamingRef.current?.id === input.id) setRenaming(null);
      await refresh();
    },
    onSettled: () => { occupied.current = false; },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => runtime!.client.revokeDevice({ params: { id } }),
    onSuccess: refresh,
    onSettled: () => { occupied.current = false; },
  });
  const busy = rename.isPending || revoke.isPending;
  const close = () => { if (!occupied.current && !busy) setRenaming(null); };

  const items = (list.data?.items ?? []).filter((item) => !item.revokedAt);
  const isSelf = (item: Device) => item.id === self?.id || item.current === true;
  const askRevoke = (item: Device) =>
    confirmAction(
      copy("{p0} oturumu kapatılsın mı?", "Sign out {p0}?", { p0: item.name }),
      copy("Bu cihaz hesabından çıkarılır. Cihazdaki yerel veriler silinmez.", "This device is removed from your account. Local data on it is kept."),
      copy("Oturumu kapat", "Sign out"),
      () => {
        if (occupied.current) return;
        occupied.current = true;
        revoke.mutate(item.id);
      },
      copy("Vazgeç", "Cancel"),
    );
  return (
    <Section title={copy("Cihazlar", "Devices")}>
      <Stack>
        <ErrorNotice error={list.error} onRetry={() => void list.refetch()} message={copy("Cihazlar alınamadı.", "Devices could not be loaded.")} />
        <ErrorNotice error={revoke.error} message={copy("Oturum kapatılamadı.", "Could not sign out that device.")} />
        {list.isPending && !list.error ? <Body muted>{copy("Yükleniyor…", "Loading…")}</Body> : null}
        <NavigationGroup>
          {items.map((item) => (
            <NavigationRow
              key={item.id}
              label={item.name}
              detail={`${item.osVersion} · ${item.appVersion}`}
              trailing={isSelf(item) ? <Badge label={copy("Bu cihaz", "This device")} /> : undefined}
              disabled={busy}
              onPress={() => {
                if (occupied.current) return;
                setRenaming(item);
                setName(item.name);
                rename.reset();
              }}
            />
          ))}
        </NavigationGroup>
      </Stack>
      {renaming ? (
        <Sheet visible size="compact" title={renaming.name} dirty={name.trim() !== renaming.name} dismissible={!busy} onClose={close}>
          <Stack>
            <Field label={copy("Cihaz adı", "Device name")} value={name} onChangeText={setName} editable={!busy} maxLength={80} />
            <ErrorNotice error={rename.error} message={copy("Ad kaydedilemedi.", "The name could not be saved.")} />
            <DeviceRenameActions dirty={name.trim() !== renaming.name} busy={busy}
              disabled={!name.trim() || name.trim() === renaming.name}
              onCancel={close}
              onSubmit={() => {
                if (occupied.current || !name.trim() || name.trim() === renaming.name) return;
                occupied.current = true;
                rename.mutate({ id: renaming.id, name: name.trim() });
              }}
              onRevoke={!isSelf(renaming) ? () => askRevoke(renaming) : undefined} />
          </Stack>
        </Sheet>
      ) : null}
    </Section>
  );
}

/** Rename, dismissal and remote sign-out share one pending/dirty guard. */
function DeviceRenameActions({ dirty, busy, disabled, onSubmit, onCancel, onRevoke }: {
  dirty: boolean; busy: boolean; disabled: boolean;
  onSubmit(): void; onCancel(): void; onRevoke?: () => void;
}) {
  const copy = useCopy();
  const guard = useSheetGuard({ dirty, pending: busy, onClose: onCancel });
  return <>
    <FormActions submitLabel={copy("Kaydet", "Save")} tone="primary"
      dirty={dirty} busy={busy} disabled={disabled} cancelDisabled={busy}
      cancelLabel={copy("Vazgeç", "Cancel")} onSubmit={onSubmit} onCancel={guard.requestClose} />
    {onRevoke ? <Button label={copy("Bu cihazın oturumunu kapat", "Sign out this device")}
      tone="danger" disabled={busy} onPress={() => guard.requestCloseThen(onRevoke)} /> : null}
  </>;
}

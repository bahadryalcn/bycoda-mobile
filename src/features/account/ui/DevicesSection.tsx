import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Body, Button, ErrorNotice, FormActions, Field, NavigationGroup, NavigationRow, Section, SettingIcon, Sheet, Skeleton, Stack, StatusText } from "@/ui/primitives";
import Globe from "lucide-react-native/icons/globe";
import Laptop from "lucide-react-native/icons/laptop";
import Smartphone from "lucide-react-native/icons/smartphone";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";
import { useLocale } from "@/i18n";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { Device } from "../contracts";
import { useAccount } from "./account-context";
import { useGracedReadError } from "./use-graced-read-error";
import { deviceDetail, deviceGlyphKind } from "./device-row-model";

const GLYPHS = { phone: Smartphone, web: Globe, computer: Laptop } as const;

const KEY = ["account", "devices"] as const;

/** Devices on the account: this phone is marked, any device can be renamed or signed out remotely. */
export function DevicesSection() {
  const copy = useCopy();
  const locale = useLocale();
  const { runtime, status, device: self } = useAccount();
  const queries = useQueryClient();
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [name, setName] = useState("");
  const occupied = useRef(false);
  const renamingRef = useRef(renaming);
  renamingRef.current = renaming;
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => runtime!.client.listDevices(),
    // Listed even when this phone failed to register, so a full device limit can be resolved from here.
    enabled: !!runtime && status === "signedIn",
  });
  const listError = useGracedReadError(list);
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
    mutationFn: (input: { id: string; name: string }) => runtime!.client.revokeDevice({ params: { id: input.id } }),
    onSuccess: async (_result, input) => {
      showToast({ message: copy("{p0} oturumu kapatıldı.", "{p0} was signed out.", { p0: input.name }) });
      await refresh();
    },
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
        revoke.mutate({ id: item.id, name: item.name });
      },
      copy("Vazgeç", "Cancel"),
    );
  return (
    <Section title={copy("Cihazlar", "Devices")}>
      <Stack>
        <ErrorNotice error={listError} onRetry={() => void list.refetch()} message={copy("Cihazlar alınamadı.", "Devices could not be loaded.")} />
        <ErrorNotice error={revoke.error} message={copy("Oturum kapatılamadı.", "Could not sign out that device.")} />
        {/* isLoading stays false while the query is disabled, so a failed phone registration cannot spin forever. */}
        {list.isLoading ? <Skeleton variant="content" rows={2} /> : null}
        {list.isSuccess && items.length === 0 ? (
          <Body muted>{copy("Bu hesapta kayıtlı cihaz yok.", "No devices are registered to this account.")}</Body>
        ) : null}
        {items.length ? <NavigationGroup>
          {items.map((item, index) => (
            <NavigationRow
              key={item.id}
              label={item.name}
              icon={<SettingIcon glyph={GLYPHS[deviceGlyphKind(item)]} />}
              detail={deviceDetail(item, locale, copy)}
              detailLines={2}
              trailing={isSelf(item) ? <StatusText label={copy("Bu cihaz", "This device")} /> : undefined}
              separator={index < items.length - 1}
              // The row being signed out shows the progress; the others wait without it.
              busy={revoke.isPending && revoke.variables?.id === item.id}
              disabled={busy}
              onPress={() => {
                if (occupied.current) return;
                setRenaming(item);
                setName(item.name);
                rename.reset();
              }}
            />
          ))}
        </NavigationGroup> : null}
      </Stack>
      {renaming ? (
        <Sheet visible size="compact" title={copy("Cihazı düzenle", "Edit device")} dirty={name.trim() !== renaming.name} dismissible={!busy} onClose={close}>
          <Stack>
            <Body muted>{deviceDetail(renaming, locale, copy)}</Body>
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

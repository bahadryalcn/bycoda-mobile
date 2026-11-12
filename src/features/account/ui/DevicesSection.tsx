import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Body, Button, ErrorNotice, Input, NavigationGroup, NavigationRow, Section, Sheet, Stack } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
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
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => runtime!.client.listDevices(),
    enabled: !!runtime && !!self,
  });
  const refresh = () => queries.invalidateQueries({ queryKey: KEY });
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      runtime!.client.renameDevice({ params: { id: input.id }, body: { name: input.name } }),
    onSuccess: async () => {
      setRenaming(null);
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => runtime!.client.revokeDevice({ params: { id } }),
    onSuccess: refresh,
  });

  const items = (list.data?.items ?? []).filter((item) => !item.revokedAt);
  const isSelf = (item: Device) => item.id === self?.id || item.current === true;
  const askRevoke = (item: Device) =>
    confirmAction(
      copy("{p0} oturumu kapatılsın mı?", "Sign out {p0}?", { p0: item.name }),
      copy("Bu cihaz hesabından çıkarılır. Cihazdaki yerel veriler silinmez.", "This device is removed from your account. Local data on it is kept."),
      copy("Oturumu kapat", "Sign out"),
      () => revoke.mutate(item.id),
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
              onPress={() => {
                setRenaming(item);
                setName(item.name);
                rename.reset();
              }}
            />
          ))}
        </NavigationGroup>
      </Stack>
      {renaming ? (
        <Sheet visible size="compact" title={renaming.name} onClose={() => setRenaming(null)}>
          <Stack>
            <Input label={copy("Cihaz adı", "Device name")} value={name} onChangeText={setName} maxLength={80} />
            <ErrorNotice error={rename.error} message={copy("Ad kaydedilemedi.", "The name could not be saved.")} />
            <Button
              label={copy("Kaydet", "Save")}
              tone="primary"
              busy={rename.isPending}
              disabled={!name.trim() || name.trim() === renaming.name || rename.isPending}
              onPress={() => rename.mutate({ id: renaming.id, name: name.trim() })}
            />
            {!isSelf(renaming) ? (
              <Button
                label={copy("Bu cihazın oturumunu kapat", "Sign out this device")}
                tone="danger"
                onPress={() => {
                  const target = renaming;
                  setRenaming(null);
                  askRevoke(target);
                }}
              />
            ) : null}
          </Stack>
        </Sheet>
      ) : null}
    </Section>
  );
}

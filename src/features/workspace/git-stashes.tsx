import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { ActionMenu, Body, Button, Field, FormActions, MutationState, NavigationRow, Notice, QueryState, Row, ScreenList, SelectField, Sheet } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { readStashes, stashRequest, uncertainStashWrite, type GitStash, type StashMode, type StashOperation } from "./git-stash-model";
import type { GitScope } from "./git-types";

export function GitStashes({ scope, onClose, onBusyChange, registerExit }: {
  scope: GitScope; onClose: () => void; onBusyChange: (busy: boolean) => void;
  registerExit: (exit: (() => void) | null) => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [openingMachine] = useState(machine?.id);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<GitStash | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<StashMode>("untracked");
  const occupied = useRef(false);
  const supported = machine?.capabilities?.includes("workspace.run") && machine.capabilities.includes("git.actions");
  const query = useHostQuery<GitStash[]>(["git-stashes", scope.projectId, scope.root], "workspace.run", {}, {
    enabled: !!scope.root && !!supported,
    queryFn: async (client, signal) => readStashes(await client.request<unknown>("workspace.run", { command: "git_stash_list", args: { cwd: scope.root } }, { signal })),
  });
  const mutation = useHostMutation("workspace.run", ["git", scope.projectId]);
  const uncertain = uncertainStashWrite(mutation.error);
  const unavailable = !supported || !scope.root || query.isError || !query.isSuccess || uncertain || mutation.isPending;
  const write = (operation: StashOperation) => {
    if (occupied.current || unavailable || useMachines.getState().activeId !== openingMachine) return;
    occupied.current = true;
    onBusyChange(true);
    void mutation.mutateAsync(stashRequest(scope, operation)).then(() => {
      setSelected(null);
      if (operation.kind === "create") { setMessage(""); setMode("untracked"); setCreating(false); }
      void query.refetch();
    }).catch(() => { void query.refetch(); }).finally(() => { occupied.current = false; onBusyChange(false); });
  };
  const close = useCallback(() => {
    if (occupied.current) return;
    if (selected) { setSelected(null); return; }
    if (creating) { setCreating(false); return; }
    if (message || mode !== "untracked") {
      confirmAction(copy("Stash taslağını bırak?", "Leave stash draft?"),
        copy("Kaydedilmemiş stash açıklaması bırakılacak. Dosyalar değişmez.", "The unsaved stash description will be discarded. Files stay unchanged."),
        copy("Vazgeç", "Cancel"), onClose, copy("Geri", "Back"));
    } else onClose();
  }, [selected, creating, message, mode, onClose, copy]);
  useEffect(() => { registerExit(close); return () => registerExit(null); }, [close, registerExit]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));
  const act = (kind: "apply" | "pop" | "drop", stash: GitStash) => {
    const label = kind === "apply" ? copy("Uygula", "Apply") : kind === "pop" ? copy("Uygula ve kaldır", "Apply and remove") : copy("Stash’i sil", "Delete stash");
    confirmAction(label, `${scope.root}\n\nstash@{${stash.index}} · ${stash.message}\n${stash.sha}`, label, () => write({ kind, stash }), copy("Vazgeç", "Cancel"));
  };
  return <>
    <ScreenList data={supported ? query.data ?? [] : []} keyExtractor={(item) => item.sha + ":" + item.index} query={query}
      header={<View style={{ gap: space.sm }}>
        <Button tone="quiet" label={copy("Geri", "Back")} disabled={mutation.isPending} onPress={close} />
        <Body mono>{scope.root}</Body>
        <Body>{copy("Stash’ler", "Stashes")}</Body>
        {!supported ? <Notice message={copy("Stash yönetimi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to manage stashes.")} /> : <>
          <QueryState query={query} empty={query.isSuccess && query.data?.length === 0} emptyTitle={copy("Kaydedilmiş stash yok.", "No saved stashes.")} />
          <MutationState mutation={mutation} />
          {uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden denemeden önce bu bilgisayardaki değişiklikleri ve stash listesini incele.", "The result is uncertain. Review this computer’s changes and stash list before trying again.")} /> : null}
          <Button label={copy("Stash oluştur", "Create stash")} disabled={unavailable} onPress={() => setCreating(true)} />
          <ActionMenu label={copy("Stash işlemleri", "Stash actions")} actions={[{
            key: "clear", label: copy("Tüm stash’leri sil", "Delete all stashes"), destructive: true,
            disabled: unavailable || !query.data?.length || !machine?.capabilities?.includes("git.stash.clearSnapshot"),
            onPress: () => { const stashes = query.data; if (!stashes?.length) return;
              confirmAction(copy("Tüm stash’leri sil", "Delete all stashes"), `${scope.root}\n\n${copy("İncelediğin listedeki tüm stash’ler kalıcı olarak silinecek.", "All stashes in the reviewed list will be permanently deleted.")}\n${stashes.length}`,
                copy("Sil", "Delete"), () => write({ kind: "clear", stashes }), copy("Vazgeç", "Cancel"));
            },
          }]} />
        </>}
      </View>}
      renderItem={({ item }) => <NavigationRow label={item.message} detail={`stash@{${item.index}} · ${new Date(item.timestamp * 1000).toLocaleDateString()}\n${item.sha}`}
        disabled={mutation.isPending} onPress={() => setSelected(item)} />} />
    <Sheet visible={!!selected} size="compact" title={copy("Stash işlemleri", "Stash actions")} dismissible={!mutation.isPending} onClose={() => setSelected(null)}>
      {selected ? <><Body>{selected.message}</Body><Body mono>{selected.sha}</Body><Row>
        <Button label={copy("Uygula", "Apply")} disabled={unavailable} onPress={() => act("apply", selected)} />
        <Button label={copy("Uygula ve kaldır", "Apply and remove")} disabled={unavailable} onPress={() => act("pop", selected)} />
        <Button tone="danger" label={copy("Stash’i sil", "Delete stash")} disabled={unavailable} onPress={() => act("drop", selected)} />
      </Row><MutationState mutation={mutation} /></> : null}
    </Sheet>
    <Sheet visible={creating} size="form" title={copy("Stash oluştur", "Create stash")} dirty={!!message || mode !== "untracked"} dismissible={!mutation.isPending} onClose={() => setCreating(false)}>
      <Field label={copy("Açıklama (isteğe bağlı)", "Description (optional)")} value={message} maxLength={1000} editable={!mutation.isPending} onChangeText={setMessage} />
      <SelectField label={copy("Kapsam", "Scope")} value={mode} disabled={mutation.isPending} onChange={(value) => setMode(value as StashMode)} options={[
        { value: "untracked", label: copy("İzlenmeyen dosyalar dahil", "Include untracked files") },
        { value: "tracked", label: copy("Yalnız izlenen dosyalar", "Tracked files only") },
        { value: "staged", label: copy("Yalnız stage edilmiş değişiklikler", "Staged changes only") },
      ]} />
      <FormActions submitLabel={copy("Stash oluştur", "Create stash")} busy={mutation.isPending} disabled={unavailable} onSubmit={() => write({ kind: "create", mode, message })}
        cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={mutation.isPending} onCancel={() => setCreating(false)} feedback={<MutationState mutation={mutation} />} />
    </Sheet>
  </>;
}

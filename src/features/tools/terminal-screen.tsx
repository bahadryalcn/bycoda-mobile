import { useCallback, useMemo, useRef, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { ScrollView } from "react-native";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useFormDraft } from "@/state/form-draft";
import { createTerminalApi } from "@/remote/services/terminal-api";
import type { HostProject } from "@/domain/types";
import type { HostTerminalList } from "../../../../src/features/host-tools/terminalTypes";
import {
  ActionMenu, Badge, Body, Button, CodePanel, CodeText, Disclosure, Empty, Field, IconButton, MutationState,
  Notice, QueryState, Row, Screen, SelectField, Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { colors } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { haptic } from "@/ui/motion";
import { projectTerminals, terminalCommandInput, terminalDisplayOutput, TERMINAL_COMMAND_LIMIT } from "./terminal-model";
import { useTerminalOutput } from "./use-terminal-output";

export function TerminalScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const client = useHostClient();
  const api = useMemo(() => client ? createTerminalApi((...args) => client.request(...args)) : null, [client]);
  const list = useHostQuery<HostTerminalList>(["terminals", project.id], "terminals.list", { projectId: project.id }, { interval: 5000 });
  const terminals = projectTerminals(list.data?.terminals ?? [], project.id);
  const [selectedId, setSelectedId] = useState("");
  const selected = terminals.find((entry) => entry.id === selectedId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<"stop" | "close">();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const output = useTerminalOutput(client, project.id, selected?.id ?? "", autoRefresh, focused);
  const terminal = output.data?.terminal ?? selected;
  const action = useAsyncAction();
  const pending = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [leaving, setLeaving] = useState<NavigationAction>();
  const navigation = useNavigation();
  const form = useFormDraft({ name: "", profileId: "" });
  const writable = !!client && list.data?.writable === true && !list.isError && !output.error;
  const command = selected ? drafts[selected.id] ?? "" : "";
  const busy = action.isPending;
  const hasDrafts = Object.values(drafts).some((draft) => !!draft.trim());
  usePreventRemove(busy || hasDrafts || uncertain, ({ data }) => {
    if (!pending.current && !busy) setLeaving(data.action);
  });
  const run = (execute: (target: NonNullable<typeof api>) => Promise<void>) => {
    if (!api || !client || pending.current || !writable || uncertain) return;
    const machineId = client.machine.id;
    pending.current = true;
    void action.run(async () => {
      if (useMachines.getState().activeId !== machineId) return;
      try { await execute(api); }
      catch (error) {
        if (useMachines.getState().activeId === machineId && (error as { uncertain?: boolean })?.uncertain) setUncertain(true);
        throw error;
      } finally {
        if (useMachines.getState().activeId === machineId) { void list.refetch(); void output.refetch(); }
      }
    }).finally(() => { pending.current = false; });
  };
  const create = () => {
    const values = { ...form.values };
    const requestId = randomUUID();
    run(async (target) => {
      const created = await target.terminalCreate({ projectId: project.id, requestId, name: values.name.trim() || undefined, profileId: values.profileId || undefined });
      if (created.projectId !== project.id) throw new Error("Invalid terminal response.");
      if (useMachines.getState().activeId !== client?.machine.id) return;
      form.reset({ name: "", profileId: "" });
      haptic.success();
      setCreating(false);
      setSelectedId(created.id);
    });
  };
  const send = () => {
    const input = terminalCommandInput(command);
    if (!selected || terminal?.state !== "running" || !input) return;
    const id = selected.id;
    run(async (target) => {
      await target.terminalWrite(project.id, id, input);
      if (useMachines.getState().activeId !== client?.machine.id) return;
      setDrafts((previous) => previous[id] === command ? { ...previous, [id]: "" } : previous);
    });
  };
  const control = () => {
    if (!selected || !confirm) return;
    const id = selected.id;
    const operation = confirm;
    run(async (target) => {
      if (operation === "stop") await target.terminalInterrupt(project.id, id);
      else await target.terminalClose(project.id, id);
      if (useMachines.getState().activeId !== client?.machine.id) return;
      setConfirm(undefined);
      if (operation === "close") setSelectedId("");
    });
  };
  return (
    <Screen
      title={copy("Terminaller", "Terminals")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      actions={
        <>
          <IconButton label={copy("Yenile", "Refresh")} disabled={list.isFetching || output.isFetching} onPress={() => { void list.refetch(); void output.refetch(); }}><RefreshCw size={22} strokeWidth={2} color={colors.accent} /></IconButton>
          <IconButton label={copy("Terminal oluştur", "Create terminal")} disabled={!writable || busy || uncertain} onPress={() => { action.reset(); setCreating(true); }}><Plus size={22} strokeWidth={2.2} color={colors.accent} /></IconButton>
        </>
      }
    >
      <Stack.Screen options={{ title: copy("Terminaller", "Terminals") }} />
      <QueryState query={list} />
      {list.data?.writable === false ? <Notice message={copy("Bu bağlantıda terminaller salt okunur.", "Terminals are read-only on this connection.")} /> : null}
      {terminals.length ? <SelectField label={copy("Terminal", "Terminal")} value={selectedId} disabled={busy} placeholder={copy("Terminal seç", "Choose a terminal")} options={terminals.map((entry) => ({ value: entry.id, label: entry.name, detail: entry.cwd }))} onChange={setSelectedId} /> : !list.isPending && !list.isError ? <Empty title={copy("Bu projede terminal yok.", "No terminals in this project.")} /> : null}
      {selected ? <>
        <Row>
          <Body mono muted style={uiStyles.grow}>{terminal?.cwd}</Body>
          <Badge label={terminal?.state === "running" ? copy("Çalışıyor", "Running") : copy("Durduruldu", "Stopped")} tone={terminal?.state === "running" ? "active" : "default"} />
          <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
            { key: "refresh", label: copy("Otomatik yenile", "Auto refresh"), selected: autoRefresh, onPress: () => setAutoRefresh(!autoRefresh) },
            { key: "close", label: copy("Terminali kapat", "Close terminal"), destructive: true,
              disabled: !writable || busy || uncertain, onPress: () => setConfirm("close") },
          ]} />
        </Row>
        <Disclosure label={copy("Yardım", "Help")}>
          <Body muted>{copy("Satır tabanlı kabuk. Etkileşimli tam ekran uygulamalar desteklenmez. Durdur, kabuğu ve alt işlemlerini sonlandırır.", "Line-based shell. Interactive full-screen apps are unavailable. Stop ends the shell and its child processes.")}</Body>
        </Disclosure>
        <QueryState query={output} loading="inline" />
        {output.data?.truncated ? <Notice message={copy("Çıktının yalnızca son bölümü gösteriliyor.", "Only the most recent output is shown.")} /> : null}
        {output.data ? <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never"><CodePanel horizontal={false}><CodeText>{terminalDisplayOutput(output.data.output) || copy("Henüz çıktı yok.", "No output yet.")}</CodeText></CodePanel></ScrollView> : null}
        {output.data?.hasMore ? <Button label={copy("Daha fazla çıktı yükle", "Load more output")} busy={output.isFetching} onPress={() => { void output.refetch(); }} /> : null}
        {terminal?.exitCode != null ? <Body muted>{copy("Çıkış kodu: {p0}", "Exit code: {p0}", { p0: terminal.exitCode })}</Body> : null}
        <Field label={copy("Komut", "Command")} value={command} multiline mono autoCapitalize="none" autoCorrect={false} maxLength={TERMINAL_COMMAND_LIMIT} editable={!busy && writable && terminal?.state === "running" && !uncertain} error={command.trim() && !terminalCommandInput(command) ? copy("En fazla 16384 UTF-8 baytı kullan ve terminal kontrol karakterlerini kaldır.", "Use at most 16384 UTF-8 bytes and remove terminal control characters.") : undefined} onChangeText={(value) => setDrafts((previous) => ({ ...previous, [selected.id]: value }))} />
        <Button label={copy("Komutu gönder", "Send command")} tone="primary" busy={busy} disabled={!writable || uncertain || terminal?.state !== "running" || !terminalCommandInput(command)} onPress={send} />
        <Row>
          <Button label={copy("Terminali durdur", "Stop terminal")} tone="danger" disabled={!writable || busy || uncertain || terminal?.state !== "running"} onPress={() => setConfirm("stop")} />
        </Row>
      </> : null}
      <MutationState mutation={action} />
      {uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yenile ve çıktıyı kontrol et; aynı komutu yeniden gönderme.", "The result is uncertain. Refresh and inspect the output before sending the same command again.")}>
        <Button label={copy("Sonucu kontrol ettim", "I checked the result")} onPress={() => { setUncertain(false); action.reset(); }} />
      </Notice> : null}
      <Sheet visible={creating} title={copy("Terminal oluştur", "Create terminal")} dirty={form.dirty} dismissible={!busy} onClose={() => setCreating(false)}>
        <Body mono muted>{project.cwd}</Body>
        <Field label={copy("Ad", "Name")} value={form.values.name} editable={!busy} maxLength={80} onChangeText={(value) => form.setField("name", value)} />
        <SelectField label={copy("Kabuk", "Shell")} value={form.values.profileId} disabled={busy} options={[{ value: "", label: copy("Varsayılan", "Default") }, ...(list.data?.profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name }))]} onChange={(value) => form.setField("profileId", value)} />
        <MutationState mutation={action} />
        <Button label={copy("Terminal oluştur", "Create terminal")} tone="primary" busy={busy} disabled={!writable || uncertain} onPress={create} />
      </Sheet>
      <Sheet visible={!!leaving} title={copy("Araçtan ayrıl", "Leave tool")} onClose={() => setLeaving(undefined)}>
        <Notice tone="warning" message={copy("Gönderilmemiş komut taslakları silinecek. Bilgisayardaki terminaller açık kalır.", "Unsent command drafts will be discarded. Terminals on the computer stay open.")} />
        <Button label={copy("Ayrıl", "Leave")} tone="danger" onPress={() => { if (leaving) navigation.dispatch(leaving); }} />
      </Sheet>
      <Sheet visible={!!confirm} title={confirm === "stop" ? copy("Terminali durdur", "Stop terminal") : copy("Terminali kapat", "Close terminal")} dismissible={!busy} onClose={() => setConfirm(undefined)}>
        <Notice tone="warning" message={copy("Bu terminalin kabuğu ve çalışan alt işlemleri sonlandırılacak.", "This terminal's shell and running child processes will end.")} />
        {command.trim() ? <Notice message={copy("Gönderilmemiş komut taslağın var.", "You have an unsent command draft.")} /> : null}
        <MutationState mutation={action} />
        <Button label={confirm === "stop" ? copy("Terminali durdur", "Stop terminal") : copy("Terminali kapat", "Close terminal")} tone="danger" busy={busy} disabled={!writable || uncertain} onPress={control} />
      </Sheet>
    </Screen>
  );
}

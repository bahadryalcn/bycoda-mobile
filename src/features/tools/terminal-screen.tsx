import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Maximize2 from "lucide-react-native/icons/maximize-2";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useFormDraft } from "@/state/form-draft";
import { createTerminalApi } from "@/remote/services/terminal-api";
import type { HostProject } from "@/domain/types";
import type { HostTerminalList } from "../../../../src/features/host-tools/terminalTypes";
import {
  ActionMenu, Badge, Body, Button, CodePanel, CodeText, Disclosure, Field, IconButton, MutationState,
  FormActions, NavigationRow, Notice, QueryState, Row, Screen, SelectField, Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useMobileTheme } from "@/ui/theme";
import { haptic } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { projectTerminals, terminalCommandInput, terminalDisplayOutput, TERMINAL_COMMAND_LIMIT } from "./terminal-model";
import { useLocalDraft } from "../workspace/use-local-draft";
import { registerWorkspaceDraft } from "../workspace/draft-guard";
import { decodeTerminalDraft, emptyTerminalDraft, encodeTerminalDraft, terminalDraftKey } from "./terminal-draft";
import { ErrorNotice } from "@/ui/feedback";
import { useTerminalOutput } from "./use-terminal-output";
import { TerminalOutputView } from "./terminal-output-view";

let nextTerminalScope = 1;
export function TerminalScreen({ project }: { project: HostProject }) {
  const machine = useActiveMachine();
  const scope = useMemo(() => nextTerminalScope++, [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  return <TerminalScreenBody key={scope} project={project} />;
}

function TerminalScreenBody({ project }: { project: HostProject }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const manageConnections = () => router.push("/machines");
  const machine = useActiveMachine();
  const client = useHostClient();
  const api = useMemo(() => client ? createTerminalApi((...args) => client.request(...args)) : null, [client]);
  const list = useHostQuery<HostTerminalList>(["terminals", project.id], "terminals.list", { projectId: project.id }, { interval: 5000 });
  const terminals = projectTerminals(list.data?.terminals ?? [], project.id);
  const [selectedId, setSelectedId] = useState("");
  const selected = terminals.find((entry) => entry.id === selectedId);
  const draftKey = terminalDraftKey([machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  const draft = useLocalDraft(draftKey, decodeTerminalDraft, encodeTerminalDraft);
  const drafts = draft.value?.commands ?? {};
  const setDrafts = (update: (previous: Record<string, string>) => Record<string, string>) => draft.setValue(previous => ({ ...(previous ?? emptyTerminalDraft()), commands: update(previous?.commands ?? {}) }));
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ operation: "stop" | "close"; id: string; name: string }>();
  const confirmedTerminal = terminals.find(entry => entry.id === confirm?.id);
  const [editingCommand, setEditingCommand] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const help = useInfoHint(copy("Satır tabanlı kabuk. Etkileşimli tam ekran uygulamalar desteklenmez. Durdur, kabuğu ve alt işlemlerini sonlandırır.", "Line-based shell. Interactive full-screen apps are unavailable. Stop ends the shell and its child processes."));
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const output = useTerminalOutput(client, project.id, selected?.id ?? "", autoRefresh, focused);
  const terminal = output.data?.terminal ?? selected;
  const refresh = usePullRefresh(() => Promise.all([list.refetch(), output.refetch()]));
  const action = useAsyncAction();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && isReviewedMachine(reviewedMachine(client?.machine), useMachines.getState());
  const uncertain = draft.value?.uncertain ?? false;
  const setUncertain = (value: boolean) => draft.setValue(previous => ({ ...(previous ?? emptyTerminalDraft()), uncertain: value }));
  const [leaving, setLeaving] = useState<NavigationAction>();
  const navigation = useNavigation();
  const form = useFormDraft({ name: "", profileId: "" });
  const writable = draft.ready && !!client && list.data?.writable === true && !list.isError && !output.error;
  const command = drafts[selectedId] ?? "";
  const orphanedDrafts = Object.entries(drafts).filter(([id, value]) => value.trim() && !terminals.some(entry => entry.id === id));
  const busy = action.isPending;
  const hasDrafts = Object.values(drafts).some((draft) => !!draft.trim());
  // Computer switches must flush this exact identity before connection ownership changes.
  useEffect(() => registerWorkspaceDraft(draftKey, () => draft.persist()), [draftKey, draft.persist]);
  usePreventRemove(busy || hasDrafts || uncertain || !!draft.error, ({ data }) => {
    if (!pending.current && !busy) {
      if (uncertain) setLeaving(data.action);
      else void draft.persist().then(() => navigation.dispatch(data.action)).catch(() => {});
    }
  });
  const run = (execute: (target: NonNullable<typeof api>) => Promise<void>) => {
    if (!api || !client || pending.current || !writable || uncertain || !current()) return;
    pending.current = true;
    void action.run(async () => {
      if (!current()) return;
      try { await execute(api); }
      catch (error) {
        if (current() && (error as { uncertain?: boolean })?.uncertain) setUncertain(true);
        throw error;
      } finally {
        if (current()) { void list.refetch(); void output.refetch(); }
      }
    }).finally(() => { pending.current = false; });
  };
  const create = () => {
    const values = { ...form.values };
    const requestId = randomUUID();
    run(async (target) => {
      const created = await target.terminalCreate({ projectId: project.id, requestId, name: values.name.trim() || undefined, profileId: values.profileId || undefined });
      if (created.projectId !== project.id) throw new Error("Invalid terminal response.");
      if (!current()) return;
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
      if (!current()) return;
      setDrafts((previous) => previous[id] === command ? { ...previous, [id]: "" } : previous);
    });
  };
  const control = () => {
    if (!confirmedTerminal || !confirm) return;
    const id = confirmedTerminal.id;
    const operation = confirm.operation;
    run(async (target) => {
      if (operation === "stop") await target.terminalInterrupt(project.id, id);
      else await target.terminalClose(project.id, id);
      if (!current()) return;
      setConfirm(undefined);
      if (operation === "close") setSelectedId("");
    });
  };
  const uncertaintyFeedback = uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yenile ve çıktıyı kontrol et; aynı komutu yeniden gönderme.", "The result is uncertain. Refresh and inspect the output before sending the same command again.")}>
    <Button label={copy("Sonucu kontrol ettim", "I checked the result")} disabled={busy} onPress={() => { setUncertain(false); action.reset(); }} />
  </Notice> : null;
  return (
    <Screen
      scroll={false}
      title={copy("Terminaller", "Terminals")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      refreshState={refresh}
      footer={!editingCommand && selected ? <Row style={{ alignItems: "flex-end" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
        <Field label={copy("Komut", "Command")} value={command} mono autoCapitalize="none" autoCorrect={false}
          maxLength={TERMINAL_COMMAND_LIMIT} editable={draft.ready && !busy && writable && terminal?.state === "running" && !uncertain}
          error={command.trim() && !terminalCommandInput(command) ? copy("En fazla 16384 UTF-8 baytı kullan ve terminal kontrol karakterlerini kaldır.", "Use at most 16384 UTF-8 bytes and remove terminal control characters.") : undefined}
          onChangeText={value => setDrafts(previous => ({ ...previous, [selected.id]: value }))} />
        </View>
        <IconButton label={copy("Genişlet", "Expand")} disabled={busy} onPress={() => setEditingCommand(true)}><Maximize2 size={18} color={colors.muted} /></IconButton>
        <IconButton label={copy("Komutu gönder", "Send command")} tone="primary" busy={busy}
          disabled={!writable || uncertain || terminal?.state !== "running" || !terminalCommandInput(command)} onPress={send}><ArrowUp size={20} color={colors.primaryText} /></IconButton>
      </Row> : undefined}
      actions={
        <>
          <IconButton busy={refresh.refreshing} label={copy("Yenile", "Refresh")} disabled={list.isFetching || output.isFetching} onPress={() => { void refresh.onRefresh(); }}><RefreshCw size={22} strokeWidth={2} color={colors.accent} /></IconButton>
          <IconButton label={copy("Terminal oluştur", "Create terminal")} disabled={!writable || busy || uncertain} onPress={() => { action.reset(); setCreating(true); }}><Plus size={22} strokeWidth={2.2} color={colors.accent} /></IconButton>
        </>
      }
    >
      <View style={{ flex: 1, minHeight: 0, paddingHorizontal: space.screen, gap: space.sm }}>
      <ErrorNotice error={draft.error} onRetry={() => { void (draft.ready ? draft.persist() : draft.load()).catch(() => {}); }} />
      <Stack.Screen options={{ title: copy("Terminaller", "Terminals") }} />
      <QueryState query={list} loading={selected ? "none" : "list"} empty={!terminals.length} emptyIllustration="no-sessions" emptyTitle={copy("Bu projede terminal yok.", "No terminals in this project.")} onManageConnections={manageConnections} />
      {list.data?.writable === false ? <Notice message={copy("Bu bağlantıda terminaller salt okunur.", "Terminals are read-only on this connection.")} /> : null}
      {terminals.length ? <Row>
        <View style={uiStyles.grow}>
          <SelectField hideLabel label={copy("Terminal", "Terminal")} value={selectedId} disabled={busy} placeholder={copy("Terminal seç", "Choose a terminal")} options={terminals.map((entry) => ({ value: entry.id, label: entry.name, detail: [entry.cwd, drafts[entry.id]?.trim() ? copy("Taslak", "Draft") : undefined].filter(Boolean).join(" · ") }))} onChange={(id) => { setSelectedId(id); setConfirm(undefined); setEditingCommand(false); }} />
        </View>
        {selected ? <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
          { key: "refresh", label: copy("Otomatik yenile", "Auto refresh"), selected: autoRefresh, onPress: () => setAutoRefresh(!autoRefresh) },
          { key: "stop", label: copy("Terminali durdur", "Stop terminal"), destructive: true,
            disabled: !writable || busy || uncertain || terminal?.state !== "running", onPress: () => setConfirm({ operation: "stop", id: selected.id, name: selected.name }) },
          { key: "close", label: copy("Terminali kapat", "Close terminal"), destructive: true,
            disabled: !writable || busy || uncertain, onPress: () => setConfirm({ operation: "close", id: selected.id, name: selected.name }) },
        ]} /> : null}
      </Row> : null}
      {orphanedDrafts.length ? <Disclosure label={copy("Taslaklar", "Drafts")}>
        {orphanedDrafts.map(([id]) => <NavigationRow key={id} label={id} disabled={busy} onPress={() => { setSelectedId(id); setEditingCommand(true); }} />)}
      </Disclosure> : null}
      {selected ? <>
        <Row>
          <Body mono muted style={uiStyles.grow}>{terminal?.cwd}</Body>
          {help.button}
          <Badge label={terminal?.state === "running" ? copy("Çalışıyor", "Running") : copy("Durduruldu", "Stopped")} tone={terminal?.state === "running" ? "active" : "default"} />
        </Row>
        {help.panel}
        <QueryState query={output} loading="inline" onManageConnections={manageConnections} />
        {output.data?.truncated ? <Notice message={copy("Çıktının yalnızca son bölümü gösteriliyor.", "Only the most recent output is shown.")} /> : null}
        {output.data ? <TerminalOutputView key={selected.id} output={terminalDisplayOutput(output.data.output)} /> : null}
        {output.data?.hasMore ? <Button tone="quiet" label={copy("Daha fazla çıktı yükle", "Load more output")} busy={output.isFetching} onPress={() => { void output.refetch(); }} /> : null}
        {terminal?.exitCode != null ? <Body muted>{copy("Çıkış kodu: {p0}", "Exit code: {p0}", { p0: terminal.exitCode })}</Body> : null}
      </> : null}
      {!creating && !confirm && !editingCommand ? <><MutationState mutation={action} />{uncertaintyFeedback}</> : null}
      <Sheet visible={editingCommand && !!selectedId} size="compact" title={copy("Komut", "Command")} dismissible={!busy} onClose={() => setEditingCommand(false)}>
        <Body muted mono>{[selected?.name ?? selectedId, terminal?.cwd].filter(Boolean).join(" · ")}</Body>
        {selected ? <Field label={copy("Komut", "Command")} value={command} multiline mono autoCapitalize="none" autoCorrect={false} maxLength={TERMINAL_COMMAND_LIMIT} editable={!busy && writable && terminal?.state === "running" && !uncertain} error={command.trim() && !terminalCommandInput(command) ? copy("En fazla 16384 UTF-8 baytı kullan ve terminal kontrol karakterlerini kaldır.", "Use at most 16384 UTF-8 bytes and remove terminal control characters.") : undefined} onChangeText={(value) => setDrafts(previous => ({ ...previous, [selected.id]: value }))} /> : <><Badge label={copy("Salt okunur", "Read only")} /><CodePanel horizontal={false}><CodeText>{command}</CodeText></CodePanel></>}
        {uncertaintyFeedback}
        <FormActions submitLabel={copy("Komutu gönder", "Send command")} busy={busy} disabled={!selected || !writable || uncertain || terminal?.state !== "running" || !terminalCommandInput(command)} onSubmit={send} feedback={<MutationState mutation={action} />} />
      </Sheet>
      <Sheet visible={creating} size="compact" title={copy("Terminal oluştur", "Create terminal")} dirty={form.dirty} dismissible={!busy} onClose={() => setCreating(false)}>
        <Body mono muted>{project.cwd}</Body>
        <Field label={copy("Ad", "Name")} value={form.values.name} editable={!busy} maxLength={80} onChangeText={(value) => form.setField("name", value)} />
        <SelectField label={copy("Kabuk", "Shell")} value={form.values.profileId} disabled={busy} options={[{ value: "", label: copy("Varsayılan", "Default") }, ...(list.data?.profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name }))]} onChange={(value) => form.setField("profileId", value)} />
        {uncertaintyFeedback}
        <FormActions submitLabel={copy("Terminal oluştur", "Create terminal")} busy={busy} disabled={!writable || uncertain} onSubmit={create}
          feedback={<MutationState mutation={action} />} />
      </Sheet>
      <Sheet visible={!!leaving} size="compact" title={copy("Araçtan ayrıl", "Leave tool")} onClose={() => setLeaving(undefined)}>
        <Notice tone="warning" message={copy("Komut taslakları bu bilgisayar ve proje için saklanır. Terminaller açık kalır.", "Command drafts are saved for this computer and project. Terminals stay open.")} />
        <FormActions submitLabel={copy("Ayrıl", "Leave")} tone="danger"
          onCancel={() => setLeaving(undefined)}
          onSubmit={() => { if (leaving) void draft.persist().then(() => navigation.dispatch(leaving)).catch(() => {}); }} />
      </Sheet>
      <Sheet visible={!!confirm} size="compact" title={confirm?.operation === "stop" ? copy("Terminali durdur", "Stop terminal") : copy("Terminali kapat", "Close terminal")} dismissible={!busy} onClose={() => setConfirm(undefined)}>
        <Body mono>{confirm?.name}</Body>
        <Notice tone="warning" message={copy("Bu terminalin kabuğu ve çalışan alt işlemleri sonlandırılacak.", "This terminal's shell and running child processes will end.")} />
        {command.trim() ? <Notice message={copy("Gönderilmemiş komut taslağın var.", "You have an unsent command draft.")} /> : null}
        {uncertaintyFeedback}
        <FormActions submitLabel={confirm?.operation === "stop" ? copy("Terminali durdur", "Stop terminal") : copy("Terminali kapat", "Close terminal")}
          tone="danger" busy={busy} disabled={!writable || uncertain || !confirmedTerminal || (confirm?.operation === "stop" && confirmedTerminal.state !== "running")}
          cancelDisabled={busy} onCancel={() => setConfirm(undefined)}
          feedback={<MutationState mutation={action} />} onSubmit={control} />
      </Sheet>
      </View>
    </Screen>
  );
}

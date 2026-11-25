import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Search from "lucide-react-native/icons/search";
import Square from "lucide-react-native/icons/square";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useFormDraft } from "@/state/form-draft";
import { createTerminalApi } from "@/remote/services/terminal-api";
import type { HostProject } from "@/domain/types";
import type { HostTerminalList } from "../../../../src/features/host-tools/terminalTypes";
import {
  ActionMenu, Body, Button, ChoiceChip, CodeText, Disclosure, Field, FieldError, IconButton, Input,
  MutationState, FormActions, Notice, QueryState, Row, Screen, SearchField, SelectField, Sheet, StateView, StatusLine,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useMobileTheme } from "@/ui/theme";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { haptic } from "@/ui/motion";
import { iconSize, space } from "@/ui/tokens";
import { projectTerminals, terminalCommandInput, terminalDisplayOutput, TERMINAL_COMMAND_LIMIT } from "./terminal-model";
import { useLocalDraft } from "../workspace/use-local-draft";
import { registerWorkspaceDraft } from "../workspace/draft-guard";
import { decodeTerminalDraft, emptyTerminalDraft, encodeTerminalDraft, terminalDraftKey } from "./terminal-draft";
import { ErrorNotice } from "@/ui/feedback";
import { useTerminalOutput } from "./use-terminal-output";
import { TerminalOutputView } from "./terminal-output-view";
import { TerminalCopyButton, TerminalStatusDot } from "./terminal-header-controls";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";

let nextTerminalScope = 1;
export function TerminalScreen({ project }: { project: HostProject }) {
  const machine = useActiveMachine();
  const scope = useMemo(() => nextTerminalScope++, [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  return <TerminalScreenBody key={scope} project={project} />;
}

function TerminalScreenBody({ project }: { project: HostProject }) {
  const { colors, uiStyles } = useMobileTheme();
  const insets = useScreenContentInsets();
  const copy = useCopy();
  const manageConnections = () => router.push("/machines");
  const machine = useActiveMachine();
  const client = useHostClient();
  const api = useMemo(() => client ? createTerminalApi((...args) => client.request(...args)) : null, [client]);
  const list = useHostQuery<HostTerminalList>(["terminals", project.id], "terminals.list", { projectId: project.id }, { interval: 5000 });
  const terminals = projectTerminals(list.data?.terminals ?? [], project.id);
  const [selectedId, setSelectedId] = useState("");
  const initialId = (terminals.find(entry => entry.state === "running") ?? terminals[0])?.id;
  const selected = terminals.find(entry => entry.id === (selectedId || initialId));
  // Pin the first selection before polling can reorder or replace the terminal list.
  useEffect(() => {
    if (initialId) setSelectedId(previous => previous || initialId);
  }, [initialId]);
  const draftKey = terminalDraftKey([machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  const draft = useLocalDraft(draftKey, decodeTerminalDraft, encodeTerminalDraft);
  const drafts = draft.value?.commands ?? {};
  const setDrafts = (update: (previous: Record<string, string>) => Record<string, string>) => draft.setValue(previous => ({ ...(previous ?? emptyTerminalDraft()), commands: update(previous?.commands ?? {}) }));
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ operation: "stop" | "close"; id: string; name: string }>();
  const confirmedTerminal = terminals.find(entry => entry.id === confirm?.id);
  const [searchFor, setSearchFor] = useState<string>();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const output = useTerminalOutput(client, project.id, selected?.id ?? "", true, focused);
  const terminal = output.data?.terminal ?? selected;
  const rawOutput = output.data?.output ?? "";
  const plainOutput = useMemo(() => terminalDisplayOutput(rawOutput), [rawOutput]);
  const clipboard = useClipboardFeedback(plainOutput, !!plainOutput);
  const searching = !!selected && searchFor === selected.id;
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
  const canCreate = writable && !action.isPending && !uncertain;
  const openCreate = () => {
    Keyboard.dismiss();
    action.reset();
    setCreating(true);
  };
  const command = selected ? drafts[selected.id] ?? "" : "";
  const commandInput = terminalCommandInput(command);
  const commandError = command.trim() && !commandInput ? copy(
    "En fazla 16384 UTF-8 baytı kullan ve terminal kontrol karakterlerini kaldır.",
    "Use at most 16384 UTF-8 bytes and remove terminal control characters.",
  ) : undefined;
  const orphanedDrafts = Object.entries(drafts).filter(([id, value]) => value.trim() && !terminals.some(entry => entry.id === id));
  const busy = action.isPending;
  const hasDrafts = Object.values(drafts).some((draft) => !!draft.trim());
  // Computer switches must flush this exact identity before connection ownership changes.
  useEffect(() => registerWorkspaceDraft(draftKey, () => draft.persist()), [draftKey, draft.persist]);
  const leaveBlocked = busy || uncertain;
  useEffect(() => {
    // Reason: a swipe that is refused after it revealed the previous route looks like a glitch; keep it off while leaving is blocked.
    if (!leaveBlocked) return;
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [leaveBlocked, navigation]);
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
    if (!selected || terminal?.state !== "running" || !commandInput) return;
    const id = selected.id;
    run(async (target) => {
      await target.terminalWrite(project.id, id, commandInput);
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
      if (operation === "close") setSelectedId(terminals.find(entry => entry.id !== id)?.id ?? "");
    });
  };
  const uncertaintyFeedback = uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yenile ve çıktıyı kontrol et; aynı komutu yeniden gönderme.", "The result is uncertain. Refresh and inspect the output before sending the same command again.")}>
    <Button label={copy("Sonucu kontrol ettim", "I checked the result")} disabled={busy} onPress={() => { setUncertain(false); action.reset(); }} />
  </Notice> : null;
  return (
    <Screen
      scroll={false}
      title={copy("Terminaller", "Terminals")}
      scope={{ computer: machine?.name, project: project.name }}
      refreshState={refresh}
      footer={selected ? <>
        {commandError ? <FieldError message={commandError} /> : null}
        <Row>
          <Input label={copy("Komut", "Command")} placeholder={copy("Komut", "Command")}
            style={uiStyles.grow} value={command} mono autoCapitalize="none" autoCorrect={false}
            maxLength={TERMINAL_COMMAND_LIMIT} editable={!busy && writable && terminal?.state === "running" && !uncertain}
            error={commandError} onChangeText={value => setDrafts(previous => ({ ...previous, [selected.id]: value }))} />
          <IconButton label={copy("Komutu gönder", "Send command")} tone="primary" busy={busy} reserveTouchTarget
            disabled={!writable || uncertain || terminal?.state !== "running" || !commandInput} onPress={send}>
            <ArrowUp size={iconSize.action} color={colors.primaryText} />
          </IconButton>
        </Row>
      </> : undefined}
      actions={selected ?
        <>
          <IconButton label={copy("Çıktıda ara", "Search output")} expanded={searching} reserveTouchTarget
            onPress={() => { setQuery(""); setSearchFor(searching ? undefined : selected.id); }}>
            <Search size={iconSize.action} color={searching ? colors.accent : colors.muted} />
          </IconButton>
          <TerminalCopyButton clipboard={clipboard} disabled={!plainOutput} />
          <ActionMenu label={copy("Terminal işlemleri", "Terminal actions")} subtitle={selected.name}
            reserveTouchTarget onTriggerPress={() => Keyboard.dismiss()} actions={[
              { key: "refresh", label: copy("Yenile", "Refresh"), icon: <RefreshCw size={iconSize.row} color={colors.muted} />,
                disabled: list.isFetching || output.isFetching, onPress: () => { void refresh.onRefresh(); } },
              { key: "stop", label: copy("Terminali durdur", "Stop terminal"), destructive: true,
                detail: copy("Kabuğu sonlandırır. Çıktı kalır.", "Ends the shell and keeps the output."),
                icon: <Square size={iconSize.row} color={colors.danger} />,
                disabled: !writable || busy || uncertain || terminal?.state !== "running",
                onPress: () => { action.reset(); setConfirm({ operation: "stop", id: selected.id, name: selected.name }); } },
              { key: "close", label: copy("Terminali kapat", "Close terminal"), destructive: true,
                detail: copy("Terminali ve çıktısını listeden kaldırır.", "Removes the terminal and its output from the list."),
                icon: <Trash2 size={iconSize.row} color={colors.danger} />, disabled: !writable || busy || uncertain,
                onPress: () => { action.reset(); setConfirm({ operation: "close", id: selected.id, name: selected.name }); } },
            ]} />
        </> : undefined}
    >
      <View style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, gap: space.sm }}>
      <ErrorNotice error={draft.error} onRetry={() => { void (draft.ready ? draft.persist() : draft.load()).catch(() => {}); }} />
      {terminals.length ? (
        <Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={uiStyles.grow} keyboardShouldPersistTaps="handled">
            <Row>{terminals.map(entry => <ChoiceChip key={entry.id}
              label={entry.name + (drafts[entry.id]?.trim() ? " · ✎" : "")}
              selected={entry.id === selected?.id} disabled={busy}
              onPress={() => { setSelectedId(entry.id); setConfirm(undefined); setSearchFor(undefined); }} />)}</Row>
          </ScrollView>
          <IconButton label={copy("Terminal oluştur", "Create terminal")} reserveTouchTarget disabled={!canCreate} onPress={openCreate}>
            <Plus size={iconSize.action} color={colors.accent} />
          </IconButton>
        </Row>
      ) : null}
      <QueryState size={selected ? "compact" : "region"} query={list} loading={selected ? "none" : "list"}
        empty={!terminals.length} emptyIllustration="no-sessions" emptyTitle={copy("Bu projede terminal yok.", "No terminals in this project.")}
        emptyAction={canCreate ? { label: copy("Terminal oluştur", "Create terminal"), onPress: openCreate } : undefined}
        onManageConnections={manageConnections} />
      {!selected && terminals.length && list.isSuccess ? <StateView title={copy("Terminal seç", "Choose a terminal")} /> : null}
      {list.data?.writable === false ? <StatusLine tone="info" label={copy("Bu bağlantıda terminaller salt okunur.", "Terminals are read-only on this connection.")} /> : null}
      {orphanedDrafts.length ? <Disclosure label={copy("Taslaklar", "Drafts")}>
        <ScrollView style={{ flexGrow: 0, maxHeight: 120 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {orphanedDrafts.map(([id, value]) => <View key={id}>
            <Body muted mono>{id}</Body>
            <CodeText selectable>{value}</CodeText>
          </View>)}
        </ScrollView>
      </Disclosure> : null}
      {selected ? <>
        <Row>
          <TerminalStatusDot running={terminal?.state === "running"} />
          <Body mono muted numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.caption, uiStyles.grow]}>{terminal?.cwd || project.cwd}</Body>
        </Row>
        {searching ? <SearchField label={copy("Çıktıda ara", "Search output")} value={query} maxLength={200} onChangeText={setQuery} /> : null}
        <ErrorNotice error={clipboard.error} />
        <QueryState query={output} loading="inline" onManageConnections={manageConnections} />
        {output.data?.truncated ? <Body muted style={uiStyles.caption}>{copy("Çıktının yalnızca son bölümü gösteriliyor.", "Only the most recent output is shown.")}</Body> : null}
        <TerminalOutputView key={selected.id} output={rawOutput} query={searching ? query : ""} waiting={!output.data} />
        {output.data?.hasMore ? <Button tone="quiet" label={copy("Daha fazla çıktı yükle", "Load more output")} busy={output.isFetching} onPress={() => { void output.refetch(); }} /> : null}
        {terminal?.exitCode != null ? <Body muted>{copy("Çıkış kodu: {p0}", "Exit code: {p0}", { p0: terminal.exitCode })}</Body> : null}
      </> : null}
      {!creating && !confirm ? <><MutationState mutation={action} />{uncertaintyFeedback}</> : null}
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
        <Notice tone="warning" message={confirm?.operation === "close"
          ? copy("Terminal ve çıktısı kaldırılır. Çalışan işlemler sonlandırılır.", "The terminal and its output are removed. Running processes end.")
          : copy("Bu terminalin kabuğu ve çalışan alt işlemleri sonlandırılacak.", "This terminal's shell and running child processes will end.")} />
        {confirm && drafts[confirm.id]?.trim() ? <Notice message={copy("Gönderilmemiş komut taslağın var.", "You have an unsent command draft.")} /> : null}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Copy from "lucide-react-native/icons/copy";
import Search from "lucide-react-native/icons/search";
import Square from "lucide-react-native/icons/square";
import TextSelect from "lucide-react-native/icons/text-select";
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
  ActionMenu, Body, Button, Field, IconButton,
  MutationState, FormActions, Notice, QueryState, Screen, SearchField, SelectField, Sheet, StateView, StatusLine,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useMobileTheme } from "@/ui/theme";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { haptic } from "@/ui/motion";
import { iconSize, space } from "@/ui/tokens";
import { projectTerminals, terminalClosedLabel, terminalDisplayOutput } from "./terminal-model";
import { toolLabels } from "./tool-labels";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";
import { ErrorNotice } from "@/ui/feedback";
import { useTerminalOutput } from "./use-terminal-output";
import { TerminalOutputView } from "./terminal-output-view";
import { TerminalPickerSheet, TerminalPill } from "./terminal-header-controls";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { TerminalConsoleStage } from "./terminal-console";
import { pushOnce } from "@/ui/navigation";

/** The Host's per-write byte limit. */
const WRITE_LIMIT = 16_384;
/** Size changes settle (rotation, keyboard) before the PTY is resized once. */
const RESIZE_SETTLE_MS = 150;

/** The longest prefix of `text` within `limit` UTF-8 bytes, never splitting a character. */
function utf8Prefix(text: string, limit: number): string {
  let size = 0;
  let end = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (size > limit) break;
    end += char.length;
  }
  return text.slice(0, end);
}

let nextTerminalScope = 1;
export function TerminalScreen({ project }: { project: HostProject }) {
  const machine = useActiveMachine();
  const scope = useMemo(() => nextTerminalScope++, [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  return <TerminalScreenBody key={scope} project={project} />;
}

function TerminalScreenBody({ project }: { project: HostProject }) {
  const { colors } = useMobileTheme();
  const insets = useScreenContentInsets();
  const copy = useCopy();
  const manageConnections = () => pushOnce("/machines");
  const machine = useActiveMachine();
  const client = useHostClient();
  const api = useMemo(() => client ? createTerminalApi((...args) => client.request(...args)) : null, [client]);
  const [selectedId, setSelectedId] = useState("");
  // With a terminal open its own output read carries the state; the list only needs a slow check.
  const list = useHostQuery<HostTerminalList>(["terminals", project.id], "terminals.list", { projectId: project.id }, { interval: selectedId ? 30_000 : 5000 });
  const terminals = projectTerminals(list.data?.terminals ?? [], project.id);
  const initialId = (terminals.find(entry => entry.state === "running") ?? terminals[0])?.id;
  const selected = terminals.find(entry => entry.id === (selectedId || initialId));
  // Pin the first selection before polling can reorder or replace the terminal list.
  useEffect(() => {
    if (initialId) setSelectedId(previous => previous || initialId);
  }, [initialId]);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<{ id: string; name: string }>();
  const closingTerminal = terminals.find(entry => entry.id === closing?.id);
  // The selectable text reader over the terminal: searching the output or selecting text to copy.
  const [reader, setReader] = useState<{ id: string; search: boolean }>();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const output = useTerminalOutput(client, project.id, selected?.id ?? "", true, focused);
  const terminal = output.data?.terminal ?? selected;
  const rawOutput = output.data?.output ?? "";
  // The plain copy is built only when Copy is pressed, not on every poll that brings output.
  const preparePlainOutput = useCallback(async () => terminalDisplayOutput(rawOutput), [rawOutput]);
  const clipboard = useClipboardFeedback(rawOutput, !!rawOutput, undefined, preparePlainOutput);
  const readerOpen = !!selected && reader?.id === selected.id ? reader : undefined;
  const running = terminal?.state === "running";
  const refresh = usePullRefresh(() => Promise.all([list.refetch(), output.refetch()]));
  const action = useAsyncAction();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && isReviewedMachine(reviewedMachine(client?.machine), useMachines.getState());
  // A write whose delivery is unknown holds typing until the user has looked at the output.
  const [uncertain, setUncertain] = useState(false);
  const [inputError, setInputError] = useState<Error>();
  // The prevented navigation, retried through `repeat` so Leave is not prevented a second time.
  const [leaving, setLeaving] = useState<{ repeat: () => void }>();
  const navigation = useNavigation();
  const form = useFormDraft({ name: "", profileId: "" });
  const writable = !!client && list.data?.writable === true && !list.isError && !output.error;
  const canCreate = writable && !action.isPending && !uncertain;
  const openCreate = () => {
    Keyboard.dismiss();
    action.reset();
    setCreating(true);
  };
  const busy = action.isPending;
  useEffect(() => {
    // Reason: a swipe that is refused after it revealed the previous route looks like a glitch; keep it off while leaving asks first.
    if (!uncertain) return;
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [uncertain, navigation]);
  // Leaving is never trapped: an uncertain write only asks once, and Leave always leaves.
  usePreventRemove(uncertain, ({ repeat }) => setLeaving({ repeat }));
  const canWrite = () => !!api && !!client && !pending.current && writable && !uncertain && current();
  /** Starts one Host operation; false when another one, a stale target or an uncertain result blocks it. */
  const run = (execute: (target: NonNullable<typeof api>) => Promise<void>): boolean => {
    if (!api || !canWrite()) return false;
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
    return true;
  };
  // Keystrokes reach the PTY in typing order: one write in flight, later keys batched behind it.
  const input = useRef<{ id: string; queued: string; sending: boolean }>({ id: "", queued: "", sending: false });
  const pump = () => {
    const state = input.current;
    if (state.sending || !state.queued || !api) return;
    const id = state.id;
    const data = utf8Prefix(state.queued, WRITE_LIMIT);
    state.queued = state.queued.slice(data.length);
    state.sending = true;
    void api.terminalWrite(project.id, id, data).then(
      () => {
        state.sending = false;
        if (!current() || input.current !== state) return;
        output.poke();
        pump();
      },
      (error: unknown) => {
        state.sending = false;
        // Undelivered keys are dropped, never replayed.
        state.queued = "";
        if (!current() || input.current !== state) return;
        if ((error as { uncertain?: boolean })?.uncertain) setUncertain(true);
        setInputError(error instanceof Error ? error : new Error(String(error)));
        output.poke();
      },
    );
  };
  const sendInput = (data: string) => {
    if (!selected || !running || !writable || uncertain || !current() || !data) return;
    if (input.current.id !== selected.id) input.current = { id: selected.id, queued: "", sending: false };
    setInputError(undefined);
    input.current.queued += data;
    pump();
  };
  // The fitted size of the visible terminal; a new terminal starts at it.
  const size = useRef<{ cols: number; rows: number } | undefined>(undefined);
  const resized = useRef<{ id: string; cols: number; rows: number } | undefined>(undefined);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resizeTimer.current), []);
  const resize = (cols: number, rows: number) => {
    size.current = { cols, rows };
    clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => {
      const id = selected?.id;
      const last = resized.current;
      if (!api || !id || !running || !writable || !current() || (last?.id === id && last.cols === cols && last.rows === rows)) return;
      resized.current = { id, cols, rows };
      // A missed resize only leaves the old grid; the next size change sends it again.
      void api.terminalResize(project.id, id, cols, rows).catch(() => { resized.current = undefined; });
    }, RESIZE_SETTLE_MS);
  };
  // The size reaches a terminal that starts running or is selected while the view keeps its size.
  useEffect(() => {
    if (size.current && running) resize(size.current.cols, size.current.rows);
  }, [selected?.id, running, writable]);
  const create = () => {
    const values = { ...form.values };
    const requestId = randomUUID();
    run(async (target) => {
      const created = await target.terminalCreate({ projectId: project.id, requestId, name: values.name.trim() || undefined, profileId: values.profileId || undefined, ...size.current });
      if (created.projectId !== project.id) throw new Error(copy("Bilgisayardan geçersiz bir terminal yanıtı geldi.", "The computer sent an invalid terminal response."));
      if (!current()) return;
      form.reset({ name: "", profileId: "" });
      haptic.success();
      setCreating(false);
      setSelectedId(created.id);
    });
  };
  const interrupt = () => {
    if (!selected) return;
    const id = selected.id;
    action.reset();
    run(async (target) => { await target.terminalInterrupt(project.id, id); });
  };
  const close = () => {
    if (!closingTerminal) return;
    const id = closingTerminal.id;
    run(async (target) => {
      await target.terminalClose(project.id, id);
      if (!current()) return;
      setClosing(undefined);
      setSelectedId(terminals.find(entry => entry.id !== id)?.id ?? "");
    });
  };
  const uncertaintyFeedback = uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yenile ve çıktıyı kontrol et; aynı komutu yeniden gönderme.", "The result is uncertain. Refresh and inspect the output before sending the same command again.")}>
    <Button label={copy("Sonucu kontrol ettim", "I checked the result")} disabled={busy} onPress={() => { setUncertain(false); setInputError(undefined); action.reset(); }} />
  </Notice> : null;
  const selectTerminal = (id: string) => {
    setSelectedId(id);
    setClosing(undefined);
    setReader(undefined);
    setPicking(false);
  };
  const openReader = (search: boolean) => {
    if (!selected) return;
    Keyboard.dismiss();
    setQuery("");
    setReader(readerOpen?.search === search ? undefined : { id: selected.id, search });
  };
  const typing = writable && running && !uncertain;
  const listStates = <>
    <QueryState size={selected ? "compact" : "region"} query={list} loading={selected ? "none" : "list"}
      empty={!terminals.length} emptyIllustration="no-sessions" emptyTitle={copy("Bu projede terminal yok.", "No terminals in this project.")}
      emptyAction={canCreate ? { label: copy("Terminal oluştur", "Create terminal"), onPress: openCreate } : undefined}
      onManageConnections={manageConnections} />
    {list.data?.writable === false ? <StatusLine tone="info" label={copy("Bu bağlantıda terminaller salt okunur.", "Terminals are read-only on this connection.")} /> : null}
  </>;
  const feedback = !creating && !closing ? <><MutationState mutation={action} />{uncertain ? null : <ErrorNotice error={inputError} />}{uncertaintyFeedback}</> : null;
  return (
    <Screen
      scroll={false}
      title={copy(...toolLabels.terminals)}
      scope={{ computer: machine?.name, project: project.name }}
      context={selected ? <TerminalPill terminal={terminal ?? selected} expanded={picking}
        onPress={() => { Keyboard.dismiss(); setPicking(true); }} /> : undefined}
      refreshState={refresh}
      // The key bar rides the keyboard like the session composer: the frame owns the IME and the home-indicator inset.
      contentOwnsBottomInset
      actions={selected ?
        <>
          <IconButton label={copy("Çıktıda ara", "Search output")} expanded={!!readerOpen?.search} reserveTouchTarget
            onPress={() => openReader(true)}>
            <Search size={iconSize.action} color={readerOpen?.search ? colors.accent : colors.muted} />
          </IconButton>
          {/* Text selection is a mode over the terminal: its selected button shows it and leaves it. */}
          <IconButton label={readerOpen && !readerOpen.search ? copy("Terminale dön", "Back to terminal") : copy("Metin seç", "Select text")}
            expanded={!!readerOpen && !readerOpen.search} reserveTouchTarget disabled={!rawOutput && !readerOpen}
            onPress={() => openReader(false)}>
            <TextSelect size={iconSize.action} color={readerOpen && !readerOpen.search ? colors.accent : colors.muted} />
          </IconButton>
          <ActionMenu label={copy("Terminal işlemleri", "Terminal actions")} subtitle={selected.name}
            reserveTouchTarget onTriggerPress={() => Keyboard.dismiss()} actions={[
              { key: "create", label: copy("Terminal oluştur", "Create terminal"), icon: <Plus size={iconSize.row} color={colors.muted} />,
                disabled: !canCreate, onPress: openCreate },
              { key: "copy", label: copy("Tüm çıktıyı kopyala", "Copy all output"), icon: <Copy size={iconSize.row} color={colors.muted} />,
                disabled: !rawOutput, onPress: clipboard.copy },
              { key: "refresh", label: copy("Yenile", "Refresh"), icon: <RefreshCw size={iconSize.row} color={colors.muted} />,
                disabled: list.isFetching || output.isFetching, onPress: () => { void refresh.onRefresh(); } },
              { key: "interrupt", label: copy("Ctrl+C gönder", "Send Ctrl+C"),
                detail: copy("Çalışan programı durdurur. Kabuk açık kalır.", "Stops the running program. The shell stays open."),
                icon: <Square size={iconSize.row} color={colors.muted} />,
                disabled: !writable || busy || uncertain || !running,
                onPress: interrupt },
              { key: "close", label: copy("Terminali kapat", "Close terminal"), destructive: true,
                detail: copy("Terminali ve çıktısını listeden kaldırır.", "Removes the terminal and its output from the list."),
                icon: <Trash2 size={iconSize.row} color={colors.danger} />, disabled: !writable || busy || uncertain,
                onPress: () => { Keyboard.dismiss(); action.reset(); setClosing({ id: selected.id, name: selected.name }); } },
            ]} />
        </> : undefined}
    >
      {selected ? <TerminalConsoleStage key={selected.id}
        output={output.data} enabled={typing} onInput={sendInput} onResize={resize}
        notices={<>
          {listStates}
          <ErrorNotice error={clipboard.error} />
          {/* One reporter per failure: a failed list already explains a lost link; the output read stays quiet then.
              A cut history is marked inside the terminal ("…"), so it needs no line here. */}
          {list.isError ? null : <QueryState query={output} loading="inline" onManageConnections={manageConnections} />}
          {terminal?.exitCode != null ? <StatusLine tone={terminal.exitCode === 0 ? "info" : "warning"}
            label={terminalClosedLabel(terminal.exitCode, copy)} /> : null}
          {feedback}
        </>}
        overlay={readerOpen ? <View style={{ flex: 1, gap: space.sm }}>
          {readerOpen.search ? <SearchField label={copy("Çıktıda ara", "Search output")} value={query} maxLength={200} onChangeText={setQuery} /> : null}
          <TerminalOutputView output={rawOutput} query={readerOpen.search ? query : ""} waiting={!output.data} />
        </View> : undefined}
      /> : <SessionKeyboardFrame composer={null}>
        <View style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, gap: space.sm }}>
          {listStates}
          {terminals.length && list.isSuccess ? <StateView title={copy("Terminal seç", "Choose a terminal")}
            action={{ label: copy("Terminaller", "Terminals"), onPress: () => setPicking(true) }} /> : null}
          {feedback}
        </View>
      </SessionKeyboardFrame>}
      <TerminalPickerSheet visible={picking} terminals={terminals} selectedId={selected?.id} disabled={busy}
        canCreate={canCreate} onSelect={selectTerminal} onClose={() => setPicking(false)}
        onCreate={() => { setPicking(false); openCreate(); }} />
      <Sheet visible={creating} size="compact" title={copy("Terminal oluştur", "Create terminal")} dirty={form.dirty} dismissible={!busy} onClose={() => setCreating(false)}>
        <Body mono muted>{project.cwd}</Body>
        <Field label={copy("Ad", "Name")} value={form.values.name} editable={!busy} maxLength={80} onChangeText={(value) => form.setField("name", value)} />
        <SelectField label={copy("Kabuk", "Shell")} value={form.values.profileId} disabled={busy} options={[{ value: "", label: copy("Varsayılan", "Default") }, ...(list.data?.profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name }))]} onChange={(value) => form.setField("profileId", value)} />
        {uncertaintyFeedback}
        <FormActions submitLabel={copy("Terminal oluştur", "Create terminal")} busy={busy} disabled={!writable || uncertain} onSubmit={create}
          feedback={<MutationState mutation={action} />} />
      </Sheet>
      <Sheet visible={!!leaving} size="compact" title={copy("Araçtan ayrıl", "Leave tool")} onClose={() => setLeaving(undefined)}>
        <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yenile ve çıktıyı kontrol et; aynı komutu yeniden gönderme.", "The result is uncertain. Refresh and inspect the output before sending the same command again.")} />
        <FormActions submitLabel={copy("Ayrıl", "Leave")} tone="danger"
          onCancel={() => setLeaving(undefined)}
          onSubmit={() => { const leave = leaving; setLeaving(undefined); leave?.repeat(); }} />
      </Sheet>
      <Sheet visible={!!closing} size="compact" title={copy("Terminali kapat", "Close terminal")} dismissible={!busy} onClose={() => setClosing(undefined)}>
        <Body mono>{closing?.name}</Body>
        <Notice tone="warning" message={copy("Terminal ve çıktısı kaldırılır. Çalışan işlemler sonlandırılır.", "The terminal and its output are removed. Running processes end.")} />
        {uncertaintyFeedback}
        <FormActions submitLabel={copy("Terminali kapat", "Close terminal")}
          tone="danger" busy={busy} disabled={!writable || uncertain || !closingTerminal}
          cancelDisabled={busy} onCancel={() => setClosing(undefined)}
          feedback={<MutationState mutation={action} />} onSubmit={close} />
      </Sheet>
    </Screen>
  );
}

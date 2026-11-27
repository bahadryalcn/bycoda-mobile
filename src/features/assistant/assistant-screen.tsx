import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Empty,
  Disclosure,
  ErrorNotice,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  Screen,
  ScreenList,
  StateView,
} from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useHostClient, useHostReadActive, hostKey } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useProjectList } from "../workspace/use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";
import { usePersistentError } from "@/ui/use-persistent-error";
import { AssistantMobileClient } from "./assistant-client";
import { usePendingApprovalCount } from "../approvals/use-approvals";
import { AssistantComposer } from "./assistant-composer";
import { minimizeAssistantCompanion, openAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";
import { assistantNeedsUpdate } from "./assistant-unavailable";
import { AssistantReadAloud } from "./assistant-voice-controls";
import { AssistantCallButton, AssistantCallErrorNotice } from "./assistant-call-controls";
import { endAssistantCall } from "./assistant-call-session";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantVoiceScreen } from "./assistant-voice-screen";
import { AssistantSettingsButton } from "../voice-settings/call-voice-button";
import { AssistantReplyModel } from "./assistant-reply-model";
import { AssistantHomeActions, AssistantHomeHero, AssistantHomeLoading } from "./assistant-home-hero";
import { AssistantMinimizeButton, useAssistantVoiceBusy } from "./assistant-companion";
import { useAssistantTranscript } from "./use-assistant-transcript";
import { useAssistantVoiceEntry } from "./use-assistant-voice-entry";
import { AssistantActivitySection } from "./assistant-activity-section";
import { confirmAction } from "@/ui/confirm";
import { AssistantJobsSection } from "./assistant-jobs-section";
import { AssistantConversationsButton } from "./assistant-conversations";
import { AssistantScopePill } from "./assistant-scope-pill";
import { TranscriptSkeleton } from "../workspace/transcript-skeleton";
import { AssistantCallSeparator, AssistantMessageRow } from "./assistant-message-row";
import {
  assistantCallBaseline,
  assistantCallStart,
  assistantTranscriptRows,
  updateAssistantCallEpisode,
  useAssistantCallEpisodes,
} from "./assistant-call-episode";
import { AssistantLiveSpeech } from "./assistant-live-speech";
import { AssistantQuestionsSection } from "./assistant-questions-section";
import { jobNeedsAttention, jobVisible } from "./assistant-jobs";
import { ownerQuestionActionable } from "./assistant-question";
import {
  assistantHistoryPage,
  assistantMessageVisible,
  assistantSummaryVisible,
  assistantThreadVisible,
} from "./assistant-history";
import type {
  AssistantMessage,
  AssistantResponse,
  AssistantThread,
} from "../../../../src/shared/model/host-contracts/assistant";
import { dateTimeFormat } from "../../../../src/shared/lib/intl";
import { goBack, pushOnce } from "@/ui/navigation";

/** A read answered for another conversation or version than the one asked: the owner tries again. */
const CONVERSATION_CHANGED = "The conversation changed on the computer. Try again.";

export function AssistantScreen({ focusJobId, focusQuestions = false, voiceRequested = false, homeRequest }: {
  focusJobId?: string;
  /** Changes each time the header's assistant button is tapped: an idle assistant returns to its home. */
  homeRequest?: string;
  /** A tapped "the assistant needs you" push: the home opens with its questions in view. */
  focusQuestions?: boolean;
  voiceRequested?: boolean;
} = {}) {
  const machine = useActiveMachine(),
    connection = useConnectionScope(),
    transport = useHostClient();
  const client = useMemo(
    () =>
      transport && connection.review
        ? new AssistantMobileClient({
            environmentId: connection.review.environmentId,
            current: () => connection.isCurrent(),
            request: (method, params, options) => transport.request(method, params, options),
          })
        : null,
    [transport, connection],
  );
  const copy = useCopy();
  if (!machine)
    return (
      <Screen title={copy("Asistan", "Assistant")} scroll={false}>
        <View style={{ flex: 1 }}>
          <Empty
            compact={false}
            illustration="connect-computer"
            title={copy("Önce bir bilgisayar bağla", "Connect a computer first")}
            detail={voiceRequested
              ? copy("Sesli görüşme için bağlı bir bilgisayar gerekir.", "A voice call needs a connected computer.")
              : copy("Asistan, bağlı bilgisayarındaki oturumunla çalışır.", "The assistant works with your session on a connected computer.")}
            action={{
              label: copy("Bilgisayar bağla", "Connect a computer"),
              onPress: () => pushOnce("/machines"),
            }}
          />
        </View>
      </Screen>
    );
  if (!client)
    return (
      <Screen title={copy("Asistan", "Assistant")} scroll={false}>
        <View style={{ flex: 1 }}>
          <Empty
            compact={false}
            illustration="permission"
            title={copy("Erişim gerekiyor", "Access needed")}
            detail={copy(
              "Asistan için bilgisayar erişimini doğrula.",
              "Verify access to this computer to use the assistant.",
            )}
            action={{ label: copy("Bilgisayarları aç", "Open computers"), onPress: () => pushOnce("/machines") }}
          />
        </View>
      </Screen>
    );
  return (
    <AssistantWorkspace
      key={connection.token}
      client={client}
      machineId={machine.id}
      environmentId={connection.review!.environmentId}
      machineName={machine.name}
      sourceKey={connection.token}
      focusJobId={focusJobId}
      focusQuestions={focusQuestions}
      voiceRequested={voiceRequested}
      homeRequest={homeRequest}
      current={() => connection.isCurrent()}
    />
  );
}

function AssistantWorkspace({
  client,
  machineId,
  environmentId,
  machineName,
  sourceKey,
  focusJobId,
  focusQuestions,
  voiceRequested,
  homeRequest,
  current,
}: {
  client: AssistantMobileClient;
  machineId: string;
  environmentId: string;
  machineName: string;
  sourceKey: string;
  focusJobId?: string;
  focusQuestions?: boolean;
  voiceRequested: boolean;
  homeRequest?: string;
  current(): boolean;
}) {
  const copy = useCopy(),
    locale = useLocale(),
    active = useHostReadActive(),
    projects = useProjectList(),
    cache = useQueryClient();
  // A running call, dictation or read-aloud can be kept in the floating window from the header.
  const voiceBusy = useAssistantVoiceBusy();
  const voiceMode = useAssistantCompanion(state => state.surface === "voice");
  const transcript = useAssistantTranscript();
  const callPhase = useAssistantCall(state => state.phase);
  const callActive = callPhase !== "idle";
  const replyVersion = useAssistantCall(state => state.replyVersion);
  const saved = useAssistantCompanion.getState();
  const sameCompanion = saved.machineId === machineId && saved.environmentId === environmentId;
  // Entering the assistant opens its home. Only a running call or read-aloud reopens the conversation it
  // belongs to: restoring any earlier conversation left the owner unable to reach the home again.
  const resumeThread = sameCompanion && (saved.surface === "voice" || saved.voice !== "idle" || useAssistantCall.getState().phase !== "idle");
  const [projectId, setProjectId] = useState(sameCompanion ? saved.projectId : ""),
    [thread, setThread] = useState<AssistantThread | null>(resumeThread ? saved.thread : null),
    [busyKind, setBusyKind] = useState<"open" | "older" | null>(null),
    [issue, setIssue] = useState<unknown>(null);
  const [replyReviewRequired, setReplyReviewRequired] = useState(false);
  const busy = busyKind !== null;
  // Expanded and minimized views share one captured Room selection without keeping a route stack alive.
  useEffect(() => {
    openAssistantCompanion(machineId, environmentId);
  }, [machineId, environmentId]);
  // Only selected identity is retained; Host queries still validate visibility and message history.
  useEffect(() => {
    useAssistantCompanion.setState({ projectId, thread });
  }, [projectId, thread]);
  const pending = useRef(false),
    selection = useRef(0);
  // A tapped push names a job or the waiting questions: they live on the home, so a conversation left
  // open earlier gives way to it (never during a call).
  useEffect(() => {
    if ((!focusJobId && !focusQuestions && !homeRequest) || useAssistantCall.getState().phase !== "idle" || useAssistantCompanion.getState().surface === "voice") return;
    selection.current++;
    setThread(null);
  }, [focusJobId, focusQuestions, homeRequest]);
  const access = { ready: projects.directoryReady, visible: projects.isProjectVisible };
  const snapshot = useQuery({
    queryKey: hostKey(machineId, ["assistant", sourceKey, "snapshot"]),
    queryFn: ({ signal }) => client.read({ op: "snapshot", limit: 100 }, signal),
    enabled: active,
    retry: false,
    networkMode: "always",
    // A call already keeps the radio busy; the home it covers refreshes less often until it ends.
    refetchInterval: active ? (callActive ? 60000 : 15000) : false,
    refetchIntervalInBackground: false,
  });
  const denied = (error: unknown) =>
    ["auth", "identity", "protocol", "unsupported"].includes(remoteErrorKind(error) ?? "");
  const state = current() && !denied(snapshot.error) ? snapshot.data?.snapshot : undefined;
  const threads = (state?.threads ?? []).filter((row) => assistantThreadVisible(row, access));
  const visibleThread = state && thread && assistantThreadVisible(thread, access) ? thread : null;
  const home = !voiceMode && !visibleThread && !!state;
  // The home stage holds while its read loads or fails, so the screen never switches chrome under the owner.
  const stage = !voiceMode && !visibleThread;
  const inCall = voiceMode || voiceRequested;
  // A job a tapped push pointed at is listed first.
  const jobs = (state?.jobs ?? [])
    .filter((job) => jobNeedsAttention(job) && jobVisible(job, access))
    .sort((a, b) => Number(b.id === focusJobId) - Number(a.id === focusJobId));
  const pendingApprovals = usePendingApprovalCount();
  const questions = (state?.ownerQuestions ?? []).filter((question) =>
    ownerQuestionActionable(question, access.visible, access.ready),
  );
  const [pages, setPages] = useState<
      Record<string, { version: number; messages: AssistantMessage[] }>
    >({}),
    [before, setBefore] = useState<
      Record<string, { before: number; beforeId: string; version: number } | undefined>
    >({}),
    [more, setMore] = useState<Record<string, boolean>>({});
  const history = useQuery({
    queryKey: hostKey(machineId, ["assistant", sourceKey, "messages", visibleThread?.id]),
    queryFn: ({ signal }) =>
      client.read({ op: "threads.messages", threadId: visibleThread!.id, limit: 100 }, signal),
    enabled: active && !!visibleThread,
    retry: false,
    networkMode: "always",
    // During a call every reply refetches the conversation (below), so it is not also polled.
    refetchInterval: active && !callActive ? 15000 : false,
    refetchIntervalInBackground: false,
  });
  // Voice sends run in the shell-owned call; refresh its authoritative transcript after every reply.
  useEffect(() => {
    if (replyVersion && active && visibleThread && current()) void history.refetch().catch(() => {});
  }, [replyVersion, active, visibleThread?.id]);
  const raw =
    visibleThread && current() && !denied(history.error)
      ? assistantHistoryPage(
          history.data?.messages ?? [],
          visibleThread.id,
          pages[visibleThread.id] &&
            history.data?.thread?.version === pages[visibleThread.id].version
            ? pages[visibleThread.id].messages
            : [],
        ).messages
      : [];
  const messages = raw.filter((message) => assistantMessageVisible(message, access));
  // One conversation per scope, with each voice call marked where it began. The call screen shows the
  // current call's messages; the conversation before it stays one tap away.
  const callEpisodes = useAssistantCallEpisodes((state) => state.episodes);
  const lastCall = callEpisodes.at(-1);
  const threadCall = visibleThread && lastCall?.threadId === visibleThread.id ? lastCall : undefined;
  // The call's messages are those newer than the conversation's newest at its start (Host clock both).
  useEffect(() => {
    if (threadCall?.open && threadCall.baseline === undefined && history.data && !history.isPending && current())
      updateAssistantCallEpisode(threadCall.id, { baseline: assistantCallBaseline(raw) });
  });
  const callStart = threadCall ? assistantCallStart(messages, threadCall.baseline) : undefined;
  const hiddenEarlier = voiceMode && threadCall && !threadCall.earlier ? (callStart ?? messages.length) : 0;
  const rows = assistantTranscriptRows(
    hiddenEarlier ? messages.slice(hiddenEarlier) : messages,
    callEpisodes.filter((episode) => episode.threadId === visibleThread?.id),
    { trailing: voiceMode && threadCall && callStart === messages.length ? threadCall.startedAt : undefined },
  );
  const canonicalThread = denied(history.error)
    ? null
    : history.data?.thread && history.data.thread.id === visibleThread?.id
      ? history.data.thread
      : visibleThread;
  const refreshAll = async () => {
    await snapshot.refetch();
    if (visibleThread) await history.refetch();
  };
  const writable = current() && active && !!state;
  // The Host refuses messages until the assistant is set up and switched on; say so instead of failing a send.
  const configured = !!state && state.profile.enabled && state.profile.setupComplete !== false &&
    // The Host also needs a reply model: the reply role's own choice or the saved worker choice.
    (!("execution" in state.profile) || (state.profile.replyExecution ?? state.profile.execution ?? null) !== null);
  const perform = async (kind: NonNullable<typeof busyKind>, action: () => Promise<void>) => {
    if (pending.current || !current() || !active) return;
    pending.current = true;
    setBusyKind(kind);
    setIssue(null);
    try {
      await action();
    } catch (error) {
      // The real cause is shown (connection, access, a refused read), never one guessed sentence.
      if (current()) setIssue(error);
    } finally {
      pending.current = false;
      if (current()) setBusyKind(null);
    }
  };
  // Opens the conversation of the current scope, or of the scope just chosen (`scope`, before its state lands).
  const open = async (scope = projectId) => {
    let opened: AssistantThread | undefined;
    if (useAssistantCall.getState().phase !== "idle") return;
    const selected = scope,
      version = ++selection.current;
    if (selected && (!projects.directoryReady || !projects.isProjectVisible(selected))) return;
    await perform("open", async () => {
      const response = await client.read({
        op: "threads.open",
        ...(selected ? { projectId: selected } : {}),
      });
      if (
        !current() ||
        version !== selection.current ||
        (selected && !projects.isProjectVisible(selected))
      )
        return;
      if (!response.thread || response.thread.projectId !== (selected || undefined))
        throw new Error(CONVERSATION_CHANGED);
      setThread(response.thread);
      opened = response.thread;
    });
    return opened;
  };
  // Back from a conversation (header, gesture or the system button) returns to the assistant's home, like
  // every other list → detail pair; only Back on the home leaves the assistant. Other navigation proceeds.
  const conversationOpen = !voiceMode && !voiceRequested && !!visibleThread;
  usePreventRemove(conversationOpen, ({ data, repeat }) => {
    if (data.action.type === "GO_BACK" || data.action.type === "POP") {
      selection.current++;
      setThread(null);
    } else repeat(); // Lifts the prevention first; re-dispatching while prevented would loop.
  });
  const setupMessage = copy("Asistan {p0} üzerinde kapalı. Kurulumu o bilgisayardaki bycoda’da bitir.", "The assistant is off on {p0}. Finish its setup in bycoda on that computer.", { p0: machineName });
  // Why a call cannot start (assistant off, no access, computer too old, unreadable assistant): the call
  // screen says it instead of "Connecting…" with no end.
  // A read that heals itself inside the grace (reconnect, resume) never reaches the call screen.
  const snapshotError = usePersistentError(!state && !snapshot.isPending ? snapshot.error : null);
  const voiceUnavailable = state && !configured ? <Notice tone="warning" message={setupMessage} />
    : snapshotError ? (assistantNeedsUpdate(snapshotError)
      ? <Notice tone="warning" message={copy("Bu bilgisayar henüz asistanı sunmuyor. Bilgisayarındaki bycoda’yı güncelle.", "This computer does not offer the assistant yet. Update bycoda on your computer.")} />
      : <ErrorNotice error={snapshotError} onRetry={() => void snapshot.refetch()} />)
    : undefined;
  const voiceEntry = useAssistantVoiceEntry({
    requested: voiceRequested,
    consume: () => router.setParams({ voice: undefined }),
    blocked: !!voiceUnavailable,
    ready: writable && configured && !busy && (!projectId || projects.isProjectVisible(projectId)),
    machineId, environmentId, thread: visibleThread, open,
    current: () => current() && (!projectId || projects.isProjectVisible(projectId)),
  });
  const older = () =>
    void perform("older", async () => {
      if (!visibleThread) return;
      const selected = visibleThread.id,
        version = selection.current,
        cursor =
          before[selected]?.version === history.data?.thread?.version
            ? before[selected]
            : raw[0]
              ? {
                  before: raw[0].createdAt,
                  beforeId: raw[0].id,
                  version: history.data?.thread?.version,
                }
              : undefined;
      if (cursor === undefined) return;
      const response = await client.read({
        op: "threads.messages",
        threadId: selected,
        limit: 100,
        before: cursor.before,
        beforeId: cursor.beforeId,
      });
      if (
        !current() ||
        version !== selection.current ||
        !assistantThreadVisible(visibleThread, access)
      )
        return;
      if (!response.thread || response.thread.version !== history.data?.thread?.version) {
        await history.refetch();
        throw new Error(CONVERSATION_CHANGED);
      }
      const page = assistantHistoryPage(response.messages ?? [], selected, raw, true);
      setPages((old) => ({
        ...old,
        [selected]: { version: response.thread!.version, messages: page.messages },
      }));
      setBefore((old) => ({
        ...old,
        [selected]:
          page.before !== undefined && page.beforeId
            ? { before: page.before, beforeId: page.beforeId, version: response.thread!.version }
            : undefined,
      }));
      setMore((old) => ({ ...old, [selected]: (response.messages?.length ?? 0) === 100 }));
    });
  // The shared presenter translates the app's own English messages through the catalogs.
  const operationIssue = issue ? <ErrorNotice error={issue} /> : null;
  const questionCards = state ? (
    <AssistantQuestionsSection
      client={client}
      questions={questions}
      machineId={machineId}
      environmentId={environmentId}
      current={current}
      enabled={writable}
      onChanged={refreshAll}
    />
  ) : null;
  // The desktop Room opens on what needs the owner: questions, then jobs, then what the assistant did.
  const focusNotice = state && focusJobId && !jobs.some((job) => job.id === focusJobId)
    ? <StateView size="compact" title={copy("Bu iş artık senden bir şey beklemiyor.", "This job no longer needs you.")} />
    : state && focusQuestions && !questions.length
      ? <StateView size="compact" title={copy("Bekleyen soru yok.", "No questions are waiting.")} />
      : null;
  const work = state ? (
    <>
      {focusNotice}
      {questionCards}
      <AssistantJobsSection
        client={client}
        jobs={jobs}
        paused={state.paused}
        holds={state.jobHolds}
        current={current}
        enabled={writable}
        onChanged={refreshAll}
      />
      {/* The home shows what the assistant did only when it did something; an empty journal is not news. */}
      <AssistantActivitySection activity={state.activity} access={access} />
    </>
  ) : null;
  const visibleProjectNames = new Map(
    (projects.directoryReady ? projects.data ?? [] : [])
      .filter(project => projects.isProjectVisible(project.id))
      .map(project => [project.id, project.name]),
  );
  const globalScope = copy("Genel", "Global");
  const projectScope = copy("Proje", "Project");
  const scopeHidden = !!projectId && !visibleProjectNames.has(projectId);
  const scopeName = !projectId ? globalScope : visibleProjectNames.get(projectId) ||
    (projects.verifying ? copy("Projeler yükleniyor…", "Loading projects…") : projectScope);
  // Each conversation is titled by what it is about (its summary when visible), with scope and time below.
  const recentOptions = inCall ? [] : threads.map(row => {
    const project = row.projectId ? visibleProjectNames.get(row.projectId) || projectScope : globalScope;
    const purpose = row.purpose === "job-planning" ? copy("Planlama", "Planning") : copy("Konuşma", "Conversation");
    const summary = assistantSummaryVisible(row, access) ? row.summary.trim().split("\n")[0]?.trim() : "";
    const date = new Date(row.updatedAt);
    const time = Number.isFinite(date.getTime())
      ? dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
      : copy("Zaman bilinmiyor", "Time unavailable");
    return { value: row.id, label: summary || purpose, detail: [project, summary ? purpose : "", time].filter(Boolean).join(" · ") };
  });
  // Waiting approvals are navigation among what waits for the owner, not a second primary button.
  const approvalAction = pendingApprovals ? <NavigationGroup>
    <NavigationRow label={copy("Onaylar", "Approvals")} detail={copy("{p0} bekliyor", "{p0} waiting", { p0: pendingApprovals })}
      separator={false} onPress={() => pushOnce("/approvals")} />
  </NavigationGroup> : null;
  const title = state?.profile.name || copy("Asistan", "Assistant");
  const profileName = state?.profile.name;
  // The floating window names the assistant as the computer does.
  useEffect(() => { if (profileName) useAssistantCompanion.setState({ name: profileName }); }, [profileName]);
  // The conversation's scope, as on the desktop: General or one project of this computer, chosen in the top
  // row of the home, the conversation and the call. It is the assistant's own choice (the app-wide project
  // stays), and each scope has its own conversation: an open conversation or call moves to the chosen
  // scope's conversation, the home stays the home. A live call ends first, after the owner confirms.
  const changeScope = (value: string) => {
    if (value === projectId || !current() || busy || (value && !projects.isProjectVisible(value))) return;
    const sessionId = useAssistantCall.getState().sessionId;
    const reopen = !!visibleThread || voiceMode;
    const select = () => {
      const { phase, sessionId: liveId } = useAssistantCall.getState();
      if (!current() || (value && !projects.isProjectVisible(value)) ||
        (phase !== "idle" && (liveId !== sessionId || (phase !== "listening" && phase !== "muted")))) return;
      if (phase !== "idle") {
        endAssistantCall();
        voiceEntry.cancel();
        useAssistantCompanion.setState({ surface: "chat" });
      }
      selection.current++;
      setProjectId(value);
      setThread(null);
      if (reopen) void open(value);
    };
    if (!callActive) select();
    else confirmAction(copy("Konuşma kapsamı", "Conversation scope"),
      copy("Kapsamı değiştirmek için bu görüşmeyi bitir.", "End this call to change the conversation scope."),
      copy("Görüşmeyi bitir", "End voice call"), select);
  };
  const scopeControl = state ? <AssistantScopePill projectId={projectId} label={scopeName}
    disabled={busy || (callActive && callPhase !== "listening" && callPhase !== "muted")} onChange={changeScope} /> : undefined;
  // The reply model saves only on its own Save; the scope lives in the top row, not in this sheet.
  const settings = state ? (
    <AssistantReplyModel client={client} profile={state.profile} projectId={projectId}
      disabled={!writable || busy} current={current} reviewRequired={replyReviewRequired} onReviewRequired={setReplyReviewRequired}
      onRefresh={async () => {
        if (!current()) return;
        const result = await snapshot.refetch({ cancelRefetch: false });
        return current() && result.isSuccess ? result.data.snapshot?.profile : undefined;
      }} onSaved={(profile) => {
        if (!current()) return;
        const key = hostKey(machineId, ["assistant", sourceKey, "snapshot"]);
        cache.setQueryData<AssistantResponse>(key, previous => previous?.snapshot &&
          previous.snapshot.profile.version < profile.version
          ? { ...previous, snapshot: { ...previous.snapshot, profile } } : previous);
        void cache.invalidateQueries({ queryKey: key }).catch(() => {});
      }} />
  ) : null;
  const settingsButton = settings ? (
    <AssistantSettingsButton>{settings}</AssistantSettingsButton>
  ) : null;
  // Conversations are navigation, opened from the header rather than listed on the home.
  const conversationsButton = !inCall && state ? (
    <AssistantConversationsButton options={recentOptions} selected={visibleThread?.id} disabled={busy || callActive}
      onSelect={(id) => {
        if (!current() || pending.current || useAssistantCall.getState().phase !== "idle") return false;
        const selected = threads.find((row) => row.id === id);
        if (!selected || !assistantThreadVisible(selected, access)) return false;
        selection.current++;
        setProjectId(selected.projectId ?? "");
        setThread(selected);
        return true;
      }} />
  ) : null;
  // An open conversation is a pushed page: Back and the name, then the computer (and project) pills on the
  // left of the one top row, its icon actions on the right (the shared ScreenHeading rule). While a call,
  // dictation or read-aloud runs, Minimize takes the call's slot: a call cannot start then anyway.
  const chatOpen = !voiceMode && !!visibleThread;
  const chatActions = chatOpen && visibleThread ? <>
    {voiceBusy ? <AssistantMinimizeButton /> : <AssistantCallButton onStart={voiceEntry.start} enabled={writable && configured} />}
    {conversationsButton}
    {settingsButton}
  </> : undefined;
  const header = (
    <>
      {chatOpen ? <AssistantCallErrorNotice /> : null}
      {!home && !inCall && state ? approvalAction : null}
      {/* The call screen shows the connection state once; its chat pane stays on the transcript. */}
      {!inCall && state ? <QueryState query={snapshot} loading="inline" /> : null}
      {home ? <AssistantHomeHero name={title} machineName={machineName}
        setupNeeded={!configured} compact={!!questions.length || !!jobs.length || !!focusNotice || !!pendingApprovals} /> : null}
      {home ? <View style={{ gap: space.lg, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        {approvalAction}
        {work}
      </View> : null}
      {!inCall ? operationIssue : null}
      {visibleThread ? (
        <>
          {/* Loading is the message skeleton below; this line reports only a failed read. */}
          <QueryState query={history} loading="none" />
          {/* A planning conversation has no management tools: one tap returns to the scope's conversation. */}
          {!inCall && visibleThread.purpose === "job-planning" ? (
            <Button
              label={copy("Konuşmayı aç", "Open conversation")}
              tone="quiet"
              onPress={() => void open()}
              busy={busyKind === "open"}
              disabled={busy || callActive || !state || (!!projectId && !projects.isProjectVisible(projectId))}
            />
          ) : null}
          {canonicalThread &&
          assistantSummaryVisible(canonicalThread, access) &&
          canonicalThread.summary ? (
            // A short summary is read in place; only a long one folds away.
            canonicalThread.summary.length > 240 ? <Disclosure label={copy("Konuşma özeti", "Conversation summary")}>
              <Body>{canonicalThread.summary}</Body>
            </Disclosure> : <Body muted>{canonicalThread.summary}</Body>
          ) : null}
          {hiddenEarlier && threadCall ? (
            <Button
              label={copy("Önceki mesajları yükle", "Load earlier messages")}
              onPress={() => updateAssistantCallEpisode(threadCall.id, { earlier: true })}
            />
          ) : raw.length >= 100 && more[visibleThread.id] !== false ? (
            <Button
              label={copy("Önceki mesajları yükle", "Load earlier messages")}
              onPress={older}
              disabled={busy}
              busy={busyKind === "older"}
            />
          ) : null}
          {/* A call that has not said anything yet shows only its "Call" mark, not an empty conversation. */}
          {!inCall && !history.isPending && !messages.length ? (
            <Empty
              compact
              illustration="chat-empty"
              title={copy("Henüz mesaj yok", "No messages yet")}
              detail={copy("Yaz ya da sesli görüşme başlat.", "Write or start a voice call.")}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
  // The home docks its two ways to start where a conversation's composer sits, always in reach.
  const homeActions = home ? <AssistantHomeActions
    voiceBusy={voiceEntry.pending} openBusy={busyKind === "open"}
    voiceDisabled={busy || callActive || !writable || !configured || scopeHidden} openDisabled={busy || !state || !configured || scopeHidden}
    onVoice={voiceEntry.start} onOpen={() => void open()} /> : null;
  const composer = homeActions ?? (
        visibleThread && writable ? (<>
          {configured ? null : <Notice tone="warning" message={setupMessage} />}
          <AssistantComposer
            key={visibleThread.id}
            client={client}
            machineId={machineId}
            environmentId={environmentId}
            threadId={visibleThread.id}
            current={() => current() && (!visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId))}
            voiceCurrent={() => !visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId)}
            enabled={writable}
            sendable={configured}
            onSettled={refreshAll}
          />
        </>) : null
  );
  const lastReply = messages.findLast(message => message.role === "assistant");
  const conversation = (
    <ScreenList
      title={voiceMode ? undefined : title}
      scope={chatOpen ? { computer: machineName } : undefined}
      scopeControl={chatOpen ? scopeControl : undefined}
      computerSwitch={false}
      actions={chatActions}
      // The home's hero takes the free height so the orb sits in its middle.
      headerFill={home}
      // On the home and call stages the backdrop runs behind the whole transcript, not only its top strip.
      style={stage || voiceMode ? { backgroundColor: "transparent" } : undefined}
      header={header}
      data={rows}
      ListEmptyComponent={visibleThread && history.isPending && !denied(history.error) ? (
        <TranscriptSkeleton label={copy("Konuşma yükleniyor…", "Loading conversation…")} />
      ) : !inCall && !state ? (
        <>
          <QueryState query={snapshot} loading="centered"
            renderLoading={(label) => <AssistantHomeLoading label={label} />} />
          {!snapshot.isPending && assistantNeedsUpdate(snapshot.error) ? <Empty compact illustration="permission"
            title={copy("Bilgisayarındaki bycoda’yı güncelle", "Update bycoda on your computer")}
            detail={copy("Bu bilgisayar henüz asistanı sunmuyor. Güncelledikten sonra sohbet ve sesli görüşme burada açılır.", "This computer does not offer the assistant yet. After updating, chat and voice calls appear here.")} /> : null}
        </>
      ) : undefined}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => item.kind === "call" ? <AssistantCallSeparator at={item.at} /> : (
        <>
          <AssistantMessageRow message={item.message} voiceLabel={copy("Sesle", "By voice")} />
          {/* Read aloud belongs to the reply it reads: under the last assistant message, not at the list's end. */}
          {!voiceMode && visibleThread && item.message.id === lastReply?.id ? (
            <View style={{ alignSelf: "flex-start" }}>
              <AssistantReadAloud target={{ machineId, environmentId, threadId: visibleThread.id }} text={lastReply.text}
                enabled={writable} current={() => !visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId)} />
            </View>
          ) : null}
        </>
      )}
      refresh={refreshAll}
      ListFooterComponent={voiceMode ? <AssistantLiveSpeech target={visibleThread ? { machineId, environmentId, threadId: visibleThread.id } : undefined} /> : undefined}
    />
  );
  return (
    <>
    <Stack.Screen options={{ title, headerShown: !voiceMode && !voiceRequested && !stage }} />
    <AssistantVoiceScreen active={voiceMode || voiceRequested} stage={stage} name={title} computer={machineName}
      settings={settingsButton} actions={conversationsButton}
      onBack={() => goBack("/")}
      composer={composer} feedback={<>{inCall && questions.length ? questionCards : null}{approvalAction}<QueryState query={snapshot} loading="none" />{operationIssue}</>}
      unavailable={voiceUnavailable}
      scope={{ computer: machineName }}
      scopeControl={scopeControl}
      transcriptVisible={transcript.visible}
      pending={voiceEntry.pending} ready={writable && configured && !busy}
      composerVisible={transcript.composer} onToggleComposer={transcript.toggleComposer}
      onToggleTranscript={transcript.toggle} onStart={voiceEntry.start}
      onMinimize={() => { minimizeAssistantCompanion(); goBack("/"); }}
      onEnd={() => { voiceEntry.cancel(); endAssistantCall(); useAssistantCall.setState({ asleep: undefined }); useAssistantCompanion.setState({ surface: "chat" }); }}>
      {conversation}
    </AssistantVoiceScreen>
    </>
  );
}

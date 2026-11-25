import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Empty,
  Disclosure,
  NavigationGroup,
  Notice,
  QueryState,
  Screen,
  ScreenList,
  Section,
  SegmentedControl,
  SelectField,
  StateView,
} from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useHostClient, useHostReadActive, hostKey } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useProjectList } from "../workspace/use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";
import { AssistantMobileClient, type OwnerPresence } from "./assistant-client";
import { usePendingApprovalCount } from "../approvals/use-approvals";
import { AssistantComposer } from "./assistant-composer";
import { minimizeAssistantCompanion, openAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";
import { assistantNeedsUpdate } from "./assistant-unavailable";
import { AssistantReadAloud } from "./assistant-voice-controls";
import { AssistantCallButton, AssistantCallError } from "./assistant-call-controls";
import { endAssistantCall } from "./assistant-call-session";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantVoiceScreen } from "./assistant-voice-screen";
import { CallVoiceButton } from "../voice-settings/call-voice-button";
import { AssistantReplyModel } from "./assistant-reply-model";
import { AssistantContextLine, AssistantHomeHero, AssistantHomeLoading } from "./assistant-home-hero";
import { useAssistantTranscript } from "./use-assistant-transcript";
import { useAssistantVoiceEntry } from "./use-assistant-voice-entry";
import { AssistantPermissions } from "./assistant-permissions";
import { AssistantActivitySection } from "./assistant-activity-section";
import { confirmAction } from "@/ui/confirm";
import { AssistantJobsSection } from "./assistant-jobs-section";
import { AssistantMessageRow } from "./assistant-message-row";
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

export function AssistantScreen({ focusJobId, focusQuestions = false, voiceRequested = false }: {
  focusJobId?: string;
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
            title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
            detail={voiceRequested
              ? copy("Sesli görüşme için bağlı bir bilgisayar gerekir.", "A voice call needs a connected computer.")
              : copy("Asistan, bağlı bilgisayarındaki oturumunla çalışır.", "The assistant works with your session on a connected computer.")}
            action={{
              label: copy("Bilgisayar bağla", "Connect a computer"),
              onPress: () => router.push("/machines"),
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
              "Asistan için bilgisayar erişimini doğrulayın.",
              "Verify access to this computer to use the assistant.",
            )}
            action={{ label: copy("Bilgisayarları aç", "Open computers"), onPress: () => router.push("/machines") }}
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
  current(): boolean;
}) {
  const copy = useCopy(),
    locale = useLocale(),
    active = useHostReadActive(),
    projects = useProjectList(),
    cache = useQueryClient();
  const { uiStyles } = useMobileTheme();
  const voiceMode = useAssistantCompanion(state => state.surface === "voice");
  const transcript = useAssistantTranscript();
  const callPhase = useAssistantCall(state => state.phase);
  const callActive = callPhase !== "idle";
  const replyVersion = useAssistantCall(state => state.replyVersion);
  const saved = useAssistantCompanion.getState();
  const sameCompanion = saved.machineId === machineId && saved.environmentId === environmentId;
  const [projectId, setProjectId] = useState(sameCompanion ? saved.projectId : ""),
    [thread, setThread] = useState<AssistantThread | null>(sameCompanion ? saved.thread : null),
    [busyKind, setBusyKind] = useState<
      "open" | "inspect" | "older" | "stop" | `presence-${OwnerPresence}` | null
    >(null),
    [issue, setIssue] = useState(false),
    [presenceUnknown, setPresenceUnknown] = useState(false);
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
    if ((!focusJobId && !focusQuestions) || useAssistantCall.getState().phase !== "idle" || useAssistantCompanion.getState().surface === "voice") return;
    selection.current++;
    setThread(null);
  }, [focusJobId, focusQuestions]);
  const access = { ready: projects.directoryReady, visible: projects.isProjectVisible };
  const snapshot = useQuery({
    queryKey: hostKey(machineId, ["assistant", sourceKey, "snapshot"]),
    queryFn: ({ signal }) => client.read({ op: "snapshot", limit: 100 }, signal),
    enabled: active,
    retry: false,
    networkMode: "always",
    refetchInterval: active ? 15000 : false,
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
    refetchInterval: active ? 15000 : false,
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
    setIssue(false);
    try {
      await action();
    } catch {
      if (current()) setIssue(true);
    } finally {
      pending.current = false;
      if (current()) setBusyKind(null);
    }
  };
  const open = async () => {
    let opened: AssistantThread | undefined;
    if (useAssistantCall.getState().phase !== "idle") return;
    const selected = projectId,
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
        throw new Error("source");
      setThread(response.thread);
      opened = response.thread;
    });
    return opened;
  };
  const voiceEntry = useAssistantVoiceEntry({
    requested: voiceRequested,
    consume: () => router.setParams({ voice: undefined }),
    ready: writable && configured && !busy && (!projectId || projects.isProjectVisible(projectId)),
    machineId, environmentId, thread: visibleThread, open,
    current: () => current() && (!projectId || projects.isProjectVisible(projectId)),
  });
  const setPresence = (value: OwnerPresence) =>
    void perform(`presence-${value}`, async () => {
      try {
        await client.setPresence(value);
      } catch (error) {
        if (current()) setPresenceUnknown(client.pendingPresence?.status === "unknown");
        throw error;
      }
      await cache.invalidateQueries({
        queryKey: hostKey(machineId, ["assistant", sourceKey, "snapshot"]),
      });
    });
  const inspect = () =>
    void perform("inspect", async () => {
      const value = await client.inspectPresence();
      if (!current()) return;
      cache.setQueryData<AssistantResponse>(
        hostKey(machineId, ["assistant", sourceKey, "snapshot"]),
        { snapshot: value },
      );
      setPresenceUnknown(false);
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
        throw new Error("source");
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
  const operationIssue = issue && !presenceUnknown ? (
    <Notice tone="warning" message={copy(
      "İşlem tamamlanamadı. Bilgisayar bağlantısını ve erişimi kontrol edin.",
      "The operation could not be completed. Check this computer connection and access.",
    )} />
  ) : null;
  const presence = state ? (
    <View style={{ gap: space.sm }}>
      <SegmentedControl
        label={copy("Durumum", "My presence")}
        value={state.presence.state}
        disabled={busy || presenceUnknown || !writable}
        options={[
          { value: "present", label: copy("Buradayım", "Here") },
          { value: "away", label: copy("Uzağım", "Away") },
          { value: "dnd", label: copy("Rahatsız etmeyin", "Do not disturb") },
        ]}
        onChange={(value) => { if (value !== state.presence.state) setPresence(value as OwnerPresence); }}
      />
      {presenceUnknown ? (
        <>
          <Notice
            tone="warning"
            message={copy(
              "Durum değişikliği doğrulanamadı. Otomatik olarak yeniden gönderilmeyecek.",
              "The status change could not be confirmed. It will not be resent automatically.",
            )}
          />
          <Button
            label={copy("Güncel durumu oku", "Read current status")}
            onPress={inspect}
            disabled={busy}
            busy={busyKind === "inspect"}
          />
        </>
      ) : null}
    </View>
  ) : null;
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
        holds={state.jobHolds}
        current={current}
        enabled={writable}
        onChanged={refreshAll}
      />
      <AssistantActivitySection activity={state.activity} access={access} loading={snapshot.isPending} />
    </>
  ) : null;
  // Profile preferences, with the desktop's group names, and the rare pause of all the assistant's work.
  const preferences = state ? (
    <>
      <AssistantPermissions key={sourceKey} profile={state.profile} client={client}
        projects={projects.directoryReady ? projects.data ?? [] : []} enabled={writable && !busy} current={current} onChanged={refreshAll} />
      <Button label={copy("Asistanın işlerini duraklat", "Pause the assistant's work")} tone="danger" disabled={!writable || busy} busy={busyKind === "stop"}
        onPress={() => confirmAction(copy("Asistanın işlerini duraklat", "Pause the assistant's work"),
          copy("Asistanın çalışmaları duraklatılır. Devam etmek için bilgisayardaki bycoda’dan yeniden başlat.", "The assistant's work pauses. Resume it from bycoda on your computer."),
          copy("Duraklat", "Pause"),
          () => { void perform("stop", async () => { await client.pauseAll(); await refreshAll(); }); })} />
      {operationIssue}
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
  const matchingThreadDetails = new Map<string, number>();
  const recentOptions = inCall ? [] : threads.map(row => {
    const project = row.projectId ? visibleProjectNames.get(row.projectId) || projectScope : globalScope;
    const purpose = row.purpose === "job-planning" ? copy("Planlama", "Planning") : copy("Konuşma", "Conversation");
    const label = `${project} · ${purpose}`;
    const date = new Date(row.updatedAt);
    const time = Number.isFinite(date.getTime())
      ? dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
      : copy("Zaman bilinmiyor", "Time unavailable");
    const key = JSON.stringify([label, time]);
    const occurrence = (matchingThreadDetails.get(key) ?? 0) + 1;
    matchingThreadDetails.set(key, occurrence);
    return { value: row.id, label, detail: occurrence === 1 ? time : `${time} · ${occurrence.toLocaleString(locale)}` };
  });
  const recentConversations = !inCall ? (
    <>
      {visibleThread?.purpose === "job-planning" ? (
        <Button
          label={copy("Konuşmayı aç", "Open conversation")}
          onPress={() => void open()}
          busy={busyKind === "open"}
          disabled={busy || callActive || !state || (!!projectId && !projects.isProjectVisible(projectId))}
        />
      ) : null}
        {recentOptions.length ? (
          <SelectField
            variant="row"
            label={copy("Son konuşmalar", "Recent conversations")}
            value={visibleThread?.id}
            disabled={busy || callActive}
            options={recentOptions}
            onChange={(id) => {
              if (!current() || pending.current || useAssistantCall.getState().phase !== "idle") return;
              const selected = threads.find((row) => row.id === id);
              if (selected && assistantThreadVisible(selected, access)) {
                selection.current++;
                setProjectId(selected.projectId ?? "");
                setThread(selected);
              }
            }}
          />
        ) : null}
    </>
  ) : null;
  const approvalAction = pendingApprovals ? <Button
    label={copy("Onaylar ({p0} bekliyor)", "Approvals ({p0} waiting)", { p0: pendingApprovals })}
    tone="primary" onPress={() => router.push("/approvals")} /> : null;
  const title = state?.profile.name || copy("Asistan", "Assistant");
  const settings = state ? <>
    <SelectField label={copy("Konuşma kapsamı", "Conversation scope")} value={projectId}
      disabled={busy || (callActive && callPhase !== "listening" && callPhase !== "muted")} options={[
        { value: "", label: globalScope },
        ...(scopeHidden ? [{ value: projectId, label: scopeName, disabled: true }] : []),
        ...Array.from(visibleProjectNames, ([value, label]) => ({ value, label })),
      ]} onChange={(value) => {
        if (value === projectId || !current() || busy || (value && !projects.isProjectVisible(value))) return;
        const sessionId = useAssistantCall.getState().sessionId;
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
        };
        if (!callActive) select();
        else confirmAction(copy("Konuşma kapsamı", "Conversation scope"),
          copy("Kapsamı değiştirmek için bu görüşmeyi bitir.", "End this call to change the conversation scope."),
          copy("Görüşmeyi bitir", "End voice call"), select);
      }} />
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
    {/* Switching conversations is navigation: the home lists them; an open conversation keeps the switch here. */}
    {!home ? recentConversations : null}
  </> : null;
  const settingsButton = settings ? (
    <CallVoiceButton details={!inCall ? preferences : undefined}>{settings}</CallVoiceButton>
  ) : null;
  const header = (
    <>
      {!voiceMode && visibleThread ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={[uiStyles.grow, { alignItems: "flex-start" }]}>
          <AssistantContextLine machineName={machineName} scope={scopeName} project={!!projectId} />
        </View>
        <AssistantCallButton target={{ machineId, environmentId, threadId: visibleThread.id }} onStart={voiceEntry.start}
          enabled={writable && configured} current={() => current() && (!visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId))} />
        {settingsButton}
      </View> : null}
      {!voiceMode && visibleThread ? <AssistantCallError /> : null}
      {state || inCall ? approvalAction : null}
      {/* The call screen shows the connection state once; its chat pane stays on the transcript. */}
      {!inCall && state ? <QueryState query={snapshot} loading="inline" /> : null}
      {inCall && !visibleThread ? <Empty compact illustration="chat-empty"
        title={copy("Gösterilebilen mesaj yok", "No messages are available to display")} /> : null}
      {home ? <AssistantHomeHero name={title} avatar={state.profile.avatar}
        machineName={machineName} scope={scopeName} project={!!projectId}
        voiceBusy={voiceEntry.pending} openBusy={busyKind === "open"}
        voiceDisabled={busy || callActive || !writable || !configured || scopeHidden} openDisabled={busy || !state || scopeHidden}
        setupNeeded={!configured} compact={!!questions.length || !!jobs.length || !!focusNotice}
        waiting={{ questions: questions.length, jobs: jobs.length }}
        onVoice={voiceEntry.start} onOpen={() => void open()} /> : null}
      {home ? <View style={{ gap: space.lg, width: "100%", maxWidth: 520, alignSelf: "center" }}>
        {presence}
        {work}
        {recentOptions.length ? <Section title={copy("Konuşmalar", "Conversations")}><NavigationGroup>{recentConversations}</NavigationGroup></Section> : null}
      </View> : null}
      {!inCall ? operationIssue : null}
      {visibleThread ? (
        <>
          <QueryState query={history} loading="inline" />
          {canonicalThread &&
          assistantSummaryVisible(canonicalThread, access) &&
          canonicalThread.summary ? (
            <Disclosure label={copy("Konuşma özeti", "Conversation summary")}>
              <Body>{canonicalThread.summary}</Body>
            </Disclosure>
          ) : null}
          {raw.length >= 100 && more[visibleThread.id] !== false ? (
            <Button
              label={copy("Önceki mesajları yükle", "Load earlier messages")}
              onPress={older}
              disabled={busy}
              busy={busyKind === "older"}
            />
          ) : null}
          {!history.isPending && !messages.length ? (
            <Empty
              compact
              illustration="chat-empty"
              title={copy("Gösterilebilen mesaj yok", "No messages are available to display")}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
  const composer = (
        visibleThread && writable ? (<>
          {configured ? null : <Notice tone="warning" message={copy("Asistan {p0} üzerinde kapalı. Bilgisayardaki bycoda’dan kurulumu bitirip açın.", "The assistant is off on {p0}. Finish its setup in bycoda on that computer.", { p0: machineName })} />}
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
  const conversation = (
    <ScreenList
      title={voiceMode ? undefined : title}
      // On the home and call stages the backdrop runs behind the whole transcript, not only its top strip.
      style={stage || voiceMode ? { backgroundColor: "transparent" } : undefined}
      header={header}
      data={messages}
      ListEmptyComponent={!inCall && !state ? (
        <>
          <QueryState query={snapshot} loading="centered"
            renderLoading={(label) => <AssistantHomeLoading label={label} />} />
          {!snapshot.isPending && assistantNeedsUpdate(snapshot.error) ? <Empty compact illustration="permission"
            title={copy("Bilgisayarındaki Bycoda'yı güncelle", "Update bycoda on your computer")}
            detail={copy("Bu bilgisayar henüz asistanı sunmuyor. Güncelledikten sonra sohbet ve sesli görüşme burada açılır.", "This computer does not offer the assistant yet. After updating, chat and voice calls appear here.")} /> : null}
        </>
      ) : undefined}
      keyExtractor={(message) => message.id}
      renderItem={({ item }) => (
        <AssistantMessageRow message={item} voiceLabel={copy("Sesle", "By voice")} />
      )}
      refresh={refreshAll}
      ListFooterComponent={<>
        {voiceMode ? <AssistantLiveSpeech target={visibleThread ? { machineId, environmentId, threadId: visibleThread.id } : undefined} /> : null}
        {!voiceMode && visibleThread ? <AssistantReadAloud target={{ machineId, environmentId, threadId: visibleThread.id }}
          text={messages.findLast(message => message.role === "assistant")?.text ?? ""}
          enabled={writable} current={() => !visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId)} /> : null}
      </>}
    />
  );
  return (
    <>
    <Stack.Screen options={{ title, headerShown: !voiceMode && !voiceRequested && !stage }} />
    <AssistantVoiceScreen active={voiceMode || voiceRequested} stage={stage} name={title} computer={machineName}
      settings={settingsButton}
      onBack={() => { if (router.canGoBack()) router.back(); else router.replace("/"); }}
      composer={composer} feedback={<>{inCall && questions.length ? questionCards : null}{approvalAction}<QueryState query={snapshot} loading="none" />{issue ? <Notice tone="warning" message={copy("İşlem tamamlanamadı. Bilgisayar bağlantısını ve erişimi kontrol edin.", "The operation could not be completed. Check this computer connection and access.")} /> : null}</>}
      scope={{ computer: machineName, project: projectId ? scopeName : undefined }}
      avatar={state?.profile.avatar} transcriptVisible={transcript.visible}
      pending={voiceEntry.pending} ready={writable && configured && !busy}
      onToggleTranscript={transcript.toggle} onStart={voiceEntry.start}
      onMinimize={() => { minimizeAssistantCompanion(); if (router.canGoBack()) router.back(); else router.replace("/"); }}
      onEnd={() => { voiceEntry.cancel(); endAssistantCall(); useAssistantCall.setState({ asleep: undefined }); useAssistantCompanion.setState({ surface: "chat" }); }}>
      {conversation}
    </AssistantVoiceScreen>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Empty,
  Disclosure,
  Notice,
  QueryState,
  Row,
  Screen,
  ScreenList,
  Section,
  SelectField,
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
import { AssistantCallButton } from "./assistant-call-controls";
import { endAssistantCall } from "./assistant-call-session";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantVoiceScreen } from "./assistant-voice-screen";
import { AssistantContextBadges, AssistantHomeHero } from "./assistant-home-hero";
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

export function AssistantScreen({ focusJobId, voiceRequested = false }: { focusJobId?: string; voiceRequested?: boolean } = {}) {
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
            detail={copy("Asistan, bağlı bilgisayarındaki oturumunla çalışır.", "The assistant works with your session on a connected computer.")}
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
  voiceRequested,
  current,
}: {
  client: AssistantMobileClient;
  machineId: string;
  environmentId: string;
  machineName: string;
  sourceKey: string;
  focusJobId?: string;
  voiceRequested: boolean;
  current(): boolean;
}) {
  const copy = useCopy(),
    active = useHostReadActive(),
    projects = useProjectList(),
    cache = useQueryClient();
  const { uiStyles } = useMobileTheme();
  const voiceMode = useAssistantCompanion(state => state.surface === "voice");
  const transcript = useAssistantTranscript();
  const callActive = useAssistantCall(state => state.phase !== "idle");
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
    ready: writable && !busy && (!projectId || projects.isProjectVisible(projectId)),
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
  const controls = (
    <>
      <Disclosure label={copy("Asistan ayarları", "Assistant settings")}>
      <AssistantActivitySection activity={state?.activity} access={access} loading={snapshot.isPending} />
      {state ? <>
        <Button label={copy("Room'u durdur", "Stop Room")} disabled={!writable || busy} busy={busyKind === "stop"}
          onPress={() => confirmAction(copy("Room'u durdur", "Stop Room"), copy("Room çalışmaları duraklatılacak. Devam etmek için masaüstünden tekrar başlatın.", "Room work will pause. Resume it from desktop when ready."), copy("Durdur", "Stop"),
            () => { void perform("stop", async () => { await client.pauseAll(); await refreshAll(); }); })} />
        <AssistantPermissions key={sourceKey} profile={state.profile} client={client}
          projects={projects.directoryReady ? projects.data ?? [] : []} enabled={writable && !busy} current={current} onChanged={refreshAll} />
      </> : null}
      </Disclosure>
      {state ? (
        <Disclosure label={copy("Durumum", "My presence")}>
          <Row>
            {(["present", "away", "dnd"] as const).map((value) => (
              <Button
                key={value}
                label={
                  value === "present"
                    ? copy("Buradayım", "Here")
                    : value === "away"
                      ? copy("Uzağım", "Away")
                      : copy("Rahatsız etmeyin", "Do not disturb")
                }
                selected={state.presence.state === value}
                busy={busyKind === `presence-${value}`}
                disabled={busy || presenceUnknown}
                onPress={() => setPresence(value)}
              />
            ))}
          </Row>
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
        </Disclosure>
      ) : null}
      {state ? (
        <AssistantJobsSection
          client={client}
          jobs={jobs}
          holds={state.jobHolds}
          current={current}
          enabled={writable}
          onChanged={refreshAll}
        />
      ) : null}
      {state ? (
        <AssistantQuestionsSection
          client={client}
          questions={questions}
          machineId={machineId}
          environmentId={environmentId}
          current={current}
          enabled={writable}
          onChanged={refreshAll}
        />
      ) : null}
      {issue && !presenceUnknown ? (
        <Notice
          tone="warning"
          message={copy(
            "İşlem tamamlanamadı. Bilgisayar bağlantısını ve erişimi kontrol edin.",
            "The operation could not be completed. Check this computer connection and access.",
          )}
        />
      ) : null}
      <Section title={copy("Konuşmalar", "Conversations")}>
        <SelectField
          label={copy("Konuşma kapsamı", "Conversation scope")}
          value={projectId}
          disabled={busy || callActive}
          options={[
            { value: "", label: copy("Genel", "Global") },
            ...(projects.directoryReady ? (projects.data ?? []) : []).map((project) => ({
              value: project.id,
              label: project.name,
            })),
          ]}
          onChange={(value) => {
            if (useAssistantCall.getState().phase !== "idle") return;
            selection.current++;
            setProjectId(value);
            setThread(null);
          }}
        />
        <Button
          label={copy("Konuşmayı aç", "Open conversation")}
          onPress={() => void open()}
          busy={busyKind === "open"}
          disabled={busy || callActive || !state || (!!projectId && !projects.isProjectVisible(projectId))}
        />
        {threads.length ? (
          <SelectField
            label={copy("Son konuşmalar", "Recent conversations")}
            value={visibleThread?.id}
            disabled={busy || callActive}
            options={threads.map((row) => ({
              value: row.id,
              label: `${row.projectId
                ? ((projects.data ?? []).find((p) => p.id === row.projectId)?.name ??
                  copy("Proje", "Project"))
                : copy("Genel", "Global")} · ${row.purpose === "job-planning" ? copy("Planlama", "Planning") : copy("Konuşma", "Conversation")}`,
            }))}
            onChange={(id) => {
              if (useAssistantCall.getState().phase !== "idle") return;
              const selected = threads.find((row) => row.id === id);
              if (selected && assistantThreadVisible(selected, access)) {
                selection.current++;
                setProjectId(selected.projectId ?? "");
                setThread(selected);
              }
            }}
          />
        ) : null}
      </Section>
    </>
  );
  const approvalAction = pendingApprovals ? <Button
    label={copy("Onaylar ({p0} bekliyor)", "Approvals ({p0} waiting)", { p0: pendingApprovals })}
    tone="primary" onPress={() => router.push("/approvals")} /> : null;
  const title = state?.profile.name || copy("Asistan", "Assistant");
  const scopeName = (projects.data ?? []).find(project => project.id === projectId)?.name || copy("Genel", "Global");
  const scopeHidden = !!projectId && !projects.isProjectVisible(projectId);
  const header = (
    <>
      {!voiceMode && visibleThread ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={[uiStyles.grow, { alignItems: "flex-start" }]}>
          <AssistantContextBadges machineName={machineName} scope={scopeName} project={!!projectId} />
        </View>
        <AssistantCallButton target={{ machineId, environmentId, threadId: visibleThread.id }} onStart={voiceEntry.start}
          enabled={writable} current={() => current() && (!visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId))} />
      </View> : null}
      {approvalAction}
      <QueryState query={snapshot} loading={state ? "inline" : "content"} />
      {!voiceMode && !visibleThread && state ? <AssistantHomeHero name={title} avatar={state.profile.avatar}
        machineName={machineName} scope={scopeName} project={!!projectId}
        voiceBusy={voiceEntry.pending} openBusy={busyKind === "open"}
        voiceDisabled={busy || callActive || !writable || scopeHidden} openDisabled={busy || !state || scopeHidden}
        onVoice={voiceEntry.start} onOpen={() => void open()} /> : null}
      <Disclosure label={copy("Konuşmalar", "Conversations")}>{controls}</Disclosure>
      {!state && !snapshot.isPending && assistantNeedsUpdate(snapshot.error) ? <Empty compact illustration="permission"
        title={copy("Bilgisayarındaki Bycoda'yı güncelle", "Update bycoda on your computer")}
        detail={copy("Bu bilgisayar henüz asistanı sunmuyor. Güncelledikten sonra sohbet ve sesli görüşme burada açılır.", "This computer does not offer the assistant yet. After updating, chat and voice calls appear here.")} /> : null}
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
          {raw.length > messages.length ? (
            <Notice
              message={copy(
                "Erişimi doğrulanamayan mesajlar gizlendi.",
                "Messages whose access could not be verified are hidden.",
              )}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
  const composer = (
        visibleThread && writable ? (
          <AssistantComposer
            key={visibleThread.id}
            client={client}
            machineId={machineId}
            environmentId={environmentId}
            threadId={visibleThread.id}
            current={() => current() && (!visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId))}
            voiceCurrent={() => !visibleThread.projectId || projects.isProjectVisible(visibleThread.projectId)}
            enabled={writable}
            onSettled={refreshAll}
          />
        ) : null
  );
  const conversation = (
    <ScreenList
      title={voiceMode ? undefined : title}
      header={header}
      data={messages}
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
    <Stack.Screen options={{ title, headerShown: !voiceMode && !voiceRequested }} />
    <AssistantVoiceScreen active={voiceMode || voiceRequested} name={title}
      composer={composer} feedback={<>{approvalAction}<QueryState query={snapshot} loading="inline" />{issue ? <Notice message={copy("İşlem tamamlanamadı. Bilgisayar bağlantısını ve erişimi kontrol edin.", "The operation could not be completed. Check this computer connection and access.")} /> : null}</>}
      scope={[machineName, scopeName].join(" · ")}
      avatar={state?.profile.avatar} transcriptVisible={transcript.visible}
      pending={voiceEntry.pending} ready={writable && !busy}
      onToggleTranscript={transcript.toggle} onStart={voiceEntry.start}
      onMinimize={() => { minimizeAssistantCompanion(); if (router.canGoBack()) router.back(); else router.replace("/"); }}
      onEnd={() => { voiceEntry.cancel(); endAssistantCall(); useAssistantCompanion.setState({ surface: "chat" }); }}>
      {conversation}
    </AssistantVoiceScreen>
    </>
  );
}

import { useMemo, useRef, useState } from "react";
import { router, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Empty,
  Notice,
  QueryState,
  Row,
  Screen,
  ScreenList,
  Section,
  SelectField,
} from "@/ui/primitives";
import { useHostClient, useHostReadActive, hostKey } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useProjectList } from "../workspace/use-project-directory";
import { remoteErrorKind } from "@/ui/error-message";
import { AssistantMobileClient, type OwnerPresence } from "./assistant-client";
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

export function AssistantScreen() {
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
      <Screen title={copy("Asistan", "Assistant")}>
        <Empty
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      </Screen>
    );
  if (!client)
    return (
      <Screen title={copy("Asistan", "Assistant")}>
        <Notice
          message={copy(
            "Asistan için bilgisayar erişimini doğrulayın.",
            "Verify access to this computer to use the assistant.",
          )}
        />
      </Screen>
    );
  return (
    <AssistantWorkspace
      key={connection.token}
      client={client}
      machineId={machine.id}
      machineName={machine.name}
      sourceKey={connection.token}
      current={() => connection.isCurrent()}
    />
  );
}

function AssistantWorkspace({
  client,
  machineId,
  machineName,
  sourceKey,
  current,
}: {
  client: AssistantMobileClient;
  machineId: string;
  machineName: string;
  sourceKey: string;
  current(): boolean;
}) {
  const copy = useCopy(),
    active = useHostReadActive(),
    projects = useProjectList(),
    cache = useQueryClient();
  const [projectId, setProjectId] = useState(""),
    [thread, setThread] = useState<AssistantThread | null>(null),
    [busyKind, setBusyKind] = useState<
      "open" | "inspect" | "older" | `presence-${OwnerPresence}` | null
    >(null),
    [issue, setIssue] = useState(false),
    [presenceUnknown, setPresenceUnknown] = useState(false);
  const busy = busyKind !== null;
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
    });
  };
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
  const header = (
    <>
      <Body muted>{machineName}</Body>
      <QueryState query={snapshot} />
      {state ? (
        <Section title={copy("Durumum", "My presence")}>
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
        </Section>
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
          disabled={busy}
          options={[
            { value: "", label: copy("Genel", "Global") },
            ...(projects.directoryReady ? (projects.data ?? []) : []).map((project) => ({
              value: project.id,
              label: project.name,
            })),
          ]}
          onChange={(value) => {
            selection.current++;
            setProjectId(value);
            setThread(null);
          }}
        />
        <Button
          label={copy("Konuşmayı aç", "Open conversation")}
          onPress={() => void open()}
          busy={busyKind === "open"}
          disabled={busy || !state || (!!projectId && !projects.isProjectVisible(projectId))}
        />
        {threads.length ? (
          <SelectField
            label={copy("Son konuşmalar", "Recent conversations")}
            value={visibleThread?.id}
            disabled={busy}
            options={threads.map((row) => ({
              value: row.id,
              label: row.projectId
                ? ((projects.data ?? []).find((p) => p.id === row.projectId)?.name ??
                  copy("Proje", "Project"))
                : copy("Genel", "Global"),
            }))}
            onChange={(id) => {
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
      {visibleThread ? (
        <>
          <QueryState query={history} />
          {canonicalThread &&
          assistantSummaryVisible(canonicalThread, access) &&
          canonicalThread.summary ? (
            <Section title={copy("Konuşma özeti", "Conversation summary")}>
              <Body>{canonicalThread.summary}</Body>
            </Section>
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
  const title = state?.profile.name || copy("Asistan", "Assistant");
  return (
    <>
    <Stack.Screen options={{ title }} />
    <ScreenList
      title={title}
      header={header}
      data={messages}
      keyExtractor={(message) => message.id}
      renderItem={({ item }) => (
        <Section
          title={`${item.role === "user" ? copy("Siz", "You") : copy("Asistan", "Assistant")} · ${item.via === "voice" ? copy("Ses", "Voice") : copy("Metin", "Text")}`}
        >
          <Body>{item.text}</Body>
        </Section>
      )}
      refresh={async () => {
        await snapshot.refetch();
        if (visibleThread) await history.refetch();
      }}
      ListFooterComponent={
        <Body muted>
          {copy(
            "Konuşma geçmişi bu bilgisayarda saklanır.",
            "Conversation history stays on this computer.",
          )}
        </Body>
      }
    />
    </>
  );
}

import { useMobileTheme } from "@/ui/theme";
import { captureApprovalCommand } from "@/domain/approval-command";
import {
  captureSessionAuthority,
  retainSessionAuthority,
  type SessionAuthority,
} from "@/domain/session-authority";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHostClient } from "../../state/host-context";
import type { Block, HostCommand, HostSession } from "../../domain/types";
import { Button, Card, Empty, ErrorNotice, Screen, SectionTitle } from "../../ui/components";
import { colors } from "../../ui/theme";
import { Input } from "../../ui/primitives";
import { QuestionCard } from "../../features/workspace/question-card";
import { commandId, Loading, ProjectScreenProps, styles, workspaceKey } from "./shared";

function TranscriptBlock({
  block,
  busy,
  onApprove,
  onExpand,
}: {
  block: Block;
  busy: boolean;
  onApprove: (requestId: number, decision: "allow" | "deny", occurrenceId?: string) => void;
  onExpand: (block: Block) => void;
}) {
  useMobileTheme();
  if (block.internal) return null;
  const [expanded, setExpanded] = useState(false);
  const long = block.role === "tool" || block.role === "reasoning";
  return (
    <Card>
      <View style={styles.stack}>
        <Text
          style={[styles.muted, { color: block.role === "user" ? colors.accent : colors.muted }]}
        >
          {block.role === "user"
            ? "Siz"
            : block.role === "assistant"
              ? "bycoda"
              : block.tool?.title || block.role}
          {block.streaming ? " · yazıyor" : ""}
          {block.draft ? " · sırada" : ""}
        </Text>
        <Text selectable style={styles.body} numberOfLines={long && !expanded ? 5 : undefined}>
          {block.text || block.tool?.detail || block.tool?.status || ""}
        </Text>
        {block.taskList?.items.map((item, i) => (
          <Text key={i} style={styles.body}>
            {item.status === "completed" ? "✓" : item.status === "in_progress" ? "●" : "○"}{" "}
            {item.text}
          </Text>
        ))}
        {long && (
          <Button
            title={expanded ? "Daralt" : "Ayrıntıları göster"}
            onPress={() => setExpanded(!expanded)}
          />
        )}
        {block.remoteContent && (
          <Button title="Tam içeriği yükle" disabled={busy} onPress={() => onExpand(block)} />
        )}
        {block.approval && !block.approval.decided && (
          <View style={styles.stack}>
            <Text style={styles.muted}>Bu işlem için onayınız gerekiyor.</Text>
            <View style={styles.row}>
              <Button
                title="İzin ver"
                disabled={busy}
                onPress={() =>
                  onApprove(block.approval!.requestId, "allow", block.approval!.occurrenceId)
                }
              />
              <Button
                title="Reddet"
                disabled={busy}
                onPress={() =>
                  onApprove(block.approval!.requestId, "deny", block.approval!.occurrenceId)
                }
              />
            </View>
          </View>
        )}
        {block.approval?.decided && (
          <Text style={styles.muted}>
            {block.approval.decided === "allow" ? "İzin verildi" : "Reddedildi"}
          </Text>
        )}
      </View>
    </Card>
  );
}

export function SessionScreen({
  machineId,
  projectId,
  sessionId,
}: ProjectScreenProps & { sessionId: string }) {
  useMobileTheme();
  const client = useHostClient(machineId);
  const cache = useQueryClient();
  const key = workspaceKey(machineId, projectId, "session", sessionId);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, Block>>({});
  const identity = `${machineId}:${projectId}:${sessionId}`;
  useEffect(() => {
    setText("");
    setNotice(null);
    setExpandedBlocks({});
  }, [identity]);
  const session = useQuery({
    queryKey: key,
    queryFn: () => client!.sessions.sync(sessionId, cache.getQueryData<HostSession>(key)),
    enabled: !!client,
    refetchInterval: 1600,
  });
  const value = session.data;
  const dispatch = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (command: HostCommand) => {
      return client!.sessions.dispatch(command);
    },
    onSuccess: () => {
      void session.refetch();
      void cache.invalidateQueries({ queryKey: workspaceKey(machineId, projectId, "sessions") });
    },
  });
  const send = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (intent: { message: string; commandId: string } & SessionAuthority) =>
      client!.sessions.send(
        sessionId,
        intent.message,
        intent.commandId,
        intent.authorityGeneration,
      ),
    onSuccess: (_receipt, { message }) => {
      setText((current) => (current === message ? "" : current));
      setNotice(null);
      void session.refetch();
    },
    onError: () => setNotice("İleti gönderilemedi. Taslağınız burada duruyor."),
  });
  const history = useMutation({
    mutationFn: async () => {
      if (!value?.history?.before) return;
      const page = await client!.sessions.page(sessionId, value.history.before, value.revision);
      if (page.sync.kind !== "snapshot") throw new Error("Geçmiş değişti. Oturumu yenileyin.");
      const snapshot = page.sync.value;
      if (snapshot.projectId !== projectId || snapshot.session.id !== sessionId)
        throw new Error("Oturum eşleşmiyor.");
      cache.setQueryData<HostSession>(key, (current) => {
        if (!current || current.revision !== snapshot.revision)
          throw new Error("Oturum değişti. Geçmişi tekrar yükleyin.");
        const ids = new Set(snapshot.session.blocks.map((block) => block.id));
        return {
          ...current,
          authorityGeneration: retainSessionAuthority(current, snapshot).authorityGeneration,
          history: { revision: page.revision, totalBlocks: page.totalBlocks, before: page.before },
          session: {
            ...current.session,
            blocks: [
              ...snapshot.session.blocks,
              ...current.session.blocks.filter((block) => !ids.has(block.id)),
            ],
          },
        };
      });
    },
  });
  const expand = useMutation({
    mutationFn: async (block: Block) => {
      const result = await client!.request<{ block: Block }>("sessions.block", {
        sessionId,
        blockId: block.id,
        revision: block.remoteContent?.revision,
      });
      return result;
    },
    onSuccess: (result) =>
      setExpandedBlocks((previous) => ({ ...previous, [result.block.id]: result.block })),
  });
  const approve = (requestId: number, decision: "allow" | "deny", occurrenceId?: string) => {
    if (!value?.runId) return;
    dispatch.mutate({
      ...captureApprovalCommand(sessionId, value.runId, { requestId, occurrenceId }, decision),
      ...captureSessionAuthority(value),
      commandId: commandId(),
    });
  };
  if (!client)
    return (
      <Screen>
        <Empty title="Bilgisayara bağlanın" />
      </Screen>
    );
  const busy = dispatch.isPending || send.isPending;
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={96}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.stack, { paddingBottom: 16 }]}
        >
          <SectionTitle
            title={value?.session.title || "Oturum"}
            detail={`${value?.session.harness ?? ""} · ${value?.session.model ?? ""} · ${value?.status === "running" ? "Çalışıyor" : "Hazır"}`}
          />
          <View style={styles.row}>
            <Button
              title="Yenile"
              busy={session.isRefetching}
              onPress={() => {
                void session.refetch();
              }}
            />
            {value?.status === "running" && value.runId && (
              <Button
                title="Durdur"
                disabled={busy}
                onPress={() =>
                  Alert.alert("Oturumu durdur", "Bilgisayarda çalışan tur durdurulacak.", [
                    { text: "Vazgeç", style: "cancel" },
                    {
                      text: "Durdur",
                      style: "destructive",
                      onPress: () =>
                        dispatch.mutate({
                          type: "cancel",
                          ...captureSessionAuthority(value),
                          commandId: commandId(),
                          sessionId,
                          runId: value.runId!,
                        }),
                    },
                  ])
                }
              />
            )}
          </View>
          {session.isPending && <Loading />}
          {session.error && (
            <ErrorNotice
              error={session.error}
              onRetry={() => {
                void session.refetch();
              }}
            />
          )}
          {dispatch.error && <ErrorNotice error={dispatch.error} />}
          {send.error && <ErrorNotice error={send.error} />}
          {expand.error && <ErrorNotice error={expand.error} />}
          {history.error && <ErrorNotice error={history.error} />}
          {value?.history?.before !== undefined && (
            <Button
              title="Önceki iletileri yükle"
              busy={history.isPending}
              onPress={() => history.mutate()}
            />
          )}
          {value?.session.blocks.map((block) => (
            <TranscriptBlock
              key={block.id}
              block={expandedBlocks[block.id] ?? block}
              busy={busy || expand.isPending}
              onApprove={approve}
              onExpand={(block) => expand.mutate(block)}
            />
          ))}
          {value?.session.pendingQuestion && value.runId && (
            <QuestionCard
              key={JSON.stringify([
                identity,
                value.runId,
                value.session.pendingQuestion.requestId,
                value.session.pendingQuestion.callId,
                value.session.pendingQuestion.questions,
              ])}
              question={value.session.pendingQuestion}
              draftScope={`${identity}:${value.runId}`}
              deliveryVersion={value.revision}
              disabled={busy}
              onAnswer={async (reply) => {
                await dispatch.mutateAsync({
                  type: "answer",
                  ...captureSessionAuthority(value),
                  commandId: commandId(),
                  sessionId,
                  runId: value.runId!,
                  requestId: value.session.pendingQuestion!.requestId,
                  reply,
                });
              }}
            />
          )}
          {value && !value.session.blocks.length && (
            <Empty
              title="İlk iletinizi yazın"
              detail="Çalışma seçtiğiniz uzak bilgisayarda yürütülür."
            />
          )}
        </ScrollView>
        <View
          style={[styles.stack, { paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }]}
        >
          {notice && (
            <Text accessibilityRole="alert" style={styles.muted}>
              {notice}
            </Text>
          )}
          {value?.status === "running" && (
            <Text style={styles.muted}>Çalışma sürüyor. Yeni iletiniz sıraya alınır.</Text>
          )}
          <Input
            label="Oturuma ileti"
            placeholder="Bilgisayarınızda ne yapalım?"
            value={text}
            onChangeText={setText}
            multiline
            style={{ maxHeight: 150, minHeight: 64 }}
          />
          <Button
            title={value?.status === "running" ? "Sıraya ekle" : "Gönder"}
            disabled={!text.trim() || !value || busy}
            busy={send.isPending}
            onPress={() => {
              if (!value) return;
              send.mutate({
                message: text,
                commandId: commandId(),
                ...captureSessionAuthority(value),
              });
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

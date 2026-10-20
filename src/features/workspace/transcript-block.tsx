import { memo, useState } from "react";
import { View } from "react-native";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Terminal from "lucide-react-native/icons/terminal";
import ListChecks from "lucide-react-native/icons/list-checks";
import { Badge, Body, Button, CodePanel, CodeText, QueryState, Row, Sheet } from "@/ui/primitives";
import { ChatAction, ChatSummary } from "@/ui/chat-controls";
import { ChatMessage } from "@/ui/chat";
import { ChatActivity, ChatPlan, ChatStreaming } from "@/ui/chat-activity";
import { MessageText } from "@/ui/message-text";
import { chatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { colors, radii, semanticColors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { workspaceStyles } from "./shared";
import { useSessionBlock } from "./session-queries";
import type { TranscriptBlockProps } from "./session-types";
import { TranscriptAttachments } from "./transcript-attachments";
import { TranscriptStructured } from "./transcript-structured";
import { TranscriptActions } from "./transcript-actions";
import { SessionArtifacts } from "./session-artifacts";
import { AgentAvatar } from "@/ui/agent-avatar";
import { activityState, canCollapseToolFailure, toolResultTexts } from "./transcript-model";
import { useMobileTheme } from "@/ui/theme";

export const TranscriptBlock = memo(function TranscriptBlock({
  block,
  author,
  scope,
  revision,
  runId,
  disabled,
  onCommand,
  activityDetail = false,
  context,
  responseText,
}: TranscriptBlockProps) {
  const copy = useCopy();
  useMobileTheme();
  const typography = chatTextStyles(useChatAppearance((state) => state.textSize));
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState(false);
  const [requested, setRequested] = useState(false);
  const detail = useSessionBlock({
    scope,
    blockId: block.id,
    revision,
    enabled:
      (requested || open || activityDetail || !!block.plan || !!block.taskList) &&
      !!block.remoteContent,
  });
  const value = detail.data ?? block;
  const conversational = value.role === "user" || value.role === "assistant";
  const state = activityState(value);
  const isError =
    state === "failed" ||
    !!value.orchestration?.error ||
    !!value.shell?.timedOut ||
    (value.shell?.exitCode !== undefined && value.shell.exitCode !== 0);
  const needsApproval = !!value.approval && !value.approval.decided;
  const warning = needsApproval || value.notice === "interrupt";
  const semantic = isError ? semanticColors.danger : warning ? semanticColors.warning : undefined;
  const foldable =
    !activityDetail && !conversational && (!semantic || canCollapseToolFailure(value)) && !value.approval && !value.interjection;
  const title =
    value.role === "reasoning"
      ? copy("Düşünce", "Reasoning")
      : value.role === "tool"
        ? copy("Araç işlemi", "Tool action")
        : value.role === "plan"
          ? copy("Plan", "Plan")
          : value.role === "system"
            ? copy("Sistem", "System")
            : value.role === "tasks"
              ? copy("Görevler", "Tasks")
              : value.role === "approval"
                ? copy("Onay gerekiyor", "Approval required")
                : value.role === "image"
                  ? copy("Ek", "Attachment")
                  : value.role === "handoff"
                    ? copy("Agent devri", "Agent handoff")
                    : value.role;
  const text = value.text || value.tool?.detail || value.tool?.output || "";
  const toolResults = toolResultTexts(value);
  const label =
    value.agentRun?.name ||
    value.tool?.title ||
    value.orchestration?.title ||
    value.shell?.command ||
    title;
  const canReport = value.role === "assistant" && !value.streaming && !!text.trim();
  const canAct =
    !value.streaming && (!!text.trim() || !!value.attachments?.length || !!value.image);
  const actionText = [
    text,
    ...toolResults,
    value.image?.name,
    ...(value.attachments ?? []).map((file) => `[${file.name}]`),
  ]
    .filter(Boolean)
    .join("\n\n");
  const done = value.taskList?.items.filter((item) => item.status === "completed").length ?? 0;
  const status = value.plan
    ? value.plan.status === "ready"
      ? copy("Hazır", "Ready")
      : value.plan.status === "building"
        ? copy("Uygulanıyor", "Building")
        : value.plan.status === "built"
          ? copy("Uygulandı", "Built")
          : copy("Hazırlanıyor", "Preparing")
    : value.taskList
      ? `${done}/${value.taskList.items.length}`
      : state === "running"
        ? copy("Çalışıyor", "Running")
        : state === "completed"
          ? copy("Tamamlandı", "Completed")
          : undefined;
  const summary = value.taskList
    ? value.taskList.items.find((item) => item.status === "in_progress")?.text ||
      value.taskList.explanation
    : text.replace(/\s+/g, " ").trim();

  const approve = (decision: "allow" | "deny") => {
    void onCommand({
      type: "approve",
      sessionId: scope.sessionId,
      runId,
      requestId: value.approval!.requestId,
      decision,
    }).catch(() => {});
  };
  const planAction =
    value.plan?.status === "ready" ? (
      <Button
        label={copy("Planı uygula", "Build this plan")}
        density="compact"
        tone="quiet"
        disabled={disabled || (!!value.remoteContent && !detail.data)}
        style={{ alignSelf: "flex-start" }}
        onPress={() => {
          void onCommand({
            type: "send",
            sessionId: scope.sessionId,
            text: value.plan?.approvedText || value.text,
            intent: "build",
            planBlockId: value.id,
          }).catch(() => {});
        }}
      />
    ) : null;

  const contents = (
    <View style={{ gap: space.sm }}>
      {(open || activityDetail || requested || value.plan || value.taskList) &&
      value.remoteContent ? (
        <QueryState query={detail} />
      ) : null}
      {(open || activityDetail || requested || value.plan || value.taskList) && detail.error ? (
        <Button
          label={copy("İçeriği yeniden yükle", "Retry loading content")}
          tone="quiet"
          onPress={() => {
            void detail.refetch();
          }}
        />
      ) : null}
      {text && value.role === "tool" && !value.agentRun ? (
        <CodePanel>
          <CodeText style={[typography.code, isError && { color: colors.danger }]}>{text}</CodeText>
        </CodePanel>
      ) : text ? (
        <MessageText
          text={text}
          context={context}
          error={isError}
          compactMedia
          role={
            value.role === "user" ? "user" : value.role === "assistant" ? "assistant" : "activity"
          }
        />
      ) : null}
      {toolResults.length ? <View style={{ gap: space.sm }}>
        <Body muted style={uiStyles.label}>{copy("Çıktı", "Output")}</Body>
        {toolResults.map((output, index) => <CodePanel key={index}>
          <CodeText style={[typography.code, isError && { color: colors.danger }]}>{output}</CodeText>
        </CodePanel>)}
      </View> : null}
      {value.tool?.outputTruncated ? <Body muted>{copy("Çıktı kısaltıldı.", "Output was truncated.")}</Body> : null}
      <TranscriptStructured block={value} context={context} />
      <TranscriptAttachments block={value} context={context} />
      {context?.sessionId && value.role === "assistant" ? (
        <SessionArtifacts
          projectId={context.projectId}
          sessionId={context.sessionId}
          messageId={value.id}
        />
      ) : null}
      {value.remoteContent && !detail.data && conversational && !requested ? (
        <Button
          label={copy("Tam mesajı aç", "Open full message")}
          density="compact"
          tone="quiet"
          style={{ alignSelf: "flex-start" }}
          onPress={() => setRequested(true)}
        />
      ) : null}
      {value.approval && !value.approval.decided ? (
        <View style={workspaceStyles.stack}>
          <Body>{copy("Bu işlem için onayın gerekiyor.", "This action needs your approval.")}</Body>
          {runId ? (
            <Row>
              <Button
                label={copy("İzin ver", "Allow")}
                tone="success"
                disabled={disabled}
                onPress={() => approve("allow")}
              />
              <Button
                label={copy("Reddet", "Deny")}
                tone="danger"
                disabled={disabled}
                onPress={() => approve("deny")}
              />
            </Row>
          ) : (
            <Body muted>
              {copy("Onay için oturumun güncel durumunu yükle.", "Refresh the session to approve.")}
            </Body>
          )}
        </View>
      ) : value.approval?.decided ? (
        <Badge
          tone={
            value.approval.decided === "allow"
              ? "success"
              : value.approval.decided === "deny"
                ? "danger"
                : "warning"
          }
          label={
            value.approval.decided === "allow"
              ? copy("İzin verildi", "Allowed")
              : value.approval.decided === "cancelled"
                ? copy("İptal edildi", "Cancelled")
                : copy("Reddedildi", "Denied")
          }
        />
      ) : null}
      {value.draft ? (
        <View style={workspaceStyles.stack}>
          <Badge label={copy("Bilgisayarda taslak", "Draft on your computer")} tone="warning" />
          {value.followUpDelivery === "uncertain" ? (
            <Body muted>
              {copy(
                "Teslim durumu belirsiz. Yeniden göndermeden önce agent’ın çalışmasını kontrol et.",
                "Delivery is uncertain. Check the agent’s work before sending again.",
              )}
            </Body>
          ) : null}
          <Row>
            <Button
              label={copy("Taslağı gönder", "Send draft")}
              disabled={
                disabled ||
                !!runId ||
                value.followUpDelivery === "pending" ||
                value.followUpDelivery === "uncertain"
              }
              onPress={() => {
                void onCommand({
                  type: "send",
                  sessionId: scope.sessionId,
                  text: value.text,
                  draftBlockId: value.id,
                }).catch(() => {});
              }}
            />
            <Button
              label={copy("Taslağı kaldır", "Remove draft")}
              disabled={disabled || value.followUpDelivery === "pending"}
              onPress={() => {
                void onCommand({
                  type: "removeDraft",
                  sessionId: scope.sessionId,
                  draftBlockId: value.id,
                }).catch(() => {});
              }}
            />
          </Row>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      {foldable && (value.plan || value.taskList) ? (
        <ChatPlan
          title={label}
          status={status}
          action={planAction}
          onOpenChange={(next) => {
            if (next) setRequested(true);
          }}
        >
          {contents}
        </ChatPlan>
      ) : foldable && (value.role === "reasoning" || value.role === "tool") ? (
        <ChatActivity
          title={label}
          detail={isError ? copy("Başarısız", "Failed") : status}
          reasoning={value.role === "reasoning"}
          onInspect={() => setOpen(true)}
          status={isError ? "error" : state === "running" ? "running" : state === "completed" ? "complete" : "pending"}
        />
      ) : foldable ? (
        <View style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ChatSummary
                label={label}
                detail={summary || copy("Ayrıntıları aç", "Open details")}
                status={status}
                color={state === "running" ? colors.live : colors.muted}
                icon={
                  value.role === "plan" || value.role === "tasks" ? (
                    <ListChecks size={16} color={colors.muted} />
                  ) : (
                    <Terminal size={16} color={colors.muted} />
                  )
                }
                onPress={() => setOpen(true)}
              />
            </View>
            {planAction}
          </View>
          <Sheet
            visible={open}
            title={label}
            size="full"
            onClose={() => setOpen(false)}
            footer={planAction}
          >
            {open ? contents : null}
          </Sheet>
        </View>
      ) : (
        <View
          style={{
            alignSelf: value.role === "user" ? "flex-end" : "stretch",
            maxWidth: value.role === "user" ? "85%" : "100%",
            width: value.role === "user" ? undefined : "100%",
            gap: space.xxs,
          }}
        >
          <ChatMessage
            role={
              value.role === "user" ? "user" : value.role === "assistant" ? "assistant" : "system"
            }
            style={{
              alignSelf: "stretch",
              backgroundColor:
                semantic?.surface ?? (value.role === "user" ? colors.userMessage : "transparent"),
              borderColor: semantic?.border ?? colors.separator,
              borderWidth: semantic ? 1 : 0,
              paddingHorizontal:
                activityDetail || (!semantic && value.role !== "user")
                  ? 0
                  : value.role === "user"
                    ? space.lg
                    : space.md,
              paddingVertical:
                activityDetail || (!semantic && value.role !== "user")
                  ? 0
                  : value.role === "user"
                    ? space.sm
                    : space.md,
              borderRadius: semantic || value.role === "user" ? radii.card : 0,
              gap: space.xs,
            }}
          >
            {value.role !== "user" ? (
              <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 32 }}>
                {value.role === "assistant" ? (
                  <AgentAvatar author={author} size={22} />
                ) : (
                  <Terminal size={15} color={semantic?.text ?? colors.muted} />
                )}
                <Body
                  numberOfLines={1}
                  style={[
                    typography.author,
                    uiStyles.grow,
                    { color: semantic?.text ?? colors.muted },
                  ]}
                >
                  {value.role === "assistant" ? author || "bycoda" : label}
                </Body>
                {value.startedAt ? (
                  <Body muted style={typography.metadata}>
                    {new Date(value.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Body>
                ) : null}
                {canAct ? (
                  <ChatAction
                    label={copy("Mesaj seçenekleri", "Message options")}
                    onPress={() => setActions(true)}
                  >
                    <Ellipsis size={16} color={colors.subtle} />
                  </ChatAction>
                ) : null}
              </Row>
            ) : null}
            {value.streaming ? <ChatStreaming label={copy("Yazıyor…", "Writing…")} /> : null}
            {isError ? <Badge label={copy("Başarısız", "Failed")} tone="danger" /> : null}
            {value.notice === "interrupt" ? (
              <Badge label={copy("Durduruldu", "Interrupted")} tone="warning" />
            ) : null}
            {activityDetail && status ? (
              <Body muted style={typography.metadata}>
                {status}
              </Body>
            ) : null}
            {contents}
            {planAction}
          </ChatMessage>
          {value.role === "user" && (value.startedAt || canAct) ? (
            <Row style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: space.xxs }}>
              {value.startedAt ? (
                <Body muted style={typography.metadata}>
                  {new Date(value.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Body>
              ) : null}
              {canAct ? (
                <ChatAction
                  label={copy("Mesaj seçenekleri", "Message options")}
                  onPress={() => setActions(true)}
                >
                  <Ellipsis size={16} color={colors.subtle} />
                </ChatAction>
              ) : null}
            </Row>
          ) : null}
        </View>
      )}
      {foldable && !value.plan && !value.taskList && (value.role === "reasoning" || value.role === "tool") ? (
        <Sheet visible={open} title={label} size="full" onClose={() => setOpen(false)}>
          {open ? <TranscriptBlock {...{ block, author, scope, revision, runId, disabled, onCommand, context }} activityDetail /> : null}
        </Sheet>
      ) : null}
      {actions ? (
        <TranscriptActions
          text={actionText}
          responseText={responseText}
          context={context}
          reportable={canReport}
          onClose={() => setActions(false)}
        />
      ) : null}
    </>
  );
});

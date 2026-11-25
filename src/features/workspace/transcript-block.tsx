import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Terminal from "lucide-react-native/icons/terminal";
import ListChecks from "lucide-react-native/icons/list-checks";
import { Badge, StatusText, Body, Button, NavigationRow, QueryState, Row, RowIcon, Sheet } from "@/ui/primitives";
import { ChatAction, ChatSummary } from "@/ui/chat-controls";
import { ChatMessage, chatUserBubbleStyle } from "@/ui/chat";
import { ChatActivity, ChatPlan, ChatStreaming } from "@/ui/chat-activity";
import { MessageText } from "@/ui/message-text";
import { MessageCode } from "@/ui/message-code";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { friendlyProviderFailure } from "@/ui/error-message";
import { useSessionBlock } from "./session-queries";
import type { TranscriptBlockProps } from "./session-types";
import { TranscriptAttachments } from "./transcript-attachments";
import { TranscriptStructured } from "./transcript-structured";
import { TranscriptActions } from "./transcript-actions";
import { MessageSelection } from "./selected-text";
import { SessionArtifacts } from "./session-artifacts";
import { AgentAvatar } from "@/ui/agent-avatar";
import {
  activityState,
  transcriptSenderName,
  canCollapseToolFailure,
  isBlockStreaming,
  readableToolName,
  toolResultTexts,
} from "./transcript-model";
import { useMobileTheme } from "@/ui/theme";
import { PlanReview } from "@/features/management/plans/plan-review";
import { SubagentCard } from "./subagent-card";
import { OrchestrationDetails } from "./orchestration-details";
import { ActivityApproval } from "./activity-inspector-approval";
import { taskKickoffObjective, userPromptDisplay, userTurn, userTurnAuthorLabel } from "./user-turn";
import { UserTurnNotice } from "./user-turn-notice";
import { toolKind, workSteps } from "./work-summary";
import { UserMessageText } from "./user-message-text";
import { formatMessageTime } from "./transcript-format";
import { useLocale } from "@/i18n";

export const TranscriptBlock = memo(function TranscriptBlock({
  block,
  author,
  scope,
  getRevision,
  runId,
  disabled,
  onCommand,
  activityDetail = false,
  context,
  responseText,
  parentProvider,
  modelName,
  continuation = false,
  onRewind,
}: TranscriptBlockProps & {
  /** The turn's model, shown beside the provider in the assistant header. */
  modelName?: string;
  continuation?: boolean;
  /** Desktop's Edit from here: rewind the conversation to this user message. */
  onRewind?: () => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const [reviewPlan, setReviewPlan] = useState(false);
  const [orchestrationOpening, setOrchestrationOpening] = useState<{ key: string }>();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState(false);
  const [requested, setRequested] = useState(false);
  const readFullContent =
    !!block.remoteContent && (requested || open || activityDetail || !!block.plan || !!block.taskList);
  const detail = useSessionBlock({
    scope,
    blockId: block.id,
    getRevision,
    digest: block.remoteContent?.digest,
    enabled: readFullContent,
  });
  const value = detail.data ?? block;
  const proposal = value.orchestration;
  const proposalKey = proposal ? JSON.stringify([
    scope.machineId, scope.sessionId, value.id, proposal.leadId, proposal.cwd, proposal.checkoutCwd,
  ]) : undefined;
  const reviewedProposal = orchestrationOpening?.key === proposalKey ? proposal : undefined;
  const closeOrchestration = () => setOrchestrationOpening((current) => current === orchestrationOpening ? undefined : current);
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
    !activityDetail &&
    !conversational &&
    !value.image &&
    !value.attachments?.length &&
    (!semantic || canCollapseToolFailure(value)) &&
    !value.approval &&
    !value.interjection;
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
  const rawText = value.questionAnswers?.length
    ? ""
    : value.role === "user"
      ? userPromptDisplay(value.text)
      : value.text || value.tool?.detail || value.tool?.output || "";
  const turn = userTurn(value);
  const promptAuthor = userTurnAuthorLabel(value.author, copy);
  const text =
    value.role === "system" && isError ? friendlyProviderFailure(rawText, copy) : rawText;
  const toolResults = toolResultTexts(value);
  // Like the desktop inspection panel: the first block is the command/input when a separate output follows it.
  const inputBlock = !!value.shell || (toolResults.length > 0 && !!(value.text || value.tool?.detail));
  const label =
    value.agentRun?.name ||
    readableToolName(value.tool?.title ?? "") ||
    value.orchestration?.title ||
    value.shell?.command ||
    title;
  const failedCommand = foldable && isError && value.role === "tool" && toolKind(value) === "run"
    ? workSteps([value], copy)[0]?.code ?? label
    : undefined;
  const canRewind = !!onRewind && !value.draft && !disabled;
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

  const planAction =
    value.plan?.status === "ready" ? (
      <Button
        label={copy("Planı incele", "Review plan")}
        density="compact"
        tone="quiet"
        disabled={disabled || (!!value.remoteContent && !detail.data)}
        style={{ alignSelf: "flex-start" }}
        onPress={() => {
          setReviewPlan(true);
        }}
      />
    ) : null;

  const contents = (
    <View style={{ gap: space.sm }}>
      <Sheet
        visible={reviewPlan}
        title={copy("Planı incele", "Review plan")}
        onClose={() => setReviewPlan(false)}
      >
        {reviewPlan ? (
          <PlanReview
            block={value}
            scope={scope}
            disabled={disabled}
            onCommand={onCommand}
            onClose={() => setReviewPlan(false)}
          />
        ) : null}
      </Sheet>
      {readFullContent ? <QueryState query={detail} loading="inline" compact /> : null}
      {text && value.role === "tool" && !value.agentRun ? (
        <MessageCode code={text} output compact error={isError} allowPreview={false} context={context} readerTitle={inputBlock ? copy("Komut", "Command") : undefined} copyLabel={inputBlock ? copy("Komutu kopyala", "Copy command") : undefined} />
      ) : text && value.role === "user" ? (
        <MessageSelection text={text} context={context} role="user" enabled={canAct}>
          <UserMessageText text={text} preview={taskKickoffObjective(text, value.author)} />
        </MessageSelection>
      ) : text ? (
        <MessageSelection text={text} context={context} role={value.role === "assistant" ? "assistant" : "activity"} enabled={canAct}>
          <MessageText
            text={text}
            context={context}
            cacheId={value.id}
            error={isError}
            compactMedia
            role={value.role === "assistant" ? "assistant" : "activity"}
          />
        </MessageSelection>
      ) : null}
      {toolResults.length ? (
        <View style={{ gap: space.sm }}>
          {toolResults.map((output, index) => (
            <MessageCode key={index} code={output} output compact error={isError} allowPreview={false} context={context} />
          ))}
        </View>
      ) : null}
      {value.tool?.outputTruncated ? (
        <Body muted>{copy("Çıktı kısaltıldı.", "Output was truncated.")}</Body>
      ) : null}
      {value.agentRun ? (
        <SubagentCard
          block={value}
          scope={scope}
          runId={runId}
          parentProvider={parentProvider}
          disabled={disabled}
          onCommand={onCommand}
          context={context}
          detailsDisabled={!!value.remoteContent && !detail.data}
        />
      ) : null}
      {proposalKey ? (
        <Button
          label={copy("Koordinasyon ayrıntıları", "Coordination details")}
          tone="quiet"
          disabled={!!value.remoteContent && !detail.data}
          onPress={() => setOrchestrationOpening({ key: proposalKey })}
        />
      ) : null}
      <Sheet
        visible={!!orchestrationOpening}
        title={reviewedProposal?.title || copy("Koordinasyon ayrıntıları", "Coordination details")}
        size="full"
        scroll={false}
        onClose={closeOrchestration}
      >
        {orchestrationOpening ? (
          <OrchestrationDetails
            key={reviewedProposal ? orchestrationOpening.key : "unavailable"}
            block={reviewedProposal ? value : { ...value, orchestration: undefined }}
            scope={scope}
            context={context}
            onClose={closeOrchestration}
          />
        ) : null}
      </Sheet>
      <TranscriptStructured block={value} context={context} compactAgent compactOrchestration />
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
      {value.approval ? (
        <ActivityApproval approval={value.approval} scope={scope} runId={runId} disabled={disabled} onCommand={onCommand} />
      ) : null}
      {value.draft ? (
        <View style={uiStyles.stack}>
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
              density="compact"
              tone="primary"
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
              density="compact"
              tone="quiet"
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

  if (turn.kind !== "message") return <UserTurnNotice turn={turn} context={context} />;
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
      ) : failedCommand ? (
        <NavigationRow
          icon={<RowIcon glyph={Terminal} tone="danger" />}
          label={copy("Komut başarısız oldu", "Command failed")}
          detail={failedCommand}
          detailLines={3}
          detailSelectable={false}
          onPress={() => setOpen(true)}
        />
      ) : foldable && (value.role === "reasoning" || value.role === "tool") ? (
        <ChatActivity
          title={label}
          detail={isError ? copy("Başarısız", "Failed") : status}
          reasoning={value.role === "reasoning"}
          onInspect={() => setOpen(true)}
          status={
            isError
              ? "error"
              : state === "running"
                ? "running"
                : state === "completed"
                  ? "complete"
                  : state === "stopped"
                    ? "stopped"
                    : "record"
          }
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
          {promptAuthor ? (
            <Body muted style={[typography.metadata, { alignSelf: "flex-end" }]}>
              {promptAuthor}
            </Body>
          ) : null}
          <ChatMessage
            role={
              value.role === "user" ? "user" : value.role === "assistant" ? "assistant" : "system"
            }
            style={{
              alignSelf: "stretch",
              ...(value.role === "user"
                ? { ...chatUserBubbleStyle(colors), alignSelf: "stretch", maxWidth: "100%" }
                : {
                    backgroundColor: semantic?.surface ?? "transparent",
                    paddingHorizontal: semantic && !activityDetail ? space.md : 0,
                    paddingVertical: semantic && !activityDetail ? space.sm : 0,
                    borderRadius: semantic ? radii.card : 0,
                  }),
              borderColor: semantic?.border ?? colors.separator,
              borderWidth: semantic ? StyleSheet.hairlineWidth * 2 : 0,
              gap: space.xs,
            }}
          >
            {value.role !== "user" && !continuation ? (
              <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 24 }}>
                {value.role === "assistant" ? (
                  <AgentAvatar author={author} size={20} />
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
                  {value.role === "assistant"
                    ? [transcriptSenderName(author), modelName].filter(Boolean).join(" · ")
                    : label}
                </Body>
                {value.startedAt ? (
                  <Body muted style={typography.metadata}>
                    {formatMessageTime(value.startedAt, locale, copy)}
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
            {isBlockStreaming(value) ? (
              <ChatStreaming label={copy("Yazıyor…", "Writing…")} state="composing" />
            ) : null}
            {value.role === "user" && value.turnOutcome === "stopped" ? (
              <StatusText label={copy("Sen durdurdun", "Stopped by you")} />
            ) : null}
            {isError ? <Badge label={copy("Başarısız", "Failed")} tone="danger" /> : null}
            {value.notice === "interrupt" ? (
              <StatusText label={copy("Durduruldu", "Interrupted")} tone="warning" />
            ) : null}
            {activityDetail && status ? (
              <Body muted style={typography.metadata}>
                {status}
              </Body>
            ) : null}
            {contents}
            {continuation && canAct ? (
              <Row style={{ justifyContent: "flex-end" }}>
                <ChatAction label={copy("Mesaj seçenekleri", "Message options")} onPress={() => setActions(true)}>
                  <Ellipsis size={16} color={colors.subtle} />
                </ChatAction>
              </Row>
            ) : null}
            {planAction}
          </ChatMessage>
          {value.role === "user" && (value.startedAt || canAct || canRewind) ? (
            <Row style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: space.xxs }}>
              {value.startedAt ? (
                <Body muted style={typography.metadata}>
                  {formatMessageTime(value.startedAt, locale, copy)}
                </Body>
              ) : null}
              {canAct || canRewind ? (
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
      {foldable &&
      !value.plan &&
      !value.taskList &&
      (value.role === "reasoning" || value.role === "tool") ? (
        <Sheet visible={open} title={label} size="full" onClose={() => setOpen(false)}>
          {open ? (
            <TranscriptBlock
              {...{
                block,
                author,
                scope,
                getRevision,
                runId,
                disabled,
                onCommand,
                context,
                parentProvider,
              }}
              activityDetail
            />
          ) : null}
        </Sheet>
      ) : null}
      {actions ? (
        <TranscriptActions
          text={actionText}
          responseText={responseText?.(block.id)}
          context={context}
          reportable={canReport}
          role={value.role === "user" ? "user" : value.role === "assistant" ? "assistant" : "activity"}
          onRewind={canRewind ? onRewind : undefined}
          onClose={() => setActions(false)}
        />
      ) : null}
    </>
  );
});

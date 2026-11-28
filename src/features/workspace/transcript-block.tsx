import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import CopyIcon from "lucide-react-native/icons/copy";
import Check from "lucide-react-native/icons/check";
import Terminal from "lucide-react-native/icons/terminal";
import ListChecks from "lucide-react-native/icons/list-checks";
import GitBranch from "lucide-react-native/icons/git-branch";
import ImageIcon from "lucide-react-native/icons/image";
import { Badge, StatusText, Body, Button, NavigationRow, QueryState, Row, RowIcon, Sheet } from "@/ui/primitives";
import { TextAction } from "@/ui/feedback";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { AgentAvatar } from "@/ui/agent-avatar";
import { isOwnerStopNotice } from "../../../../src/features/sessions/model/turnInterruption";
import { ChatAction, ChatSummary } from "@/ui/chat-controls";
import { ChatMessage, chatUserBubbleStyle } from "@/ui/chat";
import { ChatActivity, ChatPlan, ChatStreaming } from "@/ui/chat-activity";
import { MessageText } from "@/ui/message-text";
import { MessageCode } from "@/ui/message-code";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { errorMessage, friendlyProviderFailure } from "@/ui/error-message";
import { showToast } from "@/ui/toast";
import { UncertainCommand } from "./commands";
import { useSessionBlock } from "./session-queries";
import { fullContentBlock } from "./full-content-model";
import { TranscriptInlineVisual } from "./transcript-inline-visual";
import { pendingImageGeneration } from "./transcript-labels-model";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";
import { hasUserMessageAttachments, TranscriptAttachments, UserMediaColumn, UserMessageAttachments } from "./transcript-attachments";
import { TranscriptStructured } from "./transcript-structured";
import { TranscriptActions } from "./transcript-actions";
import { MessageSelection } from "./selected-text";
import { SessionArtifacts } from "./session-artifacts";
import {
  activityState,
  canCollapseToolFailure,
  isBlockStreaming,
  readableToolName,
  toolResultTexts,
  transcriptSenderName,
  userDraftState,
} from "./transcript-model";
import { SystemNoticeRow, isCompactSystemNotice } from "./system-failure-card";
import { useMobileTheme } from "@/ui/theme";
import { PlanReview } from "@/features/management/plans/plan-review";
import { TranscriptSubagents } from "./transcript-subagents";
import { OrchestrationDetails } from "./orchestration-details";
import { ActivityApproval } from "./activity-inspector-approval";
import { taskKickoffObjective, userPromptDisplay, userTurn, userTurnAuthorLabel } from "./user-turn";
import { PENDING_SWEEP_MS, PendingUserMessage, UserTurnNotice } from "./user-turn-notice";
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
  continuation = false,
  showAuthor = false,
  onRewind,
  rewindUnavailable,
  running = false,
}: TranscriptBlockProps & {
  /** The turn's model; like desktop, its identity lives in the turn receipt, not above the reply. */
  modelName?: string;
  continuation?: boolean;
  /** A crew or handoff reply names its agent in one compact line; single-agent replies stay bare. */
  showAuthor?: boolean;
  /** Desktop's Edit from here: rewind the conversation to this user message, given its whole block. */
  onRewind?: (full: Block) => void;
  /** Edit from here exists for this message but cannot run now; the row stays visible with this reason. */
  rewindUnavailable?: "update" | "running";
  /**
   * The session is running. Only draft rows receive it: a draft is sent once the turn is over. The
   * run id cannot say so, because the Host keeps the last run's id after the run settles.
   */
  running?: boolean;
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
  // Send draft, Copy and the message options act on the words; a long block first reads its whole
  // from the Host (the transcript holds a 32 KiB preview), and a failed read never falls back to it.
  const [loadingFull, setLoadingFull] = useState<"options" | "copy" | "draft">();
  const [copyRequested, setCopyRequested] = useState(false);
  // A load can outlive the row (the owner scrolled on or left the session); its action is dropped.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const withFullContent = (action: "options" | "copy" | "draft", run: (full: Block) => void) => {
    if (loadingFull) return;
    const ready = fullContentBlock(block, detail.data);
    if (ready) {
      run(ready);
      return;
    }
    setRequested(true);
    setLoadingFull(action);
    void detail.refetch().then((result) => {
      if (!mounted.current) return;
      setLoadingFull(undefined);
      const full = fullContentBlock(block, result.data);
      if (full) run(full);
      else
        showToast({
          tone: "danger",
          message: copy(
            "Mesajın tamamı yüklenemedi; kısaltılmış önizleme kullanılmadı.",
            "The full message could not be loaded, so its shortened preview was not used.",
          ),
          action: { label: copy("Yeniden dene", "Retry"), onPress: () => withFullContent(action, run) },
        });
    });
  };
  const openActions = () => withFullContent("options", () => setActions(true));
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
                    ? copy("Ajan devri", "Agent handoff")
                    // An unknown role is never shown as its raw wire id.
                    : copy("Etkinlik", "Activity");
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
  const canRewind = (!!onRewind || !!rewindUnavailable) && !value.draft && !disabled;
  const canReport = value.role === "assistant" && !value.streaming && !!text.trim();
  const canAct =
    !value.streaming && (!!text.trim() || !!value.attachments?.length || !!value.image);
  // A user message's images and files sit above its bubble; with nothing else to say it has no bubble.
  const bareUserMedia =
    hasUserMessageAttachments(value) &&
    !text.trim() &&
    !value.questionAnswers?.length &&
    !value.interjection &&
    !value.remoteContent &&
    !isError &&
    value.notice !== "interrupt";
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
      {value.inlineVisual && activityDetail ? <TranscriptInlineVisual visual={value.inlineVisual} scope={scope} /> : null}
      {text && value.role === "tool" && !value.agentRun ? (
        <MessageCode code={text} output compact error={isError} allowPreview={false} context={context} readerTitle={inputBlock ? copy("Komut", "Command") : undefined} copyLabel={inputBlock ? copy("Komutu kopyala", "Copy command") : undefined} />
      ) : text && value.role === "user" && userDraftState(value) === "pending" ? (
        <PendingUserMessage text={text} since={value.startedAt} />
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
      {/* The transcript draws runs as their own rows; a run shown here (an inspector record) uses the
          same flat row, reading its recorded state as it is. */}
      {value.agentRun ? (
        <TranscriptSubagents
          blocks={[value]}
          live
          scope={scope}
          getRevision={getRevision}
          runId={runId}
          parentProvider={parentProvider}
          disabled={disabled}
          onCommand={onCommand}
          context={context}
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
      {/* The run row above already says model and state; the structured view adds no card inside it. */}
      <TranscriptStructured block={value.agentRun ? { ...value, agentRun: undefined } : value} context={context} compactAgent compactOrchestration />
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
    </View>
  );

  // A user draft's state reads under its bubble like desktop's UserDraftFooter: an in-flight follow-up
  // says nothing (its text sweeps), a failed one offers Retry, an uncertain one asks for a check
  // instead of a blind resend, and a saved draft keeps compact Send and Remove.
  const draftState = userDraftState(value);
  // A follow-up still pending after its sweep gets its meta row back, so it can be removed.
  const pendingSettled = usePendingSettled(draftState === "pending", value.startedAt);
  const canRemovePending = draftState === "pending" && pendingSettled && !disabled;
  // A draft action has no error line of its own: a failure is a toast, a lost reply the footer's check.
  const draftFailed = (cause: unknown) => {
    if (!(cause instanceof UncertainCommand)) showToast({ tone: "danger", message: errorMessage(cause, copy) });
  };
  // The Host runs the command's text, not the stored draft, so a long draft sends its whole text.
  const sendDraft = () => withFullContent("draft", (full) => {
    void onCommand({ type: "send", sessionId: scope.sessionId, text: full.text, draftBlockId: full.id }).catch(draftFailed);
  });
  const removeDraft = () => {
    void onCommand({ type: "removeDraft", sessionId: scope.sessionId, draftBlockId: value.id }).catch(draftFailed);
  };
  const canSendDraft = !disabled && !running;
  const draftFooter =
    loadingFull === "draft" ? (
      <DraftCaption tone="neutral" label={copy("Mesajın tamamı yükleniyor…", "Loading the full message…")} actions={[]} />
    ) : draftState === "undelivered" ? (
      <DraftCaption
        tone="danger"
        label={copy("Teslim edilemedi", "Not delivered")}
        actions={[
          canSendDraft && { label: copy("Yeniden dene", "Retry"), onPress: sendDraft },
          !disabled && { label: copy("Kaldır", "Remove"), onPress: removeDraft },
        ]}
      />
    ) : draftState === "uncertain" ? (
      <DraftCaption
        tone="warning"
        label={copy(
          "Teslim edilmiş olabilir; yeniden göndermeden önce ajanın çalışmasını kontrol et",
          "May have been delivered; check the agent’s work before sending again",
        )}
        actions={[!disabled && { label: copy("Kaldır", "Remove"), onPress: removeDraft }]}
      />
    ) : draftState === "saved" ? (
      <DraftCaption
        tone="neutral"
        label={copy("Taslak", "Draft")}
        actions={[
          canSendDraft && { label: copy("Taslağı gönder", "Send draft"), onPress: sendDraft },
          !disabled && { label: copy("Taslağı kaldır", "Remove draft"), onPress: removeDraft },
        ]}
      />
    ) : null;

  if (turn.kind !== "message") return <UserTurnNotice turn={turn} context={context} />;
  // Desktop's BranchOriginRow: where a branched session was cut from, in the owner's language.
  if (!activityDetail && value.branchOrigin)
    return (
      <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 24 }}>
        <GitBranch size={15} color={colors.muted} />
        <Body muted style={[typography.metadata, uiStyles.grow]}>
          {copy("{p0} oturumundan dallandı", "Branched from {p0}", { p0: value.branchOrigin.title })}
        </Body>
      </Row>
    );
  // Desktop's GeneratedImage before its image exists: generating, failed or stopped, never an attachment row.
  const generation = activityDetail ? undefined : pendingImageGeneration(value);
  if (generation === "running") return <ChatStreaming label={copy("Görsel oluşturuluyor…", "Generating image…")} state="composing" />;
  if (generation)
    return (
      <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 24 }}>
        <ImageIcon size={15} color={generation === "failed" ? semanticColors.danger.text : colors.muted} />
        <StatusText
          label={generation === "failed" ? copy("Görsel oluşturulamadı.", "Could not generate image.") : copy("Durduruldu", "Stopped")}
          tone={generation === "failed" ? "danger" : "default"}
          dot={false}
        />
      </Row>
    );
  // MCP sign-in, provider and interruption notices are one compact line, never a "System" card.
  if (!activityDetail && (isCompactSystemNotice(value) || isOwnerStopNotice(value))) return <SystemNoticeRow block={value} />;
  return (
    <>
      {/* Like desktop, an agent-drawn visual is the result itself, never a "Tool action" row. */}
      {value.inlineVisual && !activityDetail ? (
        <TranscriptInlineVisual visual={value.inlineVisual} scope={scope} />
      ) : foldable && (value.plan || value.taskList) ? (
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
        <UserMediaColumn measure={hasUserMessageAttachments(value)}>
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
          {value.role === "user" ? <UserMessageAttachments block={value} context={context} /> : null}
          {bareUserMedia ? null : (
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
              borderWidth: semantic ? StyleSheet.hairlineWidth : 0,
              gap: space.xs,
            }}
          >
            {/* Like desktop, a reply has no header; only a crew or handoff reply names its agent. Records keep their label. */}
            {value.role === "assistant" && showAuthor ? (
              <Row style={{ flexWrap: "nowrap", gap: space.xs, minHeight: 20 }}>
                <AgentAvatar author={author} size={18} />
                <Body muted numberOfLines={1} style={[typography.metadata, uiStyles.grow]}>
                  {transcriptSenderName(author)}
                </Body>
              </Row>
            ) : null}
            {value.role !== "user" && value.role !== "assistant" && !continuation ? (
              <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 24 }}>
                <Terminal size={15} color={semantic?.text ?? colors.muted} />
                <Body
                  numberOfLines={1}
                  style={[
                    typography.author,
                    uiStyles.grow,
                    { color: semantic?.text ?? colors.muted },
                  ]}
                >
                  {label}
                </Body>
                {value.startedAt ? (
                  <Body muted style={typography.metadata}>
                    {formatMessageTime(value.startedAt, locale, copy)}
                  </Body>
                ) : null}
                {canAct ? (
                  <ChatAction
                    label={copy("Mesaj seçenekleri", "Message options")}
                    busy={loadingFull === "options"} onPress={openActions}
                  >
                    <Ellipsis size={16} color={colors.subtle} />
                  </ChatAction>
                ) : null}
              </Row>
            ) : null}
            {/* Streaming prose is its own cue; the transcript's one live row keeps the clock. */}
            {isBlockStreaming(value) && value.role !== "assistant" ? (
              <ChatStreaming label={copy("Yazıyor…", "Writing…")} state="composing" />
            ) : null}
            {isError ? <Badge label={copy("Başarısız", "Failed")} tone="danger" /> : null}
            {value.notice === "interrupt" ? (
              <StatusText label={copy("Kesildi", "Interrupted")} tone="warning" />
            ) : null}
            {activityDetail && status ? (
              <Body muted style={typography.metadata}>
                {status}
              </Body>
            ) : null}
            {contents}
            {(continuation || value.role === "assistant") && canAct ? (
              <Row style={{ justifyContent: "flex-end" }}>
                <ChatAction label={copy("Mesaj seçenekleri", "Message options")} busy={loadingFull === "options"} onPress={openActions}>
                  <Ellipsis size={16} color={colors.subtle} />
                </ChatAction>
              </Row>
            ) : null}
            {planAction}
          </ChatMessage>
          )}
          {draftFooter}
          {value.role === "user" && (draftState !== "pending" || pendingSettled) && (value.startedAt || canAct || canRewind || canRemovePending) ? (
            <Row style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: space.xxs }}>
              {value.startedAt ? (
                <Body muted style={[typography.metadata, { fontVariant: ["tabular-nums"] }]}>
                  {formatMessageTime(value.startedAt, locale, copy)}
                </Body>
              ) : null}
              {canAct && text.trim() ? (
                fullContentBlock(block, detail.data) ? (
                  <UserCopyAction text={text} armed={copyRequested} onArmed={() => setCopyRequested(false)} />
                ) : (
                  <ChatAction
                    label={copy("Mesajı kopyala", "Copy message")}
                    busy={loadingFull === "copy"}
                    onPress={() => withFullContent("copy", () => setCopyRequested(true))}
                  >
                    <CopyIcon size={15} color={colors.subtle} />
                  </ChatAction>
                )
              ) : null}
              {canAct || canRewind || canRemovePending ? (
                <ChatAction
                  label={copy("Mesaj seçenekleri", "Message options")}
                  busy={loadingFull === "options"} onPress={openActions}
                >
                  <Ellipsis size={16} color={colors.subtle} />
                </ChatAction>
              ) : null}
            </Row>
          ) : null}
        </View>
        </UserMediaColumn>
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
          onRewind={canRewind && onRewind ? () => withFullContent("options", onRewind) : undefined}
          rewindReason={
            canRewind && !onRewind && rewindUnavailable
              ? rewindUnavailable === "update"
                ? copy("Buradan düzenlemek için bilgisayarındaki bycoda'yı güncelle", "Update bycoda on your computer to edit from here")
                : copy("Ajan bitirince buradan düzenleyebilirsin", "You can edit from here once the agent finishes")
              : undefined
          }
          onRemove={canRemovePending ? removeDraft : undefined}
          onClose={() => setActions(false)}
        />
      ) : null}
    </>
  );
});

type DraftAction = { label: string; onPress: () => void };

/** One caption line under a draft bubble: its state in tone ink, then quiet text actions. */
function DraftCaption({
  tone,
  label,
  actions,
}: {
  tone: "neutral" | "warning" | "danger";
  label: string;
  actions: (DraftAction | false)[];
}) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const ink = tone === "neutral" ? colors.muted : semanticColors[tone].text;
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", columnGap: space.md, rowGap: space.xxs }}
    >
      <Body style={[uiStyles.caption, { color: ink, flexShrink: 1, textAlign: "right" }]}>{label}</Body>
      {actions.filter((action): action is DraftAction => !!action).map((action) => (
        <TextAction key={action.label} label={action.label} color={colors.accent} onPress={action.onPress} />
      ))}
    </View>
  );
}

/** True once a pending follow-up has outlasted its sweep cap (counted from `since` or first display). */
function usePendingSettled(pending: boolean, since: number | undefined) {
  const [shownAt] = useState(() => Date.now());
  const start = since ?? shownAt;
  const remainingAt = (now: number) => Math.max(0, PENDING_SWEEP_MS - (now - start));
  const [settled, setSettled] = useState(() => remainingAt(Date.now()) === 0);
  useEffect(() => {
    if (!pending) return;
    const remaining = remainingAt(Date.now());
    setSettled(remaining === 0);
    if (!remaining) return;
    const timer = setTimeout(() => setSettled(true), remaining);
    return () => clearTimeout(timer);
  }, [pending, start]);
  return pending && settled;
}

/**
 * The user bubble's meta row copy action: the exact typed text, with brief Copied feedback. The
 * clipboard feedback (and its security subscription) mounts on the first press, not per bubble.
 */
function UserCopyAction({ text, armed: requested = false, onArmed }: { text: string; armed?: boolean; onArmed?: () => void }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  // A press that first had to read the whole message arrives armed, so it copies once loaded; the
  // request is consumed, so a later remount never copies again on its own.
  const [armed, setArmed] = useState(requested);
  useEffect(() => {
    if (requested) onArmed?.();
  }, []);
  if (armed) return <ArmedUserCopyAction text={text} />;
  return (
    <ChatAction label={copy("Mesajı kopyala", "Copy message")} onPress={() => setArmed(true)}>
      <CopyIcon size={15} color={colors.subtle} />
    </ChatAction>
  );
}

function ArmedUserCopyAction({ text }: { text: string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const clipboard = useClipboardFeedback(text);
  // The press that armed this copies once; later presses go straight to the hook.
  const pressed = useRef(false);
  useEffect(() => {
    if (pressed.current) return;
    pressed.current = true;
    clipboard.copy();
  }, [clipboard.copy]);
  return (
    <ChatAction
      label={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Mesajı kopyala", "Copy message")}
      busy={clipboard.busy}
      onPress={clipboard.copy}
    >
      {clipboard.copied ? <Check size={15} color={colors.subtle} /> : <CopyIcon size={15} color={colors.subtle} />}
    </ChatAction>
  );
}

import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import { Badge, Body, Row } from "@/ui/primitives";
import { MessageCode } from "@/ui/message-code";
import { MessageText } from "@/ui/message-text";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { TranscriptToolPreview } from "./transcript-tool-preview";
import type { Block } from "./wire";
import { PlanSteps } from "@/ui/plan-steps";

export function TranscriptStructured({
  block,
  context,
  compactAgent = false,
  compactOrchestration = false,
}: {
  block: Block;
  context?: MessageContext;
  compactAgent?: boolean;
  compactOrchestration?: boolean;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const list = block.taskList;
  const done = list?.items.filter((item) => item.status === "completed").length ?? 0;
  if (
    !list &&
    !block.questionAnswers?.length &&
    !block.tool?.preview &&
    !block.plan &&
    !block.agentRun &&
    !block.shell &&
    !block.interjection &&
    !block.handoff &&
    !block.orchestration
  )
    return null;
  return (
    <View style={{ gap: space.sm }}>
      {block.questionAnswers?.map(({ prompt, answers }, index) => (
        <View key={index} style={{ minWidth: 0, gap: space.xs }}>
          <Body muted style={uiStyles.caption}>{prompt}</Body>
          <MessageText text={answers.join("\n")} context={context} compactMedia />
        </View>
      ))}
      {list ? (
        <>
          <Body muted style={uiStyles.caption}>
            {copy("{p0}/{p1} tamamlandı", "{p0}/{p1} complete", {
              p0: done,
              p1: list.items.length,
            })}
          </Body>
          {list.explanation ? (
            <MessageText text={list.explanation} context={context} compactMedia />
          ) : null}
          <PlanSteps
            steps={list.items.map((item, index) => ({
              id: item.id ?? String(index),
              title: item.text,
              status:
                item.status === "completed"
                  ? "done"
                  : item.status === "in_progress"
                    ? "active"
                    : item.status === "cancelled"
                      ? "skipped"
                      : "pending",
              metadata:
                item.status === "completed"
                  ? copy("Tamamlandı", "Completed")
                  : item.status === "in_progress"
                    ? copy("Çalışıyor", "Running")
                    : item.status === "cancelled"
                      ? copy("İptal edildi", "Cancelled")
                      : copy("Bekliyor", "Pending"),
            }))}
          />
        </>
      ) : null}
      {block.tool?.preview ? (
        <TranscriptToolPreview
          preview={block.tool.preview}
          status={block.tool.status}
          context={context}
        />
      ) : null}
      {block.plan ? (
        <>
          <Body muted style={uiStyles.caption}>
            {block.plan.status === "ready"
              ? copy("Uygulamaya hazır", "Ready to build")
              : block.plan.status === "built"
                ? copy("Uygulandı", "Built")
                : block.plan.status === "building"
                  ? copy("Uygulanıyor", "Building")
                  : copy("Hazırlanıyor", "Preparing")}
          </Body>
          {block.plan.originalText && block.plan.originalText !== block.text ? (
            <>
              <Body muted style={uiStyles.label}>
                {copy("İlk plan", "Original plan")}
              </Body>
              <MessageText text={block.plan.originalText} context={context} compactMedia />
            </>
          ) : null}
        </>
      ) : null}
      {block.agentRun ? (
        <View style={{ gap: space.sm }}>
          <Row>
            {block.agentRun.model ? (
              <Body muted style={uiStyles.caption}>
                {block.agentRun.model}
              </Body>
            ) : null}
            {block.tool?.agentContext ? (
              <Body muted style={uiStyles.caption}>
                {copy("Bağlam: %{p0}", "Context: {p0}%", {
                  p0: Math.round(block.tool.agentContext.used),
                })}
              </Body>
            ) : null}
          </Row>
          {!compactAgent && block.agentRun.prompt ? (
            <>
              <Body muted style={uiStyles.caption}>
                {copy("Görev", "Assignment")}
              </Body>
              <MessageText text={block.agentRun.prompt} context={context} compactMedia />
            </>
          ) : null}
          {compactAgent ? <Body muted>{copy("{p0} adım", "{p0} steps", { p0: block.agentRun.steps.length })}</Body> : null}
          {(compactAgent ? [] : block.agentRun.steps).map((step) => (
            <View
              key={step.id}
              style={{
                gap: space.xs,
                borderStartWidth: 1,
                borderStartColor: colors.separator,
                paddingStart: space.sm,
              }}
            >
              <Row>
                <Body style={[uiStyles.grow, uiStyles.label]}>{step.text}</Body>
                {step.status ? (
                  <Body
                    muted
                    style={[
                      uiStyles.caption,
                      ["error", "failed", "denied", "rejected"].includes(step.status) && {
                        color: colors.danger,
                      },
                    ]}
                  >
                    {step.status === "completed" ||
                    step.status === "done" ||
                    step.status === "success"
                      ? copy("Tamamlandı", "Completed")
                      : step.status === "error" || step.status === "failed"
                        ? copy("Başarısız", "Failed")
                        : step.status === "running" || step.status === "in_progress"
                          ? copy("Çalışıyor", "Running")
                          : step.status}
                  </Body>
                ) : null}
              </Row>
              {step.detail ? (
                <MessageText
                  text={step.detail}
                  context={context}
                  compactMedia
                  error={["error", "failed", "denied", "rejected"].includes(step.status ?? "")}
                />
              ) : null}
              {step.output && step.output !== step.detail ? (
                <MessageText
                  text={step.output}
                  context={context}
                  compactMedia
                  error={["error", "failed", "denied", "rejected"].includes(step.status ?? "")}
                />
              ) : null}
              {step.preview ? (
                <TranscriptToolPreview
                  preview={step.preview}
                  status={step.status}
                  context={context}
                />
              ) : null}
              {step.outputTruncated ? (
                <Body muted style={uiStyles.caption}>
                  {copy("Çıktı kısaltıldı.", "Output was truncated.")}
                </Body>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {block.shell ? (
        <>
          <Row>
            <Badge
              label={
                block.shell.running
                  ? copy("Çalışıyor", "Running")
                  : block.shell.timedOut
                    ? copy("Süre doldu", "Timed out")
                    : `exit ${block.shell.exitCode ?? "—"}`
              }
              tone={block.shell.timedOut || block.shell.exitCode ? "danger" : "default"}
            />
          </Row>
          <MessageCode code={block.shell.command} language="shell" compact
            readerTitle={copy("Komut", "Command")} copyLabel={copy("Komutu kopyala", "Copy command")}
            allowPreview={false} context={context} />
          <MessageCode
            code={block.shell.output}
            output
            compact
            complete={!block.shell.running}
            error={!!block.shell.timedOut || (block.shell.exitCode !== undefined && block.shell.exitCode !== 0)}
            allowPreview={false}
            context={context}
          />
          {block.shell.truncated ? (
            <Body muted>{copy("Çıktı kısaltıldı.", "Output was truncated.")}</Body>
          ) : null}
        </>
      ) : null}
      {block.interjection ? (
        <Badge
          label={block.interjection.severity || block.interjection.customType}
          tone={block.interjection.severity === "blocker" ? "danger" : "warning"}
        />
      ) : null}
      {block.handoff ? (
        <Row>
          <Body>
            {block.handoff.from} → {block.handoff.to}
          </Body>
          <Badge
            label={
              block.handoff.status === "ready"
                ? copy("Hazır", "Ready")
                : copy("Hazırlanıyor", "Preparing")
            }
          />
        </Row>
      ) : null}
      {block.orchestration ? (
        <View style={{ gap: space.sm }}>
          <Body style={uiStyles.label}>{block.orchestration.title}</Body>
          <Badge label={block.orchestration.status} />
          <MessageText text={block.orchestration.summary} context={context} compactMedia />
          {block.orchestration.error ? (
            <Body style={{ color: colors.danger }}>{block.orchestration.error}</Body>
          ) : null}
          {compactOrchestration ? <Body muted>{copy("{p0} görev", "{p0} tasks", { p0: block.orchestration.tasks.length })}</Body> : null}
          {(compactOrchestration ? [] : block.orchestration.tasks).map((task) => (
            <View key={task.id} style={{ gap: space.xs }}>
              <Body style={uiStyles.label}>{task.title}</Body>
              <Body muted style={uiStyles.caption}>
                {task.harness} · {task.model}
              </Body>
              <MessageText text={task.prompt} context={context} compactMedia />
              {task.files.length ? <Body mono>{task.files.join("\n")}</Body> : null}
              {task.dependsOn.length ? <Body muted>{task.dependsOn.join(", ")}</Body> : null}
            </View>
          ))}
          <Body muted>
            {copy(
              "Bu koordinasyonun eylemlerini bilgisayardan yönet.",
              "Manage this coordination's actions on your computer.",
            )}
          </Body>
        </View>
      ) : null}
    </View>
  );
}

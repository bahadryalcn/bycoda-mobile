import type { Block } from "@/domain/types";
import type { SessionScope } from "./session-types";
import { Badge, Body, Notice, Row, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { MessageText } from "@/ui/message-text";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";

/** Projection of the actual proposal. Reading never enables or dispatches its native controller. */
export function OrchestrationDetails({ block, scope, context }: { block: Block; scope: SessionScope; context?: MessageContext }) {
  const copy = useCopy();
  const proposal = block.orchestration;
  if (!proposal) return null;
  const owned = proposal.leadId === scope.sessionId;
  const titles = new Map(proposal.tasks.map((task) => [task.id, task.title]));
  return <ScreenList data={proposal.tasks} keyExtractor={(task) => task.id}
    header={<Stack>
      <Row><Body>{proposal.title}</Body><Badge label={proposal.status} /></Row>
      <Body muted>{copy("Ana oturum", "Parent session")}: {proposal.leadId}</Body>
      {!owned ? <Notice tone="warning" message={copy("Bu öneri başka bir ana oturuma ait.", "This proposal belongs to another parent session.")} /> : null}
      <Body mono>{proposal.cwd}</Body>
      {proposal.checkoutCwd && proposal.checkoutCwd !== proposal.cwd ? <Body mono>{proposal.checkoutCwd}</Body> : null}
      <Body muted>{proposal.author.harness} · {proposal.author.model}</Body>
      <Body>{copy("Eşzamanlı çalışan sınırı: {p0}", "Concurrent worker limit: {p0}", { p0: proposal.settings.maxWorkers })}</Body>
      <Body muted>{proposal.settings.choices.map((choice) => `${choice.harness} · ${choice.model}`).join("\n")}</Body>
      <Body>{copy("İstek", "Request")}</Body><MessageText text={proposal.request} context={context} compactMedia />
      <MessageText text={proposal.summary} context={context} compactMedia />
      {proposal.error ? <Notice tone="danger" message={proposal.error} /> : null}
    </Stack>}
    renderItem={({ item: task }) => <Stack>
      <Body>{task.title}</Body><Body muted>{task.harness} · {task.model}</Body>
      <MessageText text={task.prompt} context={context} compactMedia />
      {task.files.length ? <><Body>{copy("Dosya kapsamı", "File scope")}</Body><Body mono>{task.files.join("\n")}</Body></> : null}
      {task.dependsOn.length ? <><Body>{copy("Bağımlılıklar", "Dependencies")}</Body><Body>{task.dependsOn.map((id) => titles.get(id) ? `${titles.get(id)} (${id})` : id).join("\n")}</Body></> : null}
      {Object.keys(task.modelSettings ?? {}).length ? <><Body>{copy("Model ayarları", "Model settings")}</Body><Body mono>{Object.entries(task.modelSettings!).map(([key, value]) => `${key}: ${value}`).join("\n")}</Body></> : null}
    </Stack>}
    footer={<Body muted>{copy("Bu koordinasyonun eylemlerini bilgisayardan yönet.", "Manage this coordination's actions on your computer.")}</Body>} />;
}

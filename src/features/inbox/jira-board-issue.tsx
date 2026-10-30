import { useRef, useState } from "react";
import { useCopy } from "@/ui/copy";
import { useMachines } from "@/state/machines";
import { Body, Button, Notice, QueryState, SelectField, Sheet, Stack } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { ErrorText } from "../workspace/shared";
import { useInboxRead } from "./provider-queries";
import { isInboxOriginCurrent } from "./provider-model";
import { useJiraBoardDelivery } from "./jira-board-delivery";
import type { InboxJobRequest, InboxOrigin } from "./provider-protocol";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";

export function JiraBoardIssueActions({
  origin,
  snapshot: incoming,
  issue: incomingIssue,
  canWrite,
  onChanged,
  onClose,
}: {
  origin: InboxOrigin;
  snapshot: JiraBoardSnapshot;
  issue: JiraMobileIssue;
  canWrite: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const copy = useCopy(),
    [snapshot] = useState(incoming),
    [issue] = useState(incomingIssue),
    [action, setAction] = useState("transition"),
    [transitionId, setTransition] = useState(""),
    [sprintId, setSprint] = useState(""),
    [anchor, setAnchor] = useState(""),
    [direction, setDirection] = useState("before");
  const delivery = useJiraBoardDelivery(origin, snapshot.board.id, () => onChanged()),
    pending = delivery.draft.value?.pending,
    writeAllowed = useRef(canWrite);
  writeAllowed.current = canWrite;
  const current = () => isInboxOriginCurrent(origin, useMachines.getState());
  const locked =
    !canWrite ||
    delivery.busy ||
    !delivery.draft.ready ||
    !!delivery.draft.error ||
    !!pending ||
    !!delivery.result ||
    !current();
  const transitions = useInboxRead(
    {
      action: "jira-issue-transitions",
      input: {
        projectId: origin.projectId!,
        snapshotId: snapshot.snapshotId,
        key: issue.identifier,
      },
    },
    !locked && action === "transition",
  );
  let command: InboxJobRequest<"jira-board-transition" | "jira-board-move"> | undefined;
  const base = {
    projectId: origin.projectId!,
    snapshotId: snapshot.snapshotId,
    key: issue.identifier,
    confirm: "CHANGE_JIRA_BOARD" as const,
  };
  if (
    action === "transition" &&
    transitions.data?.some((item) => item.id === transitionId && !item.requiresFields) &&
    !transitions.isFetching &&
    !transitions.error
  )
    command = { action: "jira-board-transition", input: { ...base, transitionId } };
  else if (
    action !== "transition" &&
    ["board", "backlog", "sprint", "rank"].includes(action) &&
    (action !== "sprint" ||
      snapshot.configuration.sprints.some((sprint) => String(sprint.id) === sprintId)) &&
    (action !== "rank" ||
      (snapshot.configuration.rankSnapshotAvailable &&
        snapshot.page.issues.some(
          (row) => row.identifier === anchor && anchor !== issue.identifier,
        )))
  )
    command = {
      action: "jira-board-move",
      input: {
        ...base,
        target: action as "board" | "backlog" | "sprint" | "rank",
        ...(action === "sprint" ? { sprintId: Number(sprintId) } : {}),
        ...(action === "rank"
          ? direction === "before"
            ? { beforeKey: anchor }
            : { afterKey: anchor }
          : {}),
      },
    };
  const submit = () => {
    if (locked || !command || !current()) return;
    const reviewed = command;
    confirmAction(
      copy("Jira işlemini incele", "Review Jira action"),
      `${snapshot.board.name}\n${issue.identifier}: ${issue.title}\n${JSON.stringify(reviewed.input)}`,
      copy("Bilgisayarda onay iste", "Request approval on computer"),
      () => {
        if (current() && writeAllowed.current) void delivery.submit(reviewed);
      },
      copy("Vazgeç", "Cancel"),
    );
  };
  return (
    <Sheet
      visible
      size="form"
      title={issue.identifier}
      onClose={onClose}
      dismissible={!delivery.busy}
      footer={
        <Button
          label={delivery.result ? copy("Kapat", "Close") : copy("İşlemi incele", "Review action")}
          busy={delivery.busy}
          disabled={delivery.result ? false : locked || !command}
          onPress={delivery.result ? onClose : submit}
        />
      }
    >
      <Stack>
        <Body>{issue.title}</Body>
        <Body>{`${snapshot.board.name} · ${issue.state}`}</Body>
        <Body muted>
          {copy(
            "İşlem bilgisayarda tam hedefiyle yeniden onaylanır. Jira’daki eşzamanlı değişiklikler sunucu tarafında atomik olarak kilitlenemez.",
            "The exact action requires approval on the computer. Concurrent changes in Jira cannot be locked atomically by this client.",
          )}
        </Body>
        <ErrorText error={delivery.draft.error || delivery.error} />
        {pending ? (
          <>
            <Notice
              message={copy(
                "Jira işleminin sonucu doğrulanmadı. Yeni işlem göndermeden önce mevcut isteği kontrol et.",
                "The Jira action outcome is unconfirmed. Check the existing request before another action.",
              )}
            />
            <Body mono>{`${pending.command.input.key} · ${pending.command.action}`}</Body>
            <Button
              label={copy("İşlem sonucunu kontrol et", "Check action result")}
              busy={delivery.busy}
              onPress={() => {
                void delivery.reconcile();
              }}
            />
          </>
        ) : null}
        {delivery.result ? (
          <Notice
            tone={delivery.result.outcome === "submitted" ? "success" : "warning"}
            message={
              delivery.result.outcome === "submitted"
                ? copy("Jira işlemi tamamlandı.", "Jira action completed.")
                : delivery.result.reason
            }
          />
        ) : null}
        {delivery.draft.error ? (
          <Button
            label={copy("Taslağı yeniden yükle", "Retry loading draft")}
            onPress={() => {
              void delivery.draft.load();
            }}
          />
        ) : null}
        <SelectField
          label={copy("İşlem", "Action")}
          value={action}
          disabled={locked}
          onChange={(value) => {
            setAction(value);
            setTransition("");
            setSprint("");
            setAnchor("");
          }}
          options={[
            { value: "transition", label: copy("Durumu değiştir", "Change status") },
            { value: "backlog", label: copy("Backlog’a taşı", "Move to backlog") },
            ...(snapshot.board.kind === "kanban"
              ? [{ value: "board", label: copy("Panoya taşı", "Move to board") }]
              : []),
            ...(snapshot.configuration.sprints.length
              ? [{ value: "sprint", label: copy("Sprint’e taşı", "Move to sprint") }]
              : []),
            ...(snapshot.configuration.rankSnapshotAvailable
              ? [
                  {
                    value: "rank",
                    label: copy("Görünen kayda göre sırala", "Rank against displayed issue"),
                  },
                ]
              : []),
          ]}
        />
        {action === "transition" ? (
          <>
            <QueryState query={transitions} />
            <SelectField
              label={copy("Jira geçişi", "Jira transition")}
              value={transitionId}
              disabled={locked}
              onChange={setTransition}
              options={(transitions.data ?? [])
                .filter((item) => !item.requiresFields)
                .map((item) => ({ value: item.id, label: item.name }))}
            />
            {transitions.data?.some((item) => item.requiresFields) ? (
              <Notice
                message={copy(
                  "Alan gerektiren geçişleri Jira’da tamamla.",
                  "Complete transitions requiring additional fields in Jira.",
                )}
              />
            ) : null}
          </>
        ) : null}
        {action === "sprint" ? (
          <SelectField
            label={copy("Hedef sprint", "Target sprint")}
            value={sprintId}
            disabled={locked}
            onChange={setSprint}
            options={snapshot.configuration.sprints.map((item) => ({
              value: String(item.id),
              label: item.name,
            }))}
          />
        ) : null}
        {action === "rank" ? (
          <>
            <SelectField
              label={copy("Sıra yönü", "Rank direction")}
              value={direction}
              disabled={locked}
              onChange={setDirection}
              options={[
                { value: "before", label: copy("Öncesine", "Before") },
                { value: "after", label: copy("Sonrasına", "After") },
              ]}
            />
            <SelectField
              label={copy("Görünen referans kayıt", "Displayed anchor issue")}
              value={anchor}
              disabled={locked}
              onChange={setAnchor}
              searchable
              options={snapshot.page.issues
                .filter((item) => item.identifier !== issue.identifier)
                .map((item) => ({
                  value: item.identifier,
                  label: `${item.identifier} · ${item.title}`,
                }))}
            />
          </>
        ) : null}
      </Stack>
    </Sheet>
  );
}

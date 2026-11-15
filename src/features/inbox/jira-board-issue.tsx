import { useInboxLocalScope } from "./inbox-local-scope";
import { useLayoutEffect, useRef, useState } from "react";
import { useCopy } from "@/ui/copy";

import { Badge, Body, Button, Heading, Notice, QueryState, Row, SelectField, Sheet, Stack } from "@/ui/primitives";
import { ErrorText } from "../workspace/shared";
import { useInboxRead } from "./provider-queries";

import { useJiraBoardDelivery } from "./jira-board-delivery";
import { JiraBoardActionReview, type JiraBoardReview } from "./jira-board-action-review";
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
  const inboxScope = useInboxLocalScope();
  const copy = useCopy(),
    [snapshot] = useState(incoming),
    [issue] = useState(incomingIssue),
    [action, setAction] = useState("transition"),
    [transitionId, setTransition] = useState(""),
    [sprintId, setSprint] = useState(""),
    [anchor, setAnchor] = useState(""),
    [direction, setDirection] = useState("before");
  const [review, setReview] = useState<JiraBoardReview | null>(null);
  const reviewOwner = useRef(review); reviewOwner.current = review;
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reviewOwner.current = null; };
  }, []);
  const delivery = useJiraBoardDelivery(origin, snapshot.board.id, () => onChanged()),
    pending = delivery.draft.value?.pending,
    writeAllowed = useRef(canWrite);
  writeAllowed.current = canWrite;
  const current = () => inboxScope.matches(origin);
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
  const commandNow = useRef(command); commandNow.current = command;
  const lockedNow = useRef(locked); lockedNow.current = locked;
  const closeReview = () => { reviewOwner.current = null; setReview(null); };
  useLayoutEffect(() => { if (locked) closeReview(); }, [locked]);
  const editable = () => mounted.current && !lockedNow.current && !reviewOwner.current && current();
  const change = (setter: (value: string) => void) => (value: string) => { if (editable()) setter(value); };
  const submit = () => {
    if (!editable() || !command || commandNow.current !== command) return;
    let description: string;
    if (command.action === "jira-board-transition") {
      const transition = transitions.data?.find((item) => item.id === command.input.transitionId);
      description = `${copy("Durumu değiştir", "Change status")} · ${transition?.name ?? command.input.transitionId} (#${command.input.transitionId})`;
    } else if (command.input.target === "sprint") {
      const sprint = snapshot.configuration.sprints.find((item) => item.id === command.input.sprintId);
      description = `${copy("Sprint’e taşı", "Move to sprint")} · ${sprint?.name ?? command.input.sprintId} (#${command.input.sprintId})`;
    } else if (command.input.target === "rank") {
      const key = command.input.beforeKey ?? command.input.afterKey;
      const anchorIssue = snapshot.page.issues.find((item) => item.identifier === key);
      description = `${command.input.beforeKey ? copy("Öncesine", "Before") : copy("Sonrasına", "After")} · ${key} · ${anchorIssue?.title ?? key}`;
    } else {
      description = command.input.target === "backlog" ? copy("Backlog’a taşı", "Move to backlog") : copy("Panoya taşı", "Move to board");
    }
    const next = { command, description }; reviewOwner.current = next; setReview(next);
  };
  const confirmReview = () => {
    if (!mounted.current || !review || reviewOwner.current !== review || lockedNow.current || !current() || !writeAllowed.current) return;
    reviewOwner.current = null; setReview(null);
    void delivery.submit(review.command);
  };
  return (
    <>
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
          disabled={delivery.result ? false : locked || !!review || !command}
          onPress={delivery.result ? onClose : submit}
        />
      }
    >
      <Stack>
        <Heading>{issue.title}</Heading>
        <Row><Body muted>{snapshot.board.name}</Body><Badge label={issue.state} /></Row>
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
          disabled={locked || !!review}
          onChange={(value) => {
            if (!editable()) return;
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
              disabled={locked || !!review}
              onChange={change(setTransition)}
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
            disabled={locked || !!review}
            onChange={change(setSprint)}
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
              disabled={locked || !!review}
              onChange={change(setDirection)}
              options={[
                { value: "before", label: copy("Öncesine", "Before") },
                { value: "after", label: copy("Sonrasına", "After") },
              ]}
            />
            <SelectField
              label={copy("Görünen referans kayıt", "Displayed anchor issue")}
              value={anchor}
              disabled={locked || !!review}
              onChange={change(setAnchor)}
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
    {review && !locked ? <JiraBoardActionReview review={review} snapshot={snapshot} issue={issue}
      onClose={() => { if (reviewOwner.current === review) closeReview(); }} onConfirm={confirmReview} /> : null}
    </>
  );
}

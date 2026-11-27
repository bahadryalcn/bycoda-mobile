import { useInboxLocalScope } from "./inbox-local-scope";
import { useLayoutEffect, useRef, useState } from "react";
import { useCopy } from "@/ui/copy";

import { Body, Button, Disclosure, Notice, QueryState, SectionHeader, SelectField, Stack } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { ErrorText } from "../workspace/shared";
import { useInboxRead } from "./provider-queries";

import { useJiraBoardDelivery } from "./jira-board-delivery";
import type { InboxJobRequest, InboxOrigin } from "./provider-protocol";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";

/**
 * The board actions of a Jira issue opened from its board, one section of the shared record page
 * (which already shows the issue, its description and conversation): change its status, or move
 * or rank it on the board it was opened from. Like the desktop's Jira status picker, a chosen
 * action is sent without a separate review on the phone; the computer asks the owner to approve it.
 */
export function JiraBoardIssueActions({
  origin,
  snapshot: incoming,
  issue: incomingIssue,
  canWrite,
  onChanged,
}: {
  origin: InboxOrigin;
  snapshot: JiraBoardSnapshot;
  issue: JiraMobileIssue;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const inboxScope = useInboxLocalScope();
  const { uiStyles } = useMobileTheme();
  const copy = useCopy(),
    [snapshot] = useState(incoming),
    [issue] = useState(incomingIssue),
    [action, setAction] = useState("transition"),
    [transitionId, setTransition] = useState(""),
    [sprintId, setSprint] = useState(""),
    [anchor, setAnchor] = useState(""),
    [direction, setDirection] = useState("before");
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const delivery = useJiraBoardDelivery(origin, snapshot.board.id, () => onChanged()),
    pending = delivery.draft.value?.pending,
    writeAllowed = useRef(canWrite);
  writeAllowed.current = canWrite;
  const current = () => inboxScope.matches(origin);
  const readable = current();
  const locked =
    !readable ||
    !canWrite ||
    delivery.busy ||
    !delivery.draft.ready ||
    !!delivery.draft.error ||
    !!pending ||
    !!delivery.result;
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
  const editable = () => mounted.current && !lockedNow.current && current();
  const change = (setter: (value: string) => void) => (value: string) => { if (editable()) setter(value); };
  // The exact command shown is sent once; a changed choice or lost access sends nothing.
  const submit = () => {
    if (!editable() || !command || commandNow.current !== command || !writeAllowed.current) return;
    void delivery.submit(command);
  };
  if (!readable) return null;
  return (
    <Stack>
      <SectionHeader title={copy("Pano", "Board")} trailing={<Body muted style={uiStyles.caption}>{snapshot.board.name}</Body>} />
      <ErrorText error={delivery.draft.error || delivery.error} />
      {pending ? (
        <>
          <Notice
            tone="warning"
            message={copy(
              "Jira işleminin sonucu doğrulanmadı. Yeni işlem göndermeden önce mevcut isteği kontrol et.",
              "The Jira action outcome is unconfirmed. Check the existing request before another action.",
            )}
          />
          <Body>{`${pending.command.input.key} · ${pending.command.action === "jira-board-transition"
            ? copy("Durumu değiştir", "Change status") : copy("Kaydı taşı", "Move issue")}`}</Body>
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
      {action === "transition" ? (
        <>
          <QueryState query={transitions} empty={transitions.isSuccess && !transitions.data?.length}
            emptyTitle={copy("Kullanılabilir geçiş yok", "No transitions available")}
            emptyDetail={copy("Bu kayıt için Jira geçiş sunmuyor.", "Jira offers no transitions for this issue.")} loading="inline" />
          <SelectField
            label={copy("Durumu değiştir", "Change status")}
            placeholder={copy("Yeni durum seç", "Choose new status")}
            value={transitionId}
            disabled={locked}
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
      ) : (
        <Button tone="quiet" flush label={copy("Durumu değiştir", "Change status")} disabled={locked}
          onPress={() => { if (!editable()) return; setAction("transition"); setTransition(""); setSprint(""); setAnchor(""); }} />
      )}
      {/* Moves are the rare path: folded away so the common status change stays a single select. */}
      <Disclosure label={copy("Taşı veya sırala", "Move or rank")} defaultExpanded={action !== "transition"}>
        <Stack>
          <SelectField
            label={copy("İşlem", "Action")}
            placeholder={copy("İşlem seç", "Choose action")}
            value={action === "transition" ? "" : action}
            disabled={locked}
            onChange={(value) => {
              if (!editable()) return;
              setAction(value);
              setTransition("");
              setSprint("");
              setAnchor("");
            }}
            options={[
              { value: "backlog", label: copy("Backlog’a taşı", "Move to backlog") },
              ...(snapshot.board.kind === "kanban"
                ? [{ value: "board", label: copy("Panoya taşı", "Move to board") }]
                : []),
              ...(snapshot.configuration.sprints.length
                ? [{ value: "sprint", label: copy("Sprint’e taşı", "Move to sprint") }]
                : []),
              ...(snapshot.configuration.rankSnapshotAvailable
                ? [{ value: "rank", label: copy("Görünen kayda göre sırala", "Rank against displayed issue") }]
                : []),
            ]}
          />
          {action === "sprint" ? (
            <SelectField
              label={copy("Hedef sprint", "Target sprint")}
              value={sprintId}
              disabled={locked}
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
                disabled={locked}
                onChange={change(setDirection)}
                options={[
                  { value: "before", label: copy("Öncesine", "Before") },
                  { value: "after", label: copy("Sonrasına", "After") },
                ]}
              />
              <SelectField
                label={copy("Görünen referans kayıt", "Displayed anchor issue")}
                value={anchor}
                disabled={locked}
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
      </Disclosure>
      {!delivery.result ? <>
        <Button
          tone="primary"
          label={copy("Uygula", "Apply")}
          fullWidth
          busy={delivery.busy}
          disabled={locked || !command}
          onPress={submit}
        />
        <Body muted style={uiStyles.caption}>{!locked && !command
          ? action === "transition"
            ? copy("Devam etmek için yeni bir durum seç.", "Choose a new status to continue.")
            : copy("Devam etmek için işlemi tamamla.", "Complete the action to continue.")
          : copy("Değişikliği bilgisayarında onaylarsın.", "You approve the change on your computer.")}</Body>
      </> : null}
    </Stack>
  );
}

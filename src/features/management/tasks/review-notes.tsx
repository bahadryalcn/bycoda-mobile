import { useState } from "react";
import { router } from "expo-router";
import { ActionMenu, Badge, Body, Button, MutationState, Row, Stack, StatusText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useHostMutation } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { ReviewNotesProps, ReviewNoteProps } from "./types";

/**
 * Review notes as a plain labelled part of the card's details: a card's details never nest
 * disclosures, so the notes and their details are shown flat.
 */
export function ReviewNotes({ task }: ReviewNotesProps) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const [showResolved, setShowResolved] = useState(false);
  const notes = task.reviewNotes ?? [];
  if (!notes.length) return null;
  const resolved = notes.filter((note) => note.resolvedAt !== undefined);
  const visible = notes.filter((note) => showResolved || note.resolvedAt === undefined);
  const counts = { p0: notes.length - resolved.length, p1: resolved.length };
  return (
    <Stack>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Body muted style={uiStyles?.caption}>
          {copy("İnceleme notları", "Review notes")} ·{" "}
          {copy("{p0} açık · {p1} çözüldü", "{p0} open · {p1} resolved", counts)}
        </Body>
        {resolved.length ? (
          <Button
            tone="quiet"
            flush
            label={
              showResolved
                ? copy("Çözülenleri gizle", "Hide resolved")
                : copy("Çözülenleri göster", "Show resolved")
            }
            onPress={() => setShowResolved(!showResolved)}
          />
        ) : null}
      </Row>
      {visible.map((note) => (
        <ReviewNote key={note.id} task={task} note={note} />
      ))}
    </Stack>
  );
}

export function ReviewNote({ task, note }: ReviewNoteProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const resolve = useHostMutation("tasks.notes.resolve", ["tasks"]);
  // Reading a note changes the task row; refresh it so the action leaves at once.
  const read = useHostMutation("tasks.notes.read", ["tasks"]);
  const resolved = note.resolvedAt !== undefined;
  const sessionId = note.sessionId ?? note.sessionIds?.at(-1);
  const readIds = read.isSuccess ? (read.variables?.noteIds as readonly string[] | undefined) : undefined;
  const unread = note.readAt === undefined && !readIds?.includes(note.id);
  // One direct step per note; reading and the review session are secondary options.
  const secondary = [
    unread && {
      key: "read",
      label: copy("Okundu olarak işaretle", "Mark read"),
      disabled: read.isPending || resolve.isPending,
      onPress: () => read.mutate({ taskId: task.id, noteIds: [note.id] }),
    },
    !!sessionId && {
      key: "session",
      label: copy("İnceleme oturumu", "Review session"),
      onPress: () => {
        if (machine && sessionId)
          router.navigate({
            pathname: "/session/[id]",
            params: { id: sessionId, machineId: machine.id, projectId: task.projectId },
          });
      },
    },
  ];
  return (
    <Stack>
      <Row>
        {resolved
          ? <StatusText label={copy("Çözüldü", "Resolved")} />
          : <Badge label={copy("Açık", "Open")} tone="warning" />}
        <Badge
          label={
            note.kind === "suggestion" ? copy("Öneri", "Suggestion") : copy("Bulgu", "Finding")
          }
        />
      </Row>
      <Body>{note.finding}</Body>
      {note.suggestion && <Body muted>{note.suggestion}</Body>}
      {note.details && <Body muted>{note.details}</Body>}
      <Row style={{ alignItems: "center" }}>
        <Button
          tone="quiet"
          flush
          label={resolved ? copy("Yeniden aç", "Reopen") : copy("Çözüldü", "Resolved")}
          accessibilityLabel={
            resolved
              ? copy("Notu yeniden aç", "Reopen note")
              : copy("Çözüldü olarak işaretle", "Mark resolved")
          }
          busy={resolve.isPending}
          disabled={read.isPending}
          onPress={() => resolve.mutate({ taskId: task.id, noteId: note.id, resolved: !resolved })}
        />
        {secondary.some(Boolean) ? (
          <ActionMenu
            label={copy("Not işlemleri", "Note actions")}
            subtitle={note.finding}
            actions={secondary}
            reserveTouchTarget
          />
        ) : null}
      </Row>
      <MutationState mutation={resolve} />
      <MutationState mutation={read} />
    </Stack>
  );
}

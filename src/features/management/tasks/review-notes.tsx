import { useState } from "react";
import { router } from "expo-router";
import { Badge, Body, Button, Card, MutationState, Row, Section } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { ReviewNotesProps, ReviewNoteProps } from "./types";

export function ReviewNotes({ task }: ReviewNotesProps) {
  const copy = useCopy();
  const [showResolved, setShowResolved] = useState(false);
  const notes = task.reviewNotes ?? [];
  if (!notes.length) return null;
  const resolved = notes.filter((note) => note.resolvedAt !== undefined);
  const visible = notes.filter((note) => showResolved || note.resolvedAt === undefined);
  return (
    <Section title={copy("İnceleme notları", "Review notes")}>
      <Row>
        <Body muted>
          {notes.length - resolved.length} {copy("açık", "open")} · {resolved.length}{" "}
          {copy("çözüldü", "resolved")}
        </Body>
        {!!resolved.length && (
          <Button
            label={
              showResolved
                ? copy("Çözülenleri gizle", "Hide resolved")
                : copy("Çözülenleri göster", "Show resolved")
            }
            onPress={() => setShowResolved(!showResolved)}
          />
        )}
      </Row>
      {visible.map((note) => (
        <ReviewNote key={note.id} task={task} note={note} />
      ))}
    </Section>
  );
}

export function ReviewNote({ task, note }: ReviewNoteProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const resolve = useHostMutation("tasks.notes.resolve", ["tasks"]);
  const read = useHostMutation("tasks.notes.read", ["tasks"]);
  const resolved = note.resolvedAt !== undefined;
  const sessionId = note.sessionId ?? note.sessionIds?.at(-1);
  return (
    <Card>
      <Row>
        <Badge
          label={resolved ? copy("Çözüldü", "Resolved") : copy("Açık", "Open")}
          tone={resolved ? "success" : "warning"}
        />
        <Badge
          label={
            note.kind === "suggestion" ? copy("Öneri", "Suggestion") : copy("Bulgu", "Finding")
          }
        />
      </Row>
      <Body>{note.finding}</Body>
      {note.suggestion && <Body muted>{note.suggestion}</Body>}
      {note.details && <Body muted>{note.details}</Body>}
      <Row>
        <Button
          label={
            resolved
              ? copy("Yeniden aç", "Reopen")
              : copy("Çözüldü olarak işaretle", "Mark resolved")
          }
          busy={resolve.isPending}
          disabled={read.isPending}
          onPress={() => resolve.mutate({ taskId: task.id, noteId: note.id, resolved: !resolved })}
        />
        {note.readAt === undefined && (
          <Button
            label={copy("Okundu olarak işaretle", "Mark read")}
            busy={read.isPending}
            disabled={resolve.isPending}
            onPress={() => read.mutate({ taskId: task.id, noteIds: [note.id] })}
          />
        )}
        {sessionId && (
          <Button
            label={copy("İnceleme oturumu", "Review session")}
            onPress={() => {
              if (machine)
                router.push({
                  pathname: "/session/[id]",
                  params: { id: sessionId, machineId: machine.id, projectId: task.projectId },
                });
            }}
          />
        )}
      </Row>
      <MutationState mutation={resolve} />
      <MutationState mutation={read} />
    </Card>
  );
}

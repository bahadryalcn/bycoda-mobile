import { haptic } from "@/ui/motion";
import { MessageText } from "@/ui/message-text";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  Body,
  Button,
  Card,
  Field,
  FormActions,
  Heading,
  MutationState,
  QueryState,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import type { SocialThread } from "@/domain/types";
import { socialRequest as request } from "./request";
import { stamp } from "../shared/format";
import { exceedsSocialLimit, missingFactIds, socialCharacterCount } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { ThreadEditorProps, ReplyFormDraft } from "./types";

export function ThreadEditor({ thread, accounts, projects, profiles, onClose }: ThreadEditorProps) {
  const copy = useCopy();
  const query = useHostQuery<SocialThread>(["social", "thread", thread.id], "social.request", {
    action: "thread.read",
    input: { id: thread.id },
  });
  const policy = usePolicy(thread.accountId);
  const form = useFormDraft<ReplyFormDraft>({ text: "", facts: [] });
  const { text, facts } = form.values;
  const action = useHostMutation("social.request", ["social"]);
  const submission = useAsyncAction();
  const assign = useHostMutation("social.request", ["social"]);
  const current = query.data ?? thread;
  const account = accounts.find((value) => value.id === current.accountId);
  const assignable = projects.filter((project) => account?.grants[project.id]?.includes("read"));
  const profile = profiles.find((value) => value.projectId === current.projectId);
  const busy = submission.isPending || action.isPending || assign.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = () =>
    submission.run(async () => {
      const latest = await freshPolicy(policy, copy);
      const limit = exceedsSocialLimit(
        latest.effective,
        current.kind === "message" ? "message" : "comment",
        text,
      );
      if (limit)
        throw new Error(
          copy(
            "En fazla " + limit + " karakter kullanın.",
            "Use at most " + limit + " characters.",
          ),
        );
      await action.mutateAsync(
        request("replies.draft", { threadId: current.id, text, factIds: facts }),
        { onSuccess: () => { haptic.success(); onClose(); } },
      );
    });
  return (
    <Stack>
      <Heading>{account?.name}</Heading>
      <QueryState query={query} />
      {query.data?.events.map((event) => (
        <Card key={event.id}>
          <Body muted>
            {event.direction === "inbound" ? copy("Gelen", "Received") : copy("Gönderilen", "Sent")}{" "}
            · {stamp(event.at)}
          </Body>
          <MessageText text={event.text} role="assistant" />
        </Card>
      ))}
      {!current.projectId && (
        <>
          <Body>
            {copy(
              "Yanıt için konuşmayı bir projeye bağlayın.",
              "Assign the conversation to a project before replying.",
            )}
          </Body>
          <Row>
            {assignable.map((project) => (
              <Button
                key={project.id}
                label={project.name}
                disabled={busy}
                onPress={() =>
                  assign.mutate(
                    request("thread.assign", { id: current.id, projectId: project.id }),
                    { onSuccess: () => { haptic.success(); onClose(); } },
                  )
                }
              />
            ))}
          </Row>
          {!assignable.length && (
            <Body muted>
              {copy(
                "Bu hesabın okuma izni olan bir projesi yok. Hesaplar bölümünden izin verin.",
                "This account has no project with read access. Grant access in Accounts.",
              )}
            </Body>
          )}
        </>
      )}
      {current.reviewReason && <Body>{current.reviewReason}</Body>}
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("Yanıt taslağı", "Reply draft")}
        value={text}
        onChangeText={(value) => form.setField("text", value)}
        multiline
        editable={!busy}
      />
      <PolicyCounter policy={policy.data?.effective} kind={current.kind === "message" ? "message" : "comment"} text={text} />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => form.setField("facts", facts)}
        disabled={busy}
      />
      <FormActions
        feedback={<><MutationState mutation={submission} />
      <MutationState mutation={assign} /></>}
        submitLabel={copy("Taslağı kaydet", "Save draft")}
        busy={busy}
        disabled={
          !text.trim() ||
          !current.projectId ||
          !query.data ||
          !policy.data ||
          !!missingFactIds(facts, profile?.facts ?? []).length
        }
        onSubmit={save}
        cancelLabel={copy("Kapat", "Close")}
        cancelDisabled={busy}
        onCancel={requestClose}
      />
    </Stack>
  );
}

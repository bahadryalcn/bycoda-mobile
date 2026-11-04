import { haptic } from "@/ui/motion";
import { useState } from "react";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  Body,
  Card,
  Field,
  FormActions,
  Heading,
  MutationState,
  QueryState,
  Notice,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useSocialEditorAccess, useSocialEditorContext, useSocialEditorForm } from "./editor-access";
import { useAsyncAction } from "@/state/actions";

import { socialRequest as request } from "./request";

import { exceedsSocialLimit, missingFactIds } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { DraftEditorProps, ReplyFormDraft } from "./types";

export function DraftEditor({ available = true, unavailableFeedback, ...input }: DraftEditorProps) {
  const copy = useCopy();
  const access = useSocialEditorAccess(available);
  const { draft, thread, profile, onClose, recipientLabel, contextLabel } = useSocialEditorContext(input, access.blocked);
  const [expectedDraft] = useState(() => JSON.parse(JSON.stringify(draft)) as typeof draft);
  const policy = usePolicy(draft.accountId, { key: access.key, enabled: !access.blocked, assert: access.assert });
  const form = useSocialEditorForm<ReplyFormDraft>({ text: draft.text, facts: draft.factIds });
  const { text, facts } = form.values;
  const action = useHostMutation("social.request", ["social"]);
  const submission = useAsyncAction();
  const busy = submission.isPending || action.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = () => {
    if (!access.isCurrent()) return Promise.resolve();
    const submitted = form.latest.current;
    return submission.run(async () => {
      access.assert();
      const latest = await freshPolicy(policy, copy);
      access.assert();
      const limit = exceedsSocialLimit(
        latest.effective,
        draft.kind === "message" || thread?.kind === "message" ? "message" : "comment",
        submitted.text,
      );
      if (limit)
        throw new Error(
          copy(
            "En fazla " + limit + " karakter kullanın.",
            "Use at most " + limit + " characters.",
          ),
        );
      await action.mutateAsync(
        request("drafts.update", { id: draft.id, text: submitted.text, factIds: submitted.facts, expectedDraft }),
        {
          onSuccess: () => {
            if (!access.isCurrent()) return;
            haptic.success();
            form.complete(submitted, onClose);
          },
        },
      );
      access.assert();
    });
  };
  return (
    <Stack>
      <Heading>{recipientLabel ?? draft.contactId}</Heading>
      <Body muted>{contextLabel ?? [draft.accountId, draft.projectId].filter(Boolean).join(" · ")}</Body>
      {access.blocked ? !available && unavailableFeedback ? unavailableFeedback : <Notice tone="warning" message={access.message} /> : null}
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("Metin", "Text")}
        value={text}
        onChangeText={(value) => form.setField("text", value)}
        multiline
        editable={!busy && !access.blocked}
      />
      <PolicyCounter
        policy={policy.data?.effective}
        kind={draft.kind === "message" || thread?.kind === "message" ? "message" : "comment"}
        text={text}
      />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => form.setField("facts", facts)}
        disabled={busy || access.blocked}
      />
      <Body muted>
        {copy(
          "Kaydetmek önceki gönderim onayını kaldırır.",
          "Saving removes previous sending approval.",
        )}
      </Body>
      <FormActions
        feedback={
          <>
            <MutationState mutation={submission} />
          </>
        }
        submitLabel={copy("Kaydet", "Save")}
        busy={busy}
        disabled={
          access.blocked ||
          !policy.data || !text.trim() || !!missingFactIds(facts, profile?.facts ?? []).length
        }
        onSubmit={save}
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={busy}
        onCancel={requestClose}
      />
    </Stack>
  );
}

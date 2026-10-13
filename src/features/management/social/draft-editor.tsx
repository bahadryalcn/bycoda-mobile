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
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";

import { socialRequest as request } from "./request";

import { exceedsSocialLimit, missingFactIds } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { DraftEditorProps, ReplyFormDraft } from "./types";

export function DraftEditor({ draft, thread, profile, onClose }: DraftEditorProps) {
  const copy = useCopy();
  const policy = usePolicy(draft.accountId);
  const form = useFormDraft<ReplyFormDraft>({ text: draft.text, facts: draft.factIds });
  const { text, facts } = form.values;
  const action = useHostMutation("social.request", ["social"]);
  const submission = useAsyncAction();
  const busy = submission.isPending || action.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = () =>
    submission.run(async () => {
      const latest = await freshPolicy(policy, copy);
      const limit = exceedsSocialLimit(
        latest.effective,
        draft.kind === "message" || thread?.kind === "message" ? "message" : "comment",
        text,
      );
      if (limit)
        throw new Error(
          copy(
            "En fazla " + limit + " karakter kullanın.",
            "Use at most " + limit + " characters.",
          ),
        );
      await action.mutateAsync(request("drafts.update", { id: draft.id, text, factIds: facts }), {
        onSuccess: onClose,
      });
    });
  return (
    <Stack>
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("Metin", "Text")}
        value={text}
        onChangeText={(value) => form.setField("text", value)}
        multiline
        editable={!busy}
      />
      <PolicyCounter policy={policy.data?.effective} kind={draft.kind === "message" || thread?.kind === "message" ? "message" : "comment"} text={text} />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => form.setField("facts", facts)}
        disabled={busy}
      />
      <Body muted>
        {copy(
          "Kaydetmek önceki gönderim onayını kaldırır.",
          "Saving removes previous sending approval.",
        )}
      </Body>
      <MutationState mutation={submission} />
      <FormActions
        submitLabel={copy("Kaydet", "Save")}
        busy={busy}
        disabled={
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

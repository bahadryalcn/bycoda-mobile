import { useState } from "react";
import { ScheduledTimeField } from "./scheduled-time-field";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { Card, Field, FormActions, Heading, MutationState, QueryState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";

import { socialRequest as request } from "./request";

import { exceedsSocialLimit, missingFactIds } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { CampaignEditorProps, CampaignFormDraft } from "./types";

export function CampaignEditor({ account, projectId, profile, onClose }: CampaignEditorProps) {
  const copy = useCopy();
  const [timeValid, setTimeValid] = useState(true);
  const policy = usePolicy(account.id);
  const action = useHostMutation("social.request", ["social"]);
  const form = useFormDraft<CampaignFormDraft>({
    name: "",
    text: "",
    link: "",
    when: "",
    facts: [],
  });
  const { name, text, link, when, facts } = form.values;
  const submission = useAsyncAction();
  const busy = submission.isPending || action.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty || !timeValid, pending: busy, onClose });
  const save = () =>
    submission.run(async () => {
      const latest = await freshPolicy(policy, copy);
      const scheduledAt = when.trim() ? Date.parse(when) : Date.now();
      if (!Number.isFinite(scheduledAt))
        throw new Error(copy("Geçerli bir tarih ve saat seçin.", "Choose a valid date and time."));
      const content = [text.trim(), link.trim()].filter(Boolean).join("\n");
      const limit = exceedsSocialLimit(latest.effective, "content", content);
      if (limit)
        throw new Error(
          copy(
            "En fazla " + limit + " karakter kullanın.",
            "Use at most " + limit + " characters.",
          ),
        );
      await action.mutateAsync(
        request("campaigns.create", {
          name,
          projectIds: [projectId],
          variants: [
            {
              accountId: account.id,
              text,
              media: [],
              ...(link ? { link } : {}),
              scheduledAt,
              factIds: facts,
            },
          ],
        }),
        { onSuccess: onClose },
      );
    });
  return (
    <Stack>
      <Heading>{account.name}</Heading>
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("İçerik adı", "Content name")}
        value={name}
        onChangeText={(value) => form.setField("name", value)}
        editable={!busy}
      />
      <Field
        label={copy("İçerik", "Content")}
        value={text}
        onChangeText={(value) => form.setField("text", value)}
        multiline
        editable={!busy}
      />
      <Field
        label={copy("Bağlantı (isteğe bağlı)", "Link (optional)")}
        value={link}
        onChangeText={(value) => form.setField("link", value)}
        editable={!busy}
        autoCapitalize="none"
        keyboardType="url"
      />
      <ScheduledTimeField value={when} onChange={(value) => form.setField("when", value)} disabled={busy} onValidityChange={setTimeValid} />
      <PolicyCounter policy={policy.data?.effective} kind={"content"} text={[text.trim(), link.trim()].filter(Boolean).join("\n")} />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => form.setField("facts", facts)}
        disabled={busy}
      />
      <MutationState mutation={submission} />
      <FormActions
        submitLabel={copy("Taslak oluştur", "Create draft")}
        busy={busy}
        disabled={
          !timeValid ||
          !name.trim() ||
          !text.trim() ||
          !policy.data ||
          !!missingFactIds(facts, profile?.facts ?? []).length
        }
        onSubmit={save}
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={busy}
        onCancel={requestClose}
      />
    </Stack>
  );
}

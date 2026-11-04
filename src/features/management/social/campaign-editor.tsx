import { haptic } from "@/ui/motion";
import { useRef, useState } from "react";
import { ScheduledTimeField } from "./scheduled-time-field";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { Body, Card, Field, FormActions, Heading, MutationState, QueryState, Notice } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useSocialEditorAccess, useSocialEditorContext, useSocialEditorForm } from "./editor-access";
import { useAsyncAction } from "@/state/actions";

import { socialRequest as request } from "./request";

import { exceedsSocialLimit, missingFactIds } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { CampaignEditorProps, CampaignFormDraft } from "./types";

export function CampaignEditor({ available = true, unavailableFeedback, ...input }: CampaignEditorProps) {
  const copy = useCopy();
  const [timeValid, setTimeValid] = useState(true);
  const currentTimeValidity = useRef(true);
  const access = useSocialEditorAccess(available);
  const { account, projectId, profile, onClose, projectLabel } = useSocialEditorContext(input, access.blocked);
  const policy = usePolicy(account.id, { key: access.key, enabled: !access.blocked, assert: access.assert });
  const action = useHostMutation("social.request", ["social"]);
  const form = useSocialEditorForm<CampaignFormDraft>({
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
  const save = () => {
    if (!access.isCurrent() || !currentTimeValidity.current) return Promise.resolve();
    const submitted = form.latest.current;
    return submission.run(async () => {
      access.assert();
      const latest = await freshPolicy(policy, copy);
      access.assert();
      if (!currentTimeValidity.current) throw new Error(copy("Geçerli bir tarih ve saat seçin.", "Choose a valid date and time."));
      const { name, text, link, when, facts } = submitted;
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
        { onSuccess: () => { if (!access.isCurrent() || !currentTimeValidity.current) return; haptic.success(); form.complete(submitted, onClose); } },
      );
      access.assert();
    });
  };
  return (
    <Stack>
      {access.blocked ? !available && unavailableFeedback ? unavailableFeedback : <Notice tone="warning" message={access.message} /> : null}
      <Heading>{account.name}</Heading>
      <Body muted>{copy("Proje", "Project")}: {projectLabel ?? projectId}</Body>
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("İçerik adı", "Content name")}
        value={name}
        onChangeText={(value) => form.setField("name", value)}
        editable={!busy && !access.blocked}
      />
      <Field
        label={copy("İçerik", "Content")}
        value={text}
        onChangeText={(value) => form.setField("text", value)}
        multiline
        editable={!busy && !access.blocked}
      />
      <Field
        label={copy("Bağlantı (isteğe bağlı)", "Link (optional)")}
        value={link}
        onChangeText={(value) => form.setField("link", value)}
        editable={!busy && !access.blocked}
        autoCapitalize="none"
        keyboardType="url"
      />
      <ScheduledTimeField value={when} onChange={(value) => form.setField("when", value)} disabled={busy || access.blocked} onValidityChange={valid => { currentTimeValidity.current = valid; setTimeValid(valid); }} />
      <PolicyCounter policy={policy.data?.effective} kind={"content"} text={[text.trim(), link.trim()].filter(Boolean).join("\n")} />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => form.setField("facts", facts)}
        disabled={busy || access.blocked}
      />
      <FormActions
        feedback={<><MutationState mutation={submission} /></>}
        submitLabel={copy("Taslak oluştur", "Create draft")}
        busy={busy}
        disabled={
          access.blocked ||
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

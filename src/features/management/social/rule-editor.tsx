import { ErrorText } from "@/ui/primitives";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  Body,
  Card,
  SelectField,
  Field,
  FormActions,
  Heading,
  MutationState,
  QueryState,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";

import { socialRequest as request } from "./request";

import { usePolicy, freshPolicy, PolicyInfo } from "./policy";

import type { RuleEditorProps, RuleFormDraft } from "./types";

export function RuleEditor({ account, projectId, profile, onClose }: RuleEditorProps) {
  const copy = useCopy();
  const policy = usePolicy(account.id);
  const action = useHostMutation("social.request", ["social"]);
  const form = useFormDraft<RuleFormDraft>({
    name: "",
    keyword: "",
    factId: "",
    mode: "draft",
    trigger: "comment",
    dailyLimit: "10",
  });
  const { name, keyword, factId, mode, trigger, dailyLimit } = form.values;
  const validLimit = /^\d+$/.test(dailyLimit) && Number(dailyLimit) >= 1 && Number(dailyLimit) <= 100;
  const fact = profile?.facts.find((value) => value.id === factId);
  const submission = useAsyncAction();
  const busy = submission.isPending || action.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = () =>
    submission.run(async () => {
      const latest = await freshPolicy(policy, copy);
      if (!fact) throw new Error(copy("Doğrulanmış bir bilgi seçin.", "Choose a verified fact."));
      if (!validLimit) throw new Error(copy("1 ile 100 arasında bir sınır girin.", "Enter a limit from 1 to 100."));
      const limit = Number(dailyLimit);
      await action.mutateAsync(
        request("automations.create", {
          name,
          accountId: account.id,
          projectId,
          mode,
          trigger,
          topics: [fact.topic],
          dailyLimit: limit,
          stopWords: [],
          answers: [{ keyword, factId }],
          ...(latest.effective.agent ? { agent: latest.effective.agent } : {}),
        }),
        { onSuccess: onClose },
      );
    });
  return (
    <Stack>
      <Field
        label={copy("Ad", "Name")}
        value={name}
        onChangeText={(value) => form.setField("name", value)}
        editable={!busy}
      />
      <Field
        label={copy("Tetikleyici ifade", "Trigger phrase")}
        value={keyword}
        onChangeText={(value) => form.setField("keyword", value)}
        editable={!busy}
      />
      <SelectField
        label={copy("Tetikleyici", "Trigger")}
        value={trigger}
        options={[
          { value: "comment", label: copy("Yorum", "Comment") },
          { value: "message", label: copy("Mesaj", "Message") },
        ]}
        disabled={busy}
        onChange={(value) => form.setField("trigger", value)}
      />
      <SelectField
        label={copy("Yanıt biçimi", "Reply mode")}
        value={mode}
        options={[
          { value: "draft", label: copy("Taslak", "Draft") },
          { value: "approval", label: copy("Onay iste", "Ask for approval") },
          { value: "automatic", label: copy("Otomatik", "Automatic") },
        ]}
        disabled={busy}
        onChange={(value) => form.setField("mode", value)}
      />
      <SelectField
        label={copy("Doğrulanmış bilgiler", "Verified facts")}
        placeholder={copy("Doğrulanmış bilgi seçin", "Choose a verified fact")}
        value={factId}
        options={(profile?.facts ?? []).map((fact) => ({
          value: fact.id,
          label: fact.topic,
          detail: fact.text,
        }))}
        disabled={busy}
        onChange={(value) => form.setField("factId", value)}
      />
      {!profile?.facts.length && (
        <Body>
          {copy(
            "Önce masaüstünde proje profilinin doğrulanmış bilgilerini ekleyin.",
            "First add verified project facts on desktop.",
          )}
        </Body>
      )}
      <Field
        label={copy("Günlük yanıt sınırı (1–100)", "Daily reply limit (1–100)")}
        value={dailyLimit}
        onChangeText={(value) => form.setField("dailyLimit", value)}
        editable={!busy}
        keyboardType="number-pad"
      />
      {!validLimit && <ErrorText error={copy("1 ile 100 arasında bir sınır girin.", "Enter a limit from 1 to 100.")} />}
      <QueryState query={policy} loading="inline" />
      <PolicyInfo policy={policy.data?.effective} />
      <MutationState mutation={submission} />
      <FormActions
        submitLabel={copy("Duraklatılmış kural oluştur", "Create paused rule")}
        busy={busy}
        disabled={!validLimit || !name.trim() || !keyword.trim() || !fact || !policy.data}
        onSubmit={save}
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={busy}
        onCancel={requestClose}
      />
    </Stack>
  );
}

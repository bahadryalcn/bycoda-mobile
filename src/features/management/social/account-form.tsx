import { useRef } from "react";
import {
  Body,
  Card,
  SelectField,
  Field,
  FormActions,
  Heading,
  MutationState,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import { useSheetGuard } from "@/ui/sheet-guard";
import { socialRequest as request } from "./request";
import { SOCIAL_ACCOUNT_TYPES, SOCIAL_PLATFORMS, SOCIAL_PLATFORM_NAMES } from "../../../../../src/features/social/model/social";
import type { AccountDraft, AccountFormProps } from "./types";

export function AccountForm({ projectId, onClose }: AccountFormProps) {
  const copy = useCopy();
  const form = useFormDraft<AccountDraft>({ name: "", platform: "x" });
  const latest = useRef(form.values);
  const change = <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) => {
    latest.current = { ...latest.current, [key]: value };
    form.setField(key, value);
  };
  const { name: accountName, platform } = form.values;
  const action = useHostMutation("social.request", ["social"]);
  const submission = useAsyncAction();
  const busy = submission.isPending || action.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const create = () => {
    void submission.run(async () => {
      const submitted = latest.current;
      await action.mutateAsync(
        request("accounts.create", {
          name: submitted.name,
          platform: submitted.platform,
          accountType: SOCIAL_ACCOUNT_TYPES[submitted.platform][0],
          projectIds: projectId ? [projectId] : [],
        }),
      );
      // Native input may arrive before disabled fields render. Keep that newer account draft open.
      const clean = { ...submitted, name: "" };
      if (latest.current.name === submitted.name && latest.current.platform === submitted.platform) {
        latest.current = clean;
        form.reset(clean);
        onClose();
      } else {
        form.markSaved(clean);
      }
    });
  };
  return (
    <>
        <Field
          label={copy("Görünen ad", "Display name")}
          value={accountName}
          onChangeText={(name) => change("name", name)}
          editable={!busy}
        />
        <SelectField
          label={copy("Platform", "Platform")}
          value={platform}
          options={SOCIAL_PLATFORMS.map((value) => ({ value, label: SOCIAL_PLATFORM_NAMES[value] }))}
          disabled={busy}
          onChange={(value) => change("platform", value)}
        />
        <FormActions
          feedback={<MutationState
        mutation={submission}
        success={copy("Hesap kaydı oluşturuldu.", "Account record created.")}
      />}
          submitLabel={copy("Hesap kaydı oluştur", "Create account record")}
          busy={busy}
          disabled={!accountName.trim() || busy}
          onSubmit={create}
          cancelLabel={copy("Vazgeç", "Cancel")}
          cancelDisabled={busy}
          onCancel={requestClose}
        />
        <Body muted>
          {copy(
            "Bağlantı ve yayın yetkileri ayrıca onaylanır.",
            "Connection and publishing permissions are approved separately.",
          )}
        </Body>

    </>
  );
}

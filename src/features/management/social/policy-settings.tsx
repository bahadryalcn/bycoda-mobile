import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { Body, Button, ErrorText, Field, FormActions, Notice, QueryState, SelectField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { REMOTE_PROVIDERS } from "../../../../../src/features/connections/model/protocol";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_NAMES, type SocialPolicies } from "../../../../../src/features/social/model/social";
import { policyDraft, readPolicies, reviewedPolicies, SOCIAL_LIMIT_FIELDS, type PolicyScope } from "./policy-settings-model";

export function SocialPolicyEditor({ snapshot, scope, machineId, onClose, onSaved }: {
  snapshot: SocialPolicies; scope: PolicyScope; machineId: string; onClose: () => void; onSaved: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const opening = useRef(reviewedMachine(machine));
  const [draft, setDraft] = useState(() => policyDraft(scope === "global" ? snapshot.global : snapshot.platforms[scope] ?? {}));
  const initial = useRef(JSON.stringify(draft));
  const latest = useRef(draft); latest.current = draft;
  const [error, setError] = useState<unknown>();
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDraft, setSavedDraft] = useState<string>();
  const latch = useRef(false);
  const settled = useRef(false);
  const mutation = useHostMutation("social.request", ["social"]);
  const currentIdentity = () => {
    return isReviewedMachine(opening.current, useMachines.getState());
  };
  const valid = machine?.id === machineId && currentIdentity();
  const busy = mutation.isPending;
  const disabled = !valid || busy || uncertain || saved;
  const submit = () => {
    if (disabled || latch.current || JSON.stringify(draft) === initial.current) return;
    let policies: SocialPolicies;
    try { policies = reviewedPolicies(snapshot, scope, draft); } catch (cause) { setError(cause); return; }
    const submitted = JSON.stringify(draft);
    confirmAction(copy("Sosyal politikayı kaydet", "Save social policy"),
      copy("Bu bilgisayardaki karakter sınırları ve ajan seçimi değişecek. Dış gönderim izni değişmez.", "Character limits and agent selection on this computer will change. External send permission stays unchanged."),
      copy("Kaydet", "Save"), () => {
        if (latch.current || settled.current || !currentIdentity() || submitted !== JSON.stringify(latest.current)) return;
        latch.current = true;
        void mutation.mutateAsync({ action: "policy.saveReviewed", input: { policies, expectedPolicies: snapshot, confirm: "UPDATE_SOCIAL_POLICY" } })
          .then(() => { settled.current = true; setSavedDraft(submitted); setSaved(true); onSaved(); })
          .catch((cause: unknown) => { setError(cause); if ((cause as { uncertain?: boolean })?.uncertain) { settled.current = true; setUncertain(true); } })
          .finally(() => { latch.current = false; });
      });
  };
  const labels = {
    maxContentCharacters: copy("Paylaşım karakter sınırı", "Post character limit"),
    maxCommentCharacters: copy("Yorum ve yanıt karakter sınırı", "Comment and reply character limit"),
    maxMessageCharacters: copy("Mesaj karakter sınırı", "Message character limit"),
  };
  return <Sheet visible title={scope === "global" ? copy("Genel sosyal politika", "Global social policy") : SOCIAL_PLATFORM_NAMES[scope]}
    onClose={onClose} dirty={JSON.stringify(draft) !== (savedDraft ?? initial.current)} dismissible={!busy}>
    <Body>{machine?.id === machineId ? machine.name : ""}</Body>
    <Notice message={copy("Boş alanlar üst politikadan devralınır; platform değerleri genel değerlerin önüne geçer.", "Blank fields inherit; platform values override global values.")} />
    <SelectField label={copy("Ajan", "Agent")} value={draft.provider} disabled={disabled}
      options={[{ value: "", label: copy("Devral", "Inherit") }, ...REMOTE_PROVIDERS.map((value) => ({ value, label: value }))]}
      onChange={(provider) => setDraft((value) => ({ ...value, provider, model: provider ? value.model : "" }))} />
    <Field label={copy("Model", "Model")} value={draft.model} editable={!disabled && !!draft.provider}
      onChangeText={(model) => setDraft((value) => ({ ...value, model }))} />
    {SOCIAL_LIMIT_FIELDS.map((key) => <Field key={key} label={labels[key]} value={draft.limits[key]} editable={!disabled}
      keyboardType="number-pad" onChangeText={(text) => setDraft((value) => ({ ...value, limits: { ...value.limits, [key]: text } }))} />)}
    {!valid ? <Notice tone="warning" message={copy("Seçili bilgisayar değişti. Ayarları yeniden açın.", "The selected computer changed. Reopen the settings.")} /> : null}
    {uncertain ? <Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden güncel politikayı kontrol edin.", "The save outcome is unknown. Check the current policy before sending again.")} /> : null}
    {saved ? <Notice message={copy("Politika kaydedildi.", "Policy saved.")} /> : null}
    <ErrorText error={error} />
    <FormActions submitLabel={copy("Sosyal politikayı kaydet", "Save social policy")} disabled={disabled || JSON.stringify(draft) === initial.current} busy={busy} onSubmit={submit} />
  </Sheet>;
}

export function SocialPolicySettings() {
  const copy = useCopy(); const machine = useActiveMachine();
  const supported = !!machine?.capabilities?.includes("social.policy.reviewed.v1");
  const query = useHostQuery<SocialPolicies>(["social", "policies"], "social.request", { action: "policy.get", input: {} }, {
    enabled: supported, queryFn: async (client, signal) => readPolicies(await client.request("social.request", { action: "policy.get", input: {} }, { signal })),
  });
  const [scope, setScope] = useState<PolicyScope>("global");
  const [review, setReview] = useState<{ snapshot: SocialPolicies; scope: PolicyScope; machineId: string }>();
  if (!supported) return null;
  return <>
    <QueryState query={query} />
    <SelectField label={copy("Politika kapsamı", "Policy scope")} value={scope} onChange={setScope}
      options={[{ value: "global", label: copy("Genel", "Global") }, ...SOCIAL_PLATFORMS.map((value) => ({ value, label: SOCIAL_PLATFORM_NAMES[value] }))]} />
    <Button tone="secondary" label={copy("Düzenle", "Edit")} disabled={!query.data || query.isError || query.isFetching}
      onPress={() => { if (query.data && machine) setReview({ snapshot: query.data, scope, machineId: machine.id }); }} />
    {review ? <SocialPolicyEditor {...review} onClose={() => setReview(undefined)} onSaved={() => { void query.refetch(); }} /> : null}
  </>;
}

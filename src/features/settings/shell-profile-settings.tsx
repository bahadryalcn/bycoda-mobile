import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { Body, ErrorText, FormActions, MutationState, NavigationRow, Notice, QueryState, SelectField, Sheet, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { readShellChoices, shellChoiceRequest, type ShellChoices } from "./shell-profile-model";

export function ShellPreference({ snapshot, machineId, machineName, onClose, onSaved }: { snapshot: ShellChoices; machineId: string; machineName: string; onClose: () => void; onSaved: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const openingMachine = useRef(reviewedMachine(machine));
  const [selected, setSelected] = useState(snapshot.chosenId ?? "");
  const [uncertain, setUncertain] = useState(false); const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(); const latch = useRef(false);
  const mutation = useHostMutation("shell.setProfileReviewed", ["command-shell"]);
  const validMachine = machine?.id === machineId && isReviewedMachine(openingMachine.current, useMachines.getState());
  const changed = selected !== (snapshot.chosenId ?? "");
  const submit = async () => {
    if (latch.current || !validMachine || uncertain || saved || !changed) return;
    const request = shellChoiceRequest(snapshot, selected); latch.current = true;
    try {
      if (!isReviewedMachine(openingMachine.current, useMachines.getState())) return;
      readShellChoices(await mutation.mutateAsync(request));
      setSaved(true); onSaved();
    } catch (cause) { setError(cause); if ((cause as { uncertain?: boolean })?.uncertain) setUncertain(true); }
    finally { latch.current = false; }
  };
  return <Sheet visible size="compact" title={copy("Komut kabuğu", "Command shell")} onClose={onClose} dirty={changed && !saved} dismissible={!mutation.isPending && !uncertain}>
    <Body>{machineName}</Body>
    <Notice message={copy("Bu bilgisayardaki yeni !komut isteklerinin kabuğunu değiştirir. Açık terminaller ve çalışan komutlar etkilenmez.", "Changes the shell for new !command requests on this computer. Open terminals and running commands are unaffected.")} />
    <SelectField label={copy("Komut kabuğu", "Command shell")} value={selected} disabled={!validMachine || mutation.isPending || uncertain || saved}
      options={[{ value: "", label: copy("Sistem varsayılanı", "System default") }, ...snapshot.profiles.map((profile) => ({ value: profile.id, label: profile.name }))]} onChange={setSelected} />
    {snapshot.chosenId && !snapshot.profiles.some((profile) => profile.id === snapshot.chosenId) ? <Notice tone="warning" message={copy("Kaydedilen kabuk artık kurulu değil; sistem varsayılanı kullanılır.", "The saved shell is no longer installed; the system default is used.")} /> : null}
    {!validMachine ? <Notice tone="warning" message={copy("Seçili bilgisayar değişti. Ayarları yeniden açın.", "The selected computer changed. Reopen the settings.")} /> : null}
    {uncertain ? <Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki tercihi kontrol edin.", "The save outcome is unknown. Check the preference on the computer before sending again.")} /> : null}
    <ErrorText error={error} />
    <FormActions submitLabel={copy("Komut kabuğunu kaydet", "Save command shell")} busy={mutation.isPending} disabled={!validMachine || !changed || uncertain || saved} onSubmit={() => { void submit(); }}
      feedback={<MutationState mutation={mutation} success={saved ? copy("Komut kabuğu kaydedildi.", "Command shell saved.") : undefined} />} />
  </Sheet>;
}

export function ShellProfileSettings() {
  const copy = useCopy(); const machine = useActiveMachine();
  const supported = !!machine?.capabilities?.includes("shell.profile.compare.v1");
  const query = useHostQuery<ShellChoices>(["command-shell"], "shell.profiles", {}, { enabled: supported,
    queryFn: async (client, signal) => readShellChoices(await client.request("shell.profiles", {}, { signal })) });
  const [review, setReview] = useState<{ snapshot: ShellChoices; machineId: string; machineName: string }>();
  if (!supported) return null;
  return <Stack><QueryState query={query} />
    <NavigationRow label={copy("Komut kabuğu", "Command shell")} detail={query.data?.profiles.find((profile) => profile.id === query.data?.chosenId)?.name ?? copy("Sistem varsayılanı", "System default")} disabled={!query.data || query.isError || query.isFetching} onPress={() => { if (query.data && machine) setReview({ snapshot: query.data, machineId: machine.id, machineName: machine.name }); }} />
    {review ? <ShellPreference key={review.machineId} {...review} onClose={() => setReview(undefined)} onSaved={() => { void query.refetch(); }} /> : null}
  </Stack>;
}

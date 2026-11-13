import { useLayoutEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { Body, Disclosure, ErrorNotice, ErrorText, FormActions, MutationState, NavigationRow, Notice, QueryState, SelectField, Sheet, Stack, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { readShellChoices, shellChoiceRequest, type ShellChoices } from "./shell-profile-model";

export function ShellPreference({ snapshot, machineId, machineName, target, onClose, onSaved }: { snapshot: ShellChoices; machineId: string; machineName: string; target?: ReviewedMachine; onClose: (refresh?: boolean) => void; onSaved: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ target: target ?? reviewedMachine(machine), machineId, machineName,
    snapshot: { ...snapshot, profiles: snapshot.profiles.map(profile => ({ ...profile })) } }));
  const mounted = useRef(true), retired = useRef(false);
  const latest = useRef(machineId); latest.current = machineId;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => {
    if (latest.current !== opening.machineId || opening.target?.id !== opening.machineId || !isReviewedMachine(opening.target, useMachines.getState())) retired.current = true;
    return mounted.current && !retired.current;
  };
  const [selected, setSelected] = useState(opening.snapshot.chosenId ?? "");
  const [uncertain, setUncertain] = useState(false); const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(); const latch = useRef(false);
  const mutation = useHostMutation("shell.setProfileReviewed", ["command-shell"]);
  const validMachine = current();
  const supported = !!machine?.capabilities?.includes("shell.profile.compare.v1");
  const changed = selected !== (opening.snapshot.chosenId ?? "");
  const submit = async () => {
    if (latch.current || !current() || !supported || uncertain || saved || !changed) return;
    let received = false;
    latch.current = true; setError(undefined);
    try {
      const request = shellChoiceRequest(opening.snapshot, selected);
      if (!current() || !useMachines.getState().machines.find(value => value.id === opening.machineId)?.capabilities?.includes("shell.profile.compare.v1")) return;
      const reply = await mutation.mutateAsync(request); received = true;
      if (!current()) return;
      const result = readShellChoices(reply);
      if (result.chosenId !== request.profile) throw new Error("The host did not confirm the selected command shell.");
      setSaved(true); onSaved();
    } catch (cause) { if (current()) { setError(cause); if (received || (cause as { uncertain?: boolean })?.uncertain) setUncertain(true); } }
    finally { latch.current = false; }
  };
  return <Sheet visible size="compact" title={copy("Komut kabuğu", "Command shell")} onClose={() => onClose(uncertain || !!error)} dirty={changed && !saved} dismissible={!mutation.isPending}>
    <Body>{opening.machineName}</Body>
    <SelectField label={copy("Komut kabuğu", "Command shell")} hint={copy("Bu bilgisayardaki yeni !komut isteklerinin kabuğunu değiştirir. Açık terminaller ve çalışan komutlar etkilenmez.", "Changes the shell for new !command requests on this computer. Open terminals and running commands are unaffected.")} value={selected} disabled={!validMachine || !supported || mutation.isPending || uncertain || saved}
      options={[{ value: "", label: copy("Sistem varsayılanı", "System default") }, ...opening.snapshot.profiles.map((profile) => ({ value: profile.id, label: profile.name })),
        ...(opening.snapshot.chosenId && !opening.snapshot.profiles.some(profile => profile.id === opening.snapshot.chosenId) ? [{ value: opening.snapshot.chosenId, label: copy("Kullanılamıyor", "Unavailable"), disabled: true }] : [])]} onChange={setSelected} />
    {opening.snapshot.chosenId && !opening.snapshot.profiles.some((profile) => profile.id === opening.snapshot.chosenId) ? <Notice tone="warning" message={copy("Kaydedilen kabuk artık kurulu değil; sistem varsayılanı kullanılır.", "The saved shell is no longer installed; the system default is used.")} /> : null}
    {!validMachine ? <Notice tone="warning" message={copy("Seçili bilgisayar değişti. Ayarları yeniden açın.", "The selected computer changed. Reopen the settings.")} /> : null}
    {validMachine && !supported ? <StateView compact illustration="error" title={copy("Komut kabuğu değiştirilemiyor", "Command shell unavailable")} description={copy("Komut kabuğunu değiştirmek için bu bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to change the command shell.")} /> : null}
    {uncertain ? <Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki tercihi kontrol edin.", "The save outcome is unknown. Check the preference on the computer before sending again.")} /> : null}
    <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono>{opening.machineId}</Body>{opening.snapshot.profiles.map(profile => <Body mono key={profile.id}>{profile.name} · {profile.path}</Body>)}{uncertain ? <ErrorText error={error} /> : null}</Disclosure>
    <FormActions submitLabel={copy("Komut kabuğunu kaydet", "Save command shell")} busy={mutation.isPending} dirty={changed && !saved} disabled={!validMachine || !supported || !changed || uncertain || saved} onSubmit={() => { void submit(); }}
      feedback={validMachine && !uncertain ? <><ErrorNotice error={error === mutation.error ? undefined : error} /><MutationState mutation={mutation} success={saved ? copy("Komut kabuğu kaydedildi.", "Command shell saved.") : undefined} /></> : null} />
  </Sheet>;
}

export function ShellProfileSettings({ target, enabled = true }: { target?: ReviewedMachine; enabled?: boolean } = {}) {
  const copy = useCopy(); const machine = useActiveMachine();
  const supported = enabled && (!target || isReviewedMachine(target, useMachines.getState())) && !!machine?.capabilities?.includes("shell.profile.compare.v1");
  const query = useHostQuery<ShellChoices>(["command-shell"], "shell.profiles", {}, { enabled: supported,
    queryFn: async (client, signal) => readShellChoices(await client.request("shell.profiles", {}, { signal })) });
  const [review, setReview] = useState<{ snapshot: ShellChoices; machineId: string; machineName: string; target: ReviewedMachine | undefined }>();
  return <Stack>{supported ? <><QueryState query={query} />
    <NavigationRow label={copy("Komut kabuğu", "Command shell")} detailLines={0}
      detail={query.data ? query.data.profiles.find((profile) => profile.id === query.data?.chosenId)?.name ?? copy("Sistem varsayılanı", "System default") : undefined}
      disabled={!query.data || query.isError || query.isFetching} onPress={() => { if (query.data && machine && !query.isError && !query.isFetching) setReview({ snapshot: query.data, machineId: machine.id, machineName: machine.name, target: reviewedMachine(machine) }); }} /></> : null}
    {review ? <ShellPreference key={review.machineId} {...review} onClose={(refresh) => { setReview(latest => latest === review ? undefined : latest); if (refresh && isReviewedMachine(review.target, useMachines.getState())) void query.refetch(); }} onSaved={() => { if (isReviewedMachine(review.target, useMachines.getState())) void query.refetch(); }} /> : null}
  </Stack>;
}

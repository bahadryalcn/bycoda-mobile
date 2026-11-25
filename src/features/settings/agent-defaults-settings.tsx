import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Button, Disclosure, FormActions, Notice, QueryState, SegmentedControl, SelectField, Stack, ToggleField } from "@/ui/primitives";
import { useLocale } from "@/i18n";
import { useSheetGuard } from "@/ui/sheet-guard";
import { AUTO_ARCHIVE_CAPABILITY, confirmAgentDefaults, inactiveDays, readAgentDefaults, withoutArchive, type AgentDefaultsRecord } from "./settings-draft";
import { LimitPresets } from "@/ui/limit-presets";
import { failureText, holdsUnconfirmedSave } from "./work-caps-settings";

const CAPABILITY = "host.settings.behavior.v1";
const INACTIVE_DAY_PRESETS = ["0", "7", "14", "30", "60", "90", "180", "365"] as const;
export function AgentDefaultsSettings({ current, enabled }: { current(): boolean; enabled: boolean }) {
  const copy = useCopy(), machine = useActiveMachine();
  const supported = enabled && machine?.capabilities?.includes(CAPABILITY) === true;
  const currentSupported = () => current() && useMachines.getState().machines.find(value => value.id === machine?.id)?.capabilities?.includes(CAPABILITY) === true;
  const archive = machine?.capabilities?.includes(AUTO_ARCHIVE_CAPABILITY) === true;
  const currentArchive = () => useMachines.getState().machines.find(value => value.id === machine?.id)?.capabilities?.includes(AUTO_ARCHIVE_CAPABILITY) === true;
  const query = useHostQuery<AgentDefaultsRecord>(["agentDefaults"], "host.settings.get", {}, {
    enabled: supported,
    queryFn: async (client, signal) => {
      if (!currentSupported()) throw new Error("Computer connection changed.");
      const result = readAgentDefaults(await client.request("host.settings.get", {}, { signal }));
      if (!currentSupported()) throw new Error("Computer connection changed.");
      return result;
    },
  });
  return <Disclosure label={copy("Ajan varsayılanları", "Agent defaults")}>
    {!supported ? <Notice message={copy("Ajan varsayılanlarını düzenlemek için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to edit agent defaults.")} /> : <>
      <QueryState query={query} />
      {query.data && current() ? <AgentDefaultsEditor initial={query.data} current={currentSupported} archive={archive} currentArchive={currentArchive} onReload={async () => {
        const result = await query.refetch();
        if (!result.data || result.isError) throw result.error;
        return result.data;
      }} /> : null}
    </>}
  </Disclosure>;
}
function AgentDefaultsEditor({ initial, current, archive, currentArchive, onReload }: { initial: AgentDefaultsRecord; current(): boolean; archive: boolean; currentArchive(): boolean; onReload(): Promise<AgentDefaultsRecord> }) {
  const copy = useCopy();
  const locale = useLocale();
  const [opening, setOpening] = useState(initial), [edits, setEdits] = useState<AgentDefaultsRecord | null>(null);
  const [days, setDays] = useState(String(initial.archiveInactiveDays));
  const [held, setHeld] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>();
  const flight = useRef(false);
  const save = useHostMutation("host.settings.save", ["agentDefaults"]);
  const value = edits ?? opening;
  const dirty = edits !== null || (archive && days !== String(opening.archiveInactiveDays));
  const valid = !archive || inactiveDays(days) !== undefined;
  useSheetGuard({ dirty, pending: busy });
  const update = <K extends keyof AgentDefaultsRecord>(key: K, next: AgentDefaultsRecord[K]) => setEdits(previous => ({ ...(previous ?? opening), [key]: next }));
  const blocked = busy || held || !current();
  const submit = async () => {
    if (flight.current || blocked || !dirty || !valid) return;
    flight.current = true; setBusy(true); setFailure(undefined);
    // Archive fields are sent only when the computer advertises the archive capability; saving defaults never touches them otherwise.
    const submitted = archive && currentArchive() ? { ...value, archiveInactiveDays: inactiveDays(days)! } : withoutArchive(value);
    try {
      const result = confirmAgentDefaults(await save.mutateAsync({ settings: { agentDefaults: submitted, expectedAgentDefaultsVersion: opening.version } }), submitted);
      if (!current()) return;
      setOpening(result); setEdits(null); setDays(String(result.archiveInactiveDays));
    } catch (error) {
      if (!current()) return;
      if (holdsUnconfirmedSave(error)) setHeld(true);
      else setFailure(failureText(error, copy));
    } finally { flight.current = false; if (current()) setBusy(false); }
  };
  const reload = async () => {
    if (flight.current || !current()) return;
    flight.current = true; setBusy(true); setFailure(undefined);
    try {
      const result = await onReload();
      if (current()) { setOpening(result); setEdits(null); setDays(String(result.archiveInactiveDays)); setHeld(false); }
    } catch (error) { if (current()) setFailure(failureText(error, copy)); }
    finally { flight.current = false; if (current()) setBusy(false); }
  };
  return <Stack>
    <ToggleField label={copy("Ajanlar çalışırken bilgisayarı uyanık tut", "Keep computer awake while agents work")} value={value.keepAwakeWhileAgentsWork} disabled={blocked} onChange={next => update("keepAwakeWhileAgentsWork", next)}
      help={copy("Bu ayarı uygulamak için masaüstü uygulaması açık olmalıdır.", "The desktop app must be open to apply this setting.")} />
    <SelectField label={copy("İş bittikten sonra uyanık tut", "Keep awake after work ends")} value={value.keepAwakeHoldAfter} disabled={blocked} options={[
      { value: "0", label: copy("İş bitince bırak", "Release when work ends") },
      { value: "15m", label: copy("15 dakika", "15 minutes") }, { value: "30m", label: copy("30 dakika", "30 minutes") },
      { value: "1h", label: copy("1 saat", "1 hour") }, { value: "4h", label: copy("4 saat", "4 hours") },
      { value: "forever", label: copy("Süresiz", "Forever") },
    ]} onChange={next => update("keepAwakeHoldAfter", next as AgentDefaultsRecord["keepAwakeHoldAfter"])} />
    <ToggleField label={copy("Kesilen konuşmaları otomatik sürdür", "Automatically continue interrupted conversations")} value={value.autoContinueInterrupted} disabled={blocked} onChange={next => update("autoContinueInterrupted", next)} />
    <ToggleField label={copy("Limit sıfırlandığında devam et", "Resume when usage resets")} value={value.resumeAtReset} disabled={blocked} onChange={next => update("resumeAtReset", next)} />
    <SegmentedControl label={copy("Akış metni", "Streaming text")} value={value.streamingTextMode} disabled={blocked} options={[
      { value: "paced", label: copy("Dengeli", "Paced") }, { value: "adaptive", label: copy("Uyarlanabilir", "Adaptive") },
    ]} onChange={next => update("streamingTextMode", next as AgentDefaultsRecord["streamingTextMode"])} />
    {archive ? <>
      <ToggleField label={copy("PR birleştirilince konuşmayı arşivle", "Archive conversation when linked PR is merged")} value={value.archiveMergedSessions} disabled={blocked} onChange={next => update("archiveMergedSessions", next)} />
      <LimitPresets
        label={copy("Hareketsiz gün sonunda arşivle", "Archive after inactive days")}
        customLabel={copy("Hareketsiz gün sayısı", "Inactive days")}
        hint={copy("0 kapalı. Çalışan konuşmalar, taslaklar ve bekleyen sorular korunur.", "0 disables. Running conversations, drafts and pending questions are protected.")}
        value={days}
        values={INACTIVE_DAY_PRESETS}
        format={(value) => value === "0" ? copy("Kapalı", "Off") : copy("{p0} g", "{p0} d", { p0: new Intl.NumberFormat(locale).format(Number(value)) })}
        disabled={blocked}
        onChange={setDays}
      />
    </> : null}
    {!valid ? <Notice tone="warning" message={copy("0 ile 3650 arasında tam gün gir.", "Enter a whole number of days from 0 to 3650.")} /> : null}
    {failure ? <Notice tone="danger" message={failure} /> : null}
    {held ? <Notice tone="warning" message={copy("Kaydetme doğrulanamadı. Tekrar göndermeden güncel ayarları yükleyin; düzenlemeler sıfırlanır.", "Save was not confirmed. Load current settings before sending again; edits will reset.")} /> : null}
    <FormActions placement="inline" submitLabel={copy("Ajan varsayılanlarını kaydet", "Save agent defaults")} busy={busy} disabled={blocked || !dirty || !valid} onSubmit={() => void submit()} />
    {held ? <Button label={copy("Güncel ayarları yükle", "Load current settings")} busy={busy} disabled={busy} onPress={() => void reload()} /> : null}
  </Stack>;
}

import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useDeviceOffline } from "@/state/device-network";
import { useActiveHostLinkDown, useActiveHostRecoveryMachine } from "@/state/host-runtime-state";
import { useMachineStatus } from "@/ui/machine-bar";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useReadRetryNotice } from "@/ui/query-state";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import { View } from "react-native";
import type { HostSettingsState } from "../../remote/types";
import { hostKey, useHostMutation, useHostQuery } from "../../state/queries";
import { Body, Disclosure, FormActions, QueryState, MutationState, Notice, SectionHeader, Stack, StateView, ErrorText, Loading } from "../../ui/primitives";
import { IntegerStepper } from "@/ui/integer-stepper";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useFormDraft } from "../../state/form-draft";
import { useAsyncAction } from "../../state/actions";
import { useCopy } from "../../ui/copy";
import { useLocale } from "@/i18n";
import {
  acknowledgeSettingsDraft,
  confirmsEditedLimits,
  editedLimits,
  readHostSettingsState,
  settingsFields,
  validSettingsFields,
  type SettingsDraft,
} from "./settings-draft";
import type { HostSettingsEditorProps } from "./settings-types";
import { ShellProfileSettings } from "./shell-profile-settings";
import { useMobileTheme } from "../../ui/theme";
import { WorkCapsSettings } from "./work-caps-settings";
import { AgentDefaultsSettings } from "./agent-defaults-settings";
import { LimitPresets } from "@/ui/limit-presets";

const DAILY_TIME_PRESETS = ["0", "30", "60", "120", "240", "480"] as const;

export function HostSettingsEditor({ machineId, machineName, target }: HostSettingsEditorProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const cache = useQueryClient();
  const machine = useActiveMachine();
  const { phase } = useMachineStatus();
  const deviceOffline = useDeviceOffline() || phase === "offline";
  const linkDown = useActiveHostLinkDown() || deviceOffline || phase === "disconnected";
  const recoveringMachine = useActiveHostRecoveryMachine();
  const recovering = !deviceOffline && recoveringMachine === machineId;
  const showLinkWarning = useReadRetryNotice(recovering, recoveringMachine);
  const quietLinkDown = linkDown && recovering && !showLinkWarning;
  const [opening] = useState(() => ({ machineId, name: machineName ?? machine?.name, target: target ?? reviewedMachine(machine) }));
  const latest = useRef(machineId); latest.current = machineId;
  const mounted = useRef(true), retired = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => {
    if (latest.current !== opening.machineId || opening.target?.id !== opening.machineId || !isReviewedMachine(opening.target, useMachines.getState())) retired.current = true;
    return mounted.current && !retired.current;
  };
  const validScope = current();
  const supported = validScope && !!machine?.capabilities?.includes("host.settings");
  const settings = useHostQuery<HostSettingsState>(["settings"], "host.settings.get", {}, { enabled: supported && !linkDown,
    queryFn: async (client, signal) => {
      if (!current()) throw new Error("This computer connection changed. Reopen its current route.");
      const result = readHostSettingsState(await client.request("host.settings.get", {}, { signal }));
      if (!current()) throw new Error("This computer connection changed. Reopen its current route.");
      return result;
    } });
  const received = useRef<HostSettingsState | undefined>(undefined);
  if (supported && settings.data) received.current = settings.data;
  const errorKind = (settings.error as { kind?: string } | null)?.kind;
  const accessError = errorKind === "auth" || errorKind === "identity";
  const snapshot = accessError ? undefined : received.current;
  const showSections = useRef(false);
  // Keep sections after a proven connection so open child forms survive interruptions.
  if (validScope && !linkDown && !accessError && (phase === "connected" || snapshot)) showSections.current = true;
  const save = useHostMutation<HostSettingsState>("host.settings.save", ["settings"]);
  const action = useAsyncAction<HostSettingsState>();
  const saveFlight = useRef(false);
  const [uncertain, setUncertain] = useState(false), [reading, setReading] = useState(false);
  const [observed, setObserved] = useState<HostSettingsState>();
  const readFlight = useRef(false);
  const draft = useFormDraft<SettingsDraft>({ override: null });
  const savedFields = snapshot ? settingsFields(snapshot) : { maxRunning: "", dailyMinutes: "" };
  const fields = { ...savedFields, ...draft.values.override };
  const dirty = draft.values.override !== null;
  const { requestCloseThen } = useSheetGuard({ dirty, pending: action.isPending || save.isPending || reading });
  const writable = supported && !linkDown && getQueryPresentation(settings) === "ready" && !uncertain;
  const validMinutes = /^\d+$/.test(fields.dailyMinutes) && Number.isSafeInteger(Number(fields.dailyMinutes));
  const mayEditLimits = supported && !linkDown && !uncertain && !reading;
  const formatMinutes = (value: string) => {
    if (value === "0") return copy("Sınırsız", "Unlimited");
    const minutes = Number(value);
    return minutes % 60 === 0
      ? copy("{p0} sa", "{p0} h", { p0: new Intl.NumberFormat(locale).format(minutes / 60) })
      : copy("{p0} dk", "{p0} min", { p0: new Intl.NumberFormat(locale).format(minutes) });
  };
  const update = (key: keyof typeof fields, value: string) =>
    draft.patch((current) => {
      const override = { ...current.override };
      // An in-flight save may change the baseline, so keep corrections made while it runs.
      if (!saveFlight.current && value === savedFields[key]) delete override[key];
      else override[key] = value;
      return { override: Object.keys(override).length ? override : null };
    });
  const submit = () => {
    const submitted = draft.values.override;
    if (saveFlight.current || !submitted || !validSettingsFields(fields) || !writable || !current()) return;
    saveFlight.current = true;
    const sent = editedLimits(submitted);
    setObserved(undefined);
    const finishSave = () => { saveFlight.current = false; };
    void action.run(async () => {
      if (!current() || !useMachines.getState().machines.find(value => value.id === opening.machineId)?.capabilities?.includes("host.settings")) throw new Error("This computer connection changed. Reopen its current route.");
      let result: HostSettingsState;
      try { result = await save.mutateAsync({ settings: sent }); } catch (cause) {
        if (current() && (cause as { uncertain?: boolean })?.uncertain) setUncertain(true);
        throw cause;
      }
      if (!current()) return result;
      try {
        result = readHostSettingsState(result);
        if (!confirmsEditedLimits(result, sent)) throw new Error("The host did not confirm the submitted task settings.");
      } catch (cause) { setUncertain(true); throw cause; }
      cache.setQueriesData<HostSettingsState>(
        { queryKey: hostKey(opening.machineId, ["settings"]) },
        result,
      );
      draft.reset((current) => acknowledgeSettingsDraft(current, submitted));
      return result;
    }).then(finishSave, finishSave);
  };
  const refreshSettings = async () => {
    if (readFlight.current || !current() || !supported) return;
    readFlight.current = true; setReading(true);
    try {
      const result = await settings.refetch();
      if (current() && result.data && !result.isError) { setObserved(readHostSettingsState(result.data)); setUncertain(false); action.reset(); }
    } catch { /* QueryState owns read failure and retry. */ }
    finally { readFlight.current = false; if (mounted.current) setReading(false); }
  };
  const manageConnections = () => requestCloseThen(() => router.navigate("/machines"));
  const checkingConnection = copy("Bağlantı kontrol ediliyor…", "Checking connection…");
  if (validScope && accessError && supported) return (
    <QueryState query={settings} loading="inline" compact onManageConnections={manageConnections} />
  );
  if (validScope && !showSections.current && (quietLinkDown || (!linkDown && phase === "checking"))) {
    return <Loading label={checkingConnection} />;
  }
  if (validScope && linkDown && !showSections.current && opening.name) return (
    <StateView compact tone="warning"
      title={copy("{p0} bu ağda erişilemiyor.", "Can't reach {p0} on this network.", { p0: opening.name })}
      action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections }} />
  );
  return (
    <Stack style={{ gap: space.lg }}>
      {validScope && !linkDown && !snapshot && supported ? <SectionHeader title={copy("Görev sınırları", "Task limits")} /> : null}
      {!validScope ? <Notice tone="warning" message={copy("Seçili bilgisayar değişti. Ayarları yeniden aç.", "The selected computer changed. Reopen the settings.")} /> : quietLinkDown ? null : linkDown ? <Notice tone="warning" message={copy("{p0} bu ağda erişilemiyor.", "Can't reach {p0} on this network.", { p0: opening.name ?? "" })} action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections }} /> : !supported ? <StateView compact illustration="error" title={copy("Görev sınırları kullanılamıyor", "Task limits unavailable")} description={copy("Görev sınırlarını düzenlemek için bu bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to edit task limits.")} /> : <QueryState query={uncertain ? { ...settings, refetch: undefined } : settings} loading="inline" compact onManageConnections={manageConnections} />}
      {snapshot ? (
        <>
          <Animated.View entering={enterItem(0)}>
            <View style={{ gap: space.sm }}>
              <SectionHeader title={copy("Görev sınırları", "Task limits")} />
              <Stack style={{ gap: space.lg }}>
                <IntegerStepper
                  label={copy("Aynı anda çalışan görev", "Concurrent tasks")}
                  value={Number(fields.maxRunning)}
                  min={1}
                  max={Number.MAX_SAFE_INTEGER}
                  onValueChange={(value) => update("maxRunning", String(value))}
                  disabled={!mayEditLimits}
                />
                <Stack style={{ gap: space.xs }}>
                  <LimitPresets
                    label={copy("Günlük ajan süresi", "Daily agent time")}
                    customLabel={copy("Günlük ajan süresi (dakika)", "Daily agent time (minutes)")}
                    values={DAILY_TIME_PRESETS}
                    value={fields.dailyMinutes}
                    format={formatMinutes}
                    onChange={(value) => update("dailyMinutes", value)}
                    disabled={!mayEditLimits}
                  />
                  {!validMinutes ? (
                    <ErrorText error={copy("Sıfır veya pozitif bir tam dakika gir.", "Enter zero or a positive whole number of minutes.")} />
                  ) : null}
                  <Body muted style={uiStyles.caption}>
                    {copy("Bugün {p0} dakika kullanıldı.", "{p0} minutes used today.", {
                      p0: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(snapshot.usedMinutes),
                    })}
                  </Body>
                </Stack>
              </Stack>
            </View>
          </Animated.View>
          {snapshot.limitReached ? (
            <Notice
              tone="warning"
              message={copy("Günlük süre sınırına ulaşıldı.", "Daily time limit reached.")}
            />
          ) : null}
          {validScope && uncertain && action.error ? <Disclosure label={copy("Ayrıntılar", "Details")}><ErrorText error={action.error} /></Disclosure> : null}
          <FormActions
            submitLabel={uncertain ? copy("Yenile", "Refresh") : copy("Bilgisayar ayarlarını kaydet", "Save computer settings")}
            busy={action.isPending || save.isPending || reading}
            disabled={uncertain ? !supported || linkDown : !writable || !dirty || !validSettingsFields(fields)}
            onSubmit={uncertain ? () => { void refreshSettings(); } : submit}
            feedback={<>{uncertain ? <><Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki tercihi kontrol et.", "The save outcome is unknown. Check the preference on the computer before sending again.")} /></> : null}{validScope && observed ? <Body muted>{copy("Son alınan sınırlar: {p0} görev · {p1} dakika (0 sınırsız).", "Last received limits: {p0} tasks · {p1} minutes (0 unlimited).", { p0: observed.maxRunningTasks, p1: observed.dailyAgentMinutes })}</Body> : null}{validScope && !uncertain ? <MutationState
            mutation={action}
            success={
              dirty
                ? copy(
                    "Gönderilen ayarlar kaydedildi. Yeni düzenlemelerin henüz kaydedilmedi.",
                    "Submitted settings saved. Your newer edits are not saved yet.",
                  )
                : copy("Bilgisayar ayarları kaydedildi.", "Computer settings saved.")
            }
          /> : null}</>} />
        </>
      ) : null}
      {validScope ? <>
        <WorkCapsSettings current={current} enabled />
        <AgentDefaultsSettings current={current} enabled />
        <ShellProfileSettings target={opening.target} enabled />
      </> : null}
    </Stack>
  );
}

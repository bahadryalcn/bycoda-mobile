import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { getQueryPresentation } from "@/ui/query-presentation";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import type { HostSettingsState } from "../../remote/types";
import { hostKey, useHostMutation, useHostQuery } from "../../state/queries";
import { Body, Disclosure, FormActions, Field, QueryState, MutationState, Notice, Stack, ErrorText } from "../../ui/primitives";
import { uiStyles } from "../../ui/styles";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useFormDraft } from "../../state/form-draft";
import { useAsyncAction } from "../../state/actions";
import { useCopy } from "../../ui/copy";
import { useLocale } from "@/i18n";
import {
  acknowledgeSettingsDraft,
  readHostSettingsState,
  settingsFields,
  validSettingsFields,
  type SettingsDraft,
} from "./settings-draft";
import type { HostSettingsEditorProps } from "./settings-types";
import { ShellProfileSettings } from "./shell-profile-settings";

export function HostSettingsEditor({ machineId, machineName, target }: HostSettingsEditorProps) {
  const copy = useCopy();
  const locale = useLocale();
  const cache = useQueryClient();
  const machine = useActiveMachine();
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
  const settings = useHostQuery<HostSettingsState>(["settings"], "host.settings.get", {}, { enabled: supported,
    queryFn: async (client, signal) => {
      if (!current()) throw new Error("This computer connection changed. Reopen its current route.");
      const result = readHostSettingsState(await client.request("host.settings.get", {}, { signal }));
      if (!current()) throw new Error("This computer connection changed. Reopen its current route.");
      return result;
    } });
  const received = useRef<HostSettingsState | undefined>(undefined);
  if (supported && settings.data) received.current = settings.data;
  const errorKind = (settings.error as { kind?: string } | null)?.kind;
  const snapshot = errorKind === "auth" || errorKind === "identity" ? undefined : received.current;
  const save = useHostMutation<HostSettingsState>("host.settings.save", ["settings"]);
  const action = useAsyncAction<HostSettingsState>();
  const [uncertain, setUncertain] = useState(false), [reading, setReading] = useState(false);
  const [observed, setObserved] = useState<HostSettingsState>();
  const readFlight = useRef(false);
  const draft = useFormDraft<SettingsDraft>({ override: null });
  const fields =
    draft.values.override ??
    (snapshot ? settingsFields(snapshot) : { maxRunning: "", dailyMinutes: "" });
  const dirty = draft.values.override !== null;
  const { requestCloseThen } = useSheetGuard({ dirty, pending: action.isPending || save.isPending || reading });
  const writable = supported && getQueryPresentation(settings) === "ready" && !uncertain;
  const validMax = /^\d+$/.test(fields.maxRunning) && Number(fields.maxRunning) >= 1 && Number(fields.maxRunning) <= 8;
  const validMinutes = /^\d+$/.test(fields.dailyMinutes) && Number.isSafeInteger(Number(fields.dailyMinutes));
  const update = (key: keyof typeof fields, value: string) =>
    draft.patch((current) => ({ override: { ...(current.override ?? fields), [key]: value } }));
  const submit = () => {
    const submitted = draft.values.override;
    if (!submitted || !validSettingsFields(submitted) || !writable || !current()) return;
    setObserved(undefined);
    void action.run(async () => {
      if (!current() || !useMachines.getState().machines.find(value => value.id === opening.machineId)?.capabilities?.includes("host.settings")) throw new Error("This computer connection changed. Reopen its current route.");
      let result: HostSettingsState;
      try { result = await save.mutateAsync({
        settings: {
          maxRunningTasks: Number(submitted.maxRunning),
          dailyAgentMinutes: Number(submitted.dailyMinutes),
        },
      }); } catch (cause) {
        if (current() && (cause as { uncertain?: boolean })?.uncertain) setUncertain(true);
        throw cause;
      }
      if (!current()) return result;
      try {
        result = readHostSettingsState(result);
        if (result.maxRunningTasks !== Number(submitted.maxRunning) || result.dailyAgentMinutes !== Number(submitted.dailyMinutes)) throw new Error("The host did not confirm the submitted task settings.");
      } catch (cause) { setUncertain(true); throw cause; }
      cache.setQueriesData<HostSettingsState>(
        { queryKey: hostKey(opening.machineId, ["settings"]) },
        result,
      );
      draft.reset((current) => acknowledgeSettingsDraft(current, submitted));
      return result;
    });
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
  return (
    <Stack style={{ gap: space.lg }}>
      <Body>{opening.name}</Body>
      {!validScope ? <Notice tone="warning" message={copy("Seçili bilgisayar değişti. Ayarları yeniden açın.", "The selected computer changed. Reopen the settings.")} /> : !supported ? <Notice message={copy("Görev sınırlarını düzenlemek için bu bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to edit task limits.")} /> : <QueryState query={uncertain ? { ...settings, refetch: undefined } : settings} onManageConnections={() => requestCloseThen(() => router.push("/machines"))} />}
      {snapshot ? (
        <>
          <Animated.View entering={enterItem(0)}>
            <Stack>
              <Field
                label={copy("Aynı anda çalışan görev (1–8)", "Concurrent tasks (1–8)")}
                value={fields.maxRunning}
                onChangeText={(value) => update("maxRunning", value)}
                keyboardType="number-pad"
                editable={supported && !uncertain && !reading}
              />
              {!validMax ? (
                <ErrorText error={copy("Aynı anda 1–8 görev çalışabilir.", "Choose 1–8 concurrent tasks.")} />
              ) : null}
              <Field
                label={copy(
                  "Günlük agent süresi (dakika, 0 sınırsız)",
                  "Daily agent time (minutes, 0 unlimited)",
                )}
                value={fields.dailyMinutes}
                onChangeText={(value) => update("dailyMinutes", value)}
                keyboardType="number-pad"
                editable={supported && !uncertain && !reading}
              />
              {!validMinutes ? (
                <ErrorText error={copy("Sıfır veya pozitif bir tam dakika girin.", "Enter zero or a positive whole number of minutes.")} />
              ) : null}
            </Stack>
          </Animated.View>
          <Body muted style={uiStyles.caption}>
            {copy("Bugün {p0} dakika kullanıldı.", "{p0} minutes used today.", {
              p0: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(snapshot.usedMinutes),
            })}
          </Body>
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
            disabled={uncertain ? !supported : !writable || !dirty || !validSettingsFields(fields)}
            onSubmit={uncertain ? () => { void refreshSettings(); } : submit}
            feedback={<>{uncertain ? <><Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki tercihi kontrol edin.", "The save outcome is unknown. Check the preference on the computer before sending again.")} /></> : null}{validScope && observed ? <Body muted>{copy("Son alınan sınırlar: {p0} görev · {p1} dakika (0 sınırsız).", "Last received limits: {p0} tasks · {p1} minutes (0 unlimited).", { p0: observed.maxRunningTasks, p1: observed.dailyAgentMinutes })}</Body> : null}{validScope && !uncertain ? <MutationState
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
      <ShellProfileSettings target={opening.target} enabled={validScope} />
    </Stack>
  );
}

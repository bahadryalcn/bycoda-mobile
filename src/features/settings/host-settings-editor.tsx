import { useQueryClient } from "@tanstack/react-query";
import type { HostSettingsState } from "../../remote/types";
import { hostKey, useHostMutation, useHostQuery } from "../../state/queries";
import {
  Body,
  Button,
  Card,
  Field,
  QueryState,
  Section,
  MutationState,
  Notice,
  Stack,
  ErrorText,
} from "../../ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useFormDraft } from "../../state/form-draft";
import { useAsyncAction } from "../../state/actions";
import { useCopy } from "../../ui/copy";
import {
  acknowledgeSettingsDraft,
  settingsFields,
  validSettingsFields,
  type SettingsDraft,
} from "./settings-draft";
import type { HostSettingsEditorProps } from "./settings-types";

export function HostSettingsEditor({ machineId }: HostSettingsEditorProps) {
  const copy = useCopy();
  const cache = useQueryClient();
  const settings = useHostQuery<HostSettingsState>(["settings"], "host.settings.get");
  const save = useHostMutation<HostSettingsState>("host.settings.save", ["settings"]);
  const action = useAsyncAction<HostSettingsState>();
  const draft = useFormDraft<SettingsDraft>({ override: null });
  const fields =
    draft.values.override ??
    (settings.data ? settingsFields(settings.data) : { maxRunning: "", dailyMinutes: "" });
  const dirty = draft.values.override !== null;
  useSheetGuard({ dirty, pending: action.isPending || save.isPending });
  const validMax = /^\d+$/.test(fields.maxRunning) && Number(fields.maxRunning) >= 1 && Number(fields.maxRunning) <= 8;
  const validMinutes = /^\d+$/.test(fields.dailyMinutes) && Number.isSafeInteger(Number(fields.dailyMinutes));
  const update = (key: keyof typeof fields, value: string) =>
    draft.patch((current) => ({ override: { ...(current.override ?? fields), [key]: value } }));
  const submit = () => {
    const submitted = draft.values.override;
    if (!submitted || !validSettingsFields(submitted)) return;
    void action.run(async () => {
      const result = await save.mutateAsync({
        settings: {
          maxRunningTasks: Number(submitted.maxRunning),
          dailyAgentMinutes: Number(submitted.dailyMinutes),
        },
      });
      cache.setQueriesData<HostSettingsState>(
        { queryKey: hostKey(machineId, ["settings"]) },
        result,
      );
      draft.reset((current) => acknowledgeSettingsDraft(current, submitted));
      return result;
    });
  };
  return (
    <Stack>
      <QueryState query={settings} />
      {settings.data ? (
        <Stack>
          <Field
            label={copy("Aynı anda çalışan görev (1–8)", "Concurrent tasks (1–8)")}
            value={fields.maxRunning}
            onChangeText={(value) => update("maxRunning", value)}
            keyboardType="number-pad"
          />
          {!validMax && <ErrorText error={copy("Aynı anda 1–8 görev çalışabilir.", "Choose 1–8 concurrent tasks.")} />}
          <Field
            label={copy(
              "Günlük agent süresi (dakika, 0 sınırsız)",
              "Daily agent time (minutes, 0 unlimited)",
            )}
            value={fields.dailyMinutes}
            onChangeText={(value) => update("dailyMinutes", value)}
            keyboardType="number-pad"
          />
          {!validMinutes && <ErrorText error={copy("Sıfır veya pozitif bir tam dakika girin.", "Enter zero or a positive whole number of minutes.")} />}
          <Body muted>
            {copy(
              `Bugün ${settings.data.usedMinutes.toFixed(1)} dakika kullanıldı.`,
              `${settings.data.usedMinutes.toFixed(1)} minutes used today.`,
            )}
          </Body>
          {settings.data.limitReached ? (
            <Notice
              tone="warning"
              message={copy("Günlük süre sınırına ulaşıldı.", "Daily time limit reached.")}
            />
          ) : null}
          <MutationState
            mutation={action}
            pending={copy("Ayarlar kaydediliyor…", "Saving settings…")}
            success={
              dirty
                ? copy(
                    "Gönderilen ayarlar kaydedildi. Yeni düzenlemelerin henüz kaydedilmedi.",
                    "Submitted settings saved. Your newer edits are not saved yet.",
                  )
                : copy("Bilgisayar ayarları kaydedildi.", "Computer settings saved.")
            }
          />
          <Button
            label={copy("Bilgisayar ayarlarını kaydet", "Save computer settings")}
            busy={action.isPending || save.isPending}
            disabled={!dirty || !validSettingsFields(fields)}
            tone="primary"
            onPress={submit}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

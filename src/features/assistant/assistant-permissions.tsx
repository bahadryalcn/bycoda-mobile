import { useEffect, useRef, useState } from "react";
import { useSheetGuard } from "@/ui/sheet-guard";
import type {
  AssistantProfile,
  AssistantNotificationTarget,
} from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient } from "./assistant-client";
import { useCopy } from "@/ui/copy";
import {
  ErrorNotice,
  FormActions,
  MultiSelectField,
  NavigationGroup,
  Notice,
  Section,
  SelectField,
  Stack,
  StatusText,
  ToggleField,
  ValueRow,
  showToast,
} from "@/ui/primitives";
import { InfoHint } from "@/ui/info-hint";
import { MinuteLimitField } from "@/ui/limit-presets";

const exclusions = [
  "pushMain",
  "deleteProject",
  "deleteSession",
  "sendMessages",
  "computerUse",
  "spend",
] as const;
type Level = "legacy" | "ask" | "watch" | "projects" | "everything";
/** Urgent reminder repeats offered as choices; the Host accepts 0–10. */
export const REPEAT_PRESETS = ["0", "1", "2", "3", "5", "10"] as const;
const targetKey = (target: AssistantProfile["notificationTelegram"]) =>
  target ? JSON.stringify([target.accountId, target.conversationId]) : "";
const integerInRange = (text: string, min: number, max: number) =>
  /^\d+$/.test(text) &&
  Number.isSafeInteger(Number(text)) &&
  Number(text) >= min &&
  Number(text) <= max;
/** A write whose reply was lost may have applied: only then is the result "not confirmed". */
const uncertain = (error: unknown) => !!error && typeof error === "object" && (error as { uncertain?: unknown }).uncertain === true;
const sameSet = (values: readonly string[], original: readonly string[]) =>
  values.length === original.length && values.every((value) => original.includes(value));

/**
 * The assistant's notification, computer and access preferences on Settings → Assistant.
 * Notifications and the computer save on their own a moment after a change. Access does not: the Host
 * interrupts the assistant's running work whenever the permission level, its projects or the
 * always-ask list are written, so those apply only on an explicit Save that says so first.
 */
export function AssistantPermissions({
  profile,
  client,
  projects,
  enabled,
  current,
  onChanged,
}: {
  profile: AssistantProfile;
  client: AssistantMobileClient;
  projects: { id: string; name: string }[];
  enabled: boolean;
  current(): boolean;
  onChanged(): Promise<void>;
}) {
  const copy = useCopy();
  const [opening, setOpening] = useState(profile);
  const [level, setLevel] = useState<Level>(opening.permissionLevel ?? "legacy");
  const [projectIds, setProjectIds] = useState(opening.permissionProjectIds ?? []);
  const [critical, setCritical] = useState<string[]>(opening.criticalExclusions ?? [...exclusions]);
  const [keepAwake, setKeepAwake] = useState(opening.keepAwakeWhileAway ?? true);
  const [repeats, setRepeats] = useState(String(opening.urgentNotificationRepeats ?? 2));
  const [interval, setInterval] = useState(String(opening.urgentNotificationIntervalMinutes ?? 30));
  const [telegram, setTelegram] = useState(targetKey(opening.notificationTelegram));
  const [targets, setTargets] = useState<AssistantNotificationTarget[]>([]);
  const [targetsLoaded, setTargetsLoaded] = useState(false),
    [targetsFailed, setTargetsFailed] = useState(false);
  const [targetsBusy, setTargetsBusy] = useState(false);
  const [busy, setBusy] = useState<"preferences" | "access" | "read" | null>(null),
    [failed, setFailed] = useState<"preferences" | "access" | null>(null),
    [failure, setFailure] = useState<unknown>(null);
  const pending = useRef(false),
    targetRead = useRef(false);
  const validRepeats = integerInRange(repeats, 0, 10),
    validInterval = integerInRange(interval, 1, 1440);
  const changedTarget = telegram !== targetKey(opening.notificationTelegram);
  const accessDirty =
    level !== (opening.permissionLevel ?? "legacy") ||
    !sameSet(projectIds, opening.permissionProjectIds ?? []) ||
    !sameSet(critical, opening.criticalExclusions ?? exclusions);
  const preferencesDirty =
    keepAwake !== (opening.keepAwakeWhileAway ?? true) ||
    repeats !== String(opening.urgentNotificationRepeats ?? 2) ||
    interval !== String(opening.urgentNotificationIntervalMinutes ?? 30) ||
    changedTarget;
  const dirty = accessDirty || preferencesDirty;
  useSheetGuard({ pending: busy !== null, dirty });
  const selectedTarget = targets.find((target) => targetKey(target) === telegram);
  const targetUnavailable = !!telegram && targetsLoaded && !selectedTarget;
  const stale = profile.version > opening.version;
  const adopt = (latest: AssistantProfile) => {
    setOpening(latest);
    setLevel(latest.permissionLevel ?? "legacy");
    setProjectIds(latest.permissionProjectIds ?? []);
    setCritical(latest.criticalExclusions ?? [...exclusions]);
    setKeepAwake(latest.keepAwakeWhileAway ?? true);
    setRepeats(String(latest.urgentNotificationRepeats ?? 2));
    setInterval(String(latest.urgentNotificationIntervalMinutes ?? 30));
    setTelegram(targetKey(latest.notificationTelegram));
  };
  // Another change to the profile (the reply model, the desktop) is adopted while nothing is edited
  // here; with edits in progress it is a conflict that waits for an explicit reload.
  useEffect(() => {
    if (stale && !dirty && !failed && !pending.current) adopt(profile);
  }, [stale, dirty, failed, profile]);
  const loadTargets = async () => {
    if (pending.current || targetRead.current || !enabled || !current()) return;
    targetRead.current = true;
    setTargetsBusy(true);
    try {
      const allowed = await client.notificationTargets();
      if (!current()) return;
      setTargets(allowed);
      setTargetsLoaded(true);
      setTargetsFailed(false);
    } catch {
      if (current()) setTargetsFailed(true);
    } finally {
      targetRead.current = false;
      if (current()) setTargetsBusy(false);
    }
  };
  const loadCurrent = async () => {
    if (pending.current || targetRead.current || !enabled || !current()) return;
    pending.current = true;
    setBusy("read");
    try {
      const latest = (await client.inspectPresence()).profile;
      if (!current()) return;
      adopt(latest);
      setTargets([]);
      setTargetsLoaded(false);
      setTargetsFailed(false);
      setFailed(null);
      setFailure(null);
      await onChanged();
    } catch {
      if (current()) setFailed((old) => old ?? "preferences");
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
    }
  };
  const labels = [
    copy("Ana dala gönderme", "Push to main"),
    copy("Proje silme", "Delete projects"),
    copy("Oturum silme", "Delete sessions"),
    copy("Mesaj gönderme", "Send messages"),
    copy("Bilgisayar kullanımı", "Computer use"),
    copy("Harcama", "Spending"),
  ];
  const writable = () => !pending.current && !targetRead.current && !failed && enabled && current() &&
    profile.version <= opening.version;
  /** Notifications and the computer: none of these fields interrupts the assistant's work on the Host. */
  const savePreferences = async () => {
    if (!writable() || !validRepeats || !validInterval || (changedTarget && !!telegram && !selectedTarget)) return;
    pending.current = true;
    setBusy("preferences");
    try {
      // Recheck allowed destinations on the original Host before a changed target is written.
      if (changedTarget && telegram) {
        const allowed = await client.notificationTargets();
        if (!current()) return;
        setTargets(allowed);
        setTargetsLoaded(true);
        if (!allowed.some((target) => targetKey(target) === telegram)) return;
      }
      if (!current()) return;
      const saved = await client.updateProfile(opening.version, {
        keepAwakeWhileAway: keepAwake,
        urgentNotificationRepeats: Number(repeats),
        urgentNotificationIntervalMinutes: Number(interval),
        ...(changedTarget
          ? {
              notificationTelegram:
                selectedTarget && telegram
                  ? { accountId: selectedTarget.accountId, conversationId: selectedTarget.conversationId }
                  : null,
            }
          : {}),
      });
      if (current()) {
        setOpening(saved);
        showToast({ message: copy("Tercihler kaydedildi.", "Preferences saved.") });
        // The save is already confirmed; a failed refresh only leaves the parent profile stale.
        await onChanged().catch(() => undefined);
      }
    } catch (error) {
      if (current()) { setFailed("preferences"); setFailure(error); }
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
    }
  };
  /** Access only, on an explicit Save: writing it makes the Host stop the assistant's running work. */
  const saveAccess = async () => {
    if (!writable() || !accessDirty || level === "legacy") return;
    pending.current = true;
    setBusy("access");
    try {
      const saved = await client.updateProfile(opening.version, {
        permissionLevel: level,
        permissionProjectIds: projectIds,
        criticalExclusions: exclusions.filter((value) => critical.includes(value)),
      });
      if (current()) {
        setOpening(saved);
        showToast({ message: copy("Tercihler kaydedildi.", "Preferences saved.") });
        await onChanged().catch(() => undefined);
      }
    } catch (error) {
      if (current()) { setFailed("access"); setFailure(error); }
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
    }
  };
  const discardAccess = () => {
    if (busy) return;
    setLevel(opening.permissionLevel ?? "legacy");
    setProjectIds(opening.permissionProjectIds ?? []);
    setCritical(opening.criticalExclusions ?? [...exclusions]);
  };
  // Notifications and the computer save a moment after the last change, like the phone's other settings.
  // An invalid number or an unverified Telegram destination waits until it is fixed.
  const preferencesSaveable = enabled && !busy && !failed && !targetsBusy && validRepeats && validInterval &&
    !(changedTarget && !!telegram && !selectedTarget) && !stale;
  useEffect(() => {
    if (!preferencesDirty || !preferencesSaveable) return;
    const timer = setTimeout(() => void savePreferences(), 500);
    return () => clearTimeout(timer);
  }, [preferencesDirty, preferencesSaveable, keepAwake, repeats, interval, telegram]);
  // The allowed Telegram destinations are read once when the settings open, not behind a button.
  useEffect(() => {
    if (enabled) void loadTargets();
  }, [enabled]);
  const locked = !enabled || busy !== null || !!failed;
  // Recovery is one verb in the text and the action: load the current preferences.
  const reload = { label: copy("Güncel tercihleri yükle", "Load current preferences"), onPress: () => { if (busy === null) void loadCurrent(); } };
  // A lost reply may have saved: then "not confirmed"; a refused or failed save shows its real cause.
  const failureNotice = uncertain(failure)
    ? <Notice tone="warning" message={copy("Kaydetme doğrulanamadı. Tekrar kaydetmeden önce güncel tercihleri yükle.", "Could not confirm the save. Load the current preferences before saving again.")} action={reload} />
    : <ErrorNotice error={failure} action={reload} />;
  const times = (value: string) => value === "0"
    ? copy("Kapalı", "Off")
    : value === "1" ? copy("1 kez", "Once") : copy("{p0} kez", "{p0} times", { p0: value });
  const repeatOptions = [
    ...REPEAT_PRESETS,
    ...(validRepeats && !REPEAT_PRESETS.includes(repeats as never) ? [repeats] : []),
  ].sort((a, b) => Number(a) - Number(b)).map((value) => ({ value, label: times(value) }));
  const noTelegram = targetsLoaded && !targets.length && !telegram;
  const levelOptions: { value: Level; label: string; detail?: string; disabled?: boolean }[] = [
    // An unset level (an older profile) is shown, never offered: the desktop marks it the same way.
    ...(opening.permissionLevel === undefined
      ? [{ value: "legacy" as const, label: copy("Ayarlanmadı", "Not set"), disabled: true }]
      : []),
    { value: "ask", label: copy("Her işlemde sor", "Ask for each operation"),
      detail: copy("Her değişiklikten önce onayını ister.", "Asks you before every change.") },
    { value: "watch", label: copy("Yalnızca izle", "Watch only"),
      detail: copy("Okur ve izler; hiçbir şeyi değiştirmez.", "Reads and watches; changes nothing.") },
    { value: "projects", label: copy("Seçili projeler", "Selected projects"),
      detail: copy("Yalnızca seçtiğin projelerde sormadan çalışır.", "Works without asking only in the projects you choose.") },
    { value: "everything", label: copy("Her şey", "Everything"),
      detail: copy("Her projede sormadan çalışır.", "Works without asking in every project.") },
  ];
  return (
    <Stack>
      <Section title={copy("Bildirimler", "Notifications")}>
        <NavigationGroup>
          <SelectField
            variant="row"
            label={copy("Acil bildirimi tekrarla", "Repeat urgent notifications")}
            hint={copy("Onay bekleyen, takılan veya hata veren işler için", "For jobs that wait for approval, stall or fail")}
            value={validRepeats ? repeats : undefined}
            disabled={locked}
            options={repeatOptions}
            onChange={(value) => {
              setRepeats(value);
              // The hidden interval must not hold back saving "Off" with an unfinished custom value.
              if (value === "0" && !validInterval) setInterval(String(opening.urgentNotificationIntervalMinutes ?? 30));
            }}
          />
          {validRepeats && Number(repeats) > 0 ? (
            <MinuteLimitField
              variant="row"
              label={copy("Tekrar aralığı", "Repeat interval")}
              min={1}
              value={interval}
              disabled={locked}
              onChange={setInterval}
              error={validInterval ? undefined
                : copy("1 ile 1440 arasında bir tam sayı gir.", "Enter a whole number from 1 to 1440.")}
            />
          ) : null}
          {noTelegram ? (
            // Nothing to choose: a value row, with where to connect one behind its info icon.
            <ValueRow label={copy("Telegram bildirim hedefi", "Telegram notification destination")} value={copy("Yok", "None")}
              trailing={<InfoHint compact subject={copy("Telegram bildirim hedefi", "Telegram notification destination")}
                text={copy("Masaüstünde Sosyal → Telegram bağla", "Connect Telegram in Social on the desktop")} />} />
          ) : (
            <SelectField
              variant="row"
              label={copy("Telegram bildirim hedefi", "Telegram notification destination")}
              value={telegram}
              disabled={locked || targetsBusy}
              options={[
                { value: "", label: copy("Telegram'a gönderme", "Do not send to Telegram") },
                ...targets.map((target) => ({
                  value: targetKey(target),
                  label: `${target.accountLabel || copy("Telegram hesabı", "Telegram account")} · ${target.conversationLabel || copy("Konuşma", "Conversation")}`,
                })),
                ...(telegram && !selectedTarget
                  ? [{
                      value: telegram,
                      label: targetsLoaded
                        ? copy("Kayıtlı konuşma kullanılamıyor", "Saved conversation unavailable")
                        : copy("Kayıtlı konuşma (henüz doğrulanmadı)", "Saved conversation (not yet verified)"),
                    }]
                  : []),
              ]}
              onChange={(value) => {
                if (!value || targets.some((target) => targetKey(target) === value)) setTelegram(value);
              }}
            />
          )}
        </NavigationGroup>
        {targetsFailed ? (
          <Notice
            tone="warning"
            message={copy(
              "Telegram hedefleri okunamadı. Kayıtlı hedef korunuyor.",
              "Telegram destinations could not be loaded. The saved destination is kept.",
            )}
            action={{ label: copy("Yeniden dene", "Retry"), onPress: () => { if (!locked && !targetsBusy) void loadTargets(); } }}
          />
        ) : null}
        {targetUnavailable ? (
          <Notice
            tone="warning"
            message={copy(
              "Kayıtlı hedef kullanılamıyor. Başka bir hedef seç veya Telegram bildirimlerini kapat.",
              "The saved destination is unavailable. Choose another destination or turn off Telegram notifications.",
            )}
          />
        ) : null}
      </Section>
      <Section title={copy("Bilgisayar", "Computer")}>
        <NavigationGroup>
          <ToggleField
            label={copy("Uzaktayken bilgisayarı uyanık tut", "Keep the computer awake while away")}
            help={copy(
              "Sen uzaktayken asistan çalışabilsin diye bilgisayar uyku moduna geçmez.",
              "The computer does not sleep while you are away, so the assistant can keep working.",
            )}
            value={keepAwake}
            disabled={locked}
            onChange={setKeepAwake}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Erişim", "Access")}>
        <NavigationGroup>
          <SelectField
            variant="row"
            label={copy("İzin düzeyi", "Permission level")}
            hint={copy("Bilgisayar kontrolü gibi işlemler için masaüstünde ayrıca izin gerekir.", "Actions such as computer control also need permission on the desktop.")}
            value={level}
            disabled={locked}
            options={levelOptions}
            onChange={(value) => { if (value !== "legacy") setLevel(value); }}
          />
          {level === "projects" ? (
            <MultiSelectField
              variant="row"
              label={copy("Projeler", "Projects")}
              values={projectIds}
              error={projectIds.length ? undefined : copy("En az bir proje seç; yoksa hiçbir projede sürekli izin olmaz.", "Choose at least one project; otherwise no project has standing permission.")}
              disabled={locked}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              max={100}
              onChange={setProjectIds}
            />
          ) : null}
          {/* The exclusions narrow a standing level, so they appear once a level is chosen. */}
          {level !== "legacy" ? (
            <MultiSelectField
              variant="row"
              label={copy("Her zaman ayrıca onay iste", "Always ask separately")}
              values={critical}
              disabled={locked}
              options={exclusions.map((value, index) => ({ value, label: labels[index]! }))}
              onChange={setCritical}
              max={6}
            />
          ) : null}
        </NavigationGroup>
      </Section>
      {accessDirty || busy === "access" || failed === "access" ? (
        <FormActions
          submitLabel={copy("Kaydet", "Save")}
          cancelLabel={copy("Vazgeç", "Cancel")}
          dirty={accessDirty}
          busy={busy === "access"}
          disabled={!enabled || !!busy || !!failed || stale || level === "legacy" || !accessDirty}
          cancelDisabled={!!busy || !accessDirty}
          onCancel={discardAccess}
          onSubmit={() => void saveAccess()}
          feedback={failed === "access" ? failureNotice : (
            <Notice tone="warning" message={copy(
              "Kaydetmek, asistanın şu an yürüttüğü işleri yarıda keser.",
              "Saving interrupts the work the assistant is doing right now.",
            )} />
          )}
        />
      ) : null}
      <Stack>
        {busy === "preferences" ? <StatusText tone="live" label={copy("Kaydediliyor…", "Saving…")} /> : null}
        {failed === "preferences" ? failureNotice
          : stale ? <Notice tone="warning" message={copy("Tercihler başka yerde değişti. Kaydetmeden önce güncel tercihleri yükle.", "Preferences changed elsewhere. Load the current preferences before saving.")}
            action={reload} /> : null}
      </Stack>
    </Stack>
  );
}

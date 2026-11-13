import { useRef, useState } from "react";
import type {
  AssistantProfile,
  AssistantNotificationTarget,
} from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient } from "./assistant-client";
import { useCopy } from "@/ui/copy";
import {
  Button,
  Disclosure,
  MultiSelectField,
  Notice,
  NumberField,
  Section,
  SelectField,
  Stack,
  ToggleField,
} from "@/ui/primitives";

const exclusions = [
  "pushMain",
  "deleteProject",
  "deleteSession",
  "sendMessages",
  "computerUse",
  "spend",
] as const;
const targetKey = (target: AssistantProfile["notificationTelegram"]) =>
  target ? JSON.stringify([target.accountId, target.conversationId]) : "";
const integerInRange = (text: string, min: number, max: number) =>
  /^\d+$/.test(text) &&
  Number.isSafeInteger(Number(text)) &&
  Number(text) >= min &&
  Number(text) <= max;
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
  const [level, setLevel] = useState<"legacy" | "watch" | "projects" | "everything">(
    opening.permissionLevel ?? "legacy",
  );
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
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const pending = useRef(false),
    targetRead = useRef(false);
  const validRepeats = integerInRange(repeats, 0, 10),
    validInterval = integerInRange(interval, 1, 1440);
  const changedTarget = telegram !== targetKey(opening.notificationTelegram);
  const selectedTarget = targets.find((target) => targetKey(target) === telegram);
  const targetUnavailable = !!telegram && targetsLoaded && !selectedTarget;
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
    setBusy(true);
    try {
      const latest = (await client.inspectPresence()).profile;
      if (!current()) return;
      setOpening(latest);
      setLevel(latest.permissionLevel ?? "legacy");
      setProjectIds(latest.permissionProjectIds ?? []);
      setCritical(latest.criticalExclusions ?? [...exclusions]);
      setKeepAwake(latest.keepAwakeWhileAway ?? true);
      setRepeats(String(latest.urgentNotificationRepeats ?? 2));
      setInterval(String(latest.urgentNotificationIntervalMinutes ?? 30));
      setTelegram(targetKey(latest.notificationTelegram));
      setTargets([]);
      setTargetsLoaded(false);
      setTargetsFailed(false);
      setFailed(false);
      await onChanged();
    } catch {
      if (current()) setFailed(true);
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  const labels = [
    copy("Main'e gönderme", "Push to main"),
    copy("Proje silme", "Delete projects"),
    copy("Oturum silme", "Delete sessions"),
    copy("Mesaj gönderme", "Send messages"),
    copy("Bilgisayar kullanımı", "Computer use"),
    copy("Harcama", "Spending"),
  ];
  const save = async () => {
    if (
      pending.current ||
      targetRead.current ||
      failed ||
      !enabled ||
      !current() ||
      profile.version !== opening.version ||
      !validRepeats ||
      !validInterval ||
      (changedTarget && !!telegram && !selectedTarget)
    )
      return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
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
        ...(level === "legacy" ? {} : { permissionLevel: level }),
        permissionProjectIds: projectIds,
        criticalExclusions: exclusions.filter((value) => critical.includes(value)),
        keepAwakeWhileAway: keepAwake,
        urgentNotificationRepeats: Number(repeats),
        urgentNotificationIntervalMinutes: Number(interval),
        ...(changedTarget
          ? {
              notificationTelegram:
                selectedTarget && telegram
                  ? {
                      accountId: selectedTarget.accountId,
                      conversationId: selectedTarget.conversationId,
                    }
                  : null,
            }
          : {}),
      });
      if (current()) {
        setOpening(saved);
        await onChanged();
      }
    } catch {
      if (current()) setFailed(true);
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <Disclosure label={copy("Asistan tercihleri", "Assistant preferences")}>
      <Section title={copy("İzin düzeyi", "Permission level")}>
        <SelectField
          label={copy("Kapsam", "Scope")}
          value={level}
          disabled={!enabled || busy}
          options={[
            ...(opening.permissionLevel === undefined
              ? [
                  {
                    value: "legacy" as const,
                    label: copy("Mevcut açık sahip onayları", "Existing exact owner prompts"),
                  },
                ]
              : []),
            { value: "watch", label: copy("Yalnızca izle", "Watch only") },
            { value: "projects", label: copy("Seçili projeler", "Selected projects") },
            { value: "everything", label: copy("Her şey", "Everything") },
          ]}
          onChange={setLevel}
        />
        {level === "projects" ? (
          <MultiSelectField
            label={copy("Projeler", "Projects")}
            values={projectIds}
            disabled={!enabled || busy}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            max={100}
            onChange={setProjectIds}
          />
        ) : null}
        {level === "projects" && !projectIds.length ? (
          <Notice
            message={copy(
              "Proje seçilmedi: hiçbir proje için sürekli izin yok.",
              "No projects selected: no project has standing permission.",
            )}
          />
        ) : null}
        <MultiSelectField
          label={copy("Her zaman ayrıca onay iste", "Always ask separately")}
          values={critical}
          disabled={!enabled || busy}
          options={exclusions.map((value, index) => ({ value, label: labels[index]! }))}
          onChange={setCritical}
          max={6}
        />
        <Notice
          message={copy(
            "Bu ayarlar izin tercihini kaydeder. Yerel bilgisayar işlemleri için masaüstünde ayrıca yetki verin; mobil uygulama bu yetkiyi veremez.",
            "These settings save permission preferences. Authorize native computer effects separately on desktop; mobile cannot grant that authority.",
          )}
        />
      </Section>
      <Section title={copy("Bildirimler ve uyanık tutma", "Notifications and wakefulness")}>
        <ToggleField
          label={copy("Uzaktayken bilgisayarı uyanık tut", "Keep computer awake while away")}
          value={keepAwake}
          disabled={!enabled || busy || failed}
          onChange={setKeepAwake}
        />
        <NumberField
          label={copy("Acil bildirim tekrarları", "Urgent notification repeats")}
          value={repeats}
          editable={enabled && !busy && !failed}
          hint={copy("0–10; 0 tekrarı kapatır.", "0–10; 0 turns repeats off.")}
          onChangeText={setRepeats}
          error={
            validRepeats
              ? undefined
              : copy("0 ile 10 arasında bir tam sayı girin.", "Enter a whole number from 0 to 10.")
          }
        />
        <NumberField
          label={copy(
            "Acil bildirim tekrar aralığı (dakika)",
            "Urgent notification repeat interval (minutes)",
          )}
          value={interval}
          editable={enabled && !busy && !failed}
          onChangeText={setInterval}
          error={
            validInterval
              ? undefined
              : copy(
                  "1 ile 1440 arasında bir tam sayı girin.",
                  "Enter a whole number from 1 to 1440.",
                )
          }
        />
        <SelectField
          label={copy("Telegram bildirim hedefi", "Telegram notification destination")}
          value={telegram}
          disabled={!enabled || busy || targetsBusy || failed}
          options={[
            { value: "", label: copy("Telegram'a gönderme", "Do not send to Telegram") },
            ...targets.map((target) => ({
              value: targetKey(target),
              label: `${target.accountLabel || copy("Telegram hesabı", "Telegram account")} · ${target.conversationLabel || copy("Konuşma", "Conversation")}`,
            })),
            ...(telegram && !selectedTarget
              ? [
                  {
                    value: telegram,
                    label: targetsLoaded
                      ? copy("Kayıtlı konuşma kullanılamıyor", "Saved conversation unavailable")
                      : copy(
                          "Kayıtlı konuşma (henüz doğrulanmadı)",
                          "Saved conversation (not yet verified)",
                        ),
                  },
                ]
              : []),
          ]}
          onChange={(value) => {
            if (!value || targets.some((target) => targetKey(target) === value)) setTelegram(value);
          }}
        />
        <Button
          label={copy("Telegram konuşmalarını yükle", "Load Telegram conversations")}
          busy={targetsBusy}
          disabled={!enabled || busy || targetsBusy || failed}
          onPress={() => void loadTargets()}
        />
        {targetsFailed ? (
          <Notice
            tone="warning"
            message={copy(
              "Telegram hedefleri okunamadı. Kayıtlı hedef korunuyor.",
              "Telegram destinations could not be loaded. The saved destination is kept.",
            )}
          />
        ) : null}
        {targetsLoaded && !targets.length ? (
          <Notice
            message={copy(
              "Bu bilgisayarda izinli Telegram konuşması yok.",
              "No allowed Telegram conversations on this computer.",
            )}
          />
        ) : null}
        {targetUnavailable ? (
          <Notice
            tone="warning"
            message={copy(
              "Kayıtlı hedef kullanılamıyor. Başka bir hedef seçin veya Telegram bildirimlerini kapatın.",
              "The saved destination is unavailable. Choose another destination or turn off Telegram notifications.",
            )}
          />
        ) : null}
      </Section>
      <Stack>
        {failed ? (
          <Notice
            tone="warning"
            message={copy(
              "Kaydetme doğrulanamadı. Tekrar göndermeden önce güncel tercihleri yeniden açın.",
              "Save could not be confirmed. Reopen current preferences before sending again.",
            )}
          />
        ) : null}
        {profile.version !== opening.version || failed ? (
          <Button
            label={copy("Güncel tercihleri yükle", "Load current preferences")}
            disabled={busy}
            onPress={() => void loadCurrent()}
          />
        ) : null}
        <Button
          label={copy("Tercihleri kaydet", "Save preferences")}
          busy={busy}
          disabled={
            !enabled ||
            busy ||
            targetsBusy ||
            failed ||
            !validRepeats ||
            !validInterval ||
            (changedTarget && !!telegram && !selectedTarget) ||
            profile.version !== opening.version
          }
          onPress={() => void save()}
        />
      </Stack>
    </Disclosure>
  );
}

import { useState } from "react";
import { View } from "react-native";
import EyeOff from "lucide-react-native/icons/eye-off";
import Eye from "lucide-react-native/icons/eye";
import { Button, Empty, Field, FormActions, NavigationGroup, NavigationRow, Notice, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { lockConfirmed, retrySeconds, type GroupLockView, type PasswordOutcome } from "./group-lock-model";

/** Typed value stays in this component's state only and is cleared as soon as it is sent. */
export function GroupPasswordSheet({
  title,
  submitLabel,
  onSubmit,
  onClose,
  onDone,
}: {
  title: string;
  submitLabel: string;
  /** Resolves with the attempt's outcome; `ok` closes the sheet. */
  onSubmit: (password: string) => Promise<PasswordOutcome>;
  onClose: () => void;
  /** Called instead of `onClose` after an accepted password. */
  onDone?: () => void;
}) {
  const copy = useCopy();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PasswordOutcome>();
  const submit = async () => {
    if (!value || busy) return;
    const password = value;
    setBusy(true);
    setValue("");
    setOutcome(undefined);
    const result = await onSubmit(password).catch((): PasswordOutcome => ({ state: "failed" }));
    setBusy(false);
    if (result.state === "ok") (onDone ?? onClose)();
    else setOutcome(result);
  };
  const message = (() => {
    if (!outcome || outcome.state === "ok") return undefined;
    if (outcome.state === "throttled")
      return copy(
        "Çok fazla deneme. {p0} saniye sonra tekrar dene.",
        "Too many attempts. Try again in {p0} seconds.",
        { p0: retrySeconds(outcome.retryAfterMs) },
      );
    if (outcome.state === "wrong")
      return outcome.retryAfterMs > 0
        ? copy("Şifre yanlış. {p0} saniye sonra tekrar dene.", "Wrong password. Try again in {p0} seconds.", {
            p0: retrySeconds(outcome.retryAfterMs),
          })
        : copy("Şifre yanlış.", "Wrong password.");
    if (outcome.state === "unavailable")
      return copy(
        "Gruplar için bilgisayarda bycoda açık olmalı.",
        "Open bycoda on your computer to unlock groups from this device.",
      );
    return copy("Şifre kontrol edilemedi. Tekrar dene.", "Could not check the password. Try again.");
  })();
  return (
    <Sheet visible title={title} size="compact" onClose={onClose}>
      <Field
        label={copy("Şifre", "Password")}
        value={value}
        onChangeText={setValue}
        secureTextEntry
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        textContentType="none"
        importantForAutofill="no"
        editable={!busy}
        onSubmitEditing={() => void submit()}
      />
      {message ? <Notice tone="warning" message={message} /> : null}
      <FormActions
        submitLabel={submitLabel}
        onSubmit={() => void submit()}
        disabled={!value}
        busy={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={onClose}
      />
    </Sheet>
  );
}

/** Hidden groups, shown only once the hidden-list password was accepted. */
export function HiddenGroupsSheet({
  view,
  onSetHidden,
  onLockAll,
  onClose,
}: {
  view: GroupLockView;
  onSetHidden: (groupId: string, hidden: boolean) => Promise<boolean>;
  onLockAll: () => Promise<boolean>;
  onClose: () => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const [pending, setPending] = useState<string>();
  const [failed, setFailed] = useState(false);
  const change = async (id: string, hidden: boolean) => {
    setPending(id);
    setFailed(false);
    const ok = await onSetHidden(id, hidden).catch(() => false);
    setPending(undefined);
    if (!ok) setFailed(true);
  };
  const [locking, setLocking] = useState(false);
  const [lockFailed, setLockFailed] = useState(false);
  // Closes only after the Host confirmed the lock; a failure keeps the sheet open for a retry.
  const lockAll = async () => {
    if (locking) return;
    setLocking(true);
    setLockFailed(false);
    const locked = await lockConfirmed(onLockAll);
    setLocking(false);
    if (locked) onClose();
    else setLockFailed(true);
  };
  const hidden = view.hidden ?? [];
  return (
    <Sheet visible title={copy("Gizli gruplar", "Hidden groups")} onClose={onClose}>
      <View style={{ gap: space.md }}>
        {failed ? (
          <Notice tone="warning" message={copy("Grup güncellenemedi. Tekrar dene.", "Could not update the group. Try again.")} />
        ) : null}
        {lockFailed ? (
          <Notice
            tone="danger"
            message={copy(
              "Gruplar kilitlenemedi. Gruplar bilgisayarda hâlâ açık olabilir. Tekrar dene.",
              "Could not lock the groups. They may still be unlocked on your computer. Try again.",
            )}
            onRetry={() => void lockAll()}
            retrying={locking}
          />
        ) : null}
        {hidden.length + view.hideable.length === 0 ? (
          <Empty title={copy("Gösterilecek grup yok", "No groups to show")} />
        ) : null}
        <NavigationGroup>
          {hidden.map((group) => (
            <NavigationRow
              key={group.id}
              label={group.name}
              intent="command"
              icon={<EyeOff size={18} color={colors.muted} />}
              busy={pending === group.id}
              disabled={!!pending}
              trailing={<Button label={copy("Göster", "Unhide")} tone="quiet" density="compact" disabled={!!pending} onPress={() => void change(group.id, false)} />}
              onPress={() => void change(group.id, false)}
            />
          ))}
          {view.hideable.map((group) => (
            <NavigationRow
              key={group.id}
              label={group.name}
              intent="command"
              icon={<Eye size={18} color={colors.muted} />}
              busy={pending === group.id}
              disabled={!!pending}
              trailing={<Button label={copy("Gizle", "Hide")} tone="quiet" density="compact" disabled={!!pending} onPress={() => void change(group.id, true)} />}
              onPress={() => void change(group.id, true)}
            />
          ))}
        </NavigationGroup>
      </View>
      <FormActions
        submitLabel={copy("Tüm grupları kilitle", "Lock all groups")}
        tone="default"
        onSubmit={() => void lockAll()}
        busy={locking}
        cancelLabel={copy("Bitti", "Done")}
        onCancel={onClose}
      />
    </Sheet>
  );
}

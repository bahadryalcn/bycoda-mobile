import { useRef, useState } from "react";
import { providerName } from "../workspace/provider-choices";
import { useActiveMachine } from "@/state/machines";
import {
  Body,
  Button,
  Disclosure,
  Field,
  Notice,
  SelectField,
  Sheet,
  ScopeLine,
  Stack,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../workspace/session-types";
import type { DesktopManagementReport } from "./provider-desktop-model";
import { ProviderAccountActions, ProviderAccountReview } from "./provider-account-actions";
import { useProviderAccountDelivery } from "./provider-account-delivery";
import { validateAccountChange, type AccountMetadataChange } from "./provider-account-draft";
export function ProviderAccountEditor({
  scope,
  projectId,
  report,
  account,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  report: DesktopManagementReport;
  account: DesktopManagementReport["accounts"][number];
  onClose: () => void;
}) {
  const copy = useCopy(),
    machine = useActiveMachine();
  const delivery = useProviderAccountDelivery(scope, projectId, report, account);
  const [review, setReview] = useState<AccountMetadataChange>(),
    [error, setError] = useState<unknown>();
  const { draft, busy, receipt } = delivery;
  const value = draft.value;
  const current = !!delivery.current();
  const canMetadata = !!machine?.capabilities?.includes("providers.desktop.metadata.v1");
  const canKind =
    canMetadata && !!machine?.capabilities?.includes("providers.desktop.accountKind.v1");
  const canQuota =
    account.provider === "claude" &&
    !!machine?.capabilities?.includes("providers.desktop.quotaRefresh.v1");
  const changeSupported =
    value?.kind === "quotaRefresh"
      ? canQuota
      : value?.kind === "accountKind"
        ? canKind
        : canMetadata;
  const [showSavedSettings, setShowSavedSettings] = useState(false);
  const wasAvailable = useRef(current);
  wasAvailable.current ||= current;
  const showFields =
    current ||
    wasAvailable.current ||
    showSavedSettings ||
    !!value?.pending ||
    !!value?.finished ||
    !!review ||
    !!receipt;
  const unavailableMessage = !machine
    ? copy(
        "Önce bu hesabın bilgisayarına bağlanın, ardından hesap ayarlarını yeniden açın.",
        "Connect this account's computer first, then reopen account settings.",
      )
    : machine.id !== scope.machineId || machine.environmentId !== report.environmentId
      ? copy(
          "Seçili bilgisayar bu hesapla eşleşmiyor. Doğru bilgisayarı ve projeyi seçip hesap ayarlarını yeniden açın.",
          "The selected computer does not match this account. Select the correct computer and project, then reopen account settings.",
        )
      : !machine.capabilities?.includes("providers.desktop.metadata.v1") &&
          !machine.capabilities?.includes("providers.desktop.quotaRefresh.v1")
        ? copy(
            "Bu bilgisayar hesap ayarlarını değiştirmeyi desteklemiyor. Bilgisayardaki bycoda’yı güncelleyin.",
            "This computer does not support account settings changes. Update bycoda on the computer.",
          )
        : copy(
            "Bu hesabın bağlantısı değişti veya kullanılamıyor. Bilgisayar bağlantısını kontrol edip hesap ayarlarını yeniden açın.",
            "This account's connection changed or is unavailable. Check the computer connection and reopen account settings.",
          );
  const disabled =
    !current || !draft.ready || !!draft.error || busy || !!value?.pending || !!value?.finished;
  return (
    <Sheet
      visible
      title={copy("Hesap görünen ayarları", "Account display settings")}
      size="compact"
      onClose={onClose}
      dismissible={!busy}
      dirty={!!value && !value.pending && !value.finished}
    >
      <Stack>
        <ScopeLine scope={{ computer: machine?.name }} />
        <Body>
          {providerName(account.provider)} · {account.label}
        </Body>
        {!current ? <Notice tone="warning" message={unavailableMessage} /> : null}
        {!showFields && value ? (
          <Button
            tone="quiet"
            label={copy("Kaydedilmiş ayarları göster", "Show saved settings")}
            onPress={() => setShowSavedSettings(true)}
          />
        ) : null}
        {showFields ? (
          <>
            {value ? (
              <>
                <SelectField
                  label={copy("Değişiklik", "Change")}
                  value={value.kind}
                  options={[
                    {
                      value: "rename",
                      disabled: !canMetadata,
                      label: copy("Görünen ad", "Display name"),
                    },
                    { value: "color", disabled: !canMetadata, label: copy("Renk", "Color") },
                    {
                      value: "accountKind",
                      disabled: !canKind,
                      label: copy("Hesap türü", "Account kind"),
                    },
                    {
                      value: "default",
                      disabled: !canMetadata,
                      label: copy(
                        "Gelecek konuşmalar için varsayılan",
                        "Default for future conversations",
                      ),
                    },
                    ...(account.provider === "claude" && (canQuota || value.kind === "quotaRefresh")
                      ? [
                          {
                            value: "quotaRefresh",
                            disabled: !canQuota,
                            label: copy("Claude kotasını yenile", "Refresh Claude quota"),
                          },
                        ]
                      : []),
                  ]}
                  disabled={disabled || !!review}
                  onChange={(kind) => draft.setValue({ ...value, kind: kind as typeof value.kind })}
                />
                {value.kind === "rename" ? (
                  <Field
                    label={copy("Görünen ad", "Display name")}
                    value={value.label}
                    maxLength={48}
                    editable={!disabled && canMetadata && !review}
                    onChangeText={(label) => draft.setValue({ ...value, label })}
                  />
                ) : value.kind === "color" ? (
                  <SelectField
                    label={copy("Renk", "Color")}
                    value={value.color ?? "auto"}
                    options={[
                      { value: "auto", label: copy("Otomatik", "Automatic") },
                      ...[
                        ["blue", copy("Mavi", "Blue")],
                        ["coral", copy("Mercan", "Coral")],
                        ["amber", copy("Kehribar", "Amber")],
                        ["green", copy("Yeşil", "Green")],
                        ["pink", copy("Pembe", "Pink")],
                        ["purple", copy("Mor", "Purple")],
                        ["teal", copy("Turkuaz", "Teal")],
                        ["slate", copy("Arduvaz", "Slate")],
                        ["orange", copy("Turuncu", "Orange")],
                      ].map(([color, label]) => ({ value: color, label })),
                    ]}
                    disabled={disabled || !canMetadata || !!review}
                    onChange={(color) =>
                      draft.setValue({ ...value, color: color === "auto" ? null : color })
                    }
                  />
                ) : value.kind === "accountKind" ? (
                  <SelectField
                    label={copy("Hesap türü", "Account kind")}
                    value={value.accountKind ?? "personal"}
                    options={[
                      { value: "personal", label: copy("Kişisel", "Personal") },
                      { value: "work", label: copy("İş", "Work") },
                    ]}
                    disabled={disabled || !canKind || !!review}
                    onChange={(kind) =>
                      draft.setValue({
                        ...value,
                        accountKind: kind === "work" ? "work" : "personal",
                      })
                    }
                  />
                ) : value.kind === "quotaRefresh" ? (
                  <Body muted>
                    {copy(
                      "Kota bir kez okunur; oturum açılmaz, kimlik yenilenmez. Hesap başına 5 dakika bekleme var.",
                      "Reads quota once; no sign-in or renewal. Five-minute cooldown per account.",
                    )}
                  </Body>
                ) : (
                  <Body muted>
                    {copy(
                      "Yeni konuşmalarda bu hesap kullanılır.",
                      "New conversations use this account.",
                    )}
                  </Body>
                )}
              </>
            ) : null}
            {current && !changeSupported && !value?.pending && !value?.finished ? (
              <Notice
                message={copy(
                  "Bu bilgisayar hesap ayarlarını değiştirmeyi desteklemiyor. Bilgisayardaki bycoda’yı güncelleyin.",
                  "This computer does not support account settings changes. Update bycoda on the computer.",
                )}
              />
            ) : null}
            <ProviderAccountReview
              review={value?.pending || value?.finished ? undefined : review}
            />
            <Disclosure label={copy("Bu ayarlar neyi değiştirir", "What these settings change")}>
              <Body muted>
                {copy(
                  "Ad ve renk bilgisayardaki hesap ayarlarını değiştirir. Varsayılan yalnız yeni konuşmalar içindir; açık konuşmalar hesabını korur.",
                  "Name and color change the computer's account settings. The default applies to new conversations only; open ones keep their account.",
                )}
              </Body>
              <Body muted>
                {copy(
                  "Kaydetmeden önce ayarlar yeniden kontrol edilir; başka pencerede yapılan değişiklikle çakışırsa kaydedilmez.",
                  "Settings are checked again before saving; a conflicting change from another window is not overwritten.",
                )}
              </Body>
            </Disclosure>
          </>
        ) : null}
      </Stack>
      <ProviderAccountActions
        value={value}
        review={review}
        applied={receipt?.state === "applied"}
        current={current}
        disabled={disabled || !changeSupported}
        busy={busy}
        error={error ?? delivery.error ?? draft.error}
        onClose={onClose}
        onCancelReview={() => setReview(undefined)}
        onConfirm={() => {
          if (review) void delivery.submit(review).catch(setError);
        }}
        onReconcile={() => {
          void delivery.reconcile();
        }}
        onReview={() => {
          try {
            if (!value || disabled || !changeSupported || !delivery.current()) return;
            setReview(
              validateAccountChange(
                value.kind === "rename"
                  ? { kind: "rename", label: value.label }
                  : value.kind === "color"
                    ? { kind: "color", color: value.color }
                    : value.kind === "accountKind"
                      ? { kind: "accountKind", accountKind: value.accountKind ?? "personal" }
                      : value.kind === "quotaRefresh"
                        ? { kind: "quotaRefresh", confirm: "REFRESH_PROVIDER_QUOTA" }
                        : { kind: "default", confirm: "DEFAULT_FOR_FUTURE_SESSIONS" },
              ),
            );
            setError(undefined);
          } catch (cause) {
            setError(cause);
          }
        }}
      />
    </Sheet>
  );
}

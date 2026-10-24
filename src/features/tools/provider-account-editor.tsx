import { useState } from "react";
import { useActiveMachine } from "@/state/machines";
import {
  Body,
  Button,
  ConfirmationCard,
  ErrorText,
  Field,
  Row,
  Notice,
  SelectField,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../workspace/session-types";
import type { DesktopManagementReport } from "./provider-desktop-model";
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
  const current = delivery.current();
  const disabled =
    !current || !draft.ready || !!draft.error || busy || !!value?.pending || !!value?.finished;
  return (
    <Sheet
      visible
      title={copy("Hesap görünen ayarları", "Account display settings")}
      size="form"
      onClose={onClose}
      dismissible={!busy}
      dirty={!!value && !value.pending && !value.finished}
      footer={
        <Row>
          <Button tone="quiet" label={copy("Kapat", "Close")} onPress={onClose} disabled={busy} />
          {value?.pending ? (
            <Button
              label={copy("Sonucu oku", "Read result")}
              onPress={() => {
                void delivery.reconcile();
              }}
              disabled={!current || busy}
            />
          ) : !value?.finished ? (
            <Button
              label={
                value?.kind === "quotaRefresh"
                  ? copy("İsteği incele", "Review request")
                  : copy("Değişiklikleri incele", "Review changes")
              }
              disabled={disabled || !!review}
              onPress={() => {
                try {
                  if (!value) return;
                  setReview(
                    validateAccountChange(
                      value.kind === "rename"
                        ? { kind: "rename", label: value.label }
                        : value.kind === "color"
                          ? { kind: "color", color: value.color }
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
          ) : null}
        </Row>
      }
    >
      <Stack>
        <Body>
          {machine?.name ? `${machine.name} · ` : ""}
          {account.provider} · {account.label}
        </Body>
        <Notice
          message={copy(
            "Görünen ad ve renk bilgisayardaki hesap ayarlarını değiştirir. Varsayılan seçimi yalnız gelecekteki konuşmalar içindir; açık konuşmaların hesabı değişmez.",
            "Display name and color change the computer's account settings. The default applies only to future conversations; open conversations keep their accounts.",
          )}
        />
        <Body muted>
          {copy(
            "Kaydetme diğer masaüstü pencereleri arasında atomik değildir; ayarlar kaydetmeden önce tekrar kontrol edilir.",
            "Saving is not atomic across desktop windows; settings are checked again before saving.",
          )}
        </Body>
        {!current ? (
          <Notice
            message={copy(
              "Bu hesabın bilgisayarını ve projesini yeniden açın veya bycoda’yı güncelleyin.",
              "Reopen this account's computer and project, or update bycoda.",
            )}
          />
        ) : null}
        {value ? (
          <>
            <SelectField
              label={copy("Değişiklik", "Change")}
              value={value.kind}
              options={[
                { value: "rename", label: copy("Görünen ad", "Display name") },
                { value: "color", label: copy("Renk", "Color") },
                {
                  value: "default",
                  label: copy(
                    "Gelecek konuşmalar için varsayılan",
                    "Default for future conversations",
                  ),
                },
                ...(account.provider === "claude" &&
                machine?.capabilities?.includes("providers.desktop.quotaRefresh.v1")
                  ? [
                      {
                        value: "quotaRefresh",
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
                editable={!disabled && !review}
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
                disabled={disabled || !!review}
                onChange={(color) =>
                  draft.setValue({ ...value, color: color === "auto" ? null : color })
                }
              />
            ) : value.kind === "quotaRefresh" ? (
              <Notice
                message={copy(
                  "Bilgisayar Claude kotasını bir kez sorgular. Oturum açılmaz veya kimlik yenilenmez; otomatik tekrar yoktur. Hesap başına beş dakika bekleme uygulanır.",
                  "The computer reads Claude quota once. It does not sign in or renew authentication, and does not retry automatically. Each account has a five-minute cooldown.",
                )}
              />
            ) : (
              <Body>
                {copy(
                  "Bu hesap bundan sonra yeni konuşmalarda varsayılan olacak.",
                  "This account will be the default for new conversations.",
                )}
              </Body>
            )}
            {value.pending ? (
              <Notice
                tone="warning"
                message={copy(
                  "Kaydedilen işlemin yalnız sonucu okunur; istek yeniden gönderilmez.",
                  "Only the saved operation's result is read; the request is never resent.",
                )}
              />
            ) : null}
            {value.finished ? (
              <Notice
                message={
                  receipt?.state === "applied" && value.kind === "quotaRefresh"
                    ? copy(
                        "Kota gözlemi tamamlandı. Sonucu güncellenen hesap listesinde görün.",
                        "Quota observation completed. View the result in the refreshed account list.",
                      )
                    : receipt?.state === "applied"
                      ? copy(
                          "Hesap ayarları kaydedildi. Yeni bir değişiklik için güncel listeyi yeniden açın.",
                          "Account settings saved. Reopen the refreshed list for another change.",
                        )
                      : copy(
                          "Değişiklik uygulanamadı. Güncel listeyi açıp yeniden inceleyin.",
                          "The change could not be applied. Open the refreshed list and review again.",
                        )
                }
              />
            ) : null}
          </>
        ) : null}
        <ErrorText error={error ?? delivery.error ?? draft.error} />
        {review ? (
          <ConfirmationCard
            message={
              review.kind === "quotaRefresh"
                ? copy(
                    "Bu hesabın Claude kotası bilgisayardan bir kez sorgulansın mı?",
                    "Read this account's Claude quota once from the computer?",
                  )
                : review.kind === "default"
                  ? copy(
                      "Bu hesabı bu sağlayıcının gelecekteki konuşmaları için varsayılan yap?",
                      "Make this account the default for this provider's future conversations?",
                    )
                  : copy(
                      "İncelenen hesap ayarını bilgisayara kaydet?",
                      "Save the reviewed account setting on the computer?",
                    )
            }
            confirmLabel={
              review.kind === "quotaRefresh"
                ? copy("Kotayı yenile", "Refresh quota")
                : copy("Kaydet", "Save")
            }
            cancelLabel={copy("Vazgeç", "Cancel")}
            busy={busy}
            disabled={disabled}
            onCancel={() => setReview(undefined)}
            onConfirm={() => {
              void delivery.submit(review).catch(setError);
            }}
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}

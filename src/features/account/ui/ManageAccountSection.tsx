import { useLocale } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Body, Button, ErrorNotice, NavigationGroup, NavigationRow, Notice, Section, Separator, Stack } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { DELETION_GRACE_DAYS } from "../contracts";
import { useAccount } from "./account-context";

export const DELETE_ACCOUNT_URL = "https://account.bycoda.codes/delete";

/** Notification settings, export/delete in the portal, and in-app deletion with its 14-day grace. */
export function ManageAccountSection() {
  const copy = useCopy();
  const locale = useLocale();
  const { runtime, device } = useAccount();
  const queries = useQueryClient();
  const me = useQuery({
    queryKey: ["account", "me"],
    queryFn: () => runtime!.client.getMe(),
    enabled: !!runtime && !!device,
  });
  const refresh = () => queries.invalidateQueries({ queryKey: ["account", "me"] });
  const request = useMutation({
    mutationFn: () => runtime!.client.requestDeletion({ body: {} }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => runtime!.client.cancelDeletion(),
    onSuccess: refresh,
  });
  const portal = useMutation({ mutationFn: () => WebBrowser.openBrowserAsync(DELETE_ACCOUNT_URL) });
  const pending = me.data?.user.deletion ?? null;
  const scheduled = pending ? new Date(pending.purgeAfter).toLocaleDateString(locale) : "";

  return (
    <Section title={copy("Hesabı yönet veya sil", "Manage or delete account")}>
      <Stack>
        <NavigationGroup>
          <NavigationRow
            label={copy("Bildirim ayarları", "Notification settings")}
            onPress={() => router.push("/account-notifications" as Href)}
          />
        </NavigationGroup>
        <ErrorNotice error={portal.error} message={copy("Sayfa açılamadı.", "The page could not be opened.")} />
        <Button
          label={copy("Hesap portalında yönet", "Manage in account portal")}
          tone="secondary"
          busy={portal.isPending}
          disabled={portal.isPending}
          onPress={() => portal.mutate()}
        />
        <Separator />
        {pending ? (
          <>
            <Notice
              tone="warning"
              message={copy(
                "Hesabın {p0} tarihinde kalıcı olarak silinecek. O zamana kadar silmeyi iptal edebilirsin.",
                "Your account will be permanently deleted on {p0}. You can cancel until then.",
                { p0: scheduled },
              )}
            />
            <ErrorNotice error={cancel.error} message={copy("Silme iptal edilemedi.", "Deletion could not be cancelled.")} />
            <Button
              label={copy("Hesap silmeyi iptal et", "Cancel account deletion")}
              tone="secondary"
              busy={cancel.isPending}
              disabled={cancel.isPending}
              onPress={() => cancel.mutate()}
            />
          </>
        ) : (
          <>
            <Body muted>
              {copy(
                "Silme isteği {p0} günlük bir bekleme süresi başlatır; bu sürede iptal edebilirsin. Veri dışa aktarımı hesap portalında da bulunur.",
                "A deletion request starts a {p0}-day grace period in which you can cancel it. Data export is also available in the account portal.",
                { p0: String(DELETION_GRACE_DAYS) },
              )}
            </Body>
            <ErrorNotice error={request.error} message={copy("Silme isteği gönderilemedi.", "The deletion request could not be sent.")} />
            <Button
              label={copy("Hesabı uygulamada sil", "Delete account in the app")}
              tone="danger"
              busy={request.isPending}
              disabled={request.isPending || !me.data}
              onPress={() =>
                confirmAction(
                  copy("Hesap silinsin mi?", "Delete your account?"),
                  copy(
                    "Hesabın, cihazların ve aktif süre kayıtların {p0} günlük bekleme süresinin ardından kalıcı olarak silinir. Bu sürede silmeyi iptal edebilirsin. Bilgisayar eşlemeleri ve yerel veriler bu telefonda kalır.",
                    "Your account, devices and active-time records are permanently deleted after a {p0}-day grace period. You can cancel during that time. Computer pairings and local data stay on this phone.",
                    { p0: String(DELETION_GRACE_DAYS) },
                  ),
                  copy("Silme isteği gönder", "Request deletion"),
                  () => request.mutate(),
                  copy("Vazgeç", "Cancel"),
                )
              }
            />
          </>
        )}
      </Stack>
    </Section>
  );
}

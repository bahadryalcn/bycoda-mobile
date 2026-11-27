import { useLocale } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { ErrorNotice, NavigationGroup, NavigationRow, Notice, SettingIcon, Stack } from "@/ui/primitives";
import ExternalLink from "lucide-react-native/icons/external-link";
import Trash2 from "lucide-react-native/icons/trash-2";
import Undo2 from "lucide-react-native/icons/undo-2";
import { HintSection } from "@/ui/info-hint";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { DELETION_GRACE_DAYS } from "../contracts";
import { useAccount } from "./account-context";
import { useAccountMe } from "./use-account-me";

export const DELETE_ACCOUNT_URL = "https://account.bycoda.codes/delete";

/** Notification settings, export/delete in the portal, and in-app deletion with its 14-day grace. */
export function ManageAccountSection() {
  const copy = useCopy();
  const locale = useLocale();
  const { runtime } = useAccount();
  const queries = useQueryClient();
  const me = useAccountMe();
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
    <HintSection
      title={copy("Hesabı yönet veya sil", "Manage or delete account")}
      help={copy(
        "Silme isteği {p0} günlük bir bekleme süresi başlatır; bu sürede iptal edebilirsin. Veri dışa aktarımı hesap portalında da bulunur.",
        "A deletion request starts a {p0}-day grace period in which you can cancel it. Data export is also available in the account portal.",
        { p0: String(DELETION_GRACE_DAYS) },
      )}
    >
      <Stack>
        <ErrorNotice error={portal.error} message={copy("Sayfa açılamadı.", "The page could not be opened.")} />
        {pending ? (
          <Notice
            tone="warning"
            message={copy(
              "Hesabın {p0} tarihinde kalıcı olarak silinecek. O zamana kadar silmeyi iptal edebilirsin.",
              "Your account will be permanently deleted on {p0}. You can cancel until then.",
              { p0: scheduled },
            )}
          />
        ) : null}
        <ErrorNotice error={pending ? cancel.error : request.error} message={pending
          ? copy("Silme iptal edilemedi.", "Deletion could not be cancelled.")
          : copy("Silme isteği gönderilemedi.", "The deletion request could not be sent.")} />
        <NavigationGroup>
          <NavigationRow
            intent="command"
            icon={<SettingIcon glyph={ExternalLink} />}
            label={copy("Hesap portalında dışa aktar veya sil", "Export or delete in account portal")}
            busy={portal.isPending}
            disabled={portal.isPending}
            onPress={() => portal.mutate()}
          />
          {pending ? (
            <NavigationRow
              intent="command"
              icon={<SettingIcon glyph={Undo2} />}
              label={copy("Hesap silmeyi iptal et", "Cancel account deletion")}
              busy={cancel.isPending}
              disabled={cancel.isPending}
              onPress={() => cancel.mutate()}
            />
          ) : (
            <NavigationRow
              intent="command"
              tone="danger"
              icon={<SettingIcon glyph={Trash2} tone="danger" />}
              label={copy("Hesabı sil", "Delete account")}
              // The request needs the loaded profile; a dimmed row says why it is waiting.
              detail={me.data ? undefined : me.error
                ? copy("Hesap bilgisi alınamadı.", "Account details could not be loaded.")
                : copy("Hesap bilgisi yükleniyor…", "Loading account details…")}
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
          )}
        </NavigationGroup>
      </Stack>
    </HintSection>
  );
}

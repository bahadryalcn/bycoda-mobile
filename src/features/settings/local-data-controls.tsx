import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import Animated from "react-native-reanimated";
import ShieldOff from "lucide-react-native/icons/shield-off";
import UserX from "lucide-react-native/icons/user-x";
import Trash2 from "lucide-react-native/icons/trash";
import type { ReactNode } from "react";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { colors, space } from "../../ui/tokens";
import { useMachines } from "../../state/machines";
import { assertAppAccess } from "../../state/security";
import { useAsyncAction } from "../../state/actions";
import {
  Body,
  ConfirmationCard,
  Disclosure,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Sheet,
  Stack,
} from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { revokeProviderConsent } from "../privacy/provider-consent";
import { deleteSavedDrafts, disconnectSavedComputers } from "./local-data";
import { clearAttachmentDraftFiles } from "../workspace/attachment-files";
import { clearMediaCache } from "@/ui/media-loader";

function tile(Glyph: typeof Trash2, color: string): ReactNode {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function LocalDataControls() {
  const copy = useCopy();
  const state = useMachines();
  const cache = useQueryClient();
  const action = useAsyncAction<{ message: string }>();
  const [confirmation, setConfirmation] = useState<"connections" | "drafts" | "consent" | null>(
    null,
  );
  const unavailable =
    !state.hydrated || !!state.storageError || state.connectionPending || action.isPending;
  async function perform() {
    const target = confirmation;
    await action.run(async () => {
      assertAppAccess();
      if (target === "connections") {
        await disconnectSavedComputers({
          ready: () => {
            assertAppAccess();
            const latest = useMachines.getState();
            return latest.hydrated && !latest.storageError && !latest.connectionPending;
          },
          ids: () => useMachines.getState().machines.map((machine) => machine.id),
          flush: flushWorkspaceDrafts,
          cancelQueries: () => cache.cancelQueries({ queryKey: ["machine"] }),
          remove: (id) => useMachines.getState().removeMachine(id),
        });
        cache.removeQueries({ queryKey: ["machine"] });
      } else if (target === "drafts") {
        await flushWorkspaceDrafts();
        assertAppAccess();
        await deleteSavedDrafts(AsyncStorage, () => useMachines.getState().machines.length > 0);
        assertAppAccess();
        if (useMachines.getState().machines.length > 0) throw new Error(copy("Taslakları silmeden önce bilgisayar bağlantılarını kaldırın.", "Disconnect computers before deleting saved drafts."));
        clearAttachmentDraftFiles();
        clearMediaCache();
      } else if (target === "consent") {
        await flushWorkspaceDrafts();
        await cache.cancelQueries({ queryKey: ["machine"] });
        assertAppAccess();
        await revokeProviderConsent();
      } else return { message: "" };
      setConfirmation(null);
      return {
        message:
          target === "connections"
            ? copy(
                "Kaydedilmiş bilgisayarlar ve bu telefondaki bağlantı anahtarları kaldırıldı. Taslakların saklandı.",
                "Saved computers and connection keys on this phone were removed. Your drafts were retained.",
              )
            : target === "drafts"
              ? copy(
                  "Bu telefondaki kaydedilmiş mesaj, dosya ve not taslakları silindi.",
                  "Saved message, file and note drafts on this phone were deleted.",
                )
              : copy("Veri paylaşımı izni geri çekildi.", "Data sharing permission was withdrawn."),
      };
    });
  }
  return (
    <Stack style={{ gap: space.lg }}>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Veri paylaşımı iznini geri çek", "Withdraw data sharing permission")}
            icon={tile(ShieldOff, colors.warning)}
            disabled={unavailable}
            onPress={() => {
              action.reset();
              setConfirmation("consent");
            }}
          />
        </NavigationGroup>
      </Animated.View>
      <Animated.View entering={enterItem(1)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Kaydedilmiş bilgisayarları kaldır", "Remove saved computers")}
            tone="danger"
            icon={tile(UserX, colors.danger)}
            disabled={unavailable || !state.machines.length}
            onPress={() => {
              action.reset();
              setConfirmation("connections");
            }}
          />
          <NavigationRow
            label={copy("Kaydedilmiş taslakları sil", "Delete saved drafts")}
            tone="danger"
            icon={tile(Trash2, colors.danger)}
            disabled={unavailable || state.machines.length > 0}
            onPress={() => {
              action.reset();
              setConfirmation("drafts");
            }}
          />
        </NavigationGroup>
      </Animated.View>
      <Disclosure label={copy("Bu telefondaki veriler", "Data on this phone")}>
        <Body muted>
          {copy(
            "bycoda hesabı açılmaz. Bilgisayar bağlantılarını ve telefonda saklanan taslaklarını buradan yönetebilirsin. Bilgisayarındaki dosyalar, oturumlar, çalışan işler ve sağlayıcı hesapları ayrı yönetilir.",
            "There is no bycoda account. Manage your saved computer connections and drafts on this phone here. Computer files, sessions, running work and provider accounts are managed separately.",
          )}
        </Body>
        <Body muted>
          {copy(
            "Taslakları silmeden önce tüm bilgisayar bağlantılarını kaldır. Bir bağlantıyı telefondan kaldırmak host üzerindeki erişim iznini iptal etmez; kayıp telefon için bilgisayardaki cihaz yetkisini ayrıca iptal et.",
            "Remove all saved computers before deleting drafts. Removing a phone connection does not revoke its host authorization; revoke the device on your computer separately if your phone is lost.",
          )}
        </Body>
      </Disclosure>
      {confirmation ? (
        <Sheet visible size="compact" dismissible={!action.isPending} title={copy("Yerel verileri yönet", "Manage local data")} onClose={() => { if (!action.isPending) setConfirmation(null); }}>
        <ConfirmationCard
          message={
            confirmation === "connections"
              ? copy(
                  "Tüm kayıtlı bilgisayarlar ve bağlantı anahtarları yalnız bu telefondan kaldırılacak. Yeniden bağlanman gerekecek. Kaydedilmiş taslaklar kalır.",
                  "All saved computers and connection keys will be removed from this phone. You will need to connect again. Saved drafts remain.",
                )
              : confirmation === "drafts"
                ? copy(
                    "Telefonda kaydedilmiş mesaj, dosya ve not taslakları kalıcı silinecek. Gönderilmeyen değişiklikleri önce yedekle.",
                    "Saved message, file and note drafts on this phone will be permanently deleted. Back up unsent changes first.",
                  )
                : copy(
                    "Bu telefondan çalışma alanına erişim, tekrar izin verene kadar kapanacak. Bilgisayarında zaten çalışan işler ve sağlayıcıya daha önce gönderilen veriler bundan etkilenmez.",
                    "Workspace access from this phone will pause until you grant permission again. Work already running on your computer and data already sent to providers are unaffected.",
                  )
          }
          cancelLabel={copy("Vazgeç", "Cancel")}
          confirmLabel={
            confirmation === "consent"
              ? copy("İzni geri çek", "Withdraw permission")
              : confirmation === "drafts"
                ? copy("Taslakları sil", "Delete drafts")
                : copy("Bilgisayarları kaldır", "Remove computers")
          }
          busy={action.isPending}
          disabled={unavailable}
          onCancel={() => {
            if (!action.isPending) setConfirmation(null);
          }}
          onConfirm={() => {
            void perform();
          }}
        />
        <MutationState mutation={action} />
        </Sheet>
      ) : null}
      <MutationState
        mutation={action}
        pending={copy("Yerel veriler güncelleniyor…", "Updating local data…")}
        success={action.data?.message}
      />
    </Stack>
  );
}

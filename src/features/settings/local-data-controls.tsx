import { useLayoutEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated from "react-native-reanimated";
import ShieldOff from "lucide-react-native/icons/shield-off";
import UserX from "lucide-react-native/icons/user-x";
import Trash2 from "lucide-react-native/icons/trash";
import type { ReactNode } from "react";
import { IconTile } from "../../ui/icon-tile";
import { useInfoHint } from "../../ui/info-hint";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useMachines, withDisconnectedComputers } from "../../state/machines";
import { assertAppAccess } from "../../state/security";
import { useAsyncAction } from "../../state/actions";
import {
  Body,
  Button,
  Skeleton,
  FormActions,
  Notice,
  ScreenList,
  SectionHeader,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Sheet,
  Stack,
  StateView,
} from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { revokeProviderConsent } from "../privacy/provider-consent";
import { deleteSavedDrafts, disconnectSavedComputers, matchesReviewedComputers } from "./local-data";
import { LocalDataCaches } from "./local-data-caches";
import { clearAttachmentDraftFiles } from "../workspace/attachment-files";
import { clearMediaCache } from "@/ui/media-loader";

import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { RecordCard } from "@/ui/record-card";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useMobileTheme } from "../../ui/theme";

type CleanupReview = { kind: "connections" | "drafts" | "consent"; machines: (ReviewedMachine & { name: string })[] };

function tile(Glyph: typeof Trash2, color: string): ReactNode {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function LocalDataControls() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const state = useMachines();
  const deleteDraftsLabel = copy("Kaydedilmiş taslakları sil", "Delete saved drafts");
  const draftDeletionReason =
    state.machines.length > 0
      ? copy(
          "Taslakları silmeden önce bilgisayar bağlantılarını kaldırın.",
          "Disconnect computers before deleting saved drafts.",
        )
      : undefined;
  const cache = useQueryClient();
  const action = useAsyncAction<{ message: string; retained?: number }>();
  const [executing, setExecuting] = useState(false);
  const busy = action.isPending || executing;
  const { requestCloseThen } = useSheetGuard({ pending: busy });
  const [confirmation, setConfirmation] = useState<CleanupReview | null>(null);
  const mounted = useRef(true), working = useRef(false), retired = useRef<CleanupReview | null>(null);
  const latest = useRef(confirmation); latest.current = confirmation;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (confirmation && ((confirmation.kind === "connections" && !matchesReviewedComputers(confirmation.machines, state.machines)) || (confirmation.kind === "drafts" && state.machines.length > 0))) retired.current = confirmation;
  const stale = !!confirmation && retired.current === confirmation;
  const unavailable = !state.hydrated || !!state.storageError || state.connectionPending || busy;
  const openReview = (kind: CleanupReview["kind"]) => {
    const current = useMachines.getState();
    if (working.current || !mounted.current || !current.hydrated || current.storageError || current.connectionPending ||
      (kind === "drafts" && current.machines.length > 0) || (kind === "connections" && !current.machines.length)) return;
    action.reset(); retired.current = null;
    const review = { kind, machines: current.machines.map(machine => ({ ...reviewedMachine(machine)!, name: machine.name })) };
    latest.current = review; setConfirmation(review);
  };
  const closeReview = () => {
    if (working.current || action.isPending) return;
    latest.current = null; setConfirmation(null); action.reset();
  };
  async function perform() {
    const review = confirmation;
    if (!review || !mounted.current || latest.current !== review || working.current || unavailable || retired.current === review) return;
    working.current = true; setExecuting(true);
    const target = review.kind;
    let retainedDrafts = 0;
    try { await action.run(async () => {
      if (!mounted.current || latest.current !== review) throw new Error("Reopen the local data review before continuing.");
      assertAppAccess();
      if (target === "connections") {
        await disconnectSavedComputers({
          ready: () => {
            assertAppAccess();
            const latest = useMachines.getState();
            return latest.hydrated && !latest.storageError && !latest.connectionPending;
          },
          reviewed: review.machines,
          current: () => useMachines.getState().machines,
          flush: flushWorkspaceDrafts,
          cancelQueries: async () => { await Promise.all(review.machines.map(machine => cache.cancelQueries({ queryKey: ["machine", machine.id] }))); },
          remove: async (id, expected) => {
            await useMachines.getState().removeMachine(id, expected);
            if (!useMachines.getState().machines.some(machine => machine.id === id)) cache.removeQueries({ queryKey: ["machine", id] });
          },
        });
      } else if (target === "drafts") {
        await flushWorkspaceDrafts();
        await withDisconnectedComputers(async () => {
          assertAppAccess();
          const result = await deleteSavedDrafts(AsyncStorage, () => useMachines.getState().machines.length > 0, scopes => {
            assertAppAccess(); clearAttachmentDraftFiles(scopes); clearMediaCache();
          });
          retainedDrafts = result.retained;
          assertAppAccess();
        });
      } else if (target === "consent") {
        await flushWorkspaceDrafts();
        await cache.cancelQueries({ queryKey: ["machine"] });
        assertAppAccess();
        await revokeProviderConsent();
      } else return { message: "" };
      if (mounted.current && latest.current === review) { latest.current = null; setConfirmation(null); }
      return {
        retained: target === "drafts" ? retainedDrafts : undefined,
        message:
          target === "connections"
            ? copy(
                "Kaydedilmiş bilgisayarlar ve bu telefondaki bağlantı anahtarları kaldırıldı. Taslakların saklandı.",
                "Saved computers and connection keys on this phone were removed. Your drafts were retained.",
              )
            : target === "drafts" && retainedDrafts > 0
              ? copy("Taslak temizliği tamamlandı. Bekleyen veya okunamayan mesaj taslakları kurtarma için saklandı.", "Draft cleanup finished. Pending or unreadable message drafts were kept for recovery.")
              : target === "drafts"
              ? copy(
                  "Bu telefondaki kaydedilmiş mesaj, dosya ve not taslakları silindi.",
                  "Saved message, file and note drafts on this phone were deleted.",
                )
              : copy("Veri paylaşımı izni geri çekildi.", "Data sharing permission was withdrawn."),
      };
    }); } finally { working.current = false; if (mounted.current) setExecuting(false); }
  }
  const consequence = confirmation ? confirmation.kind === "connections"
                ? copy(
                    "Tüm kayıtlı bilgisayarlar ve bağlantı anahtarları yalnız bu telefondan kaldırılacak. Yeniden bağlanman gerekecek. Kaydedilmiş taslaklar kalır.",
                    "All saved computers and connection keys will be removed from this phone. You will need to connect again. Saved drafts remain.",
                  )
                : confirmation.kind === "drafts"
                  ? copy(
                      "Telefonda kaydedilmiş mesaj, dosya ve not taslakları kalıcı silinecek. Gönderilmeyen değişiklikleri önce yedekle.",
                      "Saved message, file and note drafts on this phone will be permanently deleted. Back up unsent changes first.",
                    )
                  : copy(
                      "Bu telefondan çalışma alanına erişim, tekrar izin verene kadar kapanacak. Bilgisayarında zaten çalışan işler ve sağlayıcıya daha önce gönderilen veriler bundan etkilenmez.",
                      "Workspace access from this phone will pause until you grant permission again. Work already running on your computer and data already sent to providers are unaffected.",
                    ) : "";
  const storageIssue = !state.hydrated || (state.connectionPending && !busy)
    ? <Skeleton label={copy("Kaydedilmiş bağlantılar yükleniyor…", "Loading saved connections…")} />
    : state.storageError ? <StateView compact tone="warning" illustration="error" title={copy("Kaydedilmiş bağlantılar kullanılamıyor", "Saved connections are unavailable")} description={copy("Yeniden yüklemek için Bilgisayarlar’ı açın.", "Open Computers to reload them.")} action={{ label: copy("Bilgisayarlar", "Computers"), busy, onPress: () => requestCloseThen(() => router.navigate("/machines")) }} /> : null;
  const longReview = confirmation?.kind === "connections" && confirmation.machines.length > 6;
  const sectionHelp = copy(
    "Kayıtlı bilgisayarlar ve taslaklar yalnız bu telefonda tutulur. Telefondan kaldırmak bilgisayardaki cihaz iznini iptal etmez; telefon kaybolursa onu bilgisayardan ayrıca iptal et.",
    "Saved computers and drafts stay on this phone. Removing them here does not revoke the device on your computer; if this phone is lost, revoke it there.",
  );
  const sectionInfo = useInfoHint(sectionHelp);
  const remainingComputers = confirmation?.machines.filter(machine => state.machines.some(current => current.id === machine.id)) ?? [];
  const reviewIntro = <Stack>{storageIssue}<Body>{consequence}</Body>{stale ? <Notice tone="warning" message={copy("Kaydedilmiş bilgisayarlar değişti. Devam etmek için bu incelemeyi yeniden açın.", "Saved computers changed. Reopen this review to continue.")} /> : null}</Stack>;
  // Friendly identity only: internal computer and environment ids are never shown in this review.
  const computerRow = (item: CleanupReview["machines"][number]) => <RecordCard key={item.id} title={item.name} metadata={item.endpoint} />;
  return (
    <Stack style={{ gap: space.lg }}>
      <SectionHeader flush title={copy("Bu telefondaki veriler", "Data on this phone")} trailing={sectionInfo.button} />
      {sectionInfo.panel}
      {!confirmation ? storageIssue : null}
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Veri paylaşımı iznini geri çek", "Withdraw data sharing permission")}
            icon={tile(ShieldOff, colors.warning)}
            disabled={unavailable}
            onPress={() => {
              openReview("consent");
            }}
          />
        </NavigationGroup>
      </Animated.View>
      <LocalDataCaches />
      <Animated.View entering={enterItem(1)} style={{ gap: space.sm }}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Kaydedilmiş bilgisayarları kaldır", "Remove saved computers")}
            tone="danger"
            icon={tile(UserX, colors.danger)}
            disabled={unavailable || !state.machines.length}
            onPress={() => {
              openReview("connections");
            }}
          />
          <NavigationRow
            label={deleteDraftsLabel}
            accessibilityLabel={[deleteDraftsLabel, draftDeletionReason].filter(Boolean).join(". ")}
            tone="danger"
            icon={tile(Trash2, colors.danger)}
            disabled={unavailable || state.machines.length > 0}
            onPress={() => {
              openReview("drafts");
            }}
          />
        </NavigationGroup>
        {draftDeletionReason ? <Body muted>{draftDeletionReason}</Body> : null}
      </Animated.View>
      {confirmation ? (
        <Sheet visible size={longReview ? "form" : "compact"}
          scroll={!longReview} dismissible={!busy}
          title={confirmation.kind === "connections" ? copy("Kaydedilmiş bilgisayarları kaldır", "Remove saved computers") : confirmation.kind === "drafts" ? deleteDraftsLabel : copy("Veri paylaşımı iznini geri çek", "Withdraw data sharing permission")}
          onClose={closeReview}>
          {confirmation.kind === "connections" ? longReview ? <ScreenList
            data={remainingComputers} keyExtractor={machine => machine.id}
            header={reviewIntro} renderItem={({ item }) => computerRow(item)} />
            : <Stack>{reviewIntro}{remainingComputers.map(computerRow)}</Stack> : <Body>{consequence}</Body>}
          {confirmation.kind !== "connections" ? storageIssue : null}
          {confirmation.kind === "drafts" ? <Body muted>{copy("Bekleyen işlemler ve okunamayan mesaj taslakları kurtarma için saklanır. İncelemek için asıl bilgisayarı yeniden bağlayın.", "Pending operations and unreadable message drafts are kept for recovery. Reconnect the original computer to review them.")}</Body> : null}
          {stale && confirmation.kind !== "connections" ? <Notice tone="warning" message={copy("Kaydedilmiş bilgisayarlar değişti. Devam etmek için bu incelemeyi yeniden açın.", "Saved computers changed. Reopen this review to continue.")} /> : null}
          <FormActions submitLabel={confirmation.kind === "consent"
                ? copy("İzni geri çek", "Withdraw permission")
                : confirmation.kind === "drafts"
                  ? copy("Taslakları sil", "Delete drafts")
                  : copy("Bilgisayarları kaldır", "Remove computers")} tone="danger" cancelLabel={copy("Vazgeç", "Cancel")}
            busy={busy} disabled={unavailable || stale} onCancel={closeReview} onSubmit={() => { void perform(); }}
            feedback={<MutationState mutation={action} />} />
        </Sheet>
      ) : action.isSuccess && action.data?.retained ? <Stack><Notice tone="info" message={action.data.message} /><Button tone="quiet" label={copy("Bilgisayarlar", "Computers")} onPress={() => requestCloseThen(() => router.navigate("/machines"))} /></Stack> : <MutationState mutation={action} success={action.data?.message} />}

    </Stack>
  );
}

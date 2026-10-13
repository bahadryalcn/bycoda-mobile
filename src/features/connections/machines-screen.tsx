import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { BackHandler, View } from "react-native";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Laptop from "lucide-react-native/icons/laptop";
import Plus from "lucide-react-native/icons/plus";
import { useMachines } from "@/state/machines";
import { assertAppAccess } from "@/state/security";
import { Body, Button, Disclosure, ErrorNotice, IconButton, Loading, MutationState, NavigationGroup, NavigationRow, Screen, Sheet } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { LegalLinks } from "@/ui/brand";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { PairingEntry } from "./pairing-entry";
import { PairingScanner } from "./pairing-scanner";
import { reloadSavedConnections, selectSavedComputer } from "./recovery";
import { useComputerConnection } from "./use-computer-connection";

export function MachinesScreen() {
  const copy = useCopy();
  const focused = useIsFocused();
  const state = useMachines();
  const controller = useComputerConnection();
  const { operation, busy, recover } = controller;
  const [managing, setManaging] = useState<string | null>(null);
  const selected = state.machines.find((machine) => machine.id === managing);
  const adding = controller.form.values.target !== null;
  const unavailable = !state.hydrated || !!state.storageError || state.connectionPending;
  const insideEntry = controller.entry.kind !== "choices";
  const cancelEntry = () => {
    if (busy) return;
    if (!controller.form.dirty) { controller.cancel(); return; }
    confirmAction(
      copy("Değişiklikler kaydedilmedi", "Unsaved changes"),
      copy("Kaydedilmemiş değişiklikleri silmek istiyor musun?", "Discard your unsaved changes?"),
      copy("Değişiklikleri sil", "Discard changes"), controller.cancel,
      copy("Düzenlemeye devam et", "Keep editing"),
    );
  };
  useEffect(() => {
    if (!focused || !insideEntry || controller.entry.kind === "scan") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { cancelEntry(); return true; });
    return () => listener.remove();
  }, [focused, insideEntry, controller.entry.kind, busy, controller.form.dirty, controller.cancel]);

  if (controller.entry.kind === "scan") return <PairingScanner
    onCode={controller.readCode} onClose={controller.cancel} onPaste={() => controller.begin("paste")}
  />;

  const remove = (id: string, name: string) => {
    confirmAction(
      copy("Bilgisayarı kaldır", "Remove computer"),
      copy("{p0} bağlantısı bu telefondan kaldırılacak.", "Remove {p0} from this phone?", { p0: name }),
      copy("Kaldır", "Remove"),
      () => {
        setManaging(null);
        void recover(async () => {
          assertAppAccess();
          await flushWorkspaceDrafts();
          assertAppAccess();
          await useMachines.getState().removeMachine(id);
        }, copy("Bilgisayar bağlantısı kaldırıldı.", "Computer connection removed."));
      }, copy("Vazgeç", "Cancel"),
    );
  };
  return <Screen>
    <Stack.Screen options={{
      title: copy("Bilgisayarlar", "Computers"),
      gestureEnabled: !busy && !controller.form.dirty,
      headerLeft: insideEntry ? () => <IconButton label={copy("Geri", "Back")} disabled={busy} onPress={cancelEntry}><ChevronLeft size={22} color={colors.text} /></IconButton> : undefined,
    }} />
    <View style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg }}>
      {!state.hydrated && !state.storageError ? <Loading /> : null}
      <ErrorNotice error={state.storageError} retryLabel={copy("Depolamayı yeniden yükle", "Reload saved connections")} onRetry={() => {
        void recover(() => reloadSavedConnections({
          flushDrafts: flushWorkspaceDrafts, assertAccess: assertAppAccess,
          hydrate: () => useMachines.getState().hydrate(), getState: () => useMachines.getState(),
        }), copy("Kaydedilmiş bağlantılar yeniden yüklendi.", "Saved connections reloaded."));
      }} />
      <MutationState mutation={operation} success={operation.data?.message} />
      {!adding && state.machines.length ? <NavigationGroup>
        {state.machines.map((machine) => <NavigationRow
          key={machine.id} label={machine.name} detail={machine.endpoint}
          icon={<Laptop size={21} color={colors.muted} />}
          trailing={machine.id === state.activeId ? <Check size={18} color={colors.success} /> : undefined}
          disabled={unavailable || busy} onPress={() => setManaging(machine.id)}
        />)}
      </NavigationGroup> : null}
      {!adding && state.machines.length ? <Button label={copy("Bilgisayar ekle", "Add computer")} tone="primary" disabled={unavailable || busy} onPress={() => controller.begin("choices")}><Plus color={colors.primaryText} size={18} /></Button> : null}
      {adding || !state.machines.length ? <PairingEntry controller={{ ...controller, cancel: cancelEntry }} disabled={unavailable} /> : null}
      <Disclosure label={copy("Bağlantı kurulum yardımı", "Connection setup help")}>
        <Body muted>{copy(
          "Bilgisayarında bycoda’yı aç. Telefon bağlantısı bölümünden bir kod oluştur ve telefonunla tara.",
          "Open bycoda on your computer. Create a code in phone pairing and scan it with your phone.",
        )}</Body>
        <Button tone="quiet" label={copy("Yardım", "Help")} onPress={() => router.push("/legal/help")} />
        <LegalLinks onOpen={(document) => router.push({ pathname: "/legal/[document]", params: { document } })} />
      </Disclosure>
    </View>
    {selected ? <Sheet visible size="compact" title={selected.name} onClose={() => setManaging(null)} dismissible={!busy}>
      <Body muted>{selected.endpoint}</Body>
      <NavigationGroup>
        <NavigationRow label={selected.id === state.activeId ? copy("Seçili bilgisayar", "Selected computer") : copy("Seç", "Use computer")} disabled={unavailable || busy || selected.id === state.activeId} onPress={() => {
          void recover(() => selectSavedComputer(selected.id, {
            flushDrafts: flushWorkspaceDrafts, assertAccess: assertAppAccess,
            getState: () => useMachines.getState(),
            selectMachine: (id) => useMachines.getState().selectMachine(id),
            navigate: () => { setManaging(null); router.replace("/"); },
          }), copy("Bilgisayar seçildi.", "Computer selected."));
        }} />
        <NavigationRow label={copy("Bağlantıyı düzenle", "Edit connection")} disabled={unavailable || busy} onPress={() => { setManaging(null); controller.edit(selected); }} />
        <NavigationRow label={copy("Kaldır", "Remove")} tone="danger" disabled={unavailable || busy} onPress={() => remove(selected.id, selected.name)} />
      </NavigationGroup>
      <MutationState mutation={operation} />
    </Sheet> : null}
  </Screen>;
}


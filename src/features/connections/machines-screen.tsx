import { ConnectionFeedback } from "./connection-feedback";
import { useMobileTheme } from "@/ui/theme";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { router, Stack } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { BackHandler, View } from "react-native";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Laptop from "lucide-react-native/icons/laptop";
import Plus from "lucide-react-native/icons/plus";
import { IconTile } from "@/ui/icon-tile";
import { useLocale } from "@/i18n";
import { useScreenChrome } from "@/ui/layout";
import { ScreenList } from "@/ui/screen-list";
import { matchesSearch } from "@/ui/search-matching";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { useMachines } from "@/state/machines";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { assertAppAccess } from "@/state/security";
import { Body, Button, Disclosure, ErrorNotice, FormActions, IconButton, Loading, NavigationGroup, NavigationRow, Notice, QueryState, Screen, SearchField, Sheet } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { LegalLinks } from "@/ui/brand";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { PairingEntry } from "./pairing-entry";
import { PairingScanner } from "./pairing-scanner";
import { matchesSavedComputer, removeSavedComputer, reloadSavedConnections, selectSavedComputer } from "./recovery";
import { useComputerConnection } from "./use-computer-connection";

export function MachinesScreen() {
  useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const { nativeTitle } = useScreenChrome();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const focused = useIsFocused();
  const state = useMachines();
  const controller = useComputerConnection();
  const { operation, busy, recover } = controller;
  const [managing, setManaging] = useState<string | null>(null);
  const selected = state.machines.find((machine) => machine.id === managing);
  const [removal, setRemoval] = useState<(ReviewedMachine & { name: string }) | null>(null);
  const retiredRemoval = useRef(false);
  const removalMatches = !removal || matchesSavedComputer(removal, state);
  useLayoutEffect(() => { if (removal && !removalMatches) retiredRemoval.current = true; }, [removal, removalMatches]);
  const staleRemoval = !!removal && (!removalMatches || retiredRemoval.current);
  const closeManagement = () => { if (!busy) { retiredRemoval.current = true; setRemoval(null); setManaging(null); } };
  useLayoutEffect(() => () => { retiredRemoval.current = true; }, []);
  const adding = controller.form.values.target !== null;
  const unavailable = !state.hydrated || !!state.storageError || state.connectionPending;
  const showPairing = adding || !state.machines.length;
  const entryOwnsFeedback = showPairing && (controller.entry.kind === "manual" || controller.entry.kind === "preview");
  const insideEntry = controller.entry.kind !== "choices";
  const entryActive = adding || insideEntry;
  const visible = state.machines.filter(machine => matchesSearch(`${machine.name} ${machine.endpoint}`, search, locale));
  const listMemory = useFilteredListScrollMemory<(typeof state.machines)[number]>(search, !showPairing, visible.length, { suspended: showPairing });
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
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
    if (!focused || !entryActive || controller.entry.kind === "scan") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { cancelEntry(); return true; });
    return () => listener.remove();
  }, [focused, entryActive, controller.entry.kind, busy, controller.form.dirty, controller.cancel]);

  if (controller.entry.kind === "scan") return <PairingScanner
    onCode={controller.readCode} onClose={controller.cancel} onPaste={() => controller.begin("paste")}
  />;

  const feedback = <>
    {!state.hydrated && !state.storageError ? <Loading /> : null}
    <ErrorNotice error={state.storageError} retryLabel={copy("Depolamayı yeniden yükle", "Reload saved connections")} onRetry={() => {
      void recover(() => reloadSavedConnections({
        flushDrafts: flushWorkspaceDrafts, assertAccess: assertAppAccess,
        hydrate: () => useMachines.getState().hydrate(), getState: () => useMachines.getState(),
      }), copy("Kaydedilmiş bağlantılar yeniden yüklendi.", "Saved connections reloaded."));
    }} />
    {!selected && !removal && !entryOwnsFeedback ? <ConnectionFeedback operation={operation} success={operation.data?.message} /> : null}
  </>;
  const help = <Disclosure label={copy("Bağlantı kurulum yardımı", "Connection setup help")}>
    <Body muted>{copy(
      "Bilgisayarında bycoda’yı aç. Telefon bağlantısı bölümünden bir kod oluştur ve telefonunla tara.",
      "Open bycoda on your computer. Create a code in phone pairing and scan it with your phone.",
    )}</Body>
    <Button tone="quiet" label={copy("Yardım", "Help")} onPress={() => router.push("/legal/help")} />
    <LegalLinks onOpen={(document) => router.push({ pathname: "/legal/[document]", params: { document } })} />
  </Disclosure>;
  const addAction = !adding && !insideEntry && state.machines.length ? <IconButton label={copy("Bilgisayar ekle", "Add computer")} disabled={unavailable || busy} onPress={() => controller.begin("choices")}><Plus size={22} strokeWidth={2.2} color={colors.accent} /></IconButton> : undefined;
  return <Screen scroll={showPairing} title={showPairing ? copy("Bilgisayarlar", "Computers") : undefined}
    actions={!nativeTitle && showPairing && entryActive ? <IconButton label={copy("Geri", "Back")} disabled={busy} onPress={cancelEntry}><ChevronLeft size={22} color={colors.text} /></IconButton> : undefined}>
    <Stack.Screen options={{
      title: copy("Bilgisayarlar", "Computers"),
      gestureEnabled: !entryActive && !busy && !controller.form.dirty,
      headerLeft: entryActive ? () => <IconButton label={copy("Geri", "Back")} disabled={busy} onPress={cancelEntry}><ChevronLeft size={22} color={colors.text} /></IconButton> : undefined,
      headerRight: addAction ? () => addAction : undefined,
    }} />
    {!showPairing ? <ScreenList
      {...listMemory.listProps}
      title={copy("Bilgisayarlar", "Computers")} actions={!nativeTitle ? addAction : undefined}
      grouped data={visible} keyExtractor={machine => machine.id}
      contentContainerStyle={{ maxWidth: metrics.entryWidth }}
      header={<>{feedback}
        {state.machines.length > 5 || search ? <SearchField ref={searchInput} label={copy("Ara", "Search")} value={search} onChangeText={setSearch} /> : null}
        <QueryState query={{data:visible, isPending:false, isSuccess:true}} empty={!unavailable && !busy && !!search.trim() && visible.length === 0}
          emptyTitle={copy("Eşleşen sonuç yok", "No matching results")}
          emptyAction={{label:copy("Aramayı temizle", "Clear search"),onPress:clearSearch}} />
      </>}
      footer={help}
      renderItem={({item:machine}) => {
          const active = machine.id === state.activeId;
          return <NavigationRow
            key={machine.id} label={machine.name} detail={machine.endpoint} selected={active} intent="navigate"
            icon={<IconTile color={colors.muted}><Laptop size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            trailing={active ? <Check size={18} strokeWidth={2.4} color={colors.text} /> : undefined}
            disabled={unavailable || busy} onPress={() => setManaging(machine.id)}
          />;
      }}
    /> : <View style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg, paddingTop: space.sm }}>
      {feedback}
      <PairingEntry controller={{ ...controller, cancel: cancelEntry }} disabled={unavailable} />
      {help}
    </View>}
    {selected || removal ? <Sheet visible size="compact" title={removal ? copy("Bilgisayarı kaldır", "Remove computer") : selected!.name} onClose={closeManagement} dismissible={!busy}>
      {removal ? <>
        {staleRemoval ? <Notice tone="warning" message={copy("Kaydedilmiş bilgisayarlar değişti. Devam etmek için bu incelemeyi yeniden açın.", "Saved computers changed. Reopen this review to continue.")} /> : null}
        <Body>{removal.name}</Body>
        <Body muted>{removal.endpoint}</Body>
        <Body>{copy("Bu bağlantı telefondan kaldırılacak. Kaydedilmiş taslaklar korunur.", "This connection will be removed from this phone. Saved drafts remain.")}</Body>
        <FormActions submitLabel={copy("Kaldır", "Remove")} tone="danger" busy={busy}
          disabled={unavailable || staleRemoval} cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={busy}
          onCancel={() => { retiredRemoval.current = true; setRemoval(null); operation.reset(); }} feedback={<ConnectionFeedback operation={operation} />}
          onSubmit={() => { void recover(async () => {
            await removeSavedComputer(removal, {
              assertAccess: assertAppAccess, flushDrafts: flushWorkspaceDrafts,
              getState: () => useMachines.getState(), reviewValid: () => !retiredRemoval.current,
              remove: (id, expected) => useMachines.getState().removeMachine(id, expected),
            });
            setRemoval(null); setManaging(null);
          }, copy("Bilgisayar bağlantısı kaldırıldı.", "Computer connection removed.")); }} />
      </> : selected ? <>
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
        <NavigationRow label={copy("Kaldır", "Remove")} tone="danger" disabled={unavailable || busy} onPress={() => { retiredRemoval.current = false; operation.reset(); setRemoval({ ...reviewedMachine(selected)!, name: selected.name }); }} />
      </NavigationGroup>
      <ConnectionFeedback operation={operation} />
      </> : null}
    </Sheet> : null}
  </Screen>;
}


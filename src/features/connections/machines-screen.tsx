import { ConnectionFeedback } from "./connection-feedback";
import { useMobileTheme } from "@/ui/theme";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { router, Stack, useCanGoBack, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { View } from "react-native";
import { useScreenBackHandler } from "@/ui/screen-back-handler";
import Laptop from "lucide-react-native/icons/laptop";
import Plus from "lucide-react-native/icons/plus";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import Check from "lucide-react-native/icons/check";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import CircleHelp from "lucide-react-native/icons/circle-help";
import { useLocale } from "@/i18n";
import { useScreenChrome } from "@/ui/layout";
import { ScreenList } from "@/ui/screen-list";
import { matchesSearch, normalizeSearch } from "@/ui/search-matching";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { useMachineStatus } from "@/ui/machine-bar";
import { useMachines, whenConnectionsSettled } from "@/state/machines";
import { removeMachineAndQueries } from "@/state/machine-removal";
import { QueryClientContext } from "@tanstack/react-query";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { assertAppAccess } from "@/state/security";
import { Body, FormActions, HeaderBackButton, IconButton, Loading, NavigationGroup, NavigationRow, Notice, QueryState, RowIcon, Screen, SearchField, SectionHeader, Sheet, StateView, StatusText, useCollapsibleSearch } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { iconSize, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { routeKind, routeLabel } from "@/state/route-kind";
import { LegalLinks } from "@/ui/brand";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { AccountComputersSection } from "./account-computers-section";
import { ActiveComputerStatus, RetryConnectionRow } from "./active-computer-status";
import { PairingEntry } from "./pairing-entry";
import { PairingScanner } from "./pairing-scanner";
import { matchesSavedComputer, removeSavedComputer, reloadSavedConnections, selectSavedComputer } from "./recovery";
import { useComputerConnection } from "./use-computer-connection";
import { storageErrorText } from "./storage-error-copy";
import { stackBackOptions } from "@/ui/stack-back";

export function MachinesScreen() {
  // Context, not useQueryClient: the screen stays usable (and testable) outside a query provider.
  const cache = useContext(QueryClientContext);
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const { nativeTitle } = useScreenChrome();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const focused = useIsFocused();
  const canGoBack = useCanGoBack();
  const machines = useMachines((store) => store.machines);
  const hydrated = useMachines((store) => store.hydrated);
  const storageError = useMachines((store) => store.storageError);
  const connectionPending = useMachines((store) => store.connectionPending);
  const activeId = useMachines((store) => store.activeId);
  const activeStatus = useMachineStatus();
  const state = { machines, hydrated, storageError, connectionPending };
  const { start, returnToPrevious } = useLocalSearchParams<{ start?: string; returnToPrevious?: string }>();
  const controller = useComputerConnection(start === "choices" || returnToPrevious === "1");
  const { operation, busy, recover } = controller;
  const started = useRef(false);
  // Reason: welcome and conversation recovery open their pairing entry once.
  useEffect(() => {
    if (started.current || !hydrated || storageError || connectionPending) return;
    if (start !== "scan" && start !== "paste" && start !== "choices") return;
    started.current = true;
    controller.begin(start);
  }, [start, controller, hydrated, storageError, connectionPending]);
  const [managing, setManaging] = useState<string | null>(null);
  const selected = machines.find((machine) => machine.id === managing);
  const [removal, setRemoval] = useState<(ReviewedMachine & { name: string }) | null>(null);
  const [removalWriting, setRemovalWriting] = useState(false);
  const retiredRemoval = useRef(false);
  const removalMatches = !removal || matchesSavedComputer(removal, state);
  // The store's serialized write sets connectionPending itself. It rechecks the reviewed identity before deleting.
  useLayoutEffect(() => {
    if (removal && !removalWriting && !removalMatches) retiredRemoval.current = true;
  }, [removal, removalMatches, removalWriting]);
  const staleRemoval = !!removal && !removalWriting && (!removalMatches || retiredRemoval.current);
  const closeManagement = () => { if (!busy) { retiredRemoval.current = true; setRemoval(null); setManaging(null); } };
  const switchToComputer = (id: string) => {
    void recover(() => selectSavedComputer(id, {
      flushDrafts: flushWorkspaceDrafts, assertAccess: assertAppAccess,
      getState: () => useMachines.getState(),
      selectMachine: (next) => useMachines.getState().selectMachine(next),
      onSelected: () => setManaging(null),
      settled: whenConnectionsSettled,
    }), copy("Bilgisayar seçildi.", "Computer selected."));
  };
  useLayoutEffect(() => () => { retiredRemoval.current = true; }, []);
  const adding = controller.form.values.target !== null;
  const unavailable = !hydrated || !!storageError || connectionPending;
  const showPairing = adding || !machines.length;
  const entryOwnsFeedback = showPairing && (controller.entry.kind === "manual" || controller.entry.kind === "preview" ||
    controller.entry.kind === "rejected-code");
  const insideEntry = controller.entry.kind !== "choices";
  const entryActive = adding || insideEntry;
  const addComputer = !showPairing ? (
    <IconButton label={copy("Bilgisayar ekle", "Add computer")} disabled={unavailable || busy}
      onPress={() => controller.begin("choices")}>
      <Plus size={iconSize.action} color={colors.accent} />
    </IconButton>
  ) : undefined;
  // A long computer list is searchable: its icon trails the page actions, the field opens below.
  const machineSearch = useCollapsibleSearch(<SearchField ref={searchInput} label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />);
  const searchable = machines.length > 5 || !!search;
  const pageActions = addComputer || searchable ? <>{searchable ? machineSearch.trigger : null}{addComputer}</> : undefined;
  // Saved order stays fixed: selecting a computer never moves its row from under the finger.
  const visible = machines.filter(machine => matchesSearch(`${machine.name} ${machine.endpoint}`, search, locale));
  const nameCounts = new Map<string, number>();
  for (const machine of machines) {
    const name = normalizeSearch(machine.name, locale);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const listMemory = useFilteredListScrollMemory<(typeof machines)[number]>(search, !showPairing, visible.length, { suspended: showPairing });
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
  useScreenBackHandler(focused && entryActive && controller.entry.kind !== "scan", cancelEntry);

  if (controller.entry.kind === "scan") return <PairingScanner
    onCode={controller.readCode} onClose={controller.cancel} onPaste={() => controller.begin("paste")}
  />;

  const feedback = <>
    {!hydrated && !storageError ? <Loading delayed label={copy("Kaydedilmiş bağlantılar yükleniyor…", "Loading saved connections…")} /> : null}
    {storageError ? <StateView compact tone="danger" illustration="error"
      title={copy("Kaydedilmiş bağlantılar kullanılamıyor", "Saved connections are unavailable")}
      description={storageErrorText(storageError, copy)}
      action={{ label: copy("Depolamayı yeniden yükle", "Reload saved connections"), busy, onPress: () => {
        void recover(() => reloadSavedConnections({
          flushDrafts: flushWorkspaceDrafts, assertAccess: assertAppAccess,
          hydrate: () => useMachines.getState().hydrate(), getState: () => useMachines.getState(),
        }), copy("Kaydedilmiş bağlantılar yeniden yüklendi.", "Saved connections reloaded."));
      } }} /> : null}
    {hydrated && !storageError && !selected && !removal && !entryOwnsFeedback ? <ConnectionFeedback operation={operation} success={operation.data?.message} /> : null}
  </>;
  // One help row instead of a disclosure around a single sentence; the help page owns the steps.
  const help = <View style={{ gap: space.md }}>
    <NavigationRow icon={<RowIcon glyph={CircleHelp} />} label={copy("Nasıl bağlanır", "How to connect")}
      separator={false} onPress={() => router.navigate("/legal/help")} />
    <LegalLinks onOpen={(document) => router.navigate({ pathname: "/legal/[document]", params: { document } })} />
  </View>;
  // The edit form is titled by its action, matching the "Edit connection" row that opens it.
  const editing = controller.form.values.target?.kind === "existing";
  const pageTitle = editing ? copy("Bağlantıyı düzenle", "Edit connection") : copy("Bilgisayarlar", "Computers");
  /** Connection type is quiet context; a public route keeps its warning tone. */
  const routeStatus = (machine: (typeof machines)[number]) => {
    const kind = routeKind(machine);
    return kind ? <StatusText label={routeLabel(kind, copy)} tone={machine.public ? "warning" : "default"} dot={machine.public === true} /> : null;
  };
  const nativeBack = entryActive
    ? <HeaderBackButton disabled={busy} onPress={cancelEntry} />
    : canGoBack
      ? <HeaderBackButton onPress={() => router.back()} />
      : undefined;
  return <Screen scroll={showPairing} title={showPairing ? pageTitle : undefined}
    actions={!nativeTitle && showPairing && entryActive ? <HeaderBackButton disabled={busy} onPress={cancelEntry} /> : undefined}>
    <Stack.Screen options={{
      title: pageTitle,
      gestureEnabled: !entryActive && !busy && !controller.form.dirty,
      ...stackBackOptions(nativeBack),
      headerRight: nativeTitle && pageActions ? () => pageActions : undefined,
    }} />
    {!showPairing ? <ScreenList
      {...listMemory.listProps}
      title={copy("Bilgisayarlar", "Computers")}
      actions={!nativeTitle ? pageActions : undefined}
      grouped data={visible} keyExtractor={machine => machine.id}
      contentContainerStyle={{ maxWidth: metrics.entryWidth }}
      header={<>{feedback}
        {searchable ? machineSearch.field : null}
        {/* Saved computers first, then the account's computers not paired yet (in the footer). */}
        {!search ? <SectionHeader title={copy("Bu telefonda", "On this phone")} /> : null}
        <QueryState query={{data:visible, isPending:false, isSuccess:true}} empty={!unavailable && !busy && !!search.trim() && visible.length === 0}
          noResults={{ searching: !!search.trim(), onClearSearch: clearSearch }} />
      </>}
      footer={search.trim() ? undefined : <View style={{ gap: space.lg }}><AccountComputersSection />{help}</View>}
      renderItem={({item:machine}) => {
          const active = machine.id === activeId;
          const duplicateName = (nameCounts.get(normalizeSearch(machine.name, locale)) ?? 0) > 1;
          const address = duplicateName ? machine.endpoint : undefined;
          // Every row ends with the same options control. The selected computer adds an accent check;
          // other rows reserve its slot so the options controls stay aligned.
          return <NavigationRow
            key={machine.id} label={machine.name} selected={active} intent="select"
            detail={address} detailSelectable={false} detailEllipsizeMode="middle"
            accessibilityLabel={active
              ? [machine.name, address, activeStatus.status, activeStatus.reason].filter(Boolean).join(". ")
              : undefined}
            icon={<RowIcon glyph={Laptop} />}
            supporting={active ? <ActiveComputerStatus connection={activeStatus} route={routeStatus(machine)} /> : routeStatus(machine) ?? undefined}
            trailing={<View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: iconSize.action, alignItems: "center" }}>{active ? <Check size={16} color={colors.accent} /> : null}</View>
              <IconButton label={copy("{p0} için seçenekler", "Options for {p0}", { p0: address ? `${machine.name} (${address})` : machine.name })} disabled={unavailable || busy} onPress={() => setManaging(machine.id)}><MoreHorizontal size={iconSize.action} color={colors.muted} /></IconButton>
            </View>}
            // A tap selects (the selected row stays as it is); options open only from the "…" control.
            disabled={unavailable || busy} onPress={() => { if (!active) switchToComputer(machine.id); }}
          />;
      }}
    /> : <View style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg, paddingTop: space.sm }}>
      {feedback}
      {entryActive
        ? <PairingEntry controller={{ ...controller, cancel: cancelEntry }} disabled={unavailable} />
        : !unavailable ? <AccountComputersSection others={<PairingEntry controller={{ ...controller, cancel: cancelEntry }} disabled={false} />} /> : null}
      {!entryActive && !unavailable ? help : null}
    </View>}
    {selected || removal ? <Sheet visible size="compact" title={removal ? copy("Bilgisayarı kaldır", "Remove computer") : selected!.name} onClose={closeManagement} dismissible={!busy}>
      {removal ? <>
        {staleRemoval ? <Notice tone="warning" message={copy("Kaydedilmiş bilgisayarlar değişti. Devam etmek için bu incelemeyi yeniden aç.", "Saved computers changed. Reopen this review to continue.")} /> : null}
        <Body>{removal.name}</Body>
        <Body muted>{removal.endpoint}</Body>
        <Body>{copy("Bu bağlantı telefondan kaldırılacak. Kaydedilmiş taslaklar korunur.", "This connection will be removed from this phone. Saved drafts remain.")}</Body>
        {/* Removing here deletes only this phone's copy of the key; the computer still lists this phone. */}
        <Body muted>{copy(
          "Bilgisayar bu telefona güvenmeye devam eder. Erişimi tamamen kaldırmak için bilgisayardaki bycoda’da Cihazlar’dan bu telefonu kaldır.",
          "The computer still trusts this phone. To remove its access completely, remove this phone under Devices in bycoda on your computer.",
        )}</Body>
        <FormActions submitLabel={copy("Kaldır", "Remove")} tone="danger" busy={busy}
          disabled={unavailable || staleRemoval} cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={busy}
          onCancel={() => { retiredRemoval.current = true; setRemoval(null); operation.reset(); }} feedback={<ConnectionFeedback operation={operation} />}
          onSubmit={() => { void recover(async () => {
            await removeSavedComputer(removal, {
              assertAccess: assertAppAccess, flushDrafts: flushWorkspaceDrafts,
              getState: () => useMachines.getState(), reviewValid: () => !retiredRemoval.current,
              remove: async (id, expected) => {
                setRemovalWriting(true);
                try {
                  await removeMachineAndQueries(cache, id, expected);
                  setRemoval(null);
                  setManaging(null);
                } finally {
                  setRemovalWriting(false);
                }
              },
            });
          }, copy("Bilgisayar bağlantısı kaldırıldı.", "Computer connection removed.")); }} />
      </> : selected ? <>
      {/* Identity and status first; the address stays visible and selectable rather than behind a disclosure. */}
      <View style={{ gap: space.xs }}>
        {selected.id === activeId ? <ActiveComputerStatus connection={activeStatus} route={routeStatus(selected)} /> : routeStatus(selected)}
        <Body muted mono selectable style={uiStyles.caption}>{selected.endpoint}</Body>
      </View>
      <NavigationGroup>
        {selected.id === activeId ? null : <NavigationRow icon={<RowIcon glyph={Check} />} label={copy("Bu bilgisayarı kullan", "Use computer")} intent="command" disabled={unavailable || busy} onPress={() => switchToComputer(selected.id)} />}
        {selected.id === activeId ? <RetryConnectionRow onPair={() => { setManaging(null); controller.begin("scan"); }} /> : null}
        <NavigationRow icon={<RowIcon glyph={Pencil} />} label={copy("Bağlantıyı düzenle", "Edit connection")} disabled={unavailable || busy} onPress={() => { setManaging(null); controller.edit(selected); }} />
        <NavigationRow icon={<RowIcon glyph={Trash2} tone="danger" />} label={copy("Kaldır", "Remove")} tone="danger" intent="command" disabled={unavailable || busy} onPress={() => { retiredRemoval.current = false; operation.reset(); setRemoval({ ...reviewedMachine(selected)!, name: selected.name }); }} />
      </NavigationGroup>
      <ConnectionFeedback operation={operation} />
      </> : null}
    </Sheet> : null}
  </Screen>;
}


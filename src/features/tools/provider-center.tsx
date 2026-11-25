import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack, router } from "expo-router";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Bot from "lucide-react-native/icons/bot";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { getQueryPresentation } from "@/ui/query-presentation";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Badge, Body, Disclosure, Empty, FormActions, ErrorText, Field, IconButton, MutationState, NavigationGroup, NavigationRow, Notice, QueryState, RowIcon, Screen, SectionHeader, StateView, ScreenList, SearchField, Sheet, ValueRow } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { NoComputerGate } from "@/ui/no-computer";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import type { RemoteProvider } from "@/domain/types";
import { providerName } from "@/features/workspace/provider-choices";
import { metadataPatch, readProviderCenter, type ProviderCenterAgent, type ProviderCenterReport } from "./provider-center-model";

type Provider = ProviderCenterReport["providers"][number];

function availabilityLabel(launcher: Provider["launcher"], copy: ReturnType<typeof useCopy>) {
  return launcher === "resolved" ? copy("Kullanılabilir", "Available") : launcher === "unavailable" ? copy("Kullanılamıyor", "Unavailable") : copy("Bilinmiyor", "Unknown");
}
/** Problems first, then the computer's order; the normal state stays quiet. */
export function orderProviders(providers: readonly Provider[]): Provider[] {
  return providers.map((provider, index) => ({ provider, index }))
    .sort((a, b) => Number(b.provider.launcher === "unavailable") - Number(a.provider.launcher === "unavailable") || a.index - b.index)
    .map(({ provider }) => provider);
}
function ProviderLaunchers({ providers }: { providers: Provider[] }) {
  const copy = useCopy();
  const info = useInfoHint(copy("Başlatıcının bulunması, hesabın oturum açtığı anlamına gelmez. Hesap ve kimlik doğrulama yönetimi bilgisayarda kalır.", "Finding a launcher does not prove an account is signed in. Account and authentication management stay on the computer."));
  return <View>
    <SectionHeader title={copy("Bilgisayardaki ajanlar", "Agents on this computer")} count={providers.length} trailing={info.button} />
    {info.panel}
    <NavigationGroup>
      {orderProviders(providers).map((provider) => {
        const label = availabilityLabel(provider.launcher, copy);
        // Available is the normal case: quiet text. Only a missing launcher is tinted.
        return <ValueRow key={provider.id} label={providerName(provider.id as RemoteProvider)}
          icon={<ProviderAccountMark provider={provider.id as RemoteProvider} size={iconSize.row} />}
          value={provider.launcher === "unavailable" ? undefined : label}
          trailing={provider.launcher === "unavailable" ? <Badge label={label} tone="warning" /> : undefined} />;
      })}
    </NavigationGroup>
  </View>;
}
export function ProviderAgentRow({ agent, onPress }: { agent: ProviderCenterAgent; onPress: () => void }) {
  return <NavigationRow label={agent.name} detail={agent.id} icon={<RowIcon glyph={Bot} />} separator onPress={onPress} />;
}

function AgentMetadata({ agent, revision, machineId, onClose, onUpdated }: {
  agent: ProviderCenterAgent; revision: string; machineId: string; onClose: () => void; onUpdated: () => void;
}) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ agent, revision, machineId, reviewed: reviewedMachine(machine) }));
  const mounted = useRef(true), invalidated = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentScope = () => {
    if (!isReviewedMachine(opening.reviewed, useMachines.getState())) invalidated.current = true;
    return mounted.current && !invalidated.current;
  };
  const [name, setName] = useState(agent.name); const [context, setContext] = useState(agent.contextWindow?.toString() ?? "");
  const [review, setReview] = useState<ReturnType<typeof metadataPatch>>(); const [error, setError] = useState<unknown>();
  const [uncertain, setUncertain] = useState(false); const occupied = useRef(false);
  const patch = useHostMutation("providers.acp.patchMetadata", ["provider-center"]);
  const validScope = currentScope();
  const supported = validScope && machine?.id === opening.machineId && machine.capabilities?.includes("providers.acp.patchMetadata");
  const changed = name !== opening.agent.name || context !== (opening.agent.contextWindow?.toString() ?? "");
  const busy = patch.isPending;
  const confirm = () => {
    if (!review || !supported || !currentScope() || uncertain || occupied.current) return;
    occupied.current = true;
    void patch.mutateAsync(review).then(() => { if (currentScope()) { onUpdated(); onClose(); } }).catch((cause: unknown) => {
      if (currentScope() && cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; });
  };
  return <Sheet visible title={agent.name} size="compact" dirty={changed} dismissible={!busy} onClose={onClose}>
    <Field label={copy("Ad", "Name")} value={name} onChangeText={setName} maxLength={160} editable={!!supported && !busy && !review && !uncertain} />
    <Field label={copy("Bağlam penceresi", "Context window")} value={context} onChangeText={setContext} keyboardType="number-pad" maxLength={8} editable={!!supported && !busy && !review && !uncertain} />
    {!validScope ? <Notice message={copy("Bağlantı veya proje değişti. Devam etmek için bu ekranı yeniden açın.", "The connection or project changed. Reopen this view to continue.")} /> : !supported ? <Notice message={copy("ACP adını ve bağlam penceresini düzenlemek için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to edit the ACP name and context window.")} /> : null}
    {uncertain ? <Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki yapılandırmayı kontrol edin.", "The save outcome is unknown. Check the configuration on the computer before sending again.")} /> : null}

    {review ? <><Body>{copy("Bu bilgisayardaki ACP etiketini ve bağlam penceresini kaydet? Ajan başlatılmaz.", "Save this ACP label and context window on the computer? This does not start the agent.")}</Body><FormActions feedback={<><ErrorText error={error} /><MutationState mutation={patch} /></>}
      submitLabel={copy("Kaydet", "Save")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported || uncertain} onSubmit={confirm} onCancel={() => setReview(undefined)} /></> :
      <FormActions submitLabel={copy("Değişiklikleri incele", "Review changes")} dirty={changed} disabled={!supported || !changed || busy || uncertain} onSubmit={() => {
        if (!supported || !currentScope() || busy || uncertain) return;
        try { setReview(metadataPatch(opening.agent, opening.revision, name, context)); setError(undefined); } catch (cause) { setError(cause); }
      }} feedback={<><ErrorText error={error} /><MutationState mutation={patch} /></>} />}
    <Disclosure label={copy("Teknik ayrıntılar", "Technical details")}>
      <Body mono>{opening.machineId} / {opening.agent.id}</Body>
      <Body muted>{copy("Başlatma komutu, argümanlar ve gizli ortam değerleri bilgisayarda kalır.", "Launch commands, arguments and secret environment values stay on the computer.")}</Body>
      <Body>{copy("Argüman sayısı: {p0}", "Argument count: {p0}", { p0: agent.argumentCount })}</Body>
      <Body>{copy("Ortam değişkeni sayısı: {p0}", "Environment variable count: {p0}", { p0: agent.environmentKeyCount })}</Body>
    </Disclosure>
  </Sheet>;
}

/** Global host configuration; independent of the currently selected project. */
export function ProviderCenter() {
  const copy = useCopy(); const machine = useActiveMachine();
  const intro = useInfoHint(copy("Bu bilgisayardaki kurulu yapay zeka ajanlarını ve yapılandırdığınız özel ACP ajanlarını listeler.", "Lists the AI agents installed on this computer and the custom ACP agents you configured."));
  const locale = useLocale(); const { colors } = useMobileTheme();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const supported = !!machine?.environmentId && machine.capabilities?.includes("providers.center.read");
  const [selected, setSelected] = useState<{ agent: ProviderCenterAgent; revision: string; machineId: string; reviewed: ReviewedMachine | undefined }>();
  const selection = useRef(selected); selection.current = selected;
  const changedTarget = !!selected && (!supported || !isReviewedMachine(selected.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] }));
  useEffect(() => { if (changedTarget) setSelected(undefined); }, [changedTarget]);
  const query = useHostQuery<ProviderCenterReport>(["provider-center"], "providers.center.read", {}, {
    enabled: !!supported,
    queryFn: async (client, signal) => readProviderCenter(await client.request("providers.center.read", {}, { signal }), machine!.environmentId!),
  });
  const report = supported ? query.data : undefined;
  const refresh = usePullRefresh(supported ? () => query.refetch() : undefined);
  const agents = (report?.acp.agents ?? []).filter((agent) => matchesSearch(`${agent.name} ${agent.id}`, search, locale));
  if (!machine || !supported) return <Screen title={copy("Sağlayıcı merkezi", "Provider center")} scroll={false}>
    <View style={{ flex: 1 }}>
      {!machine ? <NoComputerGate />
        : <Empty compact={false} illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")}
          detail={copy("Sağlayıcı merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to open the provider center.")} />}
    </View>
  </Screen>;
  const ready = getQueryPresentation(query) === "ready" && !!report;
  return <>
    <ScreenList<ProviderCenterAgent> title={copy("Sağlayıcı merkezi", "Provider center")} computerSwitch scope={{ computer: machine.name }}
      query={supported ? query : undefined}
      refreshState={supported ? refresh : undefined}
      grouped
      actions={<IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing} disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
        <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
      </IconButton>}
      data={agents} keyExtractor={(agent) => agent.id}
      header={<View style={{ gap: space.lg }}>
        <Stack.Screen options={{ title: copy("Sağlayıcı merkezi", "Provider center") }} />
        <QueryState size="region" query={query} />
        {report?.providers.length ? <ProviderLaunchers providers={report.providers} /> : null}
        {report ? <View style={{ gap: space.sm }}>
          <SectionHeader title={copy("Özel ACP ajanları", "Custom ACP agents")} count={report.acp.agents.length} trailing={intro.button} />
          {intro.panel}
          {report.acp.agents.length || search ? <SearchField ref={searchInput} label={copy("Ajan ara", "Search agents")} value={search} onChangeText={setSearch} /> : null}
          {ready && report.acp.agents.length > 0 && !agents.length ? <Empty compact title={copy("Eşleşen sonuç yok", "No matching results")}
            action={{ label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }} /> : null}
          {ready && !report.acp.agents.length ? <StateView size="compact" title={copy("Yapılandırılmış ACP ajanı yok.", "No configured ACP agents.")} /> : null}
        </View> : null}
      </View>}
      renderItem={({ item }) => <ProviderAgentRow agent={item} onPress={() => { if (report && machine) setSelected({ agent: item, revision: report.acp.revision, machineId: machine.id, reviewed: reviewedMachine(machine) }); }} />} />
    {selected && !changedTarget ? <AgentMetadata key={`${selected.machineId}:${selected.agent.id}`} agent={selected.agent} revision={selected.revision} machineId={selected.machineId}
      onUpdated={() => { if (selection.current === selected && isReviewedMachine(selected.reviewed, useMachines.getState())) void query.refetch(); }} onClose={() => setSelected(value => value === selected ? undefined : value)} /> : null}
  </>;
}

import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { getQueryPresentation } from "@/ui/query-presentation";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Badge, Body, Button, Disclosure, Empty, FormActions, ErrorText, Field, MutationState, NavigationRow, Notice, QueryState, StatusRow, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { metadataPatch, readProviderCenter, type ProviderCenterAgent, type ProviderCenterReport } from "./provider-center-model";

function launcherLabel(launcher: ProviderCenterReport["providers"][number]["launcher"], copy: ReturnType<typeof useCopy>) {
  return launcher === "resolved" ? copy("Başlatıcı bulundu", "Launcher found") : launcher === "unavailable" ? copy("Başlatıcı bulunamadı", "Launcher not found") : copy("Başlatıcı durumu bilinmiyor", "Launcher status unknown");
}
export function ProviderLauncherRows({ providers }: { providers: ProviderCenterReport["providers"] }) {
  const copy = useCopy();
  return <>{providers.map((provider) => <StatusRow key={provider.id} label={provider.label}>
    <Badge label={launcherLabel(provider.launcher, copy)} />
  </StatusRow>)}</>;
}
function ProviderLaunchers({ providers }: { providers: ProviderCenterReport["providers"] }) {
  const copy = useCopy();
  const unresolved = providers.filter((provider) => provider.launcher !== "resolved");
  const detail = unresolved.length
    ? unresolved.map((provider) => `${provider.label}: ${launcherLabel(provider.launcher, copy)}`).join(" · ")
    : providers.map((provider) => provider.label).join(" · ");
  return <Disclosure label={copy("Sağlayıcılar", "Providers")} detail={detail}>
    <ProviderLauncherRows providers={providers} />
    <Body muted>{copy("Başlatıcının bulunması, hesabın oturum açtığı anlamına gelmez. Hesap ve kimlik doğrulama yönetimi bilgisayarda kalır.", "Finding a launcher does not prove an account is signed in. Account and authentication management stay on the computer.")}</Body>
  </Disclosure>;
}
export function ProviderAgentRow({ agent, onPress }: { agent: ProviderCenterAgent; onPress: () => void }) {
  return <NavigationRow label={agent.name} detail={agent.id} onPress={onPress} />;
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
      <FormActions submitLabel={copy("Değişiklikleri incele", "Review changes")} disabled={!supported || !changed || busy || uncertain} onSubmit={() => {
        if (!supported || !currentScope() || busy || uncertain) return;
        try { setReview(metadataPatch(opening.agent, opening.revision, name, context)); setError(undefined); } catch (cause) { setError(cause); }
      }} feedback={<><ErrorText error={error} /><MutationState mutation={patch} /></>} />}
    <Disclosure label={copy("Ayrıntılar", "Details")}>
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
  const locale = useLocale();
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
  return <>
    <ScreenList<ProviderCenterAgent> title={copy("Sağlayıcı merkezi", "Provider center")} subtitle={machine?.name}
      query={supported ? query : undefined}
      refreshState={supported ? refresh : undefined}
      actions={<Button busy={refresh.refreshing} tone="quiet" label={copy("Yenile", "Refresh")} disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }} />}
      data={agents} keyExtractor={(agent) => agent.id}
      header={<View style={{ gap: space.sm }}>
        <Stack.Screen options={{ title: copy("Sağlayıcı merkezi", "Provider center") }} />
        {!machine ? <Notice message={copy("Önce bir bilgisayar bağla", "Connect a computer first")} /> : !supported ? <Notice message={copy("Sağlayıcı merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to open the provider center.")} /> : <QueryState query={query} />}
        {report?.providers.length ? <ProviderLaunchers providers={report.providers} /> : null}
        <Body>{copy("Yapılandırılmış ACP ajanları", "Configured ACP agents")}</Body>
        {report && (report.acp.agents.length || search) ? <SearchField ref={searchInput} label={copy("Ajan ara", "Search agents")} value={search} onChangeText={setSearch} /> : null}
        {getQueryPresentation(query) === "ready" && report && report.acp.agents.length > 0 && !agents.length ? <Empty compact title={copy("Eşleşen sonuç yok", "No matching results")}
          action={{ label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }} /> : null}
        {getQueryPresentation(query) === "ready" && report && !report.acp.agents.length ? <Empty compact title={copy("Yapılandırılmış ACP ajanı yok.", "No configured ACP agents.")} /> : null}
      </View>}
      renderItem={({ item }) => <ProviderAgentRow agent={item} onPress={() => { if (report && machine) setSelected({ agent: item, revision: report.acp.revision, machineId: machine.id, reviewed: reviewedMachine(machine) }); }} />} />
    {selected && !changedTarget ? <AgentMetadata key={`${selected.machineId}:${selected.agent.id}`} agent={selected.agent} revision={selected.revision} machineId={selected.machineId}
      onUpdated={() => { if (selection.current === selected && isReviewedMachine(selected.reviewed, useMachines.getState())) void query.refetch(); }} onClose={() => setSelected(value => value === selected ? undefined : value)} /> : null}
  </>;
}

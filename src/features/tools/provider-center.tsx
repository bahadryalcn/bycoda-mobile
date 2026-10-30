import { useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Badge, Body, Button, Disclosure, FormActions, ErrorText, Field, MutationState, NavigationRow, Notice, QueryState, Row, ScreenList, SearchField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { metadataPatch, readProviderCenter, type ProviderCenterAgent, type ProviderCenterReport } from "./provider-center-model";

export function ProviderLauncherRows({ providers }: { providers: ProviderCenterReport["providers"] }) {
  const copy = useCopy();
  return <>{providers.map((provider) => <Row key={provider.id}>
    <Body style={{ flex: 1 }}>{provider.label}</Body>
    <Badge label={provider.launcher === "resolved" ? copy("Başlatıcı bulundu", "Launcher found") : provider.launcher === "unavailable" ? copy("Başlatıcı bulunamadı", "Launcher not found") : copy("Başlatıcı durumu bilinmiyor", "Launcher status unknown")} />
  </Row>)}</>;
}
export function ProviderAgentRow({ agent, onPress }: { agent: ProviderCenterAgent; onPress: () => void }) {
  return <NavigationRow label={agent.name} detail={agent.id} onPress={onPress} />;
}

function AgentMetadata({ agent, revision, machineId, onClose, onUpdated }: {
  agent: ProviderCenterAgent; revision: string; machineId: string; onClose: () => void; onUpdated: () => void;
}) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ agent, revision, machineId }));
  const [name, setName] = useState(agent.name); const [context, setContext] = useState(agent.contextWindow?.toString() ?? "");
  const [review, setReview] = useState<ReturnType<typeof metadataPatch>>(); const [error, setError] = useState<unknown>();
  const [uncertain, setUncertain] = useState(false); const occupied = useRef(false);
  const patch = useHostMutation("providers.acp.patchMetadata", ["provider-center"]);
  const supported = machine?.id === opening.machineId && machine.capabilities?.includes("providers.acp.patchMetadata");
  const changed = name !== opening.agent.name || context !== (opening.agent.contextWindow?.toString() ?? "");
  const busy = patch.isPending;
  const confirm = () => {
    if (!review || !supported || uncertain || occupied.current || useMachines.getState().activeId !== opening.machineId) return;
    occupied.current = true;
    void patch.mutateAsync(review).then(() => { if (useMachines.getState().activeId === opening.machineId) { onUpdated(); onClose(); } }).catch((cause: unknown) => {
      if (cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; });
  };
  return <Sheet visible title={agent.name} size="form" dirty={changed} dismissible={!busy} onClose={onClose}>
    <Field label={copy("Ad", "Name")} value={name} onChangeText={setName} maxLength={160} editable={!!supported && !busy && !review && !uncertain} />
    <Field label={copy("Bağlam penceresi", "Context window")} value={context} onChangeText={setContext} keyboardType="number-pad" maxLength={8} editable={!!supported && !busy && !review && !uncertain} />
    {!supported ? <Notice message={copy("ACP adını ve bağlam penceresini düzenlemek için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to edit the ACP name and context window.")} /> : null}
    {uncertain ? <Notice tone="warning" message={copy("Kaydetmenin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki yapılandırmayı kontrol edin.", "The save outcome is unknown. Check the configuration on the computer before sending again.")} /> : null}

    {review ? <FormActions feedback={<> <Body>{copy("Bu bilgisayardaki ACP etiketini ve bağlam penceresini kaydet? Ajan başlatılmaz.", "Save this ACP label and context window on the computer? This does not start the agent.")}</Body> <ErrorText error={error} /><MutationState mutation={patch} /> </>}
      submitLabel={copy("Kaydet", "Save")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported || uncertain} onSubmit={confirm} onCancel={() => setReview(undefined)} /> :
      <FormActions submitLabel={copy("Değişiklikleri incele", "Review changes")} disabled={!supported || !changed || busy || uncertain} onSubmit={() => {
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
  const [search, setSearch] = useState("");
  const supported = !!machine?.environmentId && machine.capabilities?.includes("providers.center.read");
  const [selected, setSelected] = useState<{ agent: ProviderCenterAgent; revision: string; machineId: string }>();
  const query = useHostQuery<ProviderCenterReport>(["provider-center"], "providers.center.read", {}, {
    enabled: !!supported,
    queryFn: async (client, signal) => readProviderCenter(await client.request("providers.center.read", {}, { signal }), machine!.environmentId!),
  });
  const report = supported ? query.data : undefined;
  return <>
    <ScreenList<ProviderCenterAgent> title={copy("Sağlayıcı merkezi", "Provider center")} subtitle={machine?.name}
      actions={<Button busy={query.isFetching} tone="quiet" label={copy("Yenile", "Refresh")} disabled={!supported || query.isFetching} onPress={() => { void query.refetch(); }} />}
      data={(report?.acp.agents ?? []).filter((agent) => `${agent.name} ${agent.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))} keyExtractor={(agent) => agent.id}
      header={<View style={{ gap: space.sm }}>
        {!machine ? <Notice message={copy("Önce bir bilgisayar bağla", "Connect a computer first")} /> : !supported ? <Notice message={copy("Sağlayıcı merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to open the provider center.")} /> : <QueryState query={query} />}
        <Disclosure label={copy("Hesaplar", "Accounts")}><Body muted>{copy("Başlatıcının bulunması, hesabın oturum açtığı anlamına gelmez. Hesap ve kimlik doğrulama yönetimi bilgisayarda kalır.", "Finding a launcher does not prove an account is signed in. Account and authentication management stay on the computer.")}</Body></Disclosure>
        {report ? <ProviderLauncherRows providers={report.providers} /> : null}
        <Body>{copy("Yapılandırılmış ACP ajanları", "Configured ACP agents")}</Body>
        {report?.acp.agents.length ? <SearchField label={copy("Ajan ara", "Search agents")} value={search} onChangeText={setSearch} /> : null}
        {report && !report.acp.agents.length ? <Body muted>{copy("Yapılandırılmış ACP ajanı yok.", "No configured ACP agents.")}</Body> : null}
      </View>}
      renderItem={({ item }) => <ProviderAgentRow agent={item} onPress={() => { if (report && machine) setSelected({ agent: item, revision: report.acp.revision, machineId: machine.id }); }} />} />
    {selected && machine?.id === selected.machineId ? <AgentMetadata key={`${selected.machineId}:${selected.agent.id}`} agent={selected.agent} revision={selected.revision} machineId={selected.machineId}
      onUpdated={() => { void query.refetch(); }} onClose={() => setSelected(undefined)} /> : null}
  </>;
}

import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack } from "expo-router";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Bot from "lucide-react-native/icons/bot";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { getQueryPresentation } from "@/ui/query-presentation";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useHostQuery } from "@/state/queries";
import { Badge, Empty, IconButton, NavigationGroup, NoResults, QueryState, RowIcon, Screen, SectionHeader, StateView, ScreenList, SearchField, ValueRow, useCollapsibleSearch } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { NoComputerGate } from "@/ui/no-computer";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import type { RemoteProvider } from "@/domain/types";
import { providerName } from "@/features/workspace/provider-choices";
import { readProviderCenter, type ProviderCenterAgent, type ProviderCenterReport } from "./provider-center-model";

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
/** Agent lists longer than this get the search icon. */
const SEARCH_FROM = 6;
/** A configured ACP agent, read-only: agent configuration is edited in bycoda on the computer. */
export function ProviderAgentRow({ agent }: { agent: ProviderCenterAgent }) {
  const copy = useCopy(); const locale = useLocale();
  // The agent's identifier and launch settings stay on the computer; the row names it.
  return <ValueRow label={agent.name} icon={<RowIcon glyph={Bot} />}
    value={agent.contextWindow ? copy("{p0} token bağlam", "{p0} token context", { p0: new Intl.NumberFormat(locale).format(agent.contextWindow) }) : undefined} />;
}

/** Global host configuration; independent of the currently selected project. */
export function ProviderCenter() {
  const copy = useCopy(); const machine = useActiveMachine();
  const intro = useInfoHint(copy("Bu bilgisayardaki kurulu yapay zeka ajanlarını ve özel ACP ajanlarını listeler. Ajanlar bilgisayardaki bycoda’da yapılandırılır.", "Lists the AI agents installed on this computer and your custom ACP agents. Agents are configured in bycoda on the computer."));
  const locale = useLocale(); const { colors } = useMobileTheme();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  // The one search convention: an icon in the page actions opening the search sheet.
  const agentSearch = useCollapsibleSearch(<SearchField ref={searchInput} label={copy("Ajan ara", "Search agents")} value={search} onChangeText={setSearch} />);
  const supported = !!machine?.environmentId && machine.capabilities?.includes("providers.center.read");
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
  return (
    <ScreenList<ProviderCenterAgent> title={copy("Sağlayıcı merkezi", "Provider center")} computerSwitch scope={{ computer: machine.name }}
      query={supported ? query : undefined}
      refreshState={supported ? refresh : undefined}
      grouped
      actions={<>
        {/* Search earns its icon on a longer list; an active query keeps it. */}
        {(report?.acp.agents.length ?? 0) > SEARCH_FROM || search ? agentSearch.trigger : null}
        <IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing} disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
          <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
        </IconButton>
      </>}
      data={agents} keyExtractor={(agent) => agent.id}
      header={<View style={{ gap: space.lg }}>
        <Stack.Screen options={{ title: copy("Sağlayıcı merkezi", "Provider center") }} />
        <QueryState size="region" query={query} />
        {report?.providers.length ? <ProviderLaunchers providers={report.providers} /> : null}
        {report ? <View style={{ gap: space.sm }}>
          <SectionHeader title={copy("Özel ACP ajanları", "Custom ACP agents")} count={report.acp.agents.length} trailing={intro.button} />
          {intro.panel}
          {agentSearch.field}
          {/* A section's own search: the compact form, so the page's other sections stay in view. */}
          {ready && report.acp.agents.length > 0 && !agents.length ? <NoResults compact searching onClearSearch={clearSearch} /> : null}
          {ready && !report.acp.agents.length ? <StateView size="compact" title={copy("Yapılandırılmış ACP ajanı yok.", "No configured ACP agents.")} /> : null}
        </View> : null}
      </View>}
      renderItem={({ item }) => <ProviderAgentRow agent={item} />} />
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import { Body, Button, Disclosure, Empty, Notice, QueryState, Row, ScreenList, Sheet } from "@/ui/primitives";
import { getQueryPresentation } from "@/ui/query-presentation";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { RecordCard } from "@/ui/record-card";
import type { SessionScope } from "../workspace/session-types";
import { ProviderAccountEditor } from "./provider-account-editor";
import {
  readDesktopManagement,
  type DesktopManagementReport,
  type DesktopQuota,
} from "./provider-desktop-model";

type Entry =
  | { key: string; account: DesktopManagementReport["accounts"][number] }
  | { key: string; server: DesktopManagementReport["mcp"][number] };
export function ProviderDesktop({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [selected, setSelected] = useState<{
    report: DesktopManagementReport;
    account: DesktopManagementReport["accounts"][number];
  }>();
  const machine = useActiveMachine();
  const [opening] = useState(() => ({
    ...scope,
    projectId,
    target: reviewedMachine(machine),
    environmentId: machine?.environmentId,
  }));
  const mounted = useRef(true), invalidated = useRef(false);
  const latest = useRef({ scope, projectId }); latest.current = { scope, projectId };
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => {
    if (!opening.target || opening.target.id !== opening.machineId ||
      !isReviewedMachine(opening.target, useMachines.getState()) ||
      latest.current.scope.machineId !== opening.machineId ||
      latest.current.scope.sessionId !== opening.sessionId ||
      latest.current.projectId !== opening.projectId) invalidated.current = true;
    return mounted.current && !invalidated.current;
  };
  const validScope = current();
  const supported =
    validScope && !!opening.environmentId && machine?.capabilities?.includes("providers.desktop.v1");
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const query = useHostQuery<DesktopManagementReport>(
    ["provider-desktop", opening.projectId, opening.sessionId],
    "providers.desktop.read",
    params,
    {
      enabled: !!supported,
      queryFn: async (client, signal) => {
        if (!current()) throw Error("Provider management source changed");
        const result = readDesktopManagement(
          await client.request("providers.desktop.read", params, { signal }),
          { environmentId: opening.environmentId!, sessionId: opening.sessionId },
        );
        if (!current()) throw Error("Provider management source changed");
        return result;
      },
    },
  );
  const report = supported ? query.data : undefined;
  const refresh = usePullRefresh(supported ? () => current() ? query.refetch() : undefined : undefined);
  const ready = getQueryPresentation(query) === "ready";
  const entries: Entry[] = report
    ? [
        ...report.accounts.map((account) => ({
          key: `account:${account.provider}:${account.id}`,
          account,
        })),
        ...report.mcp.map((server, index) => ({ key: `mcp:${index}`, server })),
      ]
    : [];
  return (
    <Sheet
      visible
      title={copy("Hesaplar ve MCP", "Accounts and MCP")}
      size="full"
      scroll={false}
      onClose={onClose}
    >
      <ScreenList<Entry>
        data={entries}
        query={supported ? query : undefined}
        refreshState={supported ? refresh : undefined}
        keyExtractor={(entry) => entry.key}
        header={
          <View style={{ gap: space.sm }}>
            <Row>
              <Body style={{ flex: 1 }}>{machine?.name}</Body>
              <Button busy={refresh.refreshing} tone="quiet" label={copy("Yenile", "Refresh")}
                disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }} />
            </Row>
            {!supported ? (
              <Notice
                message={!validScope ? copy("Bağlantı veya proje değişti. Devam etmek için bu ekranı yeniden açın.", "The connection or project changed. Reopen this view to continue.") : copy(
                  "Hesap ve MCP bilgilerini görmek için bu oturumun bilgisayarındaki bycoda’yı güncelleyin.",
                  "Update bycoda on this session's computer to view account and MCP information.",
                )}
              />
            ) : (
              <QueryState query={query} />
            )}
            <Disclosure label={copy("Ayrıntılar", "Details")}>
              <Body mono>{opening.sessionId}</Body>
              <Body muted>{copy(
                "Bilgisayarda önceden gözlemlenen hesap ve MCP bilgileri. Yenileme giriş yapmaz, kota sorgulamaz veya servis başlatmaz.",
                "Previously observed account and MCP information from the computer. Refresh does not sign in, fetch quotas or start services.",
              )}</Body>
              <Body muted>{copy(
                "Kotalar sağlayıcı önbelleğidir; oturum kullanımı, fatura veya fiyat değildir.",
                "Quotas come from the provider cache; they are not session usage, invoices or prices.",
              )}</Body>
              {report ? <Body muted>{copy("Önbellek anlık görüntüsü", "Cached snapshot")} · {new Date(report.sampledAt).toLocaleString()}</Body> : null}
            </Disclosure>
            {report ? (
              <>
                {ready && !report.accounts.length ? (
                  <Empty compact title={copy("Yapılandırılmış hesap yok.", "No configured accounts.")} />
                ) : null}
                {ready && report.coverage.mcpSource === "unavailable" ? (
                  <Notice
                    message={copy(
                      "Bu proje için bilgisayarda önbelleğe alınmış MCP bilgisi yok. MCP ayarlarını bilgisayarda açın.",
                      "No MCP information is cached for this project. Open MCP settings on the computer.",
                    )}
                  />
                ) : ready && !report.mcp.length ? (
                  <Body muted>
                    {copy("Önbellekte MCP sunucusu yok.", "No cached MCP servers.")}
                  </Body>
                ) : null}
                {report.coverage.truncated ? (
                  <Notice
                    tone="warning"
                    message={copy(
                      "Liste sınıra ulaştı; bu görünüm tüm kayıtları içermez.",
                      "The list reached its limit; this view does not include every entry.",
                    )}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          "account" in item ? (
            <RecordCard title={item.account.label}
              metadata={`${item.account.provider}${item.account.isDefault ? ` · ${copy("Varsayılan", "Default")}` : ""}`}
              details={<CachedQuota quota={item.account.quota} />}
              footer={(machine?.capabilities?.includes("providers.desktop.metadata.v1") || (item.account.provider === "claude" && machine?.capabilities?.includes("providers.desktop.quotaRefresh.v1"))) ? (
                <Button
                  tone="quiet"
                  label={copy("Hesap işlemleri", "Account actions")}
                  disabled={!supported || !ready || !!report?.coverage.truncated}
                  onPress={() => {
                    if (ready && report && current()) setSelected({ report, account: item.account });
                  }}
                />
              ) : undefined}
            />
          ) : (
            <View style={{ gap: space.xs }}>
              <Body>{item.server.name} · MCP</Body>
              <Body muted>
                {item.server.provider} · {item.server.scope} · {item.server.transport} ·{" "}
                {item.server.enabled ? copy("Etkin", "Enabled") : copy("Devre dışı", "Disabled")}
              </Body>
            </View>
          )
        }
      />
      {selected && supported ? (
        <ProviderAccountEditor
          key={`${selected.account.provider}:${selected.account.id}:${selected.report.accountRevision}`}
          scope={scope}
          projectId={projectId}
          report={selected.report}
          account={selected.account}
          onClose={() => {
            setSelected((latest) => latest === selected ? undefined : latest);
            if (current()) void query.refetch();
          }}
        />
      ) : null}
    </Sheet>
  );
}
export function CachedQuota({ quota }: { quota: DesktopQuota }) {
  const copy = useCopy();
  const state =
    quota.status === "ok"
      ? copy("Önbellekte mevcut", "Available in cache")
      : quota.status === "fetching"
        ? copy("Bilgisayarda kontrol ediliyor", "Checking on computer")
        : quota.status === "error"
          ? copy("Son kota kontrolü başarısız", "Last quota check failed")
          : copy("Kota bilgisi mevcut değil", "Quota information unavailable");
  return (
    <View style={{ gap: space.xs }}>
      <Body muted>
        {state}
        {quota.updatedAt ? ` · ${new Date(quota.updatedAt).toLocaleString()}` : ""}
      </Body>
      {quota.renewalPending ? (
        <Body muted>
          {copy(
            "Kimlik yenilemesini sağlayıcı CLI’ı bekliyor.",
            "Waiting for the provider CLI to renew authentication.",
          )}
        </Body>
      ) : null}
      {(["session", "weekly", "monthly"] as const).map((key) => {
        const value = quota[key];
        return value ? (
          <Body key={key}>
            {key === "session"
              ? copy("Oturum penceresi", "Session window")
              : key === "weekly"
                ? copy("Haftalık pencere", "Weekly window")
                : copy("Aylık pencere", "Monthly window")}{" "}
            · {copy("Kullanılan: %{p0}", "Used: {p0}%", { p0: value.usedPercent })}
            {value.resetsAt !== null
              ? ` · ${copy("Sıfırlanma", "Reset")} ${new Date(value.resetsAt).toLocaleString()}`
              : ""}
          </Body>
        ) : null;
      })}
    </View>
  );
}

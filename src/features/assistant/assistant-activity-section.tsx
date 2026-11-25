import { useState } from "react";
import type { AssistantActivity } from "../../../../src/shared/model/host-contracts/assistant";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Badge, Body, Button, Disclosure, Notice, Row, Section, Stack, StateView, StatusText } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { assistantActivityVisible, type AssistantHistoryAccess } from "./assistant-history";

/** Read-only projection of the Host's actual operation journal, never inferred from messages. */
export function AssistantActivitySection({ activity, access, loading }: {
  activity?: AssistantActivity[]; access: AssistantHistoryAccess; loading: boolean;
}) {
  const copy = useCopy(), locale = useLocale(), { uiStyles } = useMobileTheme();
  const [visibleCount, setVisibleCount] = useState(5);
  const actions = (activity ?? []).filter(item => assistantActivityVisible(item, access)).sort((left, right) => right.createdAt - left.createdAt);
  return <Section title={copy("Neler yaptım", "What I did")}>
    {activity === undefined ? loading ? <Body muted>{copy("İşlem geçmişi yükleniyor…", "Loading action history…")}</Body>
      : <StateView size="compact" title={copy("İşlem geçmişi şu anda kullanılamıyor.", "Action history is currently unavailable.")} /> : !actions.length ?
      <StateView size="compact" title={copy("Görünür geçmişte kayıtlı işlem yok.", "No recorded actions in visible history.")} /> : <Disclosure label={copy("Son işlemler ({p0})", "Recent actions ({p0})", { p0: actions.length })}>
        {actions.slice(0, visibleCount).map(item => {
          const operation = item.operation!;
          const date = new Date(item.createdAt);
          const time = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date) : copy("Zaman bilinmiyor", "Time unavailable");
          const outcome = operation.outcome;
          const outcomeLabels: Record<string, readonly [string, string]> = {
            started: ["Başladı", "Started"], completed: ["Tamamlandı", "Completed"], submitted: ["Gönderildi", "Submitted"],
            unknown: ["Sonuç bilinmiyor", "Outcome unknown"], failed: ["Başarısız", "Failed"], cancelled: ["İptal edildi", "Cancelled"],
            pending: ["Bekliyor", "Pending"], running: ["Çalışıyor", "Running"], waiting: ["Bekliyor", "Waiting"],
            accepted: ["Kabul edildi", "Accepted"], refused: ["Reddedildi", "Refused"],
          };
          const outcomeLabel = outcomeLabels[outcome] ? copy(...outcomeLabels[outcome]) : outcome;
          return <Stack key={item.id}>
            {/* Finished and accepted work is the normal case and reads as quiet text; only an outcome
                the owner must notice (failed, refused, unknown) is a badge. Running work keeps its live dot. */}
            <Row>{outcome === "unknown" || outcome === "failed" || outcome === "refused"
              ? <Badge label={outcomeLabel} tone={outcome === "unknown" ? "warning" : "danger"} />
              : <StatusText label={outcomeLabel} tone={outcome === "started" || outcome === "running" ? "live" : "default"} />}
              <Body muted style={uiStyles.caption}>{time}</Body></Row>
            <Body mono>{operation.tool}</Body>
            <Body>{operation.target}</Body>
            {outcome === "unknown" ? <Notice tone="warning" message={copy("Sonuç doğrulanamadı; bu kayıt başarı anlamına gelmez.", "Outcome could not be confirmed; this record does not mean success.")} /> : null}
          </Stack>;
        })}
        {actions.length > visibleCount ? <Button label={copy("Daha fazla işlem göster", "Show more actions")} tone="quiet" onPress={() => setVisibleCount(count => count + 10)} /> : null}
      </Disclosure>}
  </Section>;
}

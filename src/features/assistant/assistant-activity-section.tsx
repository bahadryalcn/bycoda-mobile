import { useState } from "react";
import type { AssistantActivity } from "../../../../src/shared/model/host-contracts/assistant";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Badge, Body, Button, Disclosure, Notice, Row, Section, Stack } from "@/ui/primitives";
import { assistantActivityVisible, type AssistantHistoryAccess } from "./assistant-history";

/** Read-only projection of the Host's actual operation journal, never inferred from messages. */
export function AssistantActivitySection({ activity, access, loading }: {
  activity?: AssistantActivity[]; access: AssistantHistoryAccess; loading: boolean;
}) {
  const copy = useCopy(), locale = useLocale();
  const [visibleCount, setVisibleCount] = useState(5);
  const actions = (activity ?? []).filter(item => assistantActivityVisible(item, access)).sort((left, right) => right.createdAt - left.createdAt);
  return <Section title={copy("Neler yaptım", "What I did")}>
    {activity === undefined ? <Body muted>{loading ? copy("İşlem geçmişi yükleniyor…", "Loading action history…") : copy("İşlem geçmişi şu anda kullanılamıyor.", "Action history is currently unavailable.")}</Body> : !actions.length ?
      <Body muted>{copy("Görünür geçmişte kayıtlı işlem yok.", "No recorded actions in visible history.")}</Body> : <Disclosure label={copy("Son işlemler ({p0})", "Recent actions ({p0})", { p0: actions.length })}>
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
            <Row><Badge label={outcomeLabel} tone={outcome === "unknown" ? "warning" : ["failed", "refused"].includes(outcome) ? "danger" : ["started", "running"].includes(outcome) ? "live" : outcome === "completed" ? "success" : "default"} /><Body muted>{time}</Body></Row>
            <Body mono>{operation.tool}</Body>
            <Body>{operation.target}</Body>
            {outcome === "unknown" ? <Notice tone="warning" message={copy("Sonuç doğrulanamadı; bu kayıt başarı anlamına gelmez.", "Outcome could not be confirmed; this record does not mean success.")} /> : null}
          </Stack>;
        })}
        {actions.length > visibleCount ? <Button label={copy("Daha fazla işlem göster", "Show more actions")} tone="quiet" onPress={() => setVisibleCount(count => count + 10)} /> : null}
      </Disclosure>}
  </Section>;
}

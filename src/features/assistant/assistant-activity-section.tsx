import { useState } from "react";
import type { AssistantActivity } from "../../../../src/shared/model/host-contracts/assistant";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { Badge, Body, Button, Notice, Row, Section, Stack, StatusText } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { assistantActivityVisible, type AssistantHistoryAccess } from "./assistant-history";

/** The area a tool works on, read from its id ("conversation:sessions.manage" → sessions); raw ids are never shown. */
const toolAreas: Record<string, readonly [string, string]> = {
  sessions: ["Oturumlar", "Sessions"], projects: ["Projeler", "Projects"], tasks: ["Görevler", "Tasks"],
  notes: ["Notlar", "Notes"], epics: ["Epikler", "Epics"], crews: ["Ekipler", "Crews"],
  automations: ["Otomasyonlar", "Automations"], inbox: ["Gelen kutusu", "Inbox"], tools: ["Araçlar", "Tools"],
};
export function assistantToolArea(tool: string): readonly [string, string] | undefined {
  const family = tool.split(":").pop()?.split(".")[0] ?? "";
  return toolAreas[family];
}

/**
 * Read-only projection of the Host's actual operation journal, never inferred from messages. The home
 * shows it only when the assistant did something: an empty journal is not news.
 */
export function AssistantActivitySection({ activity, access }: { activity?: AssistantActivity[]; access: AssistantHistoryAccess }) {
  const copy = useCopy(), locale = useLocale(), { uiStyles } = useMobileTheme();
  // The latest few are shown directly; more come in pages instead of behind an accordion.
  const [visibleCount, setVisibleCount] = useState(3);
  const actions = (activity ?? []).filter(item => assistantActivityVisible(item, access)).sort((left, right) => right.createdAt - left.createdAt);
  if (!actions.length) return null;
  return <Section title={copy("Neler yaptım", "What I did")}>
    <Stack>
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
        // An outcome the app does not know is said as unknown, never printed raw.
        const outcomeLabel = outcomeLabels[outcome] ? copy(...outcomeLabels[outcome]) : copy("Bilinmiyor", "Unknown");
        const area = assistantToolArea(operation.tool);
        return <Stack key={item.id}>
          {/* Finished and accepted work is the normal case and reads as quiet text; only an outcome
              the owner must notice (failed, refused, unknown) is a badge. Running work keeps its live dot. */}
          <Row>{outcome === "unknown" || outcome === "failed" || outcome === "refused"
            ? <Badge label={outcomeLabel} tone={outcome === "unknown" ? "warning" : "danger"} />
            : <StatusText label={outcomeLabel} tone={outcome === "started" || outcome === "running" ? "live" : "default"} />}
            <Body muted style={uiStyles.caption}>{area ? `${copy(...area)} · ${time}` : time}</Body></Row>
          <Body>{operation.target}</Body>
          {outcome === "unknown" ? <Notice tone="warning" message={copy("Sonuç doğrulanamadı; bu kayıt başarı anlamına gelmez.", "Outcome could not be confirmed; this record does not mean success.")} /> : null}
        </Stack>;
      })}
      {actions.length > visibleCount ? <Button label={copy("Daha fazla işlem göster", "Show more actions")} tone="quiet" onPress={() => setVisibleCount(count => count + 10)} /> : null}
    </Stack>
  </Section>;
}

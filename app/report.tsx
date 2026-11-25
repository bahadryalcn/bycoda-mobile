import { ContentReportScreen } from "../src/features/reporting/report-screen";
import { reportSender } from "../src/features/reporting/report-config";
import { UnavailableFormScreen } from "../src/features/settings/unavailable-form";
import { useCopy } from "../src/ui/copy";

/** Without a configured report service the form could never be sent, so it is not shown. */
export default function ReportRoute() {
  const copy = useCopy();
  if (!reportSender) return <UnavailableFormScreen
    title={copy("Yapay zekâ içeriğini şikâyet et", "Report AI content")}
    heading={copy("İçerik şikâyeti bu sürümde kullanılamıyor", "Content reports are not available in this version")}
    subject="bycoda content report" />;
  return <ContentReportScreen />;
}

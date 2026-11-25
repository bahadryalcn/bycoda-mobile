import { FeedbackScreen } from "../src/features/diagnostics/FeedbackScreen";
import { accountConfig } from "../src/features/account/model/config";
import { useAccount } from "../src/features/account/ui/account-context";
import { UnavailableFormScreen } from "../src/features/settings/unavailable-form";
import { useCopy } from "../src/ui/copy";

/** Without a feedback service in this build the form could never be sent, so it is not shown. */
export default function FeedbackRoute() {
  const copy = useCopy();
  const account = useAccount();
  // Same rule as feedbackClient: the signed-in client, else the anonymous one when an API is configured.
  const available = (account.status === "signedIn" && !!account.runtime) || !!accountConfig.apiUrl;
  if (!available) return <UnavailableFormScreen
    title={copy("Geri bildirim gönder", "Send feedback")}
    heading={copy("Uygulamadan geri bildirim bu sürümde kullanılamıyor", "In-app feedback is not available in this version")}
    subject="bycoda feedback" />;
  return <FeedbackScreen />;
}

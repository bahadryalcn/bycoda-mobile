import { router } from "expo-router";
import { Notice } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

/** Empty advertised provider lists need the same factual explanation and recovery. */
export function AgentProviderPrerequisite() {
  const copy = useCopy();
  return (
    <Notice
      tone="info"
      message={copy(
        "Bu bilgisayar kullanılabilir bir ajan bildirmedi. Sağlayıcıları kontrol et.",
        "This computer has not reported an available agent. Check providers.",
      )}
      retryLabel={copy("Sağlayıcı merkezi", "Provider center")}
      onRetry={() => router.navigate("/tools/providers")}
    />
  );
}

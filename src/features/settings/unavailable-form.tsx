import { Stack as RouterStack } from "expo-router";
import { Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { supportEmail } from "../legal/legal-content";
import { openSupportMail } from "./support-mail";

/**
 * A send form whose delivery service is not configured in this build. Instead of an editable form
 * that can never be sent, the page states that and offers e-mail, which only opens the mail app.
 */
export function UnavailableFormScreen({ title, heading, subject }: { title: string; heading: string; subject: string }) {
  const copy = useCopy();
  return (
    <Screen title={title}>
      <RouterStack.Screen options={{ title }} />
      <StateView
        size="region"
        tone="info"
        title={heading}
        description={copy("{p0} adresine e-posta ile yazabilirsin.", "You can write to {p0} by e-mail.", { p0: supportEmail })}
        action={{
          label: copy("E-posta yaz", "Write an e-mail"),
          onPress: () => openSupportMail(copy, subject),
        }}
      />
    </Screen>
  );
}

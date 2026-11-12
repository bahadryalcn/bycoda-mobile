import { Stack, useLocalSearchParams } from "expo-router";
import { ApprovalsScreen } from "@/features/approvals/approvals-screen";
import { useCopy } from "@/ui/copy";

export default function ApprovalsRoute() {
  const copy = useCopy();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: copy("Onaylar", "Approvals") }} />
      <ApprovalsScreen focusId={focus || undefined} />
    </>
  );
}

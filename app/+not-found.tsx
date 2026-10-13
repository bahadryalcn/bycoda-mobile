import { router } from "expo-router";
import { Button, Empty, Screen } from "../src/ui/primitives";
import { useCopy } from "../src/ui/copy";
export default function NotFound() {
  const copy = useCopy();
  return (
    <Screen>
      <Empty title={copy("Sayfa bulunamadı", "Page not found")} />
      <Button
        label={copy("Projelere dön", "Back to projects")}
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}

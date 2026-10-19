import { router } from "expo-router";
import { Button, Empty, Screen } from "../src/ui/primitives";
import { useCopy } from "../src/ui/copy";
import { space } from "../src/ui/tokens";

export default function NotFound() {
  const copy = useCopy();
  return (
    <Screen scroll={false}>
      <Empty title={copy("Sayfa bulunamadı", "Page not found")} />
      <Button
        label={copy("Projelere dön", "Back to projects")}
        tone="primary"
        onPress={() => router.replace("/")}
        style={{ alignSelf: "center", marginTop: space.lg }}
      />
    </Screen>
  );
}

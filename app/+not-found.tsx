import { Stack, router } from "expo-router";
import { Screen, StateView } from "../src/ui/primitives";
import { useCopy } from "../src/ui/copy";

export default function NotFound() {
  const copy = useCopy();
  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: copy("Sayfa bulunamadı", "Page not found"), headerTitle: "" }} />
      <StateView
        title={copy("Sayfa bulunamadı", "Page not found")}
        description={copy("Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.", "The page you were looking for may have moved or never existed.")}
        action={{ label: copy("Projelere git", "Go to projects"), onPress: () => router.replace("/") }}
      />
    </Screen>
  );
}

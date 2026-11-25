import { Stack as RouterStack } from "expo-router";
import { NavigationGroup, Screen, ValueRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import licenses from "./open-source-licenses.json";

/** Open-source packages bundled into the app, with their licenses; static data from package.json. */
export function LicensesScreen() {
  const copy = useCopy();
  return (
    <Screen>
      <RouterStack.Screen options={{ title: copy("Açık kaynak lisansları", "Open-source licenses") }} />
      {/* One list row per package: the shared value row keeps the list's height, type and separators. */}
      <NavigationGroup>
        {licenses.map((entry) => (
          <ValueRow key={entry.name} label={`${entry.name} ${entry.version}`} value={entry.license} />
        ))}
      </NavigationGroup>
    </Screen>
  );
}

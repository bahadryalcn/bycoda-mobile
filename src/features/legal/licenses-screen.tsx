import { View } from "react-native";
import { Stack as RouterStack } from "expo-router";
import { Body, Screen, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import licenses from "./open-source-licenses.json";

/** Open-source packages bundled into the app, with their licenses; static data from package.json. */
export function LicensesScreen() {
  const copy = useCopy();
  return (
    <Screen>
      <RouterStack.Screen options={{ title: copy("Açık kaynak lisansları", "Open-source licenses") }} />
      <Stack style={{ gap: space.sm }}>
        {licenses.map((entry) => (
          <View key={entry.name} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Body selectable style={{ flex: 1, minWidth: 0 }}>{`${entry.name} ${entry.version}`}</Body>
            <Body muted>{entry.license}</Body>
          </View>
        ))}
      </Stack>
    </Screen>
  );
}

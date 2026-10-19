import { Stack, useLocalSearchParams } from "expo-router";
import { ManagementScreen } from "../../src/features/management";
import { useMachines } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";
import { isManagementSection, managementSections } from "../../src/features/management/sections";

export default function ManagementRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const active = useMachines((s) => s.activeId);
  const copy = useCopy();
  const title = isManagementSection(section)
    ? copy(managementSections[section][0], managementSections[section][1])
    : copy("Bölüm bulunamadı", "Section not found");
  return (
    <>
      <Stack.Screen
        options={{ title }}
      />
      <ManagementScreen key={`${active}:${section}`} section={section} />
    </>
  );
}

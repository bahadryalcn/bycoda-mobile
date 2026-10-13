import { Stack, useLocalSearchParams } from "expo-router";
import { ManagementScreen } from "../../src/features/management";
import { useMachines } from "../../src/state/machines";
import { useCopy } from "../../src/ui/copy";

export default function ManagementRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const active = useMachines((s) => s.activeId);
  const copy = useCopy();
  const titles: Record<string, string> = {
    inbox: copy("Gelen kutusu", "Inbox"),
    tasks: copy("Görevler", "Tasks"),
    goals: copy("Hedefler", "Goals"),
    automations: copy("Otomasyonlar", "Automations"),
    notes: copy("Notlar", "Notes"),
    social: copy("Sosyal medya", "Social media"),
  };
  return (
    <>
      <Stack.Screen
        options={{ title: titles[section] ?? copy("Bölüm bulunamadı", "Section not found") }}
      />
      <ManagementScreen key={`${active}:${section}`} section={section} />
    </>
  );
}

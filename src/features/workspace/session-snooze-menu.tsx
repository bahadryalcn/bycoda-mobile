import Clock from "lucide-react-native/icons/clock";
import { useCopy } from "@/ui/copy";
import { stamp } from "../management/shared/format";
import { SessionActionList } from "./session-action-list";
import { sessionSnoozeTime, type SnoozePreset } from "./session-attention-model";

export function SessionSnoozeMenu({ disabled, onSelect }: {
  disabled: boolean;
  onSelect(until: number): void;
}) {
  const copy = useCopy();
  const now = Date.now();
  const presets: { key: SnoozePreset; label: string }[] = [
    { key: "hour", label: copy("1 saat", "1 hour") },
    { key: "evening", label: copy("Akşam 18:00", "Evening at 18:00") },
    { key: "tomorrow", label: copy("Yarın 09:00", "Tomorrow at 09:00") },
    { key: "week", label: copy("Gelecek hafta", "Next week") },
  ];
  return <SessionActionList actions={presets.map(({ key, label }) => {
    const until = sessionSnoozeTime(key, now);
    return { key, label, detail: stamp(until), icon: <Clock />, disabled, onPress: () => onSelect(until) };
  })} />;
}

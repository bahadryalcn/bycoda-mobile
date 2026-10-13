import type { ManagementScreenProps } from "./shared/types";
import { router } from "expo-router";
import type { ComponentType } from "react";
import { useCopy } from "@/ui/copy";
import { Empty, NavigationGroup, NavigationRow, Screen } from "@/ui/primitives";
import CheckSquare from "lucide-react-native/icons/square-check-big";
import Target from "lucide-react-native/icons/target";
import Clock from "lucide-react-native/icons/clock";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Inbox from "lucide-react-native/icons/inbox";
import { colors } from "@/ui/tokens";
import { useActiveMachine } from "@/state/machines";
import { Scope } from "./shared/scope";
import { TasksScreen } from "./tasks-screen";
import { GoalsScreen } from "./goals-screen";
import { AutomationsScreen } from "./automations-screen";
import { NotesScreen } from "./notes-screen";
import { InboxScreen } from "./inbox-screen";
import { SocialScreen } from "./social-screen";

export function ManagementHome() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const sections = [
    [
      "tasks",
      "Görevler",
      "Tasks",
      "Bilgisayardaki işleri sıraya alın ve ilerlemeyi izleyin.",
      "Queue work on your computer and follow its progress.",
    ],
    [
      "goals",
      "Hedefler",
      "Goals",
      "Birden fazla projedeki işi planlayın.",
      "Plan work across several projects.",
    ],
    [
      "automations",
      "Otomasyonlar",
      "Automations",
      "Zamanlanmış işleri ve çalışma geçmişini yönetin.",
      "Manage scheduled work and run history.",
    ],
    [
      "social",
      "Sosyal medya",
      "Social media",
      "Bağlı hesaplar, mesajlar, taslaklar ve kurallar.",
      "Connected accounts, messages, drafts and rules.",
    ],
    [
      "notes",
      "Notlar",
      "Notes",
      "Bilgisayarınızdaki notları okuyun ve düzenleyin.",
      "Read and edit the notes on your computer.",
    ],
  ];
  return (
    <Screen title={copy("Yönet", "Manage")}>
      {!machine ? (
        <Empty
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      ) : (
        <>
          <Scope allowAll />
          <NavigationGroup>
            {sections.map(([section, tr, en, detailTr, detailEn], index) => {
              const Icon = [CheckSquare, Target, Clock, MessageCircle, NotebookPen][index]!;
              return (
                <NavigationRow
                  key={section}
                  label={copy(tr, en)}
                  detail={copy(detailTr, detailEn)}
                  icon={<Icon size={21} strokeWidth={1.6} color={colors.accent} />}
                  detailLines={2}
                  onPress={() => router.push(`/manage/${section}`)}
                />
              );
            })}
          </NavigationGroup>
        </>
      )}
    </Screen>
  );
}
export function ManagementScreen({ section }: ManagementScreenProps) {
  const machine = useActiveMachine();
  const copy = useCopy();
  if (!machine)
    return (
      <Screen>
        <Empty
          title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      </Screen>
    );
  const screens: Record<string, ComponentType> = {
    tasks: TasksScreen,
    goals: GoalsScreen,
    automations: AutomationsScreen,
    notes: NotesScreen,
    inbox: InboxScreen,
    social: SocialScreen,
  };
  const Component = screens[section];
  return Component ? (
    <Component key={`${machine.id}:${section}`} />
  ) : (
    <Screen>
      <Empty title={copy("Bölüm bulunamadı", "Section not found")} />
    </Screen>
  );
}

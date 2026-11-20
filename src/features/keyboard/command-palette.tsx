import { useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { router, type Href } from "expo-router";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { Body, Button, ErrorText, Input, Loading, NavigationRow, Sheet } from "@/ui/primitives";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isAppContentVisible } from "@/state/security";
import { useProjectActivity } from "@/features/workspace/use-project-activity";
import { listedSession } from "@/features/workspace/session-collection";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import { appCommands } from "./command-model";
import { movePaletteSelection, searchPalette, showsNoMatches, type PaletteEntry } from "./keyboard-model";

export function CommandPalette({ onClose }: { onClose(): void }) {
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const list = useRef<FlatList<PaletteEntry>>(null);
  const entries: PaletteEntry[] = appCommands(copy);
  if (activity.projects.readable && activity.directoryReady && machine) {
    for (const project of activity.projects.data ?? []) {
      if (!activity.projects.isProjectVisible(project.id, project.cwd)) continue;
      entries.push({ id: `project:${project.id}`, label: project.name, detail: project.cwd, kind: "project", destination: { pathname: "/project/[id]", params: { id: project.id, machineId: machine.id } } });
    }
    for (const { session, project } of activity.directory) {
      if (!listedSession(session) || !activity.projects.isProjectVisible(project.id, project.cwd)) continue;
      entries.push({ id: `session:${session.id}`, label: session.title || copy("Adsız oturum", "Untitled session"), detail: project.name, kind: "session", destination: { pathname: "/session/[id]", params: { id: session.id, projectId: project.id, machineId: machine.id } } });
    }
  }
  const matches = searchPalette(entries, query, locale);
  const current = Math.min(selected, matches.length - 1);
  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry || !isAppContentVisible()) return;
    if (entry.kind === "project" || entry.kind === "session") {
      const params = entry.destination.params;
      const projectId = entry.kind === "project" ? params?.id : params?.projectId;
      if (!projectId || useMachines.getState().activeId !== params?.machineId || !activity.projects.isProjectVisible(projectId)) return;
    }
    onClose();
    router.navigate(entry.destination as Href);
  };
  const move = (direction: -1 | 1) => {
    const index = movePaletteSelection(current, matches.length, direction);
    setSelected(index);
    if (index >= 0) list.current?.scrollToIndex({ index, animated: false });
  };
  useKeyCommand({ key: "Escape", title: copy("Kapat", "Close"), priority: 100 }, onClose);
  useKeyCommand({ key: "ArrowDown", title: copy("Sonraki sonuç", "Next result"), priority: 100 }, () => move(1));
  useKeyCommand({ key: "ArrowUp", title: copy("Önceki sonuç", "Previous result"), priority: 100 }, () => move(-1));
  useKeyCommand({ key: "Enter", title: copy("Aç", "Open"), priority: 100 }, () => choose(matches[current]));
  return <Sheet visible title={copy("Komut paleti", "Command palette")} onClose={onClose} scroll={false} size="form">
    {/* A non-scrolling sheet body leaves the side gutter to its content. */}
    <View style={{ flex: 1, minHeight: 0, gap: space.sm, paddingHorizontal: space.screen }}>
      <Input label={copy("Ara", "Search")} value={query} autoFocus
        onChangeText={(value) => { setQuery(value); setSelected(0); }}
        onSubmitEditing={() => choose(matches[current])} returnKeyType="go" />
      <FlatList ref={list} data={matches} keyExtractor={(entry) => entry.id} keyboardShouldPersistTaps="handled"
        style={{ flex: 1, minHeight: 0 }} extraData={current}
        ListHeaderComponent={<>
          {activity.pending ? <Loading /> : null}
          <ErrorText error={activity.error} />
          {activity.error ? <Button label={copy("Yeniden dene", "Retry")} onPress={() => { void activity.refetch().catch(() => {}); }} /> : null}
        </>}
        ListEmptyComponent={showsNoMatches(activity) ? <Body muted>{copy("Eşleşme yok", "No matches")}</Body> : undefined}
        onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
        renderItem={({ item, index }) => <NavigationRow label={item.label} detail={item.detail} selected={index === current} onPress={() => choose(item)} />} />
    </View>
  </Sheet>;
}

import { useEffect, useRef, type ComponentType, type ComponentRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import AtSign from "lucide-react-native/icons/at-sign";
import Bot from "lucide-react-native/icons/bot";
import File from "lucide-react-native/icons/file";
import Folder from "lucide-react-native/icons/folder";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import ListChecks from "lucide-react-native/icons/list-checks";
import Notebook from "lucide-react-native/icons/notebook";
import Server from "lucide-react-native/icons/server";
import Sparkles from "lucide-react-native/icons/sparkles";
import Terminal from "lucide-react-native/icons/terminal";
import Users from "lucide-react-native/icons/users";
import { Body, Button, ErrorText, Loading, NavigationGroup, NavigationRow, RowIcon, SectionHeader } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import type { ComposerGroup, ComposerSuggestion } from "./composer-catalog-model";

const glyphs: Record<ComposerSuggestion["kind"], ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  source: AtSign, file: File, folder: Folder, issue: ListChecks, pr: GitPullRequest,
  crew: Users, agent: Bot, note: Notebook, server: Server, skill: Sparkles, command: Terminal, template: Notebook,
};

type Props = {
  keyboardActive?: boolean;
  maximumHeight: number;
  items: ComposerSuggestion[];
  loading: boolean;
  error: unknown;
  trigger: string;
  query?: string;
  selected?: string;
  onMove: (direction: -1 | 1) => void;
  onPick: (item: ComposerSuggestion) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function ComposerSuggestions({
  items, loading, error, trigger, query, selected, keyboardActive = false, onMove, onPick, onRetry, onClose, maximumHeight,
}: Props) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const first = items.find((item) => !item.unavailable);
  const highlighted = items.find((item) => item.id === selected && !item.unavailable);
  const canNavigate = keyboardActive && !!first;
  useKeyCommand({ key: "ArrowDown", title: copy("Sonraki sonuç", "Next result"), enabled: canNavigate, priority: 20, textInput: true }, () => onMove(1));
  useKeyCommand({ key: "ArrowUp", title: copy("Önceki sonuç", "Previous result"), enabled: canNavigate, priority: 20, textInput: true }, () => onMove(-1));
  useKeyCommand({ key: "Enter", title: copy("Seç", "Select"), enabled: canNavigate && !!highlighted, priority: 20, textInput: true }, () => { if (highlighted) onPick(highlighted); });
  useKeyCommand({ key: "Tab", title: copy("Seç", "Select"), enabled: canNavigate, priority: 20, textInput: true }, () => { if (highlighted ?? first) onPick((highlighted ?? first)!); });
  useKeyCommand({ key: "Escape", title: copy("Kapat", "Close"), enabled: keyboardActive, priority: 20, textInput: true }, onClose);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const position = useRef(new Map<string, number>());
  useEffect(() => { list.current?.scrollTo({ y: 0, animated: false }); }, [query, trigger]);
  useEffect(() => {
    if (selected && position.current.has(selected))
      list.current?.scrollTo({ y: position.current.get(selected), animated: false });
  }, [selected]);
  const titles: Record<ComposerGroup, string> = {
    sources: copy("Kaynaklar", "Sources"),
    files: copy("Proje dosyaları", "Project files"),
    issues: copy("Sorunlar", "Issues"),
    pulls: copy("Pull request’ler", "Pull requests"),
    crews: copy("Ekipler", "Crews"),
    agents: copy("Ajanlar", "Agents"),
    notes: copy("Notlar", "Notes"),
    servers: copy("Sunucular", "Servers"),
    commands: copy("Komutlar ve beceriler", "Commands and skills"),
    skills: copy("Beceriler", "Skills"),
    groups: copy("Beceri grupları", "Skill groups"),
    templates: copy("Şablonlar", "Templates"),
  };
  const label = trigger === "@" ? copy("Bahsetmeler", "Mentions") : trigger === "$" ? titles.skills : titles.commands;

  // The composer frame is already a ScrollView. This bounded collection avoids
  // nesting a VirtualizedList under it, including when the keyboard is closed.
  return (
    <ScrollView ref={list} accessibilityLabel={label} onAccessibilityEscape={onClose}
      style={{ maxHeight: maximumHeight, minHeight: 0, flexGrow: 0, flexShrink: 1, backgroundColor: colors.background,
        borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }}
      keyboardShouldPersistTaps="always" nestedScrollEnabled scrollsToTop={false}
      contentContainerStyle={{ paddingBottom: space.xs }}>
      <NavigationGroup>
        {items.map((item, index) => {
          const group = item.group ?? "files";
          const startsGroup = index === 0 || group !== (items[index - 1]?.group ?? "files");
          const path = (item.kind === "file" || item.kind === "folder") ? item.path : undefined;
          const leaf = path?.replace(/\/$/, "").split("/").at(-1);
          const title = leaf ?? (item.kind === "skill" || item.kind === "command" ? `${trigger}${item.name}` : item.name);
          const detail = [path?.includes("/") && path !== leaf ? path : item.detail, item.unavailable].filter(Boolean).join("\n");
          return <View key={item.id} onLayout={(event) => { position.current.set(item.id, event.nativeEvent.layout.y); }}>
            {startsGroup ? <SectionHeader title={titles[group]} /> : null}
            <NavigationRow
              label={title} detail={detail} detailLines={item.unavailable ? 0 : 3} detailSelectable={false}
              icon={<RowIcon glyph={glyphs[item.kind]} />}
              intent="select" selected={item.id === selected} disabled={!!item.unavailable} separator={false}
              onPress={() => onPick(item)}
            />
          </View>;
        })}
      </NavigationGroup>
      {loading || !!error || !items.length ? (
        <View style={{ paddingHorizontal: space.sm, paddingVertical: space.xs, gap: space.xs }}>
          {loading ? <Loading /> : null}
          <ErrorText error={error} />
          {error ? <Button label={copy("Yeniden dene", "Retry")} busy={loading} onPress={onRetry} /> : null}
          {!loading && !error && !items.length ? <Body muted>{copy("Eşleşme yok", "No matches")}</Body> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

import { memo, useState } from "react";
import { Linking, View } from "react-native";
import Globe from "lucide-react-native/icons/globe";
import { Body, Button } from "@/ui/primitives";
import { ChatChangedFile } from "@/ui/chat";
import { ChatSummary } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { showToast } from "@/ui/toast";
import { errorMessage } from "@/ui/error-message";
import { isLoopbackWebUrl } from "@/ui/loopback-link";
import { space } from "@/ui/tokens";
import {
  COLLAPSED_SUMMARY_ROWS,
  displayChangedPath,
  splitChangedPath,
  type TurnChangedFile,
  type TurnSource,
  type TurnSummary,
} from "./transcript-turn-summary";

type Copy = ReturnType<typeof useCopy>;

/** "Show 3 more files" / "Show fewer files": lengthens the list in place, so it is a plain action. */
function moreLabel(hidden: number, expanded: boolean, kind: "files" | "sources", copy: Copy) {
  if (expanded) return kind === "files" ? copy("Daha az dosya göster", "Show fewer files") : copy("Daha az kaynak göster", "Show fewer sources");
  if (kind === "files")
    return hidden === 1
      ? copy("{p0} dosya daha göster", "Show {p0} more file", { p0: hidden })
      : copy("{p0} dosya daha göster", "Show {p0} more files", { p0: hidden });
  return hidden === 1
    ? copy("{p0} kaynak daha göster", "Show {p0} more source", { p0: hidden })
    : copy("{p0} kaynak daha göster", "Show {p0} more sources", { p0: hidden });
}

export function changedFilesHeading(files: readonly TurnChangedFile[], copy: Copy) {
  return files.length === 1
    ? copy("1 dosya değişti", "1 file changed")
    : copy("{p0} dosya değişti", "{p0} files changed", { p0: files.length });
}

function useCollapsed<T>(items: readonly T[]) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED_SUMMARY_ROWS);
  return { expanded, toggle: () => setExpanded((open) => !open), visible, hidden: items.length - visible.length, more: items.length > COLLAPSED_SUMMARY_ROWS };
}

function SectionLabel({ children }: { children: string }) {
  const { uiStyles } = useMobileTheme();
  return (
    <Body muted selectable={false} accessibilityRole="header" style={[uiStyles.caption, { paddingHorizontal: space.sm }]}>
      {children}
    </Body>
  );
}

function ChangedFiles({ files, cwd, onOpen }: { files: readonly TurnChangedFile[]; cwd?: string; onOpen?: (file: TurnChangedFile) => void }) {
  const copy = useCopy();
  const list = useCollapsed(files);
  return (
    <View style={{ gap: space.xxs }}>
      <SectionLabel>{changedFilesHeading(files, copy)}</SectionLabel>
      {list.visible.map((file) => {
        const path = displayChangedPath(file.path, cwd);
        const { name, folder } = splitChangedPath(path);
        const statusLabel = file.status === "added" ? copy("Eklendi", "Added") : file.status === "deleted" ? copy("Silindi", "Deleted") : undefined;
        return (
          <ChatChangedFile
            key={file.key}
            name={name}
            folder={folder}
            status={file.status}
            statusLabel={statusLabel}
            counts={file.counts}
            accessibilityLabel={[path, statusLabel, file.counts ? `+${file.counts.additions} −${file.counts.deletions}` : undefined].filter(Boolean).join(", ")}
            onPress={onOpen && file.blockIds.length ? () => onOpen(file) : undefined}
          />
        );
      })}
      {list.more ? (
        <Button tone="quiet" density="compact" flush style={{ alignSelf: "flex-start" }} label={moreLabel(list.hidden, list.expanded, "files", copy)} onPress={list.toggle} />
      ) : null}
    </View>
  );
}

function Sources({ sources }: { sources: readonly TurnSource[] }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const list = useCollapsed(sources);
  // A search result opens in the phone's browser; a failure is a transient toast, like other link opens.
  const open = (url: string) => {
    void Linking.openURL(url).catch((cause: unknown) => showToast({ tone: "danger", message: errorMessage(cause, copy) }));
  };
  return (
    <View style={{ gap: space.xxs }}>
      <SectionLabel>{copy("Kaynaklar", "Sources")}</SectionLabel>
      {list.visible.map((source) => (
        <ChatSummary
          key={source.url}
          label={source.title}
          detail={source.domain !== source.title ? source.domain : undefined}
          icon={<Globe size={16} color={colors.muted} />}
          onPress={() => open(source.url)}
        />
      ))}
      {list.more ? (
        <Button tone="quiet" density="compact" flush style={{ alignSelf: "flex-start" }} label={moreLabel(list.hidden, list.expanded, "sources", copy)} onPress={list.toggle} />
      ) : null}
    </View>
  );
}

/**
 * Desktop's end-of-turn strip: the files the settled turn changed (each opens that file's edits in
 * the activity inspector) and the web pages its searches read. Data comes only from the turn's
 * recorded tool blocks; nothing is fetched.
 */
export const TranscriptTurnSummary = memo(function TranscriptTurnSummary({
  summary,
  cwd,
  onOpenFile,
}: {
  summary: TurnSummary;
  cwd?: string;
  onOpenFile?: (file: TurnChangedFile) => void;
}) {
  // Loopback pages name a service on the computer; only the session browser may open those.
  const sources = summary.sources.filter((source) => !isLoopbackWebUrl(source.url));
  if (!summary.files.length && !sources.length) return null;
  return (
    <View style={{ gap: space.sm, paddingTop: space.xs }}>
      {summary.files.length ? <ChangedFiles files={summary.files} cwd={cwd} onOpen={onOpenFile} /> : null}
      {sources.length ? <Sources sources={sources} /> : null}
    </View>
  );
});

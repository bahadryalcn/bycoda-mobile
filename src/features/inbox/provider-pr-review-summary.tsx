import { StyleSheet, View } from "react-native";
import FileMinus from "lucide-react-native/icons/file-minus";
import FilePen from "lucide-react-native/icons/file-pen";
import FilePlus from "lucide-react-native/icons/file-plus";
import FileSymlink from "lucide-react-native/icons/file-symlink";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { Badge, Body, Heading, NavigationRow, RowIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { useDelayedVisible } from "@/ui/use-delayed-visible";
import { providerStateLabel } from "./provider-labels";
import { ProviderState } from "./issue-record-row";
import { statusTone } from "./provider-view-model";
import { splitPath, type PrDiffFile, type PrDiffFileStatus } from "./provider-pr-diff-model";
import type { PrReviewContext } from "./provider-review-model";

type Copy = ReturnType<typeof useCopy>;


/** Identity first, from the record the detail screen already holds; the head chip joins when the diff is read. */
export function PrReviewHeader({ item, context }: { item: RemoteInboxItem; context?: PrReviewContext }) {
  const copy = useCopy();
  return (
    <View style={{ gap: space.xs }}>
      <Heading>{item.title}</Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        {/* Same status presentation as the record page: Draft replaces the state, ordinary states are quiet text. */}
        {item.draft ? <Badge label={copy("Taslak", "Draft")} /> : <ProviderState label={providerStateLabel(item.state, copy)} tone={statusTone(item)} />}
        <Body muted selectable style={{ flexShrink: 1 }}>{`${item.repo || item.projectPath} #${item.number}`}</Body>
        {context ? <CommitChip commitId={context.commitId} /> : null}
      </View>
    </View>
  );
}

export function CommitChip({ commitId }: { commitId: string }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
    <View accessible accessibilityLabel={copy("Commit {p0}", "Commit {p0}", { p0: commitId.slice(0, 7) })}
      style={{ borderRadius: radii.badge, backgroundColor: colors.fill, paddingHorizontal: space.sm, paddingVertical: space.xxs }}>
      <Body mono selectable style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.muted }}>{commitId.slice(0, 7)}</Body>
    </View>
  );
}

/** Additions and deletions as one run so the two totals never split across lines. */
export function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  const { colors } = useMobileTheme();
  const numbers = new Intl.NumberFormat(useLocale());
  const style = { fontSize: fontSize.small, lineHeight: lineHeight.small, fontVariant: ["tabular-nums" as const] };
  return (
    <Body selectable={false} numberOfLines={1} style={[style, { flexShrink: 0 }]}>
      <Body selectable={false} style={[style, { color: colors.diffAddText }]}>{`+${numbers.format(additions)}`}</Body>
      {"  "}
      <Body selectable={false} style={[style, { color: colors.diffDelText }]}>{`−${numbers.format(deletions)}`}</Body>
    </Body>
  );
}

export function prFileStatusLabel(status: PrDiffFileStatus, copy: Copy) {
  if (status === "added") return copy("Eklendi", "Added");
  if (status === "deleted") return copy("Silindi", "Deleted");
  if (status === "renamed") return copy("Yeniden adlandırıldı", "Renamed");
  return copy("Değiştirildi", "Modified");
}

const STATUS_GLYPH = { added: FilePlus, deleted: FileMinus, renamed: FileSymlink, modified: FilePen } as const;

/** Name first, folder under it, change totals on the right; only unusual changes get a badge. */
export function PrFileRow({ file, comments, onPress }: { file: PrDiffFile; comments: number; onPress: () => void }) {
  const copy = useCopy();
  const { name, directory } = splitPath(file.path);
  const status = prFileStatusLabel(file.status, copy);
  const commentLabel = comments ? copy("{p0} bekleyen yorum", "{p0} pending comments", { p0: comments }) : undefined;
  return (
    <NavigationRow
      separator
      icon={<RowIcon glyph={STATUS_GLYPH[file.status]} tone={file.status === "deleted" ? "danger" : undefined} />}
      label={name}
      labelLines={2}
      detail={directory || undefined}
      detailLines={2}
      detailEllipsizeMode="middle"
      supporting={file.status !== "modified" || commentLabel ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          {file.status !== "modified" ? <Badge label={status} tone={file.status === "added" ? "success" : file.status === "deleted" ? "danger" : "default"} /> : null}
          {file.previousPath ? <Body muted numberOfLines={1} ellipsizeMode="middle" style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, flexShrink: 1 }}>
            {copy("Eski ad: {p0}", "From {p0}", { p0: file.previousPath })}</Body> : null}
          {commentLabel ? <Badge label={commentLabel} tone="info" /> : null}
        </View>
      ) : undefined}
      trailing={<DiffStats additions={file.additions} deletions={file.deletions} />}
      accessibilityLabel={[file.path, status, `+${file.additions} −${file.deletions}`, commentLabel].filter(Boolean).join(". ")}
      onPress={onPress}
    />
  );
}

const NAME_WIDTHS = ["58%", "44%", "66%", "50%"] as const;

/** Shaped like the file rows (glyph, name, folder, totals) so nothing jumps when they arrive. */
export function PrFilesSkeleton({ rows = 5 }: { rows?: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const visible = useDelayedVisible();
  const bar = (height: number, width: string | number, fill = colors.raised) =>
    <View style={{ height, width: width as number, borderRadius: radii.badge, backgroundColor: fill }} />;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={copy("Değişen dosyalar yükleniyor", "Loading changed files")} accessibilityState={{ busy: true }}>
      <View importantForAccessibility="no-hide-descendants" style={{ opacity: visible ? 1 : 0 }}>
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: metrics.rowHeightSession, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }}>
            <View style={{ width: metrics.rowLeading, alignItems: "center" }}>{bar(18, 16)}</View>
            <View style={{ flex: 1, gap: space.sm }}>
              {bar(13, NAME_WIDTHS[index % NAME_WIDTHS.length]!)}
              {bar(10, "36%", colors.panel)}
            </View>
            {bar(11, 52, colors.panel)}
          </View>
        ))}
      </View>
    </View>
  );
}

import type { TextInputInstance } from "react-native";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { useIsFocused } from "expo-router/react-navigation";
import type { GitBlameLine, GitChangedFile, GitFileDiff, GitHistory, GitHistoryCommit } from "../../../../src/platform/tauri/fs";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { Badge, Body, Button, CodeText, Disclosure, IconButton, NavigationRow, QueryState, Row, ScreenList, SearchField, SegmentedControl } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { gitFilePresentation } from "./git-file-presentation";
import { relativeTime } from "./shared";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { useDiffPreview } from "./use-diff-preview";
import { GitDiffViewer } from "./git-diff-viewer";
import { useGitHistoryRead } from "./git-history-queries";

type HistoryView =
  | { kind: "history" }
  | { kind: "commit"; commit: GitHistoryCommit }
  | { kind: "file"; commit: GitHistoryCommit; path: string; mode: "diff" | "blame" | "fileHistory" };

/** Separate virtualized page: history never nests another growing list in the changes list. */
export function GitHistoryPanel({ scope, onClose }: { scope: GitScope; onClose: () => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [view, setView] = useState<HistoryView>({ kind: "history" });
  const back = useCallback(() => {
    if (view.kind === "history") onClose();
    else if (view.kind === "file") setView({ kind: "commit", commit: view.commit });
    else setView({ kind: "history" });
  }, [view, onClose]);
  const focused = useIsFocused();
  useBackHandler(focused, back);
  const header = <View style={{ gap: space.sm }}>
    <Row>
    <IconButton label={copy("Geri", "Back")} onPress={back}><ArrowLeft size={20} color={colors.muted} /></IconButton>
    <Body style={{ flex: 1, minWidth: 0, fontWeight: "600" }}>{copy("Commit geçmişi", "Commit history")}</Body>
    </Row>
    {view.kind !== "history" ? <>
      <Body>{view.commit.subject}</Body>
    </> : null}
    <Disclosure label={copy("Ayrıntılar", "Details")}>
      <Body mono selectable>{scope.root}</Body>
      {view.kind !== "history" ? <Body mono muted selectable>{view.commit.sha}</Body> : null}
    </Disclosure>
  </View>;
  if (view.kind === "history") return <CommitList scope={scope} header={header} onSelect={(commit) => setView({ kind: "commit", commit })} />;
  if (view.kind === "commit") return <CommitFiles scope={scope} commit={view.commit} header={header} onSelect={(path) => setView({ kind: "file", commit: view.commit, path, mode: "diff" })} />;
  return <HistoricalFile scope={scope} commit={view.commit} path={view.path} mode={view.mode}
    header={<View style={{ gap: space.sm }}>{header}<Body mono>{view.path}</Body>
      <SegmentedControl hideLabel label={copy("Görünüm", "View")} value={view.mode}
        options={[
          { value: "diff", label: copy("Diff", "Diff") },
          { value: "blame", label: copy("Satır geçmişi", "Blame") },
          { value: "fileHistory", label: copy("Dosya geçmişi", "File history") },
        ]} onChange={(mode) => setView({ ...view, mode })} />
    </View>}
    onSelect={(commit) => setView({ kind: "commit", commit })} />;
}

type ListProps = { scope: GitScope; header: ReactNode; onSelect: (commit: GitHistoryCommit) => void };
function CommitList({ scope, header, onSelect, path }: ListProps & { path?: string }) {
  const copy = useCopy();
  const locale = useLocale();
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInputInstance>(null);
  const query = useGitHistoryRead<GitHistory | GitHistoryCommit[]>(scope, path
    ? { kind: "fileHistory", path, limit } : { kind: "history", limit });
  const commits = query.data ? (Array.isArray(query.data) ? query.data : query.data.commits) : [];
  const filtered = commits.filter((commit) => matchesSearch(`${commit.subject} ${commit.author} ${commit.sha}`, search, locale));
  return <ScreenList data={filtered} keyExtractor={(commit) => commit.sha} query={query}
    header={<View style={{ gap: space.sm }}>{header}
      {path ? <Body>{copy("Dosya geçmişi · mevcut dal", "File history · current branch")}</Body> : null}
      <SearchField ref={searchRef} label={copy("Yüklenen commitlerde ara", "Search loaded commits")} value={search} maxLength={200} onChangeText={setSearch} />
      <QueryState query={commits.length ? query : { ...query, data: undefined }} empty={!filtered.length}
        emptyTitle={search.trim() ? copy("Aramana uyan commit yok.", "No commits match your search.") : copy("Commit bulunamadı", "No commits found")}
        emptyAction={search.trim() ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => { setSearch(""); searchRef.current?.focus(); } } : undefined} />
    </View>}
    footer={commits.length >= limit ? (limit < 500
      ? <Button label={copy("Daha fazla yükle", "Load more")} onPress={() => setLimit((current) => Math.min(500, current + 100))} disabled={query.isFetching} />
      : <Body muted>{copy("En fazla 500 commit gösteriliyor.", "Showing up to 500 commits.")}</Body>) : undefined}
    renderItem={({ item }) => <GitHistoryCommitRow commit={item} onSelect={() => onSelect(item)} />} />;
}

/** Presentation-only row also supports isolated rendering with safe fixture data. */
export function GitHistoryCommitRow({ commit, onSelect }: { commit: GitHistoryCommit; onSelect: () => void }) {
  const copy = useCopy();
  return <NavigationRow label={commit.subject || commit.shortSha} labelLines={2} emphasized
    detail={`${commit.author} · ${relativeTime(commit.timestamp * 1000, copy)}`}
    trailing={<CodeText selectable={false}>{commit.shortSha}</CodeText>} onPress={onSelect} />;
}

function CommitFiles({ scope, commit, header, onSelect }: { scope: GitScope; commit: GitHistoryCommit; header: ReactNode; onSelect: (path: string) => void }) {
  const copy = useCopy();
  const query = useGitHistoryRead<GitChangedFile[]>(scope, { kind: "files", sha: commit.sha });
  return <ScreenList data={query.data ?? []} keyExtractor={(file) => file.relative} query={query}
    header={<View style={{ gap: space.sm }}>{header}<QueryState query={query.data?.length ? query : { ...query, data: undefined }} empty={!query.data?.length}
      emptyTitle={copy("Bu committe dosya farkı yok", "No file changes in this commit")} /></View>}
    renderItem={({ item }) => <CommitFileRow file={item} onSelect={() => onSelect(item.relative)} />} />;
}

function CommitFileRow({ file, onSelect }: { file: GitChangedFile; onSelect: () => void }) {
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const status = gitFilePresentation(file.status);
  const label = status.kind === "added" ? copy("Eklendi", "Added") : status.kind === "deleted" ? copy("Silindi", "Deleted")
    : status.kind === "renamed" ? copy("Yeniden adlandırıldı", "Renamed") : copy("Değiştirildi", "Modified");
  const path = file.relative.replaceAll("\\", "/");
  const cut = path.lastIndexOf("/");
  return <NavigationRow label={path.slice(cut + 1)} labelLines={2}
    detail={cut > 0 ? path.slice(0, cut) : undefined} detailEllipsizeMode="middle"
    accessibilityLabel={`${file.relative}. ${label}. +${numbers.format(file.additions)} −${numbers.format(file.deletions)}`}
    supporting={<Row><Badge label={label} tone={status.tone} /><Body muted>{`+${numbers.format(file.additions)} −${numbers.format(file.deletions)}`}</Body></Row>}
    onPress={onSelect} />;
}

function HistoricalFile({ scope, commit, path, mode, header, onSelect }: ListProps & { commit: GitHistoryCommit; path: string; mode: "diff" | "blame" | "fileHistory" }) {
  if (mode === "fileHistory") return <CommitList scope={scope} path={path} header={header} onSelect={onSelect} />;
  if (mode === "blame") return <HistoricalBlame scope={scope} commit={commit} path={path} header={header} />;
  return <HistoricalDiff scope={scope} commit={commit} path={path} header={header} />;
}

type FileProps = { scope: GitScope; commit: GitHistoryCommit; path: string; header: ReactNode };
function HistoricalDiff({ scope, commit, path, header }: FileProps) {
  const copy = useCopy();
  const query = useGitHistoryRead<GitFileDiff>(scope, { kind: "diff", sha: commit.sha, path });
  const textDiff = query.data && !query.data.binary && !query.data.tooLarge ? query.data : undefined;
  const preview = useDiffPreview(textDiff?.original, textDiff?.current);
  return <ScreenList data={[]} renderItem={() => null} query={query} header={<View style={{ gap: space.sm }}>{header}<QueryState query={query} />
    {textDiff && !preview ? <Body muted>{copy("Diff hesaplanıyor…", "Computing diff…")}</Body> : null}
    {query.data?.binary || query.data?.tooLarge || preview?.tooLarge ? <Body muted>{copy("İkili veya diff için çok büyük dosya. Tam içeriği bilgisayarda aç.", "Binary file or diff exceeds the mobile budget. Open the full content on your computer.")}</Body>
      : preview?.unchanged ? <Body muted>{copy("İçerikte değişiklik yok.", "No content changes.")}</Body>
        : preview ? <GitDiffViewer key={`${commit.sha}:${path}`} lines={preview.lines} /> : null}
    {preview?.truncated ? <Body muted>{copy("İlk 4.000 diff satırı gösteriliyor.", "Showing the first 4,000 diff lines.")}</Body> : null}
  </View>} />;
}

function HistoricalBlame({ scope, commit, path, header }: FileProps) {
  const copy = useCopy();
  const content = useGitHistoryRead<GitFileDiff>(scope, { kind: "diff", sha: commit.sha, path });
  const supported = !!content.data && !content.data.binary && !content.data.tooLarge && content.data.status !== "deleted";
  const query = useGitHistoryRead<GitBlameLine[]>(scope, { kind: "blame", sha: commit.sha, path }, supported);
  const lines = useMemo(() => content.data?.current.split(/\r?\n/) ?? [], [content.data]);
  return <ScreenList data={supported ? query.data ?? [] : []} keyExtractor={(line) => String(line.line)} query={supported ? query : content}
    header={<View style={{ gap: space.sm }}>{header}<QueryState query={content} />
      {supported ? <QueryState query={query.data?.length ? query : { ...query, data: undefined }} empty={!query.data?.length} emptyTitle={copy("Satır geçmişi yok", "No blame lines")} /> : null}
      {content.data && !supported ? <Body muted>{content.data.status === "deleted"
        ? copy("Dosya bu committe silinmiş. Satır geçmişi önceki committen açılabilir.", "This file was deleted in this commit. Open its parent commit to inspect blame.")
        : copy("İkili veya diff için çok büyük dosya. Tam içeriği bilgisayarda aç.", "Binary file or diff exceeds the mobile budget. Open the full content on your computer.")}</Body> : null}
    </View>}
    renderItem={({ item }) => <GitBlameRow line={item} content={lines[item.line - 1]} />} />;
}

export function GitBlameRow({ line, content }: { line: GitBlameLine; content?: string }) {
  const copy = useCopy();
  return <View style={{ gap: space.xs, paddingVertical: space.sm }}>
    <Body mono muted>{line.line} · {line.shortSha}</Body><Body>{line.summary}</Body>
    <Body muted>{line.author} · {relativeTime(line.timestamp * 1000, copy)}</Body>
    <Body mono>{content}</Body>
  </View>;
}

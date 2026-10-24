import { useCallback, useMemo, useState, type ReactNode } from "react";
import { BackHandler, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { GitBlameLine, GitChangedFile, GitFileDiff, GitHistory, GitHistoryCommit } from "../../../../src/platform/tauri/fs";
import { Body, Button, Empty, NavigationRow, QueryState, Row, ScreenList, SearchField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
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
  useMobileTheme();
  const copy = useCopy();
  const [view, setView] = useState<HistoryView>({ kind: "history" });
  const back = useCallback(() => {
    if (view.kind === "history") onClose();
    else if (view.kind === "file") setView({ kind: "commit", commit: view.commit });
    else setView({ kind: "history" });
  }, [view, onClose]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => subscription.remove();
  }, [back]));
  const header = <View style={{ gap: space.sm }}>
    <Button tone="quiet" label={copy("Geri", "Back")} onPress={back} />
    <Body mono>{scope.root}</Body>
    {view.kind !== "history" ? <>
      <Body>{view.commit.subject}</Body>
      <Body mono muted>{view.commit.sha}</Body>
    </> : null}
  </View>;
  if (view.kind === "history") return <CommitList scope={scope} header={header} onSelect={(commit) => setView({ kind: "commit", commit })} />;
  if (view.kind === "commit") return <CommitFiles scope={scope} commit={view.commit} header={header} onSelect={(path) => setView({ kind: "file", commit: view.commit, path, mode: "diff" })} />;
  return <HistoricalFile scope={scope} commit={view.commit} path={view.path} mode={view.mode}
    header={<View style={{ gap: space.sm }}>{header}<Body mono>{view.path}</Body><Row>
      <Button label={copy("Diff", "Diff")} tone={view.mode === "diff" ? "primary" : "quiet"} onPress={() => setView({ ...view, mode: "diff" })} />
      <Button label={copy("Satır geçmişi", "Blame")} tone={view.mode === "blame" ? "primary" : "quiet"} onPress={() => setView({ ...view, mode: "blame" })} />
      <Button label={copy("Dosya geçmişi", "File history")} tone={view.mode === "fileHistory" ? "primary" : "quiet"} onPress={() => setView({ ...view, mode: "fileHistory" })} />
    </Row></View>}
    onSelect={(commit) => setView({ kind: "commit", commit })} />;
}

type ListProps = { scope: GitScope; header: ReactNode; onSelect: (commit: GitHistoryCommit) => void };
function CommitList({ scope, header, onSelect, path }: ListProps & { path?: string }) {
  const copy = useCopy();
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState("");
  const query = useGitHistoryRead<GitHistory | GitHistoryCommit[]>(scope, path
    ? { kind: "fileHistory", path, limit } : { kind: "history", limit });
  const commits = query.data ? (Array.isArray(query.data) ? query.data : query.data.commits) : [];
  const filtered = commits.filter((commit) => `${commit.subject} ${commit.author} ${commit.sha}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <ScreenList data={filtered} keyExtractor={(commit) => commit.sha} query={query}
    header={<View style={{ gap: space.sm }}>{header}
      <Body>{path ? copy("Dosya geçmişi · mevcut dal", "File history · current branch") : copy("Commit geçmişi", "Commit history")}</Body>
      <SearchField label={copy("Yüklenen commitlerde ara", "Search loaded commits")} value={search} maxLength={200} onChangeText={setSearch} />
      <QueryState query={query} />
      {query.data && !filtered.length ? <Empty title={copy("Commit bulunamadı", "No commits found")} /> : null}
    </View>}
    footer={commits.length >= limit ? (limit < 500
      ? <Button label={copy("Daha fazla yükle", "Load more")} onPress={() => setLimit((current) => Math.min(500, current + 100))} disabled={query.isFetching} />
      : <Body muted>{copy("En fazla 500 commit gösteriliyor.", "Showing up to 500 commits.")}</Body>) : undefined}
    renderItem={({ item }) => <GitHistoryCommitRow commit={item} onSelect={() => onSelect(item)} />} />;
}

/** Presentation-only row also supports isolated rendering with safe fixture data. */
export function GitHistoryCommitRow({ commit, onSelect }: { commit: GitHistoryCommit; onSelect: () => void }) {
  return <NavigationRow label={commit.subject || commit.shortSha} detail={`${commit.shortSha} · ${commit.author} · ${new Date(commit.timestamp * 1000).toLocaleDateString()}`} onPress={onSelect} />;
}

function CommitFiles({ scope, commit, header, onSelect }: { scope: GitScope; commit: GitHistoryCommit; header: ReactNode; onSelect: (path: string) => void }) {
  const copy = useCopy();
  const query = useGitHistoryRead<GitChangedFile[]>(scope, { kind: "files", sha: commit.sha });
  return <ScreenList data={query.data ?? []} keyExtractor={(file) => file.relative} query={query}
    header={<View style={{ gap: space.sm }}>{header}<QueryState query={query} />
      {query.data && !query.data.length ? <Empty title={copy("Bu committe dosya farkı yok", "No file changes in this commit")} /> : null}</View>}
    renderItem={({ item }) => <NavigationRow label={item.relative} detail={`${item.status} · +${item.additions} −${item.deletions}`} onPress={() => onSelect(item.relative)} />} />;
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
      {supported ? <QueryState query={query} /> : null}
      {content.data && !supported ? <Body muted>{content.data.status === "deleted"
        ? copy("Dosya bu committe silinmiş. Satır geçmişi önceki committen açılabilir.", "This file was deleted in this commit. Open its parent commit to inspect blame.")
        : copy("İkili veya diff için çok büyük dosya. Tam içeriği bilgisayarda aç.", "Binary file or diff exceeds the mobile budget. Open the full content on your computer.")}</Body> : null}
      {supported && query.data && !query.data.length ? <Empty title={copy("Satır geçmişi yok", "No blame lines")} /> : null}</View>}
    renderItem={({ item }) => <GitBlameRow line={item} content={lines[item.line - 1]} />} />;
}

export function GitBlameRow({ line, content }: { line: GitBlameLine; content?: string }) {
  return <View style={{ gap: space.xs, paddingVertical: space.sm }}>
    <Body mono>{line.line} · {line.shortSha}</Body><Body>{line.summary}</Body>
    <Body muted>{line.author} · {new Date(line.timestamp * 1000).toLocaleDateString()}</Body>
    <Body mono>{content}</Body>
  </View>;
}

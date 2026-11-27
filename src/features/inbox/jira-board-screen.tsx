import { useInboxLocalScope } from "./inbox-local-scope";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ChevronsUp from "lucide-react-native/icons/chevrons-up";
import Equal from "lucide-react-native/icons/equal";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import UserRound from "lucide-react-native/icons/user-round";
import { useActiveMachine } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";
import { Body, Button, IconButton, NavigationGroup, NavigationRow, Notice, QueryState, Screen, ScreenList, SectionHeader, Sheet, Stack, StateView } from "@/ui/primitives";
import { AppliedFilters, FilterButton } from "@/ui/filter-sheet";
import { ScopePill } from "@/ui/scope-pill";
import { useInboxRead } from "./provider-queries";
import { isInboxPrivateFailure } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";
import { inboxRecordHref, rememberInboxRecord, rememberJiraSnapshot } from "./inbox-record-route";
import { IssueRecordRow } from "./issue-record-row";
import { humanizeState } from "./provider-labels";
import { ProviderMark } from "./provider-mark";
import { statusTone } from "./provider-view-model";
import { useRelativeTime } from "../management/shared/record-bits";
import { JiraBoardFilterSheet, type JiraBoardFilterValue } from "./jira-board-filters";
import { pushOnce } from "@/ui/navigation";

type FilterDraft = { boardId: string; value: JiraBoardFilterValue };
type BoardRow = { issue: JiraMobileIssue; snapshot: JiraBoardSnapshot; column: number; first: boolean };
/** The pages read so far for one board view (board, scope, sprint), in reading order. */
type LoadedPages = { view: string; pages: JiraBoardSnapshot[] };

/** Jira priority names map to the familiar arrows; an unknown scheme keeps its name only. */
function priorityIcon(priority?: string) {
  const name = priority?.trim().toLowerCase() ?? "";
  if (/highest|blocker|critical|urgent/.test(name)) return ChevronsUp;
  if (/high|major/.test(name)) return ChevronUp;
  if (/medium|normal/.test(name)) return Equal;
  if (/low|minor|trivial/.test(name)) return ChevronDown;
  return undefined;
}

/** The assignee's initial, or a neutral person glyph for unassigned work, so a card's owner reads at a glance. */
function Assignee({ name }: { name?: string }) {
  const { colors, uiStyles } = useMobileTheme();
  if (!name) return <UserRound size={iconSize.row} strokeWidth={1.8} color={colors.muted} />;
  return <View accessible={false} style={{ width: 24, height: 24, borderRadius: radii.pill, backgroundColor: colors.raised,
    alignItems: "center", justifyContent: "center" }}>
    <Body style={[uiStyles.caption, { color: colors.text }]}>{name.slice(0, 1).toUpperCase()}</Body>
  </View>;
}

function JiraIssueRow({ item, disabled, onPress }: { item: JiraMobileIssue; disabled: boolean; onPress: () => void }) {
  const relative = useRelativeTime();
  const stamp = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
  const assignee = item.assignees?.[0]?.login;
  const PriorityIcon = priorityIcon(item.priority);
  return <IssueRecordRow icon={<Assignee name={assignee} />} label={item.title}
    detail={[item.identifier, PriorityIcon ? undefined : item.priority].filter(Boolean).join(" · ")} state={humanizeState(item.state)}
    stateTone={statusTone(item)}
    stateBadge={PriorityIcon ? <PriorityState icon={PriorityIcon} state={humanizeState(item.state)} tone={statusTone(item)} /> : undefined}
    caption={[assignee, Number.isFinite(stamp) ? relative(stamp) : ""].filter(Boolean).join(" · ") || undefined}
    disabled={disabled} onPress={onPress} />;
}

/** Status with the priority arrow in front: one compact line instead of two badges. */
function PriorityState({ icon: Icon, state, tone }: { icon: typeof ChevronUp; state: string; tone: ReturnType<typeof statusTone> }) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const ink = tone === "default" || tone === "active" ? colors.muted : semanticColors[tone].text;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
    <Icon size={iconSize.inline} color={colors.muted} />
    <Body style={[uiStyles.caption, { color: ink }]}>{state}</Body>
  </View>;
}

/**
 * The project's Jira boards, a pushed page. A board view's pages are read one after another into
 * one list ("Show more"), so the rows already read stay while the next page loads; column counts
 * and the column filter cover every loaded page. An issue opens the shared record page with this
 * board's status and move actions.
 */
export function ProviderJiraBoards({ origin, canRead, canWrite }: {
  origin: InboxOrigin; canRead: boolean; canWrite: boolean;
}) {
  const inboxScope = useInboxLocalScope();
  const copy = useCopy(), machine = useActiveMachine();
  const locale = useLocale();
  const { colors } = useMobileTheme();
  const [opening] = useState(origin);
  const [boardId, setBoard] = useState("");
  const [choosingBoard, setChoosingBoard] = useState(false);
  const [scope, setScope] = useState<JiraBoardFilterValue["scope"]>("board");
  const [sprintId, setSprint] = useState("");
  const [column, setColumn] = useState("");
  const [pages, setPages] = useState<Array<string | undefined>>([undefined]);
  const [loaded, setLoaded] = useState<LoadedPages>({ view: "", pages: [] });
  const [filterDraft, setFilterDraft] = useState<FilterDraft | null>(null);
  const filterOwner = useRef<FilterDraft | null>(null);
  filterOwner.current = filterDraft;
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; filterOwner.current = null; };
  }, []);
  const [sprintCache, setSprintCache] = useState<{ boardId: string; sprints: JiraBoardSnapshot["configuration"]["sprints"] }>({ boardId: "", sprints: [] });
  const supported = inboxScope.matches(opening) && machine?.id === opening.machineId &&
    !!machine.capabilities?.includes("inbox.jiraBoard.v1") && !!opening.projectId;
  const readable = supported && canRead;
  const readAccess = useRef(readable); readAccess.current = readable;
  const available = () => mounted.current && readAccess.current && inboxScope.matches(opening);
  const boards = useInboxRead({ action: "jira-boards", input: { projectId: opening.projectId ?? "" } }, readable);
  useEffect(() => {
    if (readable && !boardId && boards.data?.length === 1) setBoard(String(boards.data[0]!.id));
  }, [readable, boardId, boards.data]);
  const pageToken = pages.at(-1);
  const board = useInboxRead({ action: "jira-board-read", input: {
    projectId: opening.projectId ?? "", boardId: Number(boardId), scope,
    ...(scope === "sprint" ? { sprintId: Number(sprintId) } : {}), ...(pageToken ? { pageToken } : {}),
  } }, readable && !!boardId && (scope !== "sprint" || !!sprintId));
  const privateFailure = isInboxPrivateFailure(boards.error, board.error);
  const contentAvailable = readable && !privateFailure;
  const contentAccess = useRef(contentAvailable); contentAccess.current = contentAvailable;
  const canBrowse = () => available() && contentAccess.current;
  const snapshot = contentAvailable && board.data?.board.id === Number(boardId) && board.data.scope.scope === scope &&
    (scope !== "sprint" || board.data.scope.sprintId === Number(sprintId)) &&
    (board.data.scope.pageToken ?? undefined) === pageToken ? board.data : undefined;
  if (contentAvailable && board.data?.board.id === Number(boardId) &&
    (sprintCache.boardId !== boardId || sprintCache.sprints !== board.data.configuration.sprints))
    setSprintCache({ boardId, sprints: board.data.configuration.sprints });
  const sprints = contentAvailable && sprintCache.boardId === boardId ? sprintCache.sprints : [];
  // Pages accumulate per board view; a new board, scope or sprint starts again from its first page.
  const loadedView = JSON.stringify([boardId, scope, sprintId]);
  const pageList = contentAvailable && loaded.view === loadedView ? loaded.pages : [];
  // The page just read takes its place in the list (a refresh of the last page replaces it).
  const pageAt = pages.indexOf(pageToken);
  if (snapshot && pageAt >= 0 && pageAt <= pageList.length && pageList[pageAt]?.snapshotId !== snapshot.snapshotId)
    setLoaded({ view: loadedView, pages: [...pageList.slice(0, pageAt), snapshot] });
  const first = pageList[0] ?? snapshot;
  const columns = first?.configuration.columns ?? [];
  const selectedColumn = column && first ? columns[Number(column) - 1] : undefined;
  // Every loaded issue once, with the page (snapshot) its actions belong to.
  const seen = new Set<string>();
  const loadedIssues: { issue: JiraMobileIssue; snapshot: JiraBoardSnapshot }[] = [];
  for (const page of pageList.length ? pageList : snapshot ? [snapshot] : [])
    for (const issue of page.page.issues) if (!seen.has(issue.identifier)) { seen.add(issue.identifier); loadedIssues.push({ issue, snapshot: page }); }
  const pageIssues = loadedIssues.filter(({ issue }) => !selectedColumn || selectedColumn.statusIds.includes(issue.statusId));
  // Grouped by board column, in the board's column order, each group headed by its name and count.
  const { rows, columnCounts } = useMemo(() => {
    const index = (item: JiraMobileIssue) => {
      const found = columns.findIndex((entry) => entry.statusIds.includes(item.statusId));
      return found < 0 ? columns.length : found;
    };
    const sorted = pageIssues.map((row, order) => ({ ...row, column: index(row.issue), order }))
      .sort((a, b) => a.column - b.column || a.order - b.order);
    const counts = new Map<number, number>();
    for (const row of sorted) counts.set(row.column, (counts.get(row.column) ?? 0) + 1);
    return { rows: sorted.map((row, at): BoardRow => ({ issue: row.issue, snapshot: row.snapshot, column: row.column, first: at === 0 || sorted[at - 1]!.column !== row.column })), columnCounts: counts };
  }, [pageIssues, columns]);
  const viewKey = JSON.stringify([boardId, scope, sprintId, pageToken]);
  const viewOwner = useRef<{ key: string; snapshot?: JiraBoardSnapshot }>({ key: viewKey, snapshot });
  viewOwner.current = { key: viewKey, snapshot };
  const canNavigate = () => canBrowse() && viewOwner.current.key === viewKey && !board.isFetching;
  const closeFilters = () => { filterOwner.current = null; setFilterDraft(null); };
  useLayoutEffect(() => { if (!contentAvailable) { closeFilters(); setChoosingBoard(false); } }, [contentAvailable]);
  const refresh = () => {
    if (!available()) return;
    // A refresh reads the board view again from its first page.
    if (pages.length > 1) { viewOwner.current = { key: "" }; setPages([undefined]); setLoaded({ view: "", pages: [] }); return boards.refetch(); }
    return Promise.all([boards.refetch(), ...(boardId && (scope !== "sprint" || sprintId) ? [board.refetch()] : [])]);
  };
  const chooseBoard = (value: string) => {
    if (!canBrowse()) return;
    viewOwner.current = { key: "" }; closeFilters(); setChoosingBoard(false); setBoard(value); setScope("board"); setSprint(""); setColumn(""); setPages([undefined]);
  };
  const boardList = contentAvailable ? boards.data ?? [] : [];
  const boardName = boardList.find((item) => String(item.id) === boardId)?.name;
  const scopeLabel = scope === "board" ? copy("Pano", "Board") : scope === "backlog" ? copy("Backlog", "Backlog") :
    `${copy("Sprint", "Sprint")} · ${sprints.find((sprint) => String(sprint.id) === sprintId)?.name ?? `#${sprintId}`}`;
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);
  // Counts cover the pages read so far; more may follow (Show more).
  const pageSummary = loadedIssues.length || snapshot ? column
    ? copy("Yüklenen {p1} kayıttan {p0} tanesi gösteriliyor", "Showing {p0} of {p1} loaded issues.", { p0: format(pageIssues.length), p1: format(loadedIssues.length) })
    : copy("{p0} kayıt yüklendi", "{p0} issues loaded", { p0: format(loadedIssues.length) }) : undefined;
  const lastLoaded = pageList.at(-1) ?? snapshot;
  const nextPage = lastLoaded?.page.nextPageToken;
  const cursorStopped = !!nextPage && (pages.length >= 100 || pages.includes(nextPage));
  // One loading state for the region: the board's read once a board is chosen, else the board list.
  // While the next page loads, the rows already read are this region's data; Show more shows the progress.
  const regionQuery = boardId ? pageList.length && !board.error ? { ...board, data: board.data ?? pageList.at(-1) } : board : boards;
  const columnName = (index: number) => columns[index]?.name ?? copy("Diğer", "Other");
  // The issue page reads its record from this board page: the row and its snapshot are handed over in memory.
  const openIssue = (row: BoardRow) => {
    if (!canBrowse()) return;
    rememberInboxRecord(opening, row.issue);
    rememberJiraSnapshot(opening, row.snapshot);
    pushOnce(inboxRecordHref(row.issue, opening, { boardSnapshot: row.snapshot.snapshotId }));
  };
  void canWrite;
  return <Screen scroll={false}>
    <ScreenList<BoardRow> data={rows} keyExtractor={(row) => row.issue.identifier} refresh={readable ? refresh : undefined}
      header={<Stack>
        {!supported ? <StateView illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")} description={copy("Jira panoları için bir proje seç ve bilgisayardaki bycoda’yı güncelle.", "Select a project and update bycoda on this computer to open Jira boards.")} /> :
          !canRead ? <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")} description={copy("Jira panolarına erişilemiyor. Bilgisayar ve proje bağlantısını kontrol edin.", "Jira board access is unavailable. Check the computer and project connection.")} /> : null}
        {readable ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 48 }}>
          {/* One row: the board as a compact pill, then filters and refresh as icons. */}
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
            {boardList.length ? <ScopePill icon={<ProviderMark provider="jira" size={14} />}
              label={boardName ?? copy("Pano seçin", "Choose a board")} expanded={choosingBoard}
              accessibilityLabel={`${copy("Jira panosu", "Jira board")}: ${boardName ?? copy("seçilmedi", "none")}. ${copy("Pano seçin", "Choose a board")}`}
              onPress={() => { if (canBrowse()) setChoosingBoard(true); }} /> : null}
          </View>
          {boardId && contentAvailable ? <FilterButton count={Number(scope !== "board") + Number(!!column)} onPress={() => {
            if (!canBrowse()) return;
            const next = { boardId, value: { scope, sprintId, column } }; filterOwner.current = next; setFilterDraft(next);
          }} /> : null}
          {/* Pull-to-refresh is not reachable for everyone: refresh also stays one labelled control. */}
          <IconButton label={boardId ? copy("Panoyu yenile", "Refresh board") : copy("Yenile", "Refresh")}
            busy={(boardId ? board : boards).isFetching && (boardId ? board.data : boards.data) !== undefined}
            disabled={!readable || boards.isFetching || board.isFetching} onPress={() => { void refresh(); }}>
            <RefreshCw size={iconSize.action} color={colors.muted} />
          </IconButton>
        </View> : null}
        {boardId && contentAvailable ? <AppliedFilters result={pageSummary}
          filters={[scope !== "board" ? scopeLabel : false, selectedColumn?.name]} /> : null}
        {readable && (boardId || !boards.data?.length) ? <QueryState query={regionQuery}
          empty={!boardId && boards.isSuccess && !boards.data?.length} emptyIllustration="no-projects"
          emptyTitle={copy("Bilgisayarda etkin Jira panosu yok.", "No Jira boards are enabled on the computer.")}
          emptyDetail={copy("Bilgisayarda: Ayarlar → Gelen kutusu → Jira’da panoları seç.", "On your computer: choose boards in Settings → Inbox → Jira.")} /> : null}
        {readable && contentAvailable && !boardId && (boards.data?.length ?? 0) > 1 ? <StateView size="compact"
          title={copy("Bir pano seçin", "Choose a board")} action={{ label: copy("Pano seçin", "Choose a board"), onPress: () => { if (canBrowse()) setChoosingBoard(true); } }} /> : null}
        {boardId && contentAvailable && board.data && !snapshot && !board.isFetching && !board.error ? <Notice tone="warning"
          message={copy("Pano görünümü değişti. Devam etmek için yenileyin.", "The board view changed. Refresh to continue.")} /> : null}
        {snapshot && !board.isFetching && !board.error && rows.length === 0 ? <StateView size="compact"
          title={column ? copy("Yüklenen kayıtlardan hiçbiri seçilen sütunda değil.", "No loaded issues are in the selected column.") : copy("Bu görünümde kayıt yok.", "No issues in this view.")}
          action={column ? { label: copy("Sütun filtresini temizle", "Clear column filter"), onPress: () => { if (canBrowse()) setColumn(""); } } : undefined} /> : null}
      </Stack>}
      // The next page joins the list below the rows already read; they stay while it loads.
      footer={readable && nextPage ? <Stack>
        <Button tone="quiet" label={copy("Daha fazla göster", "Show more")} busy={board.isFetching && pageList.length > 0}
          disabled={!contentAvailable || board.isFetching || cursorStopped} onPress={() => {
            if (!canNavigate() || viewOwner.current.snapshot !== snapshot || lastLoaded !== snapshot) return;
            setPages((current) => current.at(-1) === pageToken && current.length < 100 && !current.includes(nextPage) ? [...current, nextPage] : current);
          }} />
        {cursorStopped ? <Notice message={copy("Sayfa sınırına veya tekrarlanan imlece ulaşıldı. Pano kapsamını değiştir.", "The page limit or a repeated cursor was reached. Change the board scope.")} /> : null}
      </Stack> : undefined}
      renderItem={({ item }) => <View>
        {item.first ? <SectionHeader title={columnName(item.column)} count={columnCounts.get(item.column)} /> : null}
        <JiraIssueRow item={item.issue} disabled={!contentAvailable}
          onPress={() => openIssue(item)} />
      </View>} />
    {choosingBoard && contentAvailable ? <Sheet visible size="compact" title={copy("Jira panosu", "Jira board")} onClose={() => setChoosingBoard(false)}>
      <NavigationGroup>
        {boardList.map((item) => <NavigationRow key={item.id} label={item.name}
          detail={item.kind === "scrum" ? "Scrum" : "Kanban"} selected={String(item.id) === boardId}
          onPress={() => chooseBoard(String(item.id))} />)}
      </NavigationGroup>
    </Sheet> : null}
    {filterDraft && contentAvailable ? <JiraBoardFilterSheet value={filterDraft.value} sprints={sprints} columns={columns}
      disabled={!readable || filterDraft.boardId !== boardId}
      onClose={closeFilters} onChange={(value) => {
        if (!canBrowse() || filterOwner.current !== filterDraft) return;
        const next = { ...filterDraft, value }; filterOwner.current = next; setFilterDraft(next);
      }} onApply={() => {
        if (!canBrowse() || filterOwner.current !== filterDraft || filterDraft.boardId !== boardId ||
          (filterDraft.value.scope === "sprint" && !filterDraft.value.sprintId)) return;
        const next = filterDraft.value;
        if (next.scope !== scope || (next.scope === "sprint" && next.sprintId !== sprintId)) {
          viewOwner.current = { key: "" }; setPages([undefined]);
        }
        setScope(next.scope); setSprint(next.sprintId); setColumn(next.column); closeFilters();
      }} /> : null}
  </Screen>;
}

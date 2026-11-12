import { useLayoutEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { ActionMenu, Body, Button, Notice, QueryState, Row, ScreenList, SelectField, Sheet, Stack, StateView } from "@/ui/primitives";
import { AppliedFilters, FilterButton } from "@/ui/filter-sheet";
import { CollectionToolbar } from "@/ui/search-field";
import { useInboxRead } from "./provider-queries";
import { isInboxOriginCurrent, isInboxPrivateFailure } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";
import { JiraBoardIssueActions } from "./jira-board-issue";
import { IssueRecordRow } from "./issue-record-row";
import { JiraBoardFilterSheet, type JiraBoardFilterValue } from "./jira-board-filters";

type FilterDraft = { boardId: string; value: JiraBoardFilterValue };

export function ProviderJiraBoards({ origin, canRead, canWrite, onClose }: {
  origin: InboxOrigin; canRead: boolean; canWrite: boolean; onClose: () => void;
}) {
  const copy = useCopy(), machine = useActiveMachine();
  const [opening] = useState(origin);
  const [computerName] = useState(machine?.id === origin.machineId ? machine.name || origin.machineId : origin.machineId);
  const [boardId, setBoard] = useState("");
  const [scope, setScope] = useState<JiraBoardFilterValue["scope"]>("board");
  const [sprintId, setSprint] = useState("");
  const [column, setColumn] = useState("");
  const [pages, setPages] = useState<Array<string | undefined>>([undefined]);
  const [selected, setSelected] = useState<{ issue: JiraMobileIssue; snapshot: JiraBoardSnapshot } | null>(null);
  const [filterDraft, setFilterDraft] = useState<FilterDraft | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const filterOwner = useRef<FilterDraft | null>(null);
  filterOwner.current = filterDraft;
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; filterOwner.current = null; };
  }, []);
  const [sprintCache, setSprintCache] = useState<{ boardId: string; sprints: JiraBoardSnapshot["configuration"]["sprints"] }>({ boardId: "", sprints: [] });
  const supported = isInboxOriginCurrent(opening, useMachines.getState()) && machine?.id === opening.machineId &&
    !!machine.capabilities?.includes("inbox.jiraBoard.v1") && !!opening.projectId;
  const readable = supported && canRead;
  const readAccess = useRef(readable); readAccess.current = readable;
  const available = () => mounted.current && readAccess.current && isInboxOriginCurrent(opening, useMachines.getState());
  const boards = useInboxRead({ action: "jira-boards", input: { projectId: opening.projectId ?? "" } }, readable);
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
  const selectedColumn = column && snapshot ? snapshot.configuration.columns[Number(column) - 1] : undefined;
  const rows = snapshot ? snapshot.page.issues.filter((item) => !selectedColumn || selectedColumn.statusIds.includes(item.statusId)) : [];
  const viewKey = JSON.stringify([boardId, scope, sprintId, pageToken]);
  const viewOwner = useRef<{ key: string; snapshot?: JiraBoardSnapshot }>({ key: viewKey, snapshot });
  viewOwner.current = { key: viewKey, snapshot };
  const canNavigate = () => canBrowse() && viewOwner.current.key === viewKey && !board.isFetching;
  const closeFilters = () => { filterOwner.current = null; setFilterDraft(null); };
  useLayoutEffect(() => { if (!contentAvailable) closeFilters(); }, [contentAvailable]);
  const refresh = () => {
    if (!available()) return;
    return Promise.all([boards.refetch(), ...(boardId && (scope !== "sprint" || sprintId) ? [board.refetch()] : [])]);
  };
  const scopeLabel = scope === "board" ? copy("Pano", "Board") : scope === "backlog" ? "Backlog" :
    `${copy("Sprint", "Sprint")} · ${sprints.find((sprint) => String(sprint.id) === sprintId)?.name ?? `#${sprintId}`}`;
  const projectName = snapshot?.projectCwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || snapshot?.projectCwd;
  const pageSummary = snapshot ? column
    ? copy("Bu sayfada {p1} kayıttan {p0} tanesi gösteriliyor.", "Showing {p0} of {p1} issues on this page.", { p0: rows.length, p1: snapshot.page.issues.length })
    : copy("Bu sayfadaki kayıtlar: {p0}", "Issues on this page: {p0}", { p0: snapshot.page.issues.length }) : undefined;
  const nextPage = snapshot?.page.nextPageToken;
  const cursorStopped = !!nextPage && (pages.length >= 100 || pages.includes(nextPage));
  return <Sheet visible title={copy("Jira panoları", "Jira boards")} size="full" scroll={false} onClose={onClose}>
    {selected && contentAvailable ? <JiraBoardIssueActions key={`${selected.snapshot.snapshotId}:${selected.issue.identifier}`}
      origin={opening} snapshot={selected.snapshot} issue={selected.issue} canWrite={contentAvailable && canWrite}
      onChanged={() => { if (available()) void board.refetch(); }} onClose={() => setSelected(null)} /> : null}
    <ScreenList<JiraMobileIssue> data={rows} keyExtractor={(item) => item.identifier} refresh={readable ? refresh : undefined}
      header={<Stack>
        {!supported ? <StateView illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")} description={copy("Jira panoları için bir proje seç ve bilgisayardaki bycoda’yı güncelle.", "Select a project and update bycoda on this computer to open Jira boards.")} /> :
          !canRead ? <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")} description={copy("Jira panolarına erişilemiyor. Bilgisayar ve proje bağlantısını kontrol edin.", "Jira board access is unavailable. Check the computer and project connection.")} /> : null}
        {readable ? <QueryState query={boards} empty={boards.isSuccess && !boards.data?.length} emptyIllustration="no-projects"
          emptyTitle={copy("Bilgisayarda etkin Jira panosu yok.", "No Jira boards are enabled on the computer.")} /> : null}
        <CollectionToolbar field={<SelectField compact hideLabel={!!boardId} label={copy("Jira panosu", "Jira board")}
          value={contentAvailable ? boardId : ""} disabled={!contentAvailable}
          onChange={(value) => {
            if (!canBrowse()) return;
            viewOwner.current = { key: "" }; closeFilters(); setBoard(value); setScope("board"); setSprint(""); setColumn(""); setPages([undefined]); setSelected(null);
          }} options={(contentAvailable ? boards.data ?? [] : []).map((item) => ({ value: String(item.id), label: item.name }))} />}
          actions={<>
            {boardId && contentAvailable ? <FilterButton count={Number(scope !== "board") + Number(!!column)} onPress={() => {
              if (!canBrowse()) return;
              const next = { boardId, value: { scope, sprintId, column } }; filterOwner.current = next; setFilterDraft(next);
            }} /> : null}
            <ActionMenu label={copy("Diğer işlemler", "More actions")} busy={boardId ? board.isFetching && board.data !== undefined : boards.isFetching && boards.data !== undefined}
              actions={[
                { key: "refresh", label: boardId ? copy("Panoyu yenile", "Refresh board") : copy("Yenile", "Refresh"), disabled: !readable || boards.isFetching || board.isFetching,
                  onPress: () => { void refresh(); } },
                { key: "help", label: copy("Yardım", "Help"), onPress: () => setHelpOpen(true) },
              ]} />
          </>} />
        {boardId && contentAvailable ? <AppliedFilters result={[computerName, projectName, scope === "board" ? scopeLabel : null, pageSummary].filter(Boolean).join(" · ")}
          filters={[scope !== "board" ? scopeLabel : false, selectedColumn?.name]} /> : <Body muted>{computerName}</Body>}
        {boardId && readable ? <QueryState query={board} /> : null}
        {boardId && contentAvailable && board.data && !snapshot && !board.isFetching && !board.error ? <Notice tone="warning"
          message={copy("Pano görünümü değişti. Devam etmek için yenileyin.", "The board view changed. Refresh to continue.")} /> : null}
        {snapshot && !board.isFetching && !board.error && rows.length === 0 ? <>
          <Body muted>{column ? copy("Bu sayfada seçilen sütunla eşleşen kayıt yok.", "No issues on this page match the selected column.") : copy("Bu sayfada kayıt yok.", "No issues on this page.")}</Body>
          {column ? <Button tone="quiet" label={copy("Sütun filtresini temizle", "Clear column filter")} onPress={() => { if (canBrowse()) setColumn(""); }} /> : null}
        </> : null}
      </Stack>}
      footer={readable && (pages.length > 1 || nextPage) ? <Stack><Row>
        {pages.length > 1 ? <Button tone="quiet" label={copy("Önceki sayfa", "Previous page")} disabled={!contentAvailable || board.isFetching} onPress={() => {
          if (!canNavigate()) return;
          setPages((current) => current.at(-1) === pageToken && current.length > 1 ? current.slice(0, -1) : current);
        }} /> : null}
        {nextPage ? <Button tone="quiet" label={copy("Sonraki sayfa", "Next page")} disabled={board.isFetching || cursorStopped} onPress={() => {
          if (!canNavigate() || viewOwner.current.snapshot !== snapshot) return;
          setPages((current) => current.at(-1) === pageToken && current.length < 100 && !current.includes(nextPage) ? [...current, nextPage] : current);
        }} /> : null}
      </Row>{cursorStopped ? <Notice message={copy("Sayfa sınırına veya tekrarlanan imlece ulaşıldı. Pano kapsamını değiştir veya önceki sayfaları incele.", "The page limit or a repeated cursor was reached. Change the board scope or review earlier pages.")} /> : null}</Stack> : undefined}
      renderItem={({ item }) => <IssueRecordRow label={`${item.identifier} · ${item.title}`} state={item.state}
        caption={item.assignees?.[0]?.login}
        disabled={!contentAvailable || !canWrite || board.isFetching} onPress={() => { if (canBrowse() && snapshot) setSelected({ issue: item, snapshot }); }} />} />
    {filterDraft && contentAvailable ? <JiraBoardFilterSheet value={filterDraft.value} sprints={sprints} columns={snapshot?.configuration.columns ?? []}
      disabled={!readable || filterDraft.boardId !== boardId} feedback={<QueryState query={board} loading="inline" />}
      onClose={closeFilters} onChange={(value) => {
        if (!canBrowse() || filterOwner.current !== filterDraft) return;
        const next = { ...filterDraft, value }; filterOwner.current = next; setFilterDraft(next);
      }} onApply={() => {
        if (!canBrowse() || filterOwner.current !== filterDraft || filterDraft.boardId !== boardId ||
          (filterDraft.value.scope === "sprint" && !filterDraft.value.sprintId)) return;
        const next = filterDraft.value;
        if (next.scope !== scope || (next.scope === "sprint" && next.sprintId !== sprintId)) {
          viewOwner.current = { key: "" }; setPages([undefined]); setSelected(null);
        }
        setScope(next.scope); setSprint(next.sprintId); setColumn(next.column); closeFilters();
      }} /> : null}
    {helpOpen ? <Sheet visible title={copy("Yardım", "Help")} size="compact" onClose={() => setHelpOpen(false)}>
      <Body muted>{copy("Yalnız bilgisayarda etkinleştirilen panolar ve görünür Jira projeleri gösterilir. Hesap ayarları bilgisayarda kalır.", "Only boards enabled on the computer and visible Jira projects are shown. Account settings stay on the computer.")}</Body>
      {snapshot ? <Body muted selectable>{computerName} · {snapshot.projectCwd}</Body> : null}
    </Sheet> : null}
  </Sheet>;
}

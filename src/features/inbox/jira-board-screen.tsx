import { useEffect, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  NavigationRow,
  Notice,
  QueryState,
  Row,
  ScreenList,
  SelectField,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { useInboxRead } from "./provider-queries";
import { isInboxOriginCurrent } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";
import { JiraBoardIssueActions } from "./jira-board-issue";

export function ProviderJiraBoards({
  origin,
  canRead,
  canWrite,
  onClose,
}: {
  origin: InboxOrigin;
  canRead: boolean;
  canWrite: boolean;
  onClose: () => void;
}) {
  const copy = useCopy(),
    machine = useActiveMachine(),
    [opening] = useState(origin),
    [boardId, setBoard] = useState(""),
    [scope, setScope] = useState("board"),
    [sprintId, setSprint] = useState(""),
    [column, setColumn] = useState(""),
    [pages, setPages] = useState<Array<string | undefined>>([undefined]),
    [selected, setSelected] = useState<{
      issue: JiraMobileIssue;
      snapshot: JiraBoardSnapshot;
    } | null>(null);
  const [sprints, setSprints] = useState<JiraBoardSnapshot["configuration"]["sprints"]>([]);
  const current = isInboxOriginCurrent(opening, useMachines.getState()),
    supported =
      current &&
      machine?.id === opening.machineId &&
      !!machine.capabilities?.includes("inbox.jiraBoard.v1") &&
      !!opening.projectId;
  const boards = useInboxRead(
    { action: "jira-boards", input: { projectId: opening.projectId ?? "" } },
    supported && canRead,
  );
  const pageToken = pages.at(-1);
  const board = useInboxRead(
    {
      action: "jira-board-read",
      input: {
        projectId: opening.projectId ?? "",
        boardId: Number(boardId),
        scope: scope as "board" | "backlog" | "sprint",
        ...(scope === "sprint" ? { sprintId: Number(sprintId) } : {}),
        ...(pageToken ? { pageToken } : {}),
      },
    },
    supported && canRead && !!boardId && (scope !== "sprint" || !!sprintId),
  );
  const snapshot =
    supported &&
    board.data?.board.id === Number(boardId) &&
    board.data.scope.scope === scope &&
    (scope !== "sprint" || board.data.scope.sprintId === Number(sprintId))
      ? board.data
      : undefined;
  useEffect(() => {
    if (supported && board.data?.board.id === Number(boardId))
      setSprints(board.data.configuration.sprints);
  }, [supported, board.data, boardId]);
  const statusIds =
    column && snapshot ? snapshot.configuration.columns[Number(column) - 1]?.statusIds : undefined;
  const rows = snapshot
    ? snapshot.page.issues.filter((item) => !statusIds || statusIds.includes(item.statusId))
    : [];
  return (
    <Sheet
      visible
      title={copy("Jira panoları", "Jira boards")}
      size="full"
      scroll={false}
      onClose={onClose}
    >
      {selected && supported ? (
        <JiraBoardIssueActions
          key={`${selected.snapshot.snapshotId}:${selected.issue.identifier}`}
          origin={opening}
          snapshot={selected.snapshot}
          issue={selected.issue}
          canWrite={supported && canWrite}
          onChanged={() => {
            void board.refetch();
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}
      <ScreenList<JiraMobileIssue>
        data={supported ? rows : []}
        keyExtractor={(item) => item.identifier}
        header={
          <Stack>
            {!supported ? (
              <Notice
                message={copy(
                  "Jira panoları için bir proje seç ve bilgisayardaki bycoda’yı güncelle.",
                  "Select a project and update bycoda on this computer to open Jira boards.",
                )}
              />
            ) : null}
            <Body muted>
              {copy(
                "Yalnız bilgisayarda etkinleştirilen panolar ve görünür Jira projeleri gösterilir. Hesap ayarları bilgisayarda kalır.",
                "Only boards enabled on the computer and visible Jira projects are shown. Account settings stay on the computer.",
              )}
            </Body>
            <QueryState
              query={boards}
              empty={boards.isSuccess && !boards.data?.length}
              emptyTitle={copy(
                "Bilgisayarda etkin Jira panosu yok.",
                "No Jira boards are enabled on the computer.",
              )}
            />
            <SelectField
              label={copy("Jira panosu", "Jira board")}
              value={boardId}
              disabled={!supported}
              onChange={(value) => {
                setBoard(value);
                setScope("board");
                setSprint("");
                setColumn("");
                setSprints([]);
                setPages([undefined]);
                setSelected(null);
              }}
              options={(supported ? (boards.data ?? []) : []).map((item) => ({
                value: String(item.id),
                label: item.name,
              }))}
            />
            {boardId ? (
              <>
                <SelectField
                  label={copy("Pano kapsamı", "Board scope")}
                  value={scope}
                  disabled={!supported}
                  onChange={(value) => {
                    setScope(value);
                    setColumn("");
                    setPages([undefined]);
                  }}
                  options={[
                    { value: "board", label: copy("Pano", "Board") },
                    { value: "backlog", label: "Backlog" },
                    { value: "sprint", label: "Sprint" },
                  ]}
                />
                {scope === "sprint" ? (
                  <SelectField
                    label={copy("Sprint", "Sprint")}
                    value={sprintId}
                    disabled={!supported}
                    onChange={(value) => {
                      setSprint(value);
                      setPages([undefined]);
                    }}
                    options={(supported ? sprints : []).map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    }))}
                  />
                ) : null}
                <QueryState query={board} />
                <Button busy={board.isFetching}
                  tone="quiet"
                  label={copy("Panoyu yenile", "Refresh board")}
                  disabled={!supported || board.isFetching || (scope === "sprint" && !sprintId)}
                  onPress={() => {
                    void board.refetch();
                  }}
                />
              </>
            ) : null}
            {snapshot ? (
              <>
                <SelectField
                  label={copy("Sütun", "Column")}
                  value={column}
                  disabled={!supported}
                  onChange={setColumn}
                  options={[
                    { value: "", label: copy("Tümü", "All") },
                    ...snapshot.configuration.columns.map((item, index) => ({
                      value: String(index + 1),
                      label: item.name,
                    })),
                  ]}
                />
                <Body>
                  {column
                    ? copy(
                        "Bu sayfada {p1} kayıttan {p0} tanesi gösteriliyor.",
                        "Showing {p0} of {p1} issues on this page.",
                        { p0: rows.length, p1: snapshot.page.issues.length },
                      )
                    : copy("Bu sayfadaki kayıtlar: {p0}", "Issues on this page: {p0}", {
                        p0: snapshot.page.issues.length,
                      })}
                </Body>
                {!board.isFetching && !board.error && rows.length === 0 ? (
                  <>
                    <Body muted>
                      {column
                        ? copy(
                            "Bu sayfada seçilen sütunla eşleşen kayıt yok.",
                            "No issues on this page match the selected column.",
                          )
                        : copy("Bu sayfada kayıt yok.", "No issues on this page.")}
                    </Body>
                    {column ? (
                      <Button
                        tone="quiet"
                        label={copy("Sütun filtresini temizle", "Clear column filter")}
                        onPress={() => setColumn("")}
                      />
                    ) : null}
                  </>
                ) : null}
                <Row>
                  {pages.length > 1 ? (
                    <Button
                      tone="quiet"
                      label={copy("Önceki sayfa", "Previous page")}
                      disabled={board.isFetching}
                      onPress={() => setPages((current) => current.slice(0, -1))}
                    />
                  ) : null}
                  {snapshot.page.nextPageToken ? (
                    <Button
                      tone="quiet"
                      label={copy("Sonraki sayfa", "Next page")}
                      disabled={
                        board.isFetching ||
                        pages.length >= 100 ||
                        pages.includes(snapshot.page.nextPageToken)
                      }
                      onPress={() => {
                        setPages((current) => [...current, snapshot.page.nextPageToken!]);
                      }}
                    />
                  ) : null}
                </Row>
                {snapshot.page.nextPageToken &&
                (pages.length >= 100 || pages.includes(snapshot.page.nextPageToken)) ? (
                  <Notice
                    message={copy(
                      "Sayfa sınırına veya tekrarlanan imlece ulaşıldı. Pano kapsamını değiştir veya önceki sayfaları incele.",
                      "The page limit or a repeated cursor was reached. Change the board scope or review earlier pages.",
                    )}
                  />
                ) : null}
              </>
            ) : null}
          </Stack>
        }
        renderItem={({ item }) => (
          <NavigationRow
            label={`${item.identifier} · ${item.title}`}
            detail={item.state}
            disabled={!supported || !canWrite || board.isFetching}
            onPress={() => {
              if (snapshot) setSelected({ issue: item, snapshot });
            }}
          />
        )}
      />
    </Sheet>
  );
}

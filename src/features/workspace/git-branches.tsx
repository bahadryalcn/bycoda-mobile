import type { TextInputInstance } from "react-native";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import {
  RowIcon,
  StatusText,
  Body,
  Button,
  Disclosure,
  FieldError,
  IdentifierField,
  NavigationRow,
  QueryState,
  ScreenList,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { useMemo, useRef, useState } from "react";
import GitBranch from "lucide-react-native/icons/git-branch";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { GroupedListRow } from "./shared";
import { useGitBranches } from "./git-queries";
import { branchNameProblem } from "./git-branch-name";
import type { GitBranchesPanelProps } from "./git-types";
import { pushOnce } from "@/ui/navigation";

export function GitBranchesPanel({
  scope,
  name,
  onNameChange,
  creating,
  onCreate,
  onChoose,
  onClose,
  children,
}: GitBranchesPanelProps) {
  const copy = useCopy();
  const locale = useLocale();
  const branches = useGitBranches(scope);
  const [search, setSearch] = useState("");
  const problem = branchNameProblem(name);
  const searchRef = useRef<TextInputInstance>(null);
  const rows = useMemo(
    () =>
      [
        ...(branches.data?.branches ?? []).map((branch) => ({
          key: branch,
          branch,
          remote: undefined as string | undefined,
        })),
        ...(branches.data?.remotes ?? []).map((branch) => ({
          key: branch.remote + "/" + branch.name,
          branch: branch.name,
          remote: branch.remote,
        })),
      ]
        .filter((row) => matchesSearch(row.key, search, locale))
        .sort(
          (a, b) =>
            Number(!b.remote && b.branch === branches.data?.current) -
            Number(!a.remote && a.branch === branches.data?.current),
        ),
    [branches.data, search, locale],
  );
  return (
    <Sheet
      visible
      size="full"
      scroll={false}
      dismissible={!creating}
      title={copy("Dallar", "Branches")}
      onClose={() => {
        if (!creating) onClose();
      }}
      footer={
        <>
          <Disclosure label={copy("Yeni dal", "New branch")} defaultExpanded={!!name}>
          <IdentifierField
            label={copy("Yeni dal", "New branch")}
            value={name}
            onChangeText={onNameChange}
            editable={!creating}
          />
          <Button
            tone="primary"
            fullWidth
            reserveTouchTarget
            label={copy("Yeni dal oluştur", "Create branch")}
            disabled={!!problem}
            busy={creating}
            onPress={() => {
              if (problem || creating) return;
              confirmAction(
                copy("Yeni dal oluştur", "Create branch"),
                copy("\"{p0}\" dalı oluşturulup bu dala geçilsin mi?", "Create \"{p0}\" and switch to it?", { p0: name.trim() }),
                copy("Dalı oluştur", "Create branch"),
                onCreate,
                copy("Vazgeç", "Cancel"),
                "default",
              );
            }}
          />
          {problem && name.trim() ? (
            <FieldError
              message={
                problem === "managed"
                  ? copy(
                      "bycoda/s/ ve bycoda/t/ yönetilen çalışma alanlarına ayrılmıştır.",
                      "bycoda/s/ and bycoda/t/ are reserved for managed workspaces.",
                    )
                  : copy(
                      "Geçerli bir dal adı gir (boşluk, .., ~, ^, :, ?, *, [ ve \\ olmadan).",
                      "Enter a valid branch name (no spaces, .., ~, ^, :, ?, *, [ or \\).",
                    )
              }
            />
          ) : null}
          </Disclosure>
          {children}
        </>
      }
    >
      <ScreenList
        grouped
        data={rows}
        keyExtractor={(row) => row.key}
        query={branches}
        contentContainerStyle={{ gap: 0 }}
        header={
          <>
            <SearchField
              ref={searchRef}
              label={copy("Ara", "Search")}
              placeholder={copy("Ara", "Search")}
              value={search}
              onChangeText={setSearch}
            />
            <QueryState query={branches} empty={!rows.length}
              noResults={{ compact: true, searching: !!search.trim(), title: copy("Aramana uyan dal yok.", "No branches match your search."), onClearSearch: () => { setSearch(""); searchRef.current?.focus(); } }}
              emptyTitle={search.trim() ? copy("Aramana uyan dal yok.", "No branches match your search.") : copy("Dal bulunamadı.", "No branches found.")}
              emptyAction={search.trim() ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => { setSearch(""); searchRef.current?.focus(); } } : undefined}
              onManageConnections={() => {
                if (creating) return;
                onClose();
                pushOnce("/machines");
              }} />
            <Body muted>
              {copy(
                "Bilgisayardaki proje, oturumlar durduğunda ve değişiklikler kaydedildiğinde dal değiştirebilir.",
                "Your computer can switch branches when sessions are idle and the working tree is clean.",
              )}
            </Body>
          </>
        }
        renderItem={({ item, index }) => (
          <GroupedListRow
            first={index === 0}
            last={index === rows.length - 1}
          >
            <NavigationRow
              variant="plain"
              label={item.key}
              icon={<RowIcon glyph={GitBranch} />}
              trailing={
                !item.remote && branches.data?.current === item.branch ? (
                  <StatusText label={copy("Geçerli", "Current")} />
                ) : undefined
              }
              disabled={creating || (!item.remote && branches.data?.current === item.branch)}
              onPress={() => onChoose({ kind: "switch", branch: item.branch, remote: item.remote })}
            />
          </GroupedListRow>
        )}
      />
    </Sheet>
  );
}

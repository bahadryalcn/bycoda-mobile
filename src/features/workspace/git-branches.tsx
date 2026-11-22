import type { TextInputInstance } from "react-native";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import {
  Badge,
  Body,
  Button,
  ConfirmationCard,
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
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { GroupedListRow, rowInset } from "./shared";
import { useGitBranches } from "./git-queries";
import { branchNameProblem } from "./git-branch-name";
import type { GitBranchesPanelProps } from "./git-types";

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
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const branches = useGitBranches(scope);
  const [search, setSearch] = useState("");
  const [confirmingCreate, setConfirmingCreate] = useState(false);
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
            onPress={() => setConfirmingCreate(true)}
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
      {confirmingCreate && !problem ? (
        <Sheet
          visible
          size="compact"
          title={copy("Yeni dal oluştur", "Create branch")}
          dismissible={!creating}
          onClose={() => setConfirmingCreate(false)}
        >
          <ConfirmationCard
            tone="default"
            message={copy(
              "\"{p0}\" dalı oluşturulup bu dala geçilsin mi?",
              "Create \"{p0}\" and switch to it?",
              { p0: name.trim() },
            )}
            cancelLabel={copy("Vazgeç", "Cancel")}
            onCancel={() => setConfirmingCreate(false)}
            confirmLabel={copy("Dalı oluştur", "Create branch")}
            busy={creating}
            onConfirm={() => {
              setConfirmingCreate(false);
              onCreate();
            }}
          />
        </Sheet>
      ) : null}
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
              emptyTitle={search.trim() ? copy("Aramana uyan dal yok.", "No branches match your search.") : copy("Dal bulunamadı.", "No branches found.")}
              emptyAction={search.trim() ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => { setSearch(""); searchRef.current?.focus(); } } : undefined}
              onManageConnections={() => {
                if (creating) return;
                onClose();
                router.push("/machines");
              }} />
            <Disclosure label={copy("Dal değiştirme hakkında", "About switching branches")}>
              <Body muted>
                {copy(
                  "Bilgisayardaki proje, oturumlar durduğunda ve değişiklikler kaydedildiğinde dal değiştirebilir.",
                  "Your computer can switch branches when sessions are idle and the working tree is clean.",
                )}
              </Body>
            </Disclosure>
          </>
        }
        renderItem={({ item, index }) => (
          <GroupedListRow
            first={index === 0}
            last={index === rows.length - 1}
            inset={rowInset}
          >
            <NavigationRow
              variant="plain"
              label={item.key}
              icon={
                <IconTile
                  color={
                    !item.remote && branches.data?.current === item.branch
                      ? colors.success
                      : undefined
                  }
                >
                  <GitBranch
                    size={18}
                    strokeWidth={2}
                    color={
                      !item.remote && branches.data?.current === item.branch
                        ? colors.success
                        : colors.muted
                    }
                  />
                </IconTile>
              }
              trailing={
                !item.remote && branches.data?.current === item.branch ? (
                  <Badge label={copy("Geçerli", "Current")} tone="success" />
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

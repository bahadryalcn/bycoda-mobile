import {
  Body,
  Button,
  Disclosure,
  IdentifierField,
  Input,
  NavigationRow,
  QueryState,
  ScreenList,
  Sheet,
} from "@/ui/primitives";
import { useMemo, useState } from "react";
import { View } from "react-native";
import Search from "lucide-react-native/icons/search";
import GitBranch from "lucide-react-native/icons/git-branch";
import Check from "lucide-react-native/icons/check";
import { IconTile } from "@/ui/icon-tile";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useGitBranches } from "./git-queries";
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
  const copy = useCopy();
  const branches = useGitBranches(scope);
  const [search, setSearch] = useState("");
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
        .filter((row) => row.key.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .sort(
          (a, b) =>
            Number(!b.remote && b.branch === branches.data?.current) -
            Number(!a.remote && a.branch === branches.data?.current),
        ),
    [branches.data, search],
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
          <IdentifierField
            label={copy("Yeni dal", "New branch")}
            value={name}
            onChangeText={onNameChange}
            editable={!creating}
          />
          <Button
            tone="primary"
            label={copy("Yeni dal oluştur", "Create branch")}
            disabled={!name.trim()}
            busy={creating}
            onPress={onCreate}
          />
          {children}
        </>
      }
    >
      <ScreenList
        data={rows}
        keyExtractor={(row) => row.key}
        query={branches}
        header={
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Search size={19} color={colors.muted} />
              <Input
                label={copy("Ara", "Search")}
                placeholder={copy("Ara", "Search")}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1 }}
              />
            </View>
            <QueryState query={branches} />
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
        renderItem={({ item }) => (
          <NavigationRow
            label={item.key}
            icon={
              <IconTile>
                <GitBranch
                  size={20}
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
                <Check size={18} color={colors.success} />
              ) : undefined
            }
            disabled={creating || (!item.remote && branches.data?.current === item.branch)}
            detail={
              !item.remote && branches.data?.current === item.branch
                ? copy("Geçerli dal", "Current branch")
                : undefined
            }
            onPress={() => onChoose({ kind: "switch", branch: item.branch, remote: item.remote })}
          />
        )}
      />
    </Sheet>
  );
}

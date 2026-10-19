import { useMobileTheme } from "@/ui/theme";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Folder from "lucide-react-native/icons/folder";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Disclosure,
  IconButton,
  IdentifierField,
  MutationState,
  ScreenList,
  NavigationRow,
  QueryState,
  Row,
  SearchField,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { IconTile } from "@/ui/icon-tile";
import { GroupedListRow, rowInset } from "./shared";
import type { ProjectDirectories } from "./projects-screen-types";

type Location = { value: string; label: string; detail?: string };
const pathKey = (path: string) => {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^(?:[a-z]:[\\/]|\\\\)/i.test(path) ? normalized.toLocaleLowerCase() : normalized;
};
const inside = (path: string, root: string) =>
  pathKey(path) === pathKey(root) || pathKey(path).startsWith(`${pathKey(root)}/`);

/** Browsing never opens a project; only the footer confirms the current folder. */
export function ProjectFolderBrowser({
  onClose,
  onOpen,
  mutation,
}: {
  onClose: () => void;
  onOpen: (path: string) => void;
  mutation: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown };
}) {
  useMobileTheme();
  const copy = useCopy();
  const [path, setPath] = useState<string>();
  const [manual, setManual] = useState("");
  const [search, setSearch] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const folders = useHostQuery<ProjectDirectories>(["folders", path], "projects.browse", { path });
  const homeLabel = copy("Ev klasörü", "Home folder");
  useEffect(() => {
    if (!folders.data) return;
    const data = folders.data;
    setLocations([
      ...(data.home ? [{ value: data.home, label: homeLabel, detail: data.home }] : []),
      ...(data.roots ?? [])
        .filter((root) => !data.home || pathKey(root.path) !== pathKey(data.home))
        .map((root) => ({ value: root.path, label: root.name, detail: root.path })),
    ]);
  }, [folders.data, homeLabel]);
  const current = folders.data?.path;
  const entries = (folders.data?.entries ?? []).filter((entry) =>
    entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const location = useMemo(
    () =>
      current
        ? [...locations]
            .sort((a, b) => b.value.length - a.value.length)
            .find((item) => inside(current, item.value))?.value
        : undefined,
    [locations, current],
  );
  const navigate = (next: string) => {
    if (mutation.isPending) return;
    setSearch("");
    setPath(next);
  };
  return (
    <Sheet
      visible
      size="full"
      scroll={false}
      dismissible={!mutation.isPending}
      title={copy("Proje ekle", "Add project")}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      footer={
        <View style={{ gap: space.sm }}>
          <MutationState mutation={mutation} />
          <Button
            label={copy("Bu klasörü aç", "Open this folder")}
            tone="primary"
            fullWidth
            disabled={!current || folders.isFetching || folders.isPending || !!folders.error}
            busy={mutation.isPending}
            onPress={() => {
              if (current) onOpen(current);
            }}
          />
        </View>
      }
    >
      <ScreenList
        data={entries}
        keyExtractor={(entry) => entry.path}
        header={
          <>
            <SelectField
              label={copy("Disk veya konum", "Drive or location")}
              compact
              hideLabel
              searchable={false}
              options={locations}
              value={location}
              placeholder={copy("Disk veya konum seç", "Choose a drive or location")}
              disabled={!locations.length || mutation.isPending}
              onChange={navigate}
            />
            <Row style={{ flexWrap: "nowrap", gap: space.sm }}>
              <IconButton
                label={copy("Üst klasör", "Parent folder")}
                disabled={
                  !folders.data?.parent ||
                  folders.isFetching ||
                  !!folders.error ||
                  mutation.isPending
                }
                onPress={() => {
                  if (folders.data?.parent) navigate(folders.data.parent);
                }}
              >
                <ArrowUp size={18} color={colors.muted} />
              </IconButton>
              <Body
                mono
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[uiStyles.grow, uiStyles.caption]}
              >
                {current ?? path ?? copy("Bir klasör seç", "Choose a folder")}
              </Body>
              {folders.isFetching && folders.data ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : null}
            </Row>
            {(folders.data?.entries.length ?? 0) > 12 ? (
              <SearchField
                label={copy("Klasör ara", "Find a folder")}
                placeholder={copy("Klasör ara", "Find a folder")}
                value={search}
                onChangeText={setSearch}
              />
            ) : null}
            <QueryState
              query={folders}
              empty={!!folders.data && !entries.length}
              emptyTitle={
                search
                  ? copy("Aramana uyan klasör yok.", "No folders match your search.")
                  : copy("Alt klasör yok", "No subfolders")
              }
            />
          </>
        }
        contentContainerStyle={{ gap: 0 }}
        renderItem={({ item: entry, index }) => (
          <GroupedListRow
            first={index === 0}
            last={index === entries.length - 1}
            inset={rowInset}
          >
            <NavigationRow
              variant="plain"
              label={entry.name}
              icon={
                <IconTile color={colors.accent}>
                  <Folder size={18} strokeWidth={2} color={colors.accent} />
                </IconTile>
              }
              disabled={folders.isFetching || !!folders.error || mutation.isPending}
              onPress={() => navigate(entry.path)}
            />
          </GroupedListRow>
        )}
        footer={
          <Disclosure label={copy("Yol gir", "Enter path")}>
            <IdentifierField
              label={copy("Klasör yolu", "Folder path")}
              value={manual}
              onChangeText={setManual}
              placeholder={copy(
                "Bilgisayarındaki tam klasör yolu",
                "Full folder path on your computer",
              )}
              editable={!mutation.isPending}
            />
            <Button
              label={copy("Bu yola göz at", "Browse this path")}
              disabled={!manual.trim() || mutation.isPending}
              onPress={() => navigate(manual.trim())}
            />
          </Disclosure>
        }
      />
    </Sheet>
  );
}

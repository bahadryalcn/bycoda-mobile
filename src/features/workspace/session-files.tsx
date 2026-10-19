import { useMobileTheme } from "@/ui/theme";
import { useMemo, useState } from "react";
import { View } from "react-native";
import Paperclip from "lucide-react-native/icons/paperclip";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import {
  Badge,
  Body,
  Button,
  Empty,
  ErrorText,
  IconButton,
  Row,
  ScreenList,
  SearchField,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { useHostClient } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { AttachmentFile } from "./transcript-attachments";
import { useEarlierSession } from "./session-queries";
import {
  defaultSessionFileFilters,
  filterSessionFiles,
  sessionFileIndex,
  type SessionFile,
  type SessionFileFilters,
} from "./session-file-model";
import type { HostSession } from "./wire";
import type { SessionScope } from "./session-types";

/** A session index reuses the same authenticated viewer as each message. */
export function SessionFiles({ scope, session }: { scope: SessionScope; session: HostSession }) {
  useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SessionFileFilters>(defaultSessionFileFilters);
  const earlier = useEarlierSession(scope, session);
  const files = useMemo(() => sessionFileIndex(session.session.blocks), [session.session.blocks]);
  const filtered = useMemo(
    () => filterSessionFiles(files, search, filters),
    [files, search, filters],
  );
  const activeFilters = filters.source !== "all" || filters.kind !== "all";
  const context = client
    ? {
        client,
        machineId: scope.machineId,
        projectId: session.projectId,
        sessionId: scope.sessionId,
        cwd: session.session.worktreeCwd || session.session.cwd,
      }
    : undefined;
  return (
    <>
      <ChatAction label={copy("Oturum dosyaları", "Session files")} onPress={() => setOpen(true)}>
        <Paperclip size={19} color={colors.muted} />
      </ChatAction>
      <Sheet
        visible={open}
        title={copy("Oturum dosyaları", "Session files")}
        size="form"
        scroll={false}
        onClose={() => setOpen(false)}
      >
        {open ? (
          <ScreenList<SessionFile>
            style={{ backgroundColor: colors.panel }}
            data={filtered}
            keyExtractor={(file) => file.key}
            header={
              <View style={{ gap: space.sm }}>
                <Row style={{ flexWrap: "nowrap" }}>
                  <View style={uiStyles.grow}>
                    <SearchField
                      label={copy("Oturum dosyalarında ara", "Search session files")}
                      value={search}
                      onChangeText={setSearch}
                    />
                  </View>
                  <IconButton
                    label={copy("Dosya filtreleri", "File filters")}
                    expanded={filtersOpen}
                    onPress={() => setFiltersOpen(true)}
                  >
                    <SlidersHorizontal
                      size={19}
                      color={activeFilters ? colors.accent : colors.muted}
                    />
                  </IconButton>
                </Row>
                <Row>
                  <Body muted style={uiStyles.caption}>
                    {copy("{p0} / {p1} dosya", "{p0} / {p1} files", {
                      p0: filtered.length,
                      p1: files.length,
                    })}
                  </Body>
                  {activeFilters ? (
                    <Badge label={copy("Filtre etkin", "Filter active")} tone="active" />
                  ) : null}
                </Row>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ gap: space.xs }}>
                <Body muted style={uiStyles.caption}>
                  {item.source === "user" ? copy("Siz", "You") : copy("Agent", "Agent")}
                </Body>
                {context ? (
                  <AttachmentFile
                    id={item.id}
                    name={item.name}
                    size={item.size}
                    mimeType={item.mimeType}
                    image={item.kind === "image"}
                    context={context}
                  />
                ) : null}
              </View>
            )}
            ListEmptyComponent={
              <Empty
                compact
                title={
                  files.length
                    ? copy("Aramana uyan dosya yok", "No files match your search")
                    : copy("Yüklenen mesajlarda dosya yok", "No files in loaded messages")
                }
              />
            }
            footer={
              session.history?.before !== undefined ? (
                <>
                  <Body muted style={uiStyles.caption}>
                    {copy(
                      "Daha eski dosyalar için önceki mesajları yükle.",
                      "Load earlier messages to find older files.",
                    )}
                  </Body>
                  <ErrorText error={earlier.error} />
                  <Button
                    label={copy("Önceki mesajları yükle", "Load earlier messages")}
                    busy={earlier.isPending}
                    onPress={() => {
                      void earlier.mutateAsync().catch(() => {});
                    }}
                  />
                </>
              ) : null
            }
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={open && filtersOpen}
        title={copy("Dosya filtreleri", "File filters")}
        size="compact"
        onClose={() => setFiltersOpen(false)}
      >
        <SelectField
          label={copy("Gönderen", "Sender")}
          value={filters.source}
          onChange={(source) => setFilters((current) => ({ ...current, source }))}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            { value: "user", label: copy("Siz", "You") },
            { value: "agent", label: copy("Agent", "Agent") },
          ]}
        />
        <SelectField
          label={copy("Dosya türü", "File type")}
          value={filters.kind}
          onChange={(kind) => setFilters((current) => ({ ...current, kind }))}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            { value: "image", label: copy("Resimler", "Images") },
            { value: "audio", label: copy("Ses", "Audio") },
            { value: "file", label: copy("Belgeler", "Documents") },
          ]}
        />
        <Button
          label={copy("Sıfırla", "Reset")}
          disabled={!activeFilters}
          onPress={() => setFilters(defaultSessionFileFilters)}
        />
      </Sheet>
    </>
  );
}

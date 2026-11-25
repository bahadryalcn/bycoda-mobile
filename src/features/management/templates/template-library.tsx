import type { TextInputInstance } from "react-native";
import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import {
  Badge,
  Body,
  Empty,
  ErrorNotice,
  IconButton,
  NavigationRow,
  Row,
  SearchField,
  SegmentedControl,
  Skeleton,
  StateView,
  Stack,
} from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { ScreenList } from "@/ui/screen-list";
import { errorMessage, remoteErrorKind } from "@/ui/error-message";
import { errorIllustration, errorTitle } from "@/ui/state-model";
import { SearchToolbar } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { MAX_TEMPLATES, type PromptTemplate } from "./template-model";
import { useTemplateHydration, useTemplates } from "./template-store";
import { TemplateEditor } from "./template-editor";
import { DesktopPreferences } from "@/features/workspace/desktop-preferences";
import type { SessionScope } from "@/features/workspace/session-types";

export function TemplateLibrary({
  onInsert,
  onClose,
  scope,
  projectId,
}: {
  onInsert: (body: string) => void;
  onClose: () => void;
  scope?: SessionScope;
  projectId?: string;
}) {
  useTemplateHydration();
  const copy = useCopy();
  const locale = useLocale();
  const { colors } = useMobileTheme();
  const state = useTemplates();
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [computer, setComputer] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<TextInputInstance>(null);
  const term = search.trim();
  const hasTemplates = state.rows.length > 0;
  const rows = state.rows.filter((row) =>
    matchesSearch(`${row.name} ${row.trigger ?? ""} ${row.body}`, search, locale),
  );
  const sourceSwitch = (
    <SegmentedControl
      hideLabel
      label={copy("Şablon kaynağı", "Template source")}
      value={computer ? "computer" : "phone"}
      onChange={(value) => setComputer(value === "computer")}
      options={[
        { value: "phone", label: copy("Telefon", "Phone") },
        { value: "computer", label: copy("Bilgisayar", "Computer") },
      ]}
    />
  );
  if (computer && scope && projectId)
    return (
      <Stack style={{ flex: 1 }}>
        {sourceSwitch}
        <DesktopPreferences
          scope={scope}
          projectId={projectId}
          onClose={onClose}
          onInsert={onInsert}
          embedded
        />
      </Stack>
    );
  if (editing)
    return (
      <TemplateEditor
        initial={editing}
        onClose={() => setEditing(null)}
        onInsert={() => {
          onInsert(editing.body);
          onClose();
        }}
      />
    );
  const addTemplate = () => {
    if (state.rows.length >= MAX_TEMPLATES || state.saving) return;
    if (!hasTemplates) setSearch("");
    setEditing({ id: randomUUID(), name: "", body: "" });
  };
  const loadFailed = !!state.error && !state.rows.length;
  const reload = copy("Şablonları yeniden yükle", "Reload templates");
  return (
    <ScreenList
      data={state.hydrated && !state.error ? rows : []}
      keyExtractor={(row) => row.id}
      renderItem={({ item: row }) => (
        <NavigationRow
          label={row.name}
          detail={truncateGraphemes(row.body.replace(/\s+/g, " ").trim(), 400)}
          detailLines={2}
          supporting={
            row.trigger || row.body.includes("{{cursor}}") ? (
              <Row>
                {row.trigger ? <Badge label={`;${row.trigger}`} /> : null}
                {row.body.includes("{{cursor}}") ? (
                  <Badge label={copy("İmleç noktası", "Cursor point")} tone="info" />
                ) : null}
              </Row>
            ) : undefined
          }
          accessibilityLabel={[row.name, row.trigger ? `;${row.trigger}` : ""]
            .filter(Boolean)
            .join(". ")}
          onPress={() => setEditing(row)}
        />
      )}
      ListEmptyComponent={
        !state.hydrated && !state.error ? (
          <Skeleton />
        ) : loadFailed ? (
          <StateView
            tone="danger"
            illustration={errorIllustration(remoteErrorKind(state.error))}
            title={errorTitle(remoteErrorKind(state.error), copy)}
            description={errorMessage(state.error, copy)}
            action={{
              label: reload,
              onPress: () => {
                void state.hydrate();
              },
            }}
          />
        ) : state.hydrated && !state.error && !rows.length ? (
          <Empty
            compact={false}
            illustration={term && state.rows.length ? "search-empty" : "inbox-empty"}
            title={
              term && state.rows.length
                ? copy("Eşleşen sonuç yok", "No matching results")
                : copy("Henüz şablon yok", "No templates yet")
            }
            detail={
              term && state.rows.length
                ? undefined
                : copy(
                    "Sık kullandığınız istemleri şablon olarak kaydedip tek dokunuşla ekleyin.",
                    "Save prompts you reuse as templates and insert them in one tap.",
                  )
            }
            action={
              term && state.rows.length
                ? {
                    label: copy("Aramayı temizle", "Clear search"),
                    onPress: () => {
                      setSearch("");
                      searchRef.current?.focus();
                    },
                  }
                : { label: copy("Yeni şablon", "New template"), onPress: addTemplate }
            }
          />
        ) : undefined
      }
      header={
        <Stack>
          {scope && projectId ? sourceSwitch : null}
          {state.error && !loadFailed ? (
            <ErrorNotice
              error={state.error}
              retryLabel={reload}
              onRetry={() => {
                void state.hydrate();
              }}
            />
          ) : null}
          {state.hydrated && !state.error && hasTemplates ? (
            <SearchToolbar
              search={
                <SearchField
                  ref={searchRef}
                  label={copy(
                    "Ad, tetikleyici veya metinde ara",
                    "Search template names, triggers and text",
                  )}
                  placeholder={copy("Şablonlarda ara", "Search templates")}
                  value={search}
                  onChangeText={setSearch}
                />
              }
              actions={
                <IconButton
                  label={copy("Şablon ekle", "Add template")}
                  disabled={state.rows.length >= MAX_TEMPLATES || state.saving}
                  onPress={addTemplate}
                >
                  <Plus size={iconSize.action} strokeWidth={2} color={colors.accent} />
                </IconButton>
              }
            />
          ) : null}
        </Stack>
      }
    />
  );
}

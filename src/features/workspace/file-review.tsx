import { useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { useIsFocused } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useActiveMachine } from "@/state/machines";
import { useHostClient, useHostQuery, useHostReadActive } from "@/state/queries";
import {
  StatusText,
  Body,
  Button,
  CodeText,
  Disclosure,
  ErrorText,
  Notice,
  QueryState,
  Row,
  Screen,
  SegmentedControl,
  StateView,
} from "@/ui/primitives";
import { DocumentPreview, ProjectMedia } from "@/ui/document-preview";
import { useCopy } from "@/ui/copy";
import { useProjectSubpage } from "./subpage-chrome";
import { useLocale } from "@/i18n";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { FileEditorProps } from "./file-editor-types";
import { isMediaFile } from "./file-preview-model";
import {
  fileDraftStorageKey,
  MAX_REVIEW_CHARACTERS,
  readPreservedFileDraft,
  reviewSource,
  selectionWindow,
} from "./file-review-model";

/** Normal mobile file navigation is an inspector. Legacy editor/draft owners remain intact. */
export function FileReview(props: FileEditorProps) {
  const machine = useActiveMachine();
  return (
    <FileReviewScope
      key={JSON.stringify([machine?.id, props.projectId, props.cwd, props.path, props.initialLine])}
      {...props}
    />
  );
}

function FileReviewScope({ projectId, cwd, root, path, initialLine, onBack }: FileEditorProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const client = useHostClient();
  const active = useHostReadActive();
  const media = isMediaFile(path);
  const context =
    client && machine && (cwd || root)
      ? { client, machineId: machine.id, projectId, cwd: cwd || root! }
      : undefined;
  const file = useHostQuery<string>(
    ["file", projectId, cwd, path],
    "files.read",
    { projectId, cwd, path },
    {
      enabled: !media,
      queryFn: async (host, signal) => {
        const value = await host.request<unknown>(
          "files.read",
          { projectId, cwd, path },
          { signal },
        );
        if (typeof value !== "string") throw new Error("Invalid file contents.");
        return value;
      },
    },
  );
  const key = fileDraftStorageKey(machine?.id, projectId, cwd, path);
  const draft = useQuery({
    queryKey: ["preserved-file-draft", key],
    queryFn: () => readPreservedFileDraft(AsyncStorage, key),
    enabled: active && !!machine,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const preserved = active ? draft.data : undefined;
  const hasDraft = !!preserved && preserved.content !== preserved.expected;
  const [source, setSource] = useState<"computer" | "draft">("computer");
  const [preview, setPreview] = useState(false);
  const text =
    source === "draft"
      ? hasDraft
        ? preserved.content
        : undefined
      : typeof file.data === "string"
        ? file.data
        : undefined;
  const binary = source === "computer" && media || text?.includes("\0") === true;
  const focused = useIsFocused();
  useBackHandler(focused, onBack);
  useProjectSubpage(path.split("/").filter(Boolean).at(-1) ?? path, onBack);
  return (
    <Screen scroll={false}>
      <View style={{ paddingHorizontal: space.screen, paddingVertical: space.sm, gap: space.xs }}>
        <Row>
          <StatusText
            label={
              source === "draft"
                ? copy("Korunan taslak · salt okunur", "Preserved draft · read only")
                : copy("Bilgisayardaki dosya · salt okunur", "Computer file · read only")
            }
          />
        </Row>
        <Disclosure label={copy("Konum", "Location")}>
          <Body mono muted selectable>{path}</Body>
          <Body mono muted selectable>{cwd || root || projectId}</Body>
        </Disclosure>
        {hasDraft ? (
          <>
            <Notice
              tone="warning"
              message={copy(
                "Önceki düzenlemenin taslağı bu telefonda korunuyor. Taslağı incelemek bilgisayardaki dosyayı değiştirmez.",
                "A draft from an earlier edit is preserved on this phone. Reviewing it does not change the computer file.",
              )}
            />
            <SegmentedControl
              label={copy("Dosya kaynağı", "File source")}
              value={source}
              options={[
                { value: "computer", label: copy("Bilgisayardaki dosya", "Computer file") },
                { value: "draft", label: copy("Korunan taslak", "Preserved draft") },
              ]}
              onChange={(value) => {
                setSource(value);
                setPreview(false);
              }}
            />
          </>
        ) : null}
        {source === "computer" && !media ? <QueryState query={file} loading="inline" /> : null}
        <ErrorText error={active ? draft.error : null} />
        {draft.isError && active ? (
          <Button busy={draft.isFetching}
            tone="quiet"
            label={copy("Dosya taslağını yeniden yükle", "Retry loading file draft")}
            onPress={() => void draft.refetch()}
          />
        ) : null}
      </View>
      {binary ? (
        <ScrollView style={{ flex: 1 }}>
          {source === "computer" && context ? (
            <ProjectMedia path={path} context={context} />
          ) : (
            <StateView
              illustration="unreachable"
              title={copy(
                "Dosyayı görüntülemek için bilgisayara bağlan.",
                "Connect to the computer to preview this file.",
              )}
            />
          )}
        </ScrollView>
      ) : text !== undefined ? (
        <>
          {/\.(?:html?|md|markdown)$/i.test(path) && text.length <= MAX_REVIEW_CHARACTERS ? (
            <Button
              tone="quiet"
              label={preview ? copy("Kaynağı göster", "Show source") : copy("Önizle", "Preview")}
              onPress={() => setPreview(!preview)}
            />
          ) : null}
          {preview ? (
            <ScrollView style={{ flex: 1 }}>
              <DocumentPreview
                name={path}
                text={text}
                context={source === "computer" ? context : undefined}
              />
            </ScrollView>
          ) : (
            <FileSource
              key={source}
              text={text}
              initialLine={source === "computer" ? initialLine : undefined}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}

/** Line numbers, selectable source, one virtualized vertical owner and a separate wide-content axis. */
export function FileSource({ text, initialLine }: { text: string; initialLine?: number }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const { width } = useWindowDimensions();
  const [atResult, setAtResult] = useState(true);
  const [selecting, setSelecting] = useState(false);
  // Line index the selection window starts at, and the row the line list resumes from.
  const [selectionStart, setSelectionStart] = useState(0);
  const [resumeIndex, setResumeIndex] = useState(0);
  // Updated from list scroll events without re-rendering; read when switching presentation.
  const topIndex = useRef(0);
  const source = useMemo(
    () => reviewSource(text, atResult ? initialLine : undefined),
    [text, initialLine, atResult],
  );
  const selection = selectionWindow(source.lines, selectionStart);
  const lineHeight = uiStyles.mono.lineHeight;
  const toggleSelecting = () => {
    if (selecting) {
      // Resume the line list where the selection window began (it was unmounted meanwhile).
      topIndex.current = selection.start;
      setResumeIndex(selection.start);
    } else {
      setSelectionStart(topIndex.current);
    }
    setSelecting(!selecting);
  };
  const toggleResult = () => {
    // A different source window renumbers rows: restart both presentations at its top.
    topIndex.current = 0;
    setSelectionStart(0);
    setResumeIndex(0);
    setAtResult(!atResult);
  };
  const contentWidth = Math.max(
    width - space.screen * 2,
    source.columns * uiStyles.mono.fontSize * 0.65 + 64,
  );
  return (
    <View style={{ flex: 1, minHeight: 0, gap: space.xs }}>
      {source.targetLine !== undefined ? (
        <Body muted style={{ paddingHorizontal: space.screen }}>
          {copy(
            "Arama sonucu: {p0}. satır. Dosya içeriği değişmiş olabilir.",
            "Search result: line {p0}. File contents may have changed.",
            { p0: numbers.format(source.targetLine) },
          )}
        </Body>
      ) : null}
      {source.locationUnavailable ? (
        <View style={{ paddingHorizontal: space.screen }}><Notice
          tone="warning"
          message={copy(
            "Arama satırı bu sınırlı önizlemede bulunamadı. Dosya değişmiş veya satır önizleme sınırının dışında olabilir.",
            "The search line is unavailable in this bounded preview. The file may have changed or the line may be beyond the preview limit.",
          )}
        /></View>
      ) : null}
      <Row style={{ paddingHorizontal: space.screen }}>
        {initialLine !== undefined && !source.locationUnavailable ? (
          <Button
            tone="quiet" flush
            label={
              atResult
                ? copy("Dosyanın başını göster", "Show file beginning")
                : copy("Arama sonucuna dön", "Back to search result")
            }
            onPress={toggleResult}
          />
        ) : null}
        <Button
          tone="quiet" flush
          label={selecting ? copy("Satır görünümü", "Line view") : copy("Metin seç", "Select text")}
          onPress={toggleSelecting}
        />
        {selecting && selection.previousStart !== undefined ? (
          <Button
            tone="quiet" flush
            label={copy("Önceki satırlar", "Previous lines")}
            onPress={() => setSelectionStart(selection.previousStart!)}
          />
        ) : null}
        {selecting && selection.nextStart !== undefined ? (
          <Button
            tone="quiet" flush
            label={copy("Sonraki satırlar", "Next lines")}
            onPress={() => setSelectionStart(selection.nextStart!)}
          />
        ) : null}
      </Row>
      {source.truncated ? (
        <Body muted style={{ paddingHorizontal: space.screen }}>
          {copy(
            "Önizleme sınırına ulaşıldı. Tam dosyayı bilgisayarında incele; içerik değiştirilmedi.",
            "Preview limit reached. Inspect the full file on your computer; its contents were not changed.",
          )}
        </Body>
      ) : null}
      {selecting ? (
        <>
          {selection.firstNumber !== undefined ? (
            <Body muted style={{ paddingHorizontal: space.screen }}>
              {copy("Satır {p0}–{p1}", "Lines {p0}–{p1}", {
                p0: numbers.format(selection.firstNumber),
                p1: numbers.format(selection.lastNumber!),
              })}
            </Body>
          ) : null}
          <ScrollView key={`${atResult ? "selection-result" : "selection-beginning"}:${selection.start}`} style={{ flex: 1 }}>
            {/* One native text owner lets selection handles cross newlines. Keep line
                numbers out of copied text; only one bounded window is mounted. */}
            <CodeText selectable style={{ paddingHorizontal: space.screen }}>
              {selection.text}
            </CodeText>
          </ScrollView>
        </>
      ) : (
      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <FlatList
          key={atResult ? "result" : "beginning"}
          data={source.lines}
          style={{ width: contentWidth }}
          keyExtractor={(line) => String(line.number)}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          windowSize={7}
          // Rows are single-line with a fixed height, so offsets are exact and the list
          // can resume at the row the selection window left off.
          getItemLayout={(_, index) => ({ length: lineHeight, offset: lineHeight * index, index })}
          initialScrollIndex={Math.min(resumeIndex, Math.max(0, source.lines.length - 1))}
          scrollEventThrottle={100}
          onScroll={(event) => {
            topIndex.current = Math.max(0, Math.floor(event.nativeEvent.contentOffset.y / lineHeight));
          }}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                minHeight: uiStyles.mono.lineHeight,
                backgroundColor: item.number === source.targetLine ? colors.selected : colors.panel,
              }}
            >
              <CodeText
                selectable={false}
                style={{
                  width: 48,
                  textAlign: "right",
                  paddingEnd: space.sm,
                  color: colors.subtle,
                }}
              >
                {item.number}
              </CodeText>
              <CodeText selectable={false} style={{ flexShrink: 0 }}>
                {item.text || " "}
              </CodeText>
            </View>
          )}
        />
      </ScrollView>
      )}
    </View>
  );
}

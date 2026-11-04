import { useCallback, useMemo, useState } from "react";
import { BackHandler, FlatList, ScrollView, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useActiveMachine } from "@/state/machines";
import { useHostClient, useHostQuery, useHostReadActive } from "@/state/queries";
import {
  Body,
  Button,
  CodeText,
  ErrorText,
  Notice,
  QueryState,
  Row,
  Screen,
  SegmentedControl,
} from "@/ui/primitives";
import { DocumentPreview, ProjectMedia } from "@/ui/document-preview";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { FileEditorProps } from "./file-editor-types";
import { isMediaFile } from "./file-preview-model";
import {
  fileDraftStorageKey,
  MAX_REVIEW_CHARACTERS,
  readPreservedFileDraft,
  reviewSource,
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
  useMobileTheme();
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
  const binary = media || text?.includes("\0") === true;
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [onBack]),
  );
  return (
    <Screen scroll={false}>
      <View style={{ paddingHorizontal: space.screen, paddingVertical: space.sm, gap: space.xs }}>
        <Row>
          <Button tone="quiet" label={copy("Dosyalara dön", "Back to files")} onPress={onBack} />
          <Body muted>
            {source === "draft"
              ? copy("Korunan taslak · salt okunur", "Preserved draft · read only")
              : copy("Bilgisayardaki dosya · salt okunur", "Computer file · read only")}
          </Body>
        </Row>
        <Body mono selectable>
          {path}
        </Body>
        <Body mono muted selectable>
          {cwd || root || projectId}
        </Body>
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
            <Notice
              tone="warning"
              message={copy(
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
  const copy = useCopy();
  const { width } = useWindowDimensions();
  const [atResult, setAtResult] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const source = useMemo(
    () => reviewSource(text, atResult ? initialLine : undefined),
    [text, initialLine, atResult],
  );
  const contentWidth = Math.max(
    width - space.screen * 2,
    source.columns * uiStyles.mono.fontSize * 0.65 + 64,
  );
  return (
    <View style={{ flex: 1, minHeight: 0, gap: space.xs }}>
      {source.targetLine !== undefined ? (
        <Body muted>
          {copy(
            "Arama sonucu: {p0}. satır. Dosya içeriği değişmiş olabilir.",
            "Search result: line {p0}. File contents may have changed.",
            { p0: source.targetLine },
          )}
        </Body>
      ) : null}
      {source.locationUnavailable ? (
        <Notice
          tone="warning"
          message={copy(
            "Arama satırı bu sınırlı önizlemede bulunamadı. Dosya değişmiş veya satır önizleme sınırının dışında olabilir.",
            "The search line is unavailable in this bounded preview. The file may have changed or the line may be beyond the preview limit.",
          )}
        />
      ) : null}
      <Row>
        {initialLine !== undefined && !source.locationUnavailable ? (
          <Button
            tone="quiet"
            label={
              atResult
                ? copy("Dosyanın başını göster", "Show file beginning")
                : copy("Arama sonucuna dön", "Back to search result")
            }
            onPress={() => setAtResult(!atResult)}
          />
        ) : null}
        <Button
          tone="quiet"
          label={selecting ? copy("Satır görünümü", "Line view") : copy("Metin seç", "Select text")}
          onPress={() => setSelecting(!selecting)}
        />
      </Row>
      {source.truncated ? (
        <Body muted>
          {copy(
            "Önizleme sınırına ulaşıldı. Tam dosyayı bilgisayarında incele; içerik değiştirilmedi.",
            "Preview limit reached. Inspect the full file on your computer; its contents were not changed.",
          )}
        </Body>
      ) : null}
      {selecting ? (
        <ScrollView key={atResult ? "selection-result" : "selection-beginning"} style={{ flex: 1 }}>
          {/* One native text owner lets selection handles cross newlines. Keep line
              numbers out of copied text and retain the same bounded source window. */}
          <CodeText selectable style={{ paddingHorizontal: space.screen }}>
            {source.lines.map((line) => line.text).join("\n")}
          </CodeText>
        </ScrollView>
      ) : null}
      <ScrollView horizontal style={{ flex: 1, display: selecting ? "none" : "flex" }} contentContainerStyle={{ flexGrow: 1 }}>
        <FlatList
          key={atResult ? "result" : "beginning"}
          data={source.lines}
          style={{ width: contentWidth }}
          keyExtractor={(line) => String(line.number)}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          windowSize={7}
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
              <CodeText style={{ flexShrink: 0 }}>{item.text || " "}</CodeText>
            </View>
          )}
        />
      </ScrollView>
    </View>
  );
}

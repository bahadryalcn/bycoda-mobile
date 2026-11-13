import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { useHostClient } from "@/state/queries";
import { Body, CodePanel, CodeText, Disclosure, Empty, ErrorText, FormActions, Loading, NavigationRow, ScreenList, SearchField, Sheet } from "./primitives";
import { space } from "./tokens";
import { useCopy } from "./copy";
import { isBinaryDocument, mediaQueryKey, projectMediaQueryKey, resolveMediaPath, type MessageContext, type OpenDocument } from "./media-policy";
import type { HostFileEntry } from "@/remote/types";
import { DocumentContent } from "./document-content";
import { loadProjectMedia, type LoadedMedia } from "./media-loader";
import { documentDisplayName } from "./document-display-name";
import { usePrivateMediaData } from "./use-private-media-data";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "./use-reader-scope";
import { PrivateContentAccessProvider } from "./private-access";
import { ScreenChromeProvider } from "./layout";
import { useFilteredListScrollMemory } from "./use-list-scroll-memory";
import { matchesSearch, normalizeSearch } from "./search-matching";
import { ReaderContext } from "./reader-context";
import { useMobileTheme } from "./theme";

type ScopedFilePreviewProps = { path: string; context: MessageContext; onClose(): void };

/** A nested file chain belongs to one root file and one Host/project identity. */
export function ScopedFilePreview(props: ScopedFilePreviewProps) {
  const identity = JSON.stringify(mediaQueryKey(props.context, ["scoped-file-reader", props.path]));
  return <ScopedFilePreviewBody key={identity} {...props} />;
}

function ScopedFilePreviewBody({ path, context, onClose }: ScopedFilePreviewProps) {
  const copy = useCopy(), locale = useLocale(), scope = useReaderScope(context, path);
  const resolved = resolveMediaPath(context, path);
  const binary = isBinaryDocument(path);
  const folder = /[\\/]$/.test(path);
  const line = Number(/(?:#L?|:)(\d+)(?::\d+)?$/.exec(path)?.[1] ?? 0);
  const [search, setSearch] = useState("");
  const queryKey = folder ? mediaQueryKey(context, ["message-directory", context.machineId, context.projectId, context.cwd, resolved])
    : binary ? projectMediaQueryKey(context, path) : mediaQueryKey(context, ["message-file", context.machineId, context.projectId, context.sessionId, context.cwd, resolved]);
  const query = useQuery<string | HostFileEntry[] | LoadedMedia>({ queryKey, enabled: scope.available && !!resolved, retry: false, networkMode: "always",
    queryFn: async ({ signal }) => {
      scope.assertCurrent(); if (!resolved) throw new Error("This file is outside this project.");
      const value = folder ? await context.client.request<HostFileEntry[]>("files.list", { projectId: context.projectId, cwd: context.cwd,
        path: resolved.slice(context.cwd.replace(/\\/g, "/").replace(/\/$/, "").length + 1) }, { signal })
        : binary ? await loadProjectMedia(context, path, signal) : await context.client.request<string>("workspace.run", { command: "read_text_file", args: { path: resolved } }, { signal });
      if (!folder && !binary) {
        if (typeof value !== "string") throw new Error("Invalid file contents.");
        if (value.includes("\0")) {
          scope.assertCurrent();
          const media = await loadProjectMedia(context, path, signal);
          scope.assertCurrent();
          // Successful NUL detection overrides a text suffix so the local reader never decodes it again.
          return { ...media, mimeType: "application/x-bycoda-binary" };
        }
      }
      scope.assertCurrent(); return value;
    },
  });
  const raw = usePrivateMediaData(queryKey, query);
  const data = !folder && typeof raw === "string" ? raw : undefined;
  const directoryData = folder ? raw as HostFileEntry[] | undefined : undefined;
  const media = !folder && raw !== undefined && typeof raw !== "string" && !Array.isArray(raw) ? raw as LoadedMedia : undefined;
  const proof = folder ? directoryData : media ? JSON.stringify([media.uri, media.name, media.mimeType]) : data;
  const content = useReaderContentAccess(scope, proof, scope.available && raw !== undefined);
  const [child, setChild] = useState<{ path: string; context: MessageContext; owner: object } | null>(null);
  const currentChild = child?.owner === content.port ? child : null;
  const childNow = useRef(currentChild); childNow.current = currentChild;
  const searchKey = normalizeSearch(search, locale);
  const view = useMemo(() => ({}), [searchKey, locale, content.port]);
  const viewNow = useRef(view); viewNow.current = view;
  const input = useMemo(() => ({}), [content.port, !!currentChild]);
  const inputNow = useRef(input); inputNow.current = input;
  const openChild: OpenDocument = (nextPath, nextContext) => {
    if (!content.check() || childNow.current || nextContext.machineId !== context.machineId || nextContext.projectId !== context.projectId ||
      nextContext.sessionId !== context.sessionId || nextContext.cwd !== context.cwd) return;
    if (folder && (viewNow.current !== view || !rowsNow.current.some(entry => nextPath === entry.path + (entry.isDir ? "/" : "")))) return;
    const next = { path: nextPath, context: nextContext, owner: content.port }; childNow.current = next; setChild(next);
  };
  const changeSearch = (value: string) => { if (inputNow.current === input && content.check() && !childNow.current) setSearch(value); };
  const rows = useMemo(() => content.access.allowed ? (directoryData ?? []).filter(entry => matchesSearch(`${entry.name}\n${entry.path}`, search, locale)) : [], [directoryData, search, locale, content.access.allowed]);
  const rowsNow = useRef(rows); rowsNow.current = rows;
  const clearSearch = () => { if (viewNow.current === view) changeSearch(""); };
  const position = useFilteredListScrollMemory<HostFileEntry>(searchKey, scope.available && directoryData !== undefined, rows.length, { suspended: !scope.available || directoryData === undefined });
  const selectedQuery = query, selectedRetry = useReaderRetry(scope, query);
  const close = () => scope.close(onClose);
  const footer = !scope.available || !resolved ? <FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} />
    : <FormActions submitLabel={selectedQuery.error ? copy("Yeniden dene", "Retry") : copy("Yenile", "Refresh")}
      tone={selectedQuery.error ? "primary" : "quiet"} onSubmit={selectedQuery.error ? selectedRetry.retryError : selectedRetry.retry}
      feedback={selectedQuery.error ? <ErrorText error={selectedQuery.error} /> : undefined}
      busy={selectedQuery.isFetching} cancelLabel={copy("Kapat", "Close")} onCancel={close} allowCancelWhileBusy />;
  const status = !scope.ready || selectedQuery.isFetching && !selectedQuery.error ? <Loading /> : null;
  const unavailable = <Empty compact={false} illustration="unreachable" title={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} />;
  return <Sheet visible title={documentDisplayName(path)} size="full" scroll={!folder} onClose={close} footer={footer}>
    {!resolved ? <Body>{copy("Dosya bu projenin dışında.", "This file is outside this project.")}</Body>
      : !scope.available ? !scope.ready ? <Loading /> : unavailable
      : binary || media ? <>{status}{media ? <PrivateContentAccessProvider value={content.access}><ScopedMediaContent data={media} context={context} onOpenFile={openChild}
        onReload={() => { if (content.check()) selectedRetry.retry(); }} /></PrivateContentAccessProvider> : null}</>
      : folder ? <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: space.screen, paddingTop: space.sm }}><SearchField label={copy("Yüklenen kayıtlarda ara", "Search loaded records")}
          value={content.access.allowed ? search : ""} editable={content.access.allowed && !currentChild} onChangeText={changeSearch} /></View>
        <PrivateContentAccessProvider value={content.access}><ScopedDirectoryList {...position.listProps} context={context} data={rows}
          header={<View style={{ gap: space.sm }}>{status}{content.access.allowed ? <ReaderContext context={context} path={resolved} /> : null}</View>} onOpenFile={openChild}
          ListEmptyComponent={content.access.allowed && query.isSuccess ? <Empty compact title={searchKey ? copy("Eşleşen sonuç yok", "No matching results") : copy("Klasör boş", "Folder is empty")}
            action={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined} /> : undefined} />
        </PrivateContentAccessProvider>
      </View> : <>{status}{data !== undefined ? <PrivateContentAccessProvider value={content.access}><ScopedTextContent path={resolved} text={data} context={context} line={line} onOpenFile={openChild} /></PrivateContentAccessProvider> : null}</>}
    {currentChild && content.access.allowed ? <PrivateContentAccessProvider value={content.access}><ScopedFilePreview path={currentChild.path} context={currentChild.context}
      onClose={() => { if (childNow.current === currentChild) { childNow.current = null; setChild(null); } }} /></PrivateContentAccessProvider> : null}
  </Sheet>;
}

function ScopedDirectoryList({ context, onOpenFile, ...props }: Omit<import("./screen-list").ScreenListProps<HostFileEntry>, "renderItem" | "context"> & { context: MessageContext; onOpenFile: OpenDocument }) {
  const client = useHostClient();
  return <ScreenChromeProvider nativeTitle bottomSafeArea={false}><ScreenList<HostFileEntry> {...props} grouped keyExtractor={entry => entry.path}
    renderItem={({ item: entry }) => <NavigationRow label={entry.name + (entry.isDir ? "/" : "")} disabled={!client}
      onPress={() => { if (client) onOpenFile(entry.path + (entry.isDir ? "/" : ""), { ...context, client, basePath: undefined }); }} />} /></ScreenChromeProvider>;
}

function ScopedTextContent({ path, text, context, line, onOpenFile }: { path: string; text: string; context: MessageContext; line: number; onOpenFile: OpenDocument }) {
  const { colors } = useMobileTheme();
  const copy = useCopy(), client = useHostClient();
  if (!client) return null;
  const props = { name: path, text, context: { ...context, client }, onOpenFile };
  if (line <= 0) return <><ReaderContext context={props.context} path={path} /><DocumentContent {...props} /></>;
  return <><ReaderContext context={props.context} path={path} /><Body muted>{copy("Satır {p0}", "Line {p0}", { p0: line })}</Body><CodePanel><View>
    {text.split("\n").slice(Math.max(0, line - 6), line + 5).map((value, index) => { const number = Math.max(1, line - 5) + index;
      return <CodeText key={number} style={number === line ? { color: colors.accent, backgroundColor: colors.selected } : undefined}>{number} {value}</CodeText>; })}
  </View></CodePanel><Disclosure label={copy("Dosyanın tamamı", "Full file")}><DocumentContent {...props} /></Disclosure></>;
}

function ScopedMediaContent({ data, context, ...props }: { data: LoadedMedia; context: MessageContext; onOpenFile: OpenDocument; onReload(): void }) {
  const client = useHostClient();
  return client ? <><ReaderContext context={context} /><DocumentContent {...data} {...props} context={{ ...context, client }} /></> : null;
}

import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  Body,
  Button,
  CodePanel,
  CodeText,
  Disclosure,
  ErrorText,
  Loading,
  NavigationGroup,
  NavigationRow,
  Sheet,
} from "./primitives";
import { colors } from "./tokens";
import { useCopy } from "./copy";
import {
  mediaQueryKey,
  visibleMediaData,
  resolveMediaPath,
  type MessageContext,
  type OpenDocument,
} from "./media-policy";
import type { HostFileEntry } from "@/remote/types";
import { DocumentContent, ProjectMediaContent } from "./document-content";
import { documentDisplayName } from "./document-display-name";

export function ScopedFilePreview({
  path,
  context,
  onClose,
}: {
  path: string;
  context: MessageContext;
  onClose: () => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const resolved = resolveMediaPath(context, path);
  const binary =
    /\.(?:png|jpe?g|webp|gif|avif|svg|pdf|mp[34]|m4a|wav|ogg|webm|mov|zip|gz|tar|7z|woff2?|ttf|otf|sqlite|db)(?:#.*)?$/i.test(
      path,
    );
  const folder = /[\\/]$/.test(path);
  const [child, setChild] = useState<{ path: string; context: MessageContext } | null>(null);
  const openChild: OpenDocument = (path, nextContext) => setChild({ path, context: nextContext });
  const line = Number(/(?:#L?|:)(\d+)(?::\d+)?$/.exec(path)?.[1] ?? 0);
  const query = useQuery({
    queryKey: mediaQueryKey(context, [
      "message-file",
      context.machineId,
      context.projectId,
      context.sessionId,
      context.cwd,
      resolved,
    ]),
    queryFn: ({ signal }) =>
      context.client.request<string>(
        "workspace.run",
        { command: "read_text_file", args: { path: resolved } },
        { signal },
      ),
    enabled: !!resolved && !binary && !folder,
    retry: false,
    networkMode: "always",
  });
  const data = visibleMediaData(query);
  const directory = useQuery({
    queryKey: mediaQueryKey(context, [
      "message-directory",
      context.machineId,
      context.projectId,
      context.cwd,
      resolved,
    ]),
    queryFn: ({ signal }) =>
      context.client.request<HostFileEntry[]>(
        "files.list",
        {
          projectId: context.projectId,
          cwd: context.cwd,
          path:
            resolved?.slice(context.cwd.replace(/\\/g, "/").replace(/\/$/, "").length + 1) ?? "",
        },
        { signal },
      ),
    enabled: !!resolved && folder,
    retry: false,
    networkMode: "always",
  });
  const directoryData = visibleMediaData(directory);
  return (
    <Sheet
      visible
      title={documentDisplayName(path)}
      size="full"
      onClose={onClose}
    >
      {!resolved ? (
        <Body>{copy("Dosya bu projenin dışında.", "This file is outside this project.")}</Body>
      ) : folder ? (
        <>
          {directory.isFetching ? <Loading /> : null}
          <ErrorText error={directory.error} />
          {directory.error ? (
            <Button
              label={copy("Yeniden dene", "Retry")}
              onPress={() => {
                void directory.refetch();
              }}
            />
          ) : null}
          <NavigationGroup>
            {directoryData?.map((entry) => (
              <NavigationRow
                key={entry.path}
                label={entry.name + (entry.isDir ? "/" : "")}
                onPress={() =>
                  openChild(entry.path + (entry.isDir ? "/" : ""), {
                    ...context,
                    basePath: undefined,
                  })
                }
              />
            ))}
          </NavigationGroup>
          {directory.isSuccess && !directoryData?.length ? (
            <Body muted>{copy("Klasör boş", "Folder is empty")}</Body>
          ) : null}
        </>
      ) : binary ? (
        <ProjectMediaContent onOpenFile={openChild} path={path} context={context} />
      ) : (
        <>
          {query.isFetching ? <Loading /> : null}
          <ErrorText error={query.error} />
          {query.error ? (
            <Button
              label={copy("Yeniden dene", "Retry")}
              onPress={() => {
                void query.refetch();
              }}
            />
          ) : null}
          {data !== undefined ? (
            line > 0 ? (
              <>
                <Body muted>{copy("Satır {p0}", "Line {p0}", { p0: line })}</Body>
                <CodePanel>
                  <View>
                    {data
                      .split("\n")
                      .slice(Math.max(0, line - 6), line + 5)
                      .map((text, index) => {
                        const number = Math.max(1, line - 5) + index;
                        return (
                          <CodeText
                            key={number}
                            style={
                              number === line
                                ? { color: colors.accent, backgroundColor: colors.selected }
                                : undefined
                            }
                          >
                            {number} {text}
                          </CodeText>
                        );
                      })}
                  </View>
                </CodePanel>
                <Disclosure label={copy("Dosyanın tamamı", "Full file")}>
                  <DocumentContent
                    onOpenFile={openChild}
                    name={resolved}
                    text={data}
                    context={context}
                  />
                </Disclosure>
              </>
            ) : (
              <DocumentContent
                onOpenFile={openChild}
                name={resolved}
                text={data}
                context={context}
              />
            )
          ) : null}
        </>
      )}
      {child ? (
        <ScopedFilePreview
          path={child.path}
          context={child.context}
          onClose={() => setChild(null)}
        />
      ) : null}
    </Sheet>
  );
}

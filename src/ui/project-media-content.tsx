import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useHostClient } from "@/state/queries";
import { Button, ErrorText, Loading, Notice } from "./primitives";
import { DocumentContent } from "./document-content";
import { DocumentNavigation } from "./document-navigation";
import { projectMediaQueryKey, type MessageContext, type OpenDocument } from "./media-policy";
import { loadProjectMedia, type LoadedMedia } from "./media-loader";
import { useCopy } from "./copy";
import { space } from "./tokens";
import { PrivateContentAccessProvider } from "./private-access";
import { usePrivateMediaData } from "./use-private-media-data";
import { readerInstanceKey, useReaderContentAccess, useReaderRetry, useReaderScope } from "./use-reader-scope";

type Props = { path: string; context: MessageContext; onOpenFile?: OpenDocument };

/** Inline media follows its caller's current resource; explicit file sheets own their own opening. */
export function ProjectMediaContent(props: Props) {
  return <ProjectMediaBody key={readerInstanceKey(props.context, props.path)} {...props} />;
}

function ProjectMediaBody({ path, context, onOpenFile }: Props) {
  const copy = useCopy(), scope = useReaderScope(context, path);
  const queryKey = projectMediaQueryKey(context, path);
  const query = useQuery({ queryKey, enabled: scope.available, retry: false, networkMode: "always",
    queryFn: async ({ signal }) => { scope.assertCurrent(); const value = await loadProjectMedia(context, path, signal); scope.assertCurrent(); return value; },
  });
  const data = usePrivateMediaData(queryKey, query);
  const proof = data && JSON.stringify([data.uri, data.name, data.mimeType]);
  const content = useReaderContentAccess(scope, proof, scope.available && !!data);
  const { retry, retryError } = useReaderRetry(scope, query);
  const reload = () => { if (content.check()) retry(); };
  const guardOpen = (open: OpenDocument): OpenDocument => (nextPath, nextContext) => {
    if (content.check() && nextContext.machineId === context.machineId && nextContext.projectId === context.projectId &&
      nextContext.sessionId === context.sessionId && nextContext.cwd === context.cwd) open(nextPath, nextContext);
  };
  return <View style={{ gap: space.sm }}>
    {!scope.ready || scope.available && query.isFetching && !query.error ? <Loading /> : null}
    {!scope.available && scope.ready ? <Notice message={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} /> : null}
    {scope.available ? <><ErrorText error={query.error} />{query.error ? <Button busy={query.isFetching} label={copy("Yeniden dene", "Retry")} onPress={retryError} /> : null}
      {data ? <PrivateContentAccessProvider value={content.access}>
        {onOpenFile ? <ScopedProjectContent path={path} data={data} context={context} onReload={reload} onOpenFile={guardOpen(onOpenFile)} />
          : <DocumentNavigation key={proof}>{open => <ScopedProjectContent path={path} data={data} context={context} onReload={reload} onOpenFile={guardOpen(open)} />}</DocumentNavigation>}
      </PrivateContentAccessProvider> : null}</> : null}
  </View>;
}

function ScopedProjectContent({ path, data, context, ...props }: { path: string; data: LoadedMedia; context: MessageContext; onReload(): void; onOpenFile: OpenDocument }) {
  const client = useHostClient();
  return client ? <DocumentContent {...data} {...props} name={path} context={{ ...context, client }} /> : null;
}

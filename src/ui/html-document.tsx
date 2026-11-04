import { mediaQueryKey, visibleMediaData, mediaAccessRevoked } from "./media-policy";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Body, Button, ErrorText, Loading } from "./primitives";
import { HtmlPreview } from "./html-preview";
import type { HtmlPreviewInteraction } from "./html-preview-controls";
import { bundleHtmlResources } from "./html-resources";
import type { MessageContext } from "./media-policy";
import { useCopy } from "./copy";
import { space } from "./tokens";
export function HtmlDocument({ html, name, context, height, fill = false, interaction }: { html: string; name: string; context?: MessageContext; height?: number; fill?: boolean; interaction?: HtmlPreviewInteraction }) {
  const copy = useCopy();
  const query = useQuery({ queryKey: mediaQueryKey(context, ["html-resources", context?.machineId, context?.projectId, context?.sessionId, context?.cwd, name, html]), queryFn: ({ signal }) => bundleHtmlResources(html, name, context!, signal), enabled: !!context, retry: false, networkMode: "always" }); const data = visibleMediaData(query);
  return <View style={{ gap: space.sm, ...(fill ? { flex: 1, minHeight: 0 } : {}) }}>{mediaAccessRevoked(query.error) ? null : context && query.isPending ? <Loading /> : <HtmlPreview html={data?.html ?? html} height={height} fill={fill} interaction={interaction} />}{data?.unavailable ? <Body muted>{copy("{p0} kaynak yüklenemedi. Kaynak görünümünden dosya yollarını kontrol edebilirsin.", "{p0} resources could not be loaded. Check their paths in the source view.", { p0: data.unavailable })}</Body> : null}<ErrorText error={query.error} />{query.error ? <Button busy={query.isFetching} label={copy("Yeniden dene", "Retry")} onPress={() => { void query.refetch(); }} /> : null}</View>;
}

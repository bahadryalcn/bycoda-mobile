import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { Body, Button, ErrorText, Loading, Sheet } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { usePrivateContentAccess } from "./private-access";
import { usePrivateMediaData } from "./use-private-media-data";
import { mediaQueryKey, type MessageContext } from "./media-policy";
import { pdfPositionMessage, readPdfData, type PdfPosition } from "./pdf-data";
import { pdfHtml } from "./pdf-html";
import { PdfFrame } from "./pdf-frame";
import { space } from "./tokens";

/** The containing file reader owns Host access and sharing; this owns only local PDF reading. */
export function PdfDocument({ uri, name, context }: { uri: string; name: string; context?: MessageContext }) {
  return <PdfOpening key={JSON.stringify(mediaQueryKey(context, ["pdf-opening", uri, name]))} uri={uri} name={name} context={context} />;
}

function PdfOpening({ uri, name, context }: { uri: string; name: string; context?: MessageContext }) {
  const copy = useCopy(), locale = useLocale(), access = usePrivateContentAccess(), { colors } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false), [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const id = useId(), position = useRef<PdfPosition>({ page: 1, zoom: 1 }), live = useRef(true);
  // Cached-file completion and browser/native events must not revive a closed opening.
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const available = access.allowed && access.check();
  const queryKey = mediaQueryKey(context, ["pdf-data", uri]);
  const query = useQuery({ queryKey, enabled: available, retry: false, networkMode: "always",
    queryFn: async ({ signal }) => {
      if (!access.check()) throw new Error("PDF access is no longer available.");
      const data = await readPdfData(uri, signal);
      if (!live.current || !access.check()) throw new Error("PDF access is no longer available.");
      return data;
    },
  });
  const data = usePrivateMediaData(queryKey, query);
  const channel = `${id}:${expanded}:${attempt}`;
  const html = useMemo(() => data ? pdfHtml({ base64: data, channel, position: position.current, colors, locale, fontScale, labels: {
    loading: copy("PDF yükleniyor…", "Loading PDF…"),
    error: copy("PDF açılamadı. Dosyayı yeniden yükleyebilir veya başka bir uygulamada açabilirsin.", "PDF could not be opened. Reload the file or open it in another app."),
    password: copy("Bu PDF için parola gerekli.", "This PDF needs a password."),
    passwordIncorrect: copy("Parola yanlış. Yeniden dene.", "Incorrect password. Try again."),
    page: copy("Sayfa {p0} / {p1}", "Page {p0} of {p1}"),
    previous: copy("Önceki", "Previous"), next: copy("Sonraki", "Next"), zoomIn: copy("Yakınlaştır", "Zoom in"), zoomOut: copy("Uzaklaştır", "Zoom out"),
    fit: copy("Sayfayı sığdır", "Fit page"), open: copy("PDF'yi aç", "Open PDF"), passwordLabel: copy("Parola", "Password"),
  } }) : "", [data, channel, colors, locale, fontScale]);
  const framePort = useMemo(() => ({}), [html]);
  const currentFrame = useRef(framePort); currentFrame.current = framePort;
  const valid = () => live.current && currentFrame.current === framePort && access.check();
  const frame = (fill: boolean) => <PdfFrame key={`${channel}:${colors.background}`} html={html} title={name} fill={fill}
    onMessage={raw => { if (valid()) { const next = pdfPositionMessage(raw, channel); if (next) position.current = next; } }}
    onFailure={() => { if (valid()) setFailed(true); }} />;
  if (!available) return null;
  return <View style={{ gap: space.sm }}>
    {query.isPending ? <Loading label={copy("PDF yükleniyor…", "Loading PDF…")} /> : null}
    <ErrorText error={query.error} />
    {failed ? <Body>{copy("Önizleme kapandı. Yeniden açabilirsin.", "Preview stopped. You can retry.")}</Body> : null}
    {query.error || failed ? <Button label={copy("Yeniden dene", "Retry")} busy={query.isFetching} onPress={() => {
      if (!valid()) return; setFailed(false); setAttempt(value => value + 1); if (query.error) void query.refetch({ cancelRefetch: false });
    }} /> : null}
    {data && !failed ? <>
      {!expanded ? <>
        <Button tone="quiet" label={copy("PDF'yi büyüt", "Expand PDF")} onPress={() => { if (valid()) setExpanded(true); }} />
        {frame(false)}
      </> : null}
      <Sheet visible={expanded} size="full" scroll={false} title={name} onClose={() => { if (valid()) setExpanded(false); }}>
        {expanded ? frame(true) : null}
      </Sheet>
    </> : null}
  </View>;
}

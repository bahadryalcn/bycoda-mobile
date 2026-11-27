import { useMobileTheme } from "@/ui/theme";
import { Fragment, Suspense, lazy, memo, useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from "react-native";
import AppWindow from "lucide-react-native/icons/app-window";
import Globe from "lucide-react-native/icons/globe";
import MessageSquare from "lucide-react-native/icons/message-square";
import Square from "lucide-react-native/icons/square";
import SquareCheck from "lucide-react-native/icons/square-check";
import { decorativeSvgProps } from "./accessibility";
import { Body, ErrorText } from "./primitives";
import { radii, space } from "./tokens";
import { latexToText } from "./message-math";

// Lazy: the typesetting engine loads on the first formula, not with every chat screen.
const MessageMath = lazy(() => import("./message-math-view"));
import { useCopy } from "./copy";
import { RECORD_ACCESS_UNAVAILABLE } from "./record-access-copy";
import { markdownTarget } from "./message-inline";
import { linkIconKind, type LinkIconKind } from "./message-link-kind";
import { messageNodeText, parseMessage, MESSAGE_RENDER_LIMIT, type MessageNode } from "./message-model";
import { MessageReader } from "./message-reader";
import { MessageCode } from "./message-code";
import { MessageImage, MessageImageGallery } from "./message-image";
import { messageImageNodes } from "./message-image-gallery";
import { useChatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import { resolveMediaPath, type MessageContext, type OpenDocument } from "./media-policy";
import { scopedMessageReferences } from "./message-citations";
import { linkOnlyItem, sourceList } from "./message-link-item";
import { MessageSource, MessageSources } from "./message-sources";
import { messageSessionLink, messageSessionRoute } from "./message-session-link";
import { taskListItem } from "./message-task";
import { isLoopbackWebUrl, loopbackScopeKey, useLoopbackLink } from "./loopback-link";
import { messageTableData } from "./message-table-model";
import { MessageTable } from "./message-table";
import { InlineFileChip } from "./file-chip";
import { inlineCodeFilePath } from "./message-file-ref";
import { hasMention, mentionParts } from "./message-selection-model";
import { SelectableProse } from "./message-selection";
import { pushOnce } from "./navigation";

/** Width reserved for a list marker ("•", "12.", task box) so item text aligns. */
const LIST_MARKER_WIDTH = space.xxl;

// One inline list per parsed paragraph: settled paragraphs of a streaming message keep the same
// array, so the selection layer's memoized source is not rebuilt on every delta.
const proseCache = new WeakMap<MessageNode, MessageNode[]>();
function proseNodes(node: MessageNode): MessageNode[] {
  let all = proseCache.get(node);
  if (!all) {
    all = node.children.flatMap((entry) => (entry.type === "inline" ? entry.children : [entry]));
    proseCache.set(node, all);
  }
  return all;
}

/**
 * A workspace file named in prose: a tinted chip that opens the file viewer. Without an owner that
 * can open it the label stays plain text; the selection layer mirrors the same decision.
 */
function FileLink({
  path,
  label,
  context,
  children,
  onOpenFile,
  fontSize,
}: {
  path: string;
  label: string;
  context?: MessageContext;
  children: ReactNode;
  onOpenFile?: OpenDocument;
  fontSize: number;
}) {
  if (!context || !onOpenFile) return <Text>{children}</Text>;
  return <InlineFileChip label={label} target={path} fontSize={fontSize} onPress={() => onOpenFile(path, context)} />;
}

const LINK_ICONS: Record<LinkIconKind, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  session: MessageSquare,
  local: AppWindow,
  web: Globe,
};

/** One-em leading icon of an inline link, in the link's accent; it wraps with the words. */
function LinkIcon({ kind, fontSize }: { kind: LinkIconKind; fontSize: number }) {
  const { colors } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const Icon = LINK_ICONS[kind];
  // Same box as the file chip's icon, which the selection layer mirrors with one em space.
  const box = fontSize * fontScale;
  return (
    <View accessible={false} style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
      <Icon {...decorativeSvgProps} size={Math.round(box * 0.72)} color={colors.accent} strokeWidth={2} />
    </View>
  );
}

export const MessageContent = memo(function MessageContent({
  text,
  error,
  role = "assistant",
  textSize,
  context,
  onOpenFile,
  compactMedia = false,
  cacheId,
}: {
  text: string;
  /** Stable block id: keys the parse cache so streaming one message keeps the others cached. */
  cacheId?: string;
  error?: boolean;
  role?: "user" | "assistant" | "activity";
  textSize?: ChatTextSize;
  compactMedia?: boolean;
  context?: MessageContext;
  onOpenFile?: OpenDocument;
}) {
  const { colors } = useMobileTheme();
  const preference = useChatAppearance((state) => state.textSize);
  const typography = useChatTextStyles(textSize ?? preference);
  const bodyStyle = role === "user" ? typography.user : typography.assistant;
  const copy = useCopy();
  const [linkError, setLinkError] = useState<unknown>(null);
  // A transcript link proves its session by matching the session screen's owner; without context nothing is proven.
  const loopback = useLoopbackLink();
  const ownLoopback = context && loopback?.scope === loopbackScopeKey(context) ? loopback : null;
  const openWeb = (href: string) => {
    setLinkError(null);
    // Without a proven owner a loopback link names nothing on this phone, so it never reaches Linking.
    if (isLoopbackWebUrl(href)) {
      if (ownLoopback) ownLoopback.open(href);
      else setLinkError(copy(...RECORD_ACCESS_UNAVAILABLE));
      return;
    }
    void Linking.openURL(href).catch(setLinkError);
  };
  const nodes = useMemo(
    () => scopedMessageReferences(parseMessage(text, role === "assistant", cacheId), context),
    [text, role, cacheId, context?.cwd, context?.basePath],
  );
  // Every image the message shows, in reading order: one gallery, so a tap opens the right page.
  const imageNodes = useMemo(() => messageImageNodes(nodes), [nodes]);
  const galleryImages = useMemo(
    () => imageNodes.map((node) => ({ source: node.attrs.src || "", alt: node.text })),
    [imageNodes],
  );
  const galleryIndexOf = useMemo(() => new Map(imageNodes.map((node, index) => [node, index])), [imageNodes]);
  const fileChips = !!context && !!onOpenFile;
  // Inline code becomes a file chip only for a recognised file type inside the project/worktree.
  const codeFile = useCallback(
    (text: string) => {
      const path = context ? inlineCodeFilePath(text) : null;
      return path && context && resolveMediaPath(context, path) ? path : null;
    },
    [context?.cwd, context?.basePath, !context],
  );
  const proseSize: number = bodyStyle.fontSize ?? 15;
  const inline = (nodes: MessageNode[], fontSize: number = proseSize): ReactNode =>
    nodes.map((node, index) => {
      if (node.type === "math_inline" || node.type === "math_display")
        return (
          <Suspense
            key={index}
            fallback={<Text style={[typography.code, typography.inlineCode, { fontStyle: "italic" }]}>{latexToText(node.text)}</Text>}
          >
            <MessageMath
              tex={node.text}
              block={false}
              display={node.type === "math_display"}
              fontSize={bodyStyle.fontSize ?? 15}
              color={colors.text}
              fallbackStyle={{ ...typography.code, ...typography.inlineCode }}
            />
          </Suspense>
        );
      const child = node.children.length ? inline(node.children, fontSize) : node.text;
      if (node.type === "image")
        return compactMedia ? null : <Text key={index}>{node.attrs.alt || node.text}</Text>;
      if (node.type === "softbreak" || node.type === "hardbreak") return "\n";
      if (node.type === "link") {
        // The accent and a leading icon of what the link opens are its affordance, as in the
        // desktop transcript; the selection layer reserves the icon's slot (`linkIconKind`).
        const kind = linkIconKind(node.attrs.href || "");
        const session = messageSessionLink(node.attrs.href || "");
        if (session)
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent }}
              onPress={() => pushOnce(messageSessionRoute(session))}
            >
              {kind ? <LinkIcon kind={kind} fontSize={fontSize} /> : null}
              {child}
            </Text>
          );
        const target = markdownTarget(node.attrs.href || "");
        if (target.kind === "web")
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent }}
              onPress={() => openWeb(target.href)}
            >
              {kind ? <LinkIcon kind={kind} fontSize={fontSize} /> : null}
              {child}
            </Text>
          );
        if (target.kind === "file")
          return (
            <FileLink onOpenFile={onOpenFile} key={index} path={target.context} label={messageNodeText(node)} context={context} fontSize={fontSize}>
              {child}
            </FileLink>
          );
        return <Fragment key={index}>{child}</Fragment>;
      }
      if (node.type === "text" && context && hasMention(node.text)) {
        // Shared with the selection layer, which must produce the same characters.
        const parts = mentionParts(node.text).map((part) =>
          typeof part === "string" ? (
            part
          ) : (
            <FileLink onOpenFile={onOpenFile} key={part.at} path={part.path} label={part.path} context={context} fontSize={fontSize}>
              @{part.path}
            </FileLink>
          ),
        );
        return <Text key={index}>{parts}</Text>;
      }
      if (node.type === "code_inline" && fileChips) {
        const path = codeFile(node.text);
        if (path)
          return (
            <InlineFileChip key={index} label={node.text} target={path} fontSize={fontSize} onPress={() => onOpenFile!(path, context!)} />
          );
      }
      return (
        <Text
          key={index}
          style={
            node.type === "strong"
              ? { fontWeight: "700" }
              : node.type === "em"
                ? { fontStyle: "italic" }
                : node.type === "s"
                  ? { textDecorationLine: "line-through" }
                  : node.type === "code_inline"
                    ? [typography.code, typography.inlineCode]
                    : undefined
          }
        >
          {child}
        </Text>
      );
    });
  const images = (nodes: MessageNode[]): MessageNode[] =>
    nodes.flatMap((node) => (node.type === "image" ? [node] : images(node.children)));
  const hasInlineText = (nodes: MessageNode[]): boolean =>
    nodes.some(
      (node) =>
        node.type !== "image" &&
        (node.children.length ? hasInlineText(node.children) : !!node.text.trim()),
    );
  const render = (nodes: MessageNode[], depth = 0): ReactNode =>
    nodes.map((node, index) => {
      if (depth > 24) return null;
      const key = `${index}:${node.type}`;
      if (node.type === "fence" || node.type === "code_block")
        return (
          <MessageCode
            key={key}
            code={node.text}
            language={node.attrs.language}
            complete={node.complete}
            context={context}
            compact={compactMedia}
            textSize={textSize ?? preference}
          />
        );
      if (node.type === "math_block")
        return (
          <Suspense
            key={key}
            fallback={
              <ScrollView
                horizontal
                accessibilityLabel={node.text}
                style={{ backgroundColor: colors.panel, borderRadius: radii.control }}
                contentContainerStyle={{ padding: space.sm }}
              >
                <Text style={[typography.code, { fontStyle: "italic" }]}>{latexToText(node.text)}</Text>
              </ScrollView>
            }
          >
            <MessageMath
              tex={node.text}
              block
              display
              fontSize={bodyStyle.fontSize ?? 15}
              color={colors.text}
              panelColor={colors.panel}
              fallbackStyle={typography.code}
            />
          </Suspense>
        );
      if (node.type === "hr")
        return (
          <View
            key={key}
            style={{ height: 1, backgroundColor: colors.separator, marginVertical: space.sm }}
          />
        );
      if (node.type === "table")
        return (
          <MessageTable
            key={key}
            table={messageTableData(node)}
            bodyStyle={bodyStyle}
            renderCell={(cell) =>
              inline(proseNodes(cell), Math.max(12, proseSize - 2))
            }
          />
        );
      if (node.type === "bullet_list" || node.type === "ordered_list") {
        const sources = sourceList(node.children);
        if (sources) return <MessageSources key={key} items={sources} onOpen={openWeb} />;
        return (
          <View key={key} style={{ gap: space.xs }}>
            {node.children.map((item, itemIndex) => {
              const task = taskListItem(item);
              const children = task ? task.children : item.children;
              const linkItem = task ? null : linkOnlyItem(item);
              if (linkItem) return <MessageSource key={itemIndex} item={linkItem} onOpen={openWeb} />;
              return (
                <View
                  key={itemIndex}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}
                >
                  {task ? (
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={
                        !task.checked
                          ? copy("Tamamlanmadı", "Incomplete")
                          : copy("Tamamlandı", "Completed")
                      }
                      style={{
                        minWidth: LIST_MARKER_WIDTH,
                        minHeight: bodyStyle.lineHeight,
                        flexShrink: 0,
                        justifyContent: "center",
                        alignItems: "flex-start",
                      }}
                    >
                      {!task.checked ? (
                        <Square
                          {...decorativeSvgProps}
                          size={18}
                          color={colors.muted}
                          strokeWidth={1.75}
                        />
                      ) : (
                        <SquareCheck
                          {...decorativeSvgProps}
                          size={18}
                          color={colors.success}
                          strokeWidth={1.75}
                        />
                      )}
                    </View>
                  ) : (
                    <Body style={[bodyStyle, { minWidth: LIST_MARKER_WIDTH, flexShrink: 0, color: colors.muted }]}>
                      {node.type === "ordered_list"
                        ? `${Number(node.attrs.start ?? 1) + itemIndex}.`
                        : "•"}
                    </Body>
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                    {render(children, depth + 1)}
                  </View>
                </View>
              );
            })}
          </View>
        );
      }
      if (node.type === "blockquote")
        return (
          <View
            key={key}
            style={{
              borderStartWidth: 3,
              borderStartColor: colors.border,
              paddingStart: space.md,
              paddingVertical: space.xs,
              gap: space.sm,
            }}
          >
            {render(node.children, depth + 1)}
          </View>
        );
      if (node.type === "paragraph" || node.type === "heading") {
        const all = proseNodes(node);
        const proseStyle = [
          bodyStyle,
          node.type === "heading" && {
            ...typography.heading,
            // Modest scale: h1 one step above the section heading, h3+ one step below it.
            fontSize:
              typography.heading.fontSize +
              (node.tag === "h1" ? 2 : node.tag === "h2" ? 0 : -2),
            lineHeight:
              typography.heading.lineHeight +
              (node.tag === "h1" ? 3 : node.tag === "h2" ? 0 : -3),
          },
          error && { color: colors.danger },
        ];
        return (
          <View
            key={key}
            style={{
              gap: space.sm,
              marginTop: node.type === "heading" && depth === 0 && index > 0 ? space.xs : 0,
            }}
          >
            {!compactMedia || hasInlineText(all) ? (
              <SelectableProse
                nodes={all}
                compactMedia={compactMedia}
                mentions={!!context}
                codeSize={typography.code.fontSize}
                fileChips={fileChips}
                codeFile={fileChips ? codeFile : undefined}
                style={proseStyle}
              >
                <Body
                  accessibilityRole={node.type === "heading" ? "header" : undefined}
                  style={proseStyle}
                >
                  {inline(all, (StyleSheet.flatten(proseStyle) as TextStyle | undefined)?.fontSize ?? proseSize)}
                </Body>
              </SelectableProse>
            ) : null}
            {images(all).map((image, imageIndex) => (
              <MessageImage
                key={imageIndex}
                source={image.attrs.src || ""}
                alt={image.text}
                context={context}
                deferred={compactMedia}
                galleryIndex={galleryIndexOf.get(image)}
              />
            ))}
          </View>
        );
      }
      return (
        <View key={key} style={{ gap: space.sm }}>
          {node.children.length ? (
            render(node.children, depth + 1)
          ) : (
            <Body style={bodyStyle}>{node.text}</Body>
          )}
        </View>
      );
    });
  return (
    <MessageImageGallery images={galleryImages} context={context}>
      <View style={{ minWidth: 0, width: "100%", gap: space.row }}>
        {render(nodes)}
        <ErrorText error={linkError} />
        {text.length > MESSAGE_RENDER_LIMIT ? (
          <MessageReader
            text={text}
            textStyle={bodyStyle}
            hideInternalMetadata={role === "assistant"}
          />
        ) : null}
      </View>
    </MessageImageGallery>
  );
});

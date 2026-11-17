import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { Fragment, Suspense, lazy, memo, useMemo, useState, type ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import Square from "lucide-react-native/icons/square";
import SquareCheck from "lucide-react-native/icons/square-check";
import { decorativeSvgProps } from "./accessibility";
import { Body, ErrorText } from "./primitives";
import { radii, space } from "./tokens";
import { latexToText } from "./message-math";

// Lazy: the typesetting engine loads on the first formula, not with every chat screen.
const MessageMath = lazy(() => import("./message-math-view"));
import { useCopy } from "./copy";
import { markdownTarget } from "./message-inline";
import { parseMessage, MESSAGE_RENDER_LIMIT, type MessageNode } from "./message-model";
import { MessageReader } from "./message-reader";
import { MessageCode } from "./message-code";
import { MessageImage } from "./message-image";
import { useChatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import type { MessageContext, OpenDocument } from "./media-policy";
import { scopedMessageReferences } from "./message-citations";
import { linkOnlyItem, sourceList } from "./message-link-item";
import { MessageSource, MessageSources } from "./message-sources";
import { messageSessionLink, messageSessionRoute } from "./message-session-link";
import { taskListItem } from "./message-task";

/** Width reserved for a list marker ("•", "12.", task box) so item text aligns. */
const LIST_MARKER_WIDTH = space.xxl;

function FileLink({
  path,
  context,
  children,
  onOpenFile,
}: {
  path: string;
  context?: MessageContext;
  children: ReactNode;
  onOpenFile?: OpenDocument;
}) {
  const { colors } = useMobileTheme();
  return (
    <Text
      accessibilityRole={context && onOpenFile ? "link" : undefined}
      style={
        context && onOpenFile
          ? { color: colors.accent, textDecorationLine: "underline" }
          : undefined
      }
      onPress={context && onOpenFile ? () => onOpenFile(path, context) : undefined}
    >
      {children}
    </Text>
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
  const openWeb = (href: string) => {
    setLinkError(null);
    void Linking.openURL(href).catch(setLinkError);
  };
  const nodes = useMemo(
    () => scopedMessageReferences(parseMessage(text, role === "assistant", cacheId), context),
    [text, role, cacheId, context?.cwd, context?.basePath],
  );
  const inline = (nodes: MessageNode[]): ReactNode =>
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
      const child = node.children.length ? inline(node.children) : node.text;
      if (node.type === "image")
        return compactMedia ? null : <Text key={index}>{node.attrs.alt || node.text}</Text>;
      if (node.type === "softbreak" || node.type === "hardbreak") return "\n";
      if (node.type === "link") {
        const session = messageSessionLink(node.attrs.href || "");
        if (session)
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent, textDecorationLine: "underline" }}
              onPress={() => router.push(messageSessionRoute(session))}
            >
              {child}
            </Text>
          );
        const target = markdownTarget(node.attrs.href || "");
        if (target.kind === "web")
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent, textDecorationLine: "underline" }}
              onPress={() => {
                setLinkError(null);
                void Linking.openURL(target.href).catch(setLinkError);
              }}
            >
              {child}
            </Text>
          );
        if (target.kind === "file")
          return (
            <FileLink onOpenFile={onOpenFile} key={index} path={target.context} context={context}>
              {child}
            </FileLink>
          );
        return <Fragment key={index}>{child}</Fragment>;
      }
      if (node.type === "text" && context && /(^|\s)@/.test(node.text)) {
        const parts: ReactNode[] = [];
        let cursor = 0;
        for (const match of node.text.matchAll(/(^|\s)@(?:"([^"]+)"|([^\s]+))/g)) {
          const start = match.index! + match[1]!.length;
          parts.push(node.text.slice(cursor, start));
          const path = (match[2] || match[3] || "").replace(/[.,;!?]+$/, "");
          parts.push(
            <FileLink onOpenFile={onOpenFile} key={start} path={path} context={context}>
              @{path}
            </FileLink>,
          );
          cursor = match.index! + match[0].length;
        }
        parts.push(node.text.slice(cursor));
        return <Text key={index}>{parts}</Text>;
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
      if (node.type === "table") {
        const rows = node.children.flatMap((section) => section.children);
        return (
          <ScrollView key={key} horizontal contentContainerStyle={{ paddingVertical: space.xs }}>
            <View>
              {rows.map((row, rowIndex) => (
                <View
                  key={rowIndex}
                  style={{
                    flexDirection: "row",
                    borderBottomWidth: 1,
                    borderBottomColor: colors.separator,
                    backgroundColor: rowIndex === 0 ? colors.raised : undefined,
                  }}
                >
                  {row.children.map((cell, cellIndex) => (
                    <View key={cellIndex} style={{ width: 170, padding: space.sm }}>
                      <Body
                        accessibilityRole={cell.type === "th" ? "header" : undefined}
                        style={[
                          bodyStyle,
                          {
                            textAlign: cell.attrs.style?.includes("right")
                              ? "right"
                              : cell.attrs.style?.includes("center")
                                ? "center"
                                : "left",
                          },
                          cell.type === "th" && { fontWeight: "700" },
                        ]}
                      >
                        {inline(
                          cell.children.flatMap((entry) =>
                            entry.type === "inline" ? entry.children : [entry],
                          ),
                        )}
                      </Body>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      }
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
              borderStartWidth: 2,
              borderStartColor: colors.info,
              paddingStart: space.md,
              paddingVertical: space.xs,
              gap: space.sm,
            }}
          >
            {render(node.children, depth + 1)}
          </View>
        );
      if (node.type === "paragraph" || node.type === "heading") {
        const all = node.children.flatMap((entry) =>
          entry.type === "inline" ? entry.children : [entry],
        );
        return (
          <View
            key={key}
            style={{
              gap: space.sm,
              marginTop: node.type === "heading" && depth === 0 && index > 0 ? space.sm : 0,
            }}
          >
            {!compactMedia || hasInlineText(all) ? (
              <Body
                accessibilityRole={node.type === "heading" ? "header" : undefined}
                style={[
                  bodyStyle,
                  node.type === "heading" && {
                    ...typography.heading,
                    fontSize:
                      typography.heading.fontSize +
                      (node.tag === "h1" ? 5 : node.tag === "h2" ? 2 : 0),
                    lineHeight:
                      typography.heading.lineHeight +
                      (node.tag === "h1" ? 8 : node.tag === "h2" ? 3 : 0),
                  },
                  error && { color: colors.danger },
                ]}
              >
                {inline(all)}
              </Body>
            ) : null}
            {images(all).map((image, imageIndex) => (
              <MessageImage
                key={imageIndex}
                source={image.attrs.src || ""}
                alt={image.text}
                context={context}
                deferred={compactMedia}
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
    <View style={{ minWidth: 0, width: "100%", gap: space.md }}>
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
  );
});

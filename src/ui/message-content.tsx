import { useMobileTheme } from "@/ui/theme";
import { Fragment, memo, useMemo, type ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Body } from "./primitives";
import { colors, space } from "./tokens";
import { useCopy } from "./copy";
import { markdownTarget } from "./message-inline";
import { parseMessage, messageNodeText, type MessageNode } from "./message-model";
import { MessageCode } from "./message-code";
import { MessageImage } from "./message-image";
import { chatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import type { MessageContext, OpenDocument } from "./media-policy";
import { scopedMessageReferences } from "./message-citations";

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
  useMobileTheme();
  return (
    <Text
      accessibilityRole={context && onOpenFile ? "link" : undefined}
      style={{ color: colors.accent }}
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
}: {
  text: string;
  error?: boolean;
  role?: "user" | "assistant" | "activity";
  textSize?: ChatTextSize;
  compactMedia?: boolean;
  context?: MessageContext;
  onOpenFile?: OpenDocument;
}) {
  useMobileTheme();
  const preference = useChatAppearance((state) => state.textSize);
  const typography = chatTextStyles(textSize ?? preference);
  const bodyStyle = role === "user" ? typography.user : typography.assistant;
  const copy = useCopy();
  const nodes = useMemo(
    () => scopedMessageReferences(parseMessage(text), context),
    [text, context?.cwd, context?.basePath],
  );
  const inline = (nodes: MessageNode[]): ReactNode =>
    nodes.map((node, index) => {
      const child = node.children.length ? inline(node.children) : node.text;
      if (node.type === "image")
        return compactMedia ? null : <Text key={index}>{node.attrs.alt || node.text}</Text>;
      if (node.type === "softbreak" || node.type === "hardbreak") return "\n";
      if (node.type === "link") {
        const target = markdownTarget(node.attrs.href || "");
        if (target.kind === "web")
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent, textDecorationLine: "underline" }}
              onPress={() => {
                void Linking.openURL(target.href).catch(() => {});
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
                    ? typography.code
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
            code={node.text.trimEnd()}
            language={node.attrs.language}
            complete={node.complete}
            context={context}
            compact={compactMedia}
          />
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
                      <Body style={[bodyStyle, cell.type === "th" && { fontWeight: "700" }]}>
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
      if (node.type === "bullet_list" || node.type === "ordered_list")
        return (
          <View key={key} style={{ gap: space.xs }}>
            {node.children.map((item, itemIndex) => {
              const first = item.children
                .find((entry) => entry.type === "paragraph")
                ?.children.find((entry) => entry.type === "inline");
              const task = first && /^\[([ xX])\]\s/.exec(messageNodeText(first));
              const children = task
                ? item.children.map((entry) =>
                    entry.type === "paragraph"
                      ? {
                          ...entry,
                          children: entry.children.map((line) =>
                            line === first
                              ? {
                                  ...line,
                                  children: line.children.map((part, partIndex) =>
                                    partIndex === 0
                                      ? { ...part, text: part.text.replace(/^\[[ xX]\]\s/, "") }
                                      : part,
                                  ),
                                }
                              : line,
                          ),
                        }
                      : entry,
                  )
                : item.children;
              return (
                <View
                  key={itemIndex}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}
                >
                  <Body
                    accessibilityLabel={
                      task
                        ? task[1] === " "
                          ? copy("Tamamlanmadı", "Incomplete")
                          : copy("Tamamlandı", "Completed")
                        : undefined
                    }
                    style={[
                      bodyStyle,
                      {
                        width: 25,
                        color: task?.[1] !== " " && task ? colors.success : colors.muted,
                      },
                    ]}
                  >
                    {task
                      ? task[1] === " "
                        ? "☐"
                        : "☑"
                      : node.type === "ordered_list"
                        ? `${Number(node.attrs.start ?? 1) + itemIndex}.`
                        : "•"}
                  </Body>
                  <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                    {render(children, depth + 1)}
                  </View>
                </View>
              );
            })}
          </View>
        );
      if (node.type === "blockquote")
        return (
          <View
            key={key}
            style={{
              borderStartWidth: 2,
              borderStartColor: colors.border,
              paddingStart: space.md,
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
          <View key={key} style={{ gap: space.sm }}>
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
  return <View style={{ gap: space.sm }}>{render(nodes)}</View>;
});

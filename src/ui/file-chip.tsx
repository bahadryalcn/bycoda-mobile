import type { ComponentType, ReactNode } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import File from "lucide-react-native/icons/file";
import FileArchive from "lucide-react-native/icons/file-archive";
import FileCode from "lucide-react-native/icons/file-code";
import FileCode2 from "lucide-react-native/icons/file-code-2";
import FileImage from "lucide-react-native/icons/file-image";
import FileJson from "lucide-react-native/icons/file-json";
import FileText from "lucide-react-native/icons/file-text";
import Folder from "lucide-react-native/icons/folder";
import { decorativeSvgProps } from "./accessibility";
import { Body, PressableArea } from "./primitives";
import { mixHex } from "./palettes";
import { useMobileTheme } from "./theme";
import { metrics, radii, space, type MobileColors } from "./tokens";
import { fileChipText, fileReferenceKind, FILE_CHIP_END, type FileRefKind } from "./message-file-ref";

type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const ICONS: Record<FileRefKind, IconComponent> = {
  code: FileCode,
  markup: FileCode2,
  docs: FileText,
  data: FileJson,
  media: FileImage,
  archive: FileArchive,
  folder: Folder,
  other: File,
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Tint of one file kind (desktop `file-references.css`): the hue pulled toward the content ink for
 * text and a faint ground of the hue over the canvas, so both follow light and dark themes.
 */
export function fileChipTone(kind: FileRefKind, colors: MobileColors, mode: "light" | "dark") {
  const hue: Record<FileRefKind, string | null> = {
    code: colors.info,
    markup: colors.warning,
    docs: colors.merged,
    data: colors.success,
    media: colors.accent,
    folder: colors.accent,
    archive: null,
    other: null,
  };
  const value = hue[kind];
  if (!value || !HEX.test(value) || !HEX.test(colors.text) || !HEX.test(colors.background))
    return { ink: colors.text, ground: colors.raised, icon: colors.muted };
  return {
    ink: mixHex(value, colors.text, 78),
    ground: mixHex(value, colors.background, mode === "dark" ? 16 : 10),
    icon: value,
  };
}

/**
 * Inline file reference inside prose: icon, short name and a quieter " · L12". It stays a nested
 * Text so wrapping, links and the selection layer (which mirrors these characters) keep working;
 * the icon box is one em wide to match the selection layer's placeholder.
 */
export function InlineFileChip({
  label,
  target,
  fontSize,
  onPress,
}: {
  label: string;
  target: string;
  fontSize: number;
  onPress?: () => void;
}) {
  const { colors, mode } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const kind = fileReferenceKind(target);
  const tone = fileChipTone(kind, colors, mode);
  const Icon = ICONS[kind];
  const { name, location } = fileChipText(label, target);
  const box = fontSize * fontScale;
  return (
    <Text
      accessibilityRole={onPress ? "link" : undefined}
      accessibilityLabel={[name, location].filter(Boolean).join(", ")}
      onPress={onPress}
      suppressHighlighting
      style={{ color: tone.ink, backgroundColor: tone.ground, fontWeight: "500", textDecorationLine: "none" }}
    >
      <View
        style={{ width: box, height: box, alignItems: "center", justifyContent: "center", backgroundColor: tone.ground }}
      >
        <Icon {...decorativeSvgProps} size={Math.round(box * 0.78)} color={tone.icon} strokeWidth={1.75} />
      </View>
      {name}
      {location ? <Text style={{ color: colors.muted, fontWeight: "400" }}>{` · ${location}`}</Text> : null}
      {FILE_CHIP_END}
    </Text>
  );
}

/** Tinted 32dp icon tile of a file kind, shared by file chips and attachment rows. */
export function FileKindTile({ name }: { name: string }) {
  const { colors, mode } = useMobileTheme();
  const kind = fileReferenceKind(name);
  const tone = fileChipTone(kind, colors, mode);
  const Icon = ICONS[kind];
  return (
    <View
      style={{
        width: metrics.visualControl,
        height: metrics.visualControl,
        borderRadius: radii.control,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone.ground,
        flexShrink: 0,
      }}
    >
      <Icon {...decorativeSvgProps} size={18} color={tone.icon} strokeWidth={1.75} />
    </View>
  );
}

/**
 * Block file chip for attachments and file rows in a message: tinted icon tile, name and detail,
 * one 48dp target that opens the file. Name wraps (two lines) instead of being clipped.
 */
export function FileChip({
  name,
  detail,
  accessibilityLabel,
  onPress,
  disabled,
  trailing,
  nameLines = 2,
}: {
  name: string;
  detail?: string;
  accessibilityLabel?: string;
  /** Without a handler the chip is a static label (a file that cannot be opened here yet). */
  onPress?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  /** Compact attachment chips keep the name on one line. */
  nameLines?: 1 | 2;
}) {
  const { colors } = useMobileTheme();
  const label = accessibilityLabel ?? [name, detail].filter(Boolean).join(", ");
  const style = {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: metrics.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingStart: space.xs,
    paddingEnd: space.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  } as const;
  const content = (
    <>
      <FileKindTile name={name} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Body numberOfLines={nameLines} style={{ fontWeight: "500" }}>{name}</Body>
        {detail ? <Body muted numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>{detail}</Body> : null}
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View accessible accessibilityLabel={label} style={style}>{content}</View>;
  return (
    <PressableArea label={label} onPress={onPress} disabled={disabled} style={style}>
      {content}
    </PressableArea>
  );
}

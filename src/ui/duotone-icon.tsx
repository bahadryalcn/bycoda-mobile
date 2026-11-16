import Svg, { G, Path } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";
import { decorativeSvgProps } from "./accessibility";

/** Hand-drawn 24-grid planes. One caller-owned tint, no palette captured at import. */
export const duotoneIconMap = {
  laptop: {
    back: "M5 5h14v11H5z",
    front: "M6 5h12a2 2 0 0 1 2 2v9H4V7a2 2 0 0 1 2-2ZM4 16l-2 4h20l-2-4M10 20h4",
  },
  smartphone: {
    back: "M7 3h10v18H7z",
    front: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 5h4M12 18h.01",
  },
  folder: {
    back: "M3 8h18v11H3z",
    front: "M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  },
  "file-text": {
    back: "M5 2h9l5 5v15H5z",
    front: "M5 2h9l5 5v15H5V2ZM14 2v6h5M9 12h6M9 16h6",
  },
  "folder-open": {
    back: "M3 10h19l-3 10H3z",
    front: "M3 10V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2M3 10h19l-3 10H3V10Z",
  },
  layers: {
    back: "m2 16 10-6 10 6-10 6z",
    front: "m2 8 10-6 10 6-10 6L2 8ZM2 12l10 6 10-6",
  },
  "messages-square": {
    back: "M8 2h13v14l-4-3H8z",
    front: "M5 7h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 3V9a2 2 0 0 1 2-2ZM8 3h11a2 2 0 0 1 2 2v10",
  },
  "git-branch": {
    back: "M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM21 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    front: "M6 9v6M9 18a9 9 0 0 0 9-9M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM9 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM21 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
  },
  "square-check-big": {
    back: "M3 3h18v18H3z",
    front: "M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9M9 11l3 3L22 4",
  },
  target: {
    back: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z",
    front: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0ZM17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0ZM12 12h.01",
  },
  users: {
    back: "M15 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3Z",
    front: "M15 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3M19 4a4 4 0 0 1 0 7M22 21v-3a4 4 0 0 0-2-3.46",
  },
  clock: {
    back: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z",
    front: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM12 6v6l4 2",
  },
  "notebook-pen": {
    back: "M5 3h14v18H5z",
    front: "M18 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9M8 3v18M2 7h4M2 11h4M2 15h4m8-1 6-6 3 3-6 6-4 1 1-4Z",
  },
  bot: {
    back: "M4 7h16v13H4z",
    front: "M6 7h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM12 7V3H9M1 11v5M23 11v5M8 12v2M16 12v2M9 17h6",
  },
  megaphone: {
    back: "m8 8 13-5v16L8 14z",
    front: "M8 8h-5v6h5l13 5V3L8 8ZM8 8v6M5 14l2 7h4l-3-7",
  },
  activity: {
    back: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    front: "M2 12h5l3-9 4 18 3-9h5",
  },
  plug: {
    back: "M6 8h12v5a6 6 0 0 1-12 0z",
    front: "M6 8h12v5a6 6 0 0 1-12 0V8ZM9 8V2M15 8V2M12 19v3",
  },
  "key-round": {
    back: "M21 8a5 5 0 1 0-10 0 5 5 0 0 0 10 0Z",
    front: "M21 8a5 5 0 1 0-10 0 5 5 0 0 0 10 0ZM12 12 3 21H1v-4l9-9M5 17l2 2M16 8h.01",
  },
  inbox: {
    back: "M3 12h5l2 3h4l2-3h5v8H3z",
    front: "m3 12 3-8h12l3 8v8H3v-8ZM3 12h5l2 3h4l2-3h5",
  },
  "shield-check": {
    back: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z",
    front: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4ZM8 12l3 3 5-6",
  },
  server: {
    back: "M3 3h18v7H3zM3 14h18v7H3z",
    front: "M3 3h18v7H3V3ZM3 14h18v7H3v-7ZM7 6.5h.01M7 17.5h.01",
  },
  "scroll-text": {
    back: "M6 3h14v17H6z",
    front: "M6 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-4 0v-2H3v2a2 2 0 0 0 2 2h14M6 17V5a2 2 0 0 0-4 0v2h4M10 7h7M10 11h7",
  },
  globe: {
    back: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z",
    front: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20Z",
  },
  terminal: {
    back: "M5 3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z",
    front: "m6 8 4 4-4 4M13 16h5",
  },
  "chart-column": {
    back: "M7 9h3v11H7zM13 4h3v16h-3zM19 12h3v8h-3z",
    front: "M3 3v18h19M8 17v-7M14 17V5M20 17v-4",
  },
  cpu: {
    back: "M5 5h14v14H5z",
    front: "M5 5h14v14H5V5ZM9 9h6v6H9V9ZM9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4",
  },
  "settings-2": {
    back: "M9 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM21 16a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    front: "M6 2v3M6 11v11M18 2v11M18 19v3M9 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM21 16a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
  },
  info: {
    back: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z",
    front: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM12 11v6M12 7h.01",
  },
  "circle-check": {
    back: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z",
    front: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM8 12l3 3 5-6",
  },
  "triangle-alert": {
    back: "M12 3 2 21h20z",
    front: "M12 3 2 21h20L12 3ZM12 9v4M12 17h.01",
  },
  "circle-alert": {
    back: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z",
    front: "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0ZM12 7v6M12 17h.01",
  },
} as const satisfies Record<string, { back: string; front: string }>;

export type DuotoneIconName = keyof typeof duotoneIconMap;
export type DuotoneIconProps = LucideProps & { name: DuotoneIconName };

/** Identity glyphs at 20dp+. Smaller uses retain only the line geometry. */
export function DuotoneIcon({ name, size = 24, color = "currentColor", strokeWidth = 2, ...props }: DuotoneIconProps) {
  const paths = duotoneIconMap[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props} {...decorativeSvgProps}>
      {Number(size) >= 20 ? <Path d={paths.back} fill={color} opacity={0.35} /> : null}
      <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <Path d={paths.front} />
      </G>
    </Svg>
  );
}

function identityIcon(name: DuotoneIconName) {
  return function IdentityIcon(props: LucideProps) {
    return <DuotoneIcon {...props} name={name} />;
  };
}

export const Laptop = identityIcon("laptop");
export const Smartphone = identityIcon("smartphone");
export const Folder = identityIcon("folder");
export const FileText = identityIcon("file-text");
export const FolderOpen = identityIcon("folder-open");
export const Layers = identityIcon("layers");
export const MessagesSquare = identityIcon("messages-square");
export const GitBranch = identityIcon("git-branch");
export const CheckSquare = identityIcon("square-check-big");
export const Target = identityIcon("target");
export const Users = identityIcon("users");
export const Clock = identityIcon("clock");
export const NotebookPen = identityIcon("notebook-pen");
export const Bot = identityIcon("bot");
export const Megaphone = identityIcon("megaphone");
export const Activity = identityIcon("activity");
export const Plug = identityIcon("plug");
export const KeyRound = identityIcon("key-round");
export const Inbox = identityIcon("inbox");
export const ShieldCheck = identityIcon("shield-check");
export const Server = identityIcon("server");
export const ScrollText = identityIcon("scroll-text");
export const Globe = identityIcon("globe");
export const Terminal = identityIcon("terminal");
export const ChartColumn = identityIcon("chart-column");
export const Cpu = identityIcon("cpu");
export const Settings2 = identityIcon("settings-2");
export const Info = identityIcon("info");
export const CircleCheck = identityIcon("circle-check");
export const TriangleAlert = identityIcon("triangle-alert");
export const CircleAlert = identityIcon("circle-alert");

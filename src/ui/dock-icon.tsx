import { Image, type ColorValue } from "react-native";

const sources = {
  projects: require("../../assets/dock-icons/projects.png"),
  sessions: require("../../assets/dock-icons/sessions.png"),
  inbox: require("../../assets/dock-icons/inbox.png"),
  tools: require("../../assets/dock-icons/tools.png"),
  settings: require("../../assets/dock-icons/settings.png"),
  "new-session": require("../../assets/dock-icons/new-session.png"),
  more: require("../../assets/dock-icons/more.png"),
} as const;

export type DockIconName = keyof typeof sources;

/** Decorative alpha glyph; its 48dp parent owns label, role and interaction. */
export function DockIcon({ name, color }: { name: DockIconName; color: ColorValue }) {
  return (
    <Image
      source={sources[name]}
      accessible={false}
      importantForAccessibility="no"
      resizeMode="contain"
      style={{ width: 24, height: 24, tintColor: color }}
    />
  );
}

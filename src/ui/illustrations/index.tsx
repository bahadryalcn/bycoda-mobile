import ConnectComputer from "./art/connect-computer";
import NoProjects from "./art/no-projects";
import NoSessions from "./art/no-sessions";
import ChatEmpty from "./art/chat-empty";
import InboxEmpty from "./art/inbox-empty";
import SearchEmpty from "./art/search-empty";
import Unreachable from "./art/unreachable";
import Error from "./art/error";
import Success from "./art/success";
import Locked from "./art/locked";
import Permission from "./art/permission";
import Offline from "./art/offline";
import { useMobileTheme } from "../theme";

/** Every product state that has its own illustration. */
export const illustrationNames = [
  "connect-computer",
  "no-projects",
  "no-sessions",
  "chat-empty",
  "inbox-empty",
  "search-empty",
  "unreachable",
  "error",
  "success",
  "locked",
  "permission",
  "offline"
] as const;
export type IllustrationName = (typeof illustrationNames)[number];

const art = {
  "connect-computer": ConnectComputer,
  "no-projects": NoProjects,
  "no-sessions": NoSessions,
  "chat-empty": ChatEmpty,
  "inbox-empty": InboxEmpty,
  "search-empty": SearchEmpty,
  "unreachable": Unreachable,
  "error": Error,
  "success": Success,
  "locked": Locked,
  "permission": Permission,
  "offline": Offline,
} satisfies Record<IllustrationName, typeof ConnectComputer>;

/** Decorative art; the surrounding state title supplies the accessible meaning. */
export function Illustration({ name, size = 120 }: { name: IllustrationName; size?: number }) {
  // Art reads the palette without a hook; remounting per mode keeps compiled caches from going stale.
  const { mode } = useMobileTheme();
  const Art = art[name];
  return <Art key={mode} size={size} />;
}

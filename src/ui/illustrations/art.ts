import type { ImageSourcePropType } from "react-native";

/**
 * bycoda's state art: the website's pixel guide acting out each state (generated with the
 * product's image model from the guide sprites). Aspect is width / height.
 */
export const art = {
  "connect-computer": { source: require("../../../assets/states/connect-computer.png"), aspect: 812 / 623 },
  "no-projects": { source: require("../../../assets/states/no-projects.png"), aspect: 488 / 637 },
  "no-sessions": { source: require("../../../assets/states/no-sessions.png"), aspect: 369 / 658 },
  "chat-empty": { source: require("../../../assets/states/chat-empty.png"), aspect: 776 / 666 },
  "inbox-empty": { source: require("../../../assets/states/inbox-empty.png"), aspect: 680 / 645 },
  "search-empty": { source: require("../../../assets/states/search-empty.png"), aspect: 545 / 637 },
  "unreachable": { source: require("../../../assets/states/unreachable.png"), aspect: 554 / 654 },
  "error": { source: require("../../../assets/states/error.png"), aspect: 504 / 639 },
  "success": { source: require("../../../assets/states/success.png"), aspect: 594 / 652 },
  "locked": { source: require("../../../assets/states/locked.png"), aspect: 559 / 668 },
  "permission": { source: require("../../../assets/states/permission.png"), aspect: 520 / 657 },
  "offline": { source: require("../../../assets/states/offline.png"), aspect: 424 / 788 },
} satisfies Record<string, { source: ImageSourcePropType; aspect: number }>;

import type { SpriteLoop } from "../sprite-player";

/**
 * bycoda's state art: the website's pixel guide acting out each state (generated with the product's
 * image model from the guide sprites). Every scene is a hand-edited loop of palette-exact frames in
 * `assets/states/<name>/`, frame 0 being the rest pose. Aspect is width / height.
 */
type Art = SpriteLoop & { aspect: number };

/** Four seconds at six steps a second: breathing, bead sway, two blinks, brows, mustache twitch and the scene's prop. */
const loop: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 12, 13, 4, 14, 15, 16, 8, 17, 18, 11];
const fps = 6;

export const art = {
  "connect-computer": {
    frames: [
      require("../../../assets/states/connect-computer/frame-0.png"), require("../../../assets/states/connect-computer/frame-1.png"),
      require("../../../assets/states/connect-computer/frame-2.png"), require("../../../assets/states/connect-computer/frame-3.png"),
      require("../../../assets/states/connect-computer/frame-4.png"), require("../../../assets/states/connect-computer/frame-5.png"),
      require("../../../assets/states/connect-computer/frame-6.png"), require("../../../assets/states/connect-computer/frame-7.png"),
      require("../../../assets/states/connect-computer/frame-8.png"), require("../../../assets/states/connect-computer/frame-9.png"),
      require("../../../assets/states/connect-computer/frame-10.png"), require("../../../assets/states/connect-computer/frame-11.png"),
      require("../../../assets/states/connect-computer/frame-12.png"), require("../../../assets/states/connect-computer/frame-13.png"),
      require("../../../assets/states/connect-computer/frame-14.png"), require("../../../assets/states/connect-computer/frame-15.png"),
      require("../../../assets/states/connect-computer/frame-16.png"), require("../../../assets/states/connect-computer/frame-17.png"),
      require("../../../assets/states/connect-computer/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 812 / 623,
  },
  "no-projects": {
    frames: [
      require("../../../assets/states/no-projects/frame-0.png"), require("../../../assets/states/no-projects/frame-1.png"),
      require("../../../assets/states/no-projects/frame-2.png"), require("../../../assets/states/no-projects/frame-3.png"),
      require("../../../assets/states/no-projects/frame-4.png"), require("../../../assets/states/no-projects/frame-5.png"),
      require("../../../assets/states/no-projects/frame-6.png"), require("../../../assets/states/no-projects/frame-7.png"),
      require("../../../assets/states/no-projects/frame-8.png"), require("../../../assets/states/no-projects/frame-9.png"),
      require("../../../assets/states/no-projects/frame-10.png"), require("../../../assets/states/no-projects/frame-11.png"),
      require("../../../assets/states/no-projects/frame-12.png"), require("../../../assets/states/no-projects/frame-13.png"),
      require("../../../assets/states/no-projects/frame-14.png"), require("../../../assets/states/no-projects/frame-15.png"),
      require("../../../assets/states/no-projects/frame-16.png"), require("../../../assets/states/no-projects/frame-17.png"),
      require("../../../assets/states/no-projects/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 488 / 637,
  },
  "no-sessions": {
    frames: [
      require("../../../assets/states/no-sessions/frame-0.png"), require("../../../assets/states/no-sessions/frame-1.png"),
      require("../../../assets/states/no-sessions/frame-2.png"), require("../../../assets/states/no-sessions/frame-3.png"),
      require("../../../assets/states/no-sessions/frame-4.png"), require("../../../assets/states/no-sessions/frame-5.png"),
      require("../../../assets/states/no-sessions/frame-6.png"), require("../../../assets/states/no-sessions/frame-7.png"),
      require("../../../assets/states/no-sessions/frame-8.png"), require("../../../assets/states/no-sessions/frame-9.png"),
      require("../../../assets/states/no-sessions/frame-10.png"), require("../../../assets/states/no-sessions/frame-11.png"),
      require("../../../assets/states/no-sessions/frame-12.png"), require("../../../assets/states/no-sessions/frame-13.png"),
      require("../../../assets/states/no-sessions/frame-14.png"), require("../../../assets/states/no-sessions/frame-15.png"),
      require("../../../assets/states/no-sessions/frame-16.png"), require("../../../assets/states/no-sessions/frame-17.png"),
      require("../../../assets/states/no-sessions/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 369 / 658,
  },
  // The bubble's three typing dots fill in, so this scene's loop has its own order (17 frames).
  "chat-empty": {
    frames: [
      require("../../../assets/states/chat-empty/frame-0.png"), require("../../../assets/states/chat-empty/frame-1.png"),
      require("../../../assets/states/chat-empty/frame-2.png"), require("../../../assets/states/chat-empty/frame-3.png"),
      require("../../../assets/states/chat-empty/frame-4.png"), require("../../../assets/states/chat-empty/frame-5.png"),
      require("../../../assets/states/chat-empty/frame-6.png"), require("../../../assets/states/chat-empty/frame-7.png"),
      require("../../../assets/states/chat-empty/frame-8.png"), require("../../../assets/states/chat-empty/frame-9.png"),
      require("../../../assets/states/chat-empty/frame-10.png"), require("../../../assets/states/chat-empty/frame-11.png"),
      require("../../../assets/states/chat-empty/frame-12.png"), require("../../../assets/states/chat-empty/frame-13.png"),
      require("../../../assets/states/chat-empty/frame-14.png"), require("../../../assets/states/chat-empty/frame-15.png"),
      require("../../../assets/states/chat-empty/frame-16.png"),
    ],
    sequence: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0, 1, 2, 2, 11, 12, 13, 14, 15, 15, 16, 0], fps, aspect: 776 / 666,
  },
  "inbox-empty": {
    frames: [
      require("../../../assets/states/inbox-empty/frame-0.png"), require("../../../assets/states/inbox-empty/frame-1.png"),
      require("../../../assets/states/inbox-empty/frame-2.png"), require("../../../assets/states/inbox-empty/frame-3.png"),
      require("../../../assets/states/inbox-empty/frame-4.png"), require("../../../assets/states/inbox-empty/frame-5.png"),
      require("../../../assets/states/inbox-empty/frame-6.png"), require("../../../assets/states/inbox-empty/frame-7.png"),
      require("../../../assets/states/inbox-empty/frame-8.png"), require("../../../assets/states/inbox-empty/frame-9.png"),
      require("../../../assets/states/inbox-empty/frame-10.png"), require("../../../assets/states/inbox-empty/frame-11.png"),
      require("../../../assets/states/inbox-empty/frame-12.png"), require("../../../assets/states/inbox-empty/frame-13.png"),
      require("../../../assets/states/inbox-empty/frame-14.png"), require("../../../assets/states/inbox-empty/frame-15.png"),
      require("../../../assets/states/inbox-empty/frame-16.png"), require("../../../assets/states/inbox-empty/frame-17.png"),
      require("../../../assets/states/inbox-empty/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 680 / 645,
  },
  "search-empty": {
    frames: [
      require("../../../assets/states/search-empty/frame-0.png"), require("../../../assets/states/search-empty/frame-1.png"),
      require("../../../assets/states/search-empty/frame-2.png"), require("../../../assets/states/search-empty/frame-3.png"),
      require("../../../assets/states/search-empty/frame-4.png"), require("../../../assets/states/search-empty/frame-5.png"),
      require("../../../assets/states/search-empty/frame-6.png"), require("../../../assets/states/search-empty/frame-7.png"),
      require("../../../assets/states/search-empty/frame-8.png"), require("../../../assets/states/search-empty/frame-9.png"),
      require("../../../assets/states/search-empty/frame-10.png"), require("../../../assets/states/search-empty/frame-11.png"),
      require("../../../assets/states/search-empty/frame-12.png"), require("../../../assets/states/search-empty/frame-13.png"),
      require("../../../assets/states/search-empty/frame-14.png"), require("../../../assets/states/search-empty/frame-15.png"),
      require("../../../assets/states/search-empty/frame-16.png"), require("../../../assets/states/search-empty/frame-17.png"),
      require("../../../assets/states/search-empty/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 545 / 637,
  },
  "unreachable": {
    frames: [
      require("../../../assets/states/unreachable/frame-0.png"), require("../../../assets/states/unreachable/frame-1.png"),
      require("../../../assets/states/unreachable/frame-2.png"), require("../../../assets/states/unreachable/frame-3.png"),
      require("../../../assets/states/unreachable/frame-4.png"), require("../../../assets/states/unreachable/frame-5.png"),
      require("../../../assets/states/unreachable/frame-6.png"), require("../../../assets/states/unreachable/frame-7.png"),
      require("../../../assets/states/unreachable/frame-8.png"), require("../../../assets/states/unreachable/frame-9.png"),
      require("../../../assets/states/unreachable/frame-10.png"), require("../../../assets/states/unreachable/frame-11.png"),
      require("../../../assets/states/unreachable/frame-12.png"), require("../../../assets/states/unreachable/frame-13.png"),
      require("../../../assets/states/unreachable/frame-14.png"), require("../../../assets/states/unreachable/frame-15.png"),
      require("../../../assets/states/unreachable/frame-16.png"), require("../../../assets/states/unreachable/frame-17.png"),
      require("../../../assets/states/unreachable/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 554 / 654,
  },
  "error": {
    frames: [
      require("../../../assets/states/error/frame-0.png"), require("../../../assets/states/error/frame-1.png"),
      require("../../../assets/states/error/frame-2.png"), require("../../../assets/states/error/frame-3.png"),
      require("../../../assets/states/error/frame-4.png"), require("../../../assets/states/error/frame-5.png"),
      require("../../../assets/states/error/frame-6.png"), require("../../../assets/states/error/frame-7.png"),
      require("../../../assets/states/error/frame-8.png"), require("../../../assets/states/error/frame-9.png"),
      require("../../../assets/states/error/frame-10.png"), require("../../../assets/states/error/frame-11.png"),
      require("../../../assets/states/error/frame-12.png"), require("../../../assets/states/error/frame-13.png"),
      require("../../../assets/states/error/frame-14.png"), require("../../../assets/states/error/frame-15.png"),
      require("../../../assets/states/error/frame-16.png"), require("../../../assets/states/error/frame-17.png"),
      require("../../../assets/states/error/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 504 / 639,
  },
  "success": {
    frames: [
      require("../../../assets/states/success/frame-0.png"), require("../../../assets/states/success/frame-1.png"),
      require("../../../assets/states/success/frame-2.png"), require("../../../assets/states/success/frame-3.png"),
      require("../../../assets/states/success/frame-4.png"), require("../../../assets/states/success/frame-5.png"),
      require("../../../assets/states/success/frame-6.png"), require("../../../assets/states/success/frame-7.png"),
      require("../../../assets/states/success/frame-8.png"), require("../../../assets/states/success/frame-9.png"),
      require("../../../assets/states/success/frame-10.png"), require("../../../assets/states/success/frame-11.png"),
      require("../../../assets/states/success/frame-12.png"), require("../../../assets/states/success/frame-13.png"),
      require("../../../assets/states/success/frame-14.png"), require("../../../assets/states/success/frame-15.png"),
      require("../../../assets/states/success/frame-16.png"), require("../../../assets/states/success/frame-17.png"),
      require("../../../assets/states/success/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 594 / 652,
  },
  "locked": {
    frames: [
      require("../../../assets/states/locked/frame-0.png"), require("../../../assets/states/locked/frame-1.png"),
      require("../../../assets/states/locked/frame-2.png"), require("../../../assets/states/locked/frame-3.png"),
      require("../../../assets/states/locked/frame-4.png"), require("../../../assets/states/locked/frame-5.png"),
      require("../../../assets/states/locked/frame-6.png"), require("../../../assets/states/locked/frame-7.png"),
      require("../../../assets/states/locked/frame-8.png"), require("../../../assets/states/locked/frame-9.png"),
      require("../../../assets/states/locked/frame-10.png"), require("../../../assets/states/locked/frame-11.png"),
      require("../../../assets/states/locked/frame-12.png"), require("../../../assets/states/locked/frame-13.png"),
      require("../../../assets/states/locked/frame-14.png"), require("../../../assets/states/locked/frame-15.png"),
      require("../../../assets/states/locked/frame-16.png"), require("../../../assets/states/locked/frame-17.png"),
      require("../../../assets/states/locked/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 559 / 668,
  },
  "permission": {
    frames: [
      require("../../../assets/states/permission/frame-0.png"), require("../../../assets/states/permission/frame-1.png"),
      require("../../../assets/states/permission/frame-2.png"), require("../../../assets/states/permission/frame-3.png"),
      require("../../../assets/states/permission/frame-4.png"), require("../../../assets/states/permission/frame-5.png"),
      require("../../../assets/states/permission/frame-6.png"), require("../../../assets/states/permission/frame-7.png"),
      require("../../../assets/states/permission/frame-8.png"), require("../../../assets/states/permission/frame-9.png"),
      require("../../../assets/states/permission/frame-10.png"), require("../../../assets/states/permission/frame-11.png"),
      require("../../../assets/states/permission/frame-12.png"), require("../../../assets/states/permission/frame-13.png"),
      require("../../../assets/states/permission/frame-14.png"), require("../../../assets/states/permission/frame-15.png"),
      require("../../../assets/states/permission/frame-16.png"), require("../../../assets/states/permission/frame-17.png"),
      require("../../../assets/states/permission/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 520 / 657,
  },
  "offline": {
    frames: [
      require("../../../assets/states/offline/frame-0.png"), require("../../../assets/states/offline/frame-1.png"),
      require("../../../assets/states/offline/frame-2.png"), require("../../../assets/states/offline/frame-3.png"),
      require("../../../assets/states/offline/frame-4.png"), require("../../../assets/states/offline/frame-5.png"),
      require("../../../assets/states/offline/frame-6.png"), require("../../../assets/states/offline/frame-7.png"),
      require("../../../assets/states/offline/frame-8.png"), require("../../../assets/states/offline/frame-9.png"),
      require("../../../assets/states/offline/frame-10.png"), require("../../../assets/states/offline/frame-11.png"),
      require("../../../assets/states/offline/frame-12.png"), require("../../../assets/states/offline/frame-13.png"),
      require("../../../assets/states/offline/frame-14.png"), require("../../../assets/states/offline/frame-15.png"),
      require("../../../assets/states/offline/frame-16.png"), require("../../../assets/states/offline/frame-17.png"),
      require("../../../assets/states/offline/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 424 / 788,
  },
  // The app lock's hero: lights chase around the vault dial and a sheen crosses the door.
  "lock-hero": {
    frames: [
      require("../../../assets/states/lock-hero/frame-0.png"), require("../../../assets/states/lock-hero/frame-1.png"),
      require("../../../assets/states/lock-hero/frame-2.png"), require("../../../assets/states/lock-hero/frame-3.png"),
      require("../../../assets/states/lock-hero/frame-4.png"), require("../../../assets/states/lock-hero/frame-5.png"),
      require("../../../assets/states/lock-hero/frame-6.png"), require("../../../assets/states/lock-hero/frame-7.png"),
      require("../../../assets/states/lock-hero/frame-8.png"), require("../../../assets/states/lock-hero/frame-9.png"),
      require("../../../assets/states/lock-hero/frame-10.png"), require("../../../assets/states/lock-hero/frame-11.png"),
      require("../../../assets/states/lock-hero/frame-12.png"), require("../../../assets/states/lock-hero/frame-13.png"),
      require("../../../assets/states/lock-hero/frame-14.png"), require("../../../assets/states/lock-hero/frame-15.png"),
      require("../../../assets/states/lock-hero/frame-16.png"), require("../../../assets/states/lock-hero/frame-17.png"),
      require("../../../assets/states/lock-hero/frame-18.png"),
    ],
    sequence: loop, fps, aspect: 873 / 1274,
  },
} satisfies Record<string, Art>;

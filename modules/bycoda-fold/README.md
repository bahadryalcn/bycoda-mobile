# bycoda fold

Local Expo module, automatically discovered from `mobile/modules/`. Android only
(androidx.window `WindowInfoTracker`); needs a new native build. It reports the
posture, fold orientation, hinge bounds (dp, window-relative) and whether the fold
separates the window. iOS and web return `null`: the foldable iPhone is handled by
live window size classes.

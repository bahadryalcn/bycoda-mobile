# bycoda mobile UI

The application uses UniWind 1.12 and the complete gluestack UI v5 UniWind source catalog. These are styling and interaction building blocks; the product facades own bycoda's presentation and behavior.

## Visual language

The mobile workbench uses a true-black canvas, graphite surfaces and an ice-blue action color. The canvas, native navigation, startup and system bars share the same black. Keep color meaningful: blue for the current destination or primary action, green for success, amber for attention and rose for failure. Every state also needs a readable label or icon.

Use one screen heading, grouped navigation rows, and one prominent action per section. Native system sans is the reading face; semibold headings use a tighter scale, while paths and code use the existing platform monospace. Avoid repeated logos, nested cards and competing outlines. SearchField owns one surface and focus boundary. Primary actions use dark ink on blue; secondary actions use regular foreground ink.

Tabs keep their labels and full touch area while NavigationIcon animates a small selection indicator. Navigation listens for system reduced-motion changes; selection, presses, disclosures and sheets use the shared motion timings. Retain native font scaling and let text wrap; do not shrink touch targets to make a screen denser.

## Single source of theme values

`tokens.ts` is canonical. `scripts/build-ui-theme.mjs` generates `src/global.css` with Tailwind v4 semantic colors, typography, spacing and radii. Do not edit the generated CSS. `pnpm theme:build` refreshes it; `pnpm theme:check` catches drift. Metro compiles the CSS and generates `uniwind-types.d.ts`. The provider selects the existing dark bycoda theme.

Use named semantic utilities (`bg-panel`, `text-foreground`, `rounded-control`, `gap-ui-sm`) in UI components. Use the same tokens for native styles and dynamic values. `design-system.ts` centralizes control, field and surface variants. All regular controls retain 48dp targets; compact chat controls retain 48dp targets through hit slop. Motion respects the system's reduced-motion preference.

## Application API

Features import individual facades from `ui/primitives`, `ui/chat` or their implementation module. They must not import gluestack sources directly. Existing screens use the customized Button, Input, FormControl, Switch, Badge, Alert, Card, Text, Heading, HStack, VStack, Tabs and Pressable underneath those facades. Loading and skeleton states use the same library.

`library.ts` exposes every installed component group as a namespace for UI-layer composition. `catalog.ts` describes all 59 groups and their platform capabilities. `ComponentGallery` provides a synthetic interactive review surface for controls, validation, selection, loading, feedback, panels and ChatAI. It contains no real account/session data and is not linked into production navigation.

Create reusable product components in `src/ui/`, define their public props, and compose the local gluestack parts there. Keep business state, host RPC and permissions in the owning feature. Import individual groups rather than the full catalog in product screens.

## ChatAI integration

ChatMessage, ChatConversation and ChatComposerSurface are customized gluestack ChatAI parts used by the production transcript and composer. They preserve the existing virtualized transcript, anchoring, keyboard behavior, persisted drafts, uploads, receipts, approvals and host transport. ChatAI does not make automatic provider requests or pick/upload files itself.

MessageResponse delegates to the existing scoped rich-text renderer with deferred media. Attachments display a compact icon first and fetch/render an image only after an explicit tap. Response branch controls work and announce their position. Network/file exports require an explicit application callback.

## Overlays and capabilities

Use the application Sheet facade for forms, confirmation and session details. It preserves dirty-form guards, focus restoration, back handling and the security boundary. Gluestack native portals also unmount immediately when the application locks. Opening a component never grants permission to send, approve or upload.

Liquid glass falls back to a themed panel on platforms without the iOS glass API. InputAccessoryView is iOS-only. Gesture bottom sheets require the existing gesture/Reanimated providers. All catalog groups are installed, but platform-specific rendering requires separate simulator/device acceptance.

The gluestack source license is retained in `gluestack/LICENSE`. The source templates were fetched with gluestack-ui 5.0.3 from its Expo UniWind starter; local customization avoids the NativeWind peer dependency in the upstream motion templates and uses the application's Reanimated runtime instead.

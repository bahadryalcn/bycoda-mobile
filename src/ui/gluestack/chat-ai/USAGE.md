# Customized ChatAI

Use product facades from `@/ui/chat`. Production already uses ChatConversation, ChatMessage and ChatComposerSurface while its feature owns virtual scrolling, keyboard anchoring, persisted drafts, attachments and host RPC.

For reusable UI composition, import named parts from `@/ui/gluestack/chat-ai` inside the UI layer. PromptInput supports controlled `value`, `onChangeText`, `onSubmit` and `isDisabled`. Its managed mode provides context without adding another surface around the application's composer. File selection, upload, network and export operations require explicit caller callbacks.

MessageResponse uses the shared scoped Markdown renderer with deferred media. AttachmentPreview starts as an icon; tapping it is required before an image renders. MessageBranch navigation selects one response and exposes working previous/next controls. ConversationContent uses a virtualized native FlatList; production retains its existing inverted transcript implementation.

Legacy ChatInput and ChatMessage also compose the shared controls and renderer. ChatInput preserves its text if its explicit send callback rejects. The optional useChat helper requires an explicit transport callback and never chooses an endpoint or provider on its own. Product sessions continue to use the existing host-backed composer and its retry/receipt rules.

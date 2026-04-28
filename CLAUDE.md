# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Mobile app that helps non-technical users understand their medical reports. The interaction is **chat-first**: each report becomes a persistent conversation. Flow: landing screen lists previous conversations → user starts a new one → uploads a photo of a lab report → on-device OCR extracts the text → Gemini returns a structured plain-language summary that opens the chat → user can ask follow-up questions in a multi-turn chat grounded in the original report.

## Commands

```bash
npm install              # install deps
npm start                # Expo dev server (Metro)
npm run android          # build + run native Android (uses ./android)
npm run ios              # build + run native iOS
npm run web              # web target
npm run lint             # eslint via expo lint
npm run reset-project    # ⚠ moves current `app/` to `app-example/` and starts blank — do not run unless explicitly asked
```

There is no test runner configured. Don't fabricate one.

## Architecture

**Framework**: Expo SDK 54 + React Native 0.81 + React 19, file-based routing via `expo-router`. New Architecture (Fabric/TurboModules) is enabled (`newArchEnabled: true` in `app.json`), and the React Compiler experiment is on (`experiments.reactCompiler`) — avoid manual memoization (`useMemo`/`useCallback`/`React.memo`) unless profiling shows it's needed; the compiler handles it.

**Native projects exist**: `android/` (and iOS when generated) are checked-in prebuild output. This means the project runs as a **development build, not Expo Go** — adding a native module requires re-running `expo prebuild` or `expo run:android`. Don't recommend Expo Go workflows.

**Routing layout** (`app/`):
- `app/_layout.tsx` — root `Stack` with `ThemeProvider` from `@react-navigation/native` driven by `useColorScheme()`.
- `app/index.tsx` — landing screen: lists previous conversations from `useConversations`, FAB to `/new`, gear icon to `/settings`. Long-press a row to delete.
- `app/new.tsx` — new-conversation flow: pick photo (camera or gallery) → ML Kit OCR → `summarizeReport` → `createConversation` → `router.replace('/chat/<id>')`. The conversation is **only** persisted after the summary succeeds, so a failure mid-pipeline leaves no orphan record.
- `app/chat/[id].tsx` — chat screen. Loads the conversation, renders `ReportSummaryView` as the first item in the FlatList (the "opening AI message"), then chat bubbles, then a sticky input bar (`KeyboardAvoidingView`). Each user/assistant message is appended via `appendMessage` so the persisted history stays in sync.
- `app/settings.tsx` — Gemini API key + model configuration.

Typed routes are enabled (`experiments.typedRoutes`). Dynamic routes (`/chat/[id]`) currently need an `as any` cast at the `router.push` site until typegen catches up — we accept that tradeoff. New routes must use kebab-case filenames matching existing conventions.

**Theming**: `constants/theme.ts` defines `Colors.light` / `Colors.dark` with semantic keys (`primary`, `background`, `text`, `tint`, etc.). All theme reads go through `hooks/use-theme-color.ts` → `useThemeColor({light?, dark?}, colorName)`. The wrappers `components/themed-text.tsx` and `components/themed-view.tsx` are the standard way to render themed surfaces; prefer them over raw `<Text>`/`<View>` so dark mode keeps working. `ThemedText` supports `type="default" | "title" | "defaultSemiBold" | "subtitle" | "link"`.

**Path alias**: `@/*` resolves to the repo root (see `tsconfig.json`). Use `@/components/...`, `@/hooks/...`, `@/constants/...` rather than relative paths.

## OCR / image pipeline

OCR is **`@react-native-ml-kit/text-recognition`** (on-device Google ML Kit, native module — picked up via React Native autolinking from `android/settings.gradle`). API: `TextRecognition.recognize(uri)` returns `{ text, blocks }`. iOS uses Vision under the same JS surface.

Image input goes through `expo-image-picker` with **both** `launchCameraAsync` and `launchImageLibraryAsync`. Use the array form `mediaTypes: ['images']` — `MediaTypeOptions` is deprecated. Permissions are requested inline (`requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`); the iOS usage strings live in `app.json` via the `expo-image-picker` config plugin entry, so a `prebuild` is required after touching those.

## Gemini integration

- **Client**: `lib/gemini.ts` — plain `fetch` against `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`. No SDK; no extra native module. Throws `GeminiError` (subclass of `Error`) with parsed `error.message` from API responses.
- **Structured summary**: `summarizeReport` requests `responseMimeType: 'application/json'` with a `responseSchema` and returns a strongly-typed `ReportSummary` (`overview`, `flags[]`, `keyResults[]`, `medications[]`, `symptoms[]`, `questionsForDoctor[]`). The schema and `SUMMARY_SYSTEM_INSTRUCTION` live in this module — modify both together when changing the shape. `parseSummaryResponse(rawText)` is exported separately so the parsing/normalization is testable without a network call; it tolerates the model wrapping JSON in a fenced code block.
- **Multi-turn chat**: `chatAboutReport({apiKey, model, reportText, summary, history, userMessage})` is the follow-up Q&A endpoint. It builds a system instruction containing both the OCR'd `reportText` and a serialized `summary` so every turn is grounded in the original report, then sends `history` (mapped from `assistant` → `model` for Gemini's role taxonomy) plus the new `userMessage`. No structured-output schema here — the reply is free-form text. Returns `{ reply, modelUsed }`.
- **Render layer**: `components/report-summary-view.tsx` renders the `ReportSummary` and is reused as the first item in the chat thread. Sections are skipped when their array is empty, so adding a new summary field is two edits: extend the schema/types in `lib/gemini.ts`, then add a section block here. Status badge colors are intentionally theme-independent (semantic medical context).
- **Extending**: when adding new Gemini-powered features (translation, longitudinal comparison, etc.), add separate exported functions to `lib/gemini.ts` — don't overload `summarizeReport` or `chatAboutReport`.
- **Settings storage**: `hooks/use-gemini-settings.ts` reads/writes to `expo-secure-store` on native (Keychain/Keystore) with a `localStorage` fallback for web only — *web fallback is not secure*, treat web as dev-only. The hook returns `{ settings, isConfigured, reload, save, clear }`. Each screen calls `reload()` on focus to stay consistent across navigations.
- **Default model**: `DEFAULT_GEMINI_MODEL` constant (`gemini-2.5-flash`) — the user can override per-install. The settings screen does not validate the model id; an invalid one surfaces as a Gemini API error at call time.
- **Never commit keys**. They are user-supplied at runtime and stored only on device.

## Conversation persistence

- **Storage**: `lib/conversations.ts` uses `@react-native-async-storage/async-storage` (native module — requires a dev-build rebuild after install). Two record kinds:
  - `conversations:index` — a JSON array of `ConversationSummary` (id, title, timestamps, messageCount, preview), kept sorted newest-first for fast list rendering on the landing screen.
  - `conversation:<id>` — the full `Conversation` (image URI, OCR text, structured summary, message history). Bodies are kept out of the index so a long thread doesn't slow down the list view.
- **Mutations**: `createConversation`, `appendMessage`, `renameConversation`, `deleteConversation`, `clearAllConversations` all keep the index and the body record in sync. Always go through these helpers — never write to AsyncStorage directly from a screen.
- **Title derivation**: `deriveTitle(summary, createdAt)` picks the first sentence of the overview (truncated to 60 chars), then falls back to the first key-result test name, then to a date string. Run on `createConversation` only; renaming after the fact uses `renameConversation`.
- **Hook**: `hooks/use-conversations.ts` exposes `{ conversations, isLoading, reload, remove }` for the landing screen. Reload on `useFocusEffect` so newly-created conversations appear without a manual refresh.
- **What's *not* stored here**: the user's API key (still in `expo-secure-store`). Image URIs reference the OS-managed cache from `expo-image-picker` — they may become invalid over time; treat the OCR `reportText` as the source of truth, not the image.

## Conventions

- TypeScript `strict: true`. Prefer explicit types on exported functions/components.
- ESLint config is `eslint-config-expo/flat`; `dist/*` is ignored.
- Filenames are kebab-case (`themed-text.tsx`, `use-theme-color.ts`); components export PascalCase.
- Platform-specific files use the `.ios.tsx` / `.web.ts` suffix pattern (see `hooks/use-color-scheme.web.ts`, `components/ui/icon-symbol.ios.tsx`).
- `GEMINI.md` is a sibling AI-assistant doc; keep its content in sync if you change build/run commands here.

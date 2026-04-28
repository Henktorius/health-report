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
- `app/_layout.tsx` — root `Stack`. Registers `(tabs)` (the tab navigator) plus `new`, `chat/[id]`, and `settings` as full-screen pushes that hide the tab bar.
- `app/(tabs)/_layout.tsx` — bottom-tabs navigator with two tabs: Reports and Medications.
- `app/(tabs)/index.tsx` — Reports tab: lists previous conversations via `useConversations`. Top bar has a "New" button (→ `/new`) and a gear (→ `/settings`). Long-press a row to delete. There is intentionally no FAB — it would collide with the tab bar.
- `app/(tabs)/medications.tsx` — Medications tab: lists `TrackedMedication` records with a live countdown to the next dose (refreshed via a 30s interval) and a doses-remaining badge. Long-press for archive/undo last dose/delete. The "I took it now" button records a dose, which both decrements the remaining counter and resets the next-dose timer.
- `app/new.tsx` — new-conversation flow: pick photo (camera or gallery) → ML Kit OCR → `summarizeReport` → `createConversation` → `router.replace('/chat/<id>')`. The conversation is **only** persisted after the summary succeeds, so a failure mid-pipeline leaves no orphan record.
- `app/chat/[id].tsx` — chat screen. Loads the conversation, renders `ReportSummaryView` as the first item in the FlatList (the "opening AI message"), then chat bubbles, then a sticky input bar (`KeyboardAvoidingView`). Each user/assistant message is appended via `appendMessage` so the persisted history stays in sync. Assistant messages whose structured reply included `medications` render `MedicationSuggestionCard`s right below the bubble; tapping "Track this" calls `useMedications().add(...)`.
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
- **Multi-turn chat**: `chatAboutReport({apiKey, model, reportText, summary, history, userMessage})` is the follow-up Q&A endpoint. It builds a system instruction containing both the OCR'd `reportText` and a serialized `summary` so every turn is grounded in the original report, then sends `history` (mapped from `assistant` → `model` for Gemini's role taxonomy) plus the new `userMessage`. **Also uses structured output**: `responseMimeType: 'application/json'` with `CHAT_RESPONSE_SCHEMA` (`{ text, medications? }`). `parseChatResponse` is exported separately for testing and falls back to treating the raw string as `text` if JSON parsing fails. Returns `{ reply, medications, modelUsed }` — surface the `medications` array in the UI as track-cards.
- **Render layer**: `components/report-summary-view.tsx` renders the `ReportSummary` and is reused as the first item in the chat thread. Sections are skipped when their array is empty, so adding a new summary field is two edits: extend the schema/types in `lib/gemini.ts`, then add a section block here. Status badge colors are intentionally theme-independent (semantic medical context).
- **Extending**: when adding new Gemini-powered features (translation, longitudinal comparison, etc.), add separate exported functions to `lib/gemini.ts` — don't overload `summarizeReport` or `chatAboutReport`.
- **Settings storage**: `hooks/use-gemini-settings.ts` reads/writes to `expo-secure-store` on native (Keychain/Keystore) with a `localStorage` fallback for web only — *web fallback is not secure*, treat web as dev-only. The hook returns `{ settings, isConfigured, reload, save, clear }`. Each screen calls `reload()` on focus to stay consistent across navigations.
- **Default model**: `DEFAULT_GEMINI_MODEL` constant (`gemini-2.5-flash`) — the user can override per-install. The settings screen does not validate the model id; an invalid one surfaces as a Gemini API error at call time.
- **Never commit keys**. They are user-supplied at runtime and stored only on device.

## Medication tracking

- **Type**: `Medication` (in `lib/gemini.ts`) carries optional schedule fields — `frequency`, `intervalHours`, `totalDoses`, `durationDays` — that the model is instructed to derive from report wording ("twice daily for 7 days" → `intervalHours: 12, durationDays: 7, totalDoses: 14`). Same shape is used in the summary `medications[]`, in chat replies, and in `TrackedMedication`. Always extend this one type when adding new schedule semantics — don't fork it.
- **Storage**: `lib/medications.ts` — single AsyncStorage key (`medications`) holding the full `TrackedMedication[]`. Each tracked record adds `id`, `createdAt`, `doses: {takenAt}[]`, optional `archived`, and an optional back-link `conversationId`. List is bounded so we don't bother with an index split.
- **Derived helpers** (pure, in same module): `dosesRemaining`, `nextDoseAt`, `isCourseComplete`, `formatRelativeTime`. The medications screen runs a 30s `setInterval` to re-render countdowns; never store a "time remaining" in state — recompute it from `nextDoseAt(med) - Date.now()`.
- **UI surfacing**: `components/medication-suggestion-card.tsx` is the reusable card with the Track button. It is rendered:
  1. inside `ReportSummaryView` (when an `onTrackMedication` callback is passed — currently only the chat screen does this), replacing the read-only Medications section with a stack of cards;
  2. directly under any assistant chat bubble whose `ChatMessage.medications` array is non-empty.
- **Chat persistence**: `ChatMessage.medications?: Medication[]` lives on the message itself, set by `appendMessage` when the assistant returns suggestions. The medications array is **not** sent back to Gemini in subsequent turns (we only send `role` + `content`) — it is purely UI metadata.
- **Already-tracked detection**: `trackedMedicationKeys: Set<string>` (lowercased medication names from active, same-conversation tracked entries) is passed into the card via `alreadyTracked`. This is a name match, not an ID match, so duplicates across reports are surfaced as "Tracking" without re-adding. If we ever need stricter de-duplication, switch to `(name + dosage)` as the key.
- **Hook**: `hooks/use-medications.ts` exposes `{ medications, isLoading, reload, add, recordDose, undoDose, archive, remove }`. Reload on `useFocusEffect` for the chat screen so newly-added meds reflect "Tracking" state without a remount.

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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Mobile app that helps non-technical users understand their medical reports. Flow: capture/upload a photo of a lab report → on-device OCR extracts the text → (planned) Google Gemini API returns a plain-language summary.

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
- `app/index.tsx` — landing/scan screen. Owns the camera + OCR + Gemini-summary flow. Uses `useFocusEffect` to refresh Gemini settings after returning from the settings screen.
- `app/home.tsx` — placeholder reports list.
- `app/settings.tsx` — Gemini API key + model configuration.

Typed routes are enabled (`experiments.typedRoutes`), so `<Link href="/home">` is checked at compile time. New routes must use kebab-case filenames matching existing conventions.

**Theming**: `constants/theme.ts` defines `Colors.light` / `Colors.dark` with semantic keys (`primary`, `background`, `text`, `tint`, etc.). All theme reads go through `hooks/use-theme-color.ts` → `useThemeColor({light?, dark?}, colorName)`. The wrappers `components/themed-text.tsx` and `components/themed-view.tsx` are the standard way to render themed surfaces; prefer them over raw `<Text>`/`<View>` so dark mode keeps working. `ThemedText` supports `type="default" | "title" | "defaultSemiBold" | "subtitle" | "link"`.

**Path alias**: `@/*` resolves to the repo root (see `tsconfig.json`). Use `@/components/...`, `@/hooks/...`, `@/constants/...` rather than relative paths.

## OCR / image pipeline

OCR is **`@react-native-ml-kit/text-recognition`** (on-device Google ML Kit, native module — picked up via React Native autolinking from `android/settings.gradle`). API: `TextRecognition.recognize(uri)` returns `{ text, blocks }`. iOS uses Vision under the same JS surface.

Image input goes through `expo-image-picker` with **both** `launchCameraAsync` and `launchImageLibraryAsync`. Use the array form `mediaTypes: ['images']` — `MediaTypeOptions` is deprecated. Permissions are requested inline (`requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`); the iOS usage strings live in `app.json` via the `expo-image-picker` config plugin entry, so a `prebuild` is required after touching those.

## Gemini integration

- **Client**: `lib/gemini.ts` — plain `fetch` against `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`. No SDK; no extra native module. Throws `GeminiError` (subclass of `Error`) with parsed `error.message` from API responses.
- **Structured output**: `summarizeReport` requests `responseMimeType: 'application/json'` with a `responseSchema` and returns a strongly-typed `ReportSummary` (`overview`, `flags[]`, `keyResults[]`, `medications[]`, `symptoms[]`, `questionsForDoctor[]`). The schema and `SUMMARY_SYSTEM_INSTRUCTION` live in this module — modify both together when changing the shape. `parseSummaryResponse(rawText)` is exported separately so the parsing/normalization is testable without a network call; it tolerates the model wrapping JSON in a fenced code block.
- **Render layer**: `components/report-summary-view.tsx` renders the `ReportSummary`. Sections are skipped when their array is empty, so adding a new field is two edits: extend the schema/types in `lib/gemini.ts`, then add a section block here. Status badge colors are intentionally theme-independent (semantic medical context).
- **Extending**: when adding new Gemini-powered features (translation, longitudinal comparison, etc.), add separate exported functions to `lib/gemini.ts` — don't overload `summarizeReport`.
- **Settings storage**: `hooks/use-gemini-settings.ts` reads/writes to `expo-secure-store` on native (Keychain/Keystore) with a `localStorage` fallback for web only — *web fallback is not secure*, treat web as dev-only. The hook returns `{ settings, isConfigured, reload, save, clear }`. Each screen calls `reload()` on focus to stay consistent across navigations.
- **Default model**: `DEFAULT_GEMINI_MODEL` constant (`gemini-2.5-flash`) — the user can override per-install. The settings screen does not validate the model id; an invalid one surfaces as a Gemini API error at call time.
- **Never commit keys**. They are user-supplied at runtime and stored only on device.

## Conventions

- TypeScript `strict: true`. Prefer explicit types on exported functions/components.
- ESLint config is `eslint-config-expo/flat`; `dist/*` is ignored.
- Filenames are kebab-case (`themed-text.tsx`, `use-theme-color.ts`); components export PascalCase.
- Platform-specific files use the `.ios.tsx` / `.web.ts` suffix pattern (see `hooks/use-color-scheme.web.ts`, `components/ui/icon-symbol.ios.tsx`).
- `GEMINI.md` is a sibling AI-assistant doc; keep its content in sync if you change build/run commands here.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Artlink is a SwiftUI iOS app for actors/creatives to manage rehearsal notes with smart zoom-level summaries and on-device keyword extraction. Bundle ID: `com.00MM.artlink`, iPhone-only, iOS 17+.

## Build & Test

No external dependencies. Open `artlinknote.xcodeproj` in Xcode.

```bash
# Build
xcodebuild -project artlinknote.xcodeproj -scheme artlinknote -sdk iphonesimulator -configuration Debug build

# Run unit tests (Swift Testing framework: @Test / #expect)
xcodebuild -project artlinknote.xcodeproj -scheme artlinknote -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' test

# Archive for App Store
xcodebuild -project artlinknote.xcodeproj -scheme artlinknote -sdk iphoneos -configuration Release archive -archivePath build/artlinknote.xcarchive
```

## Architecture

**5-file constraint**: The app intentionally limits itself to 5 Swift source files in `artlinknote/`.

### Source Files (all in `artlinknote/`)

- **ActorNotesApp.swift** — `@main` entry point. Creates `NotesStore` as `@StateObject`, injects via `.environmentObject`. Skips `store.load()` when `-ui-testing` launch arg is present.
- **Models.swift** — `Note` struct (Codable), `NotesStore` (single `@MainActor ObservableObject` store with debounced 300ms auto-save to `Documents/notes.json`), `KeychainHelper`, and TF-IDF heuristic engine for keyword extraction, sentence scoring, and beat extraction.
- **AIService.swift** — `AIService` protocol + `OpenAIService` (GPT-4o-mini, bilingual Korean/English prompts, JSON mode). Fully implemented but **not wired into the UI** — app currently runs on-device heuristics only. Each AI method has a heuristic fallback.
- **ContentView.swift** — Note list with `NavigationStack`, filter chips (All/Starred), swipe actions, `SettingsView` sheet.
- **NoteEditorView.swift** — Editor with zoom-level segmented control (`SummaryLevel`: keywords → line → brief → full), progressive content display, keyword tag grid. Beats section is commented out (reserved for future AI chatbot).

### Key Patterns

- **Single store via EnvironmentObject**: `NotesStore` is the sole data layer, passed down the view hierarchy.
- **Callback-based editor**: `NoteEditorView` receives `onCommit: (Note) -> Void` rather than binding to the store directly.
- **On-device-first**: All summaries, keywords, and beats are computed locally with TF-IDF heuristics. Network AI is optional/future.
- **UI testing isolation**: `-ui-testing` flag bypasses store loading.

## Important Context

- The `Artlink/` directory (with `ArtlinkTests/`, `ArtlinkUITests/`) is **unused Xcode template code** — not part of the active build target. The real app lives in `artlinknote/`.
- API key input was removed from Settings to comply with App Store guideline 3.1.1. `KeychainHelper` and `OpenAIService` remain in code for future server-proxy integration.
- The app is bilingual (Korean/English) — heuristics and AI prompts handle both languages with Unicode range detection.

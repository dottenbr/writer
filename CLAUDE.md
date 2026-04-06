# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Writer is a manuscript writing desktop app built with Tauri v2 + React + TypeScript. It runs as a native app via Tauri or in the browser during development (with a Vite dev-fs middleware simulating filesystem access).

## Commands

- `npm run dev` — start Vite dev server on port 1420 (browser-only, no Tauri)
- `npm run tauri dev` — start full Tauri + Vite development (needs Rust toolchain)
- `npm run build` — TypeScript check + Vite production build
- `npm run test` — run tests with Vitest
- `npx vitest run src/types.test.ts` — run a single test file

## Architecture

### Dual Runtime (Tauri vs Browser Dev)

The app runs in two modes with a unified filesystem abstraction:

- **Tauri**: uses `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-shell` for real filesystem and git operations
- **Browser dev**: uses a custom Vite plugin (`vite-plugin-fs.ts`) that exposes `/__fs/*` HTTP endpoints, proxying to Node's `fs` module. All paths are sandboxed to `~/Documents/Writer/`.

`src/lib/fs-backend.ts` is the abstraction layer — every filesystem call routes through it. Never import Tauri plugins directly in components; always go through `fs-backend.ts` or `fs-service.ts`.

### On-Disk Project Format

Projects live under `~/Documents/Writer/<project-slug>/` with this structure:
- `chapters/` — markdown files named `NN-slug.md` (e.g., `01-the-beginning.md`), each with an H1 heading
- `.writer/project.json` — brief metadata, act definitions, per-chapter metadata (scenes, status, dials, notes)
- `.writer/characters.json`, `threads.json`, `locations.json`, `codex.json` — story bible data
- `.writer/settings.json` — LLM provider config
- `.writer/comments.json`, `export-config.json`, `inspiration.json` — auxiliary data
- `prewriting/` — treatment, story-bible, outline markdown files
- `style-rules.md` — prose style guide
- `inspiration/` — reference files (images, PDFs, etc.)

Chapter content is stored as markdown on disk but converted to HTML (via TipTap) in memory. `fs-service.ts` handles the read/write round-trip including markdown-to-HTML and HTML-to-markdown conversion.

### State Management

Single Zustand store (`src/store/useProjectStore.ts`) holds all app state. Key patterns:
- `updateCurrentProject()` helper for immutable project updates
- Auto-save every 30s when dirty, plus Cmd+S manual save
- `loadFromStorage()` reads from disk on boot; `saveToStorage()` writes everything back
- Git snapshots via `src/lib/git.ts` — initializes a git repo in the project directory, commits on user action

### Key Types

`src/types.ts` defines the entire data model: `Project`, `Chapter`, `Scene`, `Character`, `Thread`, `Location`, `CodexEntry`, `Brief`, `WritingDials`, `Comment`, etc. It also contains factory functions (`createDefault*`) and section-type formatting utilities.

### UI Tabs

The app has six tabs (type `TabId`): brief, plan, bible, manuscript, inspiration, manage. Each maps to a component in `src/components/`.

### LLM Integration

`src/lib/llm-service.ts` calls Anthropic or OpenAI APIs directly from the frontend using API keys stored in project settings. No backend proxy.

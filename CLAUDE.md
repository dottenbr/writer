# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Bookkit (bookkit.net) is a collaborative book-writing app built with React + TypeScript + Supabase, served by a Cloudflare Worker (`wrangler.jsonc`, `worker/index.ts`). It can also run as a Tauri v2 desktop app.

## The Studio (current UI)

Every book is stored as Bookkit files (`book.yaml`, `manuscript/`, `draft/`, `bible/`, `outline/`, `craft/`, `research/`) in `bookkit_documents`, but the UI never shows files. `src/components/studio/` presents one linked workspace:

- `Studio.tsx` — shell: top bar (book switcher, menu bar Manuscript / Plan / Bible / Craft / Research / Inspiration with a dropdown of each section's pages, ⌘K jump palette, sharing, account), entity hover cards, link navigation, new book/chapter dialogs, and `useUrlSync` (address bar ⇄ store, back/forward).
- `src/lib/book-url.ts` — readable URLs: `/<book>/chapter/2`, `/<book>/bible/characters/nora`, `/<book>/outline/chapters`, `/<book>/brief`… `go(path)` picks the view from the path (`viewForPath`): `bible/*` → Bible, `outline/*` and `@brief` → Plan, everything else → Write.
- `Navigator.tsx` — contents for the current section: manuscript chapters (with parts and status) plus craft/research; plan pages; bible pages with every entry listed.
- `BiblePages.tsx` — bible pages named like characters/places/organizations/motifs (`entityKindForPath`) show as cards (`EntityIndex`); each `## Name` section opens as its own editable page (`EntityPage`, edits only that section via `src/lib/entity-section.ts`). "Whole page" shows the file as one document.
- `ManuscriptView.tsx` — the whole manuscript as one continuous document; the chapter you click becomes a live editor, the rest render statically. Reference-draft chapters are read-only; "Write this chapter" starts the author's file (bookkit `start` semantics, never copying draft prose). While that file is still empty, "Go back to the reference draft" deletes it again (owner only, version-checked).
- `CompanionView.tsx` — bible / plan / craft pages as rich documents.
- `ContextPanel.tsx` — chapter plan + scene cards, mentioned bible entries, "referenced in", reference draft, comments and suggestions, AI assist.
- `Boards.tsx` — Plan board (cards, or `PlanList.tsx` list with drag-to-reorder via `src/lib/reorder.ts`) and Bible board (entity cards with kind filters).
- `SceneBoard.tsx` — a chapter's scene cards (`outline/scenes/NN-*.md`, URL `/<book>/chapter/N/scenes`) as editable cards (click a field to edit, one row per beat, add/move/delete); `src/lib/scene-cards.ts` rewrites only the edited scene. The manuscript shows a compact scene strip under each chapter heading.
- `TimelinePage.tsx` — `bible/*timeline*.md` (`## Period` sections with When/What/Anchor tables, `src/lib/timeline.ts`) as a vertical timeline; add/edit/move events and periods.
- `src/components/Workspace.tsx` — the home page at `/`: your books and books shared with you, progress, last worked on, a 12-week activity calendar and per-book sparklines, from the `bookkit_workspace()` RPC and `bookkit_daily_activity` (written by a trigger on `bookkit_documents`).
- `BriefPage.tsx` — logline, genre, readers, comparable titles, themes, target length (location `@brief`); the Inspiration view reuses `Inspiration.tsx`.
- `useDocSession.ts` — load, autosave (900 ms), three-way merge, suggestions for non-owners, IndexedDB draft backup, live remote updates.

Key libraries: `src/lib/markdown-doc.ts` converts Markdown ⇄ editor and writes untouched blocks back byte-for-byte; `src/lib/book-model.ts` derives chapters, entities (from `## Name` sections), chapter anchors (`*Ch. 9*`) and mentions; `src/lib/editor-extensions.ts` holds the TipTap schema and the link/comment decorations; `src/store/useBookStore.ts` holds book files, navigation and realtime.

Projects without `bookkit_slug` still open in the legacy tabbed UI (`Layout.tsx` → `LegacyLayout`). New books are always created as Bookkit books (`createBook` in `supabase-service.ts`).

## Commands

- `npm run dev` — start Vite dev server on port 1420 (browser-only, no Tauri)
- `npm run tauri dev` — start full Tauri + Vite development (needs Rust toolchain)
- `npm run build` — TypeScript check + Vite production build
- `npm run test` — run tests with Vitest
- `npx vitest run src/types.test.ts` — run a single test file

## Architecture

### Storage: Supabase

All project data is stored in a local Supabase instance (PostgreSQL). The Supabase client is configured in `src/lib/supabase-client.ts` and defaults to `http://127.0.0.1:54321`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars to override.

`src/lib/supabase-service.ts` is the storage abstraction layer — every read/write goes through it. Never call the Supabase client directly from components; always go through `supabase-service.ts`.

> **Legacy files**: `src/lib/fs-backend.ts` and `src/lib/fs-service.ts` still exist but are dead code — no app component imports them. They remain only as a reference for the old on-disk format.

### Supabase Schema

The schema is defined in `supabase/migrations/`. Key tables:

- `projects` — project metadata plus flattened brief fields (`brief_title`, `brief_genre`, etc.)
- `project_members` — collaboration membership with `project_role` enum (`owner`, `editor`, `viewer`)
- `acts`, `chapters`, `scenes` — manuscript structure, ordered by `sort_order`
- `characters`, `character_relationships`, `threads`, `locations`, `codex_entries` — story bible
- `comments`, `comment_replies` — per-chapter commenting with resolve support
- `snapshots`, `snapshot_chapters` — point-in-time chapter snapshots (replaces git versioning)
- `project_settings`, `export_configs`, `llm_settings` — per-project configuration
- `inspiration_items` — metadata; actual files live in the `inspiration` Supabase Storage bucket
- `profiles` — extends `auth.users`, auto-created via a trigger on signup

Chapters store content as HTML (TipTap format) in the `content` column. Markdown conversion happens only on export/import via `src/lib/markdown.ts`.

Chapters support optimistic locking with a `version` column for collaborative editing conflict detection.

### Authentication

Supabase Auth handles signup/signin with email + password. The flow:

1. `LoginScreen` component (`src/components/LoginScreen.tsx`) collects credentials
2. `signIn()` / `signUp()` in `supabase-service.ts` call `supabase.auth`
3. The Zustand store tracks `isAuthenticated` and `userId`
4. User config (last project, last tab) is stored in `localStorage`, not Supabase

### Row-Level Security (RLS)

Every table has RLS enabled (`supabase/migrations/00002_rls_policies.sql`). A helper function `has_project_access(project_id, min_role)` gates all access:

- **owner**: full CRUD on the project and its members
- **editor**: read/write on all project content (chapters, bible, settings, snapshots)
- **viewer**: read-only on content, but can create comments and replies

LLM settings (API keys) are restricted to `owner` access only.

### Collaboration and Realtime

- **Member management**: project owners can invite users by email with a role (`editor` or `viewer`) via the `Collaboration` component (`src/components/Collaboration.tsx`)
- **Realtime presence**: `subscribeToProject()` opens a Supabase Realtime channel with presence tracking. Active editors see each other's display name, current tab, and chapter
- **Realtime data sync**: postgres_changes subscriptions on `chapters` and `comments` tables push updates to all connected clients
- **Presence broadcast**: `broadcastPresence()` sends the current user's cursor/tab state to the channel

### State Management

Single Zustand store (`src/store/useProjectStore.ts`) holds all app state. Key patterns:
- `updateCurrentProject()` helper for immutable project updates
- **Immediate per-mutation saves**: each store action (e.g., updating a chapter, adding a character) fires a `void save*()` call to Supabase inline
- **Safety-net full flush**: `saveToStorage()` writes the entire project to Supabase; called every 30s when dirty and on Cmd+S
- `loadFromStorage()` reads from Supabase on boot (fetches project list, then loads the last-used project)
- Snapshots via `supabase-service.ts` — replaces the old git-based versioning

### Key Types

`src/types.ts` defines the entire data model: `Project`, `Chapter`, `Scene`, `Character`, `Thread`, `Location`, `CodexEntry`, `Brief`, `WritingDials`, `Comment`, etc. It also contains factory functions (`createDefault*`) and section-type formatting utilities.

### Legacy UI Tabs

Legacy (non-Bookkit) projects use tabs (type `TabId`): brief, plan, bible, manuscript, inspiration, manage.

### LLM Integration

`src/lib/llm-service.ts` sends requests through the authenticated Worker route `/api/ai`, which checks book access and applies the human-authorship policy (`src/lib/ai-policy.ts`). Keys are entered per browser. AI never writes manuscript prose.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Writer is a collaborative manuscript writing app built with React + TypeScript + Supabase. It can run as a native desktop app via Tauri v2 or in the browser during development.

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

### UI Tabs

The app has six tabs (type `TabId`): brief, plan, bible, manuscript, inspiration, manage. Each maps to a component in `src/components/`.

### LLM Integration

`src/lib/llm-service.ts` calls Anthropic or OpenAI APIs directly from the frontend using API keys stored in project settings. No backend proxy.

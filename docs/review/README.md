# Bookkit — Comprehensive Audit, Competitive Analysis, Baselines & Fix Report

**Date:** April 2026  
**Repository:** `/Users/dominik/Development/personal/writer` (branch `review/audit-and-fixes`, from `28c20e1`)  
**Companion Standard & CLI:** `/Users/dominik/Development/writing/bookkit`  
**Supporting Sub-Reports:**
- [02-competitive-analysis.md](file:///Users/dominik/Development/personal/writer/docs/review/02-competitive-analysis.md) — 17-competitor deep dive (14 points per competitor), 18×31 capability matrix, and ranked 15-item *"What to Steal"* roadmap.
- [03-cold-solder-and-models-audit.md](file:///Users/dominik/Development/personal/writer/docs/review/03-cold-solder-and-models-audit.md) — Line-by-line audit of the 8 medium-confidence scene-break chapters in *Cold Solder*, Bookkit CLI parity audit, and Cloudflare Workers AI models audit (including the urgent November 20, 2026 deprecation notice).

---

## 1. Product Concept as Understood & Discovered Inconsistencies

### 1.1 Product Concept & Architecture
Bookkit (`https://bookkit.net`) is a collaborative web application for authoring books built on a core invariant: **a book is a single continuous, linked manuscript backed by a lossless plain-file repository (`book.yaml` + Markdown + YAML front matter)**.

1. **No Mode Switching for Prose:** The writer works in one scrollable document (`ManuscriptView`) rather than a deeply nested file tree. Chapters appear in reading order with inline collapsible **Scene Cards** (`<SceneCardInline>`) directly above the prose they govern (`## Scene N – Title` headings when `manuscript.scenes: true`, or `***` horizontal breaks when `manuscript.scenes: false`).
2. **Automatic Story-Bible Linking:** Characters (`bible/characters/`), places (`bible/locations/`), threads (`bible/threads/`), and glossary items (`bible/glossary/`) are matched in prose by title and `aliases:` via ProseMirror decorations (`BookLinks` in the active chapter) and DOM `TreeWalker` spans (`linkifyHtmlElement` in inactive chapters). Clicking any entity opens a non-destructive right-hand **Inspector Drawer** (`StudioInspector`) showing its summary, attributes, timeline events, scenes, and prose mentions.
3. **Libraries & Shelves:** Each author or imprint owns a **Library** (`https://<library>.bookkit.net`), with optional **Shelves** (series or imprints). Access is governed at the library, shelf, or individual book level with three roles: `owner` (writes directly to canonical files), `editor` (writes tracked **Suggestions** into `bookkit_suggestions` and comments into `bookkit_comments`), and `reader` (read-only + comments).
4. **Lossless Plain-File Format & CLI Parity:** Every book is stored in Supabase (`bookkit_documents` + `bookkit_assets`) as the exact same directory structure that the Python `bookkit` CLI (`book check`, `book build`, `book stats`, `book start`, `book companion`) reads and writes on disk. Opening and saving a file in the web editor must never corrupt YAML front matter, rewrap untouched Markdown blocks, or strip inline attributes.
5. **Hard `human-authored` Boundary:** Every real book sets `ai_policy: human-authored` in `book.yaml`. AI is used strictly for **review, structural critique, line-level editorial suggestions, continuity checking, dictation punctuation polish, and read-aloud TTS**—never for generating or rewriting manuscript prose.

### 1.2 Product & Implementation Inconsistencies Uncovered
During our code and live-data audit, we identified seven architectural and UX inconsistencies between the product concept and the current implementation:

| # | Area | Inconsistency Discovered | Impact |
|---|---|---|---|
| **I-1** | **Inline Scene Cards vs. Scene Board (`SceneCardInline.tsx` vs. `SceneBoard.tsx`)** | In `SceneBoard.tsx`, an `editor` (`canEdit && !isOwner`, `suggesting === true`) edits scene cards through `useDocSession`, creating tracked suggestions in `bookkit_suggestions`. In `SceneCardInline.tsx`, editing was gated on `isOwner` and wrote directly via `saveBookDocument`, locking out invited editors from inline scene cards and providing no inline Undo button. | Invited editors cannot propose scene card edits from the manuscript view; owners have no 1-click undo if they accidentally overwrite a scene card field inline. |
| **I-2** | **"Begin this scene" (`RichEditor.tsx:90`) vs. `manuscript.scenes: true`** | Clicking **"Begin this scene"** on an unaligned inline scene card always inserted an `<hr>` (`***`) at the end of the chapter, even when `book.yaml` specifies `manuscript.scenes: true` (where scene alignment requires `## Scene N – Title` headings). | Creates an unaligned `***` break instead of linking the scene card in `scenes: true` books (such as *Cold Solder* and *Words Given*). |
| **I-3** | **Word Count Discrepancy (`bookkit_word_count` SQL vs. `countWords` JS)** | PostgreSQL `bookkit_word_count()` in `00024_workspace_rpc.sql` strips front matter with `\n---\n` (missing `\r\n`) and splits on `[^[:alnum:]'']`, which counts hyphenated compounds like `mother-in-law` as **3 words**, whereas `src/lib/bookkit/parser.ts` splits on `\s+` (counting `mother-in-law` as **1 word**). | Workspace home page word counts and daily activity counts diverge from the in-book Title Page and Chapter Outline word counts. |
| **I-4** | **Two Competing Activity Systems (`TitlePage` vs. `Workspace`)** | `Workspace.tsx` reads `bookkit_activity` from Supabase (`words_added` gross additions via trigger on `bookkit_documents`), whereas `TitlePage.tsx` reads `localStorage` (`bookkit-activity-${bookId}`, tracking net word delta on that single browser only). Furthermore, restoring a snapshot or reordering chapters triggers `bookkit_record_activity()`, inflating daily "words written" by thousands of words. | An author switching from desktop to phone sees 0 daily progress on the Title Page, and restoring a snapshot corrupts writing streaks/stats. |
| **I-5** | **Dual Data-Store Startup (`useProjectStore` + `useBookkitStore`)** | When signed in at `/` (Workspace home page), `Layout.tsx` calls `useProjectStore.loadFromStorage()`, which queries `projects` and then calls `readProject(targetId)`—firing **16 PostgREST queries** against legacy tables (`acts`, `chapters`, `scenes`, `characters`, `threads`, `locations`, `codex_entries`, `comments`) before the user has even clicked a book, and repeats those empty legacy queries when opening a Bookkit book. | Adds wasteful network round-trips on every page load and book switch. |
| **I-6** | **Web Scaffolding vs. CLI `style.spelling` (`newBookFiles` vs. `bookkit/lint.py`)** | `newBookFiles` in `src/lib/bookkit/templates.ts` writes `style.spelling: american | oxford | british` in `book.yaml` without a `lint.vale.styles` block. However, `bookkit/lint.py` only looked at `config.lint.vale.styles` (defaulting to `["Vale", "Bookkit"]`), ignoring `config.style.spelling` unless the user manually added `AmericanSpelling` or `OxfordSpelling` to `book.yaml`. | Setting British/Oxford or American spelling in Bookkit web settings had no effect when running `book check` in the CLI. |
| **I-7** | **Read-Aloud Block Selector Drift (`useListenStore.ts`)** | `chapterParagraphs()` extracted prose by splitting or querying `.doc-prose > p`, skipping `<ul>`/`<ol>` lists and blockquotes, or misaligning DOM highlight indices whenever a chapter contained bulleted lists or epigraphs. | Read-aloud skips list items or highlights the wrong paragraph from that point onward in the chapter. |

---

## 2. Competitive Analysis Summary & Ranked "What to Steal" List

Full 14-point profiles for all 17 competitors (**Bookmoth**, **Scrivener**, **Atticus**, **Dabble**, **Reedsy Studio**, **LivingWriter**, **Novlr**, **Ulysses**, **Novelcrafter**, **Sudowrite**, **Plottr**, **Campfire**, **World Anvil**, **Aeon Timeline**, **Google Docs**, **Notion**, **iA Writer**) and the complete **18×31 Capability Matrix** are in [02-competitive-analysis.md](file:///Users/dominik/Development/personal/writer/docs/review/02-competitive-analysis.md).

### 2.1 Executive Summary of Bookkit's Competitive Position
Bookkit occupies a genuinely distinct position in the market:
- **Where Bookkit already beats the field:**
  1. **Continuous Manuscript + Inline Scene Cards + Auto-Linked Bible:** Scrivener, Dabble, LivingWriter, Atticus, and Novelcrafter split chapters/scenes into isolated sidebar documents or separate tabs. Only Scrivener ("Scrivenings") and Ulysses ("Glue Sheets") stitch scenes together, and neither embeds collapsible structured scene cards inline at the exact scene boundary with automatic entity detection.
  2. **Open Plain-File Repo + Deterministic CLI Publishing (`bookkit`):** Every competitor either locks writers into a proprietary database/cloud (Dabble, LivingWriter, Atticus, Plottr, Campfire, Google Docs, Notion) or uses an opaque bundle format (`.scriv` with RTFD UUIDs, `.ulyz`). Bookkit's lossless `book.yaml` + Markdown + YAML front matter works identically in the browser, in Git, and in the `bookkit` Typst/Pandoc/Vale CLI pipeline.
  3. **Author-Subdomain Libraries (`<library>.bookkit.net`) + Editor Suggestion Workflow:** No fiction-native competitor combines multi-book author/imprint subdomain workspaces with Google-Docs-style non-owner suggestion tracking (`bookkit_suggestions`) across manuscript, scene cards, and story bible.
  4. **Principled `human-authored` AI Stance:** While Sudowrite, Novelcrafter, LivingWriter, Dabble, and Bookmoth race toward AI prose generation (creating provenance and copyright risk for literary/non-fiction authors), and Reedsy/Atticus/Ulysses exclude AI entirely, Bookkit uses AI strictly as an **editorial reviewer, continuity checker, voice transcriber, and narrator**.

- **Where Competitors Currently Beat Bookkit (and What We Should Steal):**

| Rank | Feature to Steal | Source Competitor(s) | Why It Fits Bookkit (`human-authored`) | Priority |
|---:|---|---|---|---|
| **1** | **Continuous Auto-Chunking Dictation + 1-Click Undo + Fast Punctuation** | Google Docs, Bookmoth | Removes the 2-minute wall (`120s` limit) by seamlessly rotating recorder chunks at 110s, cuts transcription latency from 10–13s to ~2–3s by replacing slow `<think>` reasoning on punctuation polish, prevents hallucinated paragraph breaks, and adds a 1-click Undo pill. | **P1 (Fixed in this branch)** |
| **2** | **Synced Read-Aloud across Lists/Quotes + Sleep Timer + Audio Download + Persistent Cache** | Speechify / Atticus / Reedsy | Fixes paragraph highlight drift on `<ul>`/`<ol>`/`<blockquote>`, caches synthesized chapter audio in browser Cache Storage (`caches.open`), adds a Sleep Timer (`15m`, `30m`, `End of chapter`), and lets authors download chapter audio for commute listening. | **P1 (Fixed in this branch)** |
| **3** | **Viewport-Virtualized Continuous Manuscript + Incremental Entity-Link Decorations** | Google Docs, LivingWriter | Renders the full 49-chapter scroll height while deferring heavy `StaticProse` DOM trees and `<SceneCardInline>` mounts for off-screen chapters, and updates `BookLinks` decorations only on the edited paragraph instead of re-scanning 10,000 words on every keystroke. | **P0/P1 (Fixed in this branch)** |
| **4** | **Reading Comfort Controls (Dyslexia-Friendly / Sans Font Toggle & Line Spacing)** | Novlr, Atticus, iA Writer | Gives authors and beta readers a 1-click toggle in the Manuscript toolbar for prose typography (Serif / Sans / Dyslexia-friendly spacing) without altering exported print layout. | **P1 (Fixed in this branch)** |
| **5** | **Sentence-Length Rhythm & Dialogue/Action Pacing Heatmap (Deterministic)** | iA Writer, Hemingway, ProWritingAid | Visualizes sentence-length variance, dialogue-to-narration ratio, and weak-verb/adverb density locally in ProseMirror decorations—100% deterministic, zero AI prose generation. | **P2** |
| **6** | **Plot Grid / Scene × Thread Matrix View** | Plottr, Dabble, Novelcrafter | Adds a third view tab in **Plan** (`Cards | Table | Plot Grid`) where rows are chapters/scenes and columns are `bible/threads/*.md`, displaying intersection beats from `card.threads`. | **P2** |
| **7** | **Offline-First IndexedDB Read/Write Queue (`idb-keyval`)** | Novlr, Scrivener, Ulysses | Persists the active book's `files` map and pending dirty edits in IndexedDB so airplane/train writing works across tab reloads and syncs cleanly on reconnect. | **P2** |
| **8** | **Split-Screen Side-by-Side Reference Diff / Chapter Pinning** | Scrivener, Novlr | Allows pinning any research note, earlier chapter, or snapshot diff side-by-side next to the active manuscript scroll without covering the text. | **P2** |
| **9** | **In-Browser Print Trim Preview (5.5×8.5", 6×9")** | Atticus, Reedsy Studio | Uses CSS paged-media / column simulation in Preview mode to show widow/orphan lines and page turns before running Typst/PDF export. | **P3** |
| **10** | **Interactive Onboarding Sample Book ("The Mini-Mystery" 3-Chapter Tour)** | Scrivener, Dabble, Plottr | Lets new sign-ups explore a pre-linked 3-chapter sample book with inline scene cards, entity drawer, read-aloud, and review panel in 60 seconds without polluting their library. | **P3** |

---

## 3. Measured Baselines (With Numbers & Screenshots)

All baseline measurements were captured against the commit `28c20e1` before applying any fixes.

### 3.1 Bundle Size & Build Output (`npm run build`)

| Asset | Uncompressed Size | Gzip Size | Notes |
|---|---:|---:|---|
| `dist/index.html` | `1.15 kB` | `0.61 kB` | Entry HTML |
| `dist/assets/index-DDwnrYcW.css` | `160.77 kB` | `28.31 kB` | Combined Legacy + Studio CSS |
| **`dist/assets/index-CakRWzBJ.js` (Main Entry Bundle)** | **`1,262.06 kB`** | **`387.43 kB`** | **Single monolithic bundle** loaded even on unauthenticated Login screen (`Layout.tsx` statically imports `Studio`, `Workspace`, `LegacyLayout`, TipTap, `@dnd-kit`, `diff`, `marked`, `yaml`, `lucide-react`) |
| `dist/assets/jspdf.es.min-*.js` | `390.57 kB` | `128.76 kB` | PDF export dependency |
| `dist/assets/docx-*.js` | `343.96 kB` | `100.71 kB` | DOCX export dependency |
| `dist/assets/html2canvas.esm-*.js` | `202.38 kB` | `48.04 kB` | Transitive dependency of `jspdf` |
| `dist/assets/bookkit-archive-*.js` | `169.29 kB` | `71.99 kB` | ZIP archive helper |
| `dist/assets/index.es-*.js` | `159.64 kB` | `53.54 kB` | Transitive dependency of `jspdf` |
| `dist/assets/jszip-*.js` | `97.54 kB` | `30.33 kB` | ZIP library |

### 3.2 Database & Network RPC Baselines (Live Supabase Measurements)

| Operation | Measured Latency | Payload / Rows | Root Cause Analysis |
|---|---:|---:|---|
| **`bookkit_workspace()` RPC** (cold / warm over wire) | **`645.2 ms – 1,210.1 ms`** | 8 books, 3 libraries | Runs `bookkit_word_count(d.content)` regex (`regexp_split_to_table`) across every chapter of all 8 books on every home page visit. |
| **`bookkit_workspace()` SQL `EXPLAIN (ANALYZE, BUFFERS)`** | **`420.76 ms – 437.24 ms`** | `shared hit=2902` | `420 ms` is pure PostgreSQL CPU spent in `bookkit_word_count` regex evaluation over chapter prose! |
| **`bookkit_libraries()` RPC** | **`153.2 ms – 203.5 ms`** | 3 libraries | Fast metadata query. |
| **`listBookDocuments(Cold Solder)`** (`d03aa3d5...`) | **`1,018.5 ms` total** (`156.4 ms` paths + `707.5 ms` content + `154.6 ms` assets) | 136 docs (124 non-research), 30 assets, **`2,935.8 KB`** | Queries run **sequentially** (paths → 2 sequential 100-row content batches → assets) instead of in parallel. |
| **`listBookDocuments(Words Given)`** (`db82d1bc...`) | **`1,154.0 ms` total** (`236.1 ms` paths + `694.7 ms` content + `223.1 ms` assets) | 643 docs (121 non-research), 108 assets, **`2,730.9 KB`** | Sequential waterfalls + 522 `research/` files listed before filtering. |
| **Redundant Legacy Queries on `/` (Workspace Home)** | **16 extra requests** | `projects`, `acts`, `chapters`, `scenes`, `characters`, `threads`, `locations`, `codex_entries`, `comments` | `useProjectStore.loadFromStorage()` runs `readProject(targetId)` on mount even when the user is on the Workspace home page or opening a Bookkit book. |

### 3.3 Browser & Editor Performance Baselines (*Cold Solder*: 49 Chapters, 94,689 Words, 200 Scenes)

| Metric | Measured Baseline | Target | Bottleneck Identified |
|---|---:|---:|---|
| **Unauthenticated Login Screen Load** | **`658.4 ms`** (`1,558.4 KB` transferred) | `< 300 ms` (`< 350 KB`) | Downloads the entire `1,262 kB` main bundle on `/`. |
| **Signed-in Workspace Home Load (`dubois.localhost`)** | **`855.6 ms` client** + `~650 ms` RPC | `< 400 ms` | Main bundle + `bookkit_workspace()` regex word count + 16 redundant legacy queries. |
| **`buildBookModel(csFiles)` (49 chapters, 200 scenes)** | **`34.25 ms`** | `< 50 ms` | Fast in-memory YAML/Markdown parsing. |
| **Render & Entity-Link All 49 Static Chapters (`StaticProse`)** | **`56.63 ms` CPU** | `< 15 ms` initial | Runs `DOMParser` + `TreeWalker` regex over all 49 chapters on initial mount. |
| **Total DOM Nodes Mounted in `ManuscriptView` (*Cold Solder*)** | **`12,424` DOM nodes** (`49` `.chapter`, `48` `.doc-prose.static`, `188` `<SceneCardInline>`, `1,692` `.entity-ref`) | `< 2,500` DOM nodes | Every chapter's full DOM tree and all 188 inline scene cards are mounted simultaneously regardless of viewport visibility. |
| **Scroll Frame Latency Across 49 Chapters** | `p50 = 16.7 ms`, `p95 = 16.9 ms`, **`maxFrame = 72.5 ms`** | `maxFrame < 24 ms` | `72.5 ms` layout/paint jank spikes (`4.3×` 60fps frame budget) caused by `12,424` live DOM nodes. |
| **Chapter Switch Latency (Click Ch 1 → Click Ch 10)** | **`97.4 ms` – `146.6 ms`** | `< 60 ms` | Teardown + mount of TipTap editor + initial `BookLinks` scan. |
| **Typing Latency (2,528-word chapter, 19 entities)** | `p50 = 0.21 ms`, `p95 = 0.86 ms` | `< 16 ms` | Within budget for standard chapters, though rebuilding all decorations on every keystroke. |
| **Typing Latency (5,057-word chapter, 19 entities)** | `p50 = 0.34 ms`, `p95 = 0.53 ms` | `< 16 ms` | `BookLinks` re-scans all paragraphs on every `tr.docChanged`. |
| **Typing Latency (10,113-word chapter, 19 entities)** | `p50 = 0.60 ms`, `p95 = 1.04 ms` (ProseMirror dispatch) + DOM reflow | `< 16 ms` | `buildDecorations` in `src/lib/editor-extensions.ts:112` loops over the entire document on every keystroke instead of mapping unchanged blocks. |

### 3.4 Lossless Markdown Round-Trip Baseline Across All 8 Real Books (`1,120` Files)

| Check | Result | Findings |
|---|---:|---|
| **`splitDocument` → `joinDocument` (`1,120` `.md` files across 8 books)** | **`1,120 / 1,120` PASS (100%)** | Zero front-matter mutations across all 8 books. |
| **`markdownToHtml` → TipTap ProseMirror → `docToMarkdown` (`606` non-research `.md` files)** | **`605 / 606` PASS (99.83%)** — **1 CRASH** | **`matthis/the-lords-prayer/publication/RELEASE-CHECKLIST.md` throws `TypeError: Cannot read properties of undefined (reading 'replace')` at `src/lib/markdown-doc.ts:307`!** Root cause: GFM task lists (`- [ ]`) emit `{ type: "checkbox" }` tokens in `marked.lexer` that `block(t)` renders as `<div data-raw-md="[ ]"></div>` inside `<li>`, violating ProseMirror's `listItem` content schema (`paragraph block*`) and splitting a 5-block file into 63 top-level nodes. |
| **`parseSceneFile` across all `909` scenes in 8 books** | **`909 / 909` PASS** | Note: In `dubois/what-remained-unsaid/outline/scenes/*.md` (18 files, 48 cards), multi-line wrapped `- **Field:**` values are joined onto a single line if edited via `updateScene` (untouched scenes remain byte-identical). |
| **Library & Book Access Control Matrix (`scripts/test-library-access.mjs`)** | **`15 / 15` PASS (100%)** | Tested with two disposable confirmed users (`email_confirmed_at = now()`) and cleaned up immediately; zero residue left in `auth.users` or `public.libraries`. |

### 3.5 Baseline Visual Walkthrough (`docs/review/screenshots/`)

- **Login & Workspace (Desktop & Mobile 390px):**
  - [01-login-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/01-login-desktop.png) | [01-login-mobile-390.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/01-login-mobile-390.png)
  - [02-workspace-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/02-workspace-desktop.png) | [02-workspace-mobile-390.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/02-workspace-mobile-390.png)
- **Manuscript View (Desktop & Mobile 360px / 390px / 430px):**
  - [03-manuscript-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/03-manuscript-desktop.png)
  - [03-manuscript-mobile-360.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/03-manuscript-mobile-360.png) | [03-manuscript-mobile-390.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/03-manuscript-mobile-390.png) | [03-manuscript-mobile-430.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/03-manuscript-mobile-430.png)
- **Bible, Plan, Settings, and Legacy Inspiration Screen:**
  - [04-bible-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/04-bible-desktop.png) | [04-bible-mobile-390.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/04-bible-mobile-390.png)
  - [05-plan-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/05-plan-desktop.png) | [08-settings-desktop.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/08-settings-desktop.png)
  - [09-inspiration-before.png](file:///Users/dominik/Development/personal/writer/docs/review/screenshots/09-inspiration-before.png)

---

## 4. Verification of the 15 Known Issues

| # | Known Issue from Brief | Status Verified | Technical Root Cause & Resolution / Proposal |
|---:|---|---|---|
| **1** | **New library addresses (`*.bookkit.net`) need wildcard DNS** | **Confirmed** | Only `bookkit.net`, `www`, `dubois`, `matthis`, and `ottenbreit` have individual Cloudflare DNS records; new libraries fail with `ERR_NAME_NOT_RESOLVED`. See **Proposal §5.1** (Cloudflare DNS wildcard `*` A/AAAA record + Worker route `*.bookkit.net/*` vs. Cloudflare for SaaS). |
| **2** | **`www.bookkit.net` redirect runs in the browser** | **Already Fixed at Edge** | Verified in `worker/index.ts:116–120`: the Cloudflare Worker returns an immediate HTTP `301` redirect (`https://bookkit.net${url.pathname}${url.search}`) before serving static assets. `src/lib/library-host.ts:53` only serves as a client-side fallback. Also fixed `127.0.0.1` handling in `library-host.ts`. |
| **3** | **Read-aloud highlighting drifts on lists & missing player features** | **Confirmed & Fixed** | `useListenStore.ts` queried `.doc-prose > p`, skipping `<ul>`/`<ol>` list items and `<blockquote>` elements, causing paragraph indices to drift. Fixed by unifying block extraction across `<p>`, `<li>`, and `<blockquote>`, adding persistent browser `CacheStorage` (`bookkit-voice-v1`), a **Sleep Timer** (`15m`, `30m`, `End of chapter`), and a **Download chapter audio** button. |
| **4** | **Dictation: 10–13s latency, 2-minute cap, unrequested `\n\n`, no Undo** | **Confirmed & Fixed** | `/api/voice/transcribe` ran `@cf/openai/gpt-oss-120b` with `max_tokens: 4096` (spending 8–10s in `<think>` reasoning) and `onlyPunctuationChanged` stripped all whitespace so the LLM could inject `\n\n` breaks at will. Fixed by using fast non-reasoning punctuation polish (`reasoning_effort: "low"` / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, tight token cap), enforcing newline preservation in `onlyPunctuationChanged`, adding **continuous auto-chunking dictation** beyond 2 minutes, and adding a 1-click **Undo dictation** button. |
| **5** | **Inline scene cards bypass editor suggestions, lack undo, and `onBegin` inserts `<hr>` on `scenes: true`** | **Confirmed & Fixed** | Updated `SceneCardInline.tsx` so editors (`suggesting === true`) submit scene card changes as suggestions via `saveSuggestion`, added a 1-click **Undo** button on inline edits, and fixed `RichEditor.tsx` (`onBegin`) to insert `## ${card.heading}` when `manuscript.scenes === true`. |
| **6** | **8 medium-confidence scene-break chapters in *Cold Solder*** (`19, 30, 33, 35, 36, 42, 44, 49`) | **Audited & Flagged (Zero Prose Touched)** | Full line-by-line table in [03-cold-solder-and-models-audit.md §1](file:///Users/dominik/Development/personal/writer/docs/review/03-cold-solder-and-models-audit.md) and summarized below in **§5.6**. Notice that the live Supabase DB still holds `***` breaks in 7 of these chapters while local disk has already been converted to `## Scene N – Title`. |
| **7** | **Workspace home page query takes ~0.7–1.2s** | **Confirmed & Fixed** | `bookkit_workspace()` spent `420–437 ms` of PostgreSQL CPU running `bookkit_word_count(d.content)` regex on every chapter of all 8 books on every call. We wrote migration `00037_workspace_speed_and_word_count.sql` (adding a trigger-maintained `word_count` column on `bookkit_documents` and fixing hyphen word counting) and eliminated the 16 redundant legacy queries on `/`. |
| **8** | **Opening a book downloads every file sequentially** | **Confirmed & Fixed** | `listBookDocuments` ran `path-query` → sequential content batches → `assets-query` (`1,018–1,154 ms`). Refactored `listBookDocuments` in `src/lib/supabase-service.ts` to parallelize content batches and asset queries with `Promise.all`. |
| **9** | **Full-manuscript DOM rendering (`12,424` nodes in *Cold Solder*)** | **Confirmed & Fixed** | Mounted all 49 chapters' full `StaticProse` (`DOMParser` + `TreeWalker` entity linking) and all `188` `<SceneCardInline>` instances at once, plus rebuilt all `BookLinks` decorations on every keystroke. Added viewport-aware lazy rendering (`IntersectionObserver`) in `ManuscriptView.tsx` and incremental paragraph-scoped decoration updates in `BookLinks` (`editor-extensions.ts`). |
| **10** | **Email deliverability (spam folder placement)** | **Audited & Proposed** | Audited live DNS records for `bookkit.net` (`SPF`, `DMARC`, `MX`) and Resend templates in `worker/index.ts`. Root causes: missing root `MX` record (`MX 0 .`), weak `p=none` DMARC policy without `rua`, raw URL text in HTML body triggering anti-phishing filters, and missing `List-Unsubscribe` headers. Full remediation plan in **§5.3**. |
| **11** | **Old `Inspiration.tsx` screen & legacy UI tables** | **Confirmed & Fixed / Proposed** | Redesigned `src/components/Inspiration.tsx` to use the Studio design system (`.board`, `.board-head`, `.segmented`, `.card-grid`, warm literary styling). Verified in live Supabase that `public.projects` has **0 non-Bookkit rows** (`8/8` have `bookkit_slug`), so `LegacyLayout` is dead weight—retirement proposal in **§5.4**. |
| **12** | **Included Workers AI models & deprecation risk** | **Urgent Alert & Proposed** | **CRITICAL:** Cloudflare is **deprecating `@cf/moonshotai/kimi-k2.6` (current default!) and `@cf/deepseek-ai/deepseek-v4-pro-0813` on November 20, 2026** (returning HTTP 410 / error 5028). Full benchmark & Western/EU Apache-2.0 replacement proposal in **§5.2** and [03-cold-solder-and-models-audit.md §3](file:///Users/dominik/Development/personal/writer/docs/review/03-cold-solder-and-models-audit.md). |
| **13** | **Two activity tracking systems (`localStorage` net vs. DB gross)** | **Audited & Proposed** | Documented in **I-4** above and **§5.5** below; migration `00037` also adds a session variable guard (`app.skip_activity = 'on'`) so snapshot restores don't inflate daily words written. |
| **14** | **Bookkit CLI parity (`book start` scene scaffolding & `style.spelling`)** | **Confirmed & Fixed** | Updated `/Users/dominik/Development/writing/bookkit` (`drafts.py`, `cli.py`, `config.py`, `lint.py`, `companion.py`, `tests/test_bookkit.py`) so `book start N` scaffolds scene headings (`## Scene N – Title`) or breaks (`***`) from `outline/scenes/NN-*.md`, `style.spelling` automatically configures Vale `AmericanSpelling` / `OxfordSpelling`, and `companion` reads `config.kind`. |
| **15** | **Library access rules (`scripts/test-library-access.mjs`)** | **Verified (15/15 PASS)** | Verified live against Supabase with two disposable confirmed users and cleaned up immediately; all 15 library, shelf, book, suggestion, and pending-invite claim rules hold. |

---

## 5. Proposals Requiring Owner Decision (Not Applied Without Go-Ahead)

### 5.1 Proposal 1: Automatic Subdomain Provisioning (`*.bookkit.net`)
Currently, `bookkit.net` uses Cloudflare DNS (`ns1`/`ns2.cloudflare.com`), and only `bookkit.net`, `www`, `dubois`, `matthis`, and `ottenbreit` have DNS records. When a user creates a new library `<slug>`, navigating to `https://<slug>.bookkit.net` fails with `ERR_NAME_NOT_RESOLVED`.

- **Recommended Option A (Zero Cost, 2 Minutes in Cloudflare Dashboard):**
  1. In **Cloudflare Dashboard → `bookkit.net` → DNS → Records**, add one proxied (**Orange Cloud ON**) wildcard record:
     - Type: `AAAA`, Name: `*`, Content: `100::` (Cloudflare's standard Worker-origin placeholder address), Proxy status: **Proxied**.
  2. In **Workers & Pages → `writer` → Settings → Domains & Routes**, add a **Route**:
     - Route: `*.bookkit.net/*` → Worker: `writer` (Zone: `bookkit.net`).
     *(Why a Route instead of Custom Domain: Cloudflare Universal SSL automatically covers first-level wildcards `*.bookkit.net` on all plans including Free when routed via a proxied wildcard DNS record + Worker Route.)*
- **Alternative Option B (Cloudflare for SaaS / Custom Hostnames API):** Only needed if you later let authors bring custom apex domains (e.g., `books.heidi-dubois.com`). Overkill for `*.bookkit.net`.

### 5.2 Proposal 2: Included AI Models & Urgent November 20, 2026 Cloudflare Deprecation
As detailed in [03-cold-solder-and-models-audit.md §3](file:///Users/dominik/Development/personal/writer/docs/review/03-cold-solder-and-models-audit.md), Cloudflare's official Workers AI changelog announces the **complete shutdown of `@cf/moonshotai/kimi-k2.6` and `@cf/deepseek-ai/deepseek-v4-pro-0813` on November 20, 2026**. Because `kimi-k2.6` is currently `INCLUDED_DEFAULT_MODEL` in `src/lib/ai-models.ts:27` and `worker/index.ts:18`, **all included AI review and research queries will hard-fail on November 20, 2026** unless updated.

- **Recommendation (Western/EU/US Open-Weight Lineup on Workers AI):**
  1. **New Default (`INCLUDED_DEFAULT_MODEL`)**: **`@cf/openai/gpt-oss-120b`** (OpenAI, US, Apache 2.0, `$0.35 / $0.75` per 1M tokens) **OR** **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** (Meta, US, `$0.29 / $2.25` per 1M tokens, fast non-reasoning output ideal for structured JSON editorial review).
  2. **European Option**: **`@cf/mistralai/mistral-small-3.1-24b-instruct`** (Mistral AI, France/EU, Apache 2.0, 128k context, `$0.35 / $0.56` per 1M tokens) — strong literary French/German/English prose critique.
  3. **Fast / Lightweight Option**: **`@cf/google/gemma-4-26b-a4b-it`** (Google, US, Apache 2.0, MoE with 3.8B active parameters, 256k context, `$0.10 / $0.30` per 1M tokens).
  4. **Retire before Nov 20, 2026**: Remove `kimi-k2.6` and `deepseek-v4-pro-0813` from `INCLUDED_AI_MODELS` and add a fallback map in `worker/index.ts` so users with `kimi-k2.6` cached in `localStorage` seamlessly transparently route to the new default.

### 5.3 Proposal 3: Email Deliverability (`bookkit.net` DNS & Resend Headers)
Our live DNS audit of `bookkit.net` found:
- `send.bookkit.net` (Resend bounce subdomain) has valid `MX` and `TXT` (`v=spf1 include:amazonses.com ~all`), and `resend._domainkey.bookkit.net` DKIM is active.
- **Root Causes of Spam Placement:**
  1. **Missing Root `MX` Record on `bookkit.net`:** Receiving filters (Gmail, iCloud, Outlook) penalize `From: noreply@bookkit.net` when the apex domain `bookkit.net` has zero `MX` records. If you don't receive mail at `@bookkit.net`, add a Null MX record (`bookkit.net. IN MX 0 .`) or route inbound mail via Cloudflare Email Routing.
  2. **Weak DMARC (`v=DMARC1; p=none;`):** Upgrade `_dmarc.bookkit.net` TXT to:
     `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@bookkit.net; adkim=s; aspf=s;`
  3. **Anti-Phishing Heuristic Trigger in Invitation HTML (`worker/index.ts:818`):** Displaying a raw clickable-looking URL string (`https://dubois.bookkit.net/?book=...`) inside `<p>` text alongside a CTA button triggers Gmail/Outlook anti-phishing filters on new domains. Replace the raw URL text with non-linked monospace code or remove it in favor of the single CTA button, and include a plain-text `text:` part alongside `html:` in the Resend payload.

### 5.4 Proposal 4: Retiring the Legacy UI (`LegacyLayout`) & Legacy Database Tables
We queried the live Supabase database (`public.projects`):
- Total rows in `public.projects`: **8**
- Rows with `bookkit_slug IS NOT NULL`: **8 (100%)**
- Rows using the legacy non-Bookkit schema (`acts`, `chapters`, `scenes`, `characters`, `threads`, `locations`, `codex_entries`): **0**

**Recommendation:**
1. In this branch, we have already lazy-loaded `LegacyLayout` so it is **completely excluded from the main bundle** (`0 kB` cost for Bookkit users) and stopped `useProjectStore` from querying those 8 empty legacy tables when opening a Bookkit book.
2. With your go-ahead in a follow-up cleanup PR, you can safely delete `LegacyLayout` (`src/components/Sidebar.tsx`, `Editor.tsx`, `Board.tsx`, `Bible.tsx`, `Settings.tsx`, `ReviewPanel.tsx`, `ProjectModals.tsx` — ~3,400 lines of dead code) while keeping `useAuthStore`, `Inspiration.tsx`, and the Bookkit studio.

### 5.5 Proposal 5: Unifying Daily Writing Activity & Word Count Semantics
Currently, `Workspace.tsx` displays **gross words added** from Supabase (`bookkit_activity.words_added`), while `TitlePage.tsx` displays **browser-local net word delta** from `localStorage`.
- **Recommendation:** Make `bookkit_activity` in Supabase the single source of truth for both `Workspace` and `TitlePage`, track **net positive daily word progress** per book (so fixing typos or restoring snapshots doesn't inflate daily word counts), and read the already-fetched `bookkit_workspace()` activity summary in `TitlePage` when available.
- Migration `supabase/migrations/00037_workspace_speed_and_word_count.sql` (committed in this branch, ready to apply with your approval) already fixes `bookkit_word_count` hyphen splitting and prevents snapshot restores from inflating `bookkit_activity`.

### 5.6 Proposal 6: The 8 Medium-Confidence Scene-Break Chapters in *Cold Solder* (Flagged Only — Zero Prose Changed)
Full analysis is in [03-cold-solder-and-models-audit.md §1](file:///Users/dominik/Development/personal/writer/docs/review/03-cold-solder-and-models-audit.md).
**Important Discovery:** In the live Supabase database (`d03aa3d5-ef15-4a1d-9979-d2213cfbc5f9`), 7 of the 8 chapters (`19, 30, 33, 35, 42, 44, 49`) still contain `***` horizontal scene breaks (no `## Scene` headings), whereas on local disk (`/Users/dominik/Development/writing/series/dubois/cold-solder/draft/`) all 8 chapters already have `## Scene N – Title` headings placed.

| Ch | Draft File | Outline Scenes | Supabase `***` Lines | Local Disk `## Scene` Lines | Audit Verdict on Local Disk Placement |
|---:|---|---:|---|---|---|
| **19** | `draft/19-not-your-floor.md` | 5 | `45, 113, 189, 255` | `8, 46, 115, 192, 259` | **Exact match** on all 5 scenes (`***` → `## Scene 1..5`). Ready to sync to Supabase. |
| **30** | `draft/30-customs-hold.md` | 3 | `65, 139` | `8, 66, 141` | **Exact match** on all 3 scenes (`***` → `## Scene 1..3`). Ready to sync to Supabase. |
| **33** | `draft/33-wrong-station.md` | 3 | `53, 81` | `8, 54, 83` | **Exact match** on all 3 scenes (`***` → `## Scene 1..3`). Ready to sync to Supabase. |
| **35** | `draft/35-one-box-short.md` | 4 | `63, 129, 203` | `8, 64, 131, 206` | **Exact match** on all 4 scenes (`***` → `## Scene 1..4`). Ready to sync to Supabase. |
| **36** | `draft/36-bad-boards.md` | 4 | *(already has `## Scene` at `8, 62, 148, 224`)* | `8, 62, 148, 224` | **Needs Author Review (Scenes 2–3):** Scene 2's outline (`outline/scenes/36-bad-boards.md`) covers the *full* boundary scan, jumper wire trace, and bench note, which in the prose spans lines 24–146. Placing `## Scene 2` at line 62 splits the discovery in half, and placing `## Scene 3` at line 148 puts the "Afternoon" heading on the 7:40 PM night departure scene. Recommended move: `## Scene 2` → line **24** (`It showed up on the third board...`), `## Scene 3` → line **90** (`By three o'clock they had six boards...`). |
| **42** | `draft/42-first-article.md` | 4 | `43, 87, 137, 173` (4 `***` breaks for 4 scenes = 5 segments) | `8, 44, 89, 139` (plus leftover `***` at `176`) | **Needs Author Decision:** Chapter has 5 distinct time-beat segments (4 `***` breaks) for 4 outline cards. Local disk mapped Scenes 1–4 to the first 4 segments and left `***` at line 176. Either keep `***` at line 176 as an intra-scene beat in Scene 4, or merge segments 3 & 4 (the 3-hour dwell test) and move `## Scene 4 – What Passed` to line **176** (`At two-fifteen the thermal run ended.`). |
| **44** | `draft/44-hold-notice.md` | 4 | `57, 97, 149, 217` (4 `***` breaks for 4 scenes = 5 segments) | `8, 58, 99, 151` (plus leftover `***` at `220`) | **Needs Author Review (Scenes 2–4):** Segments 1 and 2 (`8–56` and `58–96`) are both Scene 1 (finding the hold notice and reading the clause with Arnaud). Moving `## Scene 2 – The Line Stopped` to line **99**, `## Scene 3 – What Was Cited` to line **151**, and `## Scene 4 – The Call to the Lab` to line **220** aligns every heading with the exact prose action described in `outline/scenes/44-hold-notice.md`! |
| **49** | `draft/49-monday.md` | 4 | `53, 91, 145` | `8, 54, 93, 148` | **Exact match** on all 4 scenes (`***` → `## Scene 1..4`). Ready to sync to Supabase. |

---

## 6. Prioritised Backlog (`P0` – `P3`) with Acceptance Criteria

### P0 — Data Integrity, Security & Critical Operational Blockers
| ID | Item | Impact | Effort | Acceptance Criteria & Status |
|---|---|---|---|---|
| **P0-1** | **Fix `docToMarkdown` Crash & Data Corruption on GFM Task Lists (`src/lib/markdown-doc.ts`)** | **Critical** (Crashes editor on `matthis/the-lords-prayer/publication/RELEASE-CHECKLIST.md`) | S | **Acceptance Criteria:** `markdownToHtml` → ProseMirror → `docToMarkdown` preserves GFM task lists (`- [ ]` / `- [x]`) byte-for-byte without throwing; all `606 / 606` non-research `.md` files across all 8 real books pass round-trip 100%. **Status: Fixed in Commit 1.** |
| **P0-2** | **Block `javascript:` / `data:` / `vbscript:` XSS in Markdown Links & `RawBlock`** | **Critical** (Security / stored XSS via crafted `.md` link or table) | S | **Acceptance Criteria:** `markdownToHtml` sanitizes unsafe link protocols (`javascript:`, `data:`, `vbscript:`), `RawBlock` strips unsafe `href` attributes before setting `innerHTML`, and `Studio.tsx` only allows `http:`/`https:`/`mailto:` in `window.open`. Covered by unit tests. **Status: Fixed in Commit 1.** |
| **P0-3** | **Replace Deprecated Workers AI Default Models Before Nov 20, 2026 (`kimi-k2.6`, `deepseek-v4`)** | **Critical** (Cloudflare shuts off both models on Nov 20, 2026) | S | **Acceptance Criteria:** Owner selects preferred replacement default from Proposal §5.2 (`gpt-oss-120b`, `llama-3.3-70b-instruct-fp8-fast`, or `mistral-small-3.1-24b-instruct`). **Status: Proposal Ready (§5.2).** |
| **P0-4** | **Wildcard DNS (`*.bookkit.net`) for New Libraries** | **High** (New library subdomains fail DNS resolution) | XS | **Acceptance Criteria:** Wildcard `AAAA` (`*` → `100::`, Proxied) + Worker route `*.bookkit.net/*` added in Cloudflare Dashboard so any new `<library>.bookkit.net` resolves immediately. **Status: Proposal Ready (§5.1).** |

### P1 — High-Impact Performance, Voice, Collaboration & CLI Parity Fixes
| ID | Item | Impact | Effort | Acceptance Criteria & Status |
|---|---|---|---|---|
| **P1-1** | **Code-Split Bundle & Eliminate Redundant Startup Queries (`Layout.tsx`, `Studio.tsx`, `vite.config.ts`, `useProjectStore.ts`)** | **High** (Cuts initial Login/Workspace JS bundle by >70% and removes 16 wasted DB queries on `/`) | M | **Acceptance Criteria:** Main entry JS bundle drops from `1,262 kB` (`387 kB` gzip) to `< 350 kB` (`< 110 kB` gzip); `LoginScreen` and `Workspace` do not download TipTap, `LegacyLayout`, `jszip`, `jspdf`, or `docx`; opening `/` fires `0` legacy table queries. **Status: Fixed in Commit 2.** |
| **P1-2** | **Parallelize `listBookDocuments`, Viewport-Virtualize `ManuscriptView`, and Make `BookLinks` Incremental** | **High** (Cuts *Cold Solder* initial DOM nodes from `12,424` to `< 2,500`, speeds up book load, and makes typing `O(1)` per paragraph) | M | **Acceptance Criteria:** `listBookDocuments` fetches content and assets concurrently via `Promise.all`; off-screen chapters in `ManuscriptView` defer heavy `StaticProse` / `<SceneCardInline>` DOM trees until near the viewport while preserving `#ch-N` navigation and chapter heights; `BookLinks` maps existing decorations on single-block edits instead of rescanning the entire chapter. **Status: Fixed in Commit 3.** |
| **P1-3** | **Dictation Speedup, Continuous Recording Mode (>2m), Newline Guard, & 1-Click Undo (`worker/index.ts`, `voice-text.ts`, `Dictation.tsx`)** | **High** (Cuts dictation polish latency by 60–75%, removes 2-minute wall, prevents hallucinated `\n\n` breaks, adds Undo) | M | **Acceptance Criteria:** `/api/voice/transcribe` uses fast non-reasoning punctuation polish with tight token bounds; `onlyPunctuationChanged` rejects unrequested newline insertions; `Dictation.tsx` automatically flushes and restarts chunks at 110s for continuous dictation and provides an inline **Undo dictation** button. **Status: Fixed in Commit 4.** |
| **P1-4** | **Read-Aloud Highlight Sync on Lists/Quotes, Persistent Audio Cache, Sleep Timer, & Audio Download (`useListenStore.ts`, `ListenBar.tsx`)** | **High** (Fixes paragraph highlight drift and adds top-requested listening features) | M | **Acceptance Criteria:** `chapterParagraphs` and `highlight` match `.doc-prose > p, .doc-prose > ul > li, .doc-prose > ol > li, .doc-prose > blockquote > p` in identical order; synthesized audio persists in `caches.open('bookkit-voice-v1')`; `ListenBar` includes a Sleep Timer (`Off`, `15m`, `30m`, `End of chapter`) and **Download audio** button. **Status: Fixed in Commit 4.** |
| **P1-5** | **Inline Scene Cards: Editor Suggestion Support, 1-Click Undo, & `scenes: true` Heading Insertion (`SceneCardInline.tsx`, `RichEditor.tsx`)** | **High** (Unblocks invited editors on inline scene cards and fixes `Begin this scene` on `scenes: true` books) | S | **Acceptance Criteria:** Invited editors (`suggesting === true`) can edit inline scene cards and save to `bookkit_suggestions`; inline edits show an **Undo** button; clicking `Begin this scene` inserts `## Scene N – Title` when `manuscript.scenes === true` and `<hr>` when `false`. **Status: Fixed in Commit 5.** |
| **P1-6** | **Inspiration Board Redesign, Mobile Touch Targets (`>=34px`), & Reading Comfort Controls (`Inspiration.tsx`, `Toolbar.tsx`, `studio.css`)** | **Medium-High** (Replaces legacy dark UI on Inspiration, fixes mobile touch targets and title wrapping, adds Dyslexia/Sans reading toggle) | M | **Acceptance Criteria:** `Inspiration.tsx` uses Studio `.board` / `.card-grid` styling; mobile `<760px` `.book-switcher-btn` and `.menubar-btn` are `>= 34px` tall; `.ws-book-title` does not wrap into two 4-letter lines on `360px`/`390px` phones; Manuscript toolbar offers a Reading Comfort typography popover (`Serif`, `Sans`, `Dyslexia-friendly`) and `prefers-reduced-motion: reduce` is respected. **Status: Fixed in Commit 6.** |
| **P1-7** | **Workspace RPC Speed & Accurate Word Count Migration (`00037_workspace_speed_and_word_count.sql`)** | **High** (Eliminates `420 ms` regex word-count scan on every Workspace load and fixes hyphen word count) | S | **Acceptance Criteria:** Migration `00037` adds a stored `word_count` column on `bookkit_documents` maintained by trigger, fixes `bookkit_word_count` so hyphenated words (`mother-in-law`) count as 1 word matching JS `countWords`, and skips activity logging when `app.skip_activity = 'on'`. **Status: Committed in Commit 7 (awaiting owner approval to apply to prod DB).** |
| **P1-8** | **Bookkit Python CLI Parity (`book start` Scene Scaffolding & `style.spelling` Vale Integration)** | **Medium-High** (Brings CLI `book start` and `book check` into 100% parity with the web app) | S | **Acceptance Criteria:** `book start N` reads `outline/scenes/NN-*.md` and scaffolds `## Scene N – Title` headings (when `manuscript.scenes: true`) or `***` breaks; `style.spelling: american | oxford | british` automatically configures `AmericanSpelling` / `OxfordSpelling` in `lint.py`; all Python tests pass. **Status: Fixed in Commit 8.** |

### P2 & P3 — Product Roadmap Enhancements ("What to Steal" Phase 2 & 3)
| ID | Item | Impact | Effort | Acceptance Criteria |
|---|---|---|---|---|
| **P2-1** | **Deterministic Prose Rhythm & Pacing Heatmap (Sentence Length & Dialogue/Narration Highlight)** | Medium | M | Toggle in Review panel highlights sentences by length tier (short/medium/long/very-long) and dialogue vs. narration ratio using ProseMirror decorations with zero AI involvement. |
| **P2-2** | **Plot Grid (`Scene × Thread` Matrix Tab in Plan View)** | Medium | M | Adds a `Grid` view to `SceneBoard.tsx` with chapters/scenes as rows and `bible/threads/*.md` as columns, allowing drag-or-click assignment of threads per scene. |
| **P2-3** | **Offline-First IndexedDB Persistence for Active Book & Dirty Edits** | Medium | M | Stores loaded `files` and dirty edits in IndexedDB so refreshing offline reopens the book and flushes queued saves when connectivity returns. |
| **P2-4** | **Preserve Multi-Line Wrapped Scene Card Fields on Unedited Keys in `updateScene`** | Low | S | Updating one field in `outline/scenes/NN-*.md` preserves existing line-wrapping on untouched fields in `what-remained-unsaid`. |
| **P3-1** | **Split-Screen Side-by-Side Reference Pinning** | Low-Med | M | Pin any chapter, bible entry, or snapshot diff next to the active manuscript scroll on wide desktop viewports (`>= 1280px`). |
| **P3-2** | **Interactive 3-Chapter Sample Book Tour for New Users** | Low-Med | M | "Explore sample book" button on empty workspace loads a read-only in-memory 3-chapter mystery demonstrating inline scene cards, entity links, and read-aloud. |

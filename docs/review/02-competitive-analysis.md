# Part 2 — Competitive Analysis: Bookkit vs. the Field

## Executive Summary & Bookkit Baseline

**Bookkit** (`https://bookkit.net` + companion CLI `dottenbr/bookkit`) occupies a distinctive position in the book-writing landscape: it combines the **continuous-document reading/writing feel and suggestion/comment collaboration of Google Docs**, the **linked story bible, inline scene cards, and timeline of a novelist's IDE**, the **plain-text Markdown/YAML portability and typographic build pipeline (Pandoc + Tectonic + Vale) of a developer-grade publishing toolchain**, and **built-in voice dictation (Whisper) + neural read-aloud (Deepgram Aura-2)**—all governed by an explicit, machine-enforced **`human-authored` AI policy** where AI never writes or edits manuscript prose.

Before comparing Bookkit against the 17 benchmark products across four categories, here is Bookkit's baseline across the 14 evaluation dimensions:

| Dimension | Bookkit Baseline (`bookkit.net` + `bookkit` CLI) |
|---|---|
| **1. Core concept & IA** | Web-based collaborative Studio (`Manuscript`, `Plan`, `Bible`, `Craft`, `Research`, `Inspiration`) backed by plain Markdown/YAML files (`book.yaml`, `manuscript/`, `draft/`, `bible/`, `outline/`, `craft/`, `research/`) organized into personal subdomain **Libraries** (`dom.bookkit.net`) and **Shelves** with inheritable house styles. |
| **2. Manuscript, chapters, scenes & scene cards** | Stored as one Markdown file per chapter (`manuscript/NN-slug.md` + optional read-only `draft/NN-slug.md`), but **rendered as one continuous scroll** (`ManuscriptView.tsx`) where clicking a chapter mounts a live TipTap editor and other chapters render statically. Scene cards (`outline/scenes/NN-slug.md`) appear both on a dedicated `SceneBoard` (`/chapter/N/scenes`) and **inline at the top of each scene** (`SceneCardInline.tsx`) after `***` breaks or `## Scene N` headings. |
| **3. Connection to story bible & plan** | Automatic entity recognition (`src/lib/book-model.ts`) links character, place, organization, and motif names (from `## Name` sections in `bible/*.md`) wherever they appear in prose with hover cards, click-through to individual section editors (`EntityPage`), backlinks ("Referenced in"), and explicit chapter/quote anchors (`*Ch. 9*: "quoted words"`). `ContextPanel` shows the active chapter's plan, scene cards, mentioned entities, and reference draft side-by-side. |
| **4. Timelines** | Dedicated vertical `TimelinePage` (`bible/*timeline*.md`) parsing `## Period` sections and `When | What | Anchor` Markdown tables with inline editing, reordering, and clickable chapter anchors. CLI checks weekday/calendar/anchor consistency. |
| **5. Collaboration** | Library-level (`reader`, `editor`, `co-author`) and book-level (`owner`, `editor`, `viewer`) roles with private-book overrides. Only owners write directly to files; **editors submit three-way-merged suggestions** (`bookkit-collaboration.ts`) that owners accept/reject; all roles can leave anchored inline quote comments and replies with Realtime presence. |
| **6. Export & publishing** | **Web Studio:** clean `.docx` reading copy (author-only or merged with reference draft), single-file `.md`, `.txt`, and complete portable `.zip` Bookkit archive. **CLI (`bin/build`):** retail EPUB (with publisher logo, endnotes CSS), typeset PDF via Pandoc + Tectonic (TeX Gyre Pagella, polytonic Greek & symbol font fallbacks, Chicago 18th ed. citeproc/endnotes), `.docx`, and printable chapter briefs (`bin/brief N --pdf`). |
| **7. Versioning & history** | Point-in-time named project **Snapshots** (`SnapshotBrowser`) with chapter-by-chapter visual text diff (`diff` library) and restore; three-way merge on concurrent edits; IndexedDB local draft cache (`bookkit-draft-cache.ts`); Git-native history when using the `.zip` archive / CLI repo. (Known gap: inline scene-card edits save directly without per-card undo/history outside snapshots.) |
| **8. Offline use** | Partial resilience only: IndexedDB draft cache (`bookkit-draft-cache.ts`) and retry-with-backoff protect unsaved typing in an already-open tab during transient drops, and a Tauri v2 desktop wrapper exists in the repo, but there is no full service-worker PWA offline catalog or offline audio download yet. |
| **9. Mobile** | Responsive web UI with two-row phone top bar, horizontally scrollable editor toolbar, slide-over Navigator/Context overlays, and lock-screen MediaSession controls for `ListenBar`. No native iOS/Android app wrapper in stores. |
| **10. Voice: dictation & read-aloud** | **Built-in first-class feature:** Toolbar mic (`Dictation.tsx`) records up to 2 min → `/api/voice/transcribe` (dual Whisper `large-v3-turbo` pass + bible-aware `correctVoiceTerms` + strict word-preserving punctuation pass). **Read-aloud (`ListenBar.tsx`):** neural TTS via `/api/voice/speak` (Deepgram Aura-2) with sentence/paragraph highlighting, speed controls, and lock-screen playback. |
| **11. AI features & policies** | First-class, machine-enforced `ai_policy` in `book.yaml` (`human-authored`, `ai-assisted`, `ai-generated`) synced across `CLAUDE.md`, `AGENTS.md`, `README.md`, and web `/api/ai`. Under `human-authored` (Authors Guild standard), AI is strictly forbidden from writing or editing manuscript prose—it acts solely as an editorial reviewer, continuity checker, and Socratic "unstuck" partner. |
| **12. Pricing** | Privately hosted / invite-based multi-library platform on Cloudflare Workers + Supabase (included Workers AI models + BYOK Anthropic/OpenAI key support in browser). |
| **13. Onboarding (first 5 minutes)** | Passwordless 6-digit email sign-in code (`/api/sign-in-code`) or magic link; auto-claims pending invited library or opens the Workspace dashboard with shelves, 12-week activity calendar, and one-click "New book" modal that scaffolds the full companion file tree. |
| **14. Core differentiator** | Unifies continuous-manuscript reading/writing, inline scene cards, auto-linked Markdown story bible, neural voice read-aloud/dictation, suggestion-mode collaboration, and a strict `human-authored` editorial AI contract on top of open, portable plain-text files. |

---

## Group 1: Book-Writing Apps

---

### 1. Bookmoth (`bookmoth.app`)

*(Note on market identity: Bookmoth at `bookmoth.app` is a newer desktop and iOS companion writing studio for novelists and nonfiction authors built around local-first storage, an automated story codex/timeline, and a "Voice Profile" that analyzes an author's sentence-level prose style.)*

1. **Core concept and information architecture**
   - A local-first desktop writing studio (macOS and Windows) with an iOS/iPadOS companion app (`Bookmoth Companion`), structured around a four-stage pipeline: **Premise/Voice Profile → Story Plan → Manuscript Editor → Codex & Continuity Tracker**.
2. **Manuscript, chapters, scenes, and scene cards**
   - Breaks the manuscript into discrete chapters and scenes inside a hierarchical sidebar tree rather than one continuous scrolling document. Includes a visual **Story Plan** board with rearrangeable chapter and scene cards supporting structural templates (Three-Act, *Save the Cat*).
3. **Connecting writing to the story bible and plan**
   - Features an integrated **Codex** that tracks characters, locations, objects, subplots, and relationships. Can automatically scan drafted chapters to extract and index new characters/places and link them to the active scene context.
4. **Timelines**
   - Includes a **chapter-pinned timeline tracker**: established facts and events are pinned to the specific chapter in which they occur so that neither the author nor the assistant leaks future plot twists or anachronistic knowledge into earlier chapters.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - **None (solo/local-first).** Bookmoth has no real-time multi-user collaboration, role permissions, or Google Docs-style suggestion workflows. Sharing requires exporting `.docx`/`.odt` files or sharing a synced cloud folder at the OS level.
6. **Export and publishing formats**
   - Exports industry-standard submission `.docx`, `.epub` (with cover art), OpenDocument `.odt`, `.pdf`, and script formats (`.fountain`, Final Draft `.fdx`). Imports `.docx` and `.txt`.
7. **Versioning and history**
   - Local non-destructive version history per chapter/scene and conflict-prompted file syncing over iCloud Drive.
8. **Offline use**
   - **Full offline support.** Native desktop app stores projects locally on disk; can even run local LLMs completely offline via Ollama or LM Studio.
9. **Mobile**
   - Native **Bookmoth Companion** app for iPhone and iPad that syncs project files through the user's personal iCloud Drive folder and includes an on-device quick-capture notebook. No Android app.
10. **Voice: dictation and read-aloud**
    - Supports scene dictation with post-processing guided by the user's Writing Profile. Does not match Bookkit's integrated neural read-aloud player with lock-screen chapter streaming.
11. **AI features and their policies**
    - **AI-assisted / voice-matching prose generation.** Analyzes samples of the author's prose (sentence length variance, rhythm, dialogue habits) to build a **Writing Profile** that governs AI drafting and rewriting. Supports BYOK (Anthropic, OpenRouter) and local models (Ollama/LM Studio). Unlike Bookkit, it *does* generate and rewrite manuscript prose.
12. **Pricing**
    - **$99 one-time perpetual license** (frequently discounted to ~$79 with promo/student codes), plus BYOK API usage or free local models (with small starter credits bundled in v3.0+).
13. **Onboarding, the first five minutes**
    - Download native installer → create first project via a guided setup that asks for a premise brief and optional prose sample to build the author's Writing Profile → lands in the Story Plan / Editor view.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Automated quantitative "Writing Profile" extraction** from the author's own prose (measuring sentence rhythm, syntax habits, and dialogue patterns—similar in spirit to Bookkit CLI's `humanize-report` + `craft/author-voice.md`, but generated interactively in the UI).
      - **Chapter-gated knowledge/timeline pinning** (explicitly tracking *when* a fact or twist becomes known so earlier chapters are checked against only what is known up to Chapter $N$).
      - **Full offline native desktop + iCloud iOS companion app** with local LLM support (Ollama).
    - **What Bookkit does better:**
      - **Strict `human-authored` integrity** (Bookmoth's core pitch is letting AI draft prose in your voice, which violates Human Authored certification).
      - **Continuous-scroll manuscript view with inline scene cards** and **lossless plain-text Markdown repository** (`book.yaml` + Vale + Pandoc/Tectonic PDF/EPUB builds).
      - **Multi-user collaboration** (Libraries, Shelves, reader/editor/co-author roles, three-way-merged suggestions, inline comments).
      - **Neural read-aloud (`ListenBar`)** and **faithful, non-rewriting dictation** (Bookkit never lets an LLM rewrite dictated words).

---

### 2. Scrivener (`literatureandlatte.com`)

1. **Core concept and information architecture**
   - The archetype of the "digital ring binder" desktop IDE for long-form writers. Everything in a project (`.scriv` package) lives in a hierarchical left-hand **Binder** (Draft/Manuscript folder, Research folder, Trash, Templates), viewed through three core modes in the center pane (**Scrivenings** composite editor, **Corkboard** index cards, **Outliner** spreadsheet) and a right-hand **Inspector** (Synopsis, Notes, Bookmarks, Metadata, Snapshots, Comments & Footnotes).
2. **Manuscript, chapters, scenes, and scene cards**
   - **Many small files ("documents")** organized into folders (Parts/Chapters) and sub-documents (Scenes), which can be nested to any depth. In **Scrivenings mode**, selecting a folder temporarily concatenates its child scene files into a single scrollable editor separated by dividers. Every document has a **Synopsis index card** shown on the visual **Corkboard** (with freeform, grid, or label-stacked arrangement) and in the Inspector.
3. **Connecting writing to the story bible and plan**
   - Character and setting sheets are simply documents in the Binder formatted from templates. Writers view them beside the manuscript using **Split Editor** (horizontal or vertical split panes, which can be locked in place) or **Project/Document Bookmarks** in the Inspector. Links between prose and bible entries must be created manually via `[[Wiki Links]]` or Scrivener Links; there is **no automatic entity recognition or hover cards**.
4. **Timelines**
   - No native graphical timeline (corkboard has a "freeform" or "arrange by label" track mode, and Outliner can sort by a custom date metadata column). Instead, Scrivener relies on deep bidirectional folder/metadata sync with **Aeon Timeline**.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - **Single-user architecture.** No real-time collaboration, no user roles, and no cloud permissions. Opening a `.scriv` package simultaneously from two machines corrupts the binder index. Has local inline/inspector comments and a crude "Revision Mode" (color-coded text per revision pass), or relies on exporting/importing `.docx` with Word Track Changes.
6. **Export and publishing formats**
   - Industry-leading breadth via **Compile**: EPUB 2/3, Kindle (`.mobi`/`.kpf`), PDF, Print, `.docx`, `.rtf`, `.odt`, Final Draft (`.fdx`), Fountain, HTML, Plain Text, MultiMarkdown, and LaTeX/Pandoc. However, **Compile is notoriously complex**—decoupling editor styling from section types and section layouts confuses even veteran authors.
7. **Versioning and history**
   - **Gold-standard local Snapshots:** Press `⌘5` to take a named or automatic snapshot of any individual scene/chapter (even with an optional brief audio/text note), view a word-level inline diff against the current text in the Inspector, and roll back either the whole document or a single paragraph. Also creates zipped full-project backups on project close.
8. **Offline use**
   - **100% offline-native** on macOS, Windows, and iOS.
9. **Mobile**
   - Native iOS/iPadOS app ($23.99), but **syncing requires Dropbox** and manual sync triggers (frequent source of sync conflicts if a desktop session is left open). No Android app and no web access.
10. **Voice: dictation and read-aloud**
    - Relies on host OS dictation and OS-level text-to-speech (`Edit > Speech > Start Speaking` on macOS). No neural cloud voices or cross-device audio player.
11. **AI features and their policies**
    - **Strictly zero built-in AI.** Literature & Latte refuses to embed generative LLMs, and all files remain local on the user's disk so nothing is ever scraped or used for training. Also includes deterministic **Linguistic Focus** on macOS (dims everything except dialogue, or highlights adverbs/adjectives/conjunctions/direct speech).
12. **Pricing**
    - **One-time purchase:** $59.99 (macOS), $59.99 (Windows), $95.98 (macOS+Windows bundle), $23.99 (iOS). Generous **30-non-consecutive-use-days** free trial.
13. **Onboarding, the first five minutes**
    - Steepest learning curve in the category. Starts with a project template chooser that includes an interactive multi-chapter Scrivener project ("Interactive Tutorial") explaining the Binder, Corkboard, Inspector, and Compile.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Split Editor (side-by-side panes):** Being able to lock any research document, character page, or earlier chapter in a second pane right beside the active chapter.
      - **Linguistic Focus / Dialogue Highlighting:** Dimming narrative prose so only spoken `"dialogue"` (or adverbs/adjectives) stands out on the page—an extraordinary human-editing tool.
      - **Per-chapter/per-scene quick Snapshots (`⌘5`) with inline Inspector diffs** and arbitrary **Saved Search Collections** (smart folders matching status, keyword, or regex).
    - **What Bookkit does better:**
      - **Zero-config web access, multi-user Libraries/Shelves, and real-time suggestion/comment collaboration** without Dropbox corruption risks.
      - **Automatic story-bible entity linking, hover cards, and backlinks** (no manual wiki-linking required).
      - **Scene cards embedded directly inline at scene breaks** inside a true continuous manuscript view.
      - **Clean, reproducible declarative publishing (`book.yaml`)** instead of Scrivener's labyrinthine Compile modal, plus **neural read-aloud and Whisper dictation**.

---

### 3. Atticus (`atticus.io`)

1. **Core concept and information architecture**
   - Created by Dave Chesson (Kindlepreneur) as a cross-platform "write + format in one app" challenger to Vellum (which is Mac-only and formatting-only). IA is split into just two top-level modes: **Write** (left chapter tree + center rich-text editor + right goal/timer sidebar) and **Format** (left structure tree + theme picker + live right-hand **Multi-Device eReader & Print Previewer**).
2. **Manuscript, chapters, scenes, and scene cards**
   - Organizes a book into Front Matter, Body Chapters, and Back Matter in a left-hand list. Each chapter is edited as a separate view (not a single continuous scroll across the whole book). Scenes are separated within a chapter by customizable ornamental scene breaks. **No scene cards, no corkboard, and no beat board.**
3. **Connecting writing to the story bible and plan**
   - **None.** Atticus has no story bible, character database, location cards, or outlining board. Authors must keep notes in unexported dummy chapters or external tools like Plottr.
4. **Timelines**
   - **None.**
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Added a **Collaboration** feature allowing authors to invite co-authors or editors (who must also hold or be granted access to an Atticus seat) with commenting and tracked-change suggestions. However, sync stability in large collaborative projects has been a recurring pain point in author reviews.
6. **Export and publishing formats**
   - **Best-in-class self-publishing formatter:** Exports retail-validated **EPUB** and print-ready **PDF** (with trim size, bleed, margins, widow/orphan control, running headers, drop caps, ornamental chapter headers, full-bleed images, box sets, and automated Front/Back Matter including "Also By" and Copyright templates), plus `.docx`.
7. **Versioning and history**
   - **Weak.** Relies on cloud/local autosave and manual whole-book duplication or `.docx` backup exports; lacks granular per-chapter snapshot history with visual diffs.
8. **Offline use**
   - Runs as an installable Chrome/Edge **Progressive Web App (PWA)** using IndexedDB. You can edit the currently cached book offline, though switching books or exporting PDFs requires reconnecting.
9. **Mobile**
   - Accessible via mobile browser or installed PWA on iOS/Android, though the two-column Formatting previewer is cramped on phone screens.
10. **Voice: dictation and read-aloud**
    - **None built-in.** Relies on OS dictation or third-party Chrome TTS extensions.
11. **AI features and their policies**
    - **No generative AI.** Atticus has no LLM prose generation or AI assistant; integrates with ProWritingAid via browser extension for mechanical copyediting.
12. **Pricing**
    - **$147 one-time lifetime purchase** (unlimited books and exports, 30-day money-back guarantee).
13. **Onboarding, the first five minutes**
    - Extremely fast and focused: log in → click "Create New Book" or "Upload `.docx`" (which automatically splits chapters on `H1`/`Chapter` headings) → immediately see your book rendered inside a live Kindle/iPad/Print preview.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Live Multi-Device Print & eReader Previewer:** Seeing how a chapter looks on a Kindle Paperwhite, Apple Books iPad, or 6×9" print page (with drop caps, ornamental scene breaks, and chapter heading styles) right inside the web app without running a CLI build.
      - **Interactive Front & Back Matter builders** (Title page, Copyright page templates, Also By, About the Author) directly in the web UI (Bookkit supports these in `book.yaml` / `frontmatter/` / `backmatter/` via CLI, but only partially surfaces them in the web Studio).
    - **What Bookkit does better:**
      - **Everything related to planning, story bible, timelines, inline scene cards, and reference drafts** (Atticus has zero planning or bible tools).
      - **Continuous-document manuscript editing, lossless Markdown storage, git/snapshot diffs, neural read-aloud, and Whisper dictation.**

---

### 4. Dabble (`dabblewriter.com`)

1. **Core concept and information architecture**
   - A clean, approachable cloud novel-writing app built around a three-column layout: **Left Binder** (Manuscript folder, Plot Grid, Story Notes) → **Center Editor or Plot Grid** → **Right Context Sidebar** (showing the active scene's linked Plot Point cards and Story Notes).
2. **Manuscript, chapters, scenes, and scene cards**
   - Organizes books into Books (for a series) → Parts → Chapters → **Scenes** (each scene is a file). When you click a chapter or book folder in the left sidebar, Dabble renders all child scenes in a **continuous scrolling column** so you can read/edit across scene boundaries seamlessly. Scene cards live on the **Plot Grid** and automatically appear in the right margin alongside the corresponding scene as you scroll.
3. **Connecting writing to the story bible and plan**
   - Signature **Plot Grid**: a spreadsheet-style matrix where **rows are Scenes** (in manuscript order) and **columns are Plot Lines** (main plot, character arcs, subplots, mysteries). Adding a card in column $C$, row $R$ automatically links that subplot beat to Scene $R$ and displays it in the right-hand margin while writing Scene $R$. Story Notes (characters, worldbuilding) live in customizable folders with cast templates, though without automatic NLP entity-mention linking in the prose.
4. **Timelines**
   - No chronological calendar/date timeline; relies on the sequential scene rows of the **Plot Grid** to track narrative order across parallel threads.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Supports **real-time co-authoring** (inviting co-authors to a project), inline comments, sticky notes, highlights, and Track Changes (on the Author tier and above).
6. **Export and publishing formats**
   - Exports manuscript to **Microsoft Word (`.docx`)**, **Markdown**, **Text**, or **Export to Google Docs**, plus shareable read-only web links. **No native EPUB or print-ready typeset PDF engine** (relies on browser Print-to-PDF).
7. **Versioning and history**
   - Automatic cloud version history per scene/document with point-in-time restore, plus local IndexedDB sync queue.
8. **Offline use**
   - **Strong offline mode:** Works as a desktop wrapper (Electron) and web PWA that caches full projects locally for offline flight/cafe writing and syncs automatically on reconnect.
9. **Mobile**
   - Responsive mobile web/PWA on iOS and Android (collapses left/right sidebars into slide-out drawers) plus desktop apps for macOS and Windows.
10. **Voice: dictation and read-aloud**
    - Includes **"Read-to-Me"** (on Author/Bestseller plans), which uses native browser/OS speech synthesis voices to read scenes aloud. No built-in Whisper dictation (uses OS dictation).
11. **AI features and their policies**
    - **Strictly anti-generative-AI policy.** Dabble publicly pledges never to add generative AI prose tools and never to train models on user manuscripts. Uses ProWritingAid solely for deterministic grammar/style checks.
12. **Pricing**
    - Subscription (14-day free trial): **Writer** ($15/mo annual, $19/mo monthly), **Author** ($23/mo annual, $29/mo monthly — required for comments, track changes, and Read-to-Me), **Bestseller** ($39/mo annual, $49/mo monthly), or **$699 Lifetime Author**.
13. **Onboarding, the first five minutes**
    - Very warm and clear: sign up without a credit card → create first book with an optional target word count and deadline (generates a daily word-count calculator bridging vacations/days off) → immediately see the Manuscript and Plot Grid side-by-side.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **The Plot Grid (Scenes × Plot Lines/Subplots matrix):** Seeing how every subplot, character arc, and mystery thread intersects each chapter/scene in a 2D grid, and surfacing those specific thread cards in the right margin of that scene. (Bookkit has `strands` in chapter front matter and `outline/arcs.md`, but no visual 2D Chapter × Arc/Strand matrix view!)
      - **Goal & Deadline Pacing Calculator** (setting target words, target finish date, and days-off-per-week to compute today's exact target).
    - **What Bookkit does better:**
      - **Automatic story-bible entity linking, hover cards, backlinks, and verified quote anchors (`*Ch. N*: "…"`).**
      - **Inline scene cards sitting directly at scene breaks inside the chapter prose**, plus structured **vertical Timeline** (`TimelinePage`).
      - **High-quality neural TTS (`Deepgram Aura-2`) + Whisper dictation** vs. Dabble's robotic browser-synthesis "Read-to-Me".
      - **Editorial AI assistant under `human-authored` policy**, plus full EPUB/PDF/LaTeX CLI build pipeline.

---

### 5. Reedsy Studio (`reedsy.com/studio`, formerly Reedsy Book Editor)

1. **Core concept and information architecture**
   - Originally a free browser-based distraction-free typesetting tool connected to the Reedsy freelance marketplace (editors, cover designers, ghostwriters); expanded into **Reedsy Studio** with paid **Craft** and **Outlining** add-on tiers. Top-level navigation: **Manuscript** (Front Matter, Body Chapters, Back Matter), **Boards** (visual planning/worldbuilding notes), **Goals/Stats**, and **Export**.
2. **Manuscript, chapters, scenes, and scene cards**
   - One editor screen per chapter (left sidebar lists chapters; clicking a chapter loads only that chapter in the center canvas). Chapters can be split or reordered via drag-and-drop. Does not offer a single-page continuous scroll of the whole manuscript or inline scene cards inside the prose.
3. **Connecting writing to the story bible and plan**
   - Uses **Boards & Notes** (Kanban/card boards and rich-text wiki notes with custom attributes and internal `@mentions`) and a **Pinboard drawer** on the right side of the editor: authors can "pin" any character card, location note, or chapter outline card to the right sidebar while drafting a chapter.
4. **Timelines**
   - Supports list/board sequencing on the Outlining tier, but lacks a dedicated date-validated chronological timeline table/view with manuscript quote anchors.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Strong editor-workflow collaboration built for hiring professional editors on Reedsy: supports **inline commenting, Track Changes / Suggesting mode**, and role-based chapter/book sharing, plus read-only public preview links.
6. **Export and publishing formats**
   - **Standout free feature:** One-click, publication-ready **EPUB** and print-ready **PDF** (with trim sizes, bleed, and curated typographic themes: Classic, Romance, Elegy, Element) plus **`.docx`** export—even on the $0 free tier.
7. **Versioning and history**
   - Automatic cloud **Version History** timeline (30 days on the Free tier; unlimited history on the $4.99/mo Craft tier) with side-by-side diff comparison and rollback.
8. **Offline use**
   - **Online-only web app.** Requires an active internet connection; briefly buffers unsaved strokes if a connection flickers, but cannot open or navigate books offline.
9. **Mobile**
   - Responsive mobile web browser interface, but no native mobile app and no offline mobile mode.
10. **Voice: dictation and read-aloud**
    - Relies on browser/OS dictation and TTS; no native neural audio player.
11. **AI features and their policies**
    - **Strictly anti-AI training & human-centric.** Reedsy explicitly guarantees in its terms that author manuscripts are never used to train AI models and does not inject generative prose models into Reedsy Studio (aligning with Reedsy's marketplace of human publishing professionals).
12. **Pricing**
    - **Freemium:** Core Editor + EPUB/PDF/DOCX export is **Free ($0)** forever. **Craft add-on:** $4.99/mo (unlimited version history, dark mode, advanced goals/check-ins). **Outlining add-on:** $7.99/mo (unlimited Boards, templates, custom note attributes).
13. **Onboarding, the first five minutes**
    - Frictionless: create a Reedsy account → click "Create Book" or import `.docx` → start typing in a clean serif canvas with an invisible toolbar that only appears on text selection; export a polished EPUB in 30 seconds.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **One-click browser EPUB & print-ready PDF export with curated typographic themes** (Classic, Romance, Nonfiction) directly in the web UI, without needing a local Pandoc/Tectonic CLI setup.
      - **"Pinned Notes" tray in the context panel:** Letting the author manually pin any 2–3 arbitrary research/character/outline cards to the top of the right sidebar regardless of whether their name appears in the current chapter.
      - **Daily Check-in & Writing Sprint timer** built into the header.
    - **What Bookkit does better:**
      - **Whole-manuscript continuous scroll** (reading and editing across chapters without page-load swaps) and **inline scene cards**.
      - **Automatic entity linking & backlinks** across prose, bible, and plan (no manual pinning required for mentioned characters/places).
      - **Reference-draft workflow (`draft/` beside `manuscript/`)**, **lossless Markdown round-trip**, **Libraries/Shelves**, and **neural voice read-aloud + Whisper dictation**.

---

### 6. LivingWriter (`livingwriter.com`)

1. **Core concept and information architecture**
   - A cloud-first novel and screenplay workspace that combines template-driven plotting (15+ built-in beat sheets like *Save the Cat!*, *Hero's Journey*, *Romancing the Beat*, *Seven Point*) with an auto-recognizing **Story Elements** engine and visual node/grid boards.
2. **Manuscript, chapters, scenes, and scene cards**
   - Left sidebar displays a hierarchical tree of Act/Beat sections, Chapters, and Sub-chapters/Scenes. Center canvas edits one chapter/sub-chapter at a time (or views them as cards on the **Plot Board** — Standard Grid, Freeform Canvas, or Row view). Each chapter/scene has synopsis notes, status, and color coding in the right sidebar.
3. **Connecting writing to the story bible and plan**
   - **Smart Text / Story Elements:** Characters, Locations, Objects, and Research items are stored as Story Elements (with avatars, descriptions, and family/relationship trees). As you type in the manuscript, **LivingWriter auto-completes and auto-links Story Element names**; hovering or clicking a linked name in the text opens its sidebar card without leaving the editor—very close to Bookkit's entity-link concept.
4. **Timelines**
   - Uses horizontal/vertical Plot Boards and act-beat grids rather than a date/calendar chronological timeline table.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Real-time cloud collaboration: share a whole manuscript or individual chapters via email/link with View, Comment, or Co-write permissions, inline comments, and chat.
6. **Export and publishing formats**
   - Exports `.docx`, `.pdf`, Amazon KDP manuscript formats, HTML, and Final Draft/screenplay formats, plus one-click backup to Google Drive and Dropbox.
7. **Versioning and history**
   - Automatic cloud version history per chapter and whole-manuscript snapshots.
8. **Offline use**
   - Has Electron desktop apps (macOS/Windows) and mobile apps that cache recent edits offline, though full functionality is cloud-dependent.
9. **Mobile**
   - Native mobile apps on **iOS and Android** plus responsive web and desktop wrappers.
10. **Voice: dictation and read-aloud**
    - Relies on OS/mobile keyboard dictation; no built-in neural audiobook read-aloud bar.
11. **AI features and their policies**
    - **Heavy generative AI integration** (especially on the Pro + AI tier): includes AI Manuscript Chat (RAG over manuscript + story elements), AI Outline Generator, **AI Rewrite/Expand/Tone-shift on prose**, and AI DALL-E cover/character art generation. No `human-authored` lock blocking AI from writing into the manuscript.
12. **Pricing**
    - **Free tier** (capped features/words); **Pro** (~$14.92/mo billed annually at ~$179/yr); **Pro + AI** (~$19.08/mo billed annually at ~$229/yr).
13. **Onboarding, the first five minutes**
    - Very strong guided onboarding for plotters: click "New Manuscript" → pick a structural template (*Romancing the Beat*, *Save the Cat!*, *PhD Thesis*, *Memoir*, or Blank) → the left sidebar is immediately pre-populated with the template's act sections and instructional tooltips explaining what belongs in each beat.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Auto-complete (`@` or prefix typing) for Story Elements while typing prose** (plus nickname/alias mappings so "Nora", "Dr. Vance", and "the archivist" all resolve to the same Character card).
      - **Structural Beat-Sheet Templates on book creation** (optional *Three-Act*, *Save the Cat*, *Nonfiction Argument* scaffolds when creating a new book).
      - **Visual Relationship Web / Family Tree diagram** between characters.
    - **What Bookkit does better:**
      - **Uncompromising `human-authored` policy** (LivingWriter encourages AI prose rewriting and generation).
      - **Single continuous-scroll manuscript view with inline scene cards** and **plain-text Markdown/YAML portability** (LivingWriter locks data in proprietary cloud records).
      - **Built-in neural read-aloud (`ListenBar`) and Whisper dictation**, plus **Libraries/Shelves** and house-style inheritance.

---

### 7. Novlr (`novlr.org`)

1. **Core concept and information architecture**
   - A Cooperative, **writer-owned** web app focused on calm, distraction-free drafting, writer psychology (gentle streaks, non-punitive goals, writing courses), and ethical technology. IA inside a book (`studio.novlr.org`) has a collapsible left drawer (**Manuscript** chapters, **Plan** grid, **Notes / Story Stuff**), a clean center editor with customizable typography and themes (Day, Evening, Night, High Contrast), and a bottom/top bar for focus mode, stats, and **Proof** (grammar check).
2. **Manuscript, chapters, scenes, and scene cards**
   - Chapters and Notes are items in the left sidebar tree; clicking a chapter opens that single chapter in the center editor. The **Plan** view provides a drag-and-drop card grid where planned cards can be converted into manuscript chapters, but scene cards do not sit inline inside the chapter text.
3. **Connecting writing to the story bible and plan**
   - "Story Stuff" (Notes section) stores freeform character/worldbuilding documents that can be opened in a slide-over drawer while writing, but there is **no automatic entity linking, hover cards, or structured schema** connecting bible entries to chapters.
4. **Timelines**
   - **None** (only the sequential Plan card grid).
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Designed primarily for solo writers with external feedback: supports **inline comments** and **shareable read/comment web links** (e.g., for beta readers or critique partners) and snippet sharing, but lacks real-time multi-author suggestion-merge workflows or shared multi-book libraries.
6. **Export and publishing formats**
   - Exports **EPUB, DOCX, PDF, ODT, RTF, and TXT**, plus automatic continuous background sync to **Google Drive and Dropbox** (every save writes a clean file to your cloud drive). Also offers **Novlr Sites** (one-click author website builder synced to book metadata).
7. **Versioning and history**
   - Automatic cloud version history per chapter (3 days on Free, 30 days on Starter, unlimited on Studio) with restore, plus external Google Drive/Dropbox file history.
8. **Offline use**
   - Progressive Web App with local browser caching for offline drafting sessions, though Novlr warns against extended multi-device offline edits before syncing.
9. **Mobile**
   - Responsive mobile web app / PWA on iOS and Android (no native store binary).
10. **Voice: dictation and read-aloud**
    - No built-in dictation or neural read-aloud player.
11. **AI features and their policies**
    - **Explicitly 100% Generative-AI-Free.** Novlr is a vocal advocate for human authorship and refuses to integrate LLMs anywhere in the product. Its **Proof** tool uses deterministic ProWritingAid rules for grammar, spelling, passive voice, and clichés.
12. **Pricing**
    - **Free** (up to 2 projects); **Starter** ($8/mo annual, $10/mo monthly — 10 projects, analytics, courses); **Studio** ($16/mo annual, $20/mo monthly — unlimited projects, Proof grammar checker, Google Drive/Dropbox sync, Novlr Sites); **Lifetime Studio Co-owner** ($499 one-time).
13. **Onboarding, the first five minutes**
    - Exceptionally warm, calm, and humane: asks about your writing goals and preferred visual environment (Evening/Warm/Dark theme, serif/sans/dyslexia font), imports a `.docx` or opens a clean chapter immediately, and explains how streaks reward showing up without punishing missed days.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Accessibility & Typography Theme presets** right in the editor settings (including Evening/Sepia mode, High Contrast, and **OpenDyslexic** font options—directly relevant to Section 4 of our review brief!).
      - **Automated background backup to the user's Google Drive / Dropbox** on every chapter save, giving nervous cloud writers peace of mind.
      - **Humane Writing Goals & Analytics** (tracking words added, words edited, time spent, and best writing hours without anxiety-inducing streak resets).
    - **What Bookkit does better:**
      - **Deep structural intelligence:** auto-linked story bible, inline scene cards, vertical timeline, reference draft side-by-side, and verified chapter/quote anchors.
      - **Continuous-document manuscript view** (vs. Novlr's single-chapter view).
      - **True co-author/editor collaboration** (Libraries, Shelves, three-way-merged suggestions) and **neural read-aloud + Whisper dictation**.

---

### 8. Ulysses (`ulysses.app`)

1. **Core concept and information architecture**
   - The premier Apple-ecosystem **Markdown-first ("Markdown XL")** distraction-free writing environment. IA is a sleek four-pane progressive disclosure layout: **Library** (iCloud Groups, Projects, Filters) → **Sheet List** (chapters/scenes) → **Editor** → **Dashboard** (Progress goals, Outline navigator, Annotations/Notes, Attachments, Keywords, Revision/Grammar check).
2. **Manuscript, chapters, scenes, and scene cards**
   - Manuscripts are broken into **Sheets** (plain-text Markdown XL buffers). **Crucial UX capability:** just like Scrivener's Scrivenings and Bookkit's `ManuscriptView`, selecting multiple sheets or a parent group in Ulysses **glues them together seamlessly into one continuous scrolling editor**, and you can **Split at Cursor** or **Merge Sheets** at any time. Does not have structured multi-field scene cards (only a short plain-text Note attachment per sheet).
3. **Connecting writing to the story bible and plan**
   - Minimalist: you can create a "Material Sheets" group in a Project (excluded from export/word counts) for characters and research, and attach **Keywords** and **Notes** to sheets, or open a second window on macOS/iPadOS. However, there is **no structured story bible, no auto-linking of character/place names, and no scene-beat board**.
4. **Timelines**
   - None built-in; offers desktop sync integration with **Aeon Timeline**.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - **Solo-author design.** No real-time collaboration, user roles, or suggestion mode (though inline comments `++comment++` and deletions `||deleted||` exist in Markdown XL syntax for self-editing).
6. **Export and publishing formats**
   - **Fastest, cleanest one-click Markdown export in the industry:** compiles sheets into styled **EPUB, PDF, DOCX, HTML, and Plain Text/Markdown** using customizable CSS-like **Ulysses Style Sheets** (`.ulstyle`), plus direct API publishing to **Ghost, WordPress, Medium, and Micro.blog**.
7. **Versioning and history**
   - Automatic macOS/iOS system document versions plus rolling hourly/daily/weekly full-library backups stored locally/iCloud with one-click browse and restore.
8. **Offline use**
   - **100% offline-native** across Mac, iPad, and iPhone (syncs automatically in the background via CloudKit/iCloud when online). Can also edit external local folders (e.g., a Git repository of `.md` files) directly on disk.
9. **Mobile**
   - **Best-in-class native iOS and iPadOS experience:** identical feature set across Mac, iPad, and iPhone with custom touch keyboard row for Markdown symbols, swipe gestures between Library/Sheets/Dashboard, and instant CloudKit sync. **No Windows, Android, or Web support.**
10. **Voice: dictation and read-aloud**
    - Relies on Apple OS Dictation and iOS/macOS Speak Selection; no built-in neural audiobook player.
11. **AI features and their policies**
    - **Zero generative AI.** Includes a built-in Revision Mode grammar and style checker (powered by LanguageTool across 20+ languages) that checks mechanics, style, and typography without generative LLMs.
12. **Pricing**
    - **$5.99/month or $39.99/year** subscription (includes Mac + iPad + iPhone + Apple Family Sharing; also included in Setapp). 7-day free trial.
13. **Onboarding, the first five minutes**
    - Opens immediately into a clean, pre-loaded Library containing a brief, beautifully written interactive Markdown tutorial project ("Introduction"). Zero account creation required because it uses the user's Apple/iCloud ID automatically.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Typewriter Scrolling & Focus Modes:** Highlighting the current sentence/paragraph while dimming surrounding text, and keeping the active typing line vertically centered (or at 40% height) on screen.
      - **Inline Editorial Markup (`++comment++` and `||marked for deletion||`):** Letting an author strike through a sentence to see how the paragraph reads without it (and excluding `||...||` from word counts and exports) without deleting the words yet!
      - **Split Chapter/Scene at Cursor & Merge Chapters** seamlessly inside the editor.
      - **Visual Progress Ring per chapter/project** (showing minimum, target, and maximum word-count thresholds—analogous to Bookkit's `draft_budget_words`).
    - **What Bookkit does better:**
      - **Cross-platform Web Studio + multi-user Collaboration** (Ulysses is Apple-only and single-user).
      - **Novel-specific architecture:** auto-linked Story Bible cards, inline Scene Cards (`What happens`, `Purpose`, `Turn`, `Ends on`), vertical Timeline, and Reference Draft support.
      - **Built-in neural read-aloud (`ListenBar`) and Whisper dictation**, plus Socratic/editorial AI under `human-authored` policy.

---

## Group 2: AI-Centred Writing Tools

*(Evaluated per brief to learn from their organization, Codex, scene-beat, and editorial feedback UX—not prose generation, which Bookkit refuses by design under `ai_policy: human-authored`.)*

---

### 9. Novelcrafter (`novelcrafter.com`)

1. **Core concept and information architecture**
   - A structured web-based novelist's IDE built around six top-level workspace tabs: **Plan** (Grid/List/Outline), **Write** (Manuscript with inline Scene Beat cards), **Codex** (relational story bible with aliases and time-scoped progressions), **Chat** (Workshop RAG assistant), **Review** (stats/pacing), and **Snippets** (scratchpad for cut text). Notably offers a **non-AI $4/mo "Scribe" tier** because its planning and Codex architecture is strong enough to stand on its own without LLMs.
2. **Manuscript, chapters, scenes, and scene cards**
   - Hierarchy is **Acts → Chapters → Scenes**. In the **Write** view, an entire Act or Manuscript renders as a **continuous scrollable stream of Chapters and Scenes**, where each Scene is preceded by a collapsible **Scene Header Card** (holding the Scene Summary, POV character, tense, custom metadata, and optional Scene Beats).
3. **Connecting writing to the story bible and plan**
   - **Industry-leading Codex architecture:**
     - **Categories:** Characters, Locations, Objects, Lore, Subplots, Other.
     - **Aliases & Nicknames:** Every Codex entry defines aliases (e.g., `"Nora"`, `"Dr. Vance"`, `"the archivist"`), and the editor **automatically highlights and underlines every mention or alias in the manuscript prose** with a rich hover popover.
     - **Codex Progressions (time-scoped state):** If a character loses an arm or learns a secret in Act 2, Chapter 9, you add a **Codex Progression** anchored to Chapter 9. When viewing or checking continuity in Chapters 1–8, the system shows only the character's pre-Chapter-9 state; from Chapter 9 onward, it folds in the new progression.
     - **Mention Tracker & Matrix:** Shows a visual heatmap/matrix of which Codex entries appear in which scenes across the entire book.
4. **Timelines**
   - Uses the **Matrix view** (Scenes × Custom Lines such as Time/Day, Location, Subplot, or Character presence) plus **Codex Progressions** anchored to scene positions, rather than a standalone calendar-date timeline table.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - On the **Specialist ($20/mo)** tier, supports inviting co-authors or editors into a shared project or multi-book Series workspace with shared Codex and inline comments, though its suggestion/track-changes workflow is less mature than Google Docs or Bookkit's three-way merge suggestions.
6. **Export and publishing formats**
   - Exports manuscript to **`.docx`**, **Markdown (`.md`)**, **HTML**, **Scrivener/Atticus/Vellum-ready formats** (with toggles for Act headings, Scene summaries, and subtitles), and full project JSON/Markdown archives (including Codex entries). Does not include a print-ready LaTeX/PDF or retail EPUB layout engine.
7. **Versioning and history**
   - Per-scene revision history and whole-project snapshots, plus a dedicated **Snippets** space where deleted scenes or alternate takes can be stashed with tags and dragged back into the manuscript later.
8. **Offline use**
   - **Primarily online web app** (requires an internet connection for cloud state sync, though local LLMs via Ollama/LM Studio are supported for local inference).
9. **Mobile**
   - Responsive mobile web app (PWA-friendly) that adapts the Write, Plan, and Codex views for phones and tablets; no native App Store binary.
10. **Voice: dictation and read-aloud**
    - No built-in Whisper dictation or neural read-aloud player (relies on browser/OS accessibility tools).
11. **AI features and their policies**
    - **BYOK (Bring Your Own Key) architecture** (OpenRouter, Anthropic, OpenAI, Ollama). Core workflow is **Scene Beat → Prose Generation** (`/scene beat`), inline text replacement, and **Workshop Chat** (which automatically injects the Codex entries mentioned in the active scene). While it offers a non-AI tier (`Scribe`), higher tiers are explicitly designed around AI prose generation, with no machine-enforced `human-authored` policy lock.
12. **Pricing**
    - 21-day free trial (no credit card). **Scribe:** $4/mo ($40/yr, no AI); **Hobbyist:** $8/mo ($80/yr, BYOK AI); **Artisan:** $14/mo ($140/yr, adds Workshop Chat & Review); **Specialist:** $20/mo ($200/yr, adds Collaboration).
13. **Onboarding, the first five minutes**
    - Clean dashboard → create Novel (and optional Series universe so multiple books share one Codex!) → import `.docx`/`.md` or start typing in the Write view → add a Character in the Codex with aliases and immediately see those aliases underline in the manuscript with hover cards.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit (what to learn from its organization UX):**
      - **Codex Aliases & Nicknames:** Explicitly listing aliases per character/place so entity highlighting and backlinks catch nicknames, titles, and surnames—not just the exact `## Heading` string.
      - **Codex Progressions (Chapter-Scoped State):** Recording how a character, relationship, or place changes at `*Ch. N*` so both the human author and the editorial AI know *what is true at Chapter N* vs. later in the book.
      - **Series-Level Shared Bible:** Sharing one canonical Bible across multiple books in a series or trilogy.
      - **Entity × Chapter Presence Matrix** (visualizing where characters, motifs, and subplots appear or go missing for 15 chapters) and a **Snippets ("Cut Drawer")** panel for saving cut prose without cluttering the manuscript.
    - **What Bookkit does better:**
      - **Ethical, verifiable `human-authored` contract** (Bookkit never generates or rewrites manuscript prose, whereas Novelcrafter's primary AI loop is beat-to-prose generation).
      - **Open, plain-text file standard (`book.yaml`, `bible/*.md`, `outline/scenes/*.md`)** that lives in Git and works identically in CLI and web (Novelcrafter's database is proprietary).
      - **Built-in neural read-aloud (`ListenBar`) and faithful Whisper dictation.**
      - **Publication-grade CLI typesetting (Pandoc + Tectonic PDF/EPUB + Vale linting)** and **Reference Draft (`draft/` vs `manuscript/`) workflow**.

---

### 10. Sudowrite (`sudowrite.com`)

1. **Core concept and information architecture**
   - A commercial AI-first fiction co-writing web application built around a three-panel layout: **Left Sidebar** (Project chapters, **Story Bible** sections, and **Canvas**), **Center Editor** (rich-text canvas with floating AI toolbar), and **Right History/Cards Tray** (where generated suggestions, sensory descriptions, and feedback cards stack without immediately overwriting the document).
2. **Manuscript, chapters, scenes, and scene cards**
   - Organizes projects into discrete Chapter documents in the left sidebar (no single continuous whole-book scroll). Inside the **Story Bible** drawer below the editor, each chapter has an **Outline** entry and **Scene Beats** cards, though beats are primarily used as prompts for its `Draft` prose generator.
3. **Connecting writing to the story bible and plan**
   - **Story Bible** sits as a collapsible bottom/side drawer inside the editor containing: *Braindump, Genre, Style, Synopsis, Characters, Worldbuilding,* and *Outline*. Links between prose and Story Bible are primarily for feeding LLM context windows rather than rich hypertext/hover-card reading navigation for the human author. Also includes an infinite spatial **Canvas** board for visual cards and relationship mapping.
4. **Timelines**
   - None beyond sequential chapter outline cards and freeform spatial Canvas cards.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Primarily a **single-author environment**; lacks multi-user Library roles, co-author suggestion merges, or Google Docs-style collaborative commenting.
6. **Export and publishing formats**
   - Basic export to **`.docx`** (and plain text/Markdown copy). No native EPUB, print PDF, or bibliography/endnotes publishing pipeline.
7. **Versioning and history**
   - Basic document version history plus the right-hand **History Cards** stream showing prior AI tool outputs.
8. **Offline use**
   - **Online-only cloud app.** Cannot function offline.
9. **Mobile**
   - Responsive mobile browser view and lightweight iOS/Android companion wrappers.
10. **Voice: dictation and read-aloud**
    - Includes a built-in **Read Aloud** TTS button to listen back to a chapter, though without Bookkit's lock-screen media controls, paragraph sync architecture, or faithful Whisper dictation pipeline.
11. **AI features and their policies**
    - **100% generative-AI-centric** (powered by proprietary fiction model **Muse** plus Claude/GPT). Features `Write`, `Guided Write`, `Describe` (5 senses + metaphor), `Rewrite` (show don't tell, shorten, intense), `Shrink Ray` (auto-generates logline, blurb, synopsis, and character list from the manuscript), **Feedback** (developmental & line-edit critique), and a community **Plugin directory** (thousands of user-created single-click analysis/brainstorming prompts). Guarantees user manuscripts are never used to train public models.
12. **Pricing**
    - Credit-metered subscriptions (free trial without credit card): **Hobby & Student:** $19/mo ($10/mo annual — 225k credits); **Professional:** $29/mo ($22/mo annual — 1M credits); **Max:** $59/mo ($44/mo annual — 2M credits with 12-month credit rollover).
13. **Onboarding, the first five minutes**
    - Interactive walkthrough inside a sample story project with step-by-step callout bubbles showing `Describe`, `Write`, and `Story Bible`.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit (what to learn from its non-generative UX):**
      - **Structured Editorial "Feedback" Lenses & Simulated Reader Perspectives:** One-click editorial passes that critique a chapter specifically for *Pacing*, *Show vs. Tell flags (pointing at the lines without rewriting them)*, *Continuity gaps*, or *First-Time Reader Confusion*.
      - **Sensory Thesaurus / "Brainstorm Metaphors & Senses" for a single word** (acting like a rich writer's dictionary/thesaurus in the side tray without writing sentences into the manuscript).
      - **Infinite Spatial Canvas** for early-stage nonlinear brainstorming before chapters exist.
    - **What Bookkit does better:**
      - **Protects human authorship (`human-authored`)**: Bookkit never turns the novelist into an AI prompt-engineer or editor of machine slop.
      - **Continuous-scroll manuscript, inline scene cards, auto-linked story bible with quote anchors, vertical timeline, collaboration roles/suggestions, and full plain-text/CLI publishing.**

---

## Group 3: Planning and Worldbuilding

---

### 11. Plottr (`plottr.com`)

1. **Core concept and information architecture**
   - The industry standard for **visual timeline/matrix plotting** (strictly a planning tool, not a prose drafting processor). Top-level tabs: **Timeline** (2D PlotGrid), **Outline** (linear vertical view of the same cards), **Notes**, **Characters**, **Places**, and **Tags**—plus a **Series View** that sits above individual Books.
2. **Manuscript, chapters, scenes, and scene cards**
   - **No manuscript prose editor.** Instead, Plottr models the book's structure as **Chapters/Beats (columns)** and **Plotlines (rows)**. At every intersection sits a rich **Scene Card** (which can contain a rich-text summary, POV character link, Place link, Tags, color, and **Scene Stacks**—stacking multiple scenes inside a single chapter beat).
3. **Connecting writing to the story bible and plan**
   - Characters (with customizable attribute templates like * Myers-Briggs*, *Enneagram*, *Character Bio*) and Places can be explicitly attached as structured chips on any Scene Card. You can **filter the entire PlotGrid by Character, Place, or Tag** with one click (e.g., "Show me only scenes involving Jonas in Berlin"). Exports the entire plan into Scrivener or Word to start writing.
4. **Timelines**
   - **Signature 2D PlotGrid Timeline:** Horizontal axis is narrative progression (Act/Chapter/Beat or Date); vertical axis is parallel Plotlines (Main Plot, Romance Arc, Villain Thread, Character B's Arc), each color-coded. Supports **Acts & Hierarchical Structure** (collapsing or zooming into Acts/Parts) and 30+ pre-built plotting templates (*Save the Cat!*, *Romancing the Beat*, *Mystery Spine*, *Dan Harmon Story Circle*, *12-Chapter Nonfiction*).
5. **Collaboration: comments, suggestions, roles, and sharing**
   - On **Plottr Pro** (cloud tier), supports real-time multi-user collaboration on the PlotGrid and story bible for co-authors and developmental editors. Base desktop tier is single-user local files (`.pltr`).
6. **Export and publishing formats**
   - Exports outlines and bibles to **`.docx`** and **Scrivener (`.scriv`)** (mapping scene cards directly to Scrivener binder folders/synopses and custom metadata!). No manuscript publishing formats (EPUB/PDF) since it doesn't hold manuscript prose.
7. **Versioning and history**
   - Automatic rolling local/cloud backups of `.pltr` files with one-click restore from the Backups menu.
8. **Offline use**
   - **100% offline** on Plottr Classic desktop (macOS/Windows); Plottr Pro syncs via cloud.
9. **Mobile**
   - Plottr Pro provides browser/cloud access on iPad/Android/iPhone; legacy local mobile apps were consolidated into the Pro cloud web app.
10. **Voice: dictation and read-aloud**
    - None.
11. **AI features and their policies**
    - **100% No-AI.** Plottr contains no generative AI features and does not train on user outlines.
12. **Pricing**
    - **Plottr Classic (Desktop local):** ~$60/yr or ~$150 lifetime. **Plottr Pro (Cloud + Collaboration + Web):** ~$9.99/mo, ~$99/yr, or ~$599 lifetime. 30-day free trial.
13. **Onboarding, the first five minutes**
    - Immediately invites you to "Create from Template" (browsing 30+ visual beat sheets with preview diagrams) or "Start Blank" → opens the colorful 2D PlotGrid where clicking any cell creates a Scene Card.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **2D PlotGrid (Chapters × Plotlines/Arcs/Strands) with one-click Filtering by Character, Place, or Strand:** Bookkit already has `strands` in chapter front matter, `outline/arcs.md`, and `Who`/`Where` fields on `SceneBoard`, but lacks a 2D visual matrix or a filter bar on `Plan` / `SceneBoard` to filter scenes by Character (`Who`), Place (`Where`), or Strand!
      - **30+ Plotting Structure Templates** (*Save the Cat*, *Three-Act*, *Hero's Journey*, *Nonfiction*) available when scaffolding an outline.
    - **What Bookkit does better:**
      - **Plan and Manuscript live in the same app and stay synchronized:** In Plottr, once you export to Scrivener/Word and start writing, your Plottr file immediately drifts out of sync with the actual manuscript. In Bookkit, scene cards sit **inline inside the manuscript chapters** (`SceneCardInline.tsx`), and `bin/check` + `bookkit-chapter-followup` keep `outline/` and `manuscript/` permanently aligned.

---

### 12. Campfire (`campfirewriting.com`)

1. **Core concept and information architecture**
   - A modular, deeply structured worldbuilding and writing suite ("18 interconnected modules") aimed at fantasy, sci-fi, and series authors. Left sidebar organizes **Elements** grouped by Module: *Manuscript, Characters, Timeline, Relationships, Locations, Maps, Magic, Species, Cultures, Languages, Religions, Philosophies, Items, Systems, Arcs, Encyclopedia, Research, Calendar*.
2. **Manuscript, chapters, scenes, and scene cards**
   - The **Manuscript module** stores Chapters and Scenes in a folder tree and edits one chapter/scene at a time in the center pane, surrounded by customizable **Reference Panels** docked on the left/right/bottom showing any character sheet, timeline event, or map pin linked to that chapter.
3. **Connecting writing to the story bible and plan**
   - Every element is built from **drag-and-drop modular widget panels** (e.g., a Character page combines a Stats panel, Physical Attributes panel, Backstory panel, Image Gallery, and Arc progression panel). Typing `@` in the manuscript or any note creates a live smart-tag link to any Element across all 18 modules, with hover previews and automatic bidirectional reference lists.
4. **Timelines**
   - Dedicated **Timeline** and **Calendar** modules: build custom fantasy/historical calendar systems (custom months, days of the week, eras, moons) and plot chronological or narrative events displayed as a branching visual flowchart/timeline linked to chapters and characters.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Paid tiers support **unlimited collaborators** with granular permissions (View, Comment, Edit) even down to specific modules or folders, plus inline comments and optional public publishing on **Campfire Explore** (a reader platform for serialized/indie books with interactive lore).
6. **Export and publishing formats**
   - Exports Manuscript to **EPUB, print-ready PDF, DOCX, HTML, and RTF**, and can export worldbuilding bibles/sheets to PDF or HTML. Imports `.docx` and `.epub`.
7. **Versioning and history**
   - Cloud autosave and document revision history per element/chapter.
8. **Offline use**
   - Desktop apps (macOS/Windows) and mobile apps support offline editing of downloaded projects with cloud sync on reconnect.
9. **Mobile**
   - Native **Campfire (CF Creators)** app on iOS and Android for writing chapters and browsing/editing worldbuilding elements on the go.
10. **Voice: dictation and read-aloud**
    - Relies on OS/device dictation and TTS.
11. **AI features and their policies**
    - **Human-created guarantee:** Campfire does not embed generative AI writing tools and enforces strict anti-AI-slop rules on its Campfire Explore bookstore.
12. **Pricing**
    - **Generous Free tier** (unlimited time, capped per module: e.g., 25,000 manuscript words, 10 characters, 20 timeline events, 2 maps). **Pay-per-module** ($0.25–$1.50/mo or ~$7–$35 lifetime per module) or **All-Access subscription** (~$12–$19/mo, ~$99–$160/yr, or ~$336+ lifetime).
13. **Onboarding, the first five minutes**
    - Guided project wizard asks which modules your book needs (so a realist thriller can hide Magic, Species, and Languages) → opens an interactive checklist dashboard.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Interactive Relationship Webs & Family Trees:** Visual node graphs showing how characters and organizations relate (e.g., allies, siblings, rivals) and how those relationships shift over the story.
      - **Interactive Image Maps with Clickable Pins:** Uploading a city, floorplan, or region map and dropping pins that link directly to `places.md` entries and chapters.
      - **`@`-mention Autocomplete Popover while typing** to link any bible entity or chapter anchor effortlessly.
    - **What Bookkit does better:**
      - **Simplicity, speed, and plain-text longevity:** Campfire's 18-module widget canvas often traps writers in "worldbuilder's disease" (tweaking dashboard panels instead of writing prose). Bookkit's `bible/*.md` pages are clean, readable Markdown documents where `## Name` sections automatically become cards without form-builder bloat.
      - **Continuous-scroll manuscript with inline scene cards**, **reference-draft workflow**, **Canon fact epistemic labels (`documented`, `testimony`, `inferred`, `invented`)**, and **neural read-aloud + Whisper dictation**.

---

### 13. World Anvil (`worldanvil.com`)

1. **Core concept and information architecture**
   - A massive browser-based **encyclopedic worldbuilding wiki, interactive atlas, and TTRPG campaign manager** that also includes a **Manuscripts** module for novelists. IA is organized around **Worlds** → **Articles** (typed by 30+ templates: Person, Settlement, Organization, Conflict, Myth, Item, Technology), **Timelines**, **Maps**, **Family Trees/Bloodlines**, **Variables/Secrets**, and **Manuscripts**.
2. **Manuscript, chapters, scenes, and scene cards**
   - Its **Manuscripts ("Manuscripts Reimagined")** feature organizes books into Parts, Chapters, and Scenes in a tree sidebar and edits one scene/chapter at a time with an adjacent reference lookup bar. Lacks a continuous full-manuscript scroll or inline structured scene cards inside the prose.
3. **Connecting writing to the story bible and plan**
   - Uses `@mention` BBCode/Markdown tags (`@[Character Name](person:id)`) to link prose or wiki articles to any Article in the World, complete with hover tooltips and a quick-search drawer inside the Manuscript editor. Also supports **Subscriber/Reader Secrets** (hiding spoiler paragraphs inside a character article until a reader unlocks a specific plot milestone).
4. **Timelines**
   - Supports **parallel historical Eras and Chronologies** (including BCE/negative dates and fictional calendar systems) displayed on vertical and horizontal visual timelines.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Supports multiple **Co-Authors** with granular role permissions and **Reader/Player Access Groups** (controlling which collaborators or readers can see secret lore), though manuscript editing is not a Google Docs-style suggestion/track-changes engine.
6. **Export and publishing formats**
   - Primarily designed for **web publishing** (turning a world and manuscript into a customizable CSS-themed public or private website); supports exporting articles and manuscripts to JSON/HTML/Markdown/EPUB on paid tiers.
7. **Versioning and history**
   - Basic cloud autosave and article revision snapshots on higher tiers.
8. **Offline use**
   - **Online-only web application.**
9. **Mobile**
   - Responsive mobile web interface (recently overhauled for mobile browsers); no standalone offline native app.
10. **Voice: dictation and read-aloud**
    - None built-in.
11. **AI features and their policies**
    - **Strictly No Native Generative AI.** World Anvil refuses to integrate AI text or image generators and shields private worlds from AI scrapers.
12. **Pricing**
    - **Free tier** (public worlds only, ads, 125 articles); **Master** (~$12/mo — private worlds, no ads, manuscripts); **Grandmaster / Sage** (~$20–$34+/mo or lifetime tiers).
13. **Onboarding, the first five minutes**
    - Overwhelming for a novelist: asks for world genre, calendar system, and meta-taxonomy before you even reach a blank manuscript page, accompanied by dense menus of RPG/wiki settings.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Interactive pinned maps** and **genealogy/family trees**.
      - **Spoiler-gated / Chapter-gated Reader Lore** (marking certain facts in a character card as hidden until Chapter $N$).
    - **What Bookkit does better:**
      - **10× calmer, faster, writer-first UX** where the **manuscript is the center of gravity** (`STANDARD.md`: *"A book is its manuscript. Everything else in the repository describes the manuscript."*).
      - **Automatic entity linking without ugly `@[Name](type:uuid)` syntax**, **lossless plain-text Markdown**, **continuous manuscript scroll**, **inline scene cards**, **suggestion-mode collaboration**, and **built-in voice tools**.

---

### 14. Aeon Timeline (`timeline.app` / `aeontimeline.com`)

1. **Core concept and information architecture**
   - The gold-standard **chronological, narrative, and relational modeling engine** for novelists, historians, and legal/investigative researchers. IA separates **Data** (Events, Characters, Locations, Story Arcs, Clues) from **Multiple Synchronized Views**: *Timeline View*, *Narrative View*, *Spreadsheet View*, *Subway View*, *Relationship Matrix*, and *Mindmap View*.
2. **Manuscript, chapters, scenes, and scene cards**
   - Does not hold manuscript prose directly; instead, its **Narrative View** models **Books → Parts → Chapters → Scenes** as a hierarchical outliner/corkboard of Scene Cards, and **bidirectionally syncs** those folders/cards with **Scrivener** (macOS/Windows) or **Ulysses** (macOS).
3. **Connecting writing to the story bible and plan**
   - Every Event/Scene card links to participating **Characters** (with roles: e.g., *POV*, *Participant*, *Witness*, *Mentioned*), **Locations**, **Story Arcs**, and **Items/Clues**. Its **Relationship View** renders a cross-tab matrix of which entities participate in which events.
4. **Timelines**
   - **Unmatched timeline capabilities:**
     - **Dual Chronological vs. Narrative Order:** A novel with flashbacks or nonlinear chapters has two distinct orders—*when events happened in history* (`Chronological`) vs. *which chapter the reader reads them in* (`Narrative`). Aeon Timeline lets you drag events in Narrative order without breaking their chronological dates, and visually flags chronological vs. narrative inversions!
     - **Dynamic Character Age Calculation:** Give a character a birth date (or birth year) once, and Aeon Timeline **automatically displays every present character's exact age on every single timeline event and scene card** (and flags if a character appears before their birth or after their death).
     - **Logical Dependencies & Constraints:** (`Event B must occur 3–5 days after Event A`; automatically checks weekday-to-calendar-date math and flags impossible travel times or scheduling conflicts).
     - **Subway View:** Draws parallel plotlines and character arcs as colorful metro/subway lines that converge at shared scene "stations" and diverge when characters split up.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Single-user local `.aeon` files (though anyone can download Aeon Timeline in free **Read-Only Viewer Mode** to inspect a shared `.aeon` file). No cloud real-time multi-user editing.
6. **Export and publishing formats**
   - Bidirectional sync with **Scrivener** and **Ulysses**; exports views to **Markdown (`.md`)**, **`.docx`**, **CSV/TSV**, **JSON**, and high-resolution **PDF / PNG / JPEG** timeline graphics.
7. **Versioning and history**
   - Local file backups and OS-level version history.
8. **Offline use**
   - **100% offline** native apps on macOS, Windows, and iOS.
9. **Mobile**
   - Native **iOS and iPadOS** app (syncs `.aeon` files via iCloud Drive or Dropbox; includes Timeline, Narrative, and Spreadsheet views, though Scrivener/Ulysses live-sync is desktop-only). No Android app.
10. **Voice: dictation and read-aloud**
    - None.
11. **AI features and their policies**
    - **100% No-AI.** Deterministic constraint solver and date/calendar engine; zero generative LLMs.
12. **Pricing**
    - **~$65 perpetual license** (covers up to 5 devices across Mac, Windows, and iOS; includes 1 year of updates, with optional ~$35/yr update renewal thereafter). 14-day active-use trial + free Read-Only Viewer mode.
13. **Onboarding, the first five minutes**
    - Choose a domain template (*Fiction & Worldbuilding*, *Historical Nonfiction*, *Legal Case*, *Project Management*) → inspect a rich sample novel timeline (e.g., *Wuthering Heights* or *Murder on the Orient Express*) demonstrating Subway View, Narrative vs. Chronological order, and auto-calculated character ages.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Automatic Character Age & Weekday Calculator on Timeline Events:** Notice how `STANDARD.md` states under `bible/timeline.md`: *"Weekdays and ages are checked against the calendar here, once."* Aeon Timeline computes and validates weekdays (`1983-11-09` → `Wednesday`) and character ages (`Nora: age 34`) automatically!
      - **Chronological Order vs. Narrative (Chapter) Order toggle:** Toggling between sorting events by *Story Date (`When`)* vs. sorting by *Chapter Anchor (`*Ch. N*`)* to spot flashbacks and out-of-order reveals.
      - **"Subway View" of converging/diverging character threads** across chapters.
    - **What Bookkit does better:**
      - **Integrated right inside the writing Studio** with plain-text Markdown tables (`bible/timeline.md`) that require zero external sync configuration, work on the web for all collaborators, and link directly to manuscript quotes (`*Ch. 9*: "…"`).

---

## Group 4: General Editors and Collaboration

---

### 15. Google Docs (`docs.google.com`)

1. **Core concept and information architecture**
   - The universal cloud word processor and benchmark for real-time collaborative editing and commenting. Indeed, Bookkit's own brief defines its core concept as: *"Write a book like a Google Doc in which everything links together."* Recent evolution added **Pageless Mode** (continuous canvas without page breaks) and hierarchical **Document Tabs** in the left sidebar.
2. **Manuscript, chapters, scenes, and scene cards**
   - Traditionally **one long continuous document** navigated via the left-hand heading Outline (`H1`/`H2`/`H3`). In 2024–2026, Google Docs added **Document Tabs & Subtabs** (allowing a single Doc to contain separate chapter tabs in the left sidebar). However, once a single Google Doc crosses **50,000–95,000 words**, typing latency, scroll lag, and mobile crashes degrade severely, and there are **no structured scene cards, chapter status badges, or draft vs. manuscript layers**.
3. **Connecting writing to the story bible and plan**
   - Has `@`-triggered **Smart Chips** (linking to people, dates, dropdown status chips, or external Drive files) and Document Tabs (where an author can keep a "Characters" tab inside the same Doc), but **no automatic entity recognition across prose, no hover character cards, no backlinks ("Referenced in"), and no scene-beat alignment**.
4. **Timelines**
   - None (only basic tables or external Google Sheets links).
5. **Collaboration: comments, suggestions, roles, and sharing**
   - **The undisputed industry gold standard:**
     - **Roles:** Owner, Editor, Commenter (` Suggesting` + comments), Viewer.
     - **Suggesting Mode:** Non-destructive inline insertions (colored text) and deletions (strikethrough) with marginal accept/reject cards, comment threads on every suggestion, **"Preview accept all / reject all"**, and email/push notifications on `@email` mentions or replies.
     - **Real-time CRDT/OT cursor presence:** Multiple people typing in the same paragraph simultaneously with zero lock conflicts.
6. **Export and publishing formats**
   - Downloads to **`.docx`**, **`.epub`**, **`.pdf`**, **Markdown (`.md`)**, **`.odt`**, **`.rtf`**, **`.txt`**, and zipped **`.html`**. However, its EPUB and PDF exports are raw office dumps, not book-typeset editions.
7. **Versioning and history**
   - **Best-in-class Version History:** Automatic continuous granular revision timeline grouping edits by time and author (color-coded per collaborator), ability to **"Name current version"**, filter to "Only show named versions", see inline strikethrough diffs across the whole doc, and copy out a single paragraph or restore a full version.
8. **Offline use**
   - Full offline reading and editing via Chrome/Edge Service Worker + extension (`Google Docs Offline`) and native mobile apps.
9. **Mobile**
   - Native **iOS and Android** apps with offline support, fast comment/suggestion triage on phones, and mobile reflow mode.
10. **Voice: dictation and read-aloud**
    - Includes built-in **Voice Typing** (`Tools > Voice typing` in Chrome, supporting spoken punctuation and editing commands), though it lacks domain-specific character/place name correction (`correctVoiceTerms`) and has no built-in neural audiobook read-aloud player.
11. **AI features and their policies**
    - **Gemini in Docs ("Help me write"):** Heavily promotes generative prose drafting, rewriting, tone shifting, and summarization right in the document margin. Workspace admins can disable Gemini at the org level, but Google Docs has no concept of a per-document `human-authored` policy lock that blocks AI prose generation while keeping editorial review active.
12. **Pricing**
    - **Free ($0)** for personal Google accounts (15 GB Drive); **Google Workspace** ($6–$18+/user/month, with Gemini bundled into Business/Enterprise tiers or Google One AI Premium at ~$19.99/mo).
13. **Onboarding, the first five minutes**
    - Zero learning curve—everyone on earth already knows how to type, comment, and suggest in a Google Doc.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **Inline Suggestion & Comment UX:** Specifically, showing proposed insertions/deletions **inline in the prose with accept/reject margin cards**, keyboard shortcuts (`⌘+Option+M` to comment), and a one-click **"Preview clean text (hide suggestions)"** toggle.
      - **Continuous Automatic Version History** (in addition to named snapshots) so you never lose an edit even if you forgot to click "Save snapshot" beforehand.
      - **Character-level real-time co-editing (Yjs/OT)** without version-conflict prompts when two people type in the same chapter simultaneously, plus **`⌘F` / Find & Replace across the whole document** with regex/case matching.
    - **What Bookkit does better:**
      - **Scales to 95,000+ words cleanly** by storing chapters as separate Markdown files and mounting a live TipTap editor only for the active chapter while rendering other chapters as lightweight static HTML.
      - **Purpose-built for books:** auto-linked Story Bible with hover cards & backlinks, inline Scene Cards, vertical Timeline, Reference Draft comparison, House Style & Vale rules, `human-authored` AI policy, and neural read-aloud (`ListenBar`).

---

### 16. Notion (`notion.so` / `notion.com`)

1. **Core concept and information architecture**
   - The dominant **all-in-one block editor, relational database, and connected wiki workspace**. Everything in Notion is a **Block** inside a **Page**, and any Page can be a row inside a **Relational Database** viewed as a Table, Kanban Board, Gallery, List, Calendar, or Timeline.
2. **Manuscript, chapters, scenes, and scene cards**
   - Authors using Notion typically create a **Chapters Database** or **Scenes Database** where each row is a page with properties (`Chapter #`, `Status`, `POV Relation`, `Location Relation`, `Word Count`, `Synopsis`). However, **each chapter is trapped inside its own separate Notion page**—you **cannot read or scroll through your whole manuscript as one continuous document**, and Notion's block-based editor breaks traditional novel typography (no first-line paragraph indents, awkward copy-paste across block boundaries, slow rendering on 5,000+ word pages).
3. **Connecting writing to the story bible and plan**
   - **Superb relational database & wiki linking:**
     - Typing `@` or `[[` links any Character, Location, or Research page inline and automatically creates **bidirectional Backlinks** (`N backlinks` popover at the top of the target page showing exact context snippets).
     - Database **Relations & Rollups** let a Character page automatically list every Chapter they appear in, calculate their total scene count, and display linked Arcs.
4. **Timelines**
   - Built-in **Timeline View** and **Calendar View** on any database with a Date property, plus custom table views sorted by story chronology.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - Real-time multi-cursor block editing, page-level and inline text comments, `@person` mentions, and granular workspace/teamspace/page permissions (`Full access`, `Can edit`, `Can comment`, `Can view`) plus free external Guest sharing. However, Notion **lacks a true Google Docs-style "Suggesting / Track Changes" mode** for line-editing prose.
6. **Export and publishing formats**
   - Exports pages/databases to **Markdown & CSV (`.zip`)**, **HTML**, and basic **PDF**. **Terrible for book publishing:** cannot compile a multi-page Chapters database into a single formatted `.docx` or `.epub` manuscript without third-party scripts.
7. **Versioning and history**
   - Automatic **Page History** (7 days on Free, 30 days on Plus, 90 days on Business, unlimited on Enterprise) with visual diff and restore, plus manual page snapshots.
8. **Offline use**
   - Introduced native **Offline Mode** (2025/2026) on desktop and mobile apps for favorited and recently opened pages, syncing automatically upon reconnect.
9. **Mobile**
   - Polished native **iOS and Android** apps with bottom navigation, quick page capture, offline access, and voice/AI features.
10. **Voice: dictation and read-aloud**
    - Includes AI Meeting Notes / audio transcription on Business tiers, but no novel-oriented chapter read-aloud player.
11. **AI features and their policies**
    - **Notion AI & Autonomous Agents:** Deeply integrated generative writing, rewriting, auto-filling database properties, and multi-page workspace agents (GPT-4o/Claude). Enterprise plans guarantee zero data training with LLM providers, but there is no `human-authored` lock preventing AI from generating page text.
12. **Pricing**
    - **Free** ($0 for individuals); **Plus** ($10/user/mo annual); **Business** ($20/user/mo annual — includes full Notion AI); **Enterprise** (custom).
13. **Onboarding, the first five minutes**
    - Fast sign-up with template gallery (including community "Novel Writing Hub" templates), though new novelists frequently spend weeks building elaborate Notion dashboards instead of writing Chapter 1.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **The `⌘K` Command & Search Palette + Slash (`/`) Commands:** Instant full-text search across every page, heading, and property in the workspace, plus keyboard-first block insertion. (Bookkit has a `⌘K` jump palette for page/chapter titles and entities, which could be expanded to full-text manuscript + bible search!).
      - **Contextual Backlink Snippets:** When viewing a Character page, showing not just *which chapter* mentions them, but the **1-line sentence snippet around each mention** so you can click directly to that paragraph.
      - **`[[` or `@` inline link autocomplete** while typing.
    - **What Bookkit does better:**
      - **Actual book-writing and book-reading ergonomics:** Continuous-scroll manuscript (`ManuscriptView`), real prose typography, inline scene cards, automatic entity recognition without typing `@` on every mention, one-click `.docx` manuscript export, and full Pandoc/Tectonic EPUB/PDF builds.

---

### 17. iA Writer (`ia.net/writer`)

1. **Core concept and information architecture**
   - The iconic **plain-text Markdown, typography-obsessed, distraction-free writing tool** created by Information Architects. IA consists of a collapsible **Library Sidebar** (local folders, iCloud, Git repos, Content Blocks), a pure **Monospace/Duospace Markdown Editor** (set in custom Nitti / iA Writer Mono, Duo, and Quattro variable fonts), and a live **Preview / Style Check** pane.
2. **Manuscript, chapters, scenes, and scene cards**
   - Every chapter or scene is a plain `.md` or `.txt` file on disk. **Crucial architectural feature — Content Blocks (Transclusion):** By writing `/Chapter-01.md` on its own line in a master `Book.md` file, iA Writer **transcludes (embeds) child chapter files into a single master view** for reading, previewing, and exporting. No scene cards, corkboards, or plotting views.
3. **Connecting writing to the story bible and plan**
   - Supports `[[Wiki Links]]` and `#hashtags` across files in the Library with quick open (`⌘O`), but has **no story bible, no character cards, no hover popovers, and no outline boards**.
4. **Timelines**
   - None.
5. **Collaboration: comments, suggestions, roles, and sharing**
   - **Single-user local file editor.** Collaboration happens externally via Git, iCloud shared folders, or exporting `.docx`.
6. **Export and publishing formats**
   - Exports Markdown to beautifully typeset **PDF**, **`.docx`**, **HTML**, and **Plain Text**, plus direct publishing to Ghost, WordPress, Medium, and Micro.blog. (Does not natively build retail EPUBs with complex front/back matter like Bookkit CLI).
7. **Versioning and history**
   - Relies on native macOS/iOS Document Versions (Time Machine-style browse & revert) or Git repositories, plus **Authorship** origin tracking inside the file.
8. **Offline use**
   - **100% offline-native** across all platforms (edits plain files directly on the local filesystem).
9. **Mobile**
   - **Gold-standard native iOS, iPadOS, and Android apps** featuring a customizable lightning-fast punctuation/Markdown accessory keyboard bar above the system keyboard.
10. **Voice: dictation and read-aloud**
    - Relies on OS dictation and OS Speak Selection.
11. **AI features and their policies**
    - **Pioneering "Authorship" (Human vs. AI Provenance Tracking) in iA Writer 7:**
      - Refuses to embed an AI chatbot that writes for you.
      - Instead, iA Writer tracks **character-by-character provenance** stored as portable Markdown annotations at the bottom of the `.md` file: words **typed by the human author** vs. words **pasted from an AI (ChatGPT/Claude)** or **pasted from Human research/sources**.
      - In the editor, human-typed words appear in full crisp ink, while pasted/AI words appear visually dimmed or tinted until the human author rewrites them in their own words!
    - Also includes deterministic **Style Check** (flags filler words, clichés, redundancies, and custom banned patterns by striking them out in dimmed gray/red) and **Syntax Highlight** (color-coding Nouns, Verbs, Adjectives, Adverbs, and Conjunctions).
12. **Pricing**
    - **One-time purchase per platform:** $49.99 (macOS), $39.99 (Windows), ~$49.99 (iOS/iPadOS). 7-day free trial.
13. **Onboarding, the first five minutes**
    - Instant: opens straight into a serene cream-and-charcoal canvas set in iA Writer Quattro with a blinking blue caret. Press `⌘D` for Focus Mode (Sentence or Paragraph focus) and start writing within 3 seconds.
14. **What it does clearly better than Bookkit, and what Bookkit does better**
    - **Better than Bookkit:**
      - **In-Editor "Style Check" & Syntax Highlighting Overlay:** Bringing deterministic prose linting (filler words, redundancies, weak adverbs, clichés—and in Bookkit's case, `companion.retired` patterns and `Humanize` checks!) directly into the web editor as toggleable visual highlights, rather than only in the CLI `bin/lint` / `humanize-report`.
      - **Paste-Provenance / Authorship Tracking:** Visually distinguishing or warning when large blocks of text are pasted from external sources vs. typed/dictated under `ai_policy: human-authored`.
      - **Focus Mode (Sentence / Paragraph Focus + Typewriter Scrolling):** Dimming all paragraphs except the active one so the writer stays in flow during first-draft composition.
      - **Typography:** iA Writer's variable Quattro/Duo fonts and optical margins (which aligns closely with Bookkit's own custom `Garamond Mono` in the bookkit repo!).
    - **What Bookkit does better:**
      - **Full novel-scale architecture:** Continuous multi-chapter editor, inline scene cards, auto-linked Story Bible, vertical Timeline, Reference Draft workflow, multi-user Libraries/Shelves with suggestion-mode collaboration, and built-in Whisper dictation + Deepgram Aura-2 read-aloud.

---

## Comprehensive Feature Matrix (Bookkit + 17 Competitors)

Legend:
- **✅ Full / Native / Best-in-class**
- **◐ Partial / Basic / Add-on / External-dependent**
- **❌ None**

| Capability / Dimension | **Bookkit** (Web + CLI) | **Bookmoth** | **Scrivener** | **Atticus** | **Dabble** | **Reedsy Studio** | **LivingWriter** | **Novlr** | **Ulysses** | **Novelcrafter** | **Sudowrite** | **Plottr** | **Campfire** | **World Anvil** | **Aeon Timeline** | **Google Docs** | **Notion** | **iA Writer** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1. Core Architecture** | Web Studio + Plain-Text/CLI | Native Desktop + iOS | Native Desktop + iOS | Web / PWA | Web / PWA + Desktop | Web Cloud | Web + Desktop + Mobile | Web / PWA | Native Apple (Mac/iOS) | Web Cloud | Web Cloud | Desktop + Web Cloud | Web + Desktop + Mobile | Web Wiki + Manuscript | Native Desktop + iOS | Web + Mobile Cloud | Web + Desktop + Mobile | Native Plain-Text |
| **Plain-text Markdown / Git-friendly files** | ✅ (`book.yaml` + `.md`) | ❌ | ❌ (`.scriv` RTF) | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (External folders) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (Export only) | ✅ (`.md` files) |
| **Multi-book Libraries, Shelves & House Style** | ✅ (Subdomains + Shelves) | ❌ | ❌ | ❌ | ◐ (Series folders) | ❌ | ❌ | ❌ | ✅ (Groups/Projects) | ✅ (Series Codex) | ❌ | ✅ (Series Bible) | ◐ | ✅ (Worlds) | ❌ | ◐ (Drive folders) | ✅ (Workspaces) | ✅ (Library folders) |
| **2. Manuscript & Scenes** | | | | | | | | | | | | | | | | | | |
| **Whole-book continuous scroll view** | ✅ (`ManuscriptView`) | ❌ | ✅ (Scrivenings) | ❌ | ✅ (Folder scroll) | ❌ | ❌ | ❌ | ✅ (Glued sheets) | ✅ (Act/Book scroll) | ❌ | ❌ (No prose) | ❌ | ❌ | ❌ (No prose) | ✅ (Slow >50k words) | ❌ | ◐ (Content blocks) |
| **Chapters stored as modular files under the hood** | ✅ (`manuscript/NN.md`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Sheets) | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ◐ (Document Tabs) | ✅ (DB Pages) | ✅ |
| **Structured Scene Cards** | ✅ (`SceneBoard` + `.md`) | ✅ | ✅ (Corkboard) | ❌ | ✅ (Plot Grid) | ✅ (Boards) | ✅ (Plot Board) | ◐ (Plan grid) | ◐ (Sheet notes) | ✅ (Scene beats) | ✅ | ✅ (Rich cards) | ✅ | ◐ | ✅ (Narrative view) | ❌ | ✅ (DB rows) | ❌ |
| **Inline Scene Cards inside chapter prose** | ✅ (`SceneCardInline`) | ❌ | ❌ | ❌ | ◐ (Right margin) | ❌ | ❌ | ❌ | ❌ | ✅ (Scene header) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Read-only Reference Draft (`draft/` beside `manuscript/`)** | ✅ (Built-in workflow) | ❌ | ◐ (Split pane) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **3. Story Bible & Plan Connection** | | | | | | | | | | | | | | | | | | |
| **Built-in Story Bible (Characters, Places, Motifs)** | ✅ (`bible/*.md` cards) | ✅ (Codex) | ◐ (Freeform docs) | ❌ | ✅ (Story Notes) | ✅ (Boards/Notes) | ✅ (Story Elements) | ◐ (Story Stuff) | ◐ (Material sheets) | ✅ (Codex) | ✅ (Story Bible) | ✅ | ✅ (18 modules) | ✅ (Wiki articles) | ✅ (Entities) | ❌ | ✅ (Databases) | ❌ |
| **Auto-linking & hover cards on names in prose** | ✅ (Auto-detected) | ✅ | ❌ (Manual links) | ❌ | ❌ | ❌ (Manual `@`) | ✅ (Smart Text) | ❌ | ❌ | ✅ (Codex + Aliases) | ❌ | ❌ | ◐ (`@` tags) | ◐ (`@` tags) | ❌ | ❌ | ◐ (`@` / `[[` links) | ❌ |
| **Entity Aliases / Nicknames auto-detection** | ◐ (Exact `## Name` match) | ◐ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (Full Aliases) | ❌ | ❌ | ◐ | ◐ | ❌ | ❌ | ❌ | ❌ |
| **Chapter-scoped Bible Progressions (what's known at Ch. N)** | ◐ (Chapter anchors) | ✅ (Chapter-pinned) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Progressions) | ❌ | ❌ | ◐ | ✅ (Secrets) | ✅ | ❌ | ❌ | ❌ |
| **Verified Quote Anchors (`*Ch. 9*: "quoted words"`)** | ✅ (`bin/check` + UI) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **2D Matrix (Chapters × Subplots/Strands/Characters)** | ◐ (`strands` + `arcs.md`) | ◐ | ◐ (Outliner) | ❌ | ✅ (Plot Grid) | ◐ | ✅ | ❌ | ❌ | ✅ (Matrix view) | ❌ | ✅ (PlotGrid) | ◐ | ❌ | ✅ (Subway/Matrix) | ❌ | ✅ (DB Views) | ❌ |
| **4. Timelines** | | | | | | | | | | | | | | | | | | |
| **Chronological Timeline View** | ✅ (`TimelinePage`) | ✅ | ❌ (Uses Aeon) | ❌ | ❌ | ◐ | ◐ | ❌ | ❌ (Uses Aeon) | ◐ (Progressions) | ❌ | ✅ (PlotGrid) | ✅ (Timeline/Cal) | ✅ (Historical eras) | ✅ (Gold standard) | ❌ | ✅ (Timeline view) | ❌ |
| **Chronological vs. Narrative Order & Auto Character Ages** | ◐ (`bin/check` manual) | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ◐ | ✅ (Auto age/dates) | ❌ | ❌ | ❌ |
| **5. Collaboration** | | | | | | | | | | | | | | | | | | |
| **Real-time multi-user presence & sharing** | ✅ (Supabase Realtime) | ❌ | ❌ | ◐ | ✅ (Co-authoring) | ✅ | ✅ | ◐ (Share links) | ❌ | ✅ (Specialist tier) | ❌ | ✅ (Plottr Pro) | ✅ | ✅ (Co-authors) | ❌ (Viewer mode) | ✅ (Gold standard) | ✅ | ❌ |
| **Suggesting Mode / Track Changes (Editor vs. Owner)** | ✅ (3-way merge + diff) | ❌ | ◐ (Local colour) | ◐ | ✅ (Author tier) | ✅ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Inline cards) | ❌ | ❌ |
| **Inline Anchored Quote Comments & Replies** | ✅ | ❌ | ✅ (Local only) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Local only) | ✅ | ❌ | ◐ | ✅ | ◐ | ❌ | ✅ | ✅ | ❌ |
| **6. Export & Publishing** | | | | | | | | | | | | | | | | | | |
| **Web one-click `.docx`, `.md`, `.txt`, `.zip` export** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ (`.docx` only) | ✅ (Outline `.docx`) | ✅ | ◐ | ✅ | ✅ | ◐ (`.md`/`.pdf`) | ✅ |
| **Retail EPUB & Typeset Print PDF** | ✅ (Via `bookkit` CLI) | ✅ (EPUB/PDF) | ✅ (Compile) | ✅ (With live preview) | ❌ | ✅ (Free in browser) | ✅ (PDF/KDP) | ✅ (EPUB/PDF) | ✅ (Styled EPUB/PDF) | ❌ | ❌ | ❌ | ✅ (EPUB/PDF) | ◐ (EPUB) | ◐ (Graphic PDF) | ◐ (Raw EPUB/PDF) | ◐ (Basic PDF) | ✅ (Typeset PDF) |
| **Academic/Nonfiction Citations (`citeproc`), Endnotes & Polytonic Greek** | ✅ (Chicago 18th + Lua) | ❌ | ◐ (Via Pandoc) | ◐ (Footnotes) | ❌ | ◐ (Endnotes) | ❌ | ❌ | ◐ (Footnotes) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (Footnotes) | ❌ | ◐ (Footnotes) |
| **7. Versioning & History** | | | | | | | | | | | | | | | | | | |
| **Snapshots with visual Diff & Restore** | ✅ (`SnapshotBrowser`) | ✅ | ✅ (`⌘5` Snapshots) | ❌ | ✅ | ✅ (30d / unlim) | ✅ | ✅ (3d / 30d / unlim) | ✅ (Sheet versions) | ✅ | ◐ | ✅ (File backups) | ✅ | ◐ | ◐ | ✅ (Continuous) | ✅ (7d–unlim) | ✅ (OS / Git) |
| **8. Offline Use** | ◐ (Draft cache + Tauri) | ✅ (Local-first) | ✅ (Local-first) | ✅ (PWA offline) | ✅ (PWA/Desktop) | ❌ | ◐ | ◐ (Short cache) | ✅ (Local/iCloud) | ❌ | ❌ | ✅ (Desktop) | ✅ (Desktop/App) | ❌ | ✅ (Local-first) | ✅ (PWA/Ext) | ✅ (Offline mode) | ✅ (Local files) |
| **9. Mobile Experience** | ✅ (Responsive web) | ✅ (iOS Companion) | ◐ (iOS + Dropbox) | ◐ (PWA) | ✅ (PWA) | ◐ (Mobile web) | ✅ (iOS/Android) | ✅ (Mobile web) | ✅ (Best iOS/iPadOS) | ✅ (Mobile web) | ◐ | ◐ (Pro web) | ✅ (iOS/Android) | ◐ (Mobile web) | ✅ (iOS/iPadOS) | ✅ (iOS/Android) | ✅ (iOS/Android) | ✅ (iOS/Android) |
| **10. Voice: Dictation & Read-Aloud** | | | | | | | | | | | | | | | | | | |
| **Built-in Speech-to-Text Dictation** | ✅ (Whisper + Bible names) | ✅ (Voice-first) | ❌ (OS only) | ❌ | ❌ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Voice typing) | ◐ (Meeting notes) | ❌ |
| **Built-in Neural Read-Aloud with Highlighting** | ✅ (Aura-2 + Lock screen) | ❌ | ◐ (OS speech) | ❌ | ◐ (OS speech) | ◐ | ❌ | ❌ | ❌ | ❌ | ✅ (Read Aloud) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **11. AI Features & Policy** | | | | | | | | | | | | | | | | | | |
| **Machine-enforced `human-authored` policy (No AI prose)** | ✅ (Enforced in UI & CLI) | ❌ (Writes prose) | ✅ (No AI) | ✅ (No AI) | ✅ (No AI) | ✅ (No AI) | ❌ (Writes prose) | ✅ (No AI) | ✅ (No AI) | ◐ (`Scribe` tier only) | ❌ (Writes prose) | ✅ (No AI) | ✅ (No AI) | ✅ (No AI) | ✅ (No AI) | ❌ (Gemini writes) | ❌ (Notion AI writes) | ✅ (Authorship tracking) |
| **Editorial AI Review / Continuity Check without touching prose** | ✅ (`ContextPanel` + Skills) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (Workshop Chat) | ✅ (Feedback tool) | ❌ | ❌ | ❌ | ❌ | ◐ | ◐ | ❌ |
| **Deterministic Prose Linting (Vale / Style / Repetition)** | ✅ (CLI Vale + `audit`) | ❌ | ◐ (Linguistic Focus) | ◐ (PWA ext) | ◐ (PWA Author) | ❌ | ❌ | ✅ (Novlr Proof) | ✅ (LanguageTool) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Grammar) | ❌ | ✅ (Style + Syntax) |
| **12. Pricing** | Hosted / BYOK | $99 lifetime | $59.99 one-time | $147 lifetime | $15–$49/mo ($699 life) | Free / $4.99–$7.99/mo | Free / $15–$19/mo | Free / $8–$20/mo ($499) | $5.99/mo ($39.99/yr) | $4–$20/mo + BYOK | $10–$59/mo | $60–$99/yr ($150+ life) | Free / a-la-carte / $12+/mo | Free / $12–$34/mo | $65 perpetual | Free / $6–$20/mo | Free / $10–$20/mo | $40–$50 per OS |
| **13. First 5-Min Onboarding** | 6-digit code → Library | Setup + Voice sample | Heavy tutorial | Fast `.docx` import | Goal wizard + Grid | Instant blank doc | Template beat picker | Calm theme + goal | Instant iCloud sheet | Novel + Codex setup | Sample story tour | 30+ template picker | Module checklist | Complex RPG setup | Sample timelines | Instant doc | Template picker | Instant caret |

---

## Ranked "What to Steal" List for Bookkit

Every recommendation below strictly honors Bookkit's foundational rule: **the human author writes every word of the manuscript (`ai_policy: human-authored`), while Bookkit organizes, links, reviews, lints, formats, and reads back.** Items are ranked **#1 to #15** by direct daily value to a working novelist or nonfiction author, paired with how they map onto Bookkit's existing plain-text (`book.yaml` + Markdown) architecture and React/TipTap Studio UI.

---

### 1. Entity Aliases & Nicknames in the Story Bible (Steal from: *Novelcrafter* & *LivingWriter*)
- **Why novelists love it:** In real books, characters and places are rarely referred to by a single canonical heading string. "Dr. Nora Vance" is called `"Nora"`, `"Dr. Vance"`, `"Vance"`, or `"the archivist"`; `"Onega Air"` is called `"Onega"`. Currently, `src/lib/book-model.ts` derives entity matcher patterns only from the `## Name` heading (and simple parenthetical splits).
- **How to build it in Bookkit (100% plain-text compatible):**
  - Support an optional `**Aliases:** Dr. Vance, Vance` (or `**Also called:**`) metadata line at the top of any `## Name` section in `bible/characters.md`, `bible/places.md`, or `bible/motifs.md` (and surface an "Aliases" chip input in `EntityPage`).
  - Teach `book-model.ts` and `bible-highlight.ts` to index those aliases into the same entity decoration, hover card, and "Referenced in" backlinks list—while respecting `companion.retired` forms so retired names are flagged as warnings rather than valid links.

---

### 2. In-Editor "Craft & Style Overlay" — Dialogue Focus, Rhythm, and Retired Terms (Steal from: *Scrivener's Linguistic Focus* & *iA Writer's Style Check*)
- **Why novelists love it:** Scrivener's "Dialogue Focus" (dimming all narrative text to 25% opacity so only spoken `"dialogue"` stays crisp) lets an author read an entire chapter's dialogue down the page in 60 seconds to check character voice and cut excess dialogue tags. Similarly, iA Writer's toggleable Style Check highlights filler words and repetitions right inside the editor.
- **How to build it in Bookkit:**
  - Bookkit *already* has sophisticated deterministic prose rules in the CLI (`bin/book audit` repetition scanner, `bin/book humanize-report` sentence-length runs, weak stock words, em-dash density, and `companion.retired` regexes in `book.yaml`)!
  - Add a **"Craft View" toggle pill** in the Studio editor toolbar with three deterministic, zero-AI human-editing lenses:
    1. **Dialogue Focus:** Dims narrative prose so only text inside quotation marks (`"…"` / `“…”`) is full-contrast.
    2. **Retired & House-Style Flags:** Highlights any occurrence of `companion.retired` patterns (e.g., `Volga Air`) or house-style mismatches (e.g., straight quotes or spaced en-dashes vs. closed em-dashes per `book.yaml:style`) inline in the editor.
    3. **Sentence Rhythm / Echoes:** Underlines exact repeated phrases within a 3-paragraph window or 5+ consecutive same-length sentences (bringing `humanize-report` into the browser).

---

### 3. Contextual Backlink Snippets + Verified Quote-Anchor Status in the Sidebar (Steal from: *Notion* & *Bookkit CLI's own `STANDARD.md`*)
- **Why novelists love it:** In Notion, opening a Character page shows not only *which chapters* mention the character, but the **1-line sentence context around each mention** so you can jump straight to that paragraph. Furthermore, Bookkit's `STANDARD.md` defines a brilliant syntax—quoted anchors (`*Ch. 9*: "forcing them underground"`)—which `bin/check` verifies in the CLI, but the web Studio doesn't yet validate visually.
- **How to build it in Bookkit:**
  - In `EntityPage` and `ContextPanel`'s "Referenced in" list, show the surrounding sentence snippet for each mention in the chapter and scroll directly to that paragraph on click.
  - When rendering `*Ch. 9*: "quoted words"` in any `bible/` or `outline/` page in the web Studio, check whether `"quoted words"` actually resolves in Chapter 9 (`manuscript/` or `draft/`): show a subtle green check badge (that scrolls to and highlights the exact quote in Chapter 9 when clicked!) or an amber **"Quote drifted"** badge if the chapter was edited and the quote no longer matches.

---

### 4. Side-by-Side Split View / Pinned Reference Drawer (Steal from: *Scrivener's Split Editor* & *Reedsy's Pinboard*)
- **Why novelists love it:** When rewriting a chapter from a reference draft (`draft/09-the-oath.md`) or cross-checking a complex timeline/research ledger (`research/claims.md`), toggling tabs in a narrow right-hand `ContextPanel` isn't wide enough. Scrivener's Split Editor lets you lock any second document (the Reference Draft, a Character page, `outline/open-questions.md`, or Chapter 2) in a side-by-side 50/50 pane beside your active chapter.
- **How to build it in Bookkit:**
  - Add a **"Pin beside manuscript" (`Split View`)** icon on any Reference Draft, Bible page, Research page, or earlier Chapter so the author can read the full-width Reference Draft or `bin/brief N` dossier on the left/right while typing their `human-authored` chapter in the main pane.
  - Allow **manual pinning** of any 2–3 Bible/Research cards to the top of `ContextPanel` (even if their exact heading isn't mentioned yet in the current chapter).

---

### 5. 2D Strand / Arc Matrix & Scene Filter Bar (Steal from: *Plottr* & *Dabble's Plot Grid*)
- **Why novelists love it:** Novelists constantly ask: *"Where did the B-plot disappear for 12 chapters?"* or *"Show me every scene where Jonas and Weyand are in the same room."*
- **How to build it in Bookkit (using existing Bookkit metadata!):**
  - Bookkit's `STANDARD.md` already defines `strands` in chapter front matter, `outline/arcs.md`, and structured `**Who:**` and `**Where and when:**` lines on every scene card in `outline/scenes/NN-*.md`!
  - On the **Plan (`Boards.tsx` / `PlanList.tsx`)** and **SceneBoard** views, add:
    1. **Filter chips** by **Character (`Who`)**, **Location (`Where`)**, **Chapter Status (`outline | drafting | drafted | revised | locked`)**, and **Strand**.
    2. A **Matrix toggle** on the Plan page: rows = Chapters, columns = Strands or Main Characters (showing a colored dot or the scene's `Purpose` / `Turn` wherever that character/strand appears in a chapter).

---

### 6. Continuous Automatic File History + Inline Card Undo (Steal from: *Google Docs* & *Scrivener's `⌘5` Chapter Snapshots*)
- **Why novelists love it:** Known issue #5 in `review-brief.md` notes that inline scene-card edits save directly with no history apart from manual whole-book snapshots, and authors frequently forget to manually create a named snapshot before a heavy editing session.
- **How to build it in Bookkit:**
  - Record lightweight automatic document revisions in Supabase (or coalesce saves per 15-minute editing session per `path` in `bookkit_documents`) so any single file (`manuscript/06.md`, `outline/scenes/06.md`, `bible/characters.md`) has a **"File History" drawer** with instant visual diff and one-file restore—without having to restore an entire 95,000-word book snapshot.
  - Add a one-click **"Snapshot this chapter (`⌘5`)"** button in the chapter header before major rewrites.

---

### 7. Web-Accessible Live Print/eReader Preview & Server-Assisted EPUB/PDF Export (Steal from: *Atticus* & *Reedsy Studio*)
- **Why novelists love it:** Currently, Bookkit's web Studio exports `.docx`, `.md`, `.txt`, and `.zip`, while the gorgeous EPUB and Tectonic PDF builds require running `bin/build` in a local Python/Pandoc/Tectonic terminal environment. Non-technical co-authors, editors, and authors on iPads want to preview and download a formatted EPUB or print-ready PDF right from `bookkit.net`.
- **How to build it in Bookkit:**
  - Add a **Client-Side EPUB 3 generator** in `src/lib/export-book.ts` (using `jszip`, already in `package.json`!, plus Bookkit's own `styles/epub/` CSS, `publication/metadata.yaml`, front/back matter, and endnotes rules from `book.yaml`) so any user can download a valid, styled `.epub` directly from BookSettings in the browser.
  - Add a **"Reader / Print Preview"** mode in the Studio that renders the manuscript using the book's `publication.chapter_heading` pattern (`Chapter {number_word} – {title}`), drop caps, and page margins.

---

### 8. Chapter-Scoped Knowledge & Continuity Pinning (Steal from: *Bookmoth*, *Novelcrafter Progressions*, & *Aeon Timeline*)
- **Why novelists love it:** A classic novel-writing bug is an anachronism: referencing a fact in Chapter 4 that the POV character doesn't actually discover until Chapter 11, or forgetting how old a character is in a 1979 flashback.
- **How to build it in Bookkit:**
  - Bookkit's `bible/characters.md` already has a `what they know when` convention and `*Ch. N*` anchors, and `bible/timeline.md` has dated events with `*Ch. N*` anchors!
  - In `ContextPanel` and `TimelinePage`:
    1. Add a **"Chronological vs. Chapter Order" toggle** on `TimelinePage` (sort by table row order vs. sort by `*Ch. N*` anchor number, highlighting flashbacks where chapter order ≠ chronological order).
    2. When the author is working in **Chapter $N$**, highlight anchors in `ContextPanel` that belong to **Chapters $> N$** with a subtle `"Future (Ch. 14)"` badge so the author (and the `/api/ai` editorial assistant!) immediately sees what hasn't happened yet at Chapter $N$.

---

### 9. Inline Prose "Strike-to-Test" (`||tentative cut||`) & Snippets Drawer (Steal from: *Ulysses* & *Novelcrafter*)
- **Why novelists love it:** Human revision is mostly cutting—but authors hesitate to delete a paragraph they worked hard on. Ulysses lets you mark a span as `||marked for deletion||`: it stays in the file (visually dimmed/struck through) so you won't lose it, but is **excluded from live word counts, read-aloud TTS (`ListenBar`), and exports**. And Novelcrafter's **Snippets drawer** gives cut scenes a home.
- **How to build it in Bookkit:**
  - Support HTML comments `<!-- cut: ... -->` (which `STANDARD.md` and `bookkit` CLI *already* strip on build and ignore in citekey checks!) as a first-class **"Tentative Cut / Editor's Note" mark** in TipTap: toggleable with a keyboard shortcut, excluded from `ListenBar` read-aloud (`voice-text.ts`) and `.docx`/`.md` reading exports, and collapsible to a clean pill so the author can hear and read the paragraph without the cut sentence before deleting it permanently.

---

### 10. Seamless Read-Aloud (`ListenBar`) Upgrades: Structural DOM Sync, Pre-Fetch & Offline Audio Pack (Steal from: *Sudowrite / Speechify UX* + *Bookkit Brief §4 & §5.3*)
- **Why novelists love it:** None of the 17 competitors match Bookkit's combination of Deepgram Aura-2 neural TTS + lock-screen MediaSession controls + human-authored workflow. Turning `ListenBar` from great to flawless makes Bookkit the #1 tool for "editing by ear" while walking or commuting.
- **How to build it in Bookkit:**
  - Fix the paragraph-index drift (Brief §5.3) by tagging spoken block nodes with deterministic `data-voice-idx` attributes across paragraphs, blockquotes, and list items rather than indexing `.doc-prose > p`.
  - Pre-fetch chunk $N+1$ while chunk $N$ is playing to eliminate inter-chunk audio gaps, add a **Sleep Timer (15m / 30m / End of chapter)**, and add a **"Download chapter audio (.mp3)"** button for offline listening on a plane or train.

---

### 11. Continuous Hands-Free Dictation with Single-Step Undo & Spoken Structural Commands (Steal from: *Google Docs Voice Typing* + *Bookkit Brief §5.4*)
- **Why novelists love it:** Bookkit's Whisper + bible-name-aware (`correctVoiceTerms`) + strict word-preserving punctuation pipeline is already far more accurate and ethical than Bookmoth's AI-rewriting dictation or OS dictation. Removing the 2-minute hard cap makes it viable for dictating whole scenes.
- **How to build it in Bookkit:**
  - Support **continuous chunked recording** (auto-slicing on silence or every 60–90 seconds while keeping the mic hot so the author can dictate for 15 minutes straight).
  - Wrap the entire dictated insertion in a single ProseMirror transaction metadata group (or checkpoint) so **`⌘Z` undoes the entire dictated passage in one step**, and show a brief **"Undo dictation"** toast pill right after insertion.

---

### 12. Full-Book `⌘K` Search & Replace + Web "Chapter Brief (`bin/brief N`)" View (Steal from: *Notion*, *iA Writer*, & *Bookkit CLI*)
- **Why novelists love it:** In the CLI, `bin/brief 7` is a superpower: it compiles everything the companion files say about Chapter 7 (its status, its `outline/chapters.md` section, its scene cards, and every bible/arc/craft/open-question entry anchored to `*Ch. 7*`) into one view or printable PDF. Meanwhile, Notion's `⌘K` searches full text across every document instantaneously.
- **How to build it in Bookkit:**
  - Upgrade `Studio.tsx`'s `⌘K` palette so that if a query doesn't match a chapter/entity title, it searches **full text across all `files` already loaded in `useBookStore`** with instant line snippets and jump-to-paragraph.
  - Add a **"Chapter Dossier / Brief"** view (and printable view) in the web Studio's `ContextPanel` that renders the exact equivalent of `bin/brief N` (including `--no-quotes` mode for writing unanchored beside a reference draft!).

---

### 13. Paste-Provenance Guardrails for `human-authored` Books (Steal from: *iA Writer 7 Authorship*)
- **Why novelists love it:** Under `ai_policy: human-authored`, Bookkit's assistant refuses to write prose, and "Write this chapter" never copies from `draft/`. Adding a lightweight provenance helper modeled on iA Writer 7 protects the author from accidentally pasting reference-draft or external text into `manuscript/`.
- **How to build it in Bookkit:**
  - When `ai_policy === "human-authored"`, if a user pastes a large multi-sentence block into `manuscript/` that matches a substring of `draft/` (the read-only reference draft), block or warn with a gentle modal: *"This book is declared `human-authored`. Reference draft prose cannot be pasted into the manuscript—use the Reference tab to read beside your chapter while writing in your own words."*

---

### 14. Reading Comfort, Focus Mode & Dyslexia-Friendly Themes (Steal from: *Novlr*, *Ulysses*, & *iA Writer*)
- **Why novelists love it:** Writing 95,000 words means staring at the editor for hundreds of hours. Novlr, Ulysses, and iA Writer offer warm sepia/evening modes, typewriter scrolling, paragraph focus, and dyslexia-friendly typography.
- **How to build it in Bookkit:**
  - Add editor appearance controls (accessible from the top bar / settings):
    - **Typography choice:** Bookkit Serif (`Georgia` / `TeX Gyre Pagella`), Bookkit Mono (`Garamond Mono`), Sans, and **Dyslexia-friendly (`OpenDyslexic` / `Atkinson Hyperlegible`)** with adjustable line width and line spacing.
    - **Focus Mode & Typewriter Scroll:** Optional toggle that dims non-active paragraphs and keeps the cursor vertically centered while drafting.

---

### 15. Richer Activity & Pacing Analytics — Net Words, Revisions & Budget Progress Rings (Steal from: *Ulysses* & *Novlr*)
- **Why novelists love it:** Known issue #7 in `review-brief.md` asks whether activity metrics should show words removed and time spent, and `book.yaml` already supports `draft_budget_words` per chapter!
- **How to build it in Bookkit:**
  - In `Workspace.tsx` and the chapter header, show **Words Written (`+added`)**, **Words Cut/Revised (`-removed`)** (celebrating editing and tightening prose just as much as raw drafting!), and a subtle **Progress Ring** on chapters that declare `draft_budget_words` in their YAML front matter.

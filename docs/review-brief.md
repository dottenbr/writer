# Brief: review, benchmark and improve Bookkit

You are reviewing and improving **Bookkit** (https://bookkit.net), a web app for writing books. Work in the repository at `/Users/dominik/Development/personal/writer` (branch `codex/reliability-hardening`). The companion standard and command-line tools live in `/Users/dominik/Development/writing/bookkit` (Python, GitHub: dottenbr/bookkit). Read `CLAUDE.md`, `docs/deployment.md` and the bookkit `README.md` and `STANDARD.md` before you change anything.

Your job has four parts, in this order:
1. Understand the product and its concept.
2. Compare it with the best tools in its category.
3. Measure its quality: performance, speed, usability, accessibility, reliability, security.
4. Improve it: fix bugs, close the gaps that matter, and prove each improvement.

Report before you build. Build in small, reviewable steps.

---

## 1. What Bookkit is

- **Concept.** Write a book like a Google Doc in which everything links together:
  - the manuscript as one continuous document;
  - a story bible of characters, places and motifs, shown as cards and linked automatically wherever their names appear;
  - a plan with a brief, a chapter outline and scene cards that sit at the top of each scene in the chapter;
  - a vertical timeline, research pages, a style guide, comments and suggestions;
  - an AI assistant that gives editorial notes and never writes the author's prose;
  - dictation and read-aloud.
- **Storage.** Under the UI, every book is a set of plain files (`book.yaml`, `manuscript/`, `draft/`, `bible/`, `outline/`, `craft/`, `research/`) that the bookkit CLI also reads.
- **Libraries and shelves.** Each person has a library on their own subdomain (dom.bookkit.net, heidi.bookkit.net, carly.bookkit.net). Books sit on shelves (for example Fiction and Nonfiction), and a shelf carries a house style that its books can inherit. People join a library as reader, editor or co-author, and single books can also be shared or made private.
- **Stack.**
  - Front end: React 18, TypeScript, Vite, Zustand, TipTap/ProseMirror and dnd-kit.
  - Data and auth: Supabase (Postgres with row-level security, auth, realtime). Migrations are in `supabase/migrations/` and are applied with `scripts/migrate-database.mjs`.
  - Server: a single Cloudflare Worker (`worker/index.ts`) that serves the static assets and these APIs:
    - `/api/ai` (Workers AI or the user's own Anthropic or OpenAI key)
    - `/api/voice/transcribe` (Whisper large-v3-turbo)
    - `/api/voice/speak` (Deepgram Aura-2)
    - `/api/sign-in-code` and `/api/sign-in-verify` (Bookkit's own 6-digit email codes)
    - `/api/invite-link`
  - Email is sent with Cloudflare Email Sending.
- **Key code.**
  - App shell and screens: `src/components/studio/*` (Studio shell, ManuscriptView, BiblePages, SceneBoard, SceneCardInline, TimelinePage, BookConfiguration, Dictation, ListenBar), `src/components/Workspace.tsx` (home pages) and `src/components/LibrarySettings.tsx`.
  - Libraries: `src/lib/*`, including `book-model`, `markdown-doc` (a lossless Markdown round trip), `book-url` (routing), `book-config` (book.yaml editing), `policy-blocks` (AI policy sync), `scene-cards`, `timeline`, `entity-section`, `voice-text`, `library-host` and `cookie-storage`.

## 2. Rules you must follow

- **Never write or change manuscript prose.** Books declare `ai_policy: human-authored`: no model writes into `manuscript/`, not even a typo fix. Reference drafts in `draft/` are read-only in the product. Never copy draft prose into a manuscript.
- **Don't touch the real books or accounts.** Do not edit the eight real books or the real accounts (dottenbr@me.com, Heidi, Carly) in the database. Test with throwaway users and throwaway libraries and books, and delete them afterwards. A copy of real content in a throwaway book is fine.
- **Never send email to real people.** Use only addresses you control.
- **Keep secrets server-side.** Secrets live in ignored files (`.env.local`, `.env.server.local`, `.env.author.local`). Never put the Supabase secret key in client code or a `VITE_` variable. Never print secrets in logs or commits.
- **Git.** Commit on a new branch, in small commits with clear messages. Do not push, deploy to production, or apply database migrations without the owner's go-ahead. If you need a migration, add a new numbered file and never edit an applied one.
- **Bookkit stays in sync with the website.** `book.yaml` semantics, the AI policy texts (`policies/*.md`, mirrored by `scripts/sync-bookkit-policies.mjs`) and the policy block sync must stay identical in both repositories. If you change one, change the other, and run both test suites:
  - `npm run test` (Vitest, about 126 tests)
  - `npm run build`
  - `.venv/bin/python tests/test_bookkit.py` (about 157 tests)
- **Verify before you claim.** For every fix, show the failing case before and the passing case after: a test, a measurement or a screenshot.

## 3. Competitive analysis

Use each product hands-on where possible: free tiers, trials or demo videos. Read its docs and recent reviews, and capture screenshots. Compare at least these:

| Group | Products |
|---|---|
| Book-writing apps | Bookmoth, Scrivener, Atticus, Dabble, Reedsy Studio, LivingWriter, Novlr, Ulysses |
| AI-centred writing tools | Novelcrafter, Sudowrite (to learn from them, not to copy prose generation, which Bookkit refuses by design) |
| Planning and worldbuilding | Plottr, Campfire, World Anvil, Aeon Timeline |
| General editors and collaboration | Google Docs, Notion, iA Writer |

For each one, record:
- its core concept and information architecture;
- how it handles a manuscript (one long document or many files), chapters and scenes, and scene cards;
- how it connects writing to the story bible (characters and places) and to the plan;
- timelines;
- collaboration: comments, suggestions, roles and sharing;
- export and publishing formats;
- versioning and history;
- offline use;
- mobile;
- voice: dictation and read-aloud;
- AI features and their policies;
- pricing;
- onboarding, the first five minutes;
- what it does clearly better than Bookkit, and what Bookkit does better.

Deliver a feature matrix (rows: capabilities; columns: products and Bookkit) and a short "what to steal" list ranked by value to a novelist. Respect the human-authored concept: Bookkit's differentiator is that the author writes and the tool organizes, links, reviews and reads back.

## 4. What to check and measure

### Performance and speed
Measure on bookkit.net, and locally with a production build, using the largest book (about 95,000 words and 49 chapters in the draft) on a mid-range phone profile and on desktop.
- **Startup.** Measure Lighthouse and Web Vitals: LCP, INP and CLS, time to first editable chapter, and JS bundle size.
  - The main chunk is over 500 kB, which is a known Vite warning. Split it: TipTap, dnd-kit, `yaml`, `diff` and the docx export should load only where they're used.
- **Opening a book.** `listBookDocuments` loads every file's content at once. Consider loading metadata first and fetching content per section.
- **The manuscript view.** It renders every chapter, mounts a live editor only for the active chapter, and uses static HTML for the rest. Profile:
  - scrolling;
  - switching chapters;
  - entity-link decoration on long texts;
  - the IntersectionObserver scrollspy;
  - the per-scene card widgets (one React root per widget).

  Virtualise if needed.
- **Typing latency.** Measure it in a long chapter with many entity links and comments. Check the 900 ms autosave, the merge path and the IndexedDB draft cache.
- **Server.** Check the `bookkit_workspace()` RPC (about 0.7 s for 8 books because it counts words server-side) and the activity trigger on every save. Suggest caching or materialised word counts.
- **Voice.**
  - Transcription takes about 10–13 s for 15 s of audio because it makes two Whisper calls plus a punctuation pass. Find ways to cut that.
  - Read-aloud: time to first audio, gaps between chunks, and the Cache API cache, which is per data centre (consider R2).
- **AI requests.** Check latency, timeouts and how truncated answers are handled.

### Usability and design
- Run a heuristic review and a cognitive walkthrough of the core journeys:
  - first sign-in by code and by link;
  - create a library and a shelf;
  - create a book;
  - write a chapter from a reference draft;
  - add and edit a character card;
  - edit scene cards inside the chapter;
  - add a timeline event;
  - invite a co-author and see their suggestion;
  - export a docx;
  - dictate a paragraph;
  - listen to a chapter on a phone with the screen locked;
  - switch libraries.
- Check information architecture and naming. The menu bar is Manuscript, Plan, Bible, Craft, Research and Inspiration. Check the contents panel, the side panel tabs and the configuration page.
- Check consistency of components, empty states, loading and error states, and copy, which should be plain, warm and short.
- Mobile: test at 360, 390 and 430 px and on a tablet. Check the two-row top bar, the overlay panels, the toolbar, dialogs, drag and drop on touch, and the read-aloud bar.
- Accessibility: keyboard-only use, focus order, ARIA on menus, dialogs and tabs, screen reader labels, contrast in light and dark modes, reduced motion, and dyslexia-friendly reading options.

### Functionality and reliability
- **Sessions.** Reloads must never sign the user out. The session is a chunked cookie on `.bookkit.net` (`src/lib/cookie-storage.ts`), restored by `restoreSession()`, with `onAuthStateChange` as a safety net. Test with:
  - several tabs on different subdomains;
  - token expiry and refresh;
  - Safari and iOS;
  - old sessions saved in localStorage.

  If something does sign the user out, the sign-in screen shows why.
- **Collaboration.** Two people editing the same chapter: merge conflicts, suggestion mode for editors (only owners write directly; editors suggest), comments on quotes, and realtime updates.
- **Lossless Markdown.** Untouched blocks must be written back byte for byte. Fuzz the round trip with the real books' Markdown: tables, footnotes, front matter, scene breaks (`***`, `* * *`, `---`), nested lists and HTML comments.
- **Scene alignment.** Scene cards are placed after scene breaks, or at `## Scene N` headings when `manuscript.scenes: true`. Check what happens when the count of scenes and cards differs, and the "Begin this scene" flow.
- **Libraries.**
  - Check the row-level security matrix. Reuse and extend `scripts/test-library-access.mjs`, which needs two throwaway users.
  - Check private books, claiming a pending library on first sign-in, invitations, and moving books between shelves and libraries.
  - Check shelf style inheritance writing into `book.yaml` (only books the editor owns get updated).
- **AI policy.** Check that the assistant follows each book's declared policy (`src/lib/policy-blocks.ts`). Try to make it write manuscript prose or ignore the policy.
- **Data safety.** Check that snapshots and restores, chapter reordering and the "Go back to the reference draft" undo are correct under failure.

### Security
- Check the Worker endpoints: auth, same-origin checks, input limits, enumeration resistance, rate limits on sign-in codes (6 digits, 15 minutes, 5 tries), and the invitation authorisation.
- Check RLS policies on every table, including the `security definer` functions.
- XSS: `dangerouslySetInnerHTML` is used in StaticProse and InlineMarkdown, and HTML is built from Markdown and entity links.
- The cookie-stored session is not HttpOnly. Assess the risk and propose mitigations.
- Check secrets handling and that the dependencies are up to date.

## 5. Known issues and open questions to verify and fix

1. **New library addresses.** Libraries other than dom, heidi and carly don't resolve, because there is no wildcard DNS record yet: a proxied AAAA record `*` pointing to `100::`. The worker route `*.bookkit.net/*` already exists. Renaming a library's address breaks it for the same reason. Propose a robust approach, for example a wildcard record, or the Worker creating custom domains through the API.
2. **The `www` redirect** happens in the client (`src/main.tsx`), because static assets are served before the Worker runs. Consider `run_worker_first` or a Cloudflare redirect rule.
3. **Read-aloud highlighting** maps chunks to `.doc-prose > p` by index, which drifts when a chapter contains lists or blockquotes. There is no offline audio download yet, the per-paragraph-group cache isn't persistent, and there is no sleep timer.
4. **Dictation** is capped at 2 minutes per recording, with no continuous mode. The punctuation pass may add paragraph breaks. There is no undo of a whole dictated insertion as one step.
5. **Inline scene-card edits** save directly (owners only); editors can't suggest changes to cards. There is no history for card edits apart from snapshots.
6. **Shelf style changes** reach only books the editor owns; other owners must open their book and apply them.
7. **Activity metrics** started from scratch on 2026-11-09 (saves no longer count). Check that the counting is correct, and decide whether to show words removed and time spent.
8. **The legacy tabbed UI** (`src/components/Layout.tsx` → LegacyLayout, and the legacy tables `chapters`, `characters` and so on) still exists for non-Bookkit projects. Decide whether to migrate those projects and delete the code.
9. **Email deliverability.** bookkit.net has no MX record, so replies to `sign-in@` and `invitations@` bounce. It's a new sending domain, and first emails went to spam. Recommend SPF, DMARC and BIMI, reply handling and warm-up.
10. **Model choice.** The included AI models are Kimi K2.6, GLM 5.3, DeepSeek V4 Pro and gpt-oss-120b on Workers AI. The owner asked where these come from. Assess the trade-offs (quality, data handling, provenance and cost) and recommend a default set.
11. **Inspiration board** (`src/components/Inspiration.tsx`) is legacy UI, styled differently. Bring it into the design system.
12. **Large bundle** (see Performance).
13. **Reference drafts.** Their scene breaks were added automatically. Eight Cold Solder chapters (19, 30, 33, 35, 36, 42, 44 and 49) were placed with medium confidence, because their cards' "Ends on" line disagrees with the card's own "What happens" list. Flag them for the author; don't change them yourself.
14. **Bookkit CLI parity.** `book start N` should optionally lay out a new chapter in its scenes, as the website does in `startChapterContent(..., sceneHeadings)`. Check the new `kind`, `byline` and `style` fields in the CLI's build and lint (for example, derive Vale spelling and quote checks from `style`).
15. **Unpushed work.** All recent work is committed locally on `codex/reliability-hardening` and not pushed. Don't push without approval.

## 6. Deliverables

1. **`docs/review/` report.**
   - The product concept as you understand it, with any inconsistencies.
   - The competitive analysis: the matrix, a "what to steal" list and screenshots.
   - Measured baselines for performance, accessibility and usability, with numbers.
   - A prioritised backlog, P0 to P3, each item with impact, effort and acceptance criteria.
2. **Fixes on a new branch.** Fix P0 and P1 items in small commits, each with tests and a before/after measurement or screenshot. Run `npm run test`, `npm run build` and the bookkit Python tests before every commit.
3. **Proposals instead of changes** for anything that needs the owner's decision: DNS, model choice, pricing, data migration, deleting the legacy UI, or pushing and deploying.
4. **A short final summary.** What changed, what got faster (with numbers), what's still open, and exactly what the owner needs to do: approvals, DNS, and settings in the Cloudflare and Supabase dashboards.

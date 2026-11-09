# Bookkit deployment

Production: https://bookkit.net, Newmatik GmbH Cloudflare account. Worker `thin-place-writer`; Supabase project `eujclkjaaqeoxcodwwxq`.

## Build and deploy

Run `npm ci`, `npm test`, `npm run build`, then `npx wrangler deploy`. Public Supabase settings live in `.env.local` and the Worker configuration. Server credentials and the local author-test credential are ignored, mode-600 files. Never put a Supabase secret key in a Vite environment variable or client bundle.

Apply database migrations with `SUPABASE_DB_HOST=db.eujclkjaaqeoxcodwwxq.supabase.co node --env-file=.env.server.local scripts/migrate-database.mjs`. The runner locks migrations and verifies applied file hashes; never edit an applied migration.

Authentication Site URL is `https://bookkit.net`; allowlisted callbacks are `https://bookkit.net` and `https://bookkit.net/`. Password sign-in was browser tested on the production domain. Custom SMTP is enabled using Newmatik AgentMail (`smtp.agentmail.to:465`, implicit TLS), sender `bookkit <newmatik@agentmail.to>`. The `bookkit-supabase-smtp` key is restricted to Message Send on that inbox and stored encrypted in Supabase. Supabase confirmed the settings update. End-to-end email delivery is awaiting a test. No collaborator invitation emails have been sent by this deployment work.

Both Anthropic and OpenAI are supported under Manage → Configure AI / LLM. Each user enters their own provider key, stored in that browser. The authenticated Worker checks book editing access, attaches the human-authorship policy, bounds context, and refuses incomplete responses. No live provider key has been supplied/tested. AI never has a manuscript insertion action. Companion proposals preserve front matter and stay in preview until explicitly applied. Changed files invalidate old AI previews. Accepted collaborator suggestions and combined structural edits are checked against Bookkit before saving.

## Editing and review

Books open in the Studio: a continuous, Google-Docs-style manuscript with linked bible entries, chapter plans, scene cards and comments (see CLAUDE.md). Files remain the storage format; the visual editor writes untouched Markdown blocks back byte-for-byte (verified against all 606 Markdown files of the eight source books), and pages it cannot represent exactly open as Markdown. The author edits the canonical text with autosave. Editors and co-authors autosave tracked suggestions; only the author may accept or reject them. Viewers may comment. RLS and transactional RPCs enforce this independently of the UI. Snapshot restore is author-only.

Saved text, suggestions and discussions update through Supabase Realtime; reconnect/focus refresh and a fallback refresh catch missed events. Non-overlapping concurrent author edits merge. Overlapping edits remain in the browser with a comparison/resolution flow. IndexedDB retains failed-save drafts across reloads. This is autosaved collaboration, not a character-by-character shared-cursor editor.

Threads support replies, quoted passages, suggestion discussions, resolve/reopen, and attachments. The author or thread creator may resolve/reopen a thread. Comments stay separate from manuscript text and survive file-version restoration. Source ZIP export contains book files, not collaboration history; that history remains in Supabase.

## Source preservation

All eight source books were imported, including original paths, raw Markdown/YAML, reference drafts, attachments and executable modes. Reference drafts remain read-only and never become author prose. All eight cloud exports were compared to the source tree by path, byte checksum, size and Unix mode. Verification archives are in `/tmp/writer-verified-exports`.

Bookkit ZIP import preserves text, binaries, empty directories and permissions, validates structure, chunks large files, and rolls back failures. Full-file snapshots preserve text revisions, asset manifests and file modes; historical text-only snapshots retain current attachments on restore. Referenced storage chunks cannot be deleted through ordinary authenticated APIs.

For publication output, export the ZIP and build with Bookkit locally. The web app does not reproduce Bookkit’s Pandoc/Tectonic DOCX/EPUB/PDF pipeline in the browser.

## Verification

- `npm test`: parser, archives, three-way merge, AI policy/auth/truncation, dependency regression and existing editor tests.
- `node --env-file=.env.server.local scripts/verification/bookkit-collaboration-browser.mjs`: isolated real browser sessions, autosave/live suggestions, replies/resolution, accept/reject, concurrent merge/conflict, failed-save recovery, attachment/viewer comments, API restrictions. Creates and removes disposable users/project.
- `scripts/verification/collaboration.mjs`, `bookkit-snapshots.mjs`, and `bookkit-asset-snapshots.mjs`: live access and restoration checks with disposable records.
- `scripts/verification/bookkit-roundtrip.ts`: streamed ZIP import/export and rollback checks.
- `scripts/verification/export-all-books.ts` plus `compare-book-archive.py`: complete source roundtrip.

`npm audit` still reports 29 moderate entries from the TipTap advisory range. Installed `@tiptap/core` 2.27.3 includes the prototype-setter fix; a regression test verifies the installed helper does not inherit attacker attributes. Do not represent the npm audit result as zero findings.

## Studio release (2026-11-08)

Deployed version `8a237c76-9eea-4706-b974-214c2b184e8f` and later. The product is named Bookkit throughout (package, desktop identifier `com.bookkit.app`, page title). The Cloudflare Worker keeps its original name `thin-place-writer` so the bookkit.net custom domain is not interrupted.

Brief (stored in the project's brief fields) and the Inspiration board (Supabase `inspiration` bucket) are part of the Studio. Exports: Word reading copy, single-file Markdown / plain text, and the Bookkit ZIP. Production check on version `24d53043-f560-41b2-987c-efebefe16ed2`: anonymous `/api/ai` returns 401; an authenticated request with a deliberately invalid key reaches both Anthropic and OpenAI and returns their authentication errors. A real generation still needs a valid provider key.

Chapter reordering (Plan → List, drag ⠿ or keyboard) is owner-only. `src/lib/reorder.ts` plans one consistent edit: file numbers, `chapter:` front matter, `# Chapter N` headings, scene-card files, outline sections and every `Ch. N` anchor in bible/outline/craft/research. `applyBookReorder` refuses while moved chapters have open comments or suggestions, captures a "Before reordering chapters" snapshot, and restores it automatically if any write fails. In parts layouts chapters move only within their part. Verified on version `beec8cd1-f095-488d-adfa-fbb75f2615c3` with a disposable book and as a dry run against Cold Solder and Words Given sources.

## Included AI and invitation links (version `b2591fdf-b1d6-4d7b-a293-55d99d17e618`)

- **AI without a key.** The Worker has a Workers AI binding (`"ai": { "binding": "AI" }` in `wrangler.jsonc`). Provider `bookkit` offers Kimi K2.6 (default), GLM 5.3, DeepSeek V4 Pro and gpt-oss 120B, with the same session check, book-access check, authorship policy and truncation refusal as the key-based providers, and a 90,000-character request limit. When a selected Anthropic/OpenAI provider has no key, requests fall back to the included model. Verified live: all four models returned editorial notes through `/api/ai`, and the Assist panel produced notes on Cold Solder chapter 1 (read-only request).
- **Invitations without SMTP.** `POST /api/invite-link` (owner only, invited emails only, same-origin) uses the Worker secret `SUPABASE_SECRET_KEY` to call `auth/v1/admin/generate_link` and returns a one-time sign-in link (nothing is emailed unless the owner chooses "Email invitation"). Owners use "Copy sign-in link" next to a pending member in Share; invitees open it, are signed in with a confirmed email, invitations are accepted, and they can "Set password" from the account menu. Verified live with a disposable invitee (link sign-in, book access as editor, password set, password sign-in) and guard checks (401 anonymous, 403 cross-origin, 404 uninvited, 400 bad input); test records removed. Owners can also press "Email invitation": the Worker sends the sign-in link from `invitations@bookkit.net` (reply-to the owner) through Cloudflare Email Sending (`send_email` binding `EMAIL`; bookkit.net onboarded with SPF/DKIM/DMARC on `cf-bounce` / `_dmarc`). Delivery was verified on 2026-11-08 by temporarily routing `qa-inbox@bookkit.net` to the Worker and seeing the invitation arrive; that routing rule, its MX records and the test-only inbound handler were removed afterwards. The sign-in page's "Email me a sign-in code" (also the forgot-password path) goes through `POST /api/sign-in-code` (the old `/api/sign-in-link` path is an alias), sent from `sign-in@bookkit.net`: same answer for unknown emails, no account creation, one code per account per minute (tracked in `app_metadata.bookkit_link_sent_at`). The email carries only the 8-digit `email_otp` from `generate_link` (no link); "I have a code" on the sign-in page calls `supabase.auth.verifyOtp({type:'email'})`, which accepts codes from both magic-link and invite generation. Invitation emails carry the button and the same kind of code. All emails share the branded `bookkitEmail()` template in `worker/index.ts` (HTML tables with inline styles, plus a plain-text twin). Code sign-in verified live on version `06f17a25-664e-46e4-8b1a-5cb1edefd6aa` with a disposable account (removed afterwards). Supabase's built-in mailer is no longer used by the app.

**Deliverability.** bookkit.net is a new sending domain, so first messages can land in spam until recipients mark them "Not spam". DKIM signs as bookkit.net and DMARC is `p=reject`. The root domain has no MX record, so replies to `sign-in@` / `invitations@` can't be delivered; adding Email Routing for the root (forwarding to a real inbox) would let the sending domain receive mail, which some filters check.

## Branding and sign-in layout

The public product name is `bookkit`, including the browser title, sign-in screen, app header and settings copy. Sign-in actions share a full-width, 44px-minimum button style, with distinct loading states and an accessible error message. Deployed version `8e17512c-5fdf-4988-ab8c-cd8b2a67610b` passed desktop (1440px) and mobile (375px) layout checks and a real author password sign-in. The build and all 48 tests passed. SMTP is enabled with Newmatik AgentMail; a delivery test is pending.

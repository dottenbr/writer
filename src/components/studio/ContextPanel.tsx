import { useEffect, useMemo, useRef, useState } from "react";
import { diffWordsWithSpace } from "diff";
import { useBookStore } from "../../store/useBookStore";
import { useEditorBus } from "./editorBus";
import { chapterForPath, Icon, KIND_LABEL, useAccess, useEntityMatcher, initials } from "./common";
import { renderMarkdown, splitDocument, markdownToPlain } from "../../lib/markdown-doc";
import { citedChapters, mentionsIn, sections, type ChapterInfo, type Entity } from "../../lib/book-model";
import { createThread, replyThread, resolveThread, decideSuggestion, type Suggestion } from "../../lib/bookkit-collaboration";
import { completeText, effectiveProvider } from "../../lib/llm-service";
import { useProjectStore } from "../../store/useProjectStore";

function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className={`md ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html.replace(/<div data-raw-md="([^"]*)"><\/div>/g, '<pre class="raw-md">$1</pre>') }} />;
}

function EntityCard({ entity, onClose }: { entity: Entity; onClose?: () => void }) {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const matcher = useEntityMatcher();
  const appears = useMemo(() => model.chapters.filter(c => {
    const text = files.find(f => f.path === c.currentPath)?.content ?? "";
    return mentionsIn(markdownToPlain(text), matcher).has(entity.id);
  }), [model, files, matcher, entity.id]);
  return (
    <article className="entity-card">
      <div className="entity-card-head">
        <span className={`entity-kind ${entity.kind}`}>{KIND_LABEL[entity.kind]}</span>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button>}
      </div>
      <h3>{entity.name}</h3>
      <Markdown text={entity.markdown.split(/\n(?=- \*\*)/).slice(0, 4).join("\n")} className="entity-body" />
      <div className="entity-actions">
        <button className="link-btn" onClick={() => go(entity.path, { anchor: entity.slug })}>Open full entry →</button>
      </div>
      {appears.length > 0 && (
        <div className="appears">
          <div className="panel-label">Appears in {appears.length} chapter{appears.length === 1 ? "" : "s"}</div>
          <div className="chip-row">
            {appears.map(c => <button key={c.number} className="chip" title={c.label} onClick={() => go(c.authorPath ?? c.currentPath, { find: entity.aliases[0] })}>{c.number}</button>)}
          </div>
        </div>
      )}
    </article>
  );
}

function ChapterContext({ chapter }: { chapter: ChapterInfo }) {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const selectEntity = useBookStore(s => s.selectEntity);
  const matcher = useEntityMatcher();
  const scenes = useMemo(() => {
    const f = chapter.scenesPath ? files.find(x => x.path === chapter.scenesPath) : undefined;
    return f ? sections(splitDocument(f.content).body, 2) : [];
  }, [files, chapter.scenesPath]);
  const mentions = useMemo(() => {
    const text = markdownToPlain(files.find(f => f.path === chapter.currentPath)?.content ?? "");
    const m = mentionsIn(text, matcher);
    return [...m.entries()].map(([id, n]) => ({ entity: model.entities.find(e => e.id === id)!, n })).filter(x => x.entity).sort((a, b) => b.n - a.n);
  }, [files, chapter.currentPath, matcher, model.entities]);
  const citedBy = useMemo(() => model.companions.filter(d => d.group !== "research" && !d.isAsset).map(d => {
    const content = files.find(f => f.path === d.path)?.content ?? "";
    return { doc: d, hit: citedChapters(content).includes(chapter.number) };
  }).filter(x => x.hit).map(x => x.doc), [model, files, chapter.number]);
  const [openScene, setOpenScene] = useState<number | null>(null);

  return (
    <div className="panel-stack">
      {chapter.outline ? (
        <section className="panel-block">
          <div className="panel-label-row">
            <span className="panel-label">Chapter plan</span>
            <button className="link-btn" onClick={() => go("outline/chapters.md", { anchor: slugHead(model, chapter) })}>Edit in outline</button>
          </div>
          <Markdown text={chapter.outline} className="plan-md" />
        </section>
      ) : (
        <section className="panel-block muted-block">No plan for this chapter yet. Add a <em>{chapter.number}. {chapter.title}</em> section to the chapter outline.</section>
      )}
      {scenes.length > 0 && (
        <section className="panel-block">
          <div className="panel-label-row">
            <span className="panel-label">Scene cards · {scenes.length}</span>
            <button className="link-btn" onClick={() => go(chapter.scenesPath!)}>Open cards</button>
          </div>
          <div className="scene-list">
            {scenes.map((s, i) => (
              <div key={i} className={`scene-card ${openScene === i ? "open" : ""}`}>
                <button className="scene-card-head" onClick={() => setOpenScene(openScene === i ? null : i)}>
                  <span className="scene-num">{i + 1}</span>
                  <span>{s.heading.replace(/^Scene\s+\d+\s*[–—-]\s*/i, "")}</span>
                </button>
                {openScene === i ? <Markdown text={s.text} className="scene-md" /> : (
                  <p className="scene-purpose">{(s.text.match(/\*\*Purpose:\*\*\s*(.+)/)?.[1] ?? "").replace(/[*_]/g, "")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {mentions.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">In this chapter</div>
          <div className="mention-list">
            {mentions.map(({ entity, n }) => (
              <button key={entity.id} className="mention" onClick={() => selectEntity(entity.id)}>
                <span className={`mention-avatar ${entity.kind}`}>{initials(entity.name)}</span>
                <span className="mention-name">{entity.name}</span>
                <span className="mention-count">{n}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {citedBy.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Referenced in</div>
          <div className="ref-list">
            {citedBy.map(d => (
              <button key={d.path} className="ref-item" onClick={() => go(d.path, { find: `Ch. ${chapter.number}` })}>
                <Icon name="link" size={13} /> {d.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function slugHead(model: { chapters: ChapterInfo[] }, c: ChapterInfo) {
  void model;
  return `${c.number}-${c.title}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[“”"'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function DocContext({ path }: { path: string }) {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const selectEntity = useBookStore(s => s.selectEntity);
  const matcher = useEntityMatcher();
  const full = files.find(f => f.path === path)?.content ?? "";
  const content = full.length > 400_000 ? "" : full;
  const cited = useMemo(() => citedChapters(content).sort((a, b) => a - b).map(n => model.chapters.find(c => c.number === n)).filter(Boolean) as ChapterInfo[], [content, model]);
  const mentions = useMemo(() => {
    const m = mentionsIn(markdownToPlain(content), matcher);
    return [...m.entries()].map(([id, n]) => ({ entity: model.entities.find(e => e.id === id)!, n })).filter(x => x.entity && x.entity.path !== path).sort((a, b) => b.n - a.n).slice(0, 24);
  }, [content, matcher, model.entities, path]);
  const own = model.entities.filter(e => e.path === path);
  return (
    <div className="panel-stack">
      {own.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Entries on this page</div>
          <div className="mention-list">
            {own.map(e => (
              <button key={e.id} className="mention" onClick={() => { go(path, { anchor: e.slug }); selectEntity(e.id); }}>
                <span className={`mention-avatar ${e.kind}`}>{initials(e.name)}</span><span className="mention-name">{e.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {cited.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Chapters cited</div>
          <div className="chip-row">
            {cited.map(c => <button key={c.number} className="chip" title={c.label} onClick={() => go(c.authorPath ?? c.currentPath)}>{c.number}</button>)}
          </div>
        </section>
      )}
      {mentions.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Mentioned here</div>
          <div className="mention-list">
            {mentions.map(({ entity, n }) => (
              <button key={entity.id} className="mention" onClick={() => selectEntity(entity.id)}>
                <span className={`mention-avatar ${entity.kind}`}>{initials(entity.name)}</span><span className="mention-name">{entity.name}</span><span className="mention-count">{n}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {!own.length && !cited.length && !mentions.length && <section className="panel-block muted-block">No links found on this page yet. Names from the story bible and chapter references like <em>Ch. 3</em> become links automatically.</section>}
    </div>
  );
}

function DraftTab({ chapter }: { chapter: ChapterInfo }) {
  const text = useBookStore(s => s.files.find(f => f.path === chapter.referencePath)?.content ?? "");
  return (
    <div className="panel-stack">
      <div className="panel-note">Reference draft for chapter {chapter.number}. Read it alongside; your chapter is your own words.</div>
      <Markdown text={splitDocument(text).body.replace(/^# .*\n/, "")} className="draft-md" />
    </div>
  );
}

function Changes({ before, after }: { before: string; after: string }) {
  const pieces = useMemo(() => {
    const a = splitDocument(before), b = splitDocument(after);
    // Show the prose; mention metadata only when it changed.
    const same = a.frontMatter === b.frontMatter && a.titleBlock === b.titleBlock;
    return diffWordsWithSpace(same ? a.body : before, same ? b.body : after, { timeout: 250 });
  }, [before, after]);
  if (!pieces) return <p className="muted">This change is too large to show inline.</p>;
  // show only the changed neighbourhoods
  return (
    <div className="tracked-diff">
      {pieces.map((p, i) => p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value.length > 240 ? p.value.slice(0, 100) + " … " + p.value.slice(-100) : p.value}</span>)}
    </div>
  );
}

function CommentsTab({ path }: { path: string }) {
  const { projectId, userId, isOwner, role } = useAccess();
  const review = useBookStore(s => s.reviews[path]);
  const loadReview = useBookStore(s => s.loadReview);
  const refreshCounts = useBookStore(s => s.refreshReviewCounts);
  const session = useEditorBus(s => s.session);
  const commentQuote = useEditorBus(s => s.commentQuote);
  const selection = useEditorBus(s => s.selection);
  const go = useBookStore(s => s.go);
  const setActiveThread = useBookStore(s => s.setActiveThread);
  const activeThread = useBookStore(s => s.activeThread);
  const storageKey = JSON.stringify(["writer-comment-draft", userId, projectId, path]);
  const [body, setBody] = useState(() => { try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; } });
  const [quote, setQuote] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const [discussing, setDiscussing] = useState<string | null>(null);

  useEffect(() => { void loadReview(path).catch(() => {}); }, [path, loadReview]);
  useEffect(() => { try { if (body) localStorage.setItem(storageKey, body); else localStorage.removeItem(storageKey); } catch { /* ignore */ } }, [storageKey, body]);
  const mountedNonce = useRef(commentQuote && Date.now() - commentQuote.at > 1500 ? commentQuote.nonce : 0);
  useEffect(() => {
    if (!commentQuote || commentQuote.nonce <= mountedNonce.current) return;
    mountedNonce.current = commentQuote.nonce;
    setQuote(commentQuote.text);
    setTimeout(() => composer.current?.focus(), 50);
  }, [commentQuote]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); await loadReview(path); await refreshCounts(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const threads = (review?.threads ?? []).filter(t => showResolved || !t.resolved_at);
  const suggestions = (review?.suggestions ?? []).filter(s => s.status === "pending");
  const name = (p?: { display_name: string; email: string }) => p?.display_name || p?.email || "Collaborator";

  return (
    <div className="panel-stack comments">
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="composer">
        {quote && <blockquote className="composer-quote">{quote}<button className="icon-btn" onClick={() => setQuote("")} aria-label="Remove quote"><Icon name="close" size={12} /></button></blockquote>}
        {!quote && selection && <button className="link-btn" onClick={() => setQuote(selection)}>Quote the selected text</button>}
        {discussing && <div className="panel-note">Discussing a suggestion <button className="link-btn" onClick={() => setDiscussing(null)}>Cancel</button></div>}
        <textarea ref={composer} value={body} maxLength={20000} onChange={e => setBody(e.target.value)} placeholder={role === "viewer" ? "Leave a comment for the author" : "Add a comment…"} aria-label="New comment" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }} />
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim() || !projectId} onClick={() => void act(async () => {
          const raw = session?.text ?? "";
          const start = quote ? raw.indexOf(quote) : -1;
          await createThread(projectId!, path, body, discussing ? "" : quote, discussing || start < 0 ? null : start, session?.row?.revision_id ?? null, discussing);
          setBody(""); setQuote(""); setDiscussing(null);
        })}>Comment</button>
      </section>

      {suggestions.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Suggested edits · {suggestions.length}</div>
          {suggestions.map((s: Suggestion) => (
            <article key={s.id} className="thread suggestion">
              <div className="thread-head"><span className="avatar">{initials(name(s.profiles))}</span><strong>{name(s.profiles)}</strong><time>{new Date(s.updated_at).toLocaleDateString()}</time></div>
              <Changes before={s.base?.content ?? ""} after={s.proposed_content} />
              <div className="thread-actions">
                {isOwner && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act(() => decideSuggestion(s, "accepted"))}>Accept</button>}
                {isOwner && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => decideSuggestion(s, "rejected"))}>Reject</button>}
                <button className="link-btn" onClick={() => { setDiscussing(s.id); composer.current?.focus(); }}>Discuss</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="panel-block">
        <div className="panel-label-row">
          <span className="panel-label">Conversations · {(review?.threads ?? []).filter(t => !t.resolved_at).length} open</span>
          <label className="toggle-label"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Resolved</label>
        </div>
        {!review && <div className="muted">Loading…</div>}
        {review && threads.length === 0 && <div className="muted empty-comments">No comments yet. Select text in the page and press Comment.</div>}
        {threads.map(t => (
          <article key={t.id} className={`thread ${t.resolved_at ? "resolved" : ""} ${activeThread === t.id ? "active" : ""}`} onMouseEnter={() => setActiveThread(t.id)} onMouseLeave={() => setActiveThread(undefined)}>
            {t.quoted_text && <button className="thread-quote" onClick={() => go(path, { find: t.quoted_text.slice(0, 120) })}>{t.quoted_text}</button>}
            {t.suggestion_id && <div className="panel-note">On a suggested edit</div>}
            {t.bookkit_messages.map(m => (
              <div key={m.id} className="thread-msg">
                <div className="thread-head"><span className="avatar">{initials(name(m.profiles))}</span><strong>{name(m.profiles)}</strong><time>{new Date(m.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div>
                <p>{m.body}</p>
              </div>
            ))}
            {!t.resolved_at && (
              <div className="reply-row">
                <input value={replies[t.id] ?? ""} placeholder="Reply…" aria-label="Reply" onChange={e => setReplies(v => ({ ...v, [t.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter" && replies[t.id]?.trim()) void act(async () => { await replyThread(t.id, replies[t.id]); setReplies(v => ({ ...v, [t.id]: "" })); }); }} />
              </div>
            )}
            <div className="thread-actions">
              {(isOwner || t.author_id === userId) && <button className="link-btn" disabled={busy} onClick={() => void act(() => resolveThread(t.id, !t.resolved_at))}>{t.resolved_at ? "Reopen" : "Resolve"}</button>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function AssistTab({ path, chapter }: { path: string; chapter?: ChapterInfo }) {
  const { canEdit } = useAccess();
  const llm = useProjectStore(s => s.llmSettings);
  const setShowApiSettings = useProjectStore(s => s.setShowApiSettings);
  const session = useEditorBus(s => s.session);
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const [request, setRequest] = useState("");
  const [context, setContext] = useState("none");
  const [result, setResult] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const companion = /^(bible|outline|craft)\//.test(path);
  const selection = useEditorBus(s => s.selection);
  const [focusText, setFocusText] = useState("");
  useEffect(() => { if (selection.trim().length > 20) setFocusText(selection.trim()); }, [selection]);
  const hasKey = true; // the included model needs no key; your own key is used when set
  const using = effectiveProvider(llm);

  async function ask() {
    const draft = session?.text ?? files.find(f => f.path === path)?.content ?? "";
    setBusy(true); setError(""); setResult("");
    try {
      if (companion && draft.length > 48000) throw new Error("This page is too large for a full proposal. Ask for notes instead, or split it.");
      const ctx = model.chapters.filter(c => context === "all" || String(c.number) === context).map(c => `Chapter ${c.number} (${c.currentSource}):\n${splitDocument(files.find(f => f.path === c.currentPath)?.content ?? "").body}`).join("\n\n");
      const prompt = companion
        ? `Update this companion document according to the request. Return only the complete Markdown document. Preserve front matter byte-for-byte and checked dates; never claim a check you have not performed. Included manuscript context is authoritative. If no chapters are included, do not infer manuscript facts or claim a continuity review. Do not write manuscript prose.\nRequest: ${request}\nPath: ${path}\nDocument:\n${draft}\nManuscript context:\n${context === "none" ? "" : ctx}`
        : `Give quality and editorial notes only, with anchors and suggested changes described in words. Never write replacement manuscript prose.${focusText ? `\nFocus your notes on this selected passage, using the rest of the text as context:\n"""${focusText}"""` : ""}\nRequest: ${request}\nPath: ${path}\nText:\n${draft}`;
      const proposal = await completeText(prompt, llm, { mode: companion ? "companion" : "review", path });
      if (companion && draft.startsWith("---")) {
        const fm = draft.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
        if (fm && !proposal.startsWith(fm)) throw new Error("The proposal changed the page’s metadata, so nothing was applied. Ask again.");
      }
      setBase(draft); setResult(proposal);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="panel-stack">
      <div className="panel-note policy-note"><Icon name="sparkle" size={13} /> Human-authored book. The assistant gives editorial notes and can update plan and bible pages. It never writes your prose.</div>
      <div className="assist-provider">Using {using.provider === "bookkit" ? "the model included with Bookkit" : using.provider === "anthropic" ? "your Anthropic key" : "your OpenAI key"} · <button className="link-btn" onClick={() => setShowApiSettings(true)}>Change</button></div>
      {!companion && focusText && (
        <div className="assist-focus">
          <span className="assist-focus-label">Notes on selection</span>
          <span className="assist-focus-text">{focusText}</span>
          <button className="icon-btn" aria-label="Use the whole chapter" onClick={() => setFocusText("")}><Icon name="close" size={12} /></button>
        </div>
      )}
      <textarea className="assist-input" value={request} onChange={e => setRequest(e.target.value)} placeholder={chapter ? "What should the notes focus on? e.g. pacing in the second scene" : companion ? "What should change on this page?" : "What should the notes focus on?"} aria-label="Request" />
      {companion && (
        <label className="assist-context">Chapters to consult
          <select value={context} onChange={e => setContext(e.target.value)}>
            <option value="none">None, this page only</option>
            <option value="all">All chapters</option>
            {model.chapters.map(c => <option key={c.number} value={String(c.number)}>{c.label}</option>)}
          </select>
        </label>
      )}
      <button className="btn btn-primary btn-sm" disabled={busy || !request.trim() || !canEdit || !hasKey} onClick={() => void ask()}>{busy ? "Thinking…" : companion ? "Propose an update" : "Get editorial notes"}</button>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {result && (
        <div className="assist-result">
          {companion ? <Changes before={base} after={result} /> : <Markdown text={result} />}
          {companion && canEdit && (
            <button className="btn btn-sm btn-primary" onClick={() => {
              if (!session || session.text !== base) { setError("This page changed after the proposal. Ask again."); return; }
              session.setText(result);
              setResult("");
              useEditorBus.getState().editor?.commands.blur();
              window.dispatchEvent(new Event("bookkit-reload-doc"));
            }}>Apply to this page</button>
          )}
        </div>
      )}
    </div>
  );
}

function BookContext() {
  const model = useBookStore(s => s.model)!;
  const go = useBookStore(s => s.go);
  const openThreads = useBookStore(s => s.openThreads);
  const pending = useBookStore(s => s.pendingSuggestions);
  const titleFor = (path: string) => {
    const c = chapterForPath(model.chapters, path);
    return c ? c.label : model.companions.find(d => d.path === path)?.title ?? path.split("/").pop();
  };
  const conversations = [...new Set([...Object.keys(openThreads), ...Object.keys(pending)])].map(path => ({ path, n: (openThreads[path] ?? 0) + (pending[path] ?? 0) })).sort((a, b) => b.n - a.n);
  const quick = ["bible/book-on-one-page.md", "bible/characters.md", "outline/chapters.md", "outline/open-questions.md", "craft/style-guide.md"].map(p => model.companions.find(d => d.path === p)).filter(Boolean) as Array<{ path: string; title: string }>;
  const written = model.chapters.filter(c => c.authorPath && !c.started).length;
  const progress = model.chapters.filter(c => c.started).length;
  return (
    <div className="panel-stack">
      <section className="panel-block">
        <div className="panel-label">Progress</div>
        <div className="progress-rows">
          <div><span className="status-dot written" /> Written <strong>{written}</strong></div>
          <div><span className="status-dot progress" /> In progress <strong>{progress}</strong></div>
          <div><span className="status-dot" /> {model.hasDraft ? "Draft only" : "Not started"} <strong>{model.chapters.length - written - progress}</strong></div>
        </div>
      </section>
      <section className="panel-block">
        <div className="panel-label">Open conversations</div>
        {conversations.length ? (
          <div className="ref-list">
            {conversations.map(c => <button key={c.path} className="ref-item" onClick={() => { go(c.path); useBookStore.getState().setPanel("comments"); }}><Icon name="comment" size={13} /> <span className="ref-text">{titleFor(c.path)}</span><span className="nav-badge">{c.n}</span></button>)}
          </div>
        ) : <div className="muted">No open comments or suggestions.</div>}
      </section>
      {quick.length > 0 && (
        <section className="panel-block">
          <div className="panel-label">Keep close</div>
          <div className="ref-list">
            {quick.map(d => <button key={d.path} className="ref-item" onClick={() => go(d.path)}><Icon name="file" size={13} /> {d.title}</button>)}
          </div>
        </section>
      )}
    </div>
  );
}

export function ContextPanel() {
  const location = useBookStore(s => s.location);
  const view = useBookStore(s => s.view);
  const model = useBookStore(s => s.model);
  const panel = useBookStore(s => s.panel);
  const setPanel = useBookStore(s => s.setPanel);
  const visible = useBookStore(s => s.visibleChapter);
  const selectedEntity = useBookStore(s => s.selectedEntity);
  const selectEntity = useBookStore(s => s.selectEntity);
  const session = useEditorBus(s => s.session);
  const openThreads = useBookStore(s => s.openThreads);
  const pending = useBookStore(s => s.pendingSuggestions);
  if (!model || view !== "write") return null;

  const inManuscript = location.path === "" || location.path.startsWith("@") || !!chapterForPath(model.chapters, location.path);
  const activePath = session?.path ?? null;
  const chapter = inManuscript && !location.path.startsWith("@") ? (chapterForPath(model.chapters, activePath ?? "") ?? model.chapters.find(c => c.number === visible) ?? chapterForPath(model.chapters, location.path)) : undefined;
  const path = inManuscript ? (chapter ? chapter.authorPath ?? chapter.currentPath : "") : location.path;
  const entity = selectedEntity ? model.entities.find(e => e.id === selectedEntity) : undefined;
  const hasDraft = !!chapter?.authorPath && !!chapter.referencePath;
  const count = (openThreads[path] ?? 0) + (pending[path] ?? 0);
  const tabs = [
    { id: "context", label: chapter ? "Chapter" : path ? "Links" : "Book" },
    ...(hasDraft ? [{ id: "draft", label: "Draft" }] : []),
    ...(path ? [{ id: "comments", label: "Comments", badge: count }, { id: "assist", label: "Assist" }] : []),
  ];
  const tab = tabs.some(t => t.id === panel) ? panel : "context";

  return (
    <aside className="context-panel" aria-label="Context">
      <div className="panel-tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`panel-tab ${tab === t.id ? "on" : ""}`} onClick={() => setPanel(t.id)}>
            {t.label}{t.badge ? <span className="tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="panel-title">{chapter ? chapter.label : model.companions.find(d => d.path === path)?.title ?? model.title}</div>
      <div className="panel-scroll">
        {entity && tab === "context" && <EntityCard entity={entity} onClose={() => selectEntity(null)} />}
        {tab === "context" && (chapter ? <ChapterContext chapter={chapter} /> : path ? <DocContext path={path} /> : <BookContext />)}
        {tab === "draft" && chapter && <DraftTab chapter={chapter} />}
        {tab === "comments" && path && <CommentsTab key={path} path={path} />}
        {tab === "assist" && path && <AssistTab key={path} path={path} chapter={chapter} />}
      </div>
    </aside>
  );
}

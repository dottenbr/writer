import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readBookDocument, type BookDocumentRow } from "../../lib/supabase-service";
import { readBookReview, saveMergedDocument, saveSuggestion, type Suggestion } from "../../lib/bookkit-collaboration";
import { clearLocalDraft, draftKey, readLocalDraft, writeLocalDraft } from "../../lib/bookkit-draft-cache";
import { mergeBookText } from "../../lib/bookkit-merge";
import { parseBookkit } from "../../lib/bookkit";
import { useBookStore } from "../../store/useBookStore";

export type SaveState = "loading" | "idle" | "dirty" | "saving" | "saved" | "error";

export interface DocSession {
  path: string | null;
  row: BookDocumentRow | null;
  text: string;
  /** Increments whenever text was replaced from outside the editor. */
  reloadKey: number;
  state: SaveState;
  error: string;
  notice: string;
  conflict: BookDocumentRow | null;
  suggestion: Suggestion | undefined;
  setText: (next: string) => void;
  saveNow: () => Promise<void>;
  keepMine: () => void;
  useLatest: () => void;
}

interface Options {
  projectId: string | null;
  userId: string;
  editable: boolean;
  suggesting: boolean;
}

/** Validate changes that affect the book's structure before they are saved. */
function validateStructure(path: string, content: string) {
  const { files, model } = useBookStore.getState();
  if (!model) return;
  const structural = path === "book.yaml" || path.startsWith(model.manuscriptDir + "/") || (!!model.draftDir && path.startsWith(model.draftDir + "/"));
  if (!structural) return;
  parseBookkit(Object.fromEntries(files.filter(f => !f.asset && f.loaded).map(f => [f.path, f.path === path ? content : f.content])));
}

/** The document as the book already has it in memory, when it is complete. */
function knownRow(path: string | null, projectId: string | null): BookDocumentRow | undefined {
  if (!path || !projectId) return undefined;
  const store = useBookStore.getState();
  if (store.projectId !== projectId) return undefined;
  return store.files.find(f => f.path === path && f.loaded && !f.asset);
}

export function useDocSession(path: string | null, { projectId, userId, editable, suggesting }: Options): DocSession {
  const initial = suggesting ? undefined : knownRow(path, projectId);
  const [row, setRow] = useState<BookDocumentRow | null>(initial ?? null);
  const [text, setTextState] = useState(initial?.content ?? "");
  const [saved, setSaved] = useState(initial?.content ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<SaveState>(initial ? "idle" : "loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<BookDocumentRow | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>();
  const live = useRef({ path, text, saved, row, suggestion, saving: false, editable, suggesting, projectId });
  live.current = { ...live.current, path, text, saved, row, suggestion, editable, suggesting, projectId };
  const storeRow = useBookStore(s => (path ? s.files.find(f => f.path === path) : undefined));

  const replace = useCallback((value: string) => {
    setTextState(value);
    setReloadKey(k => k + 1);
  }, []);

  // Load the document whenever the path changes.
  useEffect(() => {
    let active = true;
    setError(""); setNotice(""); setConflict(null); setSuggestion(undefined);
    if (!path || !projectId) { setRow(null); setTextState(""); setSaved(""); setState("idle"); return; }
    const known = suggesting ? undefined : knownRow(path, projectId);
    if (known) {
      // Open from memory at once; realtime and a quiet re-check keep it current.
      setRow(known); setSaved(known.content);
      if (live.current.text !== known.content) replace(known.content);
      setState("idle");
      (async () => {
        const cached = editable ? await readLocalDraft(draftKey(userId, projectId, path)).catch(() => undefined) : undefined;
        if (!active) return;
        if (cached && cached.content !== known.content) {
          setRow(cached.base); setSuggestion(cached.suggestion); replace(cached.content); setState("dirty");
          setNotice("Recovered unsaved changes from this browser.");
        }
        void useBookStore.getState().refreshPath(path);
      })();
      return () => { active = false; };
    }
    setRow(null); setTextState(""); setSaved("");
    setState("loading");
    (async () => {
      const [loaded, review] = await Promise.all([
        readBookDocument(projectId, path),
        suggesting ? readBookReview(projectId, path) : Promise.resolve({ suggestions: [] as Suggestion[], threads: [] }),
      ]);
      if (!active) return;
      useBookStore.getState().upsert(loaded);
      const pending = review.suggestions.find(s => s.author_id === userId && s.status === "pending");
      const value = suggesting && pending ? pending.proposed_content : loaded.content;
      const cached = await readLocalDraft(draftKey(userId, projectId, path)).catch(() => undefined);
      if (!active) return;
      const recover = cached && cached.content !== value && editable ? cached : undefined;
      setRow(recover?.base ?? loaded);
      setSuggestion(recover?.suggestion ?? pending);
      setSaved(value);
      replace(recover?.content ?? value);
      setState(recover ? "dirty" : "idle");
      if (recover) setNotice("Recovered unsaved changes from this browser.");
    })().catch(e => { if (active) { setError((e as Error).message); setState("error"); } });
    return () => { active = false; };
  }, [path, projectId, userId, suggesting, editable, replace]);

  const save = useCallback(async () => {
    const cur = live.current;
    if (!cur.projectId || !cur.path || !cur.row || !cur.editable || cur.saving || cur.text === cur.saved) return;
    const target = cur.path, submitted = cur.text, base = cur.row;
    live.current.saving = true;
    setState("saving"); setError("");
    try {
      validateStructure(target, submitted);
      if (cur.suggesting) {
        const result = await saveSuggestion(cur.projectId, base, submitted, cur.suggestion);
        if (live.current.path !== target) return;
        setSuggestion({ ...result, base: cur.suggestion?.base ?? { content: base.content } });
        setSaved(submitted);
      } else {
        const updated = await saveMergedDocument(cur.projectId, base, submitted, merged => validateStructure(target, merged));
        useBookStore.getState().upsert(updated);
        if (live.current.path !== target) return;
        setRow(updated);
        setSaved(updated.content);
        const now = live.current.text;
        if (now === submitted) {
          if (updated.content !== submitted) replace(updated.content);
        } else {
          try {
            const merged = mergeBookText(submitted, now, updated.content);
            if (merged !== now) replace(merged);
          } catch { /* keep typing; next save merges */ }
        }
      }
      await clearLocalDraft(draftKey(userId, cur.projectId, target), submitted).catch(() => {});
      setState(live.current.text === submitted ? "saved" : "dirty");
      setNotice("");
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setState("error");
      if (/same passage|changed in another|manual comparison/i.test(message) && cur.projectId) {
        readBookDocument(cur.projectId, target).then(setConflict).catch(() => {});
      }
    } finally {
      live.current.saving = false;
    }
  }, [userId, replace]);

  // Autosave shortly after typing stops; keep a local copy meanwhile.
  useEffect(() => {
    if (!path || !projectId || !row || !editable || text === saved || state === "error" || state === "loading") return;
    const backup = setTimeout(() => {
      void writeLocalDraft({ key: draftKey(userId, projectId, path), content: text, base: row, suggestion, updatedAt: Date.now() }).catch(() => {});
    }, 150);
    const timer = setTimeout(() => void save(), 900);
    return () => { clearTimeout(backup); clearTimeout(timer); };
  }, [text, saved, path, projectId, row, editable, state, save, userId, suggestion]);

  // Apply remote changes when this browser has nothing unsaved.
  useEffect(() => {
    const cur = live.current;
    if (!storeRow || !cur.row || storeRow.path !== cur.path || cur.saving) return;
    if (storeRow.version <= cur.row.version || !storeRow.loaded) return;
    if (cur.text !== cur.saved) return; // the next save merges
    if (cur.suggesting && cur.suggestion) return;
    setRow(storeRow);
    setSaved(storeRow.content);
    if (storeRow.content !== cur.text) replace(storeRow.content);
  }, [storeRow, replace]);

  // Replace the editor contents after an outside edit (an applied proposal, say).
  useEffect(() => {
    const reload = () => setReloadKey(k => k + 1);
    window.addEventListener("bookkit-reload-doc", reload);
    return () => window.removeEventListener("bookkit-reload-doc", reload);
  }, []);

  // Save on tab hide and when leaving the document.
  useEffect(() => {
    const flush = () => { if (live.current.text !== live.current.saved) void save(); };
    window.addEventListener("pagehide", flush);
    const onSave = (e: Event) => { e.preventDefault(); flush(); };
    window.addEventListener("writer-save-document", onSave);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("writer-save-document", onSave); flush(); };
  }, [path, save]);

  const setText = useCallback((next: string) => {
    setTextState(next);
    setState(s => (s === "error" ? s : next === live.current.saved ? "saved" : "dirty"));
  }, []);

  const keepMine = useCallback(() => {
    if (!conflict) return;
    setRow(conflict);
    setSaved(conflict.content);
    setConflict(null); setError(""); setState("dirty");
  }, [conflict]);

  const useLatest = useCallback(() => {
    if (!conflict || !projectId || !path) return;
    void clearLocalDraft(draftKey(userId, projectId, path), live.current.text).catch(() => {});
    setRow(conflict); setSaved(conflict.content); replace(conflict.content);
    setConflict(null); setError(""); setState("idle");
  }, [conflict, projectId, path, userId, replace]);

  return useMemo(
    () => ({ path, row, text, reloadKey, state, error, notice, conflict, suggestion, setText, saveNow: save, keepMine, useLatest }),
    [path, row, text, reloadKey, state, error, notice, conflict, suggestion, setText, save, keepMine, useLatest],
  );
}

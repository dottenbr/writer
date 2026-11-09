import { create } from "zustand";
import { supabase } from "../lib/supabase-client";
import { markdownToHtml, splitDocument } from "../lib/markdown-doc";
import { readingChunks } from "../lib/voice-text";
import { prefs, useBookStore, writePrefs } from "./useBookStore";

/**
 * Reading chapters aloud. One <audio> element for the whole session, so phones
 * keep playing with the screen locked; the lock screen gets play, pause and
 * skip through the Media Session API. Audio comes from /api/voice/speak a
 * paragraph group at a time, with the next two fetched ahead and cached in
 * browser Cache Storage when available.
 */
export const VOICES: Array<{ id: string; label: string }> = [
  { id: "thalia", label: "Thalia" }, { id: "andromeda", label: "Andromeda" }, { id: "helena", label: "Helena" },
  { id: "luna", label: "Luna" }, { id: "athena", label: "Athena" }, { id: "apollo", label: "Apollo" },
  { id: "arcas", label: "Arcas" }, { id: "orion", label: "Orion" }, { id: "hermes", label: "Hermes" }, { id: "zeus", label: "Zeus" },
];
export const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
export type SleepTimerOption = "off" | "15" | "30" | "chapter";

interface Chunk { text: string; first: number; last: number }
interface ListenState {
  chapter: number | null;
  title: string;
  chunks: Chunk[];
  index: number;
  playing: boolean;
  loading: boolean;
  downloading: boolean;
  error: string;
  voice: string;
  rate: number;
  follow: boolean;
  sleepTimer: SleepTimerOption;
  start: (chapter: number, fromParagraph?: number) => void;
  toggle: () => void;
  skip: (by: number) => void;
  stop: () => void;
  setVoice: (voice: string) => void;
  setRate: (rate: number) => void;
  setFollow: (on: boolean) => void;
  setSleepTimer: (timer: SleepTimerOption) => void;
  downloadChapter: () => Promise<void>;
}

let audio: HTMLAudioElement | null = null;
const urls = new Map<string, string>();
const blobs = new Map<string, Blob>();
const pending = new Map<string, Promise<string>>();
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;
let run = 0;

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", () => useListenStore.getState().skip(1));
    audio.addEventListener("play", () => useListenStore.setState({ playing: true }));
    audio.addEventListener("pause", () => useListenStore.setState({ playing: false }));
  }
  return audio;
}

/** Extract readable paragraph blocks in exact DOM order (including list items and blockquotes). */
export function extractReadableBlocksFromBody(body: string): string[] {
  const html = markdownToHtml(body).html;
  const paragraphs: string[] = [];
  for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

/** The chapter's readable paragraphs: its title, then its prose; headings and scene breaks become pauses. */
export function chapterParagraphs(number: number): { title: string; paragraphs: string[] } | null {
  const { model, files } = useBookStore.getState();
  const chapter = model?.chapters.find(c => c.number === number);
  if (!chapter) return null;
  const file = files.find(f => f.path === chapter.currentPath);
  if (!file) return null;
  const paragraphs = extractReadableBlocksFromBody(splitDocument(file.content).body);
  const title = chapter.title ? `Chapter ${number}. ${chapter.title}.` : `Chapter ${number}.`;
  return { title: chapter.title || `Chapter ${number}`, paragraphs: [title, ...paragraphs] };
}

async function blobFor(text: string, voice: string): Promise<Blob> {
  const key = voice + "|" + text;
  const mem = blobs.get(key);
  if (mem) return mem;
  const cacheUrl = `https://bookkit.local/__voice_cache/${encodeURIComponent(voice)}/${encodeURIComponent(text)}`;
  try {
    if (typeof caches !== "undefined") {
      const c = await caches.open("bookkit-voice-v1");
      const hit = await c.match(cacheUrl);
      if (hit) {
        const b = await hit.blob();
        blobs.set(key, b);
        return b;
      }
    }
  } catch { /* CacheStorage unavailable */ }
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ projectId: useBookStore.getState().projectId, text, voice }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Reading aloud failed.");
  const blob = await res.blob();
  blobs.set(key, blob);
  try {
    if (typeof caches !== "undefined") {
      const c = await caches.open("bookkit-voice-v1");
      await c.put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
    }
  } catch { /* CacheStorage quota or privacy mode */ }
  return blob;
}

async function audioFor(text: string, voice: string): Promise<string> {
  const key = voice + "|" + text;
  const ready = urls.get(key);
  if (ready) return ready;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const job = (async () => {
    const blob = await blobFor(text, voice);
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

function highlight(state: ListenState) {
  document.querySelectorAll(".reading-now").forEach(el => el.classList.remove("reading-now"));
  const chunk = state.chunks[state.index];
  if (!chunk || state.chapter == null) return;
  // paragraph 0 is the spoken title; prose paragraphs (including list items and blockquotes, excluding scene cards) follow
  const section = document.querySelector(`section[data-chapter="${state.chapter}"]`);
  const paras = section
    ? [...section.querySelectorAll(".doc-prose p")].filter(el => !el.closest(".scene-inline") && (el.textContent?.trim().length ?? 0) > 0)
    : [];
  let first: Element | null = null;
  for (let i = Math.max(1, chunk.first); i <= chunk.last; i++) { const el = paras[i - 1]; if (el) { el.classList.add("reading-now"); first ??= el; } }
  if (first && state.follow) first.scrollIntoView({ behavior: "smooth", block: "center" });
}

function mediaSession(state: ListenState) {
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
  if (!ms) return;
  const { model } = useBookStore.getState();
  ms.metadata = new MediaMetadata({ title: state.title, artist: model?.author ?? "", album: model?.title ?? "Bookkit" });
  ms.setActionHandler("play", () => useListenStore.getState().toggle());
  ms.setActionHandler("pause", () => useListenStore.getState().toggle());
  ms.setActionHandler("previoustrack", () => useListenStore.getState().skip(-1));
  ms.setActionHandler("nexttrack", () => useListenStore.getState().skip(1));
  try { ms.setActionHandler("seekbackward", () => useListenStore.getState().skip(-1)); ms.setActionHandler("seekforward", () => useListenStore.getState().skip(1)); } catch { /* not supported */ }
}

async function playCurrent() {
  const mine = ++run;
  const state = useListenStore.getState();
  const chunk = state.chunks[state.index];
  if (!chunk) return;
  useListenStore.setState({ loading: true, error: "" });
  highlight(state);
  mediaSession(state);
  try {
    const url = await audioFor(chunk.text, state.voice);
    if (mine !== run) return;
    const el = element();
    el.src = url;
    el.playbackRate = state.rate;
    await el.play();
    useListenStore.setState({ loading: false });
    // fetch ahead so there are no gaps on mobile data
    for (const next of state.chunks.slice(state.index + 1, state.index + 3)) void audioFor(next.text, state.voice).catch(() => {});
  } catch (e) {
    if (mine !== run) return;
    useListenStore.setState({ loading: false, playing: false, error: (e as Error).message === "The play() request was interrupted by a new load request." ? "" : (e as Error).message });
  }
}

export const useListenStore = create<ListenState>((set, get) => ({
  chapter: null,
  title: "",
  chunks: [],
  index: 0,
  playing: false,
  loading: false,
  downloading: false,
  error: "",
  voice: prefs().voice ?? "thalia",
  rate: prefs().voiceRate ?? 1,
  follow: prefs().voiceFollow ?? true,
  sleepTimer: "off",
  start: (chapter, fromParagraph = 0) => {
    const source = chapterParagraphs(chapter);
    if (!source) return;
    const chunks = readingChunks(source.paragraphs);
    const index = Math.max(0, chunks.findIndex(c => c.last >= fromParagraph));
    set({ chapter, title: source.title, chunks, index, error: "" });
    void playCurrent();
  },
  toggle: () => {
    const el = element();
    if (!get().chunks.length) return;
    if (el.paused) { if (el.src) void el.play(); else void playCurrent(); } else el.pause();
  },
  skip: by => {
    const { index, chunks, chapter, sleepTimer } = get();
    const next = index + by;
    if (next >= 0 && next < chunks.length) { set({ index: next }); void playCurrent(); return; }
    if (next >= chunks.length && chapter != null) {
      if (sleepTimer === "chapter") {
        set({ playing: false, sleepTimer: "off" });
        return;
      }
      // on to the next chapter
      const model = useBookStore.getState().model;
      const following = model?.chapters.find(c => c.number > chapter);
      if (following) { get().start(following.number); return; }
      set({ playing: false });
      return;
    }
    if (next < 0) { set({ index: 0 }); void playCurrent(); }
  },
  stop: () => {
    run++;
    if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
    element().pause();
    document.querySelectorAll(".reading-now").forEach(el => el.classList.remove("reading-now"));
    set({ chapter: null, chunks: [], index: 0, playing: false, loading: false, downloading: false, error: "", sleepTimer: "off" });
  },
  setVoice: voice => { set({ voice }); writePrefs({ voice }); if (get().chunks.length) void playCurrent(); },
  setRate: rate => { set({ rate }); writePrefs({ voiceRate: rate }); element().playbackRate = rate; },
  setFollow: on => { set({ follow: on }); writePrefs({ voiceFollow: on }); },
  setSleepTimer: sleepTimer => {
    if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
    set({ sleepTimer });
    if (sleepTimer === "15" || sleepTimer === "30") {
      sleepTimeout = setTimeout(() => {
        get().stop();
      }, Number(sleepTimer) * 60 * 1000);
    }
  },
  downloadChapter: async () => {
    const { chunks, voice, chapter, title, downloading } = get();
    if (!chunks.length || chapter == null || downloading) return;
    set({ downloading: true, error: "" });
    try {
      const parts: Blob[] = [];
      for (const c of chunks) {
        parts.push(await blobFor(c.text, voice));
      }
      const combined = new Blob(parts, { type: "audio/mpeg" });
      const url = URL.createObjectURL(combined);
      const a = document.createElement("a");
      const safeTitle = (title || `chapter-${chapter}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      a.href = url;
      a.download = `chapter-${String(chapter).padStart(2, "0")}-${safeTitle}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ downloading: false });
    }
  },
}));

import { create } from "zustand";
import { supabase } from "../lib/supabase-client";
import { markdownToPlain, splitDocument } from "../lib/markdown-doc";
import { readingChunks } from "../lib/voice-text";
import { prefs, useBookStore, writePrefs } from "./useBookStore";

/**
 * Reading chapters aloud. One <audio> element for the whole session, so phones
 * keep playing with the screen locked; the lock screen gets play, pause and
 * skip through the Media Session API. Audio comes from /api/voice/speak a
 * paragraph group at a time, with the next two fetched ahead.
 */
export const VOICES: Array<{ id: string; label: string }> = [
  { id: "thalia", label: "Thalia" }, { id: "andromeda", label: "Andromeda" }, { id: "helena", label: "Helena" },
  { id: "luna", label: "Luna" }, { id: "athena", label: "Athena" }, { id: "apollo", label: "Apollo" },
  { id: "arcas", label: "Arcas" }, { id: "orion", label: "Orion" }, { id: "hermes", label: "Hermes" }, { id: "zeus", label: "Zeus" },
];
export const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

interface Chunk { text: string; first: number; last: number }
interface ListenState {
  chapter: number | null;
  title: string;
  chunks: Chunk[];
  index: number;
  playing: boolean;
  loading: boolean;
  error: string;
  voice: string;
  rate: number;
  follow: boolean;
  start: (chapter: number, fromParagraph?: number) => void;
  toggle: () => void;
  skip: (by: number) => void;
  stop: () => void;
  setVoice: (voice: string) => void;
  setRate: (rate: number) => void;
  setFollow: (on: boolean) => void;
}

let audio: HTMLAudioElement | null = null;
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
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

/** The chapter's readable paragraphs: its title, then its prose; headings and scene breaks become pauses. */
export function chapterParagraphs(number: number): { title: string; paragraphs: string[] } | null {
  const { model, files } = useBookStore.getState();
  const chapter = model?.chapters.find(c => c.number === number);
  if (!chapter) return null;
  const file = files.find(f => f.path === chapter.currentPath);
  if (!file) return null;
  const blocks = splitDocument(file.content).body.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const paragraphs = blocks.filter(b => !/^#{1,6}\s/.test(b) && !/^([*\-_]\s*){3,}$/.test(b)).map(b => markdownToPlain(b).replace(/\s+/g, " ").trim()).filter(Boolean);
  const title = chapter.title ? `Chapter ${number}. ${chapter.title}.` : `Chapter ${number}.`;
  return { title: chapter.title || `Chapter ${number}`, paragraphs: [title, ...paragraphs] };
}

async function audioFor(text: string, voice: string): Promise<string> {
  const key = voice + "|" + text;
  const ready = urls.get(key);
  if (ready) return ready;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const job = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ projectId: useBookStore.getState().projectId, text, voice }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Reading aloud failed.");
    const url = URL.createObjectURL(await res.blob());
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
  // paragraph 0 is the spoken title; prose paragraphs follow
  const section = document.querySelector(`section[data-chapter="${state.chapter}"]`);
  const paras = section ? [...section.querySelectorAll(".doc-prose > p")] : [];
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
  error: "",
  voice: prefs().voice ?? "thalia",
  rate: prefs().voiceRate ?? 1,
  follow: prefs().voiceFollow ?? true,
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
    const { index, chunks, chapter } = get();
    const next = index + by;
    if (next >= 0 && next < chunks.length) { set({ index: next }); void playCurrent(); return; }
    if (next >= chunks.length && chapter != null) {
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
    element().pause();
    document.querySelectorAll(".reading-now").forEach(el => el.classList.remove("reading-now"));
    set({ chapter: null, chunks: [], index: 0, playing: false, loading: false, error: "" });
  },
  setVoice: voice => { set({ voice }); writePrefs({ voice }); if (get().chunks.length) void playCurrent(); },
  setRate: rate => { set({ rate }); writePrefs({ voiceRate: rate }); element().playbackRate = rate; },
  setFollow: on => { set({ follow: on }); writePrefs({ voiceFollow: on }); },
}));

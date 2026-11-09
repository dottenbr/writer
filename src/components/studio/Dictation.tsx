import { useEffect, useRef, useState } from "react";
import { useEditorBus } from "./editorBus";
import { useBookStore } from "../../store/useBookStore";
import { supabase } from "../../lib/supabase-client";
import { readConfig } from "../../lib/book-config";
import { voiceVocabulary } from "../../lib/voice-text";
import { Icon, useAccess } from "./common";

const CHUNK_LIMIT = 105;
type State = "idle" | "asking" | "recording" | "transcribing";

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Dictate into the open document. English, transcribed faithfully: the book's
 * names steer the recogniser, and the clean-up may fix punctuation and names
 * but never change what you said. Long sessions automatically segment every
 * ~105s so you can keep speaking continuously without a 2-minute cutoff.
 */
export function Dictation() {
  const editor = useEditorBus(s => s.editor);
  const model = useBookStore(s => s.model);
  const bookYaml = useBookStore(s => s.files.find(f => f.path === "book.yaml")?.content ?? "");
  const { projectId } = useAccess();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [undoSteps, setUndoSteps] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const generation = useRef(0);
  const keepGoing = useRef(false);
  const pendingJobs = useRef(0);
  const supported = typeof window !== "undefined" && typeof window.MediaRecorder === "function" && !!navigator.mediaDevices?.getUserMedia;

  const release = () => { clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  const cancel = () => { keepGoing.current = false; generation.current++; if (recorder.current?.state === "recording") recorder.current.stop(); release(); pendingJobs.current = 0; setState("idle"); };
  useEffect(() => () => cancel(), []);
  useEffect(() => { if (!message) return; const t = setTimeout(() => { setMessage(""); setUndoSteps(0); }, 10000); return () => clearTimeout(t); }, [message]);

  function insert(text: string) {
    if (!editor || !text) return;
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from);
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    let chain = editor.chain().focus();
    paragraphs.forEach((p, i) => {
      if (i === 0) chain = chain.insertContent((before && !/\s$/.test(before) && !/^[,.;:!?…’”]/.test(p) ? " " : "") + p);
      else chain = chain.splitBlock().insertContent(p);
    });
    chain.run();
    setUndoSteps(n => n + 1);
  }

  function undoDictation() {
    if (!editor || undoSteps <= 0) return;
    for (let i = 0; i < undoSteps; i++) editor.commands.undo();
    setUndoSteps(0);
    setMessage("Dictation undone.");
  }

  function startRecorderSegment(current: number, media: MediaStream, mimeType?: string) {
    const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    recorder.current = rec;
    const chunks: Blob[] = [];
    let chunkElapsed = 0;
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      if (current !== generation.current) return;
      const continuing = keepGoing.current && media.active;
      if (continuing) {
        startRecorderSegment(current, media, mimeType);
      } else {
        release();
      }
      if (!chunks.length) {
        if (!continuing && pendingJobs.current === 0) setState("idle");
        return;
      }
      pendingJobs.current++;
      if (!continuing) setState("transcribing");
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
        if (blob.size > 8 * 1024 * 1024) throw new Error("That recording segment is too large. Try shorter passages.");
        const { from } = editor?.state.selection ?? { from: 0 };
        const context = editor ? editor.state.doc.textBetween(Math.max(0, from - 300), from, " ") : "";
        const vocabulary = voiceVocabulary(model?.entities.map(e => e.name) ?? [], [context]);
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: JSON.stringify({ projectId, audio: await toBase64(blob), vocabulary, context, style: readConfig(bookYaml).style }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Transcription failed. Try again.");
        if (current !== generation.current) return;
        insert(body.text);
        setMessage(body.corrected || body.polished ? "Inserted. Names and punctuation were tidied; your words weren’t changed." : "Inserted.");
      } catch (e) {
        if (current === generation.current) setMessage((e as Error).message);
      } finally {
        pendingJobs.current = Math.max(0, pendingJobs.current - 1);
        if (current === generation.current && !keepGoing.current && pendingJobs.current === 0) setState("idle");
      }
    };
    rec.start(1000);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      chunkElapsed++;
      setSeconds(s => s + 1);
      if (chunkElapsed >= CHUNK_LIMIT && rec.state === "recording") rec.stop();
    }, 1000);
  }

  async function start() {
    const current = ++generation.current;
    setMessage(""); setUndoSteps(0); setState("asking");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (current !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      keepGoing.current = true;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      setSeconds(0); setState("recording");
      startRecorderSegment(current, media, mimeType);
    } catch (e) {
      if (current !== generation.current) return;
      cancel();
      setMessage((e as Error).name === "NotAllowedError" ? "Microphone access was denied. Allow it in the browser to dictate." : "The microphone couldn’t be opened.");
    }
  }

  function finish() {
    keepGoing.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (!supported || !editor?.isEditable) return null;
  const busy = state === "asking" || state === "transcribing";
  return (
    <span className="dictation">
      <button className={`tb-btn ${state === "recording" ? "recording" : ""}`} disabled={busy} aria-pressed={state === "recording"}
        title={state === "recording" ? "Stop and insert" : "Dictate (English)"} aria-label={state === "recording" ? "Stop dictating" : "Dictate"}
        onMouseDown={e => e.preventDefault()} onClick={() => (state === "recording" ? finish() : void start())}>
        <Icon name={state === "recording" ? "stop" : "mic"} size={16} />
      </button>
      {(state !== "idle" || message) && (
        <span className="dictation-status" role="status">
          {state === "recording" ? <><span className="rec-dot" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · speak, then press stop</>
            : state === "asking" ? "Allow the microphone…" : state === "transcribing" ? "Transcribing…" : message}
          {state === "idle" && undoSteps > 0 && <button className="link-btn" onClick={undoDictation}>Undo</button>}
          {state !== "idle" && <button className="link-btn" onClick={cancel}>Cancel</button>}
        </span>
      )}
    </span>
  );
}

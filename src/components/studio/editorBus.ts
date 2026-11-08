import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import type { DocSession } from "./useDocSession";

/** The editor and document session that currently has the writer's attention. */
interface EditorBus {
  editor: Editor | null;
  session: DocSession | null;
  selection: string;
  /** Request the comment composer to open with this quote. */
  commentQuote: { text: string; nonce: number; at: number } | null;
  setEditor: (editor: Editor | null) => void;
  setSession: (session: DocSession | null) => void;
  setSelection: (text: string) => void;
  requestComment: (text: string) => void;
}

let nonce = 0;
export const useEditorBus = create<EditorBus>(set => ({
  editor: null,
  session: null,
  selection: "",
  commentQuote: null,
  setEditor: editor => set({ editor }),
  setSession: session => set({ session }),
  setSelection: selection => set({ selection }),
  requestComment: text => set({ commentQuote: { text, nonce: ++nonce, at: Date.now() } }),
}));

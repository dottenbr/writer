import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { CommentMark } from "../lib/comment-mark";
import {
  BibleHighlight,
  REBUILD_BIBLE_HIGHLIGHTS_META,
  type BibleRefEntry,
  type BibleRefSection,
} from "../lib/bible-highlight";
import { useProjectStore } from "../store/useProjectStore";
import { completeText } from "../lib/llm-service";
import { estimatePages, htmlToMarkdown } from "../lib/markdown";
import { buildWordDiff } from "../lib/text-diff";
import type { Bible, BibleSection, Chapter, Comment, CommentReply, Project } from "../types";
import {
  isChapterType,
  formatSectionHeading,
  formatSectionPrefix,
  formatSectionLabel,
  deriveChapterNumbers,
  SECTION_TYPE_LABELS,
} from "../types";

function EditorToolbar({ editor, canEdit }: { editor: ReturnType<typeof useEditor>; canEdit: boolean }) {
  const focusMode = useProjectStore((s) => s.focusMode);
  const setFocusMode = useProjectStore((s) => s.setFocusMode);
  if (!editor) return null;
  const ToolbarButton = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button className={`editor-toolbar-btn ${active ? "is-active" : ""}`} onClick={onClick} title={title} disabled={!canEdit}>
      {children}
    </button>
  );

  return (
    <div className="editor-toolbar">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
        <span style={{ textDecoration: "underline" }}>U</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight">
        H
      </ToolbarButton>
      <div className="editor-toolbar-divider" />
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
        H2
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
        “
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
        ↶
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
        ↷
      </ToolbarButton>
      <div className="editor-toolbar-divider" />
      <button className="btn btn-sm" onClick={() => setFocusMode(!focusMode)}>
        {focusMode ? "Defocus" : "Focus"}
      </button>
    </div>
  );
}

interface AskEditorForm {
  structure: boolean;
  continuity: boolean;
  craft: boolean;
  focus: string;
}

interface HoveredBibleRef {
  section: BibleRefSection;
  id: string;
  name: string;
  label: string;
  summary: string;
  aliases: string[];
  top: number;
  left: number;
}

type AiOperationPhase = "idle" | "running" | "review";

type AiReviewPayload =
  | {
      kind: "selection-edit";
      title: string;
      beforeText: string;
      afterText: string;
      selectionFrom: number;
      selectionTo: number;
      usedSelection: boolean;
    }
  | {
      kind: "editor-notes";
      title: string;
      beforeText: string;
      afterText: string;
    };

function truncate(input: string, max = 140): string {
  const text = input.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function eventTargetToElement(target: EventTarget | null): HTMLElement | null {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function formatReportLines(
  input: string
): Array<{ type: "heading" | "subheading" | "bullet" | "numbered" | "paragraph"; text: string }> {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (/^##\s+/.test(line)) return { type: "heading" as const, text: line.replace(/^##\s+/, "") };
      if (/^###\s+/.test(line)) return { type: "subheading" as const, text: line.replace(/^###\s+/, "") };
      if (/^[-*]\s+/.test(line)) return { type: "bullet" as const, text: line.replace(/^[-*]\s+/, "") };
      if (/^\d+[.)]\s+/.test(line)) return { type: "numbered" as const, text: line.replace(/^\d+[.)]\s+/, "") };
      return { type: "paragraph" as const, text: line };
    });
}

function renderReportText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function resolveBibleRefElementAtCoords(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  clientX: number,
  clientY: number
): HTMLElement | null {
  const pos = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!pos) return null;
  const domAtPos = editor.view.domAtPos(pos.pos).node;
  const element = domAtPos instanceof HTMLElement ? domAtPos : domAtPos.parentElement;
  return element?.closest(".bible-ref") as HTMLElement | null;
}

function buildBibleRefEntries(bible: Bible | undefined): BibleRefEntry[] {
  if (!bible) return [];
  const characters = bible.characters.map((char) => ({
    id: char.id,
    section: "characters" as const,
    name: char.name,
    aliases: char.alsoKnownAs ?? [],
    summary: char.description || char.notes || char.role || "",
  }));
  const threads = bible.threads.map((thread) => ({
    id: thread.id,
    section: "threads" as const,
    name: thread.name,
    aliases: thread.alsoKnownAs ?? [],
    summary: thread.description || thread.notes || thread.type || "",
  }));
  const locations = bible.locations.map((location) => ({
    id: location.id,
    section: "locations" as const,
    name: location.name,
    aliases: location.alsoKnownAs ?? [],
    summary: location.description || location.significance || location.notes || "",
  }));
  const codexEntries = bible.codex.map((entry) => ({
    id: entry.id,
    section: "codex" as const,
    name: entry.name,
    aliases: entry.alsoKnownAs ?? [],
    summary: entry.content || entry.category || entry.entryType || "",
  }));
  return [...characters, ...threads, ...locations, ...codexEntries];
}

function buildEditorProjectContext(project: Project, activeChapter: Chapter): string {
  const sections: string[] = [];

  const b = project.brief;
  const briefLines: string[] = [];
  if (b.genre) briefLines.push(`Genre: ${b.genre}`);
  if (b.logline) briefLines.push(`Logline: ${b.logline}`);
  if (b.themes.length) briefLines.push(`Themes: ${b.themes.join(", ")}`);
  if (b.audience) briefLines.push(`Audience: ${b.audience}`);
  if (b.comparableTitles) briefLines.push(`Comparable titles: ${b.comparableTitles}`);
  if (briefLines.length) sections.push(`PROJECT BRIEF\n${briefLines.join("\n")}`);

  if (b.synopsis) sections.push(`TREATMENT / SYNOPSIS\n${b.synopsis}`);

  if (b.writingStyle) sections.push(`PROSE STYLE GUIDE\n${b.writingStyle}`);

  if (project.bible.characters.length) {
    const lines = project.bible.characters.map((c) => {
      const parts = [`${c.name} (${c.role})`];
      if (c.alsoKnownAs.length) parts.push(`aka ${c.alsoKnownAs.join(", ")}`);
      if (c.description) parts.push(c.description);
      if (c.arc) parts.push(`Arc: ${c.arc}`);
      if (c.motivation) parts.push(`Motivation: ${c.motivation}`);
      if (c.internalConflict) parts.push(`Internal conflict: ${c.internalConflict}`);
      if (c.knows) parts.push(`Knows: ${c.knows}`);
      if (c.conceals) parts.push(`Conceals: ${c.conceals}`);
      return `- ${parts.join(". ")}`;
    });
    sections.push(`CHARACTERS\n${lines.join("\n")}`);
  }

  if (project.bible.threads.length) {
    const lines = project.bible.threads.map((t) => {
      const parts = [`${t.name} (${t.type})`];
      if (t.description) parts.push(t.description);
      if (t.timeframe) parts.push(`Timeframe: ${t.timeframe}`);
      if (t.continuityChecks) parts.push(`Continuity: ${t.continuityChecks}`);
      return `- ${parts.join(". ")}`;
    });
    sections.push(`THREADS & PLOTLINES\n${lines.join("\n")}`);
  }

  if (project.bible.locations.length) {
    const lines = project.bible.locations.map((l) => {
      const parts = [l.name];
      if (l.alsoKnownAs.length) parts.push(`aka ${l.alsoKnownAs.join(", ")}`);
      if (l.description) parts.push(l.description);
      if (l.historicalContext) parts.push(`Historical: ${l.historicalContext}`);
      if (l.significance) parts.push(`Significance: ${l.significance}`);
      if (l.sensoryDetails) parts.push(`Sensory: ${l.sensoryDetails}`);
      return `- ${parts.join(". ")}`;
    });
    sections.push(`LOCATIONS\n${lines.join("\n")}`);
  }

  if (project.bible.codex.length) {
    const lines = project.bible.codex.map((e) => {
      const parts = [`${e.name} [${e.entryType}]`];
      if (e.content) parts.push(e.content);
      if (e.timeframe) parts.push(`Timeframe: ${e.timeframe}`);
      return `- ${parts.join(". ")}`;
    });
    sections.push(`CODEX / WORLD-BUILDING\n${lines.join("\n")}`);
  }

  const sorted = [...project.chapters].sort((a, bb) => a.number - bb.number);
  const chapterNums = deriveChapterNumbers(sorted);
  const idx = sorted.findIndex((c) => c.id === activeChapter.id);
  const nearby = sorted
    .filter((_, i) => i !== idx && Math.abs(i - idx) <= 2)
    .map((c) => {
      const prefix = formatSectionPrefix(c.sectionType, chapterNums.get(c.id) ?? null);
      const parts = [`${prefix}: ${c.title || "(untitled)"} [${c.status}]`];
      if (c.summary) parts.push(c.summary);
      return `- ${parts.join(" — ")}`;
    });
  if (nearby.length) sections.push(`SURROUNDING SECTIONS\n${nearby.join("\n")}`);

  if (activeChapter.scenes.length) {
    const lines = activeChapter.scenes.map((s) => {
      const parts = [s.title || "(untitled scene)"];
      if (s.pov) parts.push(`POV: ${s.pov}`);
      if (s.location) parts.push(`Location: ${s.location}`);
      if (s.characters.length) parts.push(`Characters: ${s.characters.join(", ")}`);
      if (s.summary) parts.push(s.summary);
      return `- ${parts.join(". ")}`;
    });
    sections.push(`SCENES IN THIS CHAPTER\n${lines.join("\n")}`);
  }

  if (activeChapter.notes) sections.push(`CHAPTER NOTES\n${activeChapter.notes}`);

  if (b.notes) sections.push(`STORY BIBLE / ADDITIONAL NOTES\n${b.notes}`);

  return sections.join("\n\n---\n\n");
}

export function Manuscript() {
  const project = useProjectStore((s) => s.currentProject());
  const activeChapterId = useProjectStore((s) => s.activeChapterId);
  const setActiveChapterId = useProjectStore((s) => s.setActiveChapterId);
  const updateChapter = useProjectStore((s) => s.updateChapter);
  const addChapter = useProjectStore((s) => s.addChapter);
  const updateGeneralNotes = useProjectStore((s) => s.updateGeneralNotes);
  const saveToStorage = useProjectStore((s) => s.saveToStorage);
  const llmSettings = useProjectStore((s) => s.llmSettings);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const focusMode = useProjectStore((s) => s.focusMode);
  const setFocusMode = useProjectStore((s) => s.setFocusMode);
  const progressStats = useProjectStore((s) => s.progressStats);
  const askEditorResponse = useProjectStore((s) => s.askEditorResponse);
  const setAskEditorResponse = useProjectStore((s) => s.setAskEditorResponse);
  const refreshProgress = useProjectStore((s) => s.refreshProgress);
  const navigateToBibleEntry = useProjectStore((s) => s.navigateToBibleEntry);
  const comments = useProjectStore((s) => s.comments);
  const addComment = useProjectStore((s) => s.addComment);
  const addCommentReply = useProjectStore((s) => s.addCommentReply);
  const resolveComment = useProjectStore((s) => s.resolveComment);
  const activeCommentId = useProjectStore((s) => s.activeCommentId);
  const setActiveCommentId = useProjectStore((s) => s.setActiveCommentId);
  const currentProjectRole = useProjectStore((s) => s.currentProjectRole);
  const syncStatus = useProjectStore((s) => s.syncStatus);
  const chapterConflicts = useProjectStore((s) => s.chapterConflicts);
  const chapterConflictDetails = useProjectStore((s) => s.chapterConflictDetails);
  const loadChapterConflictDetails = useProjectStore((s) => s.loadChapterConflictDetails);
  const acceptRemoteChapterConflict = useProjectStore((s) => s.acceptRemoteChapterConflict);
  const overwriteRemoteChapterConflict = useProjectStore((s) => s.overwriteRemoteChapterConflict);

  const [showAskEditor, setShowAskEditor] = useState(false);
  const [askEditorForm, setAskEditorForm] = useState<AskEditorForm>({
    structure: true,
    continuity: false,
    craft: true,
    focus: "",
  });
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showSelectionPrompt, setShowSelectionPrompt] = useState(false);
  const [selectionPrompt, setSelectionPrompt] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [hoveredBibleRef, setHoveredBibleRef] = useState<HoveredBibleRef | null>(null);
  const [aiPhase, setAiPhase] = useState<AiOperationPhase>("idle");
  const [aiBusyLabel, setAiBusyLabel] = useState("");
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [aiReviewPayload, setAiReviewPayload] = useState<AiReviewPayload | null>(null);
  const [aiOriginalAfterText, setAiOriginalAfterText] = useState("");
  const [aiReviewAfterDraft, setAiReviewAfterDraft] = useState("");
  const [showConflictReview, setShowConflictReview] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const aiAfterEditorRef = useRef<HTMLDivElement>(null);
  const aiInlineEditorRef = useRef<HTMLDivElement>(null);

  const activeChapter = project?.chapters.find((c) => c.id === activeChapterId);
  const canEdit = currentProjectRole === "owner" || currentProjectRole === "editor";
  const activeConflictDetails = activeChapter ? chapterConflictDetails[activeChapter.id] : undefined;
  const hasActiveConflict = activeChapter ? Boolean(chapterConflicts[activeChapter.id]) : false;
  const canEditChapter = canEdit && !hasActiveConflict;
  const sortedChapters = useMemo(() => [...(project?.chapters ?? [])].sort((a, b) => a.number - b.number), [project?.chapters]);

  const chapterNumberMap = useMemo(() => deriveChapterNumbers(sortedChapters), [sortedChapters]);
  const actLabelById = useMemo(() => new Map(project?.acts.map((a) => [a.id, a.label]) ?? []), [project?.acts]);
  const bibleRefEntries = useMemo(() => buildBibleRefEntries(project?.bible), [project?.bible]);
  const bibleRefEntryMap = useMemo(
    () => new Map(bibleRefEntries.map((entry) => [`${entry.section}:${entry.id}`, entry])),
    [bibleRefEntries]
  );
  const aiLocked = aiPhase !== "idle";
  const hideFloatingMenus = aiLocked || showAskEditor || showSelectionPrompt || showCommentInput;
  const aiDiffSegments = useMemo(() => {
    if (!aiReviewPayload) return [];
    return buildWordDiff(aiReviewPayload.beforeText, aiReviewAfterDraft);
  }, [aiReviewPayload, aiReviewAfterDraft]);
  const aiManualDiffSegments = useMemo(() => {
    if (!aiReviewPayload) return [];
    return buildWordDiff(aiOriginalAfterText, aiReviewAfterDraft);
  }, [aiReviewPayload, aiOriginalAfterText, aiReviewAfterDraft]);
  const hasManualAiEdits = aiReviewPayload !== null && aiReviewAfterDraft !== aiOriginalAfterText;
  const reportLines = useMemo(() => {
    if (!aiReviewPayload || aiReviewPayload.kind !== "editor-notes") return [];
    return formatReportLines(aiReviewAfterDraft);
  }, [aiReviewPayload, aiReviewAfterDraft]);
  const conflictDiffSegments = useMemo(() => {
    if (!activeChapter || !activeConflictDetails) return [];
    return buildWordDiff(
      htmlToMarkdown(activeConflictDetails.remoteContent ?? ""),
      htmlToMarkdown(activeChapter.content ?? "")
    );
  }, [activeChapter, activeConflictDetails]);

  const handleAiDraftInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    setAiReviewAfterDraft(event.currentTarget.innerText);
  }, []);

  useEffect(() => {
    if (!aiReviewPayload) return;
    const editors = [aiAfterEditorRef.current, aiInlineEditorRef.current];
    for (const editorEl of editors) {
      if (!editorEl) continue;
      if (document.activeElement === editorEl) continue;
      if (editorEl.innerText !== aiReviewAfterDraft) {
        editorEl.innerText = aiReviewAfterDraft;
      }
    }
  }, [aiReviewPayload, aiReviewAfterDraft]);

  useEffect(() => {
    if (!activeChapter || !chapterConflicts[activeChapter.id] || activeConflictDetails) return;
    void loadChapterConflictDetails(activeChapter.id);
  }, [activeChapter, activeConflictDetails, chapterConflicts, loadChapterConflictDetails]);

  useEffect(() => {
    if (!hasActiveConflict) setShowConflictReview(false);
  }, [hasActiveConflict]);

  type SidebarEntry = { type: "act"; actId: string; label: string } | { type: "chapter"; chapter: typeof sortedChapters[number] };
  const sidebarEntries = useMemo<SidebarEntry[]>(() => {
    const items: SidebarEntry[] = [];
    let lastAct: string | null = null;
    for (const ch of sortedChapters) {
      if (ch.act !== null && ch.act !== lastAct) {
        const label = actLabelById.get(ch.act) ?? ch.act;
        items.push({ type: "act", actId: ch.act, label });
      }
      lastAct = ch.act;
      items.push({ type: "chapter", chapter: ch });
    }
    return items;
  }, [sortedChapters, actLabelById]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Typography,
      CharacterCount,
      Placeholder.configure({ placeholder: "Begin writing..." }),
      CommentMark,
      BibleHighlight.configure({
        getEntries: () => buildBibleRefEntries(useProjectStore.getState().currentProject()?.bible),
      }),
    ],
    content: activeChapter?.content || "",
    editable: canEditChapter,
    onUpdate: ({ editor }) => {
      const state = useProjectStore.getState();
      const chapterId = state.activeChapterId;
      if (!chapterId) return;
      const content = editor.getHTML();
      const wordCount = editor.storage.characterCount.words();
      state.updateChapter(chapterId, { content, wordCount });
    },
    editorProps: {
      handleKeyDown: (_, event) => {
        if (event.key === "/" && !event.metaKey && !event.ctrlKey && !aiLocked && canEditChapter) {
          setShowSlashMenu(true);
        }
        if (event.key === "Escape") {
          setShowSlashMenu(false);
          setFocusMode(false);
        }
        if (event.key === "Tab" && event.shiftKey) {
          event.preventDefault();
          if (aiLocked || !canEditChapter) return true;
          void runAiOnSelection("Continue this section with one strong paragraph.");
          return true;
        }
        return false;
      },
      handleClick: (_, __, event) => {
        if (!editor) return false;
        const refElement = resolveBibleRefElementAtCoords(editor, event.clientX, event.clientY);
        if (!refElement) return false;
        const id = refElement.dataset.bibleId;
        const section = refElement.dataset.bibleSection as BibleSection | undefined;
        if (!id || !section) return false;
        event.preventDefault();
        navigateToBibleEntry(section, id);
        setHoveredBibleRef(null);
        return true;
      },
    },
  }, [aiLocked, canEditChapter]);

  const [sceneHeadings, setSceneHeadings] = useState<Array<{ id: string; label: string; pos: number }>>([]);
  const refreshSceneHeadings = useCallback(() => {
    if (!editor || !activeChapter) {
      setSceneHeadings([]);
      return;
    }
    const headings: Array<{ id: string; label: string; pos: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return true;
      if (node.attrs?.level !== 2) return true;
      const label = node.textContent.trim();
      if (!label) return true;
      headings.push({
        id: `${activeChapter.id}-${pos}`,
        label,
        pos,
      });
      return true;
    });
    setSceneHeadings(headings);
  }, [editor, activeChapter]);

  useEffect(() => {
    if (editor && activeChapter) {
      if (editor.getHTML() !== activeChapter.content) {
        editor.commands.setContent(activeChapter.content || "", false);
      }
    } else if (editor && !activeChapter) {
      editor.commands.setContent("", false);
    }
    refreshSceneHeadings();
  }, [editor, activeChapterId, activeChapter?.content, refreshSceneHeadings]);

  useEffect(() => {
    if (!editor) return;
    const syncSceneHeadings = () => refreshSceneHeadings();
    editor.on("transaction", syncSceneHeadings);
    return () => {
      editor.off("transaction", syncSceneHeadings);
    };
  }, [editor, refreshSceneHeadings]);

  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(REBUILD_BIBLE_HIGHLIGHTS_META, true);
    editor.view.dispatch(tr);
  }, [editor, bibleRefEntries]);

  const acceptAiReview = useCallback(() => {
    if (!aiReviewPayload) return;
    if (aiReviewPayload.kind === "selection-edit") {
      if (!editor) return;
      const { selectionFrom, selectionTo, usedSelection } = aiReviewPayload;
      if (usedSelection) {
        editor.chain().focus().insertContentAt({ from: selectionFrom, to: selectionTo }, aiReviewAfterDraft).run();
      } else {
        editor.chain().focus().insertContent(`\n\n${aiReviewAfterDraft}`).run();
      }
      setAiStatusMessage("AI proposal accepted.");
    } else {
      setAskEditorResponse(aiReviewAfterDraft);
      setAiStatusMessage("");
    }
    setAiReviewPayload(null);
    setAiOriginalAfterText("");
    setAiReviewAfterDraft("");
    setAiBusyLabel("");
    setAiPhase("idle");
  }, [aiReviewPayload, aiReviewAfterDraft, editor, setAskEditorResponse]);

  const rejectAiReview = useCallback(() => {
    if (!aiReviewPayload) return;
    setAiReviewPayload(null);
    setAiOriginalAfterText("");
    setAiReviewAfterDraft("");
    setAiBusyLabel("");
    setAiStatusMessage("AI proposal rejected.");
    setAiPhase("idle");
  }, [aiReviewPayload]);

  const runAiOnSelection = useCallback(
    async (instruction: string) => {
      if (!editor || aiPhase !== "idle") return;
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const source = selectedText || editor.state.doc.textContent.slice(0, 2000);
      setAiStatusMessage("");
      setAiBusyLabel("Generating edit...");
      setAiPhase("running");
      try {
        const output = await completeText(
          `You are editing fiction prose.\nInstruction: ${instruction}\n\nText:\n${source}\n\nReturn only improved text.`,
          llmSettings
        );
        if (!output.trim()) {
          setAiStatusMessage("AI returned an empty suggestion.");
          setAiBusyLabel("");
          setAiPhase("idle");
          return;
        }
        setAiReviewPayload({
          kind: "selection-edit",
          title: instruction,
          beforeText: source,
          afterText: output.trim(),
          selectionFrom: from,
          selectionTo: to,
          usedSelection: Boolean(selectedText),
        });
        setAiOriginalAfterText(output.trim());
        setAiReviewAfterDraft(output.trim());
        setAiBusyLabel("");
        setAiPhase("review");
      } catch (error: any) {
        setAiStatusMessage(`AI edit failed: ${error?.message ?? "Unknown error"}`);
        setAiBusyLabel("");
        setAiPhase("idle");
      }
    },
    [editor, aiPhase, llmSettings]
  );

  const requestAskEditorNotes = useCallback(async () => {
    if (!activeChapter || !project || aiPhase !== "idle") return;
    setAiStatusMessage("");
    setAiBusyLabel("Thinking like your editor...");
    setAiPhase("running");

    const noteTypes = [
      askEditorForm.structure ? "Structural & dramatic" : "",
      askEditorForm.continuity ? "Continuity & consistency" : "",
      askEditorForm.craft ? "Craft & voice" : "",
    ]
      .filter(Boolean)
      .join(", ");

    const context = buildEditorProjectContext(project, activeChapter);

    const prompt = `You are a seasoned fiction editor conducting a thorough chapter review. You have deep knowledge of this project — its characters, world, style rules, and narrative arc. Use that knowledge to catch continuity errors, voice drift, and missed opportunities.

=== PROJECT CONTEXT ===

${context}

=== CHAPTER UNDER REVIEW ===

Title: ${activeChapter.title}
${formatSectionHeading(activeChapter.sectionType, chapterNumberMap.get(activeChapter.id) ?? null, activeChapter.title)} — Status: ${activeChapter.status}

${activeChapter.content}

=== EDITORIAL REVIEW REQUEST ===

Note types requested: ${noteTypes || "All"}
Specific focus: ${askEditorForm.focus || "None specified"}

Write a thorough editorial review of this chapter. Structure your response with clear section headers (use ## for sections). Cover only the requested note types. Be specific — reference actual passages, character names, and plot points. Where you identify issues, suggest concrete fixes or alternatives. End with a brief note on the chapter's strengths.`;

    try {
      const output = await completeText(prompt, llmSettings);
      if (!output.trim()) {
        setAiStatusMessage("AI returned no editor notes.");
        setAiBusyLabel("");
        setAiPhase("idle");
        return;
      }
      setAskEditorResponse(output.trim());
      setAiReviewPayload({
        kind: "editor-notes",
        title: `Editor Report — ${activeChapter.title}`,
        beforeText: "",
        afterText: output.trim(),
      });
      setAiOriginalAfterText(output.trim());
      setAiReviewAfterDraft(output.trim());
      setShowAskEditor(false);
      setAiBusyLabel("");
      setAiPhase("review");
    } catch (error: any) {
      setAiStatusMessage(`Editor request failed: ${error?.message ?? "Unknown error"}`);
      setAiBusyLabel("");
      setAiPhase("idle");
    }
  }, [activeChapter, aiPhase, askEditorForm, llmSettings, project, setAskEditorResponse]);

  const jumpToHeading = useCallback(
    (pos: number) => {
      if (!editor) return;
      editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
    },
    [editor]
  );

  const chapterComments = useMemo(
    () => comments.filter((c) => c.chapterId === activeChapterId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [comments, activeChapterId]
  );

  const handleAddComment = useCallback(() => {
    if (!editor || !activeChapterId) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    setShowCommentInput(true);
    setNewCommentText("");
    setTimeout(() => commentInputRef.current?.focus(), 50);
  }, [editor, activeChapterId]);

  const submitComment = useCallback(() => {
    if (!editor || !activeChapterId || !newCommentText.trim()) return;
    const { from, to } = editor.state.selection;
    const quotedText = editor.state.doc.textBetween(from, to, " ");
    if (!quotedText.trim()) return;

    const comment: Comment = {
      id: crypto.randomUUID(),
      chapterId: activeChapterId,
      text: newCommentText.trim(),
      quotedText: quotedText.slice(0, 300),
      createdAt: new Date().toISOString(),
      replies: [],
    };

    editor.chain().focus().setComment(comment.id).run();
    addComment(comment);
    setShowCommentInput(false);
    setNewCommentText("");
    setActiveCommentId(comment.id);
  }, [editor, activeChapterId, newCommentText, addComment, setActiveCommentId]);

  const handleResolve = useCallback(
    (commentId: string) => {
      if (!editor) return;
      editor.chain().focus().unsetComment(commentId).run();
      resolveComment(commentId);
    },
    [editor, resolveComment]
  );

  const submitReply = useCallback(
    (commentId: string) => {
      if (!replyText.trim()) return;
      const reply: CommentReply = {
        id: crypto.randomUUID(),
        text: replyText.trim(),
        createdAt: new Date().toISOString(),
      };
      addCommentReply(commentId, reply);
      setReplyingTo(null);
      setReplyText("");
    },
    [replyText, addCommentReply]
  );

  const scrollToComment = useCallback(
    (commentId: string) => {
      if (!editor) return;
      const { doc } = editor.state;
      const markType = editor.schema.marks.comment;
      if (!markType) return;

      let targetPos: number | null = null;
      doc.descendants((node, pos) => {
        if (targetPos !== null) return false;
        for (const mark of node.marks) {
          if (mark.type === markType && mark.attrs.commentId === commentId) {
            targetPos = pos;
            return false;
          }
        }
        return true;
      });

      if (targetPos !== null) {
        editor.chain().focus().setTextSelection(targetPos).scrollIntoView().run();
      }
      setActiveCommentId(commentId);
    },
    [editor, setActiveCommentId]
  );

  const handleBibleRefHover = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!editor) {
        setHoveredBibleRef(null);
        return;
      }
      const refElement = resolveBibleRefElementAtCoords(editor, event.clientX, event.clientY);
      if (!refElement) {
        setHoveredBibleRef(null);
        return;
      }
      const id = refElement.dataset.bibleId;
      const section = refElement.dataset.bibleSection as BibleSection | undefined;
      if (!id || !section) {
        setHoveredBibleRef(null);
        return;
      }
      const entry = bibleRefEntryMap.get(`${section}:${id}`);
      if (!entry) {
        setHoveredBibleRef(null);
        return;
      }
      const rect = refElement.getBoundingClientRect();
      const maxLeft = Math.max(180, window.innerWidth - 220);
      const left = Math.max(140, Math.min(maxLeft, rect.left + rect.width / 2));
      setHoveredBibleRef({
        section: entry.section,
        id: entry.id,
        name: entry.name,
        label: refElement.dataset.bibleLabel ?? entry.section,
        summary: truncate(entry.summary, 170),
        aliases: entry.aliases.filter((alias) => alias.trim().length > 0),
        top: rect.bottom + 10,
        left,
      });
    },
    [editor, bibleRefEntryMap]
  );

  if (!project) return null;

  const excludeNonChapters = useProjectStore((s) => s.exportConfig.excludeNonChapters);
  const totalWords = project.chapters
    .filter((ch) => !excludeNonChapters || isChapterType(ch.sectionType))
    .reduce((sum, ch) => sum + ch.wordCount, 0);
  const currentWords = editor?.storage.characterCount.words() ?? 0;
  const currentChars = editor?.storage.characterCount.characters() ?? 0;

  const slashActions = [
    { label: "Continue writing", run: () => void runAiOnSelection("Continue writing the scene naturally."), ai: true },
    { label: "Write next paragraph", run: () => void runAiOnSelection("Write one next paragraph only."), ai: true },
    { label: "Add scene break", run: () => editor?.chain().focus().insertContent("\n\n## Scene break\n\n").run(), ai: false },
    { label: "Add dialogue", run: () => void runAiOnSelection("Insert a short dialogue exchange that fits the scene."), ai: true },
    { label: "Add description", run: () => void runAiOnSelection("Add sensory description while preserving pace."), ai: true },
    { label: "Rewrite paragraph", run: () => void runAiOnSelection("Rewrite this paragraph for clarity and voice."), ai: true },
    { label: "Expand paragraph", run: () => void runAiOnSelection("Expand this paragraph with richer detail."), ai: true },
    { label: "Shorten paragraph", run: () => void runAiOnSelection("Shorten this paragraph while preserving meaning."), ai: true },
  ];

  return (
    <div className={`manuscript-container ${focusMode ? "focus-mode" : ""} ${aiLocked ? "ai-locked" : ""}`}>
      {!focusMode && (
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">Chapters</div>
            <div className="sidebar-subtitle">Select a chapter to edit</div>
          </div>
          <div className="sidebar-content">
            {project.chapters.length === 0 ? (
              <div style={{ padding: "var(--space-md)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No chapters yet.
                <br />
                <button className="btn btn-sm mt-md" onClick={() => setActiveTab("plan")}>
                  Go to Chapter Plan
                </button>
              </div>
            ) : (
              sidebarEntries.map((entry) =>
                entry.type === "act" ? (
                  <div key={`act-${entry.actId}`} className="sidebar-act-separator">
                    {entry.label}
                  </div>
                ) : (
                  <div
                    key={entry.chapter.id}
                    className={`sidebar-item ${activeChapterId === entry.chapter.id ? "active" : ""}`}
                    onClick={() => setActiveChapterId(entry.chapter.id)}
                  >
                    <span className="sidebar-item-number">
                      {formatSectionPrefix(entry.chapter.sectionType, chapterNumberMap.get(entry.chapter.id) ?? null)}
                    </span>
                    <span>{entry.chapter.title || "Untitled"}</span>
                    <span className="sidebar-item-badge">{entry.chapter.wordCount > 0 ? entry.chapter.wordCount.toLocaleString() : ""}</span>
                  </div>
                )
              )
            )}
          </div>
          <div className="sidebar-footer">
            <button className="btn btn-sm w-full" onClick={addChapter} disabled={!canEdit}>
              + Add Chapter
            </button>
          </div>
        </div>
      )}

      {activeChapter ? (
        <div className="manuscript-editor-area">
          <EditorToolbar editor={editor} canEdit={canEditChapter} />
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 100 }}
              shouldShow={({ editor: tiptapEditor, state }) => {
                if (hideFloatingMenus || !tiptapEditor.isFocused || state.selection.empty) return false;
                const { from, to } = state.selection;
                return to - from >= 2;
              }}
            >
              <div className="bubble-menu">
                <button className="btn btn-sm" onClick={() => editor.chain().focus().toggleHighlight().run()} disabled={!canEditChapter}>
                  Highlight
                </button>
                <button className="btn btn-sm" onClick={handleAddComment}>
                  Comment
                </button>
                <button className="btn btn-sm" disabled={aiLocked || !canEditChapter} onClick={() => void runAiOnSelection("Expand this selection.")}>
                  Expand
                </button>
                <button className="btn btn-sm" disabled={aiLocked || !canEditChapter} onClick={() => void runAiOnSelection("Shorten this selection.")}>
                  Shorten
                </button>
                <button className="btn btn-sm" disabled={aiLocked || !canEditChapter} onClick={() => void runAiOnSelection("Fix grammar and punctuation only.")}>
                  Grammar
                </button>
                <button className="btn btn-sm" disabled={aiLocked || !canEditChapter} onClick={() => setShowSelectionPrompt(true)}>
                  Edit...
                </button>
              </div>
            </BubbleMenu>
          )}
          <div
            className="editor-container"
            onClick={() => setShowSlashMenu(false)}
            onMouseMove={handleBibleRefHover}
            onMouseLeave={() => setHoveredBibleRef(null)}
          >
            <div className="editor-page">
              {!canEdit && (
                <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                  View-only mode. You can add comments, but editing is disabled for this role.
                </div>
              )}
              {activeChapter && chapterConflicts[activeChapter.id] && (
                <div className="card" style={{ marginBottom: 12, padding: 12 }}>
                  <div>{chapterConflicts[activeChapter.id]}</div>
                  <div className="flex-row gap-sm" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-sm" onClick={() => setShowConflictReview((value) => !value)}>
                      {showConflictReview ? "Hide Review" : "Review Changes"}
                    </button>
                    <button className="btn btn-sm" onClick={() => void acceptRemoteChapterConflict(activeChapter.id)}>
                      Use Remote Version
                    </button>
                    <button className="btn btn-sm" onClick={() => void overwriteRemoteChapterConflict(activeChapter.id)}>
                      Keep My Draft
                    </button>
                  </div>
                  {showConflictReview && (
                    <div style={{ marginTop: 12 }}>
                      {!activeConflictDetails ? (
                        <div className="font-mono">Loading remote version…</div>
                      ) : (
                        <>
                          <div className="font-mono" style={{ marginBottom: 8 }}>
                            Remote version {activeConflictDetails.remoteVersion ?? "?"}
                            {activeConflictDetails.remoteUpdatedAt
                              ? ` · ${new Date(activeConflictDetails.remoteUpdatedAt).toLocaleString()}`
                              : ""}
                          </div>
                          <div className="diff-content">
                            {conflictDiffSegments.map((segment, index) => (
                              <span
                                key={`${segment.type}-${index}`}
                                className={
                                  segment.type === "added"
                                    ? "diff-added"
                                    : segment.type === "removed"
                                      ? "diff-removed"
                                      : undefined
                                }
                              >
                                {segment.value}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              <h1 className="chapter-heading">
                <span className="chapter-heading-number">
                  {formatSectionLabel(activeChapter.sectionType, chapterNumberMap.get(activeChapter.id) ?? null)} —{" "}
                </span>
                <input
                  type="text"
                  className="chapter-heading-title"
                  value={activeChapter.title || ""}
                  onChange={(e) => updateChapter(activeChapter.id, { title: e.target.value })}
                  placeholder="Untitled"
                  spellCheck={false}
                  readOnly={!canEditChapter}
                />
              </h1>
              <EditorContent editor={editor} />
              {showSlashMenu && (
                <div className="slash-menu">
                  {slashActions.map((action) => (
                    <button
                      key={action.label}
                      className="slash-menu-item"
                      disabled={!canEditChapter || (action.ai && aiLocked)}
                      onClick={() => {
                        if (!canEditChapter || (action.ai && aiLocked)) return;
                        action.run();
                        setShowSlashMenu(false);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {hoveredBibleRef && (
              <div
                className="bible-tooltip"
                style={{ top: hoveredBibleRef.top, left: hoveredBibleRef.left }}
              >
                <div className="bible-tooltip-title">
                  {hoveredBibleRef.name}
                  <span className="bible-tooltip-badge">{hoveredBibleRef.label}</span>
                </div>
                {hoveredBibleRef.summary && (
                  <div className="bible-tooltip-summary">{hoveredBibleRef.summary}</div>
                )}
                {hoveredBibleRef.aliases.length > 0 && (
                  <div className="bible-tooltip-aliases">
                    Also known as: {hoveredBibleRef.aliases.slice(0, 4).join(", ")}
                  </div>
                )}
                <div className="bible-tooltip-hint">Click to open in Bible</div>
              </div>
            )}
          </div>
          <div className="word-count-bar">
            <span>
              {formatSectionLabel(activeChapter.sectionType, chapterNumberMap.get(activeChapter.id) ?? null)}
              {activeChapter.title ? `: ${activeChapter.title}` : ""}
            </span>
            <span>
              {currentWords.toLocaleString()} words (~{estimatePages(currentWords)} pages) · {currentChars.toLocaleString()} characters
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <div className="empty-state">
            <div className="empty-state-title">{project.chapters.length === 0 ? "No chapters yet" : "Select a chapter"}</div>
            <div className="empty-state-text">
              {project.chapters.length === 0
                ? "Add chapters in the Chapter Plan tab or generate them from the Brief."
                : "Choose a chapter from the sidebar to start writing."}
            </div>
            {project.chapters.length === 0 && (
              <button className="btn btn-primary" onClick={() => setActiveTab("plan")}>
                Go to Chapter Plan
              </button>
            )}
          </div>
        </div>
      )}

      {!focusMode && (
        <div className="right-panel">
          <div className="right-panel-section">
            <div className="right-panel-title">Manuscript</div>
            <div className="stat" style={{ marginBottom: 8 }}>
              <div className="stat-value">{totalWords.toLocaleString()}</div>
              <div className="stat-label">Total Words (~{estimatePages(totalWords)} pages)</div>
            </div>
            <div className="font-mono">{project.chapters.length} sections</div>
            {project.brief.targetWordCount > 0 && (
              <>
                <div className="font-mono" style={{ marginTop: 8 }}>
                  Target {project.brief.targetWordCount.toLocaleString()} (~{estimatePages(project.brief.targetWordCount)} pages)
                </div>
                <div className="progress-bar mt-md">
                  <div className="progress-fill" style={{ width: `${Math.min(100, (totalWords / project.brief.targetWordCount) * 100)}%` }} />
                </div>
              </>
            )}
          </div>

          <div className="right-panel-section">
            <div className="right-panel-title">
              Comments
              {chapterComments.length > 0 && (
                <span className="comment-count-badge">{chapterComments.length}</span>
              )}
            </div>
            <div className="comments-list">
              {!activeChapter ? (
                <div className="font-mono">Select a chapter to view comments</div>
              ) : chapterComments.length === 0 && !showCommentInput ? (
                <div className="font-mono">No comments yet. Select text and click "Comment" to add one.</div>
              ) : (
                <>
                  {showCommentInput && (
                    <div className="comment-card comment-card-new">
                      <textarea
                        ref={commentInputRef}
                        className="comment-input"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        placeholder="Write your comment..."
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            submitComment();
                          }
                          if (e.key === "Escape") {
                            setShowCommentInput(false);
                            setNewCommentText("");
                          }
                        }}
                      />
                      <div className="comment-card-actions">
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setShowCommentInput(false);
                            setNewCommentText("");
                          }}
                        >
                          Cancel
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={!newCommentText.trim()}>
                          Add Comment
                        </button>
                      </div>
                    </div>
                  )}
                  {chapterComments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`comment-card ${activeCommentId === comment.id ? "comment-card-active" : ""}`}
                      onClick={() => scrollToComment(comment.id)}
                    >
                      <div className="comment-quoted">{comment.quotedText}</div>
                      <div className="comment-text">{comment.text}</div>
                      <div className="comment-meta">
                        {new Date(comment.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {comment.replies.length > 0 && (
                        <div className="comment-replies">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="comment-reply">
                              <div className="comment-reply-text">{reply.text}</div>
                              <div className="comment-meta">
                                {new Date(reply.createdAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="comment-card-actions">
                        {replyingTo === comment.id ? (
                          <div className="comment-reply-form">
                            <textarea
                              className="comment-input comment-input-sm"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Reply..."
                              rows={2}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  submitReply(comment.id);
                                }
                                if (e.key === "Escape") {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }
                              }}
                            />
                            <div className="comment-card-actions">
                              <button
                                className="btn btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  submitReply(comment.id);
                                }}
                                disabled={!replyText.trim()}
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplyingTo(comment.id);
                                setReplyText("");
                              }}
                            >
                              Reply
                            </button>
                            <button
                              className="btn btn-sm comment-resolve-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolve(comment.id);
                              }}
                            >
                              Resolve
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="right-panel-section">
            <div className="right-panel-title">Scenes (H2 Anchors)</div>
            <div className="right-panel-actions">
              {!activeChapter ? (
                <div className="font-mono">Select a chapter to view scenes</div>
              ) : sceneHeadings.length > 0 ? (
                sceneHeadings.map((scene, index) => (
                  <button
                    key={scene.id}
                    className="scene-nav-link"
                    onClick={() => jumpToHeading(scene.pos)}
                    title="Jump to scene heading"
                  >
                    <span className="scene-nav-index">{index + 1}</span>
                    <span className="scene-nav-label">{scene.label}</span>
                  </button>
                ))
              ) : (
                <div className="font-mono">No H2 scene headings found. Add scene titles as H2 in the manuscript.</div>
              )}
            </div>
          </div>

          <div className="right-panel-section">
            <div className="right-panel-title">Actions</div>
            <div className="right-panel-actions">
              <button className="btn w-full" onClick={() => void saveToStorage()}>
                Save Project
              </button>
              <button className="btn w-full" onClick={() => void useProjectStore.getState().saveSnapshot()} disabled={!canEdit}>
                Save Snapshot
              </button>
              <button className="btn w-full" onClick={() => void useProjectStore.getState().setActiveTab("manage")}>
                Export Manuscript
              </button>
              <button className="btn w-full" disabled={aiLocked || !canEditChapter} onClick={() => setShowAskEditor(true)}>
                {aiPhase === "running" ? "Thinking..." : "Ask the Editor..."}
              </button>
              <button
                className="btn w-full"
                disabled={aiLocked || !canEditChapter}
                onClick={() => void runAiOnSelection("Polish for rhythm and lyric clarity while preserving voice.")}
              >
                {aiPhase === "running" ? "Generating..." : "Polish / Lyric Pass"}
              </button>
              <button className="btn w-full" onClick={() => void useProjectStore.getState().setActiveTab("bible")}>
                Refresh Bible
              </button>
              <div className="font-mono">Sync: {syncStatus}</div>
            </div>
          </div>

          <div className="right-panel-section">
            <div className="right-panel-title">Progress</div>
            <div className="font-mono">Today: +{progressStats.todayWords} words</div>
            <div className="font-mono">Week: +{progressStats.weekWords} words</div>
            <div className="font-mono">Month: +{progressStats.monthWords} words</div>
            <button className="btn btn-sm mt-md" onClick={() => void refreshProgress()}>
              Refresh Stats
            </button>
          </div>

          {activeChapter && (
            <div className="right-panel-section">
              <div className="right-panel-title">Writing Dials</div>
              {(
                [
                  ["words", "Words", 1000, 6000, 250],
                  ["lyricism", "Lyricism", 0, 4, 1],
                  ["dialogue", "Dialogue", 0, 4, 1],
                  ["metaphor", "Metaphor", 0, 4, 1],
                  ["pacing", "Pacing", 0, 4, 1],
                  ["humour", "Humour", 0, 4, 1],
                  ["texture", "Texture", 0, 4, 1],
                  ["clarity", "Clarity", 0, 4, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key} className="dial-row">
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={activeChapter.writingDials[key]}
                    disabled={!canEditChapter}
                    onChange={(e) =>
                      updateChapter(activeChapter.id, {
                        writingDials: { ...activeChapter.writingDials, [key]: Number(e.target.value) },
                      })
                    }
                  />
                  <span className="font-mono">{activeChapter.writingDials[key]}</span>
                </label>
              ))}
            </div>
          )}

          <div className="right-panel-content">
            {(aiPhase === "running" || aiStatusMessage) && (
              <div className={`ai-status ${aiPhase === "running" ? "is-running" : ""}`}>
                {aiPhase === "running" ? aiBusyLabel || "AI is working..." : aiStatusMessage}
              </div>
            )}
            <div className="right-panel-title">General Notes</div>
            <textarea
              className="form-textarea"
              placeholder="Freeform notes about your manuscript..."
              value={project.generalNotes}
              disabled={!canEditChapter}
              onChange={(e) => updateGeneralNotes(e.target.value)}
              style={{ minHeight: 200 }}
            />
            {askEditorResponse && (
              <>
                <div className="right-panel-title mt-md">Editor Notes</div>
                <div className="ai-note-output">{askEditorResponse}</div>
              </>
            )}
          </div>
        </div>
      )}

      {showAskEditor && (
        <div className="modal-overlay" onClick={() => setShowAskEditor(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <div className="modal-title">Ask the Editor — {activeChapter?.title || "Current chapter"}</div>
              <div className="modal-actions">
                <button className="btn btn-sm" onClick={() => setShowAskEditor(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={aiLocked}
                  onClick={() => void requestAskEditorNotes()}
                >
                  {aiPhase === "running" ? "Thinking..." : "Ask the Editor"}
                </button>
              </div>
            </div>
            <div className="modal-body">
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={askEditorForm.structure}
                  onChange={(e) => setAskEditorForm((prev) => ({ ...prev, structure: e.target.checked }))}
                />
                Structural & dramatic
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={askEditorForm.continuity}
                  onChange={(e) => setAskEditorForm((prev) => ({ ...prev, continuity: e.target.checked }))}
                />
                Continuity & consistency
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={askEditorForm.craft}
                  onChange={(e) => setAskEditorForm((prev) => ({ ...prev, craft: e.target.checked }))}
                />
                Craft & voice
              </label>
              <div className="form-group">
                <label className="form-label">Anything specific to focus on? (optional)</label>
                <textarea
                  className="form-textarea"
                  value={askEditorForm.focus}
                  onChange={(e) => setAskEditorForm((prev) => ({ ...prev, focus: e.target.value }))}
                  rows={5}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {aiPhase === "running" && (
        <div className="modal-overlay ai-running-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="modal ai-running-modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="ai-running-spinner" aria-hidden="true" />
            <div className="ai-running-title">AI is working...</div>
            <div className="ai-running-text">{aiBusyLabel || "Thinking through your request and preparing a proposal."}</div>
          </div>
        </div>
      )}

      {aiPhase === "review" && aiReviewPayload && (
        <div className="modal-overlay ai-review-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="modal ai-review-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <div className="modal-title">
                {aiReviewPayload.kind === "editor-notes" ? aiReviewPayload.title : "Review AI Proposal"}
              </div>
              <div className="modal-actions">
                {aiReviewPayload.kind === "editor-notes" ? (
                  <button className="btn btn-primary btn-sm" onClick={acceptAiReview}>
                    Done
                  </button>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={rejectAiReview}>
                      Reject
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={acceptAiReview}>
                      Accept
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="modal-body">
              {aiReviewPayload.kind === "selection-edit" && (
                <div className="ai-review-meta">
                  <span className="ai-review-label">Selection Edit</span>
                  <span className="ai-review-title">{aiReviewPayload.title}</span>
                </div>
              )}
              {aiReviewPayload.kind === "selection-edit" ? (
                <>
                  <div className="ai-review-grid">
                    <div className="ai-review-panel">
                      <div className="ai-review-panel-title">Before</div>
                      <pre className="ai-review-text">{aiReviewPayload.beforeText || "No previous content."}</pre>
                    </div>
                    <div className="ai-review-panel">
                      <div className="ai-review-panel-title">After</div>
                      <div
                        ref={aiAfterEditorRef}
                        className={`ai-review-editor ${hasManualAiEdits ? "is-manual" : ""}`}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        onInput={handleAiDraftInput}
                      />
                    </div>
                  </div>
                  <div className="ai-review-panel">
                    <div className="ai-review-panel-title">Inline Diff (Editable)</div>
                    <div
                      ref={aiInlineEditorRef}
                      className={`ai-review-editor ai-inline-editor ${hasManualAiEdits ? "is-manual" : ""}`}
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-multiline="true"
                      onInput={handleAiDraftInput}
                    />
                    <div className="ai-inline-diff">
                      {aiDiffSegments.map((segment, index) => (
                        <span key={`${segment.type}-${index}`} className={`ai-diff-token ai-diff-${segment.type}`}>
                          {segment.value}
                        </span>
                      ))}
                    </div>
                    {hasManualAiEdits && (
                      <div className="ai-manual-diff">
                        {aiManualDiffSegments.map((segment, index) => (
                          <span
                            key={`manual-${segment.type}-${index}`}
                            className={`ai-diff-token ${segment.type === "same" ? "" : "ai-diff-manual"}`}
                          >
                            {segment.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="ai-review-panel">
                  <div className="editor-report">
                    {reportLines.length === 0 ? (
                      <p className="editor-report-paragraph">{aiReviewAfterDraft}</p>
                    ) : (
                      reportLines.map((line, index) => {
                        if (line.type === "heading") {
                          return (
                            <h3 key={`line-${index}`} className="editor-report-heading">
                              {renderReportText(line.text)}
                            </h3>
                          );
                        }
                        if (line.type === "subheading") {
                          return (
                            <h4 key={`line-${index}`} className="editor-report-subheading">
                              {renderReportText(line.text)}
                            </h4>
                          );
                        }
                        if (line.type === "bullet") {
                          return (
                            <div key={`line-${index}`} className="editor-report-bullet">
                              <span className="editor-report-marker">-</span>
                              <span>{renderReportText(line.text)}</span>
                            </div>
                          );
                        }
                        if (line.type === "numbered") {
                          return (
                            <div key={`line-${index}`} className="editor-report-bullet">
                              <span className="editor-report-marker">{index + 1}.</span>
                              <span>{renderReportText(line.text)}</span>
                            </div>
                          );
                        }
                        return (
                          <p key={`line-${index}`} className="editor-report-paragraph">
                            {renderReportText(line.text)}
                          </p>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSelectionPrompt && (
        <div className="modal-overlay" onClick={() => setShowSelectionPrompt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div className="modal-title">Custom Edit Prompt</div>
            </div>
            <div className="modal-body">
              <textarea
                className="form-textarea"
                value={selectionPrompt}
                placeholder="Describe how to edit the selection..."
                onChange={(e) => setSelectionPrompt(e.target.value)}
              />
              <div className="modal-actions">
                <button className="btn btn-sm" onClick={() => setShowSelectionPrompt(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={aiLocked}
                  onClick={async () => {
                    await runAiOnSelection(selectionPrompt || "Rewrite this section.");
                    setSelectionPrompt("");
                    setShowSelectionPrompt(false);
                  }}
                >
                  {aiPhase === "running" ? "Generating..." : "Apply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

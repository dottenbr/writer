import { useMemo, type ReactNode } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useBookStore } from "../../store/useBookStore";
import type { ChapterInfo, Entity } from "../../lib/book-model";
import { entityMatcher } from "../../lib/book-model";

export function useAccess() {
  const role = useProjectStore(s => s.currentProjectRole);
  const projectId = useProjectStore(s => s.currentProjectId);
  const userId = useAuthStore(s => s.userId) ?? "";
  const isOwner = role === "owner";
  const canEdit = isOwner || role === "coauthor" || role === "editor";
  return { role, projectId, userId, isOwner, canEdit, suggesting: canEdit && !isOwner };
}

export function useEntityMatcher() {
  const entities = useBookStore(s => s.model?.entities);
  return useMemo(() => entityMatcher(entities ?? []), [entities]);
}

export function chapterForPath(chapters: ChapterInfo[] | undefined, path: string): ChapterInfo | undefined {
  return chapters?.find(c => c.authorPath === path || c.referencePath === path);
}

export const STATUS_LABEL: Record<string, string> = {
  drafting: "In progress",
  drafted: "Written",
  revised: "Revised",
  final: "Final",
};

export function chapterState(c: ChapterInfo): { key: "written" | "progress" | "draft"; label: string } {
  if (c.authorPath && !c.started) return { key: "written", label: STATUS_LABEL[c.status] ?? "Written" };
  if (c.authorPath) return { key: "progress", label: "In progress" };
  return { key: "draft", label: c.referencePath ? "Reference draft" : "Not started" };
}

export const KIND_LABEL: Record<Entity["kind"], string> = {
  character: "Character",
  place: "Place",
  organization: "Organization",
  motif: "Motif",
  entry: "Entry",
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm0 15A2.5 2.5 0 0 0 6.5 23H20v-5" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    back: <path d="m15 6-6 6 6 6" />,
    more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    feather: <><path d="M20 4c-6 0-12 4-13.5 11.5L5 20" /><path d="M20 4c0 7-5 12-12 12" /><path d="M9 15h5" /></>,
    down: <path d="m6 9 6 6 6-6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    focus: <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />,
    undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
    redo: <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />,
    bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
    italic: <path d="M14 5h-4M14 19h-4M14 5l-4 14" />,
    strike: <path d="M5 12h14M16 7a4 4 0 0 0-4-2c-2.2 0-4 1.3-4 3 0 1 .6 1.8 1.6 2.4M8 17a4 4 0 0 0 4 2c2.2 0 4-1.3 4-3 0-.6-.2-1.2-.6-1.7" />,
    bullets: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
    numbers: <path d="M10 6h10M10 12h10M10 18h10M4 4h1v4M4 14h2l-2 3h2" />,
    quote: <path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6" />,
    divider: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
    sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    pen: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    pin: <><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    file: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Zm0 0v5h5" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    logout: <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />,
    download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
    check: <path d="m5 12 5 5 9-10" />,
    link: <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
    code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? null}
    </svg>
  );
}

export function initials(name: string) {
  if (name.includes("@")) name = name.split("@")[0].replace(/[._-]+/g, " ");
  const stripped = name.replace(/[“"][^”"]*[”"]/g, " ");
  const unquoted = /\p{L}/u.test(stripped) ? stripped : name.replace(/[“”"]/g, " ");
  const words = unquoted.replace(/\([^)]*\)/g, " ").split(/[\s@._-]+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  const pick = words.length > 2 ? [words[0], words[words.length - 1]] : words.slice(0, 2);
  return pick.map(s => s[0]!.toUpperCase()).join("") || "?";
}

export function formatWords(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString();
}

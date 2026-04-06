export interface ProjectAct {
  id: string;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  storagePath?: string;
  brief: Brief;
  acts: ProjectAct[];
  chapters: Chapter[];
  bible: Bible;
  settings: ProjectSettings;
  generalNotes: string;
}

export interface Brief {
  title: string;
  subtitle: string;
  genre: string;
  logline: string;
  themes: string[];
  synopsis: string;
  targetWordCount: number;
  writingStyle: string;
  audience: string;
  comparableTitles: string;
  notes: string;
}

export type SectionType =
  | "chapter"
  | "prologue"
  | "epilogue"
  | "foreword"
  | "afterword"
  | "authors_note";

export const SECTION_TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: "chapter", label: "Chapter" },
  { value: "prologue", label: "Prologue" },
  { value: "epilogue", label: "Epilogue" },
  { value: "foreword", label: "Foreword" },
  { value: "afterword", label: "Afterword" },
  { value: "authors_note", label: "Author's Note" },
];

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  chapter: "Chapter",
  prologue: "Prologue",
  epilogue: "Epilogue",
  foreword: "Foreword",
  afterword: "Afterword",
  authors_note: "Author's Note",
};

export function isChapterType(sectionType: SectionType | undefined): boolean {
  return !sectionType || sectionType === "chapter";
}

export function formatSectionHeading(
  sectionType: SectionType | undefined,
  chapterNumber: number | null,
  title: string
): string {
  const st = sectionType ?? "chapter";
  const label = SECTION_TYPE_LABELS[st];
  if (st === "chapter" && chapterNumber != null) {
    return title ? `${label} ${chapterNumber} — ${title}` : `${label} ${chapterNumber}`;
  }
  return title ? `${label} — ${title}` : label;
}

const SECTION_TYPE_SHORT: Record<SectionType, string> = {
  chapter: "Ch.",
  prologue: "Pro.",
  epilogue: "Epi.",
  foreword: "Fwd.",
  afterword: "Aft.",
  authors_note: "A.N.",
};

/** Full label for headings/display: "Chapter 3", "Author's Note" */
export function formatSectionLabel(
  sectionType: SectionType | undefined,
  chapterNumber: number | null
): string {
  const st = sectionType ?? "chapter";
  if (st === "chapter" && chapterNumber != null) {
    return `Chapter ${chapterNumber}`;
  }
  return SECTION_TYPE_LABELS[st];
}

/** Short prefix for sidebars/compact UI: "Ch. 3", "A.N." */
export function formatSectionPrefix(
  sectionType: SectionType | undefined,
  chapterNumber: number | null
): string {
  const st = sectionType ?? "chapter";
  if (st === "chapter" && chapterNumber != null) {
    return `Ch. ${chapterNumber}`;
  }
  return SECTION_TYPE_SHORT[st];
}

export function deriveChapterNumbers(chapters: Chapter[]): Map<string, number> {
  const map = new Map<string, number>();
  let num = 0;
  for (const ch of chapters) {
    if (isChapterType(ch.sectionType)) {
      num += 1;
      map.set(ch.id, num);
    }
  }
  return map;
}

export interface Chapter {
  id: string;
  number: number;
  sectionType: SectionType;
  title: string;
  act: string | null;
  summary: string;
  scenes: Scene[];
  content: string;
  notes: string;
  wordCount: number;
  status: "outline" | "draft" | "revision" | "polished";
  writingDials: WritingDials;
}

export interface WritingDials {
  words: number;
  lyricism: number;
  dialogue: number;
  metaphor: number;
  pacing: number;
  humour: number;
  texture: number;
  clarity: number;
}

export interface Scene {
  id: string;
  title: string;
  summary: string;
  pov: string;
  location: string;
  characters: string[];
  notes: string;
  wordTarget: number;
}

export interface Bible {
  characters: Character[];
  threads: Thread[];
  locations: Location[];
  codex: CodexEntry[];
}

export interface Character {
  id: string;
  name: string;
  alsoKnownAs: string[];
  role: "protagonist" | "antagonist" | "supporting" | "minor" | "mentioned";
  age: string;
  description: string;
  backstory: string;
  motivation: string;
  arc: string;
  relationships: CharacterRelationship[];
  personality: string;
  strengths: string;
  weaknesses: string;
  internalConflict: string;
  physicalPresence: string;
  knows: string;
  believes: string;
  conceals: string;
  blindSpots: string;
  fears: string;
  hopes: string;
  draftingNote: string;
  notes: string;
}

export interface CharacterRelationship {
  id: string;
  withCharacterId: string;
  type:
    | "family"
    | "friendship"
    | "romantic"
    | "professional"
    | "mentor"
    | "rivalry"
    | "conflict"
    | "other";
  description: string;
}

export interface Thread {
  id: string;
  name: string;
  alsoKnownAs: string[];
  type: "main" | "subplot" | "thematic" | "mystery" | "romance";
  timeframe: string;
  description: string;
  chapters: number[];
  historicalAnchors: string[];
  continuityChecks: string;
  sources: string[];
  resolution: string;
  notes: string;
}

export interface Location {
  id: string;
  name: string;
  alsoKnownAs: string[];
  timeframe: string;
  geoContext: string;
  description: string;
  historicalContext: string;
  significance: string;
  sensoryDetails: string;
  sources: string[];
  notes: string;
}

export interface CodexEntry {
  id: string;
  entryType: "event" | "institution" | "term" | "person" | "timeline" | "doctrine" | "constraint";
  category: string;
  name: string;
  alsoKnownAs: string[];
  timeframe: string;
  sources: string[];
  content: string;
}

export interface ProjectSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  darkMode: boolean;
}

export interface ChapterProjectMeta {
  act: string | null;
  sectionType?: SectionType;
  status: Chapter["status"];
  scenes: Scene[];
  notes: string;
  writingDials: WritingDials;
}

export interface ProjectJson {
  brief?: Partial<
    Pick<
      Brief,
      | "title"
      | "subtitle"
      | "genre"
      | "logline"
      | "themes"
      | "targetWordCount"
      | "audience"
      | "comparableTitles"
    >
  >;
  acts?: ProjectAct[];
  chapterMeta?: Record<string, ChapterProjectMeta>;
  generalNotes?: string;
}

export interface InspirationItem {
  id: string;
  fileName: string;
  label: string;
  tags: string[];
  notes: string;
  addedAt: string;
}

export type TabId = "brief" | "plan" | "bible" | "manuscript" | "inspiration" | "manage";

export type BibleSection =
  | "characters"
  | "threads"
  | "locations"
  | "codex";

export interface CommentReply {
  id: string;
  text: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  chapterId: string;
  text: string;
  quotedText: string;
  createdAt: string;
  replies: CommentReply[];
}

export function createDefaultProject(name: string): Project {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    brief: {
      title: "",
      subtitle: "",
      genre: "",
      logline: "",
      themes: [],
      synopsis: "",
      targetWordCount: 80000,
      writingStyle: "",
      audience: "",
      comparableTitles: "",
      notes: "",
    },
    acts: [],
    chapters: [],
    bible: {
      characters: [],
      threads: [],
      locations: [],
      codex: [],
    },
    settings: {
      fontFamily: "Source Serif 4",
      fontSize: 18,
      lineHeight: 1.8,
      darkMode: false,
    },
    generalNotes: "",
  };
}

export function createDefaultChapter(number: number, sectionType: SectionType = "chapter"): Chapter {
  return {
    id: crypto.randomUUID(),
    number,
    sectionType,
    title: "",
    act: null,
    summary: "",
    scenes: [],
    content: "",
    notes: "",
    wordCount: 0,
    status: "outline",
    writingDials: {
      words: 3000,
      lyricism: 2,
      dialogue: 2,
      metaphor: 2,
      pacing: 2,
      humour: 1,
      texture: 2,
      clarity: 2,
    },
  };
}

export function createDefaultScene(): Scene {
  return {
    id: crypto.randomUUID(),
    title: "",
    summary: "",
    pov: "",
    location: "",
    characters: [],
    notes: "",
    wordTarget: 1500,
  };
}

export function createDefaultCharacter(): Character {
  return {
    id: crypto.randomUUID(),
    name: "New Character",
    alsoKnownAs: [],
    role: "supporting",
    age: "",
    description: "",
    backstory: "",
    motivation: "",
    arc: "",
    relationships: [],
    personality: "",
    strengths: "",
    weaknesses: "",
    internalConflict: "",
    physicalPresence: "",
    knows: "",
    believes: "",
    conceals: "",
    blindSpots: "",
    fears: "",
    hopes: "",
    draftingNote: "",
    notes: "",
  };
}

export function createDefaultThread(): Thread {
  return {
    id: crypto.randomUUID(),
    name: "New Thread",
    alsoKnownAs: [],
    type: "subplot",
    timeframe: "",
    description: "",
    chapters: [],
    historicalAnchors: [],
    continuityChecks: "",
    sources: [],
    resolution: "",
    notes: "",
  };
}

export function createDefaultLocation(): Location {
  return {
    id: crypto.randomUUID(),
    name: "New Location",
    alsoKnownAs: [],
    timeframe: "",
    geoContext: "",
    description: "",
    historicalContext: "",
    significance: "",
    sensoryDetails: "",
    sources: [],
    notes: "",
  };
}

export function createDefaultCodexEntry(): CodexEntry {
  return {
    id: crypto.randomUUID(),
    entryType: "term",
    category: "General",
    name: "New Entry",
    alsoKnownAs: [],
    timeframe: "",
    sources: [],
    content: "",
  };
}

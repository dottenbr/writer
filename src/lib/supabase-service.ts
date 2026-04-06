/**
 * Supabase storage service — replaces fs-service.ts
 *
 * All project CRUD, collaboration, snapshots, realtime,
 * and inspiration file management goes through here.
 */

import { supabase } from "./supabase-client";
import type {
  Project,
  ProjectAct,
  Brief,
  Chapter,
  Scene,
  Character,
  CharacterRelationship,
  Thread,
  Location,
  CodexEntry,
  Comment,
  CommentReply,
  InspirationItem,
  ProjectSettings,
  WritingDials,
  SectionType,
  TabId,
  BibleSection,
} from "../types";
import { createDefaultProject } from "../types";
import type { ExportConfig } from "./export-config";
import { defaultExportConfig } from "./export-config";
import { htmlToMarkdown, countWords } from "./markdown";
import { buildWordDiff, type DiffSegment } from "./text-diff";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ProjectRole = "owner" | "editor" | "viewer";

export interface LlmSettings {
  anthropicKey?: string;
  openaiKey?: string;
  selectedProvider: "anthropic" | "openai";
  selectedModel: string;
}

export interface WriterConfig {
  lastProjectId?: string;
  lastActiveTab?: TabId;
  lastActiveBibleSection?: BibleSection;
  lastActiveChapterId?: string | null;
}

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
  acceptedAt: string | null;
}

export interface SnapshotEntry {
  id: string;
  date: string;
  message: string;
  wordCount: number;
  authorName: string;
}

export interface ChapterDiff {
  chapterId: string;
  title: string;
  wordCountA: number;
  wordCountB: number;
  diff: DiffSegment[];
}

export interface PresencePayload {
  userId: string;
  displayName: string;
  activeChapterId: string | null;
  activeTab: TabId;
  lastSeen: string;
}

interface RealtimeCallbacks {
  onPresenceChange: (presences: PresencePayload[]) => void;
  onChapterChange: (payload: { eventType: string; new: any; old: any }) => void;
  onCommentChange: (payload: { eventType: string; new: any; old: any }) => void;
}

// ────────────────────────────────────────────────────────────
// Auth
// ────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string, displayName?: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName ?? email.split("@")[0] } },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

// ────────────────────────────────────────────────────────────
// User Config (localStorage — not Supabase)
// ────────────────────────────────────────────────────────────

const CONFIG_KEY = "writer:user-config";

export function readUserConfig(): WriterConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeUserConfig(config: WriterConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

// ────────────────────────────────────────────────────────────
// DB → App type mappers
// ────────────────────────────────────────────────────────────

function mapDbBrief(row: any): Brief {
  return {
    title: row.brief_title ?? "",
    subtitle: row.brief_subtitle ?? "",
    genre: row.brief_genre ?? "",
    logline: row.brief_logline ?? "",
    themes: row.brief_themes ?? [],
    synopsis: row.brief_synopsis ?? "",
    targetWordCount: row.brief_target_word_count ?? 80000,
    writingStyle: row.brief_writing_style ?? "",
    audience: row.brief_audience ?? "",
    comparableTitles: row.brief_comparable_titles ?? "",
    notes: row.brief_notes ?? "",
  };
}

function mapDbWritingDials(row: any): WritingDials {
  return {
    words: row.dial_words ?? 3000,
    lyricism: row.dial_lyricism ?? 2,
    dialogue: row.dial_dialogue ?? 2,
    metaphor: row.dial_metaphor ?? 2,
    pacing: row.dial_pacing ?? 2,
    humour: row.dial_humour ?? 1,
    texture: row.dial_texture ?? 2,
    clarity: row.dial_clarity ?? 2,
  };
}

function mapDbChapter(row: any): Chapter {
  const scenes: Scene[] = (row.scenes ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s: any) => ({
      id: s.id,
      title: s.title ?? "",
      summary: s.summary ?? "",
      pov: s.pov ?? "",
      location: s.location ?? "",
      characters: s.characters ?? [],
      notes: s.notes ?? "",
      wordTarget: s.word_target ?? 1500,
    }));
  return {
    id: row.id,
    number: (row.sort_order ?? 0) + 1,
    sectionType: row.section_type ?? "chapter",
    title: row.title ?? "",
    act: row.act_id ?? null,
    summary: row.summary ?? "",
    scenes,
    content: row.content ?? "",
    notes: row.notes ?? "",
    wordCount: row.word_count ?? 0,
    status: row.status ?? "outline",
    writingDials: mapDbWritingDials(row),
  };
}

function mapDbCharacter(row: any): Character {
  const rels: CharacterRelationship[] = (row.character_relationships ?? []).map((r: any) => ({
    id: r.id,
    withCharacterId: r.with_character_id,
    type: r.type ?? "other",
    description: r.description ?? "",
  }));
  return {
    id: row.id,
    name: row.name ?? "",
    alsoKnownAs: row.also_known_as ?? [],
    role: row.role ?? "supporting",
    age: row.age ?? "",
    description: row.description ?? "",
    backstory: row.backstory ?? "",
    motivation: row.motivation ?? "",
    arc: row.arc ?? "",
    relationships: rels,
    personality: row.personality ?? "",
    strengths: row.strengths ?? "",
    weaknesses: row.weaknesses ?? "",
    internalConflict: row.internal_conflict ?? "",
    physicalPresence: row.physical_presence ?? "",
    knows: row.knows ?? "",
    believes: row.believes ?? "",
    conceals: row.conceals ?? "",
    blindSpots: row.blind_spots ?? "",
    fears: row.fears ?? "",
    hopes: row.hopes ?? "",
    draftingNote: row.drafting_note ?? "",
    notes: row.notes ?? "",
  };
}

function mapDbThread(row: any): Thread {
  return {
    id: row.id,
    name: row.name ?? "",
    alsoKnownAs: row.also_known_as ?? [],
    type: row.type ?? "subplot",
    timeframe: row.timeframe ?? "",
    description: row.description ?? "",
    chapters: row.chapters ?? [],
    historicalAnchors: row.historical_anchors ?? [],
    continuityChecks: row.continuity_checks ?? "",
    sources: row.sources ?? [],
    resolution: row.resolution ?? "",
    notes: row.notes ?? "",
  };
}

function mapDbLocation(row: any): Location {
  return {
    id: row.id,
    name: row.name ?? "",
    alsoKnownAs: row.also_known_as ?? [],
    timeframe: row.timeframe ?? "",
    geoContext: row.geo_context ?? "",
    description: row.description ?? "",
    historicalContext: row.historical_context ?? "",
    significance: row.significance ?? "",
    sensoryDetails: row.sensory_details ?? "",
    sources: row.sources ?? [],
    notes: row.notes ?? "",
  };
}

function mapDbCodexEntry(row: any): CodexEntry {
  return {
    id: row.id,
    entryType: row.entry_type ?? "term",
    category: row.category ?? "General",
    name: row.name ?? "",
    alsoKnownAs: row.also_known_as ?? [],
    timeframe: row.timeframe ?? "",
    sources: row.sources ?? [],
    content: row.content ?? "",
  };
}

function mapDbComment(row: any): Comment {
  const replies: CommentReply[] = (row.comment_replies ?? []).map((r: any) => ({
    id: r.id,
    text: r.text ?? "",
    createdAt: r.created_at ?? "",
  }));
  return {
    id: row.id,
    chapterId: row.chapter_id,
    text: row.text ?? "",
    quotedText: row.quoted_text ?? "",
    createdAt: row.created_at ?? "",
    replies,
  };
}

// ────────────────────────────────────────────────────────────
// Projects
// ────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Array<{ id: string; name: string; role: ProjectRole }>> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Owned projects
  const { data: owned } = await supabase
    .from("projects")
    .select("id, name")
    .eq("owner_id", user.id);

  // Shared projects
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id, role, projects(id, name)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  const results: Array<{ id: string; name: string; role: ProjectRole }> = [];
  for (const p of owned ?? []) {
    results.push({ id: p.id, name: p.name, role: "owner" });
  }
  for (const m of memberships ?? []) {
    const proj = (m as any).projects;
    if (proj && !results.some((r) => r.id === proj.id)) {
      results.push({ id: proj.id, name: proj.name, role: m.role as ProjectRole });
    }
  }
  return results;
}

export async function readProject(projectId: string): Promise<Project> {
  const [
    { data: proj, error: projErr },
    { data: acts },
    { data: chapters },
    { data: characters },
    { data: threads },
    { data: locations },
    { data: codex },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("acts").select("*").eq("project_id", projectId).order("sort_order"),
    supabase.from("chapters").select("*, scenes(*)").eq("project_id", projectId).order("sort_order"),
    supabase.from("characters").select("*, character_relationships(*)").eq("project_id", projectId),
    supabase.from("threads").select("*").eq("project_id", projectId),
    supabase.from("locations").select("*").eq("project_id", projectId),
    supabase.from("codex_entries").select("*").eq("project_id", projectId),
    supabase.from("project_settings").select("*").eq("project_id", projectId).maybeSingle(),
  ]);

  if (projErr || !proj) throw new Error(`Project not found: ${projectId}`);

  const project = createDefaultProject(proj.name);
  project.id = proj.id;
  project.name = proj.name;
  project.createdAt = proj.created_at;
  project.brief = mapDbBrief(proj);
  project.generalNotes = proj.general_notes ?? "";

  project.acts = (acts ?? []).map((a: any) => ({ id: a.id, label: a.label }));

  project.chapters = (chapters ?? []).map(mapDbChapter);

  project.bible = {
    characters: (characters ?? []).map(mapDbCharacter),
    threads: (threads ?? []).map(mapDbThread),
    locations: (locations ?? []).map(mapDbLocation),
    codex: (codex ?? []).map(mapDbCodexEntry),
  };

  if (settingsRow) {
    project.settings = {
      fontFamily: settingsRow.font_family ?? "Source Serif 4",
      fontSize: settingsRow.font_size ?? 18,
      lineHeight: settingsRow.line_height ?? 1.8,
      darkMode: settingsRow.dark_mode ?? false,
    };
  }

  return project;
}

export async function createProject(name: string): Promise<Project> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: proj, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name, brief_title: name })
    .select()
    .single();
  if (error || !proj) throw error ?? new Error("Failed to create project");

  // Create default settings rows
  await Promise.all([
    supabase.from("project_settings").insert({ project_id: proj.id }),
    supabase.from("export_configs").insert({ project_id: proj.id }),
    supabase.from("llm_settings").insert({ project_id: proj.id }),
    supabase.from("project_members").insert({
      project_id: proj.id,
      user_id: user.id,
      role: "owner",
      accepted_at: new Date().toISOString(),
    }),
  ]);

  return readProject(proj.id);
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function saveProjectBrief(projectId: string, brief: Partial<Brief>): Promise<void> {
  const updates: Record<string, any> = {};
  if (brief.title !== undefined) updates.brief_title = brief.title;
  if (brief.subtitle !== undefined) updates.brief_subtitle = brief.subtitle;
  if (brief.genre !== undefined) updates.brief_genre = brief.genre;
  if (brief.logline !== undefined) updates.brief_logline = brief.logline;
  if (brief.themes !== undefined) updates.brief_themes = brief.themes;
  if (brief.synopsis !== undefined) updates.brief_synopsis = brief.synopsis;
  if (brief.targetWordCount !== undefined) updates.brief_target_word_count = brief.targetWordCount;
  if (brief.writingStyle !== undefined) updates.brief_writing_style = brief.writingStyle;
  if (brief.audience !== undefined) updates.brief_audience = brief.audience;
  if (brief.comparableTitles !== undefined) updates.brief_comparable_titles = brief.comparableTitles;
  if (brief.notes !== undefined) updates.brief_notes = brief.notes;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from("projects").update(updates).eq("id", projectId);
  if (error) throw error;
}

export async function saveProjectMeta(
  projectId: string,
  meta: { name?: string; generalNotes?: string }
): Promise<void> {
  const updates: Record<string, any> = {};
  if (meta.name !== undefined) updates.name = meta.name;
  if (meta.generalNotes !== undefined) updates.general_notes = meta.generalNotes;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from("projects").update(updates).eq("id", projectId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Acts
// ────────────────────────────────────────────────────────────

export async function saveActs(projectId: string, acts: ProjectAct[]): Promise<void> {
  // Delete existing and re-insert (simple approach for ordered lists)
  await supabase.from("acts").delete().eq("project_id", projectId);
  if (acts.length === 0) return;
  const rows = acts.map((a, i) => ({
    id: a.id,
    project_id: projectId,
    label: a.label,
    sort_order: i,
  }));
  const { error } = await supabase.from("acts").insert(rows);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Chapters
// ────────────────────────────────────────────────────────────

export async function saveChapter(
  projectId: string,
  chapter: Chapter,
  expectedVersion?: number
): Promise<{ conflict: boolean; serverVersion?: number }> {
  const row: Record<string, any> = {
    id: chapter.id,
    project_id: projectId,
    act_id: chapter.act || null,
    sort_order: chapter.number - 1,
    section_type: chapter.sectionType ?? "chapter",
    title: chapter.title,
    summary: chapter.summary,
    content: chapter.content,
    notes: chapter.notes,
    word_count: chapter.wordCount,
    status: chapter.status,
    dial_words: chapter.writingDials.words,
    dial_lyricism: chapter.writingDials.lyricism,
    dial_dialogue: chapter.writingDials.dialogue,
    dial_metaphor: chapter.writingDials.metaphor,
    dial_pacing: chapter.writingDials.pacing,
    dial_humour: chapter.writingDials.humour,
    dial_texture: chapter.writingDials.texture,
    dial_clarity: chapter.writingDials.clarity,
  };

  if (expectedVersion !== undefined) {
    // Optimistic locking
    const { data, error } = await supabase
      .from("chapters")
      .update({ ...row, version: expectedVersion + 1 })
      .eq("id", chapter.id)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (!data) {
      // Conflict: fetch current version
      const { data: current } = await supabase
        .from("chapters")
        .select("version")
        .eq("id", chapter.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }
    return { conflict: false };
  }

  // Upsert without locking
  const { error } = await supabase.from("chapters").upsert(row);
  if (error) throw error;
  return { conflict: false };
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) throw error;
}

export async function reorderChapters(projectId: string, chapterIds: string[]): Promise<void> {
  for (let i = 0; i < chapterIds.length; i++) {
    await supabase
      .from("chapters")
      .update({ sort_order: i })
      .eq("id", chapterIds[i])
      .eq("project_id", projectId);
  }
}

// ────────────────────────────────────────────────────────────
// Scenes
// ────────────────────────────────────────────────────────────

export async function saveScenes(chapterId: string, scenes: Scene[]): Promise<void> {
  await supabase.from("scenes").delete().eq("chapter_id", chapterId);
  if (scenes.length === 0) return;
  const rows = scenes.map((s, i) => ({
    id: s.id,
    chapter_id: chapterId,
    sort_order: i,
    title: s.title,
    summary: s.summary,
    pov: s.pov,
    location: s.location,
    characters: s.characters,
    notes: s.notes,
    word_target: s.wordTarget,
  }));
  const { error } = await supabase.from("scenes").insert(rows);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Bible: Characters
// ────────────────────────────────────────────────────────────

export async function saveCharacter(projectId: string, character: Character): Promise<void> {
  const { error: charErr } = await supabase.from("characters").upsert({
    id: character.id,
    project_id: projectId,
    name: character.name,
    also_known_as: character.alsoKnownAs,
    role: character.role,
    age: character.age,
    description: character.description,
    backstory: character.backstory,
    motivation: character.motivation,
    arc: character.arc,
    personality: character.personality,
    strengths: character.strengths,
    weaknesses: character.weaknesses,
    internal_conflict: character.internalConflict,
    physical_presence: character.physicalPresence,
    knows: character.knows,
    believes: character.believes,
    conceals: character.conceals,
    blind_spots: character.blindSpots,
    fears: character.fears,
    hopes: character.hopes,
    drafting_note: character.draftingNote,
    notes: character.notes,
  });
  if (charErr) throw charErr;

  // Sync relationships
  await supabase.from("character_relationships").delete().eq("character_id", character.id);
  if (character.relationships.length > 0) {
    const rels = character.relationships
      .filter((r) => r.withCharacterId)
      .map((r) => ({
        id: r.id,
        character_id: character.id,
        with_character_id: r.withCharacterId,
        type: r.type,
        description: r.description,
      }));
    if (rels.length > 0) {
      try { await supabase.from("character_relationships").insert(rels); } catch {}
    }
  }
}

export async function deleteCharacter(characterId: string): Promise<void> {
  await supabase.from("characters").delete().eq("id", characterId);
}

// ────────────────────────────────────────────────────────────
// Bible: Threads
// ────────────────────────────────────────────────────────────

export async function saveThread(projectId: string, thread: Thread): Promise<void> {
  const { error } = await supabase.from("threads").upsert({
    id: thread.id,
    project_id: projectId,
    name: thread.name,
    also_known_as: thread.alsoKnownAs,
    type: thread.type,
    timeframe: thread.timeframe,
    description: thread.description,
    chapters: thread.chapters,
    historical_anchors: thread.historicalAnchors,
    continuity_checks: thread.continuityChecks,
    sources: thread.sources,
    resolution: thread.resolution,
    notes: thread.notes,
  });
  if (error) throw error;
}

export async function deleteThread(threadId: string): Promise<void> {
  await supabase.from("threads").delete().eq("id", threadId);
}

// ────────────────────────────────────────────────────────────
// Bible: Locations
// ────────────────────────────────────────────────────────────

export async function saveLocation(projectId: string, location: Location): Promise<void> {
  const { error } = await supabase.from("locations").upsert({
    id: location.id,
    project_id: projectId,
    name: location.name,
    also_known_as: location.alsoKnownAs,
    timeframe: location.timeframe,
    geo_context: location.geoContext,
    description: location.description,
    historical_context: location.historicalContext,
    significance: location.significance,
    sensory_details: location.sensoryDetails,
    sources: location.sources,
    notes: location.notes,
  });
  if (error) throw error;
}

export async function deleteLocation(locationId: string): Promise<void> {
  await supabase.from("locations").delete().eq("id", locationId);
}

// ────────────────────────────────────────────────────────────
// Bible: Codex Entries
// ────────────────────────────────────────────────────────────

export async function saveCodexEntry(projectId: string, entry: CodexEntry): Promise<void> {
  const { error } = await supabase.from("codex_entries").upsert({
    id: entry.id,
    project_id: projectId,
    entry_type: entry.entryType,
    category: entry.category,
    name: entry.name,
    also_known_as: entry.alsoKnownAs,
    timeframe: entry.timeframe,
    sources: entry.sources,
    content: entry.content,
  });
  if (error) throw error;
}

export async function deleteCodexEntry(entryId: string): Promise<void> {
  await supabase.from("codex_entries").delete().eq("id", entryId);
}

// ────────────────────────────────────────────────────────────
// Comments
// ────────────────────────────────────────────────────────────

export async function readComments(projectId: string): Promise<Comment[]> {
  const { data } = await supabase
    .from("comments")
    .select("*, comment_replies(*)")
    .eq("project_id", projectId)
    .is("resolved_at", null)
    .order("created_at");
  return (data ?? []).map(mapDbComment);
}

export async function addComment(
  projectId: string,
  comment: Omit<Comment, "replies">
): Promise<Comment> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("comments")
    .insert({
      id: comment.id,
      project_id: projectId,
      chapter_id: comment.chapterId,
      author_id: user.id,
      text: comment.text,
      quoted_text: comment.quotedText,
    })
    .select("*, comment_replies(*)")
    .single();
  if (error) throw error;
  return mapDbComment(data);
}

export async function addCommentReply(
  commentId: string,
  text: string
): Promise<CommentReply> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("comment_replies")
    .insert({ comment_id: commentId, author_id: user.id, text })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, text: data.text, createdAt: data.created_at };
}

export async function resolveComment(commentId: string): Promise<void> {
  await supabase
    .from("comments")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", commentId);
}

// ────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────

export async function readExportConfig(projectId: string): Promise<ExportConfig> {
  const { data } = await supabase
    .from("export_configs")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return { ...defaultExportConfig };
  return {
    actHeadings: data.act_headings,
    chapterHeadings: data.chapter_headings,
    sceneHeadings: data.scene_headings,
    sceneSeparator: data.scene_separator,
    titlePage: data.title_page,
    author: data.author,
    wordCountOnTitle: data.word_count_on_title,
    fontFamily: data.font_family,
    fontSize: data.font_size,
    lineSpacing: data.line_spacing,
    paragraphStyle: data.paragraph_style as any,
    pageFormat: data.page_format as any,
    excludeNonChapters: data.exclude_non_chapters,
    exportFormat: data.export_format as any,
    preset: data.preset as any,
  };
}

export async function saveExportConfig(projectId: string, config: ExportConfig): Promise<void> {
  const { error } = await supabase.from("export_configs").upsert({
    project_id: projectId,
    act_headings: config.actHeadings,
    chapter_headings: config.chapterHeadings,
    scene_headings: config.sceneHeadings,
    scene_separator: config.sceneSeparator,
    title_page: config.titlePage,
    author: config.author,
    word_count_on_title: config.wordCountOnTitle,
    font_family: config.fontFamily,
    font_size: config.fontSize,
    line_spacing: config.lineSpacing,
    paragraph_style: config.paragraphStyle,
    page_format: config.pageFormat,
    exclude_non_chapters: config.excludeNonChapters,
    export_format: config.exportFormat,
    preset: config.preset,
  }, { onConflict: "project_id" });
  if (error) throw error;
}

export async function readLlmSettings(projectId: string): Promise<LlmSettings> {
  const defaults: LlmSettings = { selectedProvider: "anthropic", selectedModel: "claude-sonnet-4" };
  const { data } = await supabase
    .from("llm_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return defaults;
  return {
    selectedProvider: data.selected_provider as any,
    selectedModel: data.selected_model,
    anthropicKey: data.anthropic_key ?? undefined,
    openaiKey: data.openai_key ?? undefined,
  };
}

export async function saveLlmSettings(projectId: string, settings: LlmSettings): Promise<void> {
  const { error } = await supabase.from("llm_settings").upsert({
    project_id: projectId,
    selected_provider: settings.selectedProvider,
    selected_model: settings.selectedModel,
    anthropic_key: settings.anthropicKey ?? null,
    openai_key: settings.openaiKey ?? null,
  }, { onConflict: "project_id" });
  if (error) throw error;
}

export async function saveProjectSettings(projectId: string, settings: ProjectSettings): Promise<void> {
  const { error } = await supabase.from("project_settings").upsert({
    project_id: projectId,
    font_family: settings.fontFamily,
    font_size: settings.fontSize,
    line_height: settings.lineHeight,
    dark_mode: settings.darkMode,
  }, { onConflict: "project_id" });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Inspiration
// ────────────────────────────────────────────────────────────

export async function readInspirationItems(projectId: string): Promise<InspirationItem[]> {
  const { data } = await supabase
    .from("inspiration_items")
    .select("*")
    .eq("project_id", projectId)
    .order("added_at");
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fileName: row.file_name,
    label: row.label,
    tags: row.tags ?? [],
    notes: row.notes ?? "",
    addedAt: row.added_at,
  }));
}

export async function uploadInspirationFile(
  projectId: string,
  fileData: Uint8Array,
  fileName: string,
  contentType?: string
): Promise<InspirationItem> {
  const storagePath = `${projectId}/${fileName}`;
  const { error: uploadErr } = await supabase.storage
    .from("inspiration")
    .upload(storagePath, fileData, { contentType: contentType ?? "application/octet-stream", upsert: true });
  if (uploadErr) throw uploadErr;

  const item = {
    project_id: projectId,
    file_name: fileName,
    storage_path: storagePath,
    label: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
    tags: [] as string[],
    notes: "",
  };
  const { data, error } = await supabase.from("inspiration_items").insert(item).select().single();
  if (error) throw error;
  return {
    id: data.id,
    fileName: data.file_name,
    label: data.label,
    tags: data.tags ?? [],
    notes: data.notes ?? "",
    addedAt: data.added_at,
  };
}

export async function removeInspirationItem(projectId: string, itemId: string): Promise<void> {
  const { data: item } = await supabase
    .from("inspiration_items")
    .select("storage_path")
    .eq("id", itemId)
    .single();
  if (item?.storage_path) {
    await supabase.storage.from("inspiration").remove([item.storage_path]);
  }
  await supabase.from("inspiration_items").delete().eq("id", itemId);
}

export async function getInspirationUrl(projectId: string, fileName: string): Promise<string> {
  const { data } = await supabase.storage
    .from("inspiration")
    .createSignedUrl(`${projectId}/${fileName}`, 3600);
  return data?.signedUrl ?? "";
}

export async function updateInspirationItem(
  itemId: string,
  updates: Partial<InspirationItem>
): Promise<void> {
  const row: Record<string, any> = {};
  if (updates.label !== undefined) row.label = updates.label;
  if (updates.tags !== undefined) row.tags = updates.tags;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (Object.keys(row).length === 0) return;
  await supabase.from("inspiration_items").update(row).eq("id", itemId);
}

// ────────────────────────────────────────────────────────────
// Collaboration
// ────────────────────────────────────────────────────────────

export async function inviteUser(
  projectId: string,
  email: string,
  role: "editor" | "viewer"
): Promise<void> {
  // Find user by email
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile) throw new Error(`No user found with email: ${email}`);

  const { error } = await supabase.from("project_members").upsert({
    project_id: projectId,
    user_id: profile.id,
    role,
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(), // Auto-accept for local dev
  }, { onConflict: "project_id,user_id" });
  if (error) throw error;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data } = await supabase
    .from("project_members")
    .select("id, user_id, role, accepted_at, profiles(email, display_name)")
    .eq("project_id", projectId);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    email: row.profiles?.email ?? "",
    displayName: row.profiles?.display_name ?? "",
    role: row.role,
    acceptedAt: row.accepted_at,
  }));
}

export async function getProjectRole(projectId: string): Promise<ProjectRole | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: proj } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .single();
  if (proj?.owner_id === user.id) return "owner";

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (member?.role as ProjectRole) ?? null;
}

// ────────────────────────────────────────────────────────────
// Snapshots
// ────────────────────────────────────────────────────────────

export async function createSnapshot(
  projectId: string,
  message: string
): Promise<SnapshotEntry> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, sort_order, title, section_type, content, word_count, status")
    .eq("project_id", projectId)
    .order("sort_order");

  const totalWords = (chapters ?? []).reduce((sum: number, ch: any) => sum + (ch.word_count ?? 0), 0);

  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .insert({
      project_id: projectId,
      author_id: user.id,
      message,
      word_count: totalWords,
    })
    .select()
    .single();
  if (error) throw error;

  if (chapters && chapters.length > 0) {
    const snapshotChapters = chapters.map((ch: any) => ({
      snapshot_id: snapshot.id,
      chapter_id: ch.id,
      sort_order: ch.sort_order,
      title: ch.title,
      section_type: ch.section_type,
      content: ch.content,
      word_count: ch.word_count,
      status: ch.status,
    }));
    await supabase.from("snapshot_chapters").insert(snapshotChapters);
  }

  return {
    id: snapshot.id,
    date: snapshot.created_at,
    message: snapshot.message,
    wordCount: totalWords,
    authorName: user.email,
  };
}

export async function listSnapshots(projectId: string): Promise<SnapshotEntry[]> {
  const { data } = await supabase
    .from("snapshots")
    .select("id, created_at, message, word_count, profiles(display_name, email)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    date: row.created_at,
    message: row.message,
    wordCount: row.word_count,
    authorName: row.profiles?.display_name || row.profiles?.email || "",
  }));
}

export async function diffSnapshots(
  snapshotAId: string,
  snapshotBId: string | "current",
  projectId: string
): Promise<ChapterDiff[]> {
  const { data: chaptersA } = await supabase
    .from("snapshot_chapters")
    .select("*")
    .eq("snapshot_id", snapshotAId)
    .order("sort_order");

  let chaptersB: any[];
  if (snapshotBId === "current") {
    const { data } = await supabase
      .from("chapters")
      .select("id, sort_order, title, content, word_count")
      .eq("project_id", projectId)
      .order("sort_order");
    chaptersB = (data ?? []).map((ch: any) => ({ ...ch, chapter_id: ch.id }));
  } else {
    const { data } = await supabase
      .from("snapshot_chapters")
      .select("*")
      .eq("snapshot_id", snapshotBId)
      .order("sort_order");
    chaptersB = data ?? [];
  }

  const diffs: ChapterDiff[] = [];
  const bMap = new Map((chaptersB ?? []).map((ch: any) => [ch.chapter_id, ch]));

  for (const a of chaptersA ?? []) {
    const b = bMap.get(a.chapter_id);
    const mdA = htmlToMarkdown(a.content ?? "");
    const mdB = htmlToMarkdown(b?.content ?? "");
    diffs.push({
      chapterId: a.chapter_id,
      title: b?.title ?? a.title,
      wordCountA: a.word_count ?? 0,
      wordCountB: b?.word_count ?? 0,
      diff: buildWordDiff(mdA, mdB),
    });
  }

  // Chapters that exist in B but not in A (new chapters)
  for (const [chId, b] of bMap) {
    if (!(chaptersA ?? []).some((a: any) => a.chapter_id === chId)) {
      diffs.push({
        chapterId: chId,
        title: b.title ?? "",
        wordCountA: 0,
        wordCountB: b.word_count ?? 0,
        diff: buildWordDiff("", htmlToMarkdown(b.content ?? "")),
      });
    }
  }

  return diffs;
}

export async function restoreSnapshot(snapshotId: string, projectId: string): Promise<void> {
  // Safety: create snapshot of current state first
  await createSnapshot(projectId, "Auto-snapshot before restore");

  const { data: snapshotChapters } = await supabase
    .from("snapshot_chapters")
    .select("*")
    .eq("snapshot_id", snapshotId)
    .order("sort_order");

  for (const sc of snapshotChapters ?? []) {
    await supabase
      .from("chapters")
      .update({
        content: sc.content,
        title: sc.title,
        word_count: sc.word_count,
        status: sc.status,
      })
      .eq("id", sc.chapter_id);
  }
}

export async function getWordCountProgress(
  projectId: string
): Promise<{ todayWords: number; weekWords: number; monthWords: number }> {
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("word_count, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!snapshots || snapshots.length === 0) {
    return { todayWords: 0, weekWords: 0, monthWords: 0 };
  }

  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;

  function deltaInRange(days: number): number {
    const cutoff = now - day * days;
    const inRange = snapshots!.filter((s) => new Date(s.created_at).getTime() >= cutoff);
    if (inRange.length < 2) return 0;
    const newest = inRange[0].word_count;
    const oldest = inRange[inRange.length - 1].word_count;
    return Math.max(0, newest - oldest);
  }

  return {
    todayWords: deltaInRange(1),
    weekWords: deltaInRange(7),
    monthWords: deltaInRange(30),
  };
}

// ────────────────────────────────────────────────────────────
// Realtime
// ────────────────────────────────────────────────────────────

export function subscribeToProject(
  projectId: string,
  callbacks: RealtimeCallbacks
): () => void {
  const channel = supabase.channel(`project:${projectId}`, {
    config: { presence: { key: "editors" } },
  });

  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState<PresencePayload>();
    const presences = Object.values(state).flat() as PresencePayload[];
    callbacks.onPresenceChange(presences);
  });

  channel
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "chapters", filter: `project_id=eq.${projectId}` },
      (payload: any) => callbacks.onChapterChange(payload)
    )
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` },
      (payload: any) => callbacks.onCommentChange(payload)
    );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function broadcastPresence(projectId: string, payload: PresencePayload): void {
  const channel = supabase.channel(`project:${projectId}`);
  channel.track(payload);
}

// ────────────────────────────────────────────────────────────
// Export helpers (ZIP export reads from Supabase)
// ────────────────────────────────────────────────────────────

export async function exportProjectAsZip(projectId: string, projectName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const project = await readProject(projectId);
  const zip = new JSZip();

  // Chapters as markdown
  const chaptersDir = zip.folder("chapters")!;
  for (const ch of project.chapters) {
    const num = String(ch.number).padStart(2, "0");
    const slug = (ch.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const md = htmlToMarkdown(ch.content || "");
    chaptersDir.file(`${num}-${slug}.md`, `# ${ch.title || "Untitled"}\n\n${md}\n`);
  }

  // Bible as JSON
  const writerDir = zip.folder(".writer")!;
  writerDir.file("characters.json", JSON.stringify(project.bible.characters, null, 2));
  writerDir.file("threads.json", JSON.stringify(project.bible.threads, null, 2));
  writerDir.file("locations.json", JSON.stringify(project.bible.locations, null, 2));
  writerDir.file("codex.json", JSON.stringify(project.bible.codex, null, 2));

  // Settings
  const exportConfig = await readExportConfig(projectId);
  writerDir.file("export-config.json", JSON.stringify(exportConfig, null, 2));
  const llmSettings = await readLlmSettings(projectId);
  writerDir.file("settings.json", JSON.stringify(llmSettings, null, 2));

  // Brief data
  writerDir.file("project.json", JSON.stringify({
    brief: {
      title: project.brief.title,
      subtitle: project.brief.subtitle,
      genre: project.brief.genre,
      logline: project.brief.logline,
      themes: project.brief.themes,
      targetWordCount: project.brief.targetWordCount,
      audience: project.brief.audience,
      comparableTitles: project.brief.comparableTitles,
    },
    acts: project.acts,
    generalNotes: project.generalNotes,
  }, null, 2));

  // Prewriting files
  zip.file("prewriting/treatment/treatment.md", project.brief.synopsis || "# Treatment\n\n");
  zip.file("style-rules.md", project.brief.writingStyle || "# Prose Style Guide\n\n");
  zip.file("prewriting/story-bible/story-bible.md", project.brief.notes || "# Story Bible\n\n");

  // Download inspiration files
  const inspirationItems = await readInspirationItems(projectId);
  const inspirationDir = zip.folder("inspiration")!;
  for (const item of inspirationItems) {
    try {
      const { data } = await supabase.storage
        .from("inspiration")
        .download(`${projectId}/${item.fileName}`);
      if (data) {
        inspirationDir.file(item.fileName, data);
      }
    } catch {}
  }
  writerDir.file("inspiration.json", JSON.stringify(inspirationItems, null, 2));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.download = `${projectName.toLowerCase().replace(/\s+/g, "-")}-${stamp}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFromZip(zipData: Blob | Uint8Array): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const { markdownToHtml } = await import("./markdown");
  const zip = await JSZip.loadAsync(zipData);

  // Read project.json for metadata
  let projectName = "Imported Project";
  let projectJson: any = {};
  const pjFile = zip.file(".writer/project.json");
  if (pjFile) {
    projectJson = JSON.parse(await pjFile.async("string"));
    projectName = projectJson.brief?.title || projectName;
  }

  // Create the project
  const project = await createProject(projectName);
  const projectId = project.id;

  // Update brief from project.json
  if (projectJson.brief) {
    await saveProjectBrief(projectId, {
      title: projectJson.brief.title,
      subtitle: projectJson.brief.subtitle,
      genre: projectJson.brief.genre,
      logline: projectJson.brief.logline,
      themes: projectJson.brief.themes,
      targetWordCount: projectJson.brief.targetWordCount,
      audience: projectJson.brief.audience,
      comparableTitles: projectJson.brief.comparableTitles,
    });
  }

  // Import acts
  if (projectJson.acts?.length) {
    await saveActs(projectId, projectJson.acts);
  }

  // Import chapters
  const chapterFiles = Object.keys(zip.files)
    .filter((f) => f.startsWith("chapters/") && f.endsWith(".md"))
    .sort();

  for (let i = 0; i < chapterFiles.length; i++) {
    const md = await zip.file(chapterFiles[i])!.async("string");
    const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `Chapter ${i + 1}`;
    const bodyMd = md.replace(/^#\s+.+\n*/, "");
    const html = markdownToHtml(bodyMd);
    const { error } = await supabase.from("chapters").insert({
      project_id: projectId,
      sort_order: i,
      title,
      content: html,
      word_count: countWords(bodyMd),
      status: "draft",
    });
  }

  // Import bible
  for (const name of ["characters", "threads", "locations", "codex"] as const) {
    const file = zip.file(`.writer/${name}.json`);
    if (file) {
      const items = JSON.parse(await file.async("string"));
      // Re-insert with new IDs into the appropriate table
      // Simplified: just use the raw data
    }
  }

  // Import settings
  const settingsFile = zip.file(".writer/settings.json");
  if (settingsFile) {
    const settings = JSON.parse(await settingsFile.async("string"));
    await saveLlmSettings(projectId, settings);
  }

  const exportFile = zip.file(".writer/export-config.json");
  if (exportFile) {
    const config = JSON.parse(await exportFile.async("string"));
    await saveExportConfig(projectId, { ...defaultExportConfig, ...config });
  }

  // Import prewriting → brief fields
  const treatmentFile = zip.file("prewriting/treatment/treatment.md");
  if (treatmentFile) {
    await saveProjectBrief(projectId, { synopsis: await treatmentFile.async("string") });
  }
  const styleFile = zip.file("style-rules.md");
  if (styleFile) {
    await saveProjectBrief(projectId, { writingStyle: await styleFile.async("string") });
  }
  const storyBibleFile = zip.file("prewriting/story-bible/story-bible.md");
  if (storyBibleFile) {
    await saveProjectBrief(projectId, { notes: await storyBibleFile.async("string") });
  }

  // Import inspiration files
  const inspirationFiles = Object.keys(zip.files).filter(
    (f) => f.startsWith("inspiration/") && !zip.files[f].dir
  );
  for (const path of inspirationFiles) {
    const fileName = path.split("/").pop()!;
    const data = await zip.file(path)!.async("uint8array");
    await uploadInspirationFile(projectId, data, fileName);
  }

  // General notes
  if (projectJson.generalNotes) {
    await saveProjectMeta(projectId, { generalNotes: projectJson.generalNotes });
  }

  // Create initial snapshot
  await createSnapshot(projectId, "Imported from ZIP");

  return projectId;
}

// ────────────────────────────────────────────────────────────
// Full save (safety-net flush, called by auto-save timer)
// ────────────────────────────────────────────────────────────

export async function saveFullProject(
  projectId: string,
  project: Project,
  exportConfig: ExportConfig,
  llmSettings: LlmSettings,
  comments: Comment[],
  inspirationItems: InspirationItem[]
): Promise<void> {
  // Save brief + meta
  await saveProjectBrief(projectId, project.brief);
  await saveProjectMeta(projectId, { name: project.name, generalNotes: project.generalNotes });

  // Save acts
  await saveActs(projectId, project.acts);

  // Save all chapters
  for (const ch of project.chapters) {
    await saveChapter(projectId, ch);
  }

  // Save bible
  for (const c of project.bible.characters) await saveCharacter(projectId, c);
  for (const t of project.bible.threads) await saveThread(projectId, t);
  for (const l of project.bible.locations) await saveLocation(projectId, l);
  for (const e of project.bible.codex) await saveCodexEntry(projectId, e);

  // Save settings
  await saveExportConfig(projectId, exportConfig);
  await saveLlmSettings(projectId, llmSettings);
  await saveProjectSettings(projectId, project.settings);

  // Inspiration metadata
  for (const item of inspirationItems) {
    await updateInspirationItem(item.id, { label: item.label, tags: item.tags, notes: item.notes });
  }
}

/**
 * Supabase storage service — replaces fs-service.ts
 *
 * All project CRUD, collaboration, snapshots, realtime,
 * and inspiration file management goes through here.
 */

import { AUTH_STORAGE_KEY, supabase } from "./supabase-client";
import { cookieStorage } from "./cookie-storage";
import { policy as policyDefinition, syncPolicy } from "./policy-blocks";
import { formMeta, readConfig, STYLE_KEYS, updateConfig, type BookForm } from "./book-config";
import { pickBookCoverItem, type CoverTone } from "./cover-art";
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
import {
  createDefaultProject,
  createDefaultCharacter,
  createDefaultThread,
  createDefaultLocation,
  createDefaultCodexEntry,
} from "../types";
import type { ExportConfig, ParagraphStyle, ExportFormat, ExportPreset } from "./export-config";
import { defaultExportConfig } from "./export-config";
import { htmlToMarkdown, countWords } from "./markdown";
import { buildWordDiff, type DiffSegment } from "./text-diff";
import {
  readLocalLlmSettings,
  writeLocalLlmSettings,
  readUserConfig as readLocalUserConfig,
  writeUserConfig as writeLocalUserConfig,
  type LlmSettings,
  type BookkitConfig,
} from "./local-config";
export type { LlmSettings, BookkitConfig } from "./local-config";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ProjectRole = "owner" | "coauthor" | "editor" | "viewer";

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
  acceptedAt: string | null;
  pending?: boolean;
}

export interface SnapshotEntry {
  id: string;
  date: string;
  message: string;
  wordCount: number;
  authorName: string;
}

export interface ChapterDiff {
  fileChange?: "added" | "removed" | "modified";
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

export interface SaveResult {
  conflict: boolean;
  serverVersion?: number;
  newVersion?: number;
}

interface RealtimeCallbacks {
  onPresenceChange: (presences: PresencePayload[]) => void;
  onChapterChange: (payload: { eventType: string; new: any; old: any }) => void;
  onCommentChange: (payload: { eventType: string; new: any; old: any }) => void;
}

const projectChannels = new Map<string, ReturnType<typeof supabase.channel>>();

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

/** Sign out of this browser only. (Supabase's default, scope "global", ends the account's sessions on every device.) */
export const signingOut = { current: false };
export async function signOut(): Promise<void> {
  signingOut.current = true;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } finally { setTimeout(() => { signingOut.current = false; }, 1000); }
  try { localStorage.removeItem("bookkit-auth-note"); } catch { /* storage unavailable */ }
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

/** The session Supabase keeps in this browser, read directly (no lock, no network). */
export function storedSession(): { user: { id: string; email?: string }; refresh_token: string } | null {
  try {
    const value = JSON.parse(cookieStorage.getItem(AUTH_STORAGE_KEY) ?? "null");
    const session = value?.currentSession ?? value;
    return session?.refresh_token && session?.user?.id ? session : null;
  } catch { return null; }
}

/** Why the last automatic sign-out happened, shown on the sign-in screen. */
export function noteSignOutReason(reason: string) {
  try { localStorage.setItem("bookkit-auth-note", JSON.stringify({ reason, at: new Date().toISOString() })); } catch { /* storage unavailable */ }
}

const SIGNED_OUT = /session_not_found|refresh_token_not_found|refresh_token_already_used|invalid refresh token|user_not_found|session.*(missing|expired)|jwt/i;

/**
 * The signed-in user on page load. Returns null only when this browser has no
 * saved session, or the server says that session has ended. Anything else
 * (a busy auth lock held by another tab, a network hiccup) is retried, and
 * in the worst case the saved session is used as it is.
 */
export async function restoreSession(): Promise<{ id: string; email: string } | null> {
  const saved = storedSession();
  if (!saved) return null;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (data.user) return { id: data.user.id, email: data.user.email ?? "" };
      const status = (error as { status?: number } | null)?.status ?? 0;
      const code = `${(error as { code?: string } | null)?.code ?? ""} ${error?.message ?? ""}`;
      last = code.trim() || `status ${status}`;
      if ((status === 401 || status === 403 || status === 400) && SIGNED_OUT.test(code)) {
        noteSignOutReason(`The server ended this session (${last}).`);
        return null;
      }
      if (!storedSession()) { noteSignOutReason(`The saved session was removed (${last}).`); return null; }
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  console.warn("[bookkit] could not confirm the session, using the saved one:", last);
  return { id: saved.user.id, email: saved.user.email ?? "" };
}
// ────────────────────────────────────────────────────────────
// User Config (localStorage — not Supabase)
// ────────────────────────────────────────────────────────────

export function readUserConfig(): BookkitConfig {
  return readLocalUserConfig();
}

export function writeUserConfig(config: BookkitConfig): void {
  writeLocalUserConfig(config);
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
    version: row.version ?? 1,
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
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
    version: row.version ?? undefined,
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
    version: row.version ?? undefined,
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
    version: row.version ?? undefined,
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
    version: row.version ?? undefined,
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

export async function listProjects(): Promise<Array<{ id: string; name: string; role: ProjectRole; libraryId: string | null; bookkitSlug?: string }>> {
  const user = await getCurrentUser();
  if (!user) return [];
  // Every book this account can open: owned, shared directly, or through a library.
  const [{ data: projects }, { data: memberships }, { data: libraries }] = await Promise.all([
    supabase.from("projects").select("id, name, owner_id, library_id, private, bookkit_slug").order("name"),
    supabase.from("project_members").select("project_id, role").eq("user_id", user.id).not("accepted_at", "is", null),
    supabase.rpc("bookkit_libraries"),
  ]);
  const memberRole = new Map((memberships ?? []).map(m => [m.project_id as string, m.role as ProjectRole]));
  const libraryRole = new Map(((libraries ?? []) as Array<{ id: string; role: string }>).map(l => [l.id, l.role]));
  return (projects ?? []).map(p => {
    const fromLibrary = p.library_id && !p.private ? libraryRole.get(p.library_id) : undefined;
    const role: ProjectRole = p.owner_id === user.id ? "owner"
      : memberRole.get(p.id) ?? (fromLibrary === "owner" || fromLibrary === "coauthor" ? "coauthor" : fromLibrary === "editor" ? "editor" : "viewer");
    return { id: p.id, name: p.name, role, libraryId: p.library_id ?? null, bookkitSlug: p.bookkit_slug ?? undefined };
  });
}

export async function readProject(projectId: string, options?: { isBookkit?: boolean }): Promise<Project> {
  if (options?.isBookkit) {
    const { data: proj, error: projErr } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (projErr || !proj) throw new Error(`Project not found: ${projectId}`);
    const project = createDefaultProject(proj.name);
    project.id = proj.id;
    project.name = proj.name;
    project.bookkitSlug = proj.bookkit_slug ?? undefined;
    project.createdAt = proj.created_at;
    project.brief = mapDbBrief(proj);
    project.generalNotes = proj.general_notes ?? "";
    return project;
  }
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
    supabase.from("characters").select("*, character_relationships!character_relationships_character_id_fkey(*)").eq("project_id", projectId),
    supabase.from("threads").select("*").eq("project_id", projectId),
    supabase.from("locations").select("*").eq("project_id", projectId),
    supabase.from("codex_entries").select("*").eq("project_id", projectId),
    supabase.from("project_settings").select("*").eq("project_id", projectId).maybeSingle(),
  ]);

  if (projErr || !proj) throw new Error(`Project not found: ${projectId}`);

  const project = createDefaultProject(proj.name);
  project.id = proj.id;
  project.name = proj.name;
  project.bookkitSlug = proj.bookkit_slug ?? undefined;
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
  const keepIds = acts.map((act) => act.id);
  if (keepIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("acts")
      .delete()
      .eq("project_id", projectId)
      .not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
    if (deleteError) throw deleteError;
  } else {
    const { error: deleteAllError } = await supabase.from("acts").delete().eq("project_id", projectId);
    if (deleteAllError) throw deleteAllError;
    return;
  }
  const rows = acts.map((a, i) => ({
    id: a.id,
    project_id: projectId,
    label: a.label,
    sort_order: i,
  }));
  const { error } = await supabase.from("acts").upsert(rows);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Chapters
// ────────────────────────────────────────────────────────────

export async function saveChapter(
  projectId: string,
  chapter: Chapter,
  expectedVersion?: number
): Promise<{ conflict: boolean; serverVersion?: number; newVersion?: number; updatedAt?: string }> {
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
      .select("version, updated_at")
      .maybeSingle();

    if (error || !data) {
      // Conflict: fetch current version
      const { data: current } = await supabase
        .from("chapters")
        .select("version")
        .eq("id", chapter.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }
    return {
      conflict: false,
      newVersion: data.version ?? expectedVersion + 1,
      updatedAt: data.updated_at ?? new Date().toISOString(),
    };
  }

  // Upsert without locking
  const { data, error } = await supabase
    .from("chapters")
    .upsert(row)
    .select("version, updated_at")
    .single();
  if (error) throw error;
  return {
    conflict: false,
    newVersion: data?.version ?? chapter.version ?? 1,
    updatedAt: data?.updated_at ?? new Date().toISOString(),
  };
}

export async function readProjectChapter(projectId: string, chapterId: string): Promise<Chapter | null> {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", chapterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapDbChapter(data);
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
  const keepIds = scenes.map((scene) => scene.id);
  if (keepIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("scenes")
      .delete()
      .eq("chapter_id", chapterId)
      .not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
    if (deleteError) throw deleteError;
  } else {
    const { error: deleteAllError } = await supabase.from("scenes").delete().eq("chapter_id", chapterId);
    if (deleteAllError) throw deleteAllError;
    return;
  }
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
  const { error } = await supabase.from("scenes").upsert(rows);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Bible: Characters
// ────────────────────────────────────────────────────────────

export async function saveCharacter(
  projectId: string,
  character: Character,
  expectedVersion?: number
): Promise<SaveResult> {
  const row: Record<string, unknown> = {
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
  };

  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from("characters")
      .update({ ...row, version: expectedVersion + 1 })
      .eq("id", character.id)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (error || !data) {
      const { data: current } = await supabase
        .from("characters")
        .select("version")
        .eq("id", character.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }

    await syncCharacterRelationships(character);
    return { conflict: false, newVersion: data.version ?? expectedVersion + 1 };
  }

  // Upsert without locking
  const { data, error: charErr } = await supabase
    .from("characters")
    .upsert(row)
    .select("version")
    .single();
  if (charErr) throw charErr;

  await syncCharacterRelationships(character);
  return { conflict: false, newVersion: data?.version ?? character.version ?? 1 };
}

async function syncCharacterRelationships(character: Character): Promise<void> {
  const rels = character.relationships
    .filter((r) => r.withCharacterId)
    .map((r) => ({
      id: r.id,
      character_id: character.id,
      with_character_id: r.withCharacterId,
      type: r.type,
      description: r.description,
    }));
  const keepIds = rels.map((rel) => rel.id);
  if (keepIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("character_relationships")
      .delete()
      .eq("character_id", character.id)
      .not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
    if (deleteError) throw deleteError;
    const { error: relError } = await supabase.from("character_relationships").upsert(rels);
    if (relError) throw relError;
  } else {
    const { error: deleteAllError } = await supabase
      .from("character_relationships")
      .delete()
      .eq("character_id", character.id);
    if (deleteAllError) throw deleteAllError;
  }
}

export async function deleteCharacter(characterId: string): Promise<void> {
  await supabase.from("characters").delete().eq("id", characterId);
}

// ────────────────────────────────────────────────────────────
// Bible: Threads
// ────────────────────────────────────────────────────────────

export async function saveThread(
  projectId: string,
  thread: Thread,
  expectedVersion?: number
): Promise<SaveResult> {
  const row: Record<string, unknown> = {
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
  };

  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from("threads")
      .update({ ...row, version: expectedVersion + 1 })
      .eq("id", thread.id)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (error || !data) {
      const { data: current } = await supabase
        .from("threads")
        .select("version")
        .eq("id", thread.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }
    return { conflict: false, newVersion: data.version ?? expectedVersion + 1 };
  }

  const { data, error } = await supabase
    .from("threads")
    .upsert(row)
    .select("version")
    .single();
  if (error) throw error;
  return { conflict: false, newVersion: data?.version ?? thread.version ?? 1 };
}

export async function deleteThread(threadId: string): Promise<void> {
  await supabase.from("threads").delete().eq("id", threadId);
}

// ────────────────────────────────────────────────────────────
// Bible: Locations
// ────────────────────────────────────────────────────────────

export async function saveLocation(
  projectId: string,
  location: Location,
  expectedVersion?: number
): Promise<SaveResult> {
  const row: Record<string, unknown> = {
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
  };

  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from("locations")
      .update({ ...row, version: expectedVersion + 1 })
      .eq("id", location.id)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (error || !data) {
      const { data: current } = await supabase
        .from("locations")
        .select("version")
        .eq("id", location.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }
    return { conflict: false, newVersion: data.version ?? expectedVersion + 1 };
  }

  const { data, error } = await supabase
    .from("locations")
    .upsert(row)
    .select("version")
    .single();
  if (error) throw error;
  return { conflict: false, newVersion: data?.version ?? location.version ?? 1 };
}

export async function deleteLocation(locationId: string): Promise<void> {
  await supabase.from("locations").delete().eq("id", locationId);
}

// ────────────────────────────────────────────────────────────
// Bible: Codex Entries
// ────────────────────────────────────────────────────────────

export async function saveCodexEntry(
  projectId: string,
  entry: CodexEntry,
  expectedVersion?: number
): Promise<SaveResult> {
  const row: Record<string, unknown> = {
    id: entry.id,
    project_id: projectId,
    entry_type: entry.entryType,
    category: entry.category,
    name: entry.name,
    also_known_as: entry.alsoKnownAs,
    timeframe: entry.timeframe,
    sources: entry.sources,
    content: entry.content,
  };

  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from("codex_entries")
      .update({ ...row, version: expectedVersion + 1 })
      .eq("id", entry.id)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (error || !data) {
      const { data: current } = await supabase
        .from("codex_entries")
        .select("version")
        .eq("id", entry.id)
        .single();
      return { conflict: true, serverVersion: current?.version };
    }
    return { conflict: false, newVersion: data.version ?? expectedVersion + 1 };
  }

  const { data, error } = await supabase
    .from("codex_entries")
    .upsert(row)
    .select("version")
    .single();
  if (error) throw error;
  return { conflict: false, newVersion: data?.version ?? entry.version ?? 1 };
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

interface SnapshotCommentState {
  id: string;
  chapter_id: string;
  author_id: string | null;
  text: string;
  quoted_text: string;
  created_at: string | null;
  resolved_at: string | null;
  replies: Array<{
    id: string;
    author_id: string | null;
    text: string;
    created_at: string | null;
  }>;
}

async function readSnapshotCommentState(projectId: string): Promise<SnapshotCommentState[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id, chapter_id, author_id, text, quoted_text, created_at, resolved_at, comment_replies(id, author_id, text, created_at)")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    chapter_id: row.chapter_id,
    author_id: row.author_id ?? null,
    text: row.text ?? "",
    quoted_text: row.quoted_text ?? "",
    created_at: row.created_at ?? null,
    resolved_at: row.resolved_at ?? null,
    replies: (row.comment_replies ?? []).map((reply: any) => ({
      id: reply.id,
      author_id: reply.author_id ?? null,
      text: reply.text ?? "",
      created_at: reply.created_at ?? null,
    })),
  }));
}

async function restoreSnapshotCommentState(projectId: string, comments: SnapshotCommentState[]): Promise<void> {
  const { error: deleteError } = await supabase.from("comments").delete().eq("project_id", projectId);
  if (deleteError) throw deleteError;
  if (comments.length === 0) return;

  const commentRows = comments.map((comment) => ({
    id: comment.id,
    project_id: projectId,
    chapter_id: comment.chapter_id,
    author_id: comment.author_id,
    text: comment.text,
    quoted_text: comment.quoted_text,
    created_at: comment.created_at,
    resolved_at: comment.resolved_at,
  }));
  const { error: commentError } = await supabase.from("comments").insert(commentRows);
  if (commentError) throw commentError;

  const replyRows = comments.flatMap((comment) =>
    comment.replies.map((reply) => ({
      id: reply.id,
      comment_id: comment.id,
      author_id: reply.author_id,
      text: reply.text,
      created_at: reply.created_at,
    }))
  );
  if (replyRows.length === 0) return;
  const { error: replyError } = await supabase.from("comment_replies").insert(replyRows);
  if (replyError) throw replyError;
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
    paragraphStyle: (data.paragraph_style ?? "indent") as ParagraphStyle,
    pageFormat: (data.page_format ?? "letter") as "a4" | "letter",
    excludeNonChapters: data.exclude_non_chapters,
    exportFormat: (data.export_format ?? "pdf") as ExportFormat,
    preset: (data.preset ?? "manuscript") as ExportPreset,
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
  void projectId;
  return readLocalLlmSettings();
}

export async function saveLlmSettings(projectId: string, settings: LlmSettings): Promise<void> {
  void projectId;
  writeLocalLlmSettings(settings);
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

const signedInspirationUrls = new Map<string, { url: string; expiresAt: number }>();

export async function getInspirationUrl(projectId: string, fileName: string): Promise<string> {
  const key = `${projectId}/${fileName}`;
  const cached = signedInspirationUrls.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data } = await supabase.storage
    .from("inspiration")
    .createSignedUrl(key, 3600);
  const url = data?.signedUrl ?? "";
  if (url) signedInspirationUrls.set(key, { url, expiresAt: Date.now() + 45 * 60 * 1000 });
  return url;
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
  role: "coauthor" | "editor" | "viewer"
): Promise<void> {
  const {error}=await supabase.from('project_invitations').upsert({project_id:projectId,email:email.trim().toLowerCase(),role},{onConflict:'project_id,email'});
  if(error)throw error;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  if(userId.startsWith('invitation:')) {
    const {error}=await supabase.from('project_invitations').delete().eq('project_id',projectId).eq('id',userId.slice(11));
    if(error)throw error;
    return;
  }
  const {error}=await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if(error)throw error;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data } = await supabase
    .from("project_members")
    .select("id, user_id, role, accepted_at, profiles(email, display_name)")
    .eq("project_id", projectId);
  const {data:pending,error}=await supabase.from('project_invitations').select('id,email,role').eq('project_id',projectId);
  if(error)throw error;
  return [...(data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    email: row.profiles?.email ?? "",
    displayName: row.profiles?.display_name ?? "",
    role: row.role,
    acceptedAt: row.accepted_at,
  })), ...(pending??[]).map(row=>({id:row.id,userId:'invitation:'+row.id,email:row.email,displayName:'',role:row.role as ProjectRole,acceptedAt:null,pending:true}))];
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
  if (member?.role) return member.role as ProjectRole;
  // Access through the book's library
  const { data: book } = await supabase.from("projects").select("library_id, private").eq("id", projectId).maybeSingle();
  if (!book?.library_id || book.private) return book ? "viewer" : null;
  const { data: role } = await supabase.rpc("library_role", { p_library: book.library_id });
  return role === "owner" || role === "coauthor" ? "coauthor" : role === "editor" ? "editor" : "viewer";
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

  const project = await readProject(projectId);
  if(project.bookkitSlug) {
    const {data:id,error}=await supabase.rpc('capture_bookkit_snapshot',{p_project_id:projectId,p_message:message});
    if(error)throw error;
    const {data:row,error:readError}=await supabase.from('snapshots').select('id,created_at,message,word_count').eq('id',id).single();
    if(readError)throw readError;
    return {id:row.id,date:row.created_at,message:row.message,wordCount:row.word_count,authorName:user.email};
  }
  const exportConfig = await readExportConfig(projectId);
  const inspirationItems = await readInspirationItems(projectId);
  const comments = await readSnapshotCommentState(projectId);
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
      project_state: {
        project,
        exportConfig,
        inspirationItems,
        comments,
      },
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
  const {data:project,error:projectError}=await supabase.from('projects').select('bookkit_slug').eq('id',projectId).single();
  if(projectError)throw projectError;
  if(project.bookkit_slug) {
    const result:ChapterDiff[]=[];
    for(let offset=0;;offset+=50) {
      const {data,error}=await supabase.rpc('diff_bookkit_snapshot',{p_project_id:projectId,p_snapshot_id:snapshotAId,p_other_id:snapshotBId==='current'?null:snapshotBId,p_offset:offset});
      if(error)throw error;
      for(const row of data??[])result.push({chapterId:row.path,title:row.path,fileChange:row.before_text===null?"added":row.after_text===null?"removed":"modified",wordCountA:countWords(row.before_text??''),wordCountB:countWords(row.after_text??''),diff:buildWordDiff(row.before_text??'',row.after_text??'')});
      if((data??[]).length<50)return result;
    }
  }
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
  const {data:project,error:projectError}=await supabase.from('projects').select('bookkit_slug').eq('id',projectId).single();
  if(projectError)throw projectError;
  if(project.bookkit_slug) {
    const {error}=await supabase.rpc('restore_bookkit_snapshot',{p_project_id:projectId,p_snapshot_id:snapshotId});
    if(error)throw error;
    return;
  }
  // Safety: create snapshot of current state first
  await createSnapshot(projectId, "Auto-snapshot before restore");
  const { error } = await supabase.rpc("restore_project_snapshot", {
    p_project_id: projectId,
    p_snapshot_id: snapshotId,
  });
  if (error) throw error;
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
  const existing = projectChannels.get(projectId);
  if (existing) {
    supabase.removeChannel(existing);
    projectChannels.delete(projectId);
  }
  const channel = supabase.channel(`project:${projectId}`, {
    config: { presence: { key: "editors" } },
  });
  projectChannels.set(projectId, channel);

  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState<PresencePayload>();
    const presences = Object.values(state).flat() as PresencePayload[];
    callbacks.onPresenceChange(presences);
  });

  // Cast required: supabase-js types lack an overload for "postgres_changes" on channel.on()
  channel
    .on(
      "postgres_changes" as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
      { event: "*", schema: "public", table: "chapters", filter: `project_id=eq.${projectId}` },
      (payload: any) => callbacks.onChapterChange(payload)
    )
    .on(
      "postgres_changes" as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
      { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` },
      (payload: any) => callbacks.onCommentChange(payload)
    );

  channel.subscribe();

  return () => {
    projectChannels.delete(projectId);
    supabase.removeChannel(channel);
  };
}

export function broadcastPresence(projectId: string, payload: PresencePayload): void {
  const channel = projectChannels.get(projectId);
  if (!channel) return;
  void channel.track(payload);
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

export async function importProjectFromZip(zipData: Blob | Uint8Array, onProgress?:(message:string)=>void): Promise<string> {
  const blob=zipData instanceof Blob?zipData:new Blob([new Uint8Array(zipData)]);
  const {importBookkitZip}=await import('./bookkit-import');
  const bookId=await importBookkitZip(supabase,blob,onProgress);
  if(bookId)return bookId;
  const JSZip = (await import("jszip")).default;
  const { markdownToHtml } = await import("./markdown");
  const zip = await JSZip.loadAsync(zipData);

  if(!zip.file('.writer/project.json')&&!Object.keys(zip.files).some(p=>p.startsWith('chapters/')&&p.endsWith('.md')))throw new Error('This is not a Bookkit or legacy project archive.');
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
      if (!Array.isArray(items)) continue;
      if (name === "characters") {
        for (const item of items) {
          await saveCharacter(projectId, {
            ...createDefaultCharacter(),
            ...item,
            id: item.id || crypto.randomUUID(),
            relationships: Array.isArray(item.relationships) ? item.relationships : [],
          });
        }
      }
      if (name === "threads") {
        for (const item of items) {
          await saveThread(projectId, {
            ...createDefaultThread(),
            ...item,
            id: item.id || crypto.randomUUID(),
            alsoKnownAs: item.alsoKnownAs ?? [],
            chapters: item.chapters ?? [],
            historicalAnchors: item.historicalAnchors ?? [],
            sources: item.sources ?? [],
          });
        }
      }
      if (name === "locations") {
        for (const item of items) {
          await saveLocation(projectId, {
            ...createDefaultLocation(),
            ...item,
            id: item.id || crypto.randomUUID(),
            alsoKnownAs: item.alsoKnownAs ?? [],
            sources: item.sources ?? [],
          });
        }
      }
      if (name === "codex") {
        for (const item of items) {
          await saveCodexEntry(projectId, {
            ...createDefaultCodexEntry(),
            ...item,
            id: item.id || crypto.randomUUID(),
            alsoKnownAs: item.alsoKnownAs ?? [],
            sources: item.sources ?? [],
          });
        }
      }
    }
  }

  // Import settings
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

export interface BookDocumentRow {
  asset?: {size_bytes:number;sha256:string;chunks:import('./bookkit-archive').AssetChunk[];unix_mode:number;is_directory:boolean};
  revision_id?: string;
  loaded?: boolean;
  path: string;
  content: string;
  version: number;
}
async function listBookDocumentVersions(projectId: string): Promise<BookDocumentRow[]> {
  const list: BookDocumentRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('bookkit_documents').select('path,version').eq('project_id', projectId).order('path').range(offset, offset + 499);
    if (error) throw error;
    list.push(...(data ?? []).map(d => ({ ...d, content: '', loaded: false })));
    if ((data ?? []).length < 500) break;
  }
  return list;
}

async function listBookAssets(projectId: string): Promise<BookDocumentRow[]> {
  const assets: BookDocumentRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('bookkit_assets').select('path,size_bytes,sha256,chunks,unix_mode,is_directory').eq('project_id', projectId).order('path').range(offset, offset + 499);
    if (error) throw error;
    for (const { path, ...asset } of data ?? []) assets.push({ path, content: '', version: 0, loaded: true, asset });
    if ((data ?? []).length < 500) break;
  }
  return assets;
}

/** Fill in the content of `rows` whose path is in `paths`, 100 documents per request. */
async function fetchBookContents(projectId: string, rows: BookDocumentRow[], paths: string[]): Promise<void> {
  const indexByPath = new Map(rows.map((r, i) => [r.path, i]));
  const batches: Array<Promise<void>> = [];
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batchPaths = paths.slice(offset, offset + 100);
    batches.push((async () => {
      const { data, error } = await supabase.from('bookkit_documents').select('path,content,version,revision_id').eq('project_id', projectId).in('path', batchPaths);
      if (error) throw error;
      for (const doc of data ?? []) {
        const index = indexByPath.get(doc.path);
        if (index !== undefined) rows[index] = { ...doc, loaded: true };
      }
    })());
  }
  await Promise.all(batches);
}

// Research scans can contain megabytes of OCR. Fetch those only on demand.
const fetchedUpFront = (path: string) => !path.startsWith('research/');

export async function listBookDocuments(projectId: string): Promise<BookDocumentRow[]> {
  const [rows, assetRows] = await Promise.all([listBookDocumentVersions(projectId), listBookAssets(projectId)]);
  await fetchBookContents(projectId, rows, rows.filter(d => fetchedUpFront(d.path)).map(d => d.path));
  rows.push(...assetRows);
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Bring a cached copy of a book up to date: list paths and versions (cheap),
 * then download only documents that are new or changed.
 */
export async function refreshBookDocuments(projectId: string, cached: BookDocumentRow[]): Promise<{ rows: BookDocumentRow[]; changed: boolean }> {
  const [rows, assetRows] = await Promise.all([listBookDocumentVersions(projectId), listBookAssets(projectId)]);
  const known = new Map(cached.filter(r => !r.asset).map(r => [r.path, r]));
  const stale: string[] = [];
  let changed = cached.filter(r => !r.asset).length !== rows.length;
  rows.forEach((r, i) => {
    const old = known.get(r.path);
    if (old && old.version === r.version && (old.loaded || !fetchedUpFront(r.path))) { rows[i] = old; return; }
    changed = true;
    if (fetchedUpFront(r.path) || old?.loaded) stale.push(r.path);
  });
  await fetchBookContents(projectId, rows, stale);
  const cachedAssets = new Map(cached.filter(r => r.asset).map(r => [r.path, JSON.stringify(r.asset)]));
  if (cachedAssets.size !== assetRows.length || assetRows.some(a => cachedAssets.get(a.path) !== JSON.stringify(a.asset))) changed = true;
  rows.push(...assetRows);
  return { rows: rows.sort((a, b) => a.path.localeCompare(b.path)), changed };
}
export async function readBookDocument(projectId: string, path: string): Promise<BookDocumentRow> {
  const {data,error}=await supabase.from('bookkit_documents').select('path,content,version,revision_id').eq('project_id',projectId).eq('path',path).maybeSingle();
  if(error)throw error;
  if(data)return {...data,loaded:true};
  const {data:asset,error:assetError}=await supabase.from('bookkit_assets').select('size_bytes,sha256,chunks,unix_mode,is_directory').eq('project_id',projectId).eq('path',path).single();if(assetError)throw assetError;return {path,content:'',version:0,loaded:true,asset};
}
export async function saveBookDocument(projectId: string, path: string, content: string, version: number | null): Promise<BookDocumentRow> {
  const query = version === null
    ? supabase.from('bookkit_documents').insert({project_id:projectId,path,content,source_sha256: 'new-human-document'})
    : supabase.from('bookkit_documents').update({content}).eq('project_id',projectId).eq('path',path).eq('version',version);
  const {data,error} = await query.select('path,content,version,revision_id').maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('This file changed in another session. Reload it before saving; your draft is still here.');
  return data;
}

/** Undo "Write this chapter": delete an author chapter file, but only if nobody has saved to it since `version`. */
export async function discardBookDocument(projectId: string, path: string, version: number): Promise<void> {
  const {data,error}=await supabase.from('bookkit_documents').delete().eq('project_id',projectId).eq('path',path).eq('version',version).select('path');
  if(error) throw error;
  if(!data?.length) throw new Error('This chapter changed in another session, so it was kept. Reload and try again.');
}

export async function acceptProjectInvitations(): Promise<void> {
 const {error}=await supabase.rpc('accept_project_invitations');if(error)throw error;
}
export async function requestSignInEmail(email: string): Promise<void> {
 const res=await fetch('/api/sign-in-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim()})});
 const body=await res.json().catch(()=>null);
 if(!res.ok)throw new Error(body?.error??'Could not send a sign-in code. Use your password instead.');
}

export async function verifySignInCode(email: string, token: string): Promise<void> {
 const res=await fetch('/api/sign-in-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),code:token.replace(/\D/g,'')})});
 const body=await res.json().catch(()=>null);
 if(!res.ok||!body?.access_token)throw new Error(body?.error??'Could not sign in with that code. Try again.');
 const {error}=await supabase.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
 if(error)throw error;
}
export async function updateProjectMemberRole(projectId: string, userId: string, role: 'coauthor'|'editor'|'viewer'): Promise<void> {
 const pending=userId.startsWith('invitation:');
 const {error}=await supabase.from(pending?'project_invitations':'project_members').update({role}).eq('project_id',projectId).eq(pending?'id':'user_id',pending?userId.slice(11):userId);
 if(error)throw error;
}

export async function downloadBookkitArchive(projectId:string,name:string,onProgress:(message:string)=>void):Promise<void>{
 const suggestedName=name.toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'.zip';
 const picker=(window as any).showSaveFilePicker;
 // Invoke the picker while the click still has transient user activation.
 const handle=picker?await picker({suggestedName,types:[{description:'Bookkit archive',accept:{'application/zip':['.zip']}}]}):null;
 const {archiveManifest,writeBookkitArchive}=await import('./bookkit-archive');
 const files=await archiveManifest(supabase,projectId);
 const totalBytes=files.reduce((n,f)=>n+f.size_bytes,0);
 if(!handle&&totalBytes>128*1024*1024)throw new Error('This large archive needs direct-to-disk saving. Open bookkit in Chrome or Edge to export it.');
 let destination:WritableStream<Uint8Array>;
 const chunks:Uint8Array<ArrayBuffer>[]=[];
 if(handle)destination=await handle.createWritable();
 else destination=new WritableStream({write(chunk){chunks.push(new Uint8Array(chunk));}});
 await writeBookkitArchive(supabase,projectId,files,destination,(path,done,total)=>onProgress(path?`Exporting ${done+1}/${total}: ${path}`:'Export complete.'));
 if(!handle){const url=URL.createObjectURL(new Blob(chunks,{type:'application/zip'}));const link=document.createElement('a');link.href=url;link.download=suggestedName;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
}

export async function downloadBookAsset(projectId:string,doc:BookDocumentRow):Promise<void>{
 const asset=doc.asset;if(!asset||asset.is_directory)return;
 const picker=(window as any).showSaveFilePicker;
 if(!picker&&asset.size_bytes>128*1024*1024)throw new Error('Use Chrome or Edge to save this large attachment directly to disk.');
 const handle=picker?await picker({suggestedName:doc.path.split('/').pop()}):null;
 const writer=handle?await handle.createWritable():null;const parts:Uint8Array[]=[];
 try{for(const chunk of asset.chunks){const {data,error}=await supabase.storage.from('bookkit-assets').download(projectId+'/'+chunk.sha256);if(error)throw error;const bytes=new Uint8Array(await data.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(bytes.length!==chunk.size||hash!==chunk.sha256)throw new Error('Attachment verification failed.');if(writer)await writer.write(bytes);else parts.push(bytes);}if(writer)await writer.close();else{const url=URL.createObjectURL(new Blob(parts as BlobPart[]));const a=document.createElement('a');a.href=url;a.download=doc.path.split('/').pop()!;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}}catch(e){if(writer)await writer.abort();throw e;}
}

// ────────────────────────────────────────────────────────────
// New books start as a clean Bookkit structure
// ────────────────────────────────────────────────────────────

export function newBookFiles(
  title: string,
  author: string,
  today = new Date().toISOString().slice(0, 10),
  shelfStyle?: Record<string, unknown> | null,
  options?: { form?: BookForm; targetWords?: number | null; chapterWords?: number | null }
): Record<string, string> {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
  const q = (s: string) => JSON.stringify(s);
  const checked = `---\nchecked: ${today}\n---\n\n`;
  const style = shelfStyle && Object.keys(shelfStyle).length ? shelfStyle : null;
  const ordered = style ? STYLE_KEYS.filter(k => style[k] != null).map(k => [k, style[k]] as const) : [];
  const styleBlock = ordered.length ? `style:\n  inherit: shelf\n${ordered.map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n\n` : '';
  const fm = formMeta(options?.form ?? 'novel');
  const formLine = options?.form ? `form: ${fm.value}\n` : '';
  const targetLine = options?.targetWords && options.targetWords > 0 ? `  target_words: ${Math.round(options.targetWords)}\n` : '';
  const chapterLine = options?.chapterWords && options.chapterWords > 0 ? `  chapter_words: ${Math.round(options.chapterWords)}\n` : '';
  const policyDocs = syncPolicy({ 'README.md': `# ${title}\n\nA book by ${author || 'the author'}, written in Bookkit.\n`, 'CLAUDE.md': `# CLAUDE.md\n\nGuidance for anyone, person or model, working on this book.\n` }, policyDefinition('human-authored')!, title);
  return {
    'book.yaml': `slug: ${slug}\ntitle: ${q(title)}\nauthor: ${q(author)}\nbyline: own-name\nlanguage: en-US\nkind: ${fm.kind}\n${formLine}\nai_policy: human-authored\n\n${styleBlock}manuscript:\n  dir: manuscript\n  layout: flat\n${targetLine}${chapterLine}  scenes: false\n  front_matter:\n    required: [chapter, title, status]\n    optional: [anchor, draft_budget_words]\n\npublication:\n  formats: [docx, epub, pdf]\n  title_page: true\n\ncompanion:\n  standard: 1\n`,
    'README.md': policyDocs['README.md'],
    'CLAUDE.md': policyDocs['CLAUDE.md'],
    'manuscript/01-chapter-one.md': `---\nchapter: 1\ntitle: "Chapter One"\nstatus: drafting\n---\n\n# Chapter 1\n\n`,
    'bible/book-on-one-page.md': `${checked}# The book on one page\n\nWhat happens, start to finish, in about 250 words.\n\n## Dramatic question\n\n## Shape\n\n## What the book is about\n`,
    'bible/characters.md': `${checked}# Characters\n\nEveryone who matters, as the chapters have them.\n`,
    'bible/places.md': `${checked}# Places\n\nSettings, routes and rooms, in words.\n`,
    'bible/canon.md': `${checked}# Canon\n\nHard facts, each anchored to the chapter that establishes it.\n`,
    'bible/timeline.md': `${checked}# Timeline\n\nEvents in story order.\n`,
    'outline/chapters.md': `${checked}# Chapters\n\n## 1. Chapter One\n\n**Purpose:** \n`,
    'outline/open-questions.md': `${checked}# Open questions\n\nOnly what is still undecided.\n`,
    'craft/style-guide.md': `${checked}# Style guide\n\n| Decision | Choice |\n|---|---|\n| Spelling | American |\n| Tense | past |\n| Point of view | |\n`,
  };
}

export async function createBook(
  title: string,
  author: string,
  place: { libraryId?: string | null; shelfId?: string | null; form?: BookForm; targetWords?: number | null; chapterWords?: number | null } = {}
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const fm = formMeta(place.form ?? 'novel');
  const targetWordCount = place.targetWords && place.targetWords > 0 ? Math.round(place.targetWords) : fm.defaultTargetWords;
  const { data: project, error } = await supabase.from('projects')
    .insert({ owner_id: user.id, name: title, brief_title: title, brief_target_word_count: targetWordCount, bookkit_slug: 'new/' + crypto.randomUUID(), bookkit_import_complete: true, library_id: place.libraryId ?? null, shelf_id: place.shelfId ?? null })
    .select('id').single();
  if (error || !project) throw error ?? new Error('Could not create the book');
  const projectId = project.id as string;
  try {
    const must = async (q: PromiseLike<{ error: any }>) => { const { error } = await q; if (error) throw error; };
    await must(supabase.from('project_members').insert({ project_id: projectId, user_id: user.id, role: 'owner', accepted_at: new Date().toISOString() }));
    await must(supabase.from('project_settings').insert({ project_id: projectId }));
    await must(supabase.from('llm_settings').insert({ project_id: projectId }));
    await must(supabase.from('export_configs').insert({ project_id: projectId, author }));
    let shelfStyle: Record<string, unknown> | null = null;
    if (place.shelfId) shelfStyle = ((await supabase.from('shelves').select('style').eq('id', place.shelfId).maybeSingle()).data?.style as Record<string, unknown>) ?? null;
    const rows = Object.entries(newBookFiles(title, author, undefined, shelfStyle, { form: place.form ?? 'novel', targetWords: place.targetWords, chapterWords: place.chapterWords })).map(([path, content]) => ({ project_id: projectId, path, content, source_sha256: 'new-human-document' }));
    await must(supabase.from('bookkit_documents').insert(rows));
    return projectId;
  } catch (e) {
    await supabase.from('projects').delete().eq('id', projectId);
    throw e;
  }
}

/** Apply a planned chapter reorder: snapshot first, write, delete, and restore the snapshot if anything fails. */
export async function applyBookReorder(
  projectId: string,
  plan: { writes: Array<{ path: string; content: string }>; deletes: string[]; moves: Array<{ from: string; to: string }> },
  versions: Map<string, number>,
  onProgress?: (message: string) => void,
): Promise<void> {
  const moved = plan.moves.map(m => m.from);
  if (moved.length) {
    const [threads, suggestions] = await Promise.all([
      supabase.from('bookkit_threads').select('path').eq('project_id', projectId).is('resolved_at', null).in('path', moved),
      supabase.from('bookkit_suggestions').select('path').eq('project_id', projectId).eq('status', 'pending').in('path', moved),
    ]);
    const open = (threads.data?.length ?? 0) + (suggestions.data?.length ?? 0);
    if (open) throw new Error(`${open} open comment${open === 1 ? '' : 's'} or suggestion${open === 1 ? '' : 's'} belong to chapters that would move. Resolve them first so they don’t lose their place.`);
  }
  onProgress?.('Saving a snapshot first…');
  const { data: snapshotId, error: snapError } = await supabase.rpc('capture_bookkit_snapshot', { p_project_id: projectId, p_message: 'Before reordering chapters' });
  if (snapError) throw snapError;
  try {
    let done = 0;
    for (const w of plan.writes) {
      onProgress?.(`Updating ${++done} of ${plan.writes.length}…`);
      await saveBookDocument(projectId, w.path, w.content, versions.get(w.path) ?? null);
    }
    if (plan.deletes.length) {
      const { error } = await supabase.from('bookkit_documents').delete().eq('project_id', projectId).in('path', plan.deletes);
      if (error) throw error;
    }
  } catch (e) {
    onProgress?.('Something went wrong; restoring the snapshot…');
    const { error } = await supabase.rpc('restore_bookkit_snapshot', { p_project_id: projectId, p_snapshot_id: snapshotId });
    if (error) throw new Error(`Reordering failed (${(e as Error).message}) and the automatic restore also failed (${error.message}). Restore “Before reordering chapters” from History.`);
    throw new Error(`Reordering failed and the book was restored: ${(e as Error).message}`);
  }
}

/** A one-time sign-in link for an invited collaborator (the owner sends it; no email is sent by Bookkit). */
export async function emailInvite(projectId: string, email: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in first.');
  const res = await fetch('/api/invite-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ projectId, email, send: true }) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.sent) throw new Error(body?.error ?? 'Could not send the invitation.');
}

export async function createInviteLink(projectId: string, email: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in first.');
  const res = await fetch('/api/invite-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ projectId, email }) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.link) throw new Error(body?.error ?? 'Could not create a sign-in link.');
  return body.link;
}

export async function setAccountPassword(password: string): Promise<void> {
  if (password.length < 10) throw new Error('Use at least 10 characters.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export interface WorkspaceInboxThread {
  id: string;
  project_id: string;
  book_name: string;
  path: string;
  quoted_text: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name: string;
  latest_author_id: string;
  latest_author_name: string;
  first_body: string;
  latest_body: string;
  message_count: number;
  has_reply: boolean;
}

export interface WorkspaceBook {
  project_id: string;
  name: string;
  role: string;
  owner_name: string | null;
  is_bookkit: boolean;
  created_at: string;
  last_worked_at: string | null;
  last_worked_by: string | null;
  author_words: number;
  draft_words: number;
  chapters_total: number;
  chapters_written: number;
  target_words: number;
  activity: Array<{ day: string; added: number; removed: number; chapters: number; pages: number; comments: number; suggestions: number }>;
  library_id: string | null;
  shelf_id: string | null;
  private: boolean;
  cover_file?: string | null;
  cover_tone?: CoverTone | null;
  book_form?: BookForm;
  form_label?: string;
  unresolved_threads?: number;
  open_comments?: number;
  inbox_threads?: WorkspaceInboxThread[];
}

const syncedMetadataProjects = new Set<string>();

function resolveBookFormAndTarget(
  book: WorkspaceBook,
  yamlContent: string | null
): {
  form: BookForm;
  formLabel: string;
  targetWords: number;
  chapterWords: number;
  needsSync: boolean;
} {
  const refWords = Math.max(book.draft_words || 0, book.author_words || 0);
  const chaptersCount = Math.max(1, book.chapters_total || 1);
  let hasExplicitForm = false;
  let hasExplicitTarget = false;
  let hadLegacyForm = false;
  let kind: "fiction" | "nonfiction" = "fiction";
  let subtitle = "";
  let explicitForm: BookForm | null = null;
  let explicitTarget: number | null = null;
  let explicitChapter: number | null = null;

  if (yamlContent) {
    hasExplicitForm = /^form\s*:/m.test(yamlContent);
    hasExplicitTarget = /^\s+target_words\s*:/m.test(yamlContent);
    hadLegacyForm = /^form\s*:\s*short-novel\b/m.test(yamlContent);
    try {
      const cfg = readConfig(yamlContent);
      kind = cfg.kind;
      subtitle = cfg.subtitle || "";
      if (hasExplicitForm && !hadLegacyForm) explicitForm = cfg.form;
      if (cfg.targetWords && cfg.targetWords > 0) explicitTarget = cfg.targetWords;
      if (cfg.chapterWords && cfg.chapterWords > 0) explicitChapter = cfg.chapterWords;
    } catch {
      /* ignore malformed yaml */
    }
  }

  // Repair books where an earlier truncated word count misclassified a >30k novel as a short story
  if (explicitForm === "short-story" && refWords > 30000) {
    explicitForm = "novel";
    explicitTarget = null;
    explicitChapter = null;
    hadLegacyForm = true;
  }

  let form: BookForm = explicitForm ?? "novel";
  if (!explicitForm) {
    if (kind === "nonfiction") {
      form = "nonfiction";
    } else if (/\bnovella\b/i.test(subtitle)) {
      form = "novella";
    } else if (/\bnovelette\b/i.test(subtitle)) {
      form = "novelette";
    } else if (/\bshort story\b/i.test(subtitle)) {
      form = "short-story";
    } else if (refWords > 0) {
      if (refWords <= 7500) form = "short-story";
      else if (refWords <= 14000) form = "novelette";
      else if (refWords <= 30000) form = "novella";
      else form = "novel";
    }
  }

  const fm = formMeta(form, kind);
  const formLabel = form === "nonfiction" ? "Non-fiction" : fm.label;

  const targetWords =
    explicitTarget ??
    (book.target_words && book.target_words !== 80000
      ? book.target_words
      : refWords > 0
        ? Math.max(500, Math.round(refWords / 500) * 500)
        : fm.defaultTargetWords);

  const chapterWords =
    explicitChapter ??
    Math.max(100, Math.round(targetWords / chaptersCount / 50) * 50);

  return {
    form,
    formLabel,
    targetWords,
    chapterWords,
    needsSync:
      Boolean(yamlContent) &&
      (!hasExplicitForm || !hasExplicitTarget || hadLegacyForm || book.target_words === 80000),
  };
}

/** Every book you can open, with progress and daily activity for the workspace. */
export async function loadWorkspace(days = 84): Promise<WorkspaceBook[]> {
  const [{ data, error }, inspRes, yamlRes, threadsRes] = await Promise.all([
    supabase.rpc("bookkit_workspace", { p_days: days }),
    Promise.resolve()
      .then(() =>
        supabase
          .from("inspiration_items")
          .select("project_id, file_name, tags, added_at")
          .order("added_at")
      )
      .catch(() => ({ data: null })),
    Promise.resolve()
      .then(() =>
        supabase
          .from("bookkit_documents")
          .select("project_id, content, version")
          .eq("path", "book.yaml")
      )
      .catch(() => ({ data: null })),
    Promise.resolve()
      .then(() =>
        supabase
          .from("bookkit_threads")
          .select("id, project_id, path, author_id, quoted_text, created_at, resolved_at, bookkit_messages(id, author_id, body, created_at, profiles!author_id(display_name, email))")
          .is("resolved_at", null)
          .order("created_at", { ascending: false })
      )
      .catch(() => ({ data: null })),
  ]);
  if (error) throw error;
  const books = (data ?? []) as WorkspaceBook[];
  const inspRows = (inspRes?.data ?? []) as Array<{
    project_id: string;
    file_name: string;
    tags: string[] | null;
  }>;
  const yamlRows = (yamlRes?.data ?? []) as Array<{
    project_id: string;
    content: string;
    version: number;
  }>;
  const threadRows = (threadsRes?.data ?? []) as Array<{
    id: string;
    project_id: string;
    path: string;
    author_id: string;
    quoted_text: string | null;
    created_at: string;
    resolved_at: string | null;
    bookkit_messages?: Array<{
      id: string;
      author_id: string;
      body: string;
      created_at: string;
      profiles?: { display_name?: string | null; email?: string | null } | null;
    }> | null;
  }>;

  const bookNameById = new Map<string, string>(books.map((b) => [b.project_id, b.name]));
  const threadsByProject = new Map<string, WorkspaceInboxThread[]>();
  for (const row of threadRows) {
    if (!row?.project_id || row.resolved_at) continue;
    const msgs = [...(row.bookkit_messages ?? [])].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    );
    const first = msgs[0];
    const latest = msgs[msgs.length - 1] ?? first;
    const displayName = (p?: { display_name?: string | null; email?: string | null } | null) =>
      p?.display_name?.trim() || p?.email?.trim() || "Collaborator";
    const threadItem: WorkspaceInboxThread = {
      id: row.id,
      project_id: row.project_id,
      book_name: bookNameById.get(row.project_id) ?? "Book",
      path: row.path,
      quoted_text: row.quoted_text ?? "",
      created_at: row.created_at,
      updated_at: latest?.created_at ?? row.created_at,
      author_id: first?.author_id ?? row.author_id,
      author_name: displayName(first?.profiles),
      latest_author_id: latest?.author_id ?? row.author_id,
      latest_author_name: displayName(latest?.profiles),
      first_body: first?.body ?? "",
      latest_body: latest?.body ?? "",
      message_count: Math.max(1, msgs.length),
      has_reply: msgs.length > 1,
    };
    const list = threadsByProject.get(row.project_id) ?? [];
    list.push(threadItem);
    threadsByProject.set(row.project_id, list);
  }

  const byProject = new Map<string, Array<{ fileName: string; tags: string[] | null }>>();
  for (const row of inspRows) {
    if (!row?.project_id || !row?.file_name) continue;
    const list = byProject.get(row.project_id) ?? [];
    list.push({ fileName: row.file_name, tags: row.tags ?? [] });
    byProject.set(row.project_id, list);
  }

  const yamlByProject = new Map<string, { content: string; version: number }>();
  for (const row of yamlRows) {
    if (row?.project_id && typeof row.content === "string") {
      yamlByProject.set(row.project_id, { content: row.content, version: row.version });
    }
  }

  return books.map((book) => {
    const items = byProject.get(book.project_id);
    const picked = items && items.length > 0 ? pickBookCoverItem(items) : null;
    const yamlRow = yamlByProject.get(book.project_id) ?? null;
    const resolved = resolveBookFormAndTarget(book, yamlRow?.content ?? null);
    const openThreads = threadsByProject.get(book.project_id) ?? [];
    const unresolvedCount = openThreads.length;
    const openCommentsCount = openThreads.reduce((sum, t) => sum + t.message_count, 0);

    if (
      resolved.needsSync &&
      yamlRow &&
      book.role === "owner" &&
      !syncedMetadataProjects.has(book.project_id)
    ) {
      syncedMetadataProjects.add(book.project_id);
      void (async () => {
        try {
          const nextYaml = updateConfig(yamlRow.content, {
            form: resolved.form,
            targetWords: resolved.targetWords,
            chapterWords: resolved.chapterWords,
          });
          if (nextYaml !== yamlRow.content) {
            await saveBookDocument(book.project_id, "book.yaml", nextYaml, yamlRow.version);
          }
          await supabase
            .from("projects")
            .update({ brief_target_word_count: resolved.targetWords })
            .eq("id", book.project_id);
        } catch {
          /* ignore background sync errors */
        }
      })();
    }

    return {
      ...book,
      target_words: resolved.targetWords,
      book_form: resolved.form,
      form_label: resolved.formLabel,
      unresolved_threads: unresolvedCount,
      open_comments: openCommentsCount,
      inbox_threads: openThreads,
      ...(picked
        ? {
            cover_file: picked.item.fileName,
            cover_tone: picked.tone,
          }
        : {}),
    };
  });
}


// ────────────────────────────────────────────────────────────
// Libraries and shelves
// ────────────────────────────────────────────────────────────

export type LibraryRole = "owner" | "coauthor" | "editor" | "viewer" | "reader";
export interface Shelf { id: string; name: string; position: number; style?: Record<string, unknown> }
export interface Library {
  id: string; slug: string; name: string; description: string; role: LibraryRole;
  owner_name: string | null; pending_owner: string | null;
  shelves: Shelf[];
  members: Array<{ user_id: string; role: "coauthor" | "editor" | "viewer"; name: string | null; email: string | null }>;
  invitations: Array<{ id: string; email: string; role: "coauthor" | "editor" | "viewer" }>;
  created_at: string;
}

export const LIBRARY_SLUG = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

export const RESERVED_LIBRARY_SLUGS = new Set([
  "www", "api", "app", "mail", "email", "admin", "auth", "login",
  "static", "assets", "help", "support", "blog", "status", "docs",
  "dev", "staging", "test", "bookkit", "library", "libraries"
]);

export function validateLibrarySlug(slug: string): string | null {
  const clean = slug.trim().toLowerCase();
  if (!clean) return "Choose an address for your library.";
  if (!LIBRARY_SLUG.test(clean)) return "Use 1–32 lowercase letters, numbers, and dashes (not starting or ending with a dash).";
  if (RESERVED_LIBRARY_SLUGS.has(clean)) return `“${clean}” is a reserved Bookkit address. Choose another.`;
  return null;
}

export async function loadLibraries(): Promise<Library[]> {
  const { data, error } = await supabase.rpc('bookkit_libraries');
  if (error) throw error;
  return (data ?? []) as Library[];
}

export async function createLibrary(name: string, slug: string, description = ""): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const row: Record<string, unknown> = { name: name.trim(), slug: slug.trim().toLowerCase(), owner_id: user.id, created_by: user.id };
  if (description.trim()) row.description = description.trim().slice(0, 500);
  const { data, error } = await supabase.from('libraries').insert(row).select('id').single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That address is taken. Try another.' : /check/i.test(error.message) ? 'Use lowercase letters, numbers and dashes for the address.' : error.message);
  return data.id as string;
}

export async function updateLibrary(id: string, patch: { name?: string; slug?: string; description?: string }): Promise<void> {
  const { error } = await supabase.from('libraries').update(patch).eq('id', id);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That address is taken. Try another.' : /check/i.test(error.message) ? 'Use lowercase letters, numbers and dashes for the address (some names are reserved).' : error.message);
}

export async function addShelf(libraryId: string, name: string, position: number, style?: Record<string, unknown>): Promise<void> {
  const row: Record<string, unknown> = { library_id: libraryId, name: name.trim(), position };
  if (style && Object.keys(style).length > 0) row.style = style;
  const { error } = await supabase.from('shelves').insert(row);
  if (error) throw error;
}

export interface OnboardingShelfInput {
  name: string;
  style?: Record<string, unknown>;
}

/**
 * Create a library and its initial shelves (returning the library ID and
 * created shelf IDs in position order).
 */
export async function createLibraryWithShelves(
  name: string,
  slug: string,
  description: string,
  shelves: OnboardingShelfInput[]
): Promise<{ libraryId: string; slug: string; shelfIds: string[] }> {
  const cleanSlug = slug.trim().toLowerCase();
  const slugErr = validateLibrarySlug(cleanSlug);
  if (slugErr) throw new Error(slugErr);
  const libraryId = await createLibrary(name, cleanSlug, description);
  const shelfIds: string[] = [];
  for (const [position, shelf] of shelves.entries()) {
    const trimmed = shelf.name.trim();
    if (!trimmed) continue;
    const row: Record<string, unknown> = { library_id: libraryId, name: trimmed, position };
    if (shelf.style && Object.keys(shelf.style).length > 0) row.style = shelf.style;
    const { data, error } = await supabase.from('shelves').insert(row).select('id').single();
    if (error) throw error;
    if (data?.id) shelfIds.push(String(data.id));
  }
  return { libraryId, slug: cleanSlug, shelfIds };
}

/**
 * Register a new Bookkit account under the free early-access subscription and
 * establish an authenticated session. Uses the Worker's `/api/signup` endpoint
 * when available so accounts are immediately confirmed, with a fallback to
 * Supabase's direct client signUp for local development.
 */
export async function registerFreeSubscriptionAccount(
  email: string,
  password: string,
  displayName: string
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || cleanEmail.split("@")[0];
  let workerHandled = false;
  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password, displayName: cleanName }),
    });
    if (res.status === 400 || res.status === 409) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Could not create your account.");
    }
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.access_token && body?.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) throw error;
        workerHandled = true;
      }
    }
  } catch (err) {
    if (err instanceof Error && !/fetch|network|502|503|JSON/i.test(err.message)) {
      throw err;
    }
  }
  if (!workerHandled) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: cleanName,
          subscription_plan: "free_early_access",
          subscription_status: "active",
          subscribed_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new Error("An account with this email already exists. Sign in instead.");
      }
      throw error;
    }
    if (!data.session) {
      await signIn(cleanEmail, password);
    }
  }
}
export async function renameShelf(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('shelves').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}
export async function reorderShelves(order: string[]): Promise<void> {
  for (const [position, id] of order.entries()) {
    const { error } = await supabase.from('shelves').update({ position }).eq('id', id);
    if (error) throw error;
  }
}
export async function deleteShelf(id: string): Promise<void> {
  const { error } = await supabase.from('shelves').delete().eq('id', id);
  if (error) throw error;
}

/** Put a book on a shelf (or none), move it to another library, or make it private. */
export async function placeBook(projectId: string, patch: { library_id?: string | null; shelf_id?: string | null; private?: boolean }): Promise<void> {
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
}

export async function inviteToLibrary(libraryId: string, email: string, role: "coauthor" | "editor" | "viewer"): Promise<void> {
  const { error } = await supabase.from('library_invitations').upsert({ library_id: libraryId, email: email.trim().toLowerCase(), role }, { onConflict: 'library_id,email' });
  if (error) throw error;
}
export async function removeLibraryInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('library_invitations').delete().eq('id', id);
  if (error) throw error;
}
export async function setLibraryMemberRole(libraryId: string, userId: string, role: "coauthor" | "editor" | "viewer"): Promise<void> {
  const { error } = await supabase.from('library_members').update({ role }).eq('library_id', libraryId).eq('user_id', userId);
  if (error) throw error;
}
export async function removeLibraryMember(libraryId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('library_members').delete().eq('library_id', libraryId).eq('user_id', userId);
  if (error) throw error;
}
/** Email a library invitation from bookkit.net (the invitee gets a sign-in code). */
export async function emailLibraryInvite(libraryId: string, email: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }, body: JSON.stringify({ libraryId, email, send: true }) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'Could not send the invitation.');
}

export async function readBookPlacement(projectId: string): Promise<{ library_id: string | null; shelf_id: string | null; private: boolean }> {
  const { data, error } = await supabase.from('projects').select('library_id, shelf_id, private').eq('id', projectId).single();
  if (error) throw error;
  return data as { library_id: string | null; shelf_id: string | null; private: boolean };
}

/** Save a shelf's house style and write it into the books on the shelf that inherit it (those you own). */
export async function updateShelfStyle(shelfId: string, style: Record<string, unknown>): Promise<{ updated: string[]; skipped: string[] }> {
  const { error } = await supabase.from('shelves').update({ style }).eq('id', shelfId);
  if (error) throw error;
  const { applyShelfStyle } = await import('./book-config');
  const user = await getCurrentUser();
  const { data: books } = await supabase.from('projects').select('id, name, owner_id').eq('shelf_id', shelfId);
  const updated: string[] = [], skipped: string[] = [];
  for (const book of books ?? []) {
    try {
      const row = await readBookDocument(book.id, 'book.yaml');
      const next = applyShelfStyle(row.content, style);
      if (next === row.content) continue;
      if (book.owner_id !== user?.id) { skipped.push(book.name); continue; }
      await saveBookDocument(book.id, 'book.yaml', next, row.version);
      updated.push(book.name);
    } catch { skipped.push(book.name); }
  }
  return { updated, skipped };
}

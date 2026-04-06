import { create } from "zustand";
import type {
  Project,
  ProjectAct,
  TabId,
  BibleSection,
  Chapter,
  Character,
  Thread,
  Location,
  CodexEntry,
  Scene,
  Comment,
  CommentReply,
  InspirationItem,
  SectionType,
} from "../types";
import {
  createDefaultProject,
  createDefaultChapter,
  createDefaultScene,
  createDefaultCharacter,
  createDefaultThread,
  createDefaultLocation,
  createDefaultCodexEntry,
  isChapterType,
} from "../types";
import {
  signIn as sbSignIn,
  signOut as sbSignOut,
  getCurrentUser,
  listProjects as sbListProjects,
  readProject,
  createProject as sbCreateProject,
  deleteProject as sbDeleteProject,
  saveProjectBrief,
  saveProjectMeta,
  saveActs,
  saveChapter,
  deleteChapter as sbDeleteChapter,
  reorderChapters as sbReorderChapters,
  saveScenes,
  saveCharacter,
  deleteCharacter as sbDeleteCharacter,
  saveThread,
  deleteThread as sbDeleteThread,
  saveLocation,
  deleteLocation as sbDeleteLocation,
  saveCodexEntry,
  deleteCodexEntry as sbDeleteCodexEntry,
  readComments as sbReadComments,
  addComment as sbAddComment,
  addCommentReply as sbAddCommentReply,
  resolveComment as sbResolveComment,
  readExportConfig,
  saveExportConfig,
  readLlmSettings,
  saveLlmSettings,
  readInspirationItems,
  uploadInspirationFile,
  removeInspirationItem as sbRemoveInspirationItem,
  updateInspirationItem as sbUpdateInspirationItem,
  saveProjectSettings,
  createSnapshot as sbCreateSnapshot,
  listSnapshots,
  diffSnapshots,
  restoreSnapshot as sbRestoreSnapshot,
  getWordCountProgress,
  subscribeToProject,
  broadcastPresence,
  inviteUser as sbInviteUser,
  removeProjectMember as sbRemoveProjectMember,
  listProjectMembers,
  getProjectRole,
  exportProjectAsZip,
  importProjectFromZip,
  readUserConfig,
  writeUserConfig,
  type LlmSettings,
  type WriterConfig,
  type ProjectMember,
  type SnapshotEntry,
  type ChapterDiff,
  type PresencePayload,
  type ProjectRole,
} from "../lib/supabase-service";
import { defaultExportConfig, type ExportConfig } from "../lib/export-config";

interface ProgressStats {
  todayWords: number;
  weekWords: number;
  monthWords: number;
  diffSummary: string;
}

interface ProjectStore {
  // Auth state
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;

  // App state
  projects: Project[];
  currentProjectId: string | null;
  currentProjectRole: ProjectRole | null;
  activeTab: TabId;
  activeBibleSection: BibleSection;
  focusedBibleEntryId: string | null;
  activeChapterId: string | null;
  showProjectSwitcher: boolean;
  showApiSettings: boolean;
  darkMode: boolean;
  focusMode: boolean;
  dirty: boolean;
  lastSaved: string | null;
  llmSettings: LlmSettings;
  snapshots: SnapshotEntry[];
  progressStats: ProgressStats;
  askEditorResponse: string;
  comments: Comment[];
  activeCommentId: string | null;
  exportConfig: ExportConfig;
  inspirationItems: InspirationItem[];

  // Collaboration
  projectMembers: ProjectMember[];
  activeEditors: PresencePayload[];
  realtimeUnsubscribe: (() => void) | null;

  // Derived
  currentProject: () => Project | null;
  currentChapter: () => Chapter | null;
  totalWordCount: () => number;

  // Auth actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<boolean>;

  // Project actions
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => void;
  setShowProjectSwitcher: (show: boolean) => void;
  setShowApiSettings: (show: boolean) => void;

  // Navigation
  setActiveTab: (tab: TabId) => void;
  setActiveBibleSection: (section: BibleSection) => void;
  navigateToBibleEntry: (section: BibleSection, id: string) => void;
  clearFocusedBibleEntry: () => void;
  setActiveChapterId: (id: string | null) => void;
  setDarkMode: (dark: boolean) => void;
  setFocusMode: (focus: boolean) => void;

  // Brief
  updateBrief: (field: string, value: unknown) => void;

  // Acts
  addAct: (label?: string) => void;
  updateAct: (id: string, label: string) => void;
  deleteAct: (id: string) => void;

  // Chapters
  addChapter: () => void;
  addSection: (sectionType: SectionType) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  moveChapterToAct: (id: string, actId: string | null) => void;
  deleteChapter: (id: string) => void;
  reorderChapters: (fromIndex: number, toIndex: number) => void;
  reorderChaptersByIds: (chapterIds: string[]) => void;

  // Scenes
  addScene: (chapterId: string) => void;
  updateScene: (chapterId: string, sceneId: string, updates: Partial<Scene>) => void;
  deleteScene: (chapterId: string, sceneId: string) => void;

  // Bible
  addCharacter: () => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  addThread: () => void;
  updateThread: (id: string, updates: Partial<Thread>) => void;
  deleteThread: (id: string) => void;
  addLocation: () => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  deleteLocation: (id: string) => void;
  addCodexEntry: () => void;
  updateCodexEntry: (id: string, updates: Partial<CodexEntry>) => void;
  deleteCodexEntry: (id: string) => void;

  // Notes
  updateGeneralNotes: (notes: string) => void;
  setAskEditorResponse: (value: string) => void;
  refreshBibleFromManuscript: (notes: string) => void;

  // Comments
  addComment: (comment: Comment) => void;
  addCommentReply: (commentId: string, reply: CommentReply) => void;
  resolveComment: (commentId: string) => void;
  setActiveCommentId: (id: string | null) => void;
  getChapterComments: (chapterId: string) => Comment[];

  // Export config
  updateExportConfig: (updates: Partial<ExportConfig>) => void;

  // Inspiration
  addInspirationFiles: (files: { sourcePath: string; fileName: string; data: Uint8Array }[]) => Promise<void>;
  removeInspirationItem: (id: string) => Promise<void>;
  updateInspirationItem: (id: string, updates: Partial<InspirationItem>) => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  exportCurrentProjectZip: () => Promise<void>;
  importProjectZip: (data: Blob | Uint8Array) => Promise<void>;

  // LLM Settings
  updateLlmSettings: (updates: Partial<LlmSettings>) => Promise<void>;

  // Collaboration
  inviteUser: (email: string, role: "editor" | "viewer") => Promise<void>;
  removeProjectMember: (userId: string) => Promise<void>;
  refreshMembers: () => Promise<void>;

  // Snapshot/History
  saveSnapshot: (note?: string) => Promise<void>;
  refreshProgress: () => Promise<void>;
  compareSnapshots: (a: string, b: string | "current") => Promise<ChapterDiff[]>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
}

function updateCurrentProject(
  state: ProjectStore,
  updater: (project: Project) => Project
): Partial<ProjectStore> {
  const idx = state.projects.findIndex((p) => p.id === state.currentProjectId);
  if (idx === -1) return {};
  const projects = [...state.projects];
  projects[idx] = updater(projects[idx]);
  return { projects, dirty: true };
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Auth state
  userId: null,
  userEmail: null,
  isAuthenticated: false,

  // App state
  projects: [],
  currentProjectId: null,
  currentProjectRole: null,
  activeTab: "brief",
  activeBibleSection: "characters",
  focusedBibleEntryId: null,
  activeChapterId: null,
  showProjectSwitcher: false,
  showApiSettings: false,
  darkMode: false,
  focusMode: false,
  dirty: false,
  lastSaved: null,
  llmSettings: { selectedProvider: "anthropic", selectedModel: "claude-sonnet-4" },
  snapshots: [],
  progressStats: { todayWords: 0, weekWords: 0, monthWords: 0, diffSummary: "" },
  askEditorResponse: "",
  comments: [],
  activeCommentId: null,
  exportConfig: defaultExportConfig,
  inspirationItems: [],

  // Collaboration
  projectMembers: [],
  activeEditors: [],
  realtimeUnsubscribe: null,

  currentProject: () => {
    const s = get();
    return s.projects.find((p) => p.id === s.currentProjectId) ?? null;
  },
  currentChapter: () => {
    const proj = get().currentProject();
    if (!proj) return null;
    return proj.chapters.find((c) => c.id === get().activeChapterId) ?? null;
  },
  totalWordCount: () => {
    const proj = get().currentProject();
    if (!proj) return 0;
    const exclude = get().exportConfig.excludeNonChapters;
    return proj.chapters
      .filter((ch) => !exclude || isChapterType(ch.sectionType))
      .reduce((sum, ch) => sum + ch.wordCount, 0);
  },

  // ─── Auth ───
  signIn: async (email, password) => {
    await sbSignIn(email, password);
    const user = await getCurrentUser();
    if (user) {
      set({ userId: user.id, userEmail: user.email, isAuthenticated: true });
      await get().loadFromStorage();
    }
  },
  signOut: async () => {
    const unsub = get().realtimeUnsubscribe;
    if (unsub) unsub();
    await sbSignOut();
    set({
      userId: null,
      userEmail: null,
      isAuthenticated: false,
      projects: [],
      currentProjectId: null,
      realtimeUnsubscribe: null,
    });
  },
  checkAuth: async () => {
    const user = await getCurrentUser();
    if (user) {
      set({ userId: user.id, userEmail: user.email, isAuthenticated: true });
      return true;
    }
    return false;
  },

  // ─── Project Actions ───
  createProject: async (name) => {
    const label = cleanName(name) || "Untitled Novel";
    try {
      const project = await sbCreateProject(label);
      set({
        projects: [project],
        currentProjectId: project.id,
        activeTab: "brief",
        activeChapterId: project.chapters[0]?.id ?? null,
        dirty: false,
      });
      writeUserConfig({ lastProjectId: project.id, lastActiveTab: "brief" });
    } catch (err) {
      console.error("[writer-store] createProject FAILED:", err);
    }
  },
  deleteProject: async (id) => {
    await sbDeleteProject(id);
    const projects = get().projects.filter((p) => p.id !== id);
    const currentProjectId = get().currentProjectId === id ? (projects[0]?.id ?? null) : get().currentProjectId;
    set({ projects, currentProjectId, dirty: false });
    if (!currentProjectId) writeUserConfig({});
  },
  switchProject: async (id) => {
    try {
      const unsub = get().realtimeUnsubscribe;
      if (unsub) unsub();

      const project = await readProject(id);
      const role = await getProjectRole(id);
      const llmSettings = await readLlmSettings(id);
      const comments = await sbReadComments(id);
      const exportConfig = await readExportConfig(id);
      const inspirationItems = await readInspirationItems(id);
      const members = await listProjectMembers(id);

      // Set up realtime
      const unsubscribe = subscribeToProject(id, {
        onPresenceChange: (presences) => set({ activeEditors: presences }),
        onChapterChange: (payload) => {
          if (payload.eventType === "UPDATE" && payload.new) {
            // Ignore our own updates
          }
        },
        onCommentChange: () => {
          // Refresh comments
          sbReadComments(id).then((c) => set({ comments: c }));
        },
      });

      set({
        projects: [project],
        currentProjectId: id,
        currentProjectRole: role,
        activeTab: "brief",
        activeBibleSection: "characters",
        focusedBibleEntryId: null,
        activeChapterId: project.chapters[0]?.id ?? null,
        llmSettings,
        comments,
        exportConfig,
        inspirationItems,
        projectMembers: members,
        realtimeUnsubscribe: unsubscribe,
        dirty: false,
      });
      writeUserConfig({
        lastProjectId: id,
        lastActiveTab: "brief",
        lastActiveBibleSection: "characters",
        lastActiveChapterId: project.chapters[0]?.id ?? null,
      });
      await get().refreshProgress();
    } catch (err) {
      console.error("[writer-store] switchProject FAILED:", err);
    }
  },
  renameProject: (id, name) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)),
      dirty: true,
    }));
    void saveProjectMeta(id, { name: cleanName(name) });
  },
  setShowProjectSwitcher: (show) => set({ showProjectSwitcher: show }),
  setShowApiSettings: (show) => set({ showApiSettings: show }),

  // ─── Navigation ───
  setActiveTab: (tab) => {
    set({ activeTab: tab });
    const s = get();
    writeUserConfig({
      lastProjectId: s.currentProjectId ?? undefined,
      lastActiveTab: tab,
      lastActiveBibleSection: s.activeBibleSection,
      lastActiveChapterId: s.activeChapterId,
    });
    // Broadcast presence
    if (s.currentProjectId && s.userId) {
      broadcastPresence(s.currentProjectId, {
        userId: s.userId,
        displayName: s.userEmail ?? "",
        activeChapterId: s.activeChapterId,
        activeTab: tab,
        lastSeen: new Date().toISOString(),
      });
    }
  },
  setActiveBibleSection: (section) => {
    set({ activeBibleSection: section, focusedBibleEntryId: null });
    const s = get();
    writeUserConfig({
      lastProjectId: s.currentProjectId ?? undefined,
      lastActiveTab: s.activeTab,
      lastActiveBibleSection: section,
      lastActiveChapterId: s.activeChapterId,
    });
  },
  navigateToBibleEntry: (section, id) =>
    set({ activeTab: "bible", activeBibleSection: section, focusedBibleEntryId: id }),
  clearFocusedBibleEntry: () => set({ focusedBibleEntryId: null }),
  setActiveChapterId: (id) => {
    set({ activeChapterId: id });
    const s = get();
    writeUserConfig({
      lastProjectId: s.currentProjectId ?? undefined,
      lastActiveTab: s.activeTab,
      lastActiveBibleSection: s.activeBibleSection,
      lastActiveChapterId: id,
    });
    if (s.currentProjectId && s.userId) {
      broadcastPresence(s.currentProjectId, {
        userId: s.userId,
        displayName: s.userEmail ?? "",
        activeChapterId: id,
        activeTab: s.activeTab,
        lastSeen: new Date().toISOString(),
      });
    }
  },
  setDarkMode: (dark) => {
    set({ darkMode: dark, dirty: true });
    const proj = get().currentProject();
    if (proj && get().currentProjectId) {
      void saveProjectSettings(get().currentProjectId!, { ...proj.settings, darkMode: dark });
    }
  },
  setFocusMode: (focus) => set({ focusMode: focus }),

  // ─── Brief ───
  updateBrief: (field, value) => {
    set((s) => updateCurrentProject(s, (p) => ({ ...p, brief: { ...p.brief, [field]: value } })));
    const projectId = get().currentProjectId;
    if (projectId) void saveProjectBrief(projectId, { [field]: value });
  },

  // ─── Acts ───
  addAct: (label) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: [...p.acts, { id: crypto.randomUUID(), label: label ?? `Act ${p.acts.length + 1}` }],
      }))
    );
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },
  updateAct: (id, label) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: p.acts.map((a) => (a.id === id ? { ...a, label } : a)),
      }))
    );
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },
  deleteAct: (id) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: p.acts.filter((a) => a.id !== id),
        chapters: p.chapters.map((ch) => (ch.act === id ? { ...ch, act: null } : ch)),
      }))
    );
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },

  // ─── Chapters ───
  addChapter: () => {
    set((s) => {
      const proj = s.projects.find((p) => p.id === s.currentProjectId);
      if (!proj) return {};
      const ch = createDefaultChapter(proj.chapters.length + 1);
      const updates = updateCurrentProject(s, (p) => ({ ...p, chapters: [...p.chapters, ch] }));
      // Save to Supabase
      if (s.currentProjectId) void saveChapter(s.currentProjectId, ch);
      return { ...updates, activeChapterId: s.activeChapterId ?? ch.id };
    });
  },
  addSection: (sectionType) => {
    set((s) => {
      const proj = s.projects.find((p) => p.id === s.currentProjectId);
      if (!proj) return {};
      const ch = createDefaultChapter(proj.chapters.length + 1, sectionType);
      const updates = updateCurrentProject(s, (p) => ({ ...p, chapters: [...p.chapters, ch] }));
      if (s.currentProjectId) void saveChapter(s.currentProjectId, ch);
      return { ...updates, activeChapterId: s.activeChapterId ?? ch.id };
    });
  },
  updateChapter: (id, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) => {
          if (ch.id !== id) return ch;
          const merged = { ...ch, ...updates };
          if (updates.sectionType && updates.sectionType !== "chapter") merged.act = null;
          return merged;
        }),
      }))
    );
    // Save to Supabase
    const chapter = get().currentProject()?.chapters.find((c) => c.id === id);
    if (chapter && get().currentProjectId) {
      void saveChapter(get().currentProjectId!, chapter);
    }
    // If scenes changed, save those too
    if (updates.scenes !== undefined && get().currentProjectId) {
      void saveScenes(id, updates.scenes ?? []);
    }
  },
  moveChapterToAct: (id, actId) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) => (ch.id === id ? { ...ch, act: actId } : ch)),
      }))
    );
    const chapter = get().currentProject()?.chapters.find((c) => c.id === id);
    if (chapter && get().currentProjectId) void saveChapter(get().currentProjectId!, chapter);
  },
  deleteChapter: (id) => {
    set((s) => {
      const result = updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.filter((ch) => ch.id !== id).map((ch, i) => ({ ...ch, number: i + 1 })),
      }));
      return { ...result, activeChapterId: s.activeChapterId === id ? null : s.activeChapterId };
    });
    void sbDeleteChapter(id);
  },
  reorderChapters: (fromIndex, toIndex) => {
    set((s) =>
      updateCurrentProject(s, (p) => {
        const chapters = [...p.chapters];
        const [moved] = chapters.splice(fromIndex, 1);
        chapters.splice(toIndex, 0, moved);
        return { ...p, chapters: chapters.map((ch, i) => ({ ...ch, number: i + 1 })) };
      })
    );
    const proj = get().currentProject();
    if (proj && get().currentProjectId) {
      void sbReorderChapters(get().currentProjectId!, proj.chapters.map((c) => c.id));
    }
  },
  reorderChaptersByIds: (chapterIds) => {
    set((s) =>
      updateCurrentProject(s, (p) => {
        const byId = new Map(p.chapters.map((ch) => [ch.id, ch] as const));
        const ordered = chapterIds.map((id) => byId.get(id)).filter((ch): ch is Chapter => !!ch);
        const knownIds = new Set(ordered.map((ch) => ch.id));
        const rest = p.chapters.filter((ch) => !knownIds.has(ch.id));
        const chapters = [...ordered, ...rest].map((ch, i) => ({ ...ch, number: i + 1 }));
        return { ...p, chapters };
      })
    );
    if (get().currentProjectId) {
      const proj = get().currentProject();
      if (proj) void sbReorderChapters(get().currentProjectId!, proj.chapters.map((c) => c.id));
    }
  },

  // ─── Scenes ───
  addScene: (chapterId) => {
    const scene = createDefaultScene();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, scenes: [...ch.scenes, scene] } : ch
        ),
      }))
    );
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },
  updateScene: (chapterId, sceneId, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) =>
          ch.id === chapterId
            ? { ...ch, scenes: ch.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...updates } : sc)) }
            : ch
        ),
      }))
    );
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },
  deleteScene: (chapterId, sceneId) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, scenes: ch.scenes.filter((sc) => sc.id !== sceneId) } : ch
        ),
      }))
    );
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },

  // ─── Bible ───
  addCharacter: () => {
    const character = createDefaultCharacter();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: [...p.bible.characters, character] },
      }))
    );
    if (get().currentProjectId) void saveCharacter(get().currentProjectId!, character);
  },
  updateCharacter: (id, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: p.bible.characters.map((c) => (c.id === id ? { ...c, ...updates } : c)) },
      }))
    );
    const char = get().currentProject()?.bible.characters.find((c) => c.id === id);
    if (char && get().currentProjectId) void saveCharacter(get().currentProjectId!, char);
  },
  deleteCharacter: (id) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: p.bible.characters.filter((c) => c.id !== id) },
      }))
    );
    void sbDeleteCharacter(id);
  },

  addThread: () => {
    const thread = createDefaultThread();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: [...p.bible.threads, thread] },
      }))
    );
    if (get().currentProjectId) void saveThread(get().currentProjectId!, thread);
  },
  updateThread: (id, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: p.bible.threads.map((t) => (t.id === id ? { ...t, ...updates } : t)) },
      }))
    );
    const thread = get().currentProject()?.bible.threads.find((t) => t.id === id);
    if (thread && get().currentProjectId) void saveThread(get().currentProjectId!, thread);
  },
  deleteThread: (id) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: p.bible.threads.filter((t) => t.id !== id) },
      }))
    );
    void sbDeleteThread(id);
  },

  addLocation: () => {
    const location = createDefaultLocation();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: [...p.bible.locations, location] },
      }))
    );
    if (get().currentProjectId) void saveLocation(get().currentProjectId!, location);
  },
  updateLocation: (id, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: p.bible.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)) },
      }))
    );
    const loc = get().currentProject()?.bible.locations.find((l) => l.id === id);
    if (loc && get().currentProjectId) void saveLocation(get().currentProjectId!, loc);
  },
  deleteLocation: (id) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: p.bible.locations.filter((l) => l.id !== id) },
      }))
    );
    void sbDeleteLocation(id);
  },

  addCodexEntry: () => {
    const entry = createDefaultCodexEntry();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: [...p.bible.codex, entry] },
      }))
    );
    if (get().currentProjectId) void saveCodexEntry(get().currentProjectId!, entry);
  },
  updateCodexEntry: (id, updates) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: p.bible.codex.map((e) => (e.id === id ? { ...e, ...updates } : e)) },
      }))
    );
    const entry = get().currentProject()?.bible.codex.find((e) => e.id === id);
    if (entry && get().currentProjectId) void saveCodexEntry(get().currentProjectId!, entry);
  },
  deleteCodexEntry: (id) => {
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: p.bible.codex.filter((e) => e.id !== id) },
      }))
    );
    void sbDeleteCodexEntry(id);
  },

  // ─── Notes ───
  updateGeneralNotes: (notes) => {
    set((s) => updateCurrentProject(s, (p) => ({ ...p, generalNotes: notes })));
    if (get().currentProjectId) void saveProjectMeta(get().currentProjectId!, { generalNotes: notes });
  },
  setAskEditorResponse: (value) => set({ askEditorResponse: value }),
  refreshBibleFromManuscript: (notes) =>
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: {
          ...p.bible,
          codex: [
            ...p.bible.codex,
            {
              id: crypto.randomUUID(),
              entryType: "timeline",
              category: "Auto",
              name: `Refresh ${new Date().toLocaleDateString()}`,
              alsoKnownAs: [],
              timeframe: "",
              sources: [],
              content: notes,
            },
          ],
        },
      }))
    ),

  // ─── Comments ───
  addComment: (comment) => {
    set((s) => ({ comments: [...s.comments, comment], dirty: true }));
    if (get().currentProjectId) void sbAddComment(get().currentProjectId!, comment);
  },
  addCommentReply: (commentId, reply) => {
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
      ),
      dirty: true,
    }));
    void sbAddCommentReply(commentId, reply.text);
  },
  resolveComment: (commentId) => {
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== commentId),
      activeCommentId: s.activeCommentId === commentId ? null : s.activeCommentId,
      dirty: true,
    }));
    void sbResolveComment(commentId);
  },
  setActiveCommentId: (id) => set({ activeCommentId: id }),
  getChapterComments: (chapterId) => get().comments.filter((c) => c.chapterId === chapterId),

  // ─── Export Config ───
  updateExportConfig: (updates) => {
    set((s) => ({ exportConfig: { ...s.exportConfig, ...updates }, dirty: true }));
    if (get().currentProjectId) {
      void saveExportConfig(get().currentProjectId!, { ...get().exportConfig, ...updates });
    }
  },

  // ─── Inspiration ───
  addInspirationFiles: async (files) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const newItems: InspirationItem[] = [];
    for (const { fileName, data } of files) {
      const item = await uploadInspirationFile(projectId, data, fileName);
      newItems.push(item);
    }
    set((s) => ({ inspirationItems: [...s.inspirationItems, ...newItems] }));
  },
  removeInspirationItem: async (id) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await sbRemoveInspirationItem(projectId, id);
    set((s) => ({ inspirationItems: s.inspirationItems.filter((i) => i.id !== id) }));
  },
  updateInspirationItem: (id, updates) => {
    set((s) => ({
      inspirationItems: s.inspirationItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
      dirty: true,
    }));
    void sbUpdateInspirationItem(id, updates);
  },

  // ─── Persistence ───
  loadFromStorage: async () => {
    const user = await getCurrentUser();
    if (!user) {
      set({ isAuthenticated: false, projects: [], currentProjectId: null });
      return;
    }
    set({ userId: user.id, userEmail: user.email, isAuthenticated: true });

    const cfg = readUserConfig();
    const projectList = await sbListProjects();

    if (projectList.length === 0) {
      set({ projects: [], currentProjectId: null, dirty: false });
      return;
    }

    // Try to restore last project, or fall back to first
    const targetId = cfg.lastProjectId && projectList.some((p) => p.id === cfg.lastProjectId)
      ? cfg.lastProjectId
      : projectList[0].id;

    try {
      const project = await readProject(targetId);
      const role = await getProjectRole(targetId);
      const llmSettings = await readLlmSettings(targetId);
      const comments = await sbReadComments(targetId);
      const exportConfig = await readExportConfig(targetId);
      const inspirationItems = await readInspirationItems(targetId);
      const members = await listProjectMembers(targetId);

      // Restore UI state from config
      const activeTab: TabId = cfg.lastActiveTab ?? "brief";
      const activeBibleSection = cfg.lastActiveBibleSection ?? "characters";
      const chapterIds = new Set(project.chapters.map((c) => c.id));
      const activeChapterId = cfg.lastActiveChapterId && chapterIds.has(cfg.lastActiveChapterId)
        ? cfg.lastActiveChapterId
        : (project.chapters[0]?.id ?? null);

      // Set up realtime
      const unsubscribe = subscribeToProject(targetId, {
        onPresenceChange: (presences) => set({ activeEditors: presences }),
        onChapterChange: () => {},
        onCommentChange: () => {
          sbReadComments(targetId).then((c) => set({ comments: c }));
        },
      });

      set({
        projects: [project],
        currentProjectId: project.id,
        currentProjectRole: role,
        activeTab,
        activeBibleSection,
        activeChapterId,
        llmSettings,
        comments,
        exportConfig,
        inspirationItems,
        projectMembers: members,
        realtimeUnsubscribe: unsubscribe,
        dirty: false,
      });
      await get().refreshProgress();
    } catch (error) {
      console.error("Failed to load project:", error);
      set({ projects: [], currentProjectId: null, dirty: false });
    }
  },

  saveToStorage: async () => {
    const s = get();
    const project = s.currentProject();
    if (!project || !s.currentProjectId) return;

    try {
      // Granular saves have already been fired per-action.
      // This is a safety-net full flush.
      await saveProjectBrief(s.currentProjectId, project.brief);
      await saveProjectMeta(s.currentProjectId, { name: project.name, generalNotes: project.generalNotes });
      await saveActs(s.currentProjectId, project.acts);
      for (const ch of project.chapters) {
        await saveChapter(s.currentProjectId, ch);
      }
      await saveExportConfig(s.currentProjectId, s.exportConfig);
      await saveLlmSettings(s.currentProjectId, s.llmSettings);

      set({ dirty: false, lastSaved: new Date().toISOString() });
    } catch (err) {
      console.error("[writer-store] saveToStorage error:", err);
    }
  },

  exportCurrentProjectZip: async () => {
    const s = get();
    if (!s.currentProjectId) return;
    const project = s.currentProject();
    if (!project) return;
    await exportProjectAsZip(s.currentProjectId, project.name);
  },

  importProjectZip: async (data) => {
    const projectId = await importProjectFromZip(data);
    await get().switchProject(projectId);
  },

  // ─── LLM Settings ───
  updateLlmSettings: async (updates) => {
    const merged = { ...get().llmSettings, ...updates };
    set({ llmSettings: merged });
    if (get().currentProjectId) {
      await saveLlmSettings(get().currentProjectId!, merged);
    }
  },

  // ─── Collaboration ───
  inviteUser: async (email, role) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await sbInviteUser(projectId, email, role);
    await get().refreshMembers();
  },
  removeProjectMember: async (userId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await sbRemoveProjectMember(projectId, userId);
    await get().refreshMembers();
  },
  refreshMembers: async () => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const members = await listProjectMembers(projectId);
    set({ projectMembers: members });
  },

  // ─── Snapshots ───
  saveSnapshot: async (note) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await get().saveToStorage();
    const msg = note || `Snapshot: ${new Date().toLocaleString()}`;
    await sbCreateSnapshot(projectId, msg);
    await get().refreshProgress();
  },
  refreshProgress: async () => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const [snaps, progress] = await Promise.all([
      listSnapshots(projectId),
      getWordCountProgress(projectId),
    ]);
    set({
      snapshots: snaps,
      progressStats: { ...progress, diffSummary: "" },
    });
  },
  compareSnapshots: async (a, b) => {
    const projectId = get().currentProjectId;
    if (!projectId) return [];
    return diffSnapshots(a, b, projectId);
  },
  restoreSnapshot: async (snapshotId) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await sbRestoreSnapshot(snapshotId, projectId);
    // Reload project
    const project = await readProject(projectId);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? project : p)),
      dirty: false,
    }));
  },
}));

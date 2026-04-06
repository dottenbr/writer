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
  readProjectChapter,
  inviteUser as sbInviteUser,
  removeProjectMember as sbRemoveProjectMember,
  listProjectMembers,
  getProjectRole,
  exportProjectAsZip,
  importProjectFromZip,
  type LlmSettings,
  type ProjectMember,
  type SnapshotEntry,
  type ChapterDiff,
  type PresencePayload,
  type ProjectRole,
} from "../lib/supabase-service";
import { defaultExportConfig, type ExportConfig } from "../lib/export-config";
import {
  readUserConfig,
  writeUserConfig,
  readLocalProjectBundle,
  writeLocalProjectBundle,
  removeLocalProjectBundle,
} from "../lib/local-config";

interface ProgressStats {
  todayWords: number;
  weekWords: number;
  monthWords: number;
  diffSummary: string;
}

interface ChapterConflictDetails {
  chapterId: string;
  remoteTitle: string;
  remoteContent: string;
  remoteWordCount: number | null;
  remoteVersion: number | null;
  remoteUpdatedAt: string | null;
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
  syncStatus: "idle" | "saving" | "saved" | "conflict" | "offline";
  chapterConflicts: Record<string, string>;
  chapterConflictDetails: Record<string, ChapterConflictDetails>;
  dirtyChapterIds: string[];

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
  loadChapterConflictDetails: (id: string) => Promise<void>;
  acceptRemoteChapterConflict: (id: string) => Promise<void>;
  overwriteRemoteChapterConflict: (id: string) => Promise<void>;
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
  flushPendingSync: () => Promise<void>;

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

const chapterSyncTimers = new Map<string, number>();

function chapterSyncKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function cancelScheduledChapterSync(projectId: string, chapterId: string): void {
  const key = chapterSyncKey(projectId, chapterId);
  const existing = chapterSyncTimers.get(key);
  if (existing) {
    window.clearTimeout(existing);
    chapterSyncTimers.delete(key);
  }
}

function cancelScheduledProjectSyncs(projectId: string): void {
  for (const key of Array.from(chapterSyncTimers.keys())) {
    if (!key.startsWith(`${projectId}:`)) continue;
    const timer = chapterSyncTimers.get(key);
    if (timer) window.clearTimeout(timer);
    chapterSyncTimers.delete(key);
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  function persistCurrentProjectLocally(): void {
    const state = get();
    const project = state.currentProject();
    if (!project || !state.currentProjectId) return;
    writeLocalProjectBundle({
      projectId: state.currentProjectId,
      project,
      exportConfig: state.exportConfig,
      comments: state.comments,
      inspirationItems: state.inspirationItems,
      updatedAt: new Date().toISOString(),
    });
  }

  function canEditCurrentProject(): boolean {
    const role = get().currentProjectRole;
    return role === "owner" || role === "editor";
  }

  async function loadChapterConflictDetailsForProject(projectId: string, chapterId: string): Promise<void> {
    try {
      const remoteChapter = await readProjectChapter(projectId, chapterId);
      if (!remoteChapter) return;
      set((state) => ({
        chapterConflictDetails: {
          ...state.chapterConflictDetails,
          [chapterId]: {
            chapterId,
            remoteTitle: remoteChapter.title,
            remoteContent: remoteChapter.content,
            remoteWordCount: remoteChapter.wordCount ?? null,
            remoteVersion: remoteChapter.version ?? null,
            remoteUpdatedAt: remoteChapter.updatedAt ?? null,
          },
        },
      }));
    } catch (error) {
      console.error("[writer-store] loadChapterConflictDetails error:", error);
    }
  }

  async function syncChapterToRemote(projectId: string, chapterId: string): Promise<void> {
    const chapter = get().currentProject()?.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;

    set({ syncStatus: "saving" });
    try {
      const result = await saveChapter(projectId, chapter, chapter.version);
      if (result.conflict) {
        set((state) => ({
          syncStatus: "conflict",
          chapterConflicts: {
            ...state.chapterConflicts,
            [chapterId]: "This chapter changed remotely. Review the differences before choosing which version to keep.",
          },
        }));
        void loadChapterConflictDetailsForProject(projectId, chapterId);
        return;
      }

      set((state) =>
        updateCurrentProject(state, (project) => ({
          ...project,
          chapters: project.chapters.map((item) =>
            item.id === chapterId
              ? {
                  ...item,
                  version: result.newVersion ?? item.version ?? 1,
                  updatedAt: result.updatedAt ?? item.updatedAt,
                }
              : item
          ),
        }))
      );
      set((state) => {
        const nextConflicts = { ...state.chapterConflicts };
        const nextConflictDetails = { ...state.chapterConflictDetails };
        delete nextConflicts[chapterId];
        delete nextConflictDetails[chapterId];
        return {
          syncStatus: "saved",
          chapterConflicts: nextConflicts,
          chapterConflictDetails: nextConflictDetails,
          dirtyChapterIds: state.dirtyChapterIds.filter((id) => id !== chapterId),
          lastSaved: new Date().toISOString(),
        };
      });
      persistCurrentProjectLocally();
    } catch (error) {
      console.error("[writer-store] syncChapterToRemote error:", error);
      set({ syncStatus: "offline" });
    }
  }

  function scheduleChapterSync(projectId: string, chapterId: string): void {
    cancelScheduledChapterSync(projectId, chapterId);
    const key = chapterSyncKey(projectId, chapterId);
    const timer = window.setTimeout(() => {
      chapterSyncTimers.delete(key);
      void syncChapterToRemote(projectId, chapterId);
    }, 800);
    chapterSyncTimers.set(key, timer);
  }

  async function applyRemoteChapterChange(projectId: string, chapterId: string): Promise<void> {
    const state = get();
    if (state.currentProjectId !== projectId) return;
    if (state.dirtyChapterIds.length > 0 || state.dirtyChapterIds.includes(chapterId)) {
      set((current) => ({
        syncStatus: "conflict",
        chapterConflicts: {
          ...current.chapterConflicts,
          [chapterId]: "A remote edit arrived while you still have unsynced local changes. Review the differences before continuing.",
        },
      }));
      void loadChapterConflictDetailsForProject(projectId, chapterId);
      return;
    }

    try {
      const freshProject = await readProject(projectId);
      set((current) => {
        if (current.currentProjectId !== projectId) return current;
        return {
          projects: current.projects.map((project) => (project.id === projectId ? freshProject : project)),
          syncStatus: current.syncStatus === "conflict" ? "conflict" : "saved",
        };
      });
      persistCurrentProjectLocally();
    } catch (error) {
      console.error("[writer-store] applyRemoteChapterChange error:", error);
    }
  }

  async function refreshProjectFromRemote(projectId: string): Promise<void> {
    const state = get();
    if (state.currentProjectId !== projectId || state.dirtyChapterIds.length > 0) return;
    try {
      const freshProject = await readProject(projectId);
      set((current) => {
        if (current.currentProjectId !== projectId) return current;
        return {
          projects: current.projects.map((project) => (project.id === projectId ? freshProject : project)),
          syncStatus: current.syncStatus === "conflict" ? "conflict" : "saved",
        };
      });
      persistCurrentProjectLocally();
    } catch (error) {
      console.error("[writer-store] refreshProjectFromRemote error:", error);
    }
  }

  return ({
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
  syncStatus: "idle",
  chapterConflicts: {},
  chapterConflictDetails: {},
  dirtyChapterIds: [],

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
        currentProjectRole: "owner",
        activeTab: "brief",
        activeChapterId: project.chapters[0]?.id ?? null,
        dirty: false,
        syncStatus: "idle",
      });
      persistCurrentProjectLocally();
      writeUserConfig({ lastProjectId: project.id, lastActiveTab: "brief" });
    } catch (err) {
      console.error("[writer-store] createProject FAILED:", err);
    }
  },
  deleteProject: async (id) => {
    cancelScheduledProjectSyncs(id);
    await sbDeleteProject(id);
    removeLocalProjectBundle(id);
    const projects = get().projects.filter((p) => p.id !== id);
    const currentProjectId = get().currentProjectId === id ? (projects[0]?.id ?? null) : get().currentProjectId;
    set({ projects, currentProjectId, dirty: false });
    if (!currentProjectId) writeUserConfig({});
  },
  switchProject: async (id) => {
    try {
      const unsub = get().realtimeUnsubscribe;
      if (unsub) unsub();
      const previousProjectId = get().currentProjectId;
      if (previousProjectId) cancelScheduledProjectSyncs(previousProjectId);

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
            void applyRemoteChapterChange(id, payload.new.id);
          } else if (payload.eventType === "INSERT" && payload.new) {
            void applyRemoteChapterChange(id, payload.new.id);
          } else if (payload.eventType === "DELETE") {
            void refreshProjectFromRemote(id);
          }
        },
        onCommentChange: () => {
          sbReadComments(id).then((c) => {
            set({ comments: c });
            persistCurrentProjectLocally();
          });
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
        syncStatus: "idle",
        chapterConflicts: {},
        chapterConflictDetails: {},
        dirtyChapterIds: [],
      });
      persistCurrentProjectLocally();
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
    if (!canEditCurrentProject()) return;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)),
      dirty: true,
    }));
    persistCurrentProjectLocally();
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
    if (!canEditCurrentProject()) return;
    set({ darkMode: dark, dirty: true });
    const proj = get().currentProject();
    if (proj && get().currentProjectId) {
      void saveProjectSettings(get().currentProjectId!, { ...proj.settings, darkMode: dark });
    }
    persistCurrentProjectLocally();
  },
  setFocusMode: (focus) => set({ focusMode: focus }),

  // ─── Brief ───
  updateBrief: (field, value) => {
    if (!canEditCurrentProject()) return;
    set((s) => updateCurrentProject(s, (p) => ({ ...p, brief: { ...p.brief, [field]: value } })));
    persistCurrentProjectLocally();
    const projectId = get().currentProjectId;
    if (projectId) void saveProjectBrief(projectId, { [field]: value });
  },

  // ─── Acts ───
  addAct: (label) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: [...p.acts, { id: crypto.randomUUID(), label: label ?? `Act ${p.acts.length + 1}` }],
      }))
    );
    persistCurrentProjectLocally();
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },
  updateAct: (id, label) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: p.acts.map((a) => (a.id === id ? { ...a, label } : a)),
      }))
    );
    persistCurrentProjectLocally();
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },
  deleteAct: (id) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        acts: p.acts.filter((a) => a.id !== id),
        chapters: p.chapters.map((ch) => (ch.act === id ? { ...ch, act: null } : ch)),
      }))
    );
    persistCurrentProjectLocally();
    const proj = get().currentProject();
    if (proj && get().currentProjectId) void saveActs(get().currentProjectId!, proj.acts);
  },

  // ─── Chapters ───
  addChapter: () => {
    if (!canEditCurrentProject()) return;
    set((s) => {
      const proj = s.projects.find((p) => p.id === s.currentProjectId);
      if (!proj) return {};
      const ch = createDefaultChapter(proj.chapters.length + 1);
      const updates = updateCurrentProject(s, (p) => ({ ...p, chapters: [...p.chapters, ch] }));
      // Save to Supabase
      if (s.currentProjectId) void saveChapter(s.currentProjectId, ch);
      return { ...updates, activeChapterId: s.activeChapterId ?? ch.id };
    });
    persistCurrentProjectLocally();
  },
  addSection: (sectionType) => {
    if (!canEditCurrentProject()) return;
    set((s) => {
      const proj = s.projects.find((p) => p.id === s.currentProjectId);
      if (!proj) return {};
      const ch = createDefaultChapter(proj.chapters.length + 1, sectionType);
      const updates = updateCurrentProject(s, (p) => ({ ...p, chapters: [...p.chapters, ch] }));
      if (s.currentProjectId) void saveChapter(s.currentProjectId, ch);
      return { ...updates, activeChapterId: s.activeChapterId ?? ch.id };
    });
    persistCurrentProjectLocally();
  },
  updateChapter: (id, updates) => {
    if (!canEditCurrentProject()) return;
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
    set((state) => ({
      dirtyChapterIds: state.dirtyChapterIds.includes(id)
        ? state.dirtyChapterIds
        : [...state.dirtyChapterIds, id],
    }));
    persistCurrentProjectLocally();
    const chapter = get().currentProject()?.chapters.find((c) => c.id === id);
    if (chapter && get().currentProjectId) {
      scheduleChapterSync(get().currentProjectId!, id);
    }
    // If scenes changed, save those too
    if (updates.scenes !== undefined && get().currentProjectId) {
      void saveScenes(id, updates.scenes ?? []);
    }
  },
  loadChapterConflictDetails: async (id) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    await loadChapterConflictDetailsForProject(projectId, id);
  },
  acceptRemoteChapterConflict: async (id) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    let remoteChapter = get().chapterConflictDetails[id];
    if (!remoteChapter) {
      await loadChapterConflictDetailsForProject(projectId, id);
      remoteChapter = get().chapterConflictDetails[id];
    }
    if (!remoteChapter) return;

    set((state) => {
      const nextConflicts = { ...state.chapterConflicts };
      const nextConflictDetails = { ...state.chapterConflictDetails };
      delete nextConflicts[id];
      delete nextConflictDetails[id];
      return updateCurrentProject(
        {
          ...state,
          chapterConflicts: nextConflicts,
          chapterConflictDetails: nextConflictDetails,
          dirtyChapterIds: state.dirtyChapterIds.filter((chapterId) => chapterId !== id),
          syncStatus: "saved",
        },
        (project) => ({
          ...project,
          chapters: project.chapters.map((chapter) =>
            chapter.id === id
              ? {
                  ...chapter,
                  title: remoteChapter.remoteTitle,
                  content: remoteChapter.remoteContent,
                  wordCount: remoteChapter.remoteWordCount ?? chapter.wordCount,
                  version: remoteChapter.remoteVersion ?? chapter.version,
                  updatedAt: remoteChapter.remoteUpdatedAt ?? chapter.updatedAt,
                }
              : chapter
          ),
        })
      );
    });
    persistCurrentProjectLocally();
  },
  overwriteRemoteChapterConflict: async (id) => {
    const projectId = get().currentProjectId;
    const chapter = get().currentProject()?.chapters.find((item) => item.id === id);
    if (!projectId || !chapter) return;

    let remoteChapter = get().chapterConflictDetails[id];
    if (!remoteChapter) {
      await loadChapterConflictDetailsForProject(projectId, id);
      remoteChapter = get().chapterConflictDetails[id];
    }
    if (!remoteChapter) return;

    set((state) => ({
      dirtyChapterIds: state.dirtyChapterIds.includes(id) ? state.dirtyChapterIds : [...state.dirtyChapterIds, id],
      syncStatus: "saving",
    }));
    try {
      const result = await saveChapter(projectId, chapter, remoteChapter.remoteVersion ?? chapter.version);
      if (result.conflict) {
        void loadChapterConflictDetailsForProject(projectId, id);
        set((state) => ({
          syncStatus: "conflict",
          chapterConflicts: {
            ...state.chapterConflicts,
            [id]: "The remote chapter changed again while you were resolving the conflict. Review the latest version.",
          },
        }));
        return;
      }
      set((state) => {
        const nextConflicts = { ...state.chapterConflicts };
        const nextConflictDetails = { ...state.chapterConflictDetails };
        delete nextConflicts[id];
        delete nextConflictDetails[id];
        return updateCurrentProject(
          {
            ...state,
            chapterConflicts: nextConflicts,
            chapterConflictDetails: nextConflictDetails,
            dirtyChapterIds: state.dirtyChapterIds.filter((chapterId) => chapterId !== id),
            syncStatus: "saved",
            lastSaved: new Date().toISOString(),
          },
          (project) => ({
            ...project,
            chapters: project.chapters.map((item) =>
              item.id === id
                ? {
                    ...item,
                    version: result.newVersion ?? item.version ?? 1,
                    updatedAt: result.updatedAt ?? item.updatedAt,
                  }
                : item
            ),
          })
        );
      });
      persistCurrentProjectLocally();
    } catch (error) {
      console.error("[writer-store] overwriteRemoteChapterConflict error:", error);
      set({ syncStatus: "offline" });
    }
  },
  moveChapterToAct: (id, actId) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) => (ch.id === id ? { ...ch, act: actId } : ch)),
      }))
    );
    persistCurrentProjectLocally();
    const chapter = get().currentProject()?.chapters.find((c) => c.id === id);
    if (chapter && get().currentProjectId) void saveChapter(get().currentProjectId!, chapter);
  },
  deleteChapter: (id) => {
    if (!canEditCurrentProject()) return;
    if (get().currentProjectId) cancelScheduledChapterSync(get().currentProjectId!, id);
    set((s) => {
      const result = updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.filter((ch) => ch.id !== id).map((ch, i) => ({ ...ch, number: i + 1 })),
      }));
      return {
        ...result,
        activeChapterId: s.activeChapterId === id ? null : s.activeChapterId,
        dirtyChapterIds: s.dirtyChapterIds.filter((chapterId) => chapterId !== id),
      };
    });
    persistCurrentProjectLocally();
    void sbDeleteChapter(id);
  },
  reorderChapters: (fromIndex, toIndex) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => {
        const chapters = [...p.chapters];
        const [moved] = chapters.splice(fromIndex, 1);
        chapters.splice(toIndex, 0, moved);
        return { ...p, chapters: chapters.map((ch, i) => ({ ...ch, number: i + 1 })) };
      })
    );
    persistCurrentProjectLocally();
    const proj = get().currentProject();
    if (proj && get().currentProjectId) {
      void sbReorderChapters(get().currentProjectId!, proj.chapters.map((c) => c.id));
    }
  },
  reorderChaptersByIds: (chapterIds) => {
    if (!canEditCurrentProject()) return;
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
    persistCurrentProjectLocally();
    if (get().currentProjectId) {
      const proj = get().currentProject();
      if (proj) void sbReorderChapters(get().currentProjectId!, proj.chapters.map((c) => c.id));
    }
  },

  // ─── Scenes ───
  addScene: (chapterId) => {
    if (!canEditCurrentProject()) return;
    const scene = createDefaultScene();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, scenes: [...ch.scenes, scene] } : ch
        ),
      }))
    );
    persistCurrentProjectLocally();
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },
  updateScene: (chapterId, sceneId, updates) => {
    if (!canEditCurrentProject()) return;
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
    persistCurrentProjectLocally();
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },
  deleteScene: (chapterId, sceneId) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        chapters: p.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, scenes: ch.scenes.filter((sc) => sc.id !== sceneId) } : ch
        ),
      }))
    );
    persistCurrentProjectLocally();
    const chapter = get().currentProject()?.chapters.find((c) => c.id === chapterId);
    if (chapter) void saveScenes(chapterId, chapter.scenes);
  },

  // ─── Bible ───
  addCharacter: () => {
    if (!canEditCurrentProject()) return;
    const character = createDefaultCharacter();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: [...p.bible.characters, character] },
      }))
    );
    persistCurrentProjectLocally();
    if (get().currentProjectId) void saveCharacter(get().currentProjectId!, character);
  },
  updateCharacter: (id, updates) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: p.bible.characters.map((c) => (c.id === id ? { ...c, ...updates } : c)) },
      }))
    );
    persistCurrentProjectLocally();
    const char = get().currentProject()?.bible.characters.find((c) => c.id === id);
    if (char && get().currentProjectId) void saveCharacter(get().currentProjectId!, char);
  },
  deleteCharacter: (id) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, characters: p.bible.characters.filter((c) => c.id !== id) },
      }))
    );
    persistCurrentProjectLocally();
    void sbDeleteCharacter(id);
  },

  addThread: () => {
    if (!canEditCurrentProject()) return;
    const thread = createDefaultThread();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: [...p.bible.threads, thread] },
      }))
    );
    persistCurrentProjectLocally();
    if (get().currentProjectId) void saveThread(get().currentProjectId!, thread);
  },
  updateThread: (id, updates) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: p.bible.threads.map((t) => (t.id === id ? { ...t, ...updates } : t)) },
      }))
    );
    persistCurrentProjectLocally();
    const thread = get().currentProject()?.bible.threads.find((t) => t.id === id);
    if (thread && get().currentProjectId) void saveThread(get().currentProjectId!, thread);
  },
  deleteThread: (id) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, threads: p.bible.threads.filter((t) => t.id !== id) },
      }))
    );
    persistCurrentProjectLocally();
    void sbDeleteThread(id);
  },

  addLocation: () => {
    if (!canEditCurrentProject()) return;
    const location = createDefaultLocation();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: [...p.bible.locations, location] },
      }))
    );
    persistCurrentProjectLocally();
    if (get().currentProjectId) void saveLocation(get().currentProjectId!, location);
  },
  updateLocation: (id, updates) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: p.bible.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)) },
      }))
    );
    persistCurrentProjectLocally();
    const loc = get().currentProject()?.bible.locations.find((l) => l.id === id);
    if (loc && get().currentProjectId) void saveLocation(get().currentProjectId!, loc);
  },
  deleteLocation: (id) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, locations: p.bible.locations.filter((l) => l.id !== id) },
      }))
    );
    persistCurrentProjectLocally();
    void sbDeleteLocation(id);
  },

  addCodexEntry: () => {
    if (!canEditCurrentProject()) return;
    const entry = createDefaultCodexEntry();
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: [...p.bible.codex, entry] },
      }))
    );
    persistCurrentProjectLocally();
    if (get().currentProjectId) void saveCodexEntry(get().currentProjectId!, entry);
  },
  updateCodexEntry: (id, updates) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: p.bible.codex.map((e) => (e.id === id ? { ...e, ...updates } : e)) },
      }))
    );
    persistCurrentProjectLocally();
    const entry = get().currentProject()?.bible.codex.find((e) => e.id === id);
    if (entry && get().currentProjectId) void saveCodexEntry(get().currentProjectId!, entry);
  },
  deleteCodexEntry: (id) => {
    if (!canEditCurrentProject()) return;
    set((s) =>
      updateCurrentProject(s, (p) => ({
        ...p,
        bible: { ...p.bible, codex: p.bible.codex.filter((e) => e.id !== id) },
      }))
    );
    persistCurrentProjectLocally();
    void sbDeleteCodexEntry(id);
  },

  // ─── Notes ───
  updateGeneralNotes: (notes) => {
    if (!canEditCurrentProject()) return;
    set((s) => updateCurrentProject(s, (p) => ({ ...p, generalNotes: notes })));
    persistCurrentProjectLocally();
    if (get().currentProjectId) void saveProjectMeta(get().currentProjectId!, { generalNotes: notes });
  },
  setAskEditorResponse: (value) => set({ askEditorResponse: value }),
  refreshBibleFromManuscript: (notes) => {
    if (!canEditCurrentProject()) return;
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
    );
    persistCurrentProjectLocally();
  },

  // ─── Comments ───
  addComment: (comment) => {
    set((s) => ({ comments: [...s.comments, comment], dirty: true }));
    persistCurrentProjectLocally();
    if (get().currentProjectId) void sbAddComment(get().currentProjectId!, comment);
  },
  addCommentReply: (commentId, reply) => {
    set((s) => ({
      comments: s.comments.map((c) =>
        c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
      ),
      dirty: true,
    }));
    persistCurrentProjectLocally();
    void sbAddCommentReply(commentId, reply.text);
  },
  resolveComment: (commentId) => {
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== commentId),
      activeCommentId: s.activeCommentId === commentId ? null : s.activeCommentId,
      dirty: true,
    }));
    persistCurrentProjectLocally();
    void sbResolveComment(commentId);
  },
  setActiveCommentId: (id) => set({ activeCommentId: id }),
  getChapterComments: (chapterId) => get().comments.filter((c) => c.chapterId === chapterId),

  // ─── Export Config ───
  updateExportConfig: (updates) => {
    if (!canEditCurrentProject()) return;
    set((s) => ({ exportConfig: { ...s.exportConfig, ...updates }, dirty: true }));
    persistCurrentProjectLocally();
    if (get().currentProjectId) {
      void saveExportConfig(get().currentProjectId!, { ...get().exportConfig, ...updates });
    }
  },

  // ─── Inspiration ───
  addInspirationFiles: async (files) => {
    const projectId = get().currentProjectId;
    if (!projectId || !canEditCurrentProject()) return;
    const newItems: InspirationItem[] = [];
    for (const { fileName, data } of files) {
      const item = await uploadInspirationFile(projectId, data, fileName);
      newItems.push(item);
    }
    set((s) => ({ inspirationItems: [...s.inspirationItems, ...newItems] }));
    persistCurrentProjectLocally();
  },
  removeInspirationItem: async (id) => {
    const projectId = get().currentProjectId;
    if (!projectId || !canEditCurrentProject()) return;
    await sbRemoveInspirationItem(projectId, id);
    set((s) => ({ inspirationItems: s.inspirationItems.filter((i) => i.id !== id) }));
    persistCurrentProjectLocally();
  },
  updateInspirationItem: (id, updates) => {
    if (!canEditCurrentProject()) return;
    set((s) => ({
      inspirationItems: s.inspirationItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
      dirty: true,
    }));
    persistCurrentProjectLocally();
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
        onChapterChange: (payload) => {
          if (payload.new?.id) void applyRemoteChapterChange(targetId, payload.new.id);
        },
        onCommentChange: () => {
          sbReadComments(targetId).then((c) => {
            set({ comments: c });
            persistCurrentProjectLocally();
          });
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
        syncStatus: "idle",
        chapterConflicts: {},
        chapterConflictDetails: {},
        dirtyChapterIds: [],
      });
      persistCurrentProjectLocally();
      await get().refreshProgress();
    } catch (error) {
      console.error("Failed to load project:", error);
      const cached = readLocalProjectBundle(targetId);
      if (cached) {
        set({
          projects: [cached.project],
          currentProjectId: cached.projectId,
          activeTab: cfg.lastActiveTab ?? "brief",
          activeBibleSection: cfg.lastActiveBibleSection ?? "characters",
          activeChapterId: cfg.lastActiveChapterId ?? cached.project.chapters[0]?.id ?? null,
          exportConfig: cached.exportConfig,
          comments: cached.comments ?? [],
          inspirationItems: cached.inspirationItems ?? [],
          dirty: true,
          syncStatus: "offline",
          chapterConflicts: {},
          chapterConflictDetails: {},
          dirtyChapterIds: [],
        });
        return;
      }
      set({ projects: [], currentProjectId: null, dirty: false, syncStatus: "offline" });
    }
  },

  saveToStorage: async () => {
    const s = get();
    const project = s.currentProject();
    if (!project || !s.currentProjectId) return;

    try {
      persistCurrentProjectLocally();
      await get().flushPendingSync();
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
      set({ syncStatus: "offline" });
    }
  },
  flushPendingSync: async () => {
    const state = get();
    const projectId = state.currentProjectId;
    const project = state.currentProject();
    if (!projectId || !project) return;
    const pendingChapterIds = state.dirtyChapterIds.filter((chapterId) =>
      project.chapters.some((chapter) => chapter.id === chapterId)
    );
    for (const chapterId of pendingChapterIds) cancelScheduledChapterSync(projectId, chapterId);
    const pending = pendingChapterIds.map((chapterId) => syncChapterToRemote(projectId, chapterId));
    await Promise.all(pending);
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
    if (!projectId || get().currentProjectRole !== "owner") return;
    await sbInviteUser(projectId, email, role);
    await get().refreshMembers();
  },
  removeProjectMember: async (userId) => {
    const projectId = get().currentProjectId;
    if (!projectId || get().currentProjectRole !== "owner") return;
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
    const [project, comments, exportConfig, inspirationItems] = await Promise.all([
      readProject(projectId),
      sbReadComments(projectId),
      readExportConfig(projectId),
      readInspirationItems(projectId),
    ]);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? project : p)),
      comments,
      exportConfig,
      inspirationItems,
      dirty: false,
    }));
    persistCurrentProjectLocally();
  },
  });
});

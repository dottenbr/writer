import type { Project, Chapter, Character, Thread, Location, CodexEntry, ProjectJson, ProjectAct, Comment, InspirationItem, SectionType } from "../types";
import type { ExportConfig } from "./export-config";
import { defaultExportConfig } from "./export-config";
import { createDefaultChapter, createDefaultProject, isChapterType, SECTION_TYPE_LABELS, formatSectionHeading, deriveChapterNumbers } from "../types";
import { countWords, markdownToHtml, htmlToMarkdown } from "./markdown";
import {
  mkdir,
  writeTextFile,
  readTextFile,
  exists,
  readDir,
  remove,
  readFile,
  writeFile,
  documentDir,
  isTauriRuntime,
} from "./fs-backend";

function logFs(msg: string, ...args: unknown[]) {
  console.log(`[writer-fs] ${msg}`, ...args);
}

function normalizePath(path: string): string {
  return path.replace(/\/\/+/g, "/").replace(/\/+$/g, "");
}

function slugify(value: string): string {
  return (value || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chapterStemFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/i, "");
}

function briefProjectMeta(project: Project): ProjectJson["brief"] {
  return {
    title: project.brief.title,
    subtitle: project.brief.subtitle,
    genre: project.brief.genre,
    logline: project.brief.logline,
    themes: project.brief.themes,
    targetWordCount: project.brief.targetWordCount,
    audience: project.brief.audience,
    comparableTitles: project.brief.comparableTitles,
  };
}

function projectJsonPath(path: string): string {
  return `${path}/.writer/project.json`;
}

function bibleFilePath(path: string, name: "characters" | "threads" | "locations" | "codex"): string {
  return `${path}/.writer/${name}.json`;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    if (!(await exists(filePath))) return fallback;
    return JSON.parse(await readTextFile(filePath)) as T;
  } catch {
    return fallback;
  }
}

const relationshipTypePriority: Record<Character["relationships"][number]["type"], number> = {
  romantic: 7,
  family: 6,
  mentor: 5,
  rivalry: 4,
  conflict: 3,
  professional: 2,
  friendship: 1,
  other: 0,
};

function normalizeCharacterRelationships(
  relationships: Character["relationships"] | string | undefined
): Character["relationships"] {
  if (!Array.isArray(relationships)) return [];
  const deduped = new Map<string, Character["relationships"][number]>();
  for (const relationship of relationships) {
    const withCharacterId = relationship?.withCharacterId?.trim();
    if (!withCharacterId) continue;

    const existing = deduped.get(withCharacterId);
    if (!existing) {
      deduped.set(withCharacterId, { ...relationship, withCharacterId });
      continue;
    }

    const currentPriority = relationshipTypePriority[relationship.type] ?? 0;
    const existingPriority = relationshipTypePriority[existing.type] ?? 0;
    if (currentPriority > existingPriority) {
      existing.type = relationship.type;
    }

    const existingParts = (existing.description ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    const incomingParts = (relationship.description ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    existing.description = [...new Set([...existingParts, ...incomingParts])].join("; ");
  }
  return Array.from(deduped.values());
}

function legacyRootJsonPath(path: string): string {
  return `${path}/writer-project.json`;
}

function writerConfigPath(baseDir: string): string {
  return `${baseDir}/.writer-config.json`;
}

export interface WriterConfig {
  lastProjectPath?: string;
  lastActiveTab?: AppMeta["activeTab"];
  lastActiveBibleSection?: AppMeta["activeBibleSection"];
  lastActiveChapterId?: string | null;
}

function chapterSlug(number: number, title: string, sectionType?: SectionType): string {
  const st = sectionType ?? "chapter";
  const titlePart = (title || (st === "chapter" ? "untitled" : SECTION_TYPE_LABELS[st]))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${String(number).padStart(2, "0")}-${titlePart}.md`;
}

const SECTION_HEADING_RE = /^(?:Chapter\s+\d+|Prologue|Epilogue|Foreword|Afterword|Author'?s?\s+Note)\s*[—-]\s*/i;

function chapterTitleFromMarkdown(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!h1) return fallback;
  return h1.replace(SECTION_HEADING_RE, "").trim() || fallback;
}

function inferSectionTypeFromMarkdown(content: string): SectionType {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim()?.toLowerCase() ?? "";
  const stripped = h1.replace(/^chapter\s+\d+\s*[—-]\s*/i, "");
  if (/^prologue\b/.test(h1) || /^prologue\b/.test(stripped)) return "prologue";
  if (/^epilogue\b/.test(h1) || /^epilogue\b/.test(stripped)) return "epilogue";
  if (/^foreword\b/.test(h1) || /^foreword\b/.test(stripped)) return "foreword";
  if (/^afterword\b/.test(h1) || /^afterword\b/.test(stripped)) return "afterword";
  if (/author'?s?\s+note\b/.test(h1)) return "authors_note";
  return "chapter";
}

function chapterSummaryFromMarkdown(content: string): string {
  const withoutH1 = content.replace(/^#\s+.+$/m, "").trim();
  const firstParagraph = withoutH1.split(/\n{2,}/).find((chunk) => chunk.trim().length > 0) ?? "";
  return firstParagraph.replace(/^##\s+.+$/m, "").trim().slice(0, 240);
}

function defaultProjectNameFromPath(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? "Untitled Novel";
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function ensureStructure(path: string) {
  await mkdir(`${path}/chapters`, { recursive: true });
  await mkdir(`${path}/prewriting/story-bible`, { recursive: true });
  await mkdir(`${path}/prewriting/treatment`, { recursive: true });
  await mkdir(`${path}/prewriting/outline`, { recursive: true });
  await mkdir(`${path}/prewriting/continuity`, { recursive: true });
  await mkdir(`${path}/prewriting/research`, { recursive: true });
  await mkdir(`${path}/prewriting/scenes`, { recursive: true });
  await mkdir(`${path}/inspiration`, { recursive: true });
  await mkdir(`${path}/.writer`, { recursive: true });

  const defaults: Array<[string, string]> = [
    [`${path}/prewriting/README.md`, "# Prewriting\n\nPlanning and worldbuilding notes.\n"],
    [`${path}/prewriting/story-bible/story-bible.md`, "# Story Bible\n\n## Premise\n\n"],
    [`${path}/prewriting/treatment/treatment.md`, "# Treatment\n\n"],
    [`${path}/prewriting/outline/chapter-outline.md`, "# Chapter Outline\n\n"],
    [`${path}/style-rules.md`, "# Prose Style Guide\n\n"],
    [`${path}/.writer/meta.json`, "{}\n"],
    [`${path}/.writer/settings.json`, "{\"selectedProvider\":\"anthropic\",\"selectedModel\":\"claude-sonnet-4\"}\n"],
  ];

  for (const [filePath, content] of defaults) {
    if (!(await exists(filePath))) {
      await writeTextFile(filePath, content);
    }
  }
}

export async function getProjectsBaseDir(): Promise<string> {
  const docDir = await documentDir();
  const base = normalizePath(`${docDir}/Writer`);
  logFs("getProjectsBaseDir:", base);
  await mkdir(base, { recursive: true });
  return base;
}

export async function getDefaultProjectPath(): Promise<string> {
  const base = await getProjectsBaseDir();
  return `${base}/sarre`;
}

export async function listProjects(): Promise<string[]> {
  const base = await getProjectsBaseDir();
  try {
    const entries = await readDir(base);
    return entries
      .filter((entry) => entry.isDirectory && !!entry.name)
      .map((entry) => entry.name as string)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function createProjectDirectory(name: string): Promise<string> {
  const safeName = slugify(name) || "untitled-novel";
  const base = await getProjectsBaseDir();
  const path = `${base}/${safeName}`;
  logFs("createProjectDirectory:", { name, safeName, base, path });
  try {
    await mkdir(path, { recursive: true });
    logFs("createProjectDirectory: mkdir succeeded");
  } catch (err) {
    console.error("[writer-fs] createProjectDirectory: mkdir FAILED", err);
    throw err;
  }
  await ensureStructure(path);
  return path;
}

export async function deleteProjectFromDisk(projectPath: string): Promise<void> {
  await remove(projectPath, { recursive: true });
}

export async function readWriterConfig(): Promise<WriterConfig> {
  const base = await getProjectsBaseDir();
  const defaults: WriterConfig = {};
  try {
    const path = writerConfigPath(base);
    if (!(await exists(path))) return defaults;
    const parsed = JSON.parse(await readTextFile(path)) as WriterConfig;
    return parsed ?? defaults;
  } catch {
    return defaults;
  }
}

export async function writeWriterConfig(config: WriterConfig): Promise<void> {
  const base = await getProjectsBaseDir();
  await writeTextFile(writerConfigPath(base), JSON.stringify(config, null, 2));
}

async function readProjectJson(path: string): Promise<ProjectJson | null> {
  try {
    const primary = projectJsonPath(path);
    if (await exists(primary)) {
      return JSON.parse(await readTextFile(primary)) as ProjectJson;
    }
    const legacy = legacyRootJsonPath(path);
    if (await exists(legacy)) {
      return JSON.parse(await readTextFile(legacy)) as ProjectJson;
    }
    return null;
  } catch {
    return null;
  }
}

function safeProjectFolderName(name: string): string {
  return slugify(name).replace(/^-+|-+$/g, "") || "project";
}

async function uniqueProjectPath(baseDir: string, name: string): Promise<string> {
  const base = `${baseDir}/${safeProjectFolderName(name)}`;
  if (!(await exists(base))) return base;
  let i = 2;
  while (await exists(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function zipFileName(projectName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeProjectFolderName(projectName)}-${stamp}.zip`;
}

async function collectFilePaths(rootPath: string, relPath = ""): Promise<string[]> {
  const dirPath = relPath ? `${rootPath}/${relPath}` : rootPath;
  const entries = await readDir(dirPath);
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.name) continue;
    const nextRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      out.push(...(await collectFilePaths(rootPath, nextRel)));
    } else {
      out.push(nextRel);
    }
  }
  return out;
}

function safeZipEntryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error("Invalid ZIP entry path.");
  }
  return parts.join("/");
}

export async function exportProjectAsZip(projectPath: string, projectName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const files = await collectFilePaths(projectPath);
  const zip = new JSZip();
  for (const rel of files) {
    const bytes = await readFile(`${projectPath}/${rel}`);
    zip.file(rel, bytes);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = zipFileName(projectName);
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFromZip(zipFilePath: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const fileName = zipFilePath.split("/").pop() ?? "import.zip";
  const projectName = fileName.replace(/\.zip$/i, "") || "imported-project";
  const baseDir = await getProjectsBaseDir();
  const projectPath = await uniqueProjectPath(baseDir, projectName);
  await mkdir(projectPath, { recursive: true });

  const zipBytes = await readFile(zipFilePath);
  const zip = await JSZip.loadAsync(zipBytes);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const relPath = safeZipEntryPath(entry.name);
    const parts = relPath.split("/");
    const fileNameOnly = parts.pop();
    if (!fileNameOnly) continue;
    const parent = parts.length > 0 ? `${projectPath}/${parts.join("/")}` : projectPath;
    await mkdir(parent, { recursive: true });
    const data = await entry.async("uint8array");
    await writeFile(`${parent}/${fileNameOnly}`, data);
  }

  await ensureStructure(projectPath);
  return projectPath;
}

export interface AppMeta {
  darkMode?: boolean;
  activeTab?: "brief" | "plan" | "bible" | "manuscript" | "inspiration" | "manage";
  activeBibleSection?: "characters" | "threads" | "locations" | "codex";
  activeChapterId?: string | null;
}

export interface LlmSettings {
  anthropicKey?: string;
  openaiKey?: string;
  selectedProvider: "anthropic" | "openai";
  selectedModel: string;
}

function llmSettingsStorageKey(path: string) {
  return `writer:llm-settings:${path}`;
}

export async function chooseProjectDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return getDefaultProjectPath();
  const { open } = await import("@tauri-apps/plugin-dialog");
  const defaultPath = await getProjectsBaseDir();
  const result = await open({ directory: true, multiple: false, defaultPath });
  if (!result || typeof result !== "string") return null;
  return result;
}

export async function readProjectFromDisk(path?: string): Promise<Project> {
  const projectPath = normalizePath(path ?? (await getDefaultProjectPath()));
  await ensureStructure(projectPath);
  const project = createDefaultProject(defaultProjectNameFromPath(projectPath));
  project.storagePath = projectPath;
  const projectJson = await readProjectJson(projectPath);

  const chapterEntries = await readDir(`${projectPath}/chapters`);
  const chapterFiles = chapterEntries
    .filter((entry) => !!entry.name && entry.name.endsWith(".md"))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  let acts: ProjectAct[] = projectJson?.acts ?? [];
  const needsActMigration = acts.length === 0;
  const migratedActMap = new Map<number, string>();

  const chapters: Chapter[] = [];
  const chapterMeta = projectJson?.chapterMeta ?? {};
  for (let i = 0; i < chapterFiles.length; i++) {
    const file = chapterFiles[i];
    if (!file.name) continue;
    const md = await readTextFile(`${projectPath}/chapters/${file.name}`);
    const ch = createDefaultChapter(i + 1);
    ch.title = chapterTitleFromMarkdown(md, `Chapter ${i + 1}`);
    ch.summary = chapterSummaryFromMarkdown(md);
    const bodyMd = md.replace(/^#\s+.+\n*/, "");
    ch.content = markdownToHtml(bodyMd);
    ch.wordCount = countWords(bodyMd);
    const meta = chapterMeta[chapterStemFromFileName(file.name)];
    if (meta) {
      ch.sectionType = meta.sectionType ?? inferSectionTypeFromMarkdown(md);
      if (needsActMigration && typeof meta.act === "number" && meta.act !== null) {
        if (!migratedActMap.has(meta.act)) {
          const actId = crypto.randomUUID();
          migratedActMap.set(meta.act, actId);
        }
        ch.act = migratedActMap.get(meta.act) ?? null;
      } else {
        ch.act = typeof meta.act === "string" ? meta.act : null;
      }
      ch.status = meta.status;
      ch.scenes = Array.isArray(meta.scenes) ? meta.scenes : ch.scenes;
      ch.notes = meta.notes ?? ch.notes;
      ch.writingDials = meta.writingDials ?? ch.writingDials;
    } else {
      ch.sectionType = inferSectionTypeFromMarkdown(md);
    }
    if (!isChapterType(ch.sectionType)) {
      ch.title = chapterTitleFromMarkdown(md, "") || SECTION_TYPE_LABELS[ch.sectionType];
    }
    chapters.push(ch);
  }

  if (needsActMigration && migratedActMap.size > 0) {
    acts = [...migratedActMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, id]) => ({ id, label: `Act ${num}` }));
  }

  project.acts = acts;
  project.chapters = chapters;

  if (await exists(`${projectPath}/prewriting/treatment/treatment.md`)) {
    project.brief.synopsis = await readTextFile(`${projectPath}/prewriting/treatment/treatment.md`);
  }
  if (await exists(`${projectPath}/style-rules.md`)) {
    project.brief.writingStyle = await readTextFile(`${projectPath}/style-rules.md`);
  }
  if (await exists(`${projectPath}/prewriting/story-bible/story-bible.md`)) {
    const storyBible = await readTextFile(`${projectPath}/prewriting/story-bible/story-bible.md`);
    project.brief.notes = storyBible;
    const premise = storyBible.match(/##\s+Premise[\r\n]+([\s\S]*?)(?:\n##|$)/)?.[1]?.trim();
    if (premise) {
      project.brief.logline = premise.split("\n")[0] ?? "";
    }
  }

  if (projectJson?.brief) {
    const meta = projectJson.brief;
    project.brief.title = meta.title ?? project.brief.title;
    project.brief.subtitle = meta.subtitle ?? project.brief.subtitle;
    project.brief.genre = meta.genre ?? project.brief.genre;
    project.brief.logline = meta.logline ?? project.brief.logline;
    project.brief.themes = Array.isArray(meta.themes) ? meta.themes : project.brief.themes;
    project.brief.targetWordCount = meta.targetWordCount ?? project.brief.targetWordCount;
    project.brief.audience = meta.audience ?? project.brief.audience;
    project.brief.comparableTitles = meta.comparableTitles ?? project.brief.comparableTitles;
  }

  project.bible.characters = (await readJsonFile<Character[]>(bibleFilePath(projectPath, "characters"), [])).map(
    (c) => {
      const legacyRelationships =
        typeof (c as unknown as { relationships?: unknown }).relationships === "string"
          ? (c as unknown as { relationships?: string }).relationships ?? ""
          : "";
      return {
        ...c,
        alsoKnownAs: Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : [],
        relationships: Array.isArray(c.relationships)
          ? normalizeCharacterRelationships(c.relationships)
          : legacyRelationships.trim()
            ? [
                {
                  id: crypto.randomUUID(),
                  withCharacterId: "",
                  type: "other",
                  description: legacyRelationships.trim(),
                },
              ]
            : [],
      };
    }
  );
  project.bible.threads = (await readJsonFile<Thread[]>(bibleFilePath(projectPath, "threads"), [])).map(
    (thread) => ({
      ...thread,
      alsoKnownAs: Array.isArray(thread.alsoKnownAs) ? thread.alsoKnownAs : [],
      timeframe: thread.timeframe ?? "",
      historicalAnchors: Array.isArray(thread.historicalAnchors) ? thread.historicalAnchors : [],
      continuityChecks: thread.continuityChecks ?? "",
      sources: Array.isArray(thread.sources) ? thread.sources : [],
    })
  );
  project.bible.locations = (await readJsonFile<Location[]>(bibleFilePath(projectPath, "locations"), [])).map(
    (location) => ({
      ...location,
      alsoKnownAs: Array.isArray(location.alsoKnownAs) ? location.alsoKnownAs : [],
      timeframe: location.timeframe ?? "",
      geoContext: location.geoContext ?? "",
      historicalContext: location.historicalContext ?? "",
      sources: Array.isArray(location.sources) ? location.sources : [],
    })
  );
  project.bible.codex = (await readJsonFile<CodexEntry[]>(bibleFilePath(projectPath, "codex"), [])).map(
    (entry) => ({
      ...entry,
      alsoKnownAs: Array.isArray(entry.alsoKnownAs) ? entry.alsoKnownAs : [],
      entryType: entry.entryType ?? "term",
      timeframe: entry.timeframe ?? "",
      sources: Array.isArray(entry.sources) ? entry.sources : [],
    })
  );

  // Legacy migration: pull bible data from old project.json if split files don't exist yet
  if (projectJson) {
    const raw = projectJson as ProjectJson & {
      bible?: { characters?: unknown[]; threads?: Thread[]; locations?: Location[]; codex?: CodexEntry[] };
    };
    if (raw.bible) {
      if (project.bible.characters.length === 0 && raw.bible.characters?.length) {
        project.bible.characters = (raw.bible.characters as Character[]).map((c) => ({
          id: c.id ?? crypto.randomUUID(),
          name: c.name ?? "Unnamed",
          alsoKnownAs: Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : [],
          role: c.role ?? "supporting",
          age: c.age ?? "",
          description: c.description ?? "",
          backstory: c.backstory ?? "",
          motivation: c.motivation ?? "",
          arc: c.arc ?? "",
          relationships: normalizeCharacterRelationships(c.relationships),
          personality: c.personality ?? "",
          strengths: c.strengths ?? "",
          weaknesses: c.weaknesses ?? "",
          internalConflict: c.internalConflict ?? "",
          physicalPresence: c.physicalPresence ?? "",
          knows: c.knows ?? "",
          believes: c.believes ?? "",
          conceals: c.conceals ?? "",
          blindSpots: c.blindSpots ?? "",
          fears: c.fears ?? "",
          hopes: c.hopes ?? "",
          draftingNote: c.draftingNote ?? "",
          notes: c.notes ?? "",
        }));
      }
      if (project.bible.threads.length === 0 && raw.bible.threads?.length) {
        project.bible.threads = raw.bible.threads.map((thread) => ({
          ...thread,
          alsoKnownAs: Array.isArray(thread.alsoKnownAs) ? thread.alsoKnownAs : [],
          timeframe: thread.timeframe ?? "",
          historicalAnchors: Array.isArray(thread.historicalAnchors) ? thread.historicalAnchors : [],
          continuityChecks: thread.continuityChecks ?? "",
          sources: Array.isArray(thread.sources) ? thread.sources : [],
        }));
      }
      if (project.bible.locations.length === 0 && raw.bible.locations?.length) {
        project.bible.locations = raw.bible.locations.map((location) => ({
          ...location,
          alsoKnownAs: Array.isArray(location.alsoKnownAs) ? location.alsoKnownAs : [],
          timeframe: location.timeframe ?? "",
          geoContext: location.geoContext ?? "",
          historicalContext: location.historicalContext ?? "",
          sources: Array.isArray(location.sources) ? location.sources : [],
        }));
      }
      if (project.bible.codex.length === 0 && raw.bible.codex?.length) {
        project.bible.codex = raw.bible.codex.map((entry) => ({
          ...entry,
          alsoKnownAs: Array.isArray(entry.alsoKnownAs) ? entry.alsoKnownAs : [],
          entryType: entry.entryType ?? "term",
          timeframe: entry.timeframe ?? "",
          sources: Array.isArray(entry.sources) ? entry.sources : [],
        }));
      }
    }
  }
  project.generalNotes = projectJson?.generalNotes ?? project.generalNotes;

  return project;
}

export async function writeProjectToDisk(project: Project, meta: AppMeta) {
  const path = normalizePath(project.storagePath ?? (await getDefaultProjectPath()));
  await ensureStructure(path);

  const chapterMeta: NonNullable<ProjectJson["chapterMeta"]> = {};
  const expectedChapterFiles = new Set<string>();
  const sorted = [...project.chapters].sort((a, b) => a.number - b.number);
  const chapterNums = deriveChapterNumbers(sorted);
  for (const ch of project.chapters) {
    const body = htmlToMarkdown(ch.content || "");
    const fileName = chapterSlug(ch.number, ch.title || "untitled", ch.sectionType);
    expectedChapterFiles.add(fileName);
    const chapterNum = chapterNums.get(ch.id) ?? null;
    const heading = formatSectionHeading(ch.sectionType, chapterNum, ch.title || "Untitled");
    const chapterMd = `# ${heading}\n\n${body}\n`;
    await writeTextFile(`${path}/chapters/${fileName}`, chapterMd);
    chapterMeta[chapterStemFromFileName(fileName)] = {
      act: ch.act,
      sectionType: ch.sectionType,
      status: ch.status,
      scenes: ch.scenes,
      notes: ch.notes,
      writingDials: ch.writingDials,
    };
  }
  const chapterEntries = await readDir(`${path}/chapters`);
  for (const entry of chapterEntries) {
    if (!entry.name || !entry.isFile || !entry.name.endsWith(".md")) continue;
    if (!expectedChapterFiles.has(entry.name)) {
      await remove(`${path}/chapters/${entry.name}`);
    }
  }

  await writeTextFile(
    `${path}/prewriting/treatment/treatment.md`,
    project.brief.synopsis || "# Treatment\n\n"
  );
  await writeTextFile(
    `${path}/style-rules.md`,
    project.brief.writingStyle || "# Prose Style Guide\n\n"
  );
  await writeTextFile(
    `${path}/prewriting/story-bible/story-bible.md`,
    project.brief.notes || "# Story Bible\n\n"
  );

  await writeTextFile(
    bibleFilePath(path, "characters"),
    JSON.stringify(
      project.bible.characters.map((character) => ({
        ...character,
        relationships: normalizeCharacterRelationships(character.relationships),
      })),
      null,
      2
    )
  );
  await writeTextFile(bibleFilePath(path, "threads"), JSON.stringify(project.bible.threads, null, 2));
  await writeTextFile(bibleFilePath(path, "locations"), JSON.stringify(project.bible.locations, null, 2));
  await writeTextFile(bibleFilePath(path, "codex"), JSON.stringify(project.bible.codex, null, 2));

  const projectJson: ProjectJson = {
    brief: briefProjectMeta(project),
    acts: project.acts,
    chapterMeta,
    generalNotes: project.generalNotes,
  };
  await writeTextFile(projectJsonPath(path), JSON.stringify(projectJson, null, 2));
  const oldRootJson = legacyRootJsonPath(path);
  if (await exists(oldRootJson)) {
    await remove(oldRootJson);
  }

  await writeTextFile(
    `${path}/.writer/meta.json`,
    JSON.stringify(
      {
        ...meta,
        projectName: project.name,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  await writeWriterConfig({ lastProjectPath: path });
}

function commentsFilePath(path: string): string {
  return `${path}/.writer/comments.json`;
}

export async function readComments(path: string): Promise<Comment[]> {
  return readJsonFile<Comment[]>(commentsFilePath(path), []);
}

export async function writeComments(path: string, comments: Comment[]): Promise<void> {
  await writeTextFile(commentsFilePath(path), JSON.stringify(comments, null, 2));
}

function exportConfigPath(path: string): string {
  return `${path}/.writer/export-config.json`;
}

export async function readExportConfig(path: string): Promise<ExportConfig> {
  const saved = await readJsonFile<Partial<ExportConfig>>(exportConfigPath(path), {});
  return { ...defaultExportConfig, ...saved };
}

export async function writeExportConfig(path: string, config: ExportConfig): Promise<void> {
  await writeTextFile(exportConfigPath(path), JSON.stringify(config, null, 2));
}

export async function readLlmSettings(path: string): Promise<LlmSettings> {
  const defaults: LlmSettings = { selectedProvider: "anthropic", selectedModel: "claude-sonnet-4" };

  const localFallback = (() => {
    try {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem(llmSettingsStorageKey(path));
      if (!raw) return null;
      return { ...defaults, ...(JSON.parse(raw) as LlmSettings) };
    } catch {
      return null;
    }
  })();

  try {
    const settingsPath = `${path}/.writer/settings.json`;
    if (!(await exists(settingsPath))) return localFallback ?? defaults;
    const parsed = { ...defaults, ...(JSON.parse(await readTextFile(settingsPath)) as LlmSettings) };
    if (typeof window !== "undefined") {
      localStorage.setItem(llmSettingsStorageKey(path), JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return localFallback ?? defaults;
  }
}

export async function writeLlmSettings(path: string, settings: LlmSettings): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(llmSettingsStorageKey(path), JSON.stringify(settings));
    }
  } catch {
    // Best-effort localStorage fallback.
  }

  try {
    await ensureStructure(path);
    await writeTextFile(`${path}/.writer/settings.json`, JSON.stringify(settings, null, 2));
  } catch {
    // localStorage fallback above still keeps settings across reloads.
  }
}

function inspirationMetaPath(path: string): string {
  return `${path}/.writer/inspiration.json`;
}

export async function readInspirationMeta(path: string): Promise<InspirationItem[]> {
  return readJsonFile<InspirationItem[]>(inspirationMetaPath(path), []);
}

export async function writeInspirationMeta(path: string, items: InspirationItem[]): Promise<void> {
  await writeTextFile(inspirationMetaPath(path), JSON.stringify(items, null, 2));
}

export async function copyFileToInspiration(
  projectPath: string,
  sourcePath: string,
  fileName: string
): Promise<void> {
  await mkdir(`${projectPath}/inspiration`, { recursive: true });
  const data = await readFile(sourcePath);
  await writeFile(`${projectPath}/inspiration/${fileName}`, data);
}

export async function removeInspirationFile(projectPath: string, fileName: string): Promise<void> {
  const filePath = `${projectPath}/inspiration/${fileName}`;
  if (await exists(filePath)) {
    await remove(filePath);
  }
}

export function inspirationFilePath(projectPath: string, fileName: string): string {
  return `${projectPath}/inspiration/${fileName}`;
}

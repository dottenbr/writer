import type { Comment, InspirationItem, Project } from "../types";
import type { ExportConfig } from "./export-config";

export interface LlmSettings {
  anthropicKey?: string;
  openaiKey?: string;
  selectedProvider: "anthropic" | "openai";
  selectedModel: string;
}

export interface WriterConfig {
  lastProjectId?: string;
  lastActiveTab?: import("../types").TabId;
  lastActiveBibleSection?: import("../types").BibleSection;
  lastActiveChapterId?: string | null;
}

export interface LocalProjectBundle {
  projectId: string;
  project: Project;
  exportConfig: ExportConfig;
  comments: Comment[];
  inspirationItems: InspirationItem[];
  updatedAt: string;
}

const WRITER_CONFIG_KEY = "writer:user-config:v2";
const LLM_SETTINGS_KEY = "writer:user-llm-settings:v1";
const PROJECT_CACHE_PREFIX = "writer:project-cache:v1:";

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function readUserConfig(): WriterConfig {
  return safeReadJson<WriterConfig>(WRITER_CONFIG_KEY, {});
}

export function writeUserConfig(config: WriterConfig): void {
  safeWriteJson(WRITER_CONFIG_KEY, config);
}

export function readLocalLlmSettings(): LlmSettings {
  return safeReadJson<LlmSettings>(LLM_SETTINGS_KEY, {
    selectedProvider: "anthropic",
    selectedModel: "claude-sonnet-4",
  });
}

export function writeLocalLlmSettings(settings: LlmSettings): void {
  safeWriteJson(LLM_SETTINGS_KEY, settings);
}

export function readLocalProjectBundle(projectId: string): LocalProjectBundle | null {
  return safeReadJson<LocalProjectBundle | null>(`${PROJECT_CACHE_PREFIX}${projectId}`, null);
}

export function writeLocalProjectBundle(bundle: LocalProjectBundle): void {
  safeWriteJson(`${PROJECT_CACHE_PREFIX}${bundle.projectId}`, bundle);
}

export function removeLocalProjectBundle(projectId: string): void {
  try {
    localStorage.removeItem(`${PROJECT_CACHE_PREFIX}${projectId}`);
  } catch {}
}

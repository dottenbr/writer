import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readLocalLlmSettings,
  readLocalProjectBundle,
  readUserConfig,
  removeLocalProjectBundle,
  writeLocalLlmSettings,
  writeLocalProjectBundle,
  writeUserConfig,
} from "./local-config";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe("local-config", () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
    storage.clear();
  });

  afterEach(() => {
    storage.clear();
  });

  it("round-trips user config and llm settings", () => {
    writeUserConfig({ lastProjectId: "project-1", lastActiveTab: "manuscript" });
    writeLocalLlmSettings({ selectedProvider: "openai", selectedModel: "gpt-5.4", openaiKey: "secret" });

    expect(readUserConfig()).toEqual({
      lastProjectId: "project-1",
      lastActiveTab: "manuscript",
    });
    expect(readLocalLlmSettings()).toEqual({
      selectedProvider: "openai",
      selectedModel: "gpt-5.4",
      openaiKey: "secret",
    });
  });

  it("stores and removes the full local project bundle", () => {
    writeLocalProjectBundle({
      projectId: "project-1",
      project: {
        id: "project-1",
        name: "Draft",
        createdAt: "2026-01-01T00:00:00.000Z",
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
        bible: { characters: [], threads: [], locations: [], codex: [] },
        settings: { fontFamily: "Literata", fontSize: 14, lineHeight: 1.6, darkMode: false },
        generalNotes: "",
      },
      exportConfig: {
        actHeadings: true,
        chapterHeadings: true,
        sceneHeadings: true,
        sceneSeparator: "***",
        titlePage: true,
        author: "",
        wordCountOnTitle: true,
        fontFamily: "Literata",
        fontSize: 12,
        lineSpacing: 1.5,
        paragraphStyle: "indent",
        pageFormat: "letter",
        excludeNonChapters: false,
        exportFormat: "docx",
        preset: "manuscript",
      },
      comments: [
        {
          id: "comment-1",
          chapterId: "chapter-1",
          text: "Tighten this turn.",
          quotedText: "Original sentence",
          createdAt: "2026-01-01T00:00:00.000Z",
          replies: [],
        },
      ],
      inspirationItems: [
        {
          id: "inspo-1",
          fileName: "moodboard.png",
          label: "Moodboard",
          tags: ["tone"],
          notes: "Muted palette",
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(readLocalProjectBundle("project-1")).toMatchObject({
      projectId: "project-1",
      comments: [{ id: "comment-1" }],
      inspirationItems: [{ id: "inspo-1" }],
    });

    removeLocalProjectBundle("project-1");

    expect(readLocalProjectBundle("project-1")).toBeNull();
  });

  it("falls back cleanly for invalid cached JSON", () => {
    storage.setItem("writer:user-config:v2", "{invalid");

    expect(readUserConfig()).toEqual({});
  });
});

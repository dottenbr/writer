/**
 * Git integration for Writer.
 *
 * When running inside Tauri, uses the shell plugin to call git CLI.
 * When running in the browser (dev mode), these are no-ops that log to console.
 */
import { formatSectionHeading, deriveChapterNumbers } from "../types";

interface GitResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface GitWordStatEntry {
  hash: string;
  date: string;
  message: string;
  added: number;
  deleted: number;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  const g = globalThis as any;
  return !!(w.__TAURI_INTERNALS__ || w.isTauri || g.isTauri);
}

async function runGit(...args: string[]): Promise<GitResult> {
  // Check if we're running inside Tauri
  if (isTauriRuntime()) {
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("git", args);
      const result = await cmd.execute();
      return {
        success: result.code === 0,
        output: result.stdout,
        error: result.stderr || undefined,
      };
    } catch (e: any) {
      return { success: false, output: "", error: e.message };
    }
  }

  // Browser fallback — log and return success
  console.log(`[git mock] git ${args.join(" ")}`);
  return { success: true, output: "(browser mock)" };
}

export async function gitInit(path: string): Promise<GitResult> {
  return runGit("-C", path, "init");
}

export async function gitAdd(path: string, files: string[] = ["."]): Promise<GitResult> {
  return runGit("-C", path, "add", ...files);
}

export async function gitCommit(path: string, message: string): Promise<GitResult> {
  return runGit("-C", path, "commit", "-m", message);
}

export async function gitLog(
  path: string,
  count: number = 20
): Promise<{ hash: string; date: string; message: string }[]> {
  const result = await runGit(
    "-C",
    path,
    "log",
    `--max-count=${count}`,
    "--pretty=format:%H|%ai|%s"
  );
  if (!result.success || !result.output.trim()) return [];
  return result.output
    .trim()
    .split("\n")
    .map((line) => {
      const [hash, date, ...msgParts] = line.split("|");
      return { hash, date, message: msgParts.join("|") };
    });
}

export async function gitStatus(path: string): Promise<GitResult> {
  return runGit("-C", path, "status", "--porcelain");
}

export async function gitDiff(path: string): Promise<GitResult> {
  return runGit("-C", path, "diff", "--stat");
}

export async function gitWordStats(path: string, count: number = 120): Promise<GitWordStatEntry[]> {
  const result = await runGit(
    "-C",
    path,
    "log",
    `--max-count=${count}`,
    "--pretty=format:__COMMIT__|%H|%ai|%s",
    "--numstat",
    "--",
    "chapters"
  );

  if (!result.success || !result.output.trim()) return [];
  const lines = result.output.split("\n");
  const entries: GitWordStatEntry[] = [];
  let current: GitWordStatEntry | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("__COMMIT__|")) {
      if (current) entries.push(current);
      const [, hash = "", date = "", ...messageParts] = line.split("|");
      current = {
        hash,
        date,
        message: messageParts.join("|"),
        added: 0,
        deleted: 0,
      };
      continue;
    }
    if (!current) continue;
    const parts = line.split("\t");
    if (parts.length >= 3) {
      const add = Number(parts[0]);
      const del = Number(parts[1]);
      current.added += Number.isFinite(add) ? add : 0;
      current.deleted += Number.isFinite(del) ? del : 0;
    }
  }
  if (current) entries.push(current);
  return entries;
}

/**
 * Save project data to a JSON file in the repo and commit.
 */
export async function saveAndCommit(
  repoPath: string,
  projectData: any,
  message?: string
): Promise<GitResult> {
  if (isTauriRuntime()) {
    try {
      const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");

      // Ensure .writer directory exists
      await mkdir(`${repoPath}/.writer`, { recursive: true }).catch(() => {});

      // Write project data
      await writeTextFile(
        `${repoPath}/.writer/project.json`,
        JSON.stringify(projectData, null, 2)
      );

      // Git add and commit
      await gitAdd(repoPath, [".writer/project.json"]);
      return gitCommit(
        repoPath,
        message || `Writer: auto-save ${new Date().toLocaleString()}`
      );
    } catch (e: any) {
      return { success: false, output: "", error: e.message };
    }
  }

  console.log("[git mock] saveAndCommit", message);
  return { success: true, output: "(browser mock)" };
}

/**
 * Load project data from the repo.
 */
export async function loadFromRepo(repoPath: string): Promise<any | null> {
  if (isTauriRuntime()) {
    try {
      const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
      const filePath = `${repoPath}/.writer/project.json`;
      const fileExists = await exists(filePath);
      if (!fileExists) return null;
      const content = await readTextFile(filePath);
      return JSON.parse(content);
    } catch (e) {
      console.error("Failed to load from repo:", e);
      return null;
    }
  }

  console.log("[git mock] loadFromRepo");
  return null;
}

/**
 * Export the full manuscript as a Markdown file.
 */
export async function exportManuscript(
  repoPath: string,
  project: any
): Promise<GitResult> {
  if (isTauriRuntime()) {
    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const sorted = [...(project.chapters || [])].sort((a: any, b: any) => a.number - b.number);
      const chNums = deriveChapterNumbers(sorted);
      const chapters = sorted
        .map(
          (ch: any) => {
            const heading = formatSectionHeading(ch.sectionType, chNums.get(ch.id) ?? null, ch.title || "");
            return `## ${heading}\n\n${ch.content || "(empty)"}\n`;
          }
        )
        .join("\n---\n\n");

      const markdown = `# ${project.brief?.title || project.name}\n\n${chapters}`;

      await writeTextFile(`${repoPath}/manuscript.md`, markdown);
      return { success: true, output: `${repoPath}/manuscript.md` };
    } catch (e: any) {
      return { success: false, output: "", error: e.message };
    }
  }

  return { success: true, output: "(browser mock)" };
}

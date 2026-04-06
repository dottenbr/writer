/**
 * Unified filesystem abstraction.
 * In Tauri: delegates to @tauri-apps/plugin-fs.
 * In browser dev: delegates to the Vite dev-fs middleware via fetch.
 */

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  const g = globalThis as any;
  return !!(w.__TAURI_INTERNALS__ || w.isTauri || g.isTauri);
}

export interface DirEntry {
  name: string | null;
  isDirectory: boolean;
  isFile: boolean;
}

async function devFetch(
  action: string,
  method: "GET" | "POST",
  params: Record<string, unknown> = {}
): Promise<any> {
  if (method === "GET") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const res = await fetch(`/__fs/${action}?${qs}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `dev-fs ${action} failed: ${res.status}`);
    }
    return res.json();
  }
  const res = await fetch(`/__fs/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `dev-fs ${action} failed: ${res.status}`);
  }
  return res.json();
}

export async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    await mod.mkdir(path, options);
  } else {
    await devFetch("mkdir", "POST", { path, recursive: options?.recursive });
  }
}

export async function writeTextFile(
  path: string,
  contents: string
): Promise<void> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    await mod.writeTextFile(path, contents);
  } else {
    await devFetch("write-text", "POST", { path, contents });
  }
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    return mod.readTextFile(path);
  }
  const { content } = await devFetch("read-text", "GET", { path });
  return content;
}

export async function exists(path: string): Promise<boolean> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    return mod.exists(path);
  }
  const data = await devFetch("exists", "GET", { path });
  return data.exists;
}

export async function readDir(path: string): Promise<DirEntry[]> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    const entries = await mod.readDir(path);
    return entries.map((e: any) => ({
      name: e.name ?? null,
      isDirectory: !!e.isDirectory,
      isFile: !!e.isFile,
    }));
  }
  const data = await devFetch("read-dir", "GET", { path });
  return data.entries;
}

export async function remove(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    await mod.remove(path, options);
  } else {
    await devFetch("remove", "POST", { path, recursive: options?.recursive });
  }
}

export async function readFile(path: string): Promise<Uint8Array> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    return mod.readFile(path);
  }
  const { data } = await devFetch("read-file", "GET", { path });
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function writeFile(
  path: string,
  data: Uint8Array
): Promise<void> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-fs");
    await mod.writeFile(path, data);
  } else {
    let binary = "";
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
    await devFetch("write-file", "POST", { path, data: btoa(binary) });
  }
}

export async function documentDir(): Promise<string> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/api/path");
    return mod.documentDir();
  }
  return "/Users/dominik/Documents";
}

export { isTauri as isTauriRuntime };

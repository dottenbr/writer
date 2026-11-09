export type CoverTone = "light" | "dark";

export interface CoverAnalysis {
  luminance: number;
  tone: CoverTone;
  textColor: "#141312" | "#ffffff";
}

export interface CachedCoverArt {
  fileName: string;
  dataUrl: string;
  tone: CoverTone;
  textColor: "#141312" | "#ffffff";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"]);
const COVER_CACHE_PREFIX = "bookkit-cover-v1:";

export function isImageFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function isCoverTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return normalized === "cover" || normalized === "cover-light" || normalized === "cover-dark";
}

export function visibleInspirationTags(tags: string[]): string[] {
  return tags.filter((t) => !isCoverTag(t));
}

export function coverToneFromTags(tags: string[]): CoverTone | null {
  if (tags.includes("cover-light")) return "light";
  if (tags.includes("cover-dark")) return "dark";
  return null;
}

export function applyCoverTags(tags: string[], isCover: boolean, tone?: CoverTone | null): string[] {
  const base = visibleInspirationTags(tags);
  if (!isCover) return base;
  return tone ? [...base, "cover", `cover-${tone}`] : [...base, "cover"];
}

export function pickBookCoverItem<T extends { fileName: string; tags?: string[] | null }>(
  items: T[]
): { item: T; explicit: boolean; tone: CoverTone | null } | null {
  const images = items.filter((item) => isImageFile(item.fileName));
  if (images.length === 0) return null;
  const explicit = images.find((item) => (item.tags ?? []).includes("cover"));
  if (explicit) {
    return { item: explicit, explicit: true, tone: coverToneFromTags(explicit.tags ?? []) };
  }
  const fallback = images.find((item) => (item.tags ?? []).includes("art")) ?? images[0];
  return { item: fallback, explicit: false, tone: coverToneFromTags(fallback.tags ?? []) };
}

/**
 * Deterministic daily index for a book's cover-page background so each day
 * highlights one mood-board image consistently until shuffled.
 */
export function dailyInspirationIndex(dayIso: string, projectId: string, count: number): number {
  if (count <= 0) return 0;
  const seed = `${dayIso}:${projectId}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}

/**
 * Picks a new mood-board index guaranteed to differ from `currentIndex` when
 * there is more than one image.
 */
export function nextShuffleIndex(
  currentIndex: number,
  count: number,
  random: () => number = Math.random
): number {
  if (count <= 1) return 0;
  const raw = Math.floor(random() * (count - 1));
  const step = 1 + Math.max(0, Math.min(count - 2, raw));
  return ((currentIndex % count) + count + step) % count;
}

/**
 * Inverse text color for text overlaid above cover art:
 * - Light cover art -> crisp black ink (#141312)
 * - Dark cover art  -> crisp white ink (#ffffff)
 */
export function inverseTextColorForTone(tone: CoverTone): "#141312" | "#ffffff" {
  return tone === "light" ? "#141312" : "#ffffff";
}

/**
 * Computes perceived relative luminance (ITU-R BT.709) from RGBA pixel bytes,
 * weighting the central region where cover text sits.
 */
export function analyzeCoverPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): CoverAnalysis {
  const totalPixels = Math.min(width * height, Math.floor(rgba.length / 4));
  if (totalPixels <= 0 || width <= 0 || height <= 0) {
    return { luminance: 48, tone: "dark", textColor: "#ffffff" };
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (let idx = 0; idx < totalPixels; idx++) {
    const offset = idx * 4;
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    const a = (rgba[offset + 3] ?? 255) / 255;
    // Blend translucent pixels against a warm paper background (244, 241, 234)
    const er = r * a + 244 * (1 - a);
    const eg = g * a + 241 * (1 - a);
    const eb = b * a + 234 * (1 - a);
    const lum = 0.2126 * er + 0.7152 * eg + 0.0722 * eb;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const inCenter = x >= width * 0.2 && x <= width * 0.8 && y >= height * 0.2 && y <= height * 0.8;
    const weight = inCenter ? 2.5 : 1;
    weightedSum += lum * weight;
    weightTotal += weight;
  }
  const luminance = weightTotal > 0 ? weightedSum / weightTotal : 48;
  const tone: CoverTone = luminance >= 138 ? "light" : "dark";
  return {
    luminance,
    tone,
    textColor: inverseTextColorForTone(tone),
  };
}

export function readCachedCover(projectId: string, fileName: string): CachedCoverArt | null {
  try {
    const raw = localStorage.getItem(COVER_CACHE_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCoverArt>;
    if (
      parsed &&
      parsed.fileName === fileName &&
      typeof parsed.dataUrl === "string" &&
      parsed.dataUrl.startsWith("data:image/") &&
      (parsed.tone === "light" || parsed.tone === "dark")
    ) {
      return {
        fileName: parsed.fileName,
        dataUrl: parsed.dataUrl,
        tone: parsed.tone,
        textColor: inverseTextColorForTone(parsed.tone),
      };
    }
  } catch {
    /* ignore storage errors */
  }
  return null;
}

export function writeCachedCover(projectId: string, cover: CachedCoverArt): void {
  try {
    localStorage.setItem(COVER_CACHE_PREFIX + projectId, JSON.stringify(cover));
  } catch {
    /* ignore quota/storage errors */
  }
}

export function clearCachedCover(projectId: string): void {
  try {
    localStorage.removeItem(COVER_CACHE_PREFIX + projectId);
  } catch {
    /* ignore */
  }
}

const inflight = new Map<string, Promise<CachedCoverArt | null>>();

/**
 * Decodes an inspiration image URL in the browser, center-crops it to a tiny
 * shelf thumbnail (default 96×132 JPEG), measures its luminance so overlaid
 * text uses the inverse color, and caches the thumbnail in localStorage.
 */
export function generateAndCacheCoverThumbnail(
  projectId: string,
  fileName: string,
  signedUrl: string,
  fallbackTone: CoverTone | null = null,
  targetWidth = 96,
  targetHeight = 132
): Promise<CachedCoverArt | null> {
  const cached = readCachedCover(projectId, fileName);
  if (cached) return Promise.resolve(cached);
  if (!signedUrl || typeof document === "undefined") return Promise.resolve(null);

  const key = `${projectId}:${fileName}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = new Promise<CachedCoverArt | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const tone = fallbackTone ?? "dark";
          resolve({ fileName, dataUrl: signedUrl, tone, textColor: inverseTextColorForTone(tone) });
          return;
        }
        const srcW = Math.max(1, img.naturalWidth || img.width || targetWidth);
        const srcH = Math.max(1, img.naturalHeight || img.height || targetHeight);
        const scale = Math.max(targetWidth / srcW, targetHeight / srcH);
        const drawW = srcW * scale;
        const drawH = srcH * scale;
        const dx = (targetWidth - drawW) / 2;
        const dy = (targetHeight - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const analysis = analyzeCoverPixels(imageData.data, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        const result: CachedCoverArt = {
          fileName,
          dataUrl,
          tone: analysis.tone,
          textColor: analysis.textColor,
        };
        writeCachedCover(projectId, result);
        resolve(result);
      } catch {
        const tone = fallbackTone ?? "dark";
        resolve({
          fileName,
          dataUrl: signedUrl,
          tone,
          textColor: inverseTextColorForTone(tone),
        });
      }
    };
    img.onerror = () => resolve(null);
    img.src = signedUrl;
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

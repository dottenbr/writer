/**
 * Supabase session storage in cookies on .bookkit.net, so one sign-in covers
 * bookkit.net and every library subdomain. Values are split into chunks to
 * stay under the browser's per-cookie limit. A session saved by an older
 * version in localStorage is moved over on first read.
 */
import { cookieDomain } from "./library-host";

const CHUNK = 3000;
const MAX_AGE = 400 * 24 * 3600;

function read(name: string): string | null {
  const prefix = name + "=";
  for (const part of document.cookie.split("; ")) if (part.startsWith(prefix)) return part.slice(prefix.length) || null;
  return null;
}
function write(name: string, value: string, maxAge = MAX_AGE) {
  const domain = cookieDomain();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const expiry = maxAge > 0 ? `Max-Age=${maxAge}` : "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `${name}=${value}; Path=/; ${expiry}; SameSite=Lax${domain ? "; Domain=" + domain : ""}${secure}`;
}
const chunks = (key: string) => { const out: string[] = []; for (let i = 0; ; i++) { const v = read(`${key}.${i}`); if (v == null) return out; out.push(v); } };

export const cookieStorage = {
  getItem(key: string): string | null {
    const parts = chunks(key);
    if (parts.length) { try { return decodeURIComponent(parts.join("")); } catch { return null; } }
    try {
      const legacy = localStorage.getItem(key);
      if (legacy) { cookieStorage.setItem(key, legacy); localStorage.removeItem(key); }
      return legacy;
    } catch { return null; }
  },
  setItem(key: string, value: string): void {
    const encoded = encodeURIComponent(value);
    const count = Math.max(1, Math.ceil(encoded.length / CHUNK));
    for (let i = 0; i < count; i++) write(`${key}.${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK));
    for (let i = count; read(`${key}.${i}`) != null; i++) write(`${key}.${i}`, "", 0);
  },
  removeItem(key: string): void {
    for (let i = 0; read(`${key}.${i}`) != null; i++) write(`${key}.${i}`, "", 0);
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

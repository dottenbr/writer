import { createClient } from "@supabase/supabase-js";
import { cookieStorage } from "./cookie-storage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Supabase's default key, kept so existing sessions carry over. */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: typeof document === "undefined" ? undefined : cookieStorage, storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

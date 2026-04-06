/**
 * One-time migration script: reads sarre project from disk and inserts into Supabase.
 *
 * Usage: npx tsx scripts/migrate-to-supabase.ts
 *
 * DOES NOT modify or delete the original files.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { marked } from "marked";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SARRE_PATH = "/Users/dominik/Documents/Writer/sarre";
const USER_EMAIL = "dottenbr@me.com";

function generatePassword(): string {
  return crypto.randomBytes(16).toString("base64url");
}

function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function mimeFromExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".webp": "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

const SECTION_HEADING_RE = /^(?:Chapter\s+\d+|Prologue|Epilogue|Foreword|Afterword|Author'?s?\s+Note)\s*[—-]\s*/i;

function chapterTitleFromMarkdown(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!h1) return fallback;
  return h1.replace(SECTION_HEADING_RE, "").trim() || fallback;
}

function chapterSummaryFromMarkdown(content: string): string {
  const withoutH1 = content.replace(/^#\s+.+$/m, "").trim();
  const firstParagraph = withoutH1.split(/\n{2,}/).find((chunk) => chunk.trim().length > 0) ?? "";
  return firstParagraph.replace(/^##\s+.+$/m, "").trim().slice(0, 240);
}

function inferSectionType(content: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim()?.toLowerCase() ?? "";
  if (/author'?s?\s+note\b/.test(h1)) return "authors_note";
  if (/^prologue\b/.test(h1)) return "prologue";
  if (/^epilogue\b/.test(h1)) return "epilogue";
  if (/^foreword\b/.test(h1)) return "foreword";
  if (/^afterword\b/.test(h1)) return "afterword";
  return "chapter";
}

async function migrate() {
  console.log("=== Writer → Supabase Migration ===\n");

  // 1. Create user
  const password = generatePassword();
  console.log(`Creating user: ${USER_EMAIL}`);
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: USER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Dominik" },
  });
  if (userErr) {
    console.error("Failed to create user:", userErr.message);
    // Try to find existing user
    const { data: users } = await admin.auth.admin.listUsers();
    const existing = users?.users?.find((u) => u.email === USER_EMAIL);
    if (!existing) {
      throw new Error("Cannot create or find user");
    }
    console.log("Using existing user:", existing.id);
    var userId = existing.id;
  } else {
    var userId = userData.user.id;
    console.log(`User created: ${userId}`);
    console.log(`Password: ${password}`);
  }

  // 2. Read project.json
  const projectJson = readJson<any>(`${SARRE_PATH}/.writer/project.json`);

  // Read prewriting files
  const synopsis = fs.existsSync(`${SARRE_PATH}/prewriting/treatment/treatment.md`)
    ? fs.readFileSync(`${SARRE_PATH}/prewriting/treatment/treatment.md`, "utf-8")
    : "";
  const writingStyle = fs.existsSync(`${SARRE_PATH}/style-rules.md`)
    ? fs.readFileSync(`${SARRE_PATH}/style-rules.md`, "utf-8")
    : "";
  const storyBibleNotes = fs.existsSync(`${SARRE_PATH}/prewriting/story-bible/story-bible.md`)
    ? fs.readFileSync(`${SARRE_PATH}/prewriting/story-bible/story-bible.md`, "utf-8")
    : "";

  // 3. Insert project
  console.log("\nCreating project: Sarre");
  const brief = projectJson.brief ?? {};
  const { data: proj, error: projErr } = await admin
    .from("projects")
    .insert({
      owner_id: userId,
      name: "Sarre",
      brief_title: brief.title ?? "Sarre",
      brief_subtitle: brief.subtitle ?? "",
      brief_genre: brief.genre ?? "",
      brief_logline: brief.logline ?? "",
      brief_themes: brief.themes ?? [],
      brief_synopsis: synopsis,
      brief_target_word_count: brief.targetWordCount ?? 70000,
      brief_writing_style: writingStyle,
      brief_audience: brief.audience ?? "",
      brief_comparable_titles: brief.comparableTitles ?? "",
      brief_notes: storyBibleNotes,
      general_notes: projectJson.generalNotes ?? "",
    })
    .select()
    .single();
  if (projErr) throw new Error(`Failed to create project: ${projErr.message}`);
  const projectId = proj.id;
  console.log(`Project created: ${projectId}`);

  // 4. Insert project_members (owner)
  await admin.from("project_members").insert({
    project_id: projectId,
    user_id: userId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });

  // 5. Insert acts
  const acts = projectJson.acts ?? [];
  if (acts.length > 0) {
    const actRows = acts.map((a: any, i: number) => ({
      id: a.id,
      project_id: projectId,
      label: a.label,
      sort_order: i,
    }));
    const { error: actsErr } = await admin.from("acts").insert(actRows);
    if (actsErr) console.error("Acts insert error:", actsErr.message);
    else console.log(`Inserted ${acts.length} acts`);
  }

  // 6. Read and insert chapters
  const chapterMeta = projectJson.chapterMeta ?? {};
  const chapterFiles = fs
    .readdirSync(`${SARRE_PATH}/chapters`)
    .filter((f) => f.endsWith(".md"))
    .sort();

  console.log(`\nMigrating ${chapterFiles.length} chapters...`);
  const chapterIdMap = new Map<string, string>(); // stem → new UUID

  for (let i = 0; i < chapterFiles.length; i++) {
    const fileName = chapterFiles[i];
    const stem = fileName.replace(/\.md$/, "");
    const md = fs.readFileSync(`${SARRE_PATH}/chapters/${fileName}`, "utf-8");
    const meta = chapterMeta[stem];

    const bodyMd = md.replace(/^#\s+.+\n*/, "");
    const html = markdownToHtml(bodyMd);
    const sectionType = meta?.sectionType ?? inferSectionType(md);
    const title = chapterTitleFromMarkdown(md, `Chapter ${i + 1}`);

    const chapterId = crypto.randomUUID();
    chapterIdMap.set(stem, chapterId);

    const dials = meta?.writingDials ?? {};

    const { error: chErr } = await admin.from("chapters").insert({
      id: chapterId,
      project_id: projectId,
      act_id: meta?.act ?? null,
      sort_order: i,
      section_type: sectionType,
      title,
      summary: chapterSummaryFromMarkdown(md),
      content: html,
      notes: meta?.notes ?? "",
      word_count: countWords(bodyMd),
      status: meta?.status ?? "outline",
      dial_words: dials.words ?? 3000,
      dial_lyricism: dials.lyricism ?? 2,
      dial_dialogue: dials.dialogue ?? 2,
      dial_metaphor: dials.metaphor ?? 2,
      dial_pacing: dials.pacing ?? 2,
      dial_humour: dials.humour ?? 1,
      dial_texture: dials.texture ?? 2,
      dial_clarity: dials.clarity ?? 2,
    });
    if (chErr) {
      console.error(`  Chapter ${i + 1} error:`, chErr.message);
    } else {
      // Insert scenes
      const scenes = meta?.scenes ?? [];
      if (scenes.length > 0) {
        const sceneRows = scenes.map((s: any, j: number) => ({
          id: s.id,
          chapter_id: chapterId,
          sort_order: j,
          title: s.title ?? "",
          summary: s.summary ?? "",
          pov: s.pov ?? "",
          location: s.location ?? "",
          characters: s.characters ?? [],
          notes: s.notes ?? "",
          word_target: s.wordTarget ?? 1500,
        }));
        const { error: scErr } = await admin.from("scenes").insert(sceneRows);
        if (scErr) console.error(`  Scenes for chapter ${i + 1} error:`, scErr.message);
      }
      console.log(`  ${i + 1}. ${title} (${countWords(bodyMd)} words, ${scenes.length} scenes)`);
    }
  }

  // 7. Insert characters
  console.log("\nMigrating bible data...");
  const characters = readJson<any[]>(`${SARRE_PATH}/.writer/characters.json`);
  for (const c of characters) {
    const { error: cErr } = await admin.from("characters").insert({
      id: c.id,
      project_id: projectId,
      name: c.name ?? "Unnamed",
      also_known_as: c.alsoKnownAs ?? [],
      role: c.role ?? "supporting",
      age: c.age ?? "",
      description: c.description ?? "",
      backstory: c.backstory ?? "",
      motivation: c.motivation ?? "",
      arc: c.arc ?? "",
      personality: c.personality ?? "",
      strengths: c.strengths ?? "",
      weaknesses: c.weaknesses ?? "",
      internal_conflict: c.internalConflict ?? "",
      physical_presence: c.physicalPresence ?? "",
      knows: c.knows ?? "",
      believes: c.believes ?? "",
      conceals: c.conceals ?? "",
      blind_spots: c.blindSpots ?? "",
      fears: c.fears ?? "",
      hopes: c.hopes ?? "",
      drafting_note: c.draftingNote ?? "",
      notes: c.notes ?? "",
    });
    if (cErr) console.error(`  Character ${c.name} error:`, cErr.message);
  }
  console.log(`  ${characters.length} characters`);

  // Insert character relationships (second pass to ensure all characters exist)
  let relCount = 0;
  for (const c of characters) {
    for (const rel of c.relationships ?? []) {
      if (!rel.withCharacterId) continue;
      const { error } = await admin.from("character_relationships").insert({
        id: rel.id ?? crypto.randomUUID(),
        character_id: c.id,
        with_character_id: rel.withCharacterId,
        type: rel.type ?? "other",
        description: rel.description ?? "",
      });
      if (!error) relCount++;
    }
  }
  console.log(`  ${relCount} character relationships`);

  // 8. Insert threads
  const threads = readJson<any[]>(`${SARRE_PATH}/.writer/threads.json`);
  for (const t of threads) {
    await admin.from("threads").insert({
      id: t.id,
      project_id: projectId,
      name: t.name ?? "",
      also_known_as: t.alsoKnownAs ?? [],
      type: t.type ?? "subplot",
      timeframe: t.timeframe ?? "",
      description: t.description ?? "",
      chapters: t.chapters ?? [],
      historical_anchors: t.historicalAnchors ?? [],
      continuity_checks: t.continuityChecks ?? "",
      sources: t.sources ?? [],
      resolution: t.resolution ?? "",
      notes: t.notes ?? "",
    });
  }
  console.log(`  ${threads.length} threads`);

  // 9. Insert locations
  const locations = readJson<any[]>(`${SARRE_PATH}/.writer/locations.json`);
  for (const l of locations) {
    await admin.from("locations").insert({
      id: l.id,
      project_id: projectId,
      name: l.name ?? "",
      also_known_as: l.alsoKnownAs ?? [],
      timeframe: l.timeframe ?? "",
      geo_context: l.geoContext ?? "",
      description: l.description ?? "",
      historical_context: l.historicalContext ?? "",
      significance: l.significance ?? "",
      sensory_details: l.sensoryDetails ?? "",
      sources: l.sources ?? [],
      notes: l.notes ?? "",
    });
  }
  console.log(`  ${locations.length} locations`);

  // 10. Insert codex entries
  const codex = readJson<any[]>(`${SARRE_PATH}/.writer/codex.json`);
  for (const e of codex) {
    await admin.from("codex_entries").insert({
      id: e.id,
      project_id: projectId,
      entry_type: e.entryType ?? "term",
      category: e.category ?? "General",
      name: e.name ?? "",
      also_known_as: e.alsoKnownAs ?? [],
      timeframe: e.timeframe ?? "",
      sources: e.sources ?? [],
      content: e.content ?? "",
    });
  }
  console.log(`  ${codex.length} codex entries`);

  // 11. Insert settings
  const exportConfig = readJson<any>(`${SARRE_PATH}/.writer/export-config.json`);
  await admin.from("export_configs").insert({
    project_id: projectId,
    act_headings: exportConfig.actHeadings ?? false,
    chapter_headings: exportConfig.chapterHeadings ?? true,
    scene_headings: exportConfig.sceneHeadings ?? false,
    scene_separator: exportConfig.sceneSeparator ?? "* * *",
    title_page: exportConfig.titlePage ?? true,
    author: exportConfig.author ?? "",
    word_count_on_title: exportConfig.wordCountOnTitle ?? true,
    font_family: exportConfig.fontFamily ?? "Times New Roman",
    font_size: exportConfig.fontSize ?? 12,
    line_spacing: exportConfig.lineSpacing ?? 2.0,
    paragraph_style: exportConfig.paragraphStyle ?? "indent",
    page_format: exportConfig.pageFormat ?? "letter",
    exclude_non_chapters: exportConfig.excludeNonChapters ?? true,
    export_format: exportConfig.exportFormat ?? "pdf",
    preset: exportConfig.preset ?? "manuscript",
  });

  // LLM settings (without API keys for security)
  const llmSettings = readJson<any>(`${SARRE_PATH}/.writer/settings.json`);
  await admin.from("llm_settings").insert({
    project_id: projectId,
    selected_provider: llmSettings.selectedProvider ?? "anthropic",
    selected_model: llmSettings.selectedModel ?? "claude-sonnet-4",
    // Not migrating API keys for security
  });

  // Project settings
  await admin.from("project_settings").insert({
    project_id: projectId,
    font_family: "Source Serif 4",
    font_size: 18,
    line_height: 1.8,
    dark_mode: llmSettings.darkMode ?? false,
  });

  console.log("  Settings migrated");

  // 12. Upload inspiration files
  console.log("\nUploading inspiration files...");
  const inspirationMeta = readJson<any[]>(`${SARRE_PATH}/.writer/inspiration.json`);
  let uploadCount = 0;
  for (const item of inspirationMeta) {
    const filePath = `${SARRE_PATH}/inspiration/${item.fileName}`;
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${item.fileName} (file not found)`);
      continue;
    }
    const fileData = fs.readFileSync(filePath);
    const storagePath = `${projectId}/${item.fileName}`;

    const { error: upErr } = await admin.storage
      .from("inspiration")
      .upload(storagePath, fileData, {
        contentType: mimeFromExt(item.fileName),
        upsert: true,
      });
    if (upErr) {
      console.error(`  Upload ${item.fileName} error:`, upErr.message);
      continue;
    }

    await admin.from("inspiration_items").insert({
      id: item.id,
      project_id: projectId,
      file_name: item.fileName,
      storage_path: storagePath,
      label: item.label ?? item.fileName,
      tags: item.tags ?? [],
      notes: item.notes ?? "",
      added_at: item.addedAt ?? new Date().toISOString(),
    });
    uploadCount++;
  }
  console.log(`  ${uploadCount} files uploaded`);

  // 13. Create initial snapshot
  console.log("\nCreating initial snapshot...");
  const { data: allChapters } = await admin
    .from("chapters")
    .select("id, sort_order, title, section_type, content, word_count, status")
    .eq("project_id", projectId)
    .order("sort_order");

  const totalWords = (allChapters ?? []).reduce((sum: number, ch: any) => sum + (ch.word_count ?? 0), 0);

  const { data: snapshot } = await admin
    .from("snapshots")
    .insert({
      project_id: projectId,
      author_id: userId,
      message: "Initial migration from disk",
      word_count: totalWords,
    })
    .select()
    .single();

  if (snapshot && allChapters) {
    const snapshotChapters = allChapters.map((ch: any) => ({
      snapshot_id: snapshot.id,
      chapter_id: ch.id,
      sort_order: ch.sort_order,
      title: ch.title,
      section_type: ch.section_type,
      content: ch.content,
      word_count: ch.word_count,
      status: ch.status,
    }));
    await admin.from("snapshot_chapters").insert(snapshotChapters);
    console.log(`  Snapshot created with ${totalWords} total words`);
  }

  // 14. Verify
  console.log("\n=== Verification ===");
  const counts = await Promise.all([
    admin.from("chapters").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("scenes").select("id", { count: "exact", head: true }),
    admin.from("characters").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("threads").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("locations").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("codex_entries").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("acts").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("inspiration_items").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    admin.from("snapshots").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);

  const labels = ["chapters", "scenes", "characters", "threads", "locations", "codex", "acts", "inspiration", "snapshots"];
  for (let i = 0; i < labels.length; i++) {
    console.log(`  ${labels[i]}: ${counts[i].count}`);
  }
  console.log(`  total words: ${totalWords}`);

  console.log("\n=== Migration Complete ===");
  console.log(`Project ID: ${projectId}`);
  console.log(`User email: ${USER_EMAIL}`);
  console.log(`Password:   ${password ?? "(existing user)"}`);
  console.log(`\nOriginal files at ${SARRE_PATH} are UNTOUCHED.`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

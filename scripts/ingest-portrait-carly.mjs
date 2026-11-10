import { readdir, readFile, open, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { parseBookkit } from '../src/lib/bookkit.ts';

const dir = resolve(process.argv[2] ?? '/Users/dominik/Development/writing/carly/portrait');
const host = process.env.SUPABASE_DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
const sql = postgres({
  host,
  port: 5432,
  user: process.env.SUPABASE_DB_USER || 'postgres.eujclkjaaqeoxcodwwxq',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: 'require',
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const CHUNK_SIZE = 8 * 1024 * 1024;
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function walk(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (['.git', '.DS_Store', '__pycache__', 'node_modules', '.vale', 'inspiration'].includes(e.name) || e.name.endsWith('.pyc')) {
      if (e.name === '.vale') {
        // Include .vale/styles/config/vocabularies but skip .vale/generated
        const valeFiles = await walk(join(rootDir, e.name));
        files.push(...valeFiles.filter((f) => !f.includes('/.vale/generated/')));
      }
      continue;
    }
    if (e.isDirectory()) files.push(...(await walk(join(rootDir, e.name))));
    else if (e.isFile()) files.push(join(rootDir, e.name));
  }
  return files;
}

const MOOD_BOARD_ITEMS = [
  {
    sourceFile: '/Users/dominik/Development/writing/carly/portrait/inspiration/08-bronzino-portrait-of-a-young-man-1530s.jpg',
    fileName: '08-bronzino-portrait-of-a-young-man-1530s.jpg',
    label: 'Agnolo Bronzino — Portrait of a Young Man (1530s, The Met)',
    notes: 'Florentine Mannerism (c. 1530s, The Metropolitan Museum of Art): an aristocratic youth in black silk holding his place in a book with cool, polite, unreadable self-possession — the psychological archetype of the guarded heir at Institut Les Mélèzes.',
    tags: ['art', 'mannerism', 'renaissance', 'bronzino', 'portrait', 'heir', 'mb:x=16,y=16,w=310,z=11'],
  },
  {
    sourceFile: '/Users/dominik/Development/writing/carly/portrait/inspiration/07-young-nero-marble-bust-palatino-c50ad.jpg',
    fileName: '07-young-nero-marble-bust-palatino-c50ad.jpg',
    label: 'Portrait Bust of the Young Nero (c. 50–54 AD, Museo Palatino)',
    notes: 'Roman Imperial Antiquity (Julio-Claudian marble, c. 50–54 AD, Museo Palatino, Rome): carved when Nero was a teenage heir studying under Seneca before ascending to absolute rule — echoing both the novel’s title and the white-marble monuments of the capital.',
    tags: ['art', 'antiquity', 'roman', 'sculpture', 'marble', 'heir', 'mb:x=350,y=16,w=290,z=10'],
  },
  {
    sourceFile: '/Users/dominik/Development/writing/carly/portrait/inspiration/09-velazquez-prince-baltasar-carlos-1635.jpg',
    fileName: '09-velazquez-prince-baltasar-carlos-1635.jpg',
    label: 'Diego Velázquez — Prince Baltasar Carlos on Horseback (c. 1635, Prado)',
    notes: 'Spanish Golden Age Baroque (1634–1635, Museo Nacional del Prado): the young dynastic heir mounted on a rearing royal stallion against snow-capped mountains, already carrying the marshal’s baton and stagecraft of absolutist succession.',
    tags: ['art', 'baroque', 'velazquez', 'dynasty', 'succession', 'horse', 'mb:x=664,y=16,w=320,z=9'],
  },
  {
    sourceFile: '/Users/dominik/Development/writing/carly/portrait/inspiration/10-vereshchagin-doors-of-tamerlane-1872.jpg',
    fileName: '10-vereshchagin-doors-of-tamerlane-1872.jpg',
    label: 'Vasily Vereshchagin — The Doors of Tamerlane (1872, Tretyakov Gallery)',
    notes: '19th-Century Realism, Turkestan Series (1872, State Tretyakov Gallery, Moscow): two armed palace sentries guarding the towering, closed sanctuary doors of Timur (Tamerlane) — the historical namesake of General Teymur and the guarded palace thresholds of Part II.',
    tags: ['art', 'realism', '19th-century', 'vereshchagin', 'timur', 'palace', 'central-asia', 'mb:x=1008,y=16,w=310,z=8'],
  },
  {
    sourceFile: '/Users/dominik/Development/writing/carly/portrait/inspiration/11-hodler-eiger-monch-jungfrau-moonlight-1908.jpg',
    fileName: '11-hodler-eiger-monch-jungfrau-moonlight-1908.jpg',
    label: 'Ferdinand Hodler — Eiger, Mönch and Jungfrau in Moonlight (1908)',
    notes: 'Early 20th-Century Swiss Symbolism / Modernism (1908, oil on canvas): Hodler’s nocturnal vision of the Bernese Oberland peaks rising above a sea of Alpine night fog — the exact Swiss massif overlooking the boarding school and the avalanche ridge.',
    tags: ['art', 'symbolism', 'modernism', 'hodler', 'switzerland', 'alps', 'mb:x=350,y=430,w=340,z=7'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/01_swiss_boarding_school_cover_1794230698678.jpg',
    fileName: '01-institut-les-melezes-twilight.jpg',
    label: 'Institut Les Mélèzes at twilight',
    notes: 'The Belle Époque boarding school château above the Rhone valley in December mist — warm library windows against snow-covered larches and the high Valais Alps.',
    tags: ['cover', 'cover-dark', 'setting', 'switzerland', 'school', 'atmosphere', 'mb:x=16,y=450,w=310,z=6'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/02_alpine_avalanche_slope_1794230713825.jpg',
    fileName: '02-col-des-chamois-christmas-morning.jpg',
    label: 'The Col des Chamois avalanche bowl',
    notes: 'Chapter 6 ("2001"): Christmas morning above the tree line. Two solitary ski tracks cutting across the wind-loaded powder slab before the fracture line gives way.',
    tags: ['avalanche', 'chapter-6', 'alps', 'turning-point', 'mb:x=714,y=430,w=280,z=2'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/03_discman_and_mix_cds_1999_1794230730313.jpg',
    fileName: '03-discman-and-sharpie-mix-cds-1999.jpg',
    label: '1999 Sony Discman & Sharpie CD-Rs',
    notes: 'Room 304 desk in Belvédère House: the shared language of American West Coast hip-hop ("The Chronic 2001", "Marshall Mathers", "All Eyez on Me") that bridges Boston and the palace.',
    tags: ['1999', 'music', 'soundtrack', 'objects', 'dormitory', 'mb:x=1018,y=430,w=300,z=3'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/04_white_marble_capital_1794230746461.jpg',
    fileName: '04-white-marble-capital-boulevard.jpg',
    label: 'The white-marble capital at dusk',
    notes: 'Chapter 8 ("California Love"): eight-lane ceremonial boulevards, gold-leaf domes, ministerial colonnades, and desert heat shimmering at the edge of the monumental city.',
    tags: ['capital', 'part-ii', 'architecture', 'state-visit', 'atmosphere', 'mb:x=16,y=830,w=340,z=4'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/05_palace_banquet_stage_1794230764378.jpg',
    fileName: '05-summer-palace-private-concert.jpg',
    label: 'The private concert in the banquet hall',
    notes: 'Chapter 9 ("Gangsta\'s Paradise"): crystal chandeliers, gold-rimmed porcelain, and a lone microphone stand in blue stage haze for an American rapper flown in for an audience of two teenagers.',
    tags: ['palace', 'chapter-9', 'coolio', 'spectacle', 'mb:x=380,y=810,w=340,z=5'],
  },
  {
    sourceFile: '/Users/dominik/.gemini/antigravity-cli/brain/1a9d5668-0b86-4176-ae2c-6c88607c60d0/06_adidas_holdall_zurich_1794230782655.jpg',
    fileName: '06-three-stripe-holdall-room-304.jpg',
    label: 'The black holdall on the parquet floor',
    notes: 'Chapter 11 ("Mo Money Mo Problems"): the scuffed three-stripe sports bag returned from Paradeplatz with purple CHF 1,000 banknotes banded in white paper.',
    tags: ['zurich', 'chapter-11', 'objects', 'complicity', 'mb:x=744,y=790,w=310,z=1'],
  },
];

try {
  const users = await sql`select id, email from auth.users order by created_at`;
  const profiles = await sql`select id, email, display_name from public.profiles`;
  const libraries = await sql`select id, slug, name, owner_id, owner_email from public.libraries order by created_at`;
  console.log('Users:', users);
  console.log('Libraries:', libraries);

  const domUser = users.find((u) => u.email === 'dottenbr@me.com');
  const carlyUser = users.find((u) => u.email?.toLowerCase().includes('carly'));
  if (!carlyUser) throw new Error('Carly user account not found in auth.users');

  // Set Carly's display name to Carly Kaloustian Ottenbreit if currently empty or email-derived
  await sql`
    update public.profiles
    set display_name = 'Carly Kaloustian Ottenbreit'
    where id = ${carlyUser.id}
      and (display_name is null or display_name = '' or display_name = 'carly.ottenbreit' or display_name ilike 'carly%')
  `;

  // Find or create Carly's library
  let carlyLib = libraries.find(
    (l) => l.owner_id === carlyUser.id || l.slug === 'carly' || l.owner_email?.toLowerCase() === carlyUser.email.toLowerCase()
  );
  if (!carlyLib) {
    [carlyLib] = await sql`
      insert into public.libraries (slug, name, owner_id, created_by)
      values ('carly', 'Carly’s Library', ${carlyUser.id}, ${carlyUser.id})
      returning id, slug, name, owner_id, owner_email
    `;
  } else if (carlyLib.owner_id !== carlyUser.id) {
    [carlyLib] = await sql`
      update public.libraries
      set owner_id = ${carlyUser.id}, owner_email = null
      where id = ${carlyLib.id}
      returning id, slug, name, owner_id, owner_email
    `;
  }

  // Ensure Carly's library has a Fiction shelf
  let [fictionShelf] = await sql`
    select id, name from public.shelves
    where library_id = ${carlyLib.id} and lower(name) = 'fiction'
    limit 1
  `;
  if (!fictionShelf) {
    [fictionShelf] = await sql`
      insert into public.shelves (library_id, name, position)
      values (${carlyLib.id}, 'Fiction', 0)
      returning id, name
    `;
  }

  // Ensure Dom is a coauthor on Carly's library so he can view/collaborate seamlessly
  if (domUser) {
    await sql`
      insert into public.library_members (library_id, user_id, role)
      values (${carlyLib.id}, ${domUser.id}, 'coauthor')
      on conflict (library_id, user_id) do update set role = 'coauthor'
    `;
  }

  // Walk and parse Portrait bookkit files
  const allPaths = await walk(dir);
  const textPaths = allPaths.filter((p) => /\.(md|yaml|yml|json|bib|txt)$/.test(p));
  const files = Object.fromEntries(
    await Promise.all(textPaths.map(async (p) => [relative(dir, p), await readFile(p, 'utf8')]))
  );
  const book = parseBookkit(files);
  const bookSlug = 'carly/portrait';

  let projectId;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(78210612)`;
    await tx`select set_config('app.skip_activity', 'on', true)`;

    const [existing] = await tx`
      select id from public.projects
      where bookkit_slug = ${bookSlug}
         or (library_id = ${carlyLib.id} and name = ${book.config.title})
      limit 1
    `;

    if (existing) {
      projectId = existing.id;
      await tx`
        update public.projects
        set owner_id = ${carlyUser.id},
            name = ${book.config.title},
            brief_title = ${book.config.title},
            brief_target_word_count = 80000,
            bookkit_slug = ${bookSlug},
            bookkit_import_complete = true,
            library_id = ${carlyLib.id},
            shelf_id = ${fictionShelf.id},
            private = false
        where id = ${projectId}
      `;
    } else {
      const [inserted] = await tx`
        insert into public.projects (
          owner_id, name, brief_title, brief_target_word_count,
          bookkit_slug, bookkit_import_complete, library_id, shelf_id, private
        )
        values (
          ${carlyUser.id}, ${book.config.title}, ${book.config.title}, 80000,
          ${bookSlug}, true, ${carlyLib.id}, ${fictionShelf.id}, false
        )
        returning id
      `;
      projectId = inserted.id;
      await tx`insert into public.project_settings(project_id) values (${projectId}) on conflict do nothing`;
      await tx`insert into public.llm_settings(project_id) values (${projectId}) on conflict do nothing`;
    }

    await tx`
      insert into public.project_members (project_id, user_id, role, accepted_at)
      values (${projectId}, ${carlyUser.id}, 'owner', now())
      on conflict (project_id, user_id) do update set role = 'owner', accepted_at = now()
    `;
    if (domUser) {
      await tx`
        insert into public.project_members (project_id, user_id, role, accepted_at)
        values (${projectId}, ${domUser.id}, 'coauthor', now())
        on conflict (project_id, user_id) do update set role = 'coauthor', accepted_at = now()
      `;
    }

    await tx`
      insert into public.export_configs (project_id, author)
      values (${projectId}, ${book.config.author ?? 'Carly Kaloustian Ottenbreit'})
      on conflict (project_id) do update set author = excluded.author
    `;

    // Upsert all bookkit_documents
    const docs = await Promise.all(
      book.documents.map(async (d) => {
        const info = await stat(join(dir, d.path));
        return {
          project_id: projectId,
          path: d.path,
          content: d.raw,
          source_sha256: sha(d.raw),
          unix_mode: info.mode,
        };
      })
    );

    const validPaths = docs.map((d) => d.path);
    await tx`
      delete from public.bookkit_documents
      where project_id = ${projectId}
        and not (path = any(${validPaths}))
    `;

    for (const d of docs) {
      await tx`
        insert into public.bookkit_documents (project_id, path, content, source_sha256, unix_mode)
        values (${d.project_id}, ${d.path}, ${d.content}, ${d.source_sha256}, ${d.unix_mode})
        on conflict (project_id, path) do update
        set content = excluded.content,
            source_sha256 = excluded.source_sha256,
            unix_mode = excluded.unix_mode
      `;
    }
  });

  // Upload binary assets (such as publication/source-assets/cover.png) to bookkit-assets
  const assetBucket = supabase.storage.from('bookkit-assets');
  const docPathSet = new Set(book.documents.map((d) => d.path));
  const binaryFiles = allPaths.filter((f) => !docPathSet.has(relative(dir, f)));
  for (const file of binaryFiles) {
    const relPath = relative(dir, file);
    const info = await stat(file);
    const handle = await open(file, 'r');
    const chunks = [];
    const hash = createHash('sha256');
    try {
      for (let offset = 0; offset < info.size; offset += CHUNK_SIZE) {
        const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, info.size - offset));
        let filled = 0;
        while (filled < buffer.length) {
          const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, offset + filled);
          if (!bytesRead) break;
          filled += bytesRead;
        }
        hash.update(buffer);
        const chunkHash = sha(buffer);
        const key = `${projectId}/${chunkHash}`;
        const upload = await assetBucket.upload(key, buffer, {
          contentType: 'application/octet-stream',
          upsert: false,
        });
        if (
          upload.error &&
          !['409', 'Duplicate'].includes(String(upload.error.statusCode)) &&
          !/already exists/i.test(upload.error.message)
        ) {
          throw upload.error;
        }
        chunks.push({ sha256: chunkHash, size: buffer.length });
      }
    } finally {
      await handle.close();
    }
    const digest = hash.digest('hex');
    await sql`
      insert into public.bookkit_assets (project_id, path, size_bytes, sha256, unix_mode, chunks, is_directory)
      values (${projectId}, ${relPath}, ${info.size}, ${digest}, ${info.mode}, ${sql.json(chunks)}, false)
      on conflict (project_id, path) do update
      set size_bytes = excluded.size_bytes,
          sha256 = excluded.sha256,
          unix_mode = excluded.unix_mode,
          chunks = excluded.chunks
    `;
  }

  // Upload the 6 Mood Board images to the `inspiration` bucket and upsert into `public.inspiration_items`
  const inspBucket = supabase.storage.from('inspiration');
  await sql`delete from public.inspiration_items where project_id = ${projectId}`;
  for (let i = 0; i < MOOD_BOARD_ITEMS.length; i++) {
    const item = MOOD_BOARD_ITEMS[i];
    const bytes = await readFile(item.sourceFile);
    const storageKey = `${projectId}/${item.fileName}`;
    const up = await inspBucket.upload(storageKey, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (up.error) throw up.error;
    const addedAt = new Date(Date.now() - (MOOD_BOARD_ITEMS.length - i) * 60000).toISOString();
    await sql`
      insert into public.inspiration_items (
        id, project_id, file_name, storage_path, label, notes, tags, added_at
      )
      values (
        gen_random_uuid(),
        ${projectId},
        ${item.fileName},
        ${storageKey},
        ${item.label},
        ${item.notes},
        ${item.tags},
        ${addedAt}
      )
    `;
  }

  // Verify workspace output for Dom and Carly
  const verifyAs = async (uid) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      return tx`
        select name, role, owner_name, author_words, draft_words, chapters_total, chapters_written, target_words, library_id
        from public.bookkit_workspace()
        order by name
      `;
    });

  console.log('\n--- Workspace for Carly ---');
  console.table(await verifyAs(carlyUser.id));

  if (domUser) {
    console.log('\n--- Workspace for Dom ---');
    console.table(await verifyAs(domUser.id));
  }

  console.log(
    JSON.stringify({
      status: 'ok',
      projectId,
      librarySlug: carlyLib.slug,
      documents: book.documents.length,
      chapters: book.chapters.length,
      moodBoardItems: MOOD_BOARD_ITEMS.length,
    })
  );
} finally {
  await sql.end();
}

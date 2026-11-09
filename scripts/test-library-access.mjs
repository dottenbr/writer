// Library access checks against the live database, as two disposable users.
// Usage: node --env-file=.env.server.local scripts/test-library-access.mjs <ownerUserId> <otherUserId>
// (create both users first; the script removes the library and book it makes).
import postgres from 'postgres';
const [A, B] = process.argv.slice(2);
const sql = postgres({host:process.env.SUPABASE_DB_HOST ?? 'aws-0-eu-west-1.pooler.supabase.com', port:5432, user:process.env.SUPABASE_DB_USER ?? 'postgres.eujclkjaaqeoxcodwwxq', password:process.env.SUPABASE_DB_PASSWORD, database:'postgres', ssl:'require', max:1, onnotice: () => {}});
const as = async (uid, fn) => sql.begin(async tx => { await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated' })}, true)`; await tx`set local role authenticated`; return fn(tx); });
const ok = (label, cond) => console.log(cond ? 'PASS' : 'FAIL', label);
const lib = await as(A, async tx => (await tx`insert into libraries (slug, name, owner_id, created_by) values (${'qa-' + A.slice(0, 8)}, 'QA Library', ${A}, ${A}) returning id`)[0].id);
const shelf = await as(A, async tx => (await tx`insert into shelves (library_id, name) values (${lib}, 'Fiction') returning id`)[0].id);
const book = await as(A, async tx => (await tx`insert into projects (owner_id, name, library_id, shelf_id) values (${A}, 'QA Book', ${lib}, ${shelf}) returning id`)[0].id);
await as(A, tx => tx`insert into bookkit_documents (project_id, path, content, source_sha256) values (${book}, 'manuscript/01-a.md', 'Hello world', 'qa')`);
ok('stranger B cannot see the library or book', await as(B, async tx => (await tx`select count(*)::int n from libraries where id=${lib}`)[0].n === 0 && (await tx`select count(*)::int n from projects where id=${book}`)[0].n === 0));
ok('B cannot add itself as a member', await as(B, tx => tx`insert into library_members (library_id, user_id, role) values (${lib}, ${B}, 'coauthor')`).then(() => false, () => true));
await as(A, tx => tx`insert into library_members (library_id, user_id, role) values (${lib}, ${B}, 'viewer')`);
ok('reader B sees the library, the book and its text', await as(B, async tx => (await tx`select count(*)::int n from projects where id=${book}`)[0].n === 1 && (await tx`select count(*)::int n from bookkit_documents where project_id=${book}`)[0].n === 1));
ok('reader B cannot edit the text', await as(B, async tx => (await tx`update bookkit_documents set content='hacked' where project_id=${book} returning 1`).length === 0));
ok('reader B cannot add a shelf', await as(B, tx => tx`insert into shelves (library_id, name) values (${lib}, 'X')`).then(() => false, () => true));
ok('reader B cannot make the book private', await as(B, tx => tx`update projects set private=true where id=${book} returning 1`).then(r => r.length === 0, () => true));
await as(A, tx => tx`update projects set private=true where id=${book}`);
ok('private book is hidden from library reader B', await as(B, async tx => (await tx`select count(*)::int n from projects where id=${book}`)[0].n === 0));
await as(A, tx => tx`update projects set private=false where id=${book}`);
await as(A, tx => tx`update library_members set role='editor' where library_id=${lib} and user_id=${B}`);
ok('editor B has editor access (suggests changes; only owners write directly)', await as(B, async tx => (await tx`select public.has_project_access(${book}, 'editor') a`)[0].a === true && (await tx`select public.has_project_access(${book}, 'owner') a`)[0].a === false));
ok('editor B cannot delete the book', await as(B, async tx => (await tx`delete from projects where id=${book} returning 1`).length === 0));
ok('editor B cannot move the book between shelves (not co-author)', await as(B, tx => tx`update projects set shelf_id=null where id=${book}`).then(() => false, () => true));
await as(A, tx => tx`update library_members set role='coauthor' where library_id=${lib} and user_id=${B}`);
ok('co-author B can move books between shelves', await as(B, tx => tx`update projects set shelf_id=null where id=${book}`).then(() => true, e => (console.log(e.message), false)));
ok('co-author B can add shelves', await as(B, tx => tx`insert into shelves (library_id, name) values (${lib}, 'Poetry')`).then(() => true, () => false));
ok('co-author B cannot rename the library', await as(B, async tx => (await tx`update libraries set name='Mine' where id=${lib} returning 1`).length === 0));
ok('owner A cannot change the owner', await as(A, tx => tx`update libraries set owner_id=${B} where id=${lib}`).then(() => false, () => true));
const ws = await as(B, tx => tx`select project_id, role, library_id from bookkit_workspace() where project_id=${book}`);
ok(`workspace shows B the book as ${ws[0]?.role}`, ws.length === 1 && ws[0].role === 'coauthor');
const libs = await as(B, tx => tx`select role, jsonb_array_length(members) m, jsonb_array_length(invitations) i from bookkit_libraries() where id=${lib}`);
ok(`B's library role ${libs[0]?.role}, sees members, no invitations`, libs[0]?.role === 'coauthor' && libs[0].i === 0);
// pending library claimed on sign-in
const pend = (await sql`insert into libraries (slug, name, owner_email, created_by) values (${'qp-' + B.slice(0, 8)}, 'Pending', (select lower(email) from auth.users where id=${B}), ${A}) returning id`)[0].id;
ok('creator A manages the pending library', await as(A, async tx => (await tx`select public.library_role(${pend}) r`)[0].r === 'owner'));
await as(B, tx => tx`select public.accept_project_invitations()`);
ok('B claimed the pending library on sign-in; A stays an editor', await as(B, async tx => (await tx`select public.library_role(${pend}) r`)[0].r === 'owner') && await as(A, async tx => (await tx`select public.library_role(${pend}) r`)[0].r === 'editor'));
await sql`delete from projects where id=${book}`; await sql`delete from libraries where id in (${lib}, ${pend})`;
await sql.end();

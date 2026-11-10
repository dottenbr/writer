-- 00040_document_titles.sql
-- A document's title without its content, for the file list: research files are
-- fetched only on demand (they can hold megabytes of OCR), so until one is opened
-- the app only knew its file name and showed "aelfric" for “Ælfric”.
-- PostgREST exposes this as a computed column: select=path,version,doc_title.
-- The title is what the app takes from a loaded file (markdown-doc.ts splitDocument):
-- the first `# ` heading after the front matter, else the front matter's `title:`.
-- Only Markdown files have one (a YAML file's `# comment` is not a title).

create or replace function public.doc_title(d public.bookkit_documents) returns text
language sql stable parallel safe as $$
  with head as (
    select regexp_replace(left(coalesce(d.content, ''), 2000), '\r\n', E'\n', 'g') as s
  ), parts as (
    select
      case when s ~ '^---\n' and strpos(substr(s, 4), E'\n---') > 0
        then substr(s, 4, strpos(substr(s, 4), E'\n---')) else '' end as fm,
      case when s ~ '^---\n' and strpos(substr(s, 4), E'\n---') > 0
        then substr(s, strpos(substr(s, 4), E'\n---') + 7) else s end as body
    from head
  )
  select nullif(btrim(coalesce(
    nullif(btrim(substring(ltrim(body, E' \t\n') from '^# ([^\n]*)')), ''),
    btrim(substring(fm from '(?n)^title:[ \t]*(.+)$'), E' \t"''')
  )), '')
  from parts
  where d.path ~* '\.md$'
$$;

comment on function public.doc_title(public.bookkit_documents) is
  'Title of a Bookkit document: first # heading after the front matter, else its title: field.';

-- btrim() only trims spaces, so a leading line break counted as one more word.
create or replace function public.bookkit_word_count(t text) returns integer
language sql immutable parallel safe as $$
  select case when x = '' then 0 else coalesce(array_length(regexp_split_to_array(x, '\s+'), 1), 0) end
  from (select regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(coalesce(t, ''), '^---\n.*?\n---\n', ''), '^#[^\n]*$', '', 'gn'),
    '[#>*_`|\[\]()~-]+', ' ', 'g'), '^\s+|\s+$', '', 'g') as x) s
$$;

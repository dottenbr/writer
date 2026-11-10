begin;

create or replace function public.restore_project_snapshot(
  p_project_id uuid,
  p_snapshot_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_project jsonb;
  v_export_config jsonb;
  v_inspiration_items jsonb;
  v_comments jsonb;
  v_acts jsonb;
  v_chapters jsonb;
  v_bible jsonb;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_project_access(p_project_id, 'editor') then
    raise exception 'Insufficient access to restore snapshot';
  end if;

  select s.project_state
    into v_state
  from public.snapshots s
  where s.id = p_snapshot_id
    and s.project_id = p_project_id;

  if v_state is null then
    raise exception 'Snapshot not found for project';
  end if;

  v_project := v_state -> 'project';
  if v_project is null then
    raise exception 'Snapshot project state is missing';
  end if;

  v_export_config := v_state -> 'exportConfig';
  v_inspiration_items := coalesce(v_state -> 'inspirationItems', '[]'::jsonb);
  v_comments := coalesce(v_state -> 'comments', '[]'::jsonb);
  v_acts := coalesce(v_project -> 'acts', '[]'::jsonb);
  v_chapters := coalesce(v_project -> 'chapters', '[]'::jsonb);
  v_bible := coalesce(v_project -> 'bible', '{}'::jsonb);

  update public.projects
  set
    name = coalesce(v_project ->> 'name', name),
    brief_title = coalesce(v_project #>> '{brief,title}', ''),
    brief_subtitle = coalesce(v_project #>> '{brief,subtitle}', ''),
    brief_genre = coalesce(v_project #>> '{brief,genre}', ''),
    brief_logline = coalesce(v_project #>> '{brief,logline}', ''),
    brief_themes = coalesce(
      array(select jsonb_array_elements_text(coalesce(v_project #> '{brief,themes}', '[]'::jsonb))),
      '{}'::text[]
    ),
    brief_synopsis = coalesce(v_project #>> '{brief,synopsis}', ''),
    brief_target_word_count = coalesce((v_project #>> '{brief,targetWordCount}')::integer, 80000),
    brief_writing_style = coalesce(v_project #>> '{brief,writingStyle}', ''),
    brief_audience = coalesce(v_project #>> '{brief,audience}', ''),
    brief_comparable_titles = coalesce(v_project #>> '{brief,comparableTitles}', ''),
    brief_notes = coalesce(v_project #>> '{brief,notes}', ''),
    general_notes = coalesce(v_project ->> 'generalNotes', '')
  where id = p_project_id;

  insert into public.project_settings (
    project_id,
    font_family,
    font_size,
    line_height,
    dark_mode
  )
  values (
    p_project_id,
    coalesce(v_project #>> '{settings,fontFamily}', 'Source Serif 4'),
    coalesce((v_project #>> '{settings,fontSize}')::integer, 18),
    coalesce((v_project #>> '{settings,lineHeight}')::real, 1.8),
    coalesce((v_project #>> '{settings,darkMode}')::boolean, false)
  )
  on conflict (project_id) do update set
    font_family = excluded.font_family,
    font_size = excluded.font_size,
    line_height = excluded.line_height,
    dark_mode = excluded.dark_mode;

  if v_export_config is not null then
    insert into public.export_configs (
      project_id,
      act_headings,
      chapter_headings,
      scene_headings,
      scene_separator,
      title_page,
      author,
      word_count_on_title,
      font_family,
      font_size,
      line_spacing,
      paragraph_style,
      page_format,
      exclude_non_chapters,
      export_format,
      preset
    )
    values (
      p_project_id,
      coalesce((v_export_config ->> 'actHeadings')::boolean, false),
      coalesce((v_export_config ->> 'chapterHeadings')::boolean, true),
      coalesce((v_export_config ->> 'sceneHeadings')::boolean, false),
      coalesce(v_export_config ->> 'sceneSeparator', '* * *'),
      coalesce((v_export_config ->> 'titlePage')::boolean, true),
      coalesce(v_export_config ->> 'author', ''),
      coalesce((v_export_config ->> 'wordCountOnTitle')::boolean, true),
      coalesce(v_export_config ->> 'fontFamily', 'Times New Roman'),
      coalesce((v_export_config ->> 'fontSize')::integer, 12),
      coalesce((v_export_config ->> 'lineSpacing')::real, 2.0),
      coalesce(v_export_config ->> 'paragraphStyle', 'indent'),
      coalesce(v_export_config ->> 'pageFormat', 'letter'),
      coalesce((v_export_config ->> 'excludeNonChapters')::boolean, true),
      coalesce(v_export_config ->> 'exportFormat', 'pdf'),
      coalesce(v_export_config ->> 'preset', 'manuscript')
    )
    on conflict (project_id) do update set
      act_headings = excluded.act_headings,
      chapter_headings = excluded.chapter_headings,
      scene_headings = excluded.scene_headings,
      scene_separator = excluded.scene_separator,
      title_page = excluded.title_page,
      author = excluded.author,
      word_count_on_title = excluded.word_count_on_title,
      font_family = excluded.font_family,
      font_size = excluded.font_size,
      line_spacing = excluded.line_spacing,
      paragraph_style = excluded.paragraph_style,
      page_format = excluded.page_format,
      exclude_non_chapters = excluded.exclude_non_chapters,
      export_format = excluded.export_format,
      preset = excluded.preset;
  end if;

  delete from public.inspiration_items where project_id = p_project_id;
  insert into public.inspiration_items (id, project_id, file_name, storage_path, label, tags, notes, added_at)
  select
    coalesce((item ->> 'id')::uuid, gen_random_uuid()),
    p_project_id,
    coalesce(item ->> 'fileName', ''),
    p_project_id::text || '/' || coalesce(item ->> 'fileName', ''),
    coalesce(item ->> 'label', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'tags', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'notes', ''),
    coalesce((item ->> 'addedAt')::timestamptz, now())
  from jsonb_array_elements(v_inspiration_items) item;

  delete from public.comments where project_id = p_project_id;
  delete from public.codex_entries where project_id = p_project_id;
  delete from public.locations where project_id = p_project_id;
  delete from public.threads where project_id = p_project_id;
  delete from public.characters where project_id = p_project_id;
  delete from public.chapters where project_id = p_project_id;
  delete from public.acts where project_id = p_project_id;

  insert into public.acts (id, project_id, label, sort_order)
  select
    (item ->> 'id')::uuid,
    p_project_id,
    coalesce(item ->> 'label', ''),
    ordinality - 1
  from jsonb_array_elements(v_acts) with ordinality as arr(item, ordinality);

  insert into public.chapters (
    id,
    project_id,
    act_id,
    sort_order,
    section_type,
    title,
    summary,
    content,
    notes,
    word_count,
    status,
    dial_words,
    dial_lyricism,
    dial_dialogue,
    dial_metaphor,
    dial_pacing,
    dial_humour,
    dial_texture,
    dial_clarity,
    version,
    updated_at
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    nullif(item ->> 'act', '')::uuid,
    coalesce((item ->> 'number')::integer, ordinality)::integer - 1,
    coalesce((item ->> 'sectionType')::public.section_type, 'chapter'::public.section_type),
    coalesce(item ->> 'title', ''),
    coalesce(item ->> 'summary', ''),
    coalesce(item ->> 'content', ''),
    coalesce(item ->> 'notes', ''),
    coalesce((item ->> 'wordCount')::integer, 0),
    coalesce((item ->> 'status')::public.chapter_status, 'outline'::public.chapter_status),
    coalesce((item #>> '{writingDials,words}')::integer, 3000),
    coalesce((item #>> '{writingDials,lyricism}')::integer, 2),
    coalesce((item #>> '{writingDials,dialogue}')::integer, 2),
    coalesce((item #>> '{writingDials,metaphor}')::integer, 2),
    coalesce((item #>> '{writingDials,pacing}')::integer, 2),
    coalesce((item #>> '{writingDials,humour}')::integer, 1),
    coalesce((item #>> '{writingDials,texture}')::integer, 2),
    coalesce((item #>> '{writingDials,clarity}')::integer, 2),
    coalesce((item ->> 'version')::integer, 1),
    coalesce((item ->> 'updatedAt')::timestamptz, now())
  from jsonb_array_elements(v_chapters) with ordinality as arr(item, ordinality);

  insert into public.scenes (
    id,
    chapter_id,
    sort_order,
    title,
    summary,
    pov,
    location,
    characters,
    notes,
    word_target
  )
  select
    (scene ->> 'id')::uuid,
    (chapter_item ->> 'id')::uuid,
    scene_ordinality - 1,
    coalesce(scene ->> 'title', ''),
    coalesce(scene ->> 'summary', ''),
    coalesce(scene ->> 'pov', ''),
    coalesce(scene ->> 'location', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(scene -> 'characters', '[]'::jsonb))), '{}'::text[]),
    coalesce(scene ->> 'notes', ''),
    coalesce((scene ->> 'wordTarget')::integer, 1500)
  from jsonb_array_elements(v_chapters) as chapter_arr(chapter_item)
  cross join lateral jsonb_array_elements(coalesce(chapter_item -> 'scenes', '[]'::jsonb)) with ordinality as scene_arr(scene, scene_ordinality);

  insert into public.characters (
    id,
    project_id,
    name,
    also_known_as,
    role,
    age,
    description,
    backstory,
    motivation,
    arc,
    personality,
    strengths,
    weaknesses,
    internal_conflict,
    physical_presence,
    knows,
    believes,
    conceals,
    blind_spots,
    fears,
    hopes,
    drafting_note,
    notes
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    coalesce(item ->> 'name', 'New Character'),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'alsoKnownAs', '[]'::jsonb))), '{}'::text[]),
    coalesce((item ->> 'role')::public.character_role, 'supporting'::public.character_role),
    coalesce(item ->> 'age', ''),
    coalesce(item ->> 'description', ''),
    coalesce(item ->> 'backstory', ''),
    coalesce(item ->> 'motivation', ''),
    coalesce(item ->> 'arc', ''),
    coalesce(item ->> 'personality', ''),
    coalesce(item ->> 'strengths', ''),
    coalesce(item ->> 'weaknesses', ''),
    coalesce(item ->> 'internalConflict', ''),
    coalesce(item ->> 'physicalPresence', ''),
    coalesce(item ->> 'knows', ''),
    coalesce(item ->> 'believes', ''),
    coalesce(item ->> 'conceals', ''),
    coalesce(item ->> 'blindSpots', ''),
    coalesce(item ->> 'fears', ''),
    coalesce(item ->> 'hopes', ''),
    coalesce(item ->> 'draftingNote', ''),
    coalesce(item ->> 'notes', '')
  from jsonb_array_elements(coalesce(v_bible -> 'characters', '[]'::jsonb)) item;

  insert into public.character_relationships (
    id,
    character_id,
    with_character_id,
    type,
    description
  )
  select
    (rel ->> 'id')::uuid,
    (character_item ->> 'id')::uuid,
    (rel ->> 'withCharacterId')::uuid,
    coalesce((rel ->> 'type')::public.relationship_type, 'other'::public.relationship_type),
    coalesce(rel ->> 'description', '')
  from jsonb_array_elements(coalesce(v_bible -> 'characters', '[]'::jsonb)) as char_arr(character_item)
  cross join lateral jsonb_array_elements(coalesce(character_item -> 'relationships', '[]'::jsonb)) rel
  where nullif(rel ->> 'withCharacterId', '') is not null;

  insert into public.threads (
    id,
    project_id,
    name,
    also_known_as,
    type,
    timeframe,
    description,
    chapters,
    historical_anchors,
    continuity_checks,
    sources,
    resolution,
    notes
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    coalesce(item ->> 'name', 'New Thread'),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'alsoKnownAs', '[]'::jsonb))), '{}'::text[]),
    coalesce((item ->> 'type')::public.thread_type, 'subplot'::public.thread_type),
    coalesce(item ->> 'timeframe', ''),
    coalesce(item ->> 'description', ''),
    coalesce(array(select (jsonb_array_elements(coalesce(item -> 'chapters', '[]'::jsonb))::text)::integer), '{}'::integer[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'historicalAnchors', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'continuityChecks', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'sources', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'resolution', ''),
    coalesce(item ->> 'notes', '')
  from jsonb_array_elements(coalesce(v_bible -> 'threads', '[]'::jsonb)) item;

  insert into public.locations (
    id,
    project_id,
    name,
    also_known_as,
    timeframe,
    geo_context,
    description,
    historical_context,
    significance,
    sensory_details,
    sources,
    notes
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    coalesce(item ->> 'name', 'New Location'),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'alsoKnownAs', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'timeframe', ''),
    coalesce(item ->> 'geoContext', ''),
    coalesce(item ->> 'description', ''),
    coalesce(item ->> 'historicalContext', ''),
    coalesce(item ->> 'significance', ''),
    coalesce(item ->> 'sensoryDetails', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'sources', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'notes', '')
  from jsonb_array_elements(coalesce(v_bible -> 'locations', '[]'::jsonb)) item;

  insert into public.codex_entries (
    id,
    project_id,
    entry_type,
    category,
    name,
    also_known_as,
    timeframe,
    sources,
    content
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    coalesce((item ->> 'entryType')::public.codex_entry_type, 'term'::public.codex_entry_type),
    coalesce(item ->> 'category', 'General'),
    coalesce(item ->> 'name', 'New Entry'),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'alsoKnownAs', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'timeframe', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(item -> 'sources', '[]'::jsonb))), '{}'::text[]),
    coalesce(item ->> 'content', '')
  from jsonb_array_elements(coalesce(v_bible -> 'codex', '[]'::jsonb)) item;

  insert into public.comments (
    id,
    project_id,
    chapter_id,
    author_id,
    text,
    quoted_text,
    created_at,
    resolved_at
  )
  select
    (item ->> 'id')::uuid,
    p_project_id,
    (item ->> 'chapter_id')::uuid,
    coalesce((item ->> 'author_id')::uuid, v_user_id),
    coalesce(item ->> 'text', ''),
    coalesce(item ->> 'quoted_text', ''),
    coalesce((item ->> 'created_at')::timestamptz, now()),
    (item ->> 'resolved_at')::timestamptz
  from jsonb_array_elements(v_comments) item;

  insert into public.comment_replies (
    id,
    comment_id,
    author_id,
    text,
    created_at
  )
  select
    (reply ->> 'id')::uuid,
    (comment_item ->> 'id')::uuid,
    coalesce((reply ->> 'author_id')::uuid, v_user_id),
    coalesce(reply ->> 'text', ''),
    coalesce((reply ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(v_comments) as comment_arr(comment_item)
  cross join lateral jsonb_array_elements(coalesce(comment_item -> 'replies', '[]'::jsonb)) reply;
end;
$$;

grant execute on function public.restore_project_snapshot(uuid, uuid) to authenticated;

commit;

create trigger bookkit_asset_activity after insert or update or delete on public.bookkit_assets for each row execute function public.emit_bookkit_activity();

-- 004: Bewerbung — Fragen mit speichern (für DM-Flow + Embed-Rebuild)
alter table public.eghr_applications
  add column if not exists questions jsonb;

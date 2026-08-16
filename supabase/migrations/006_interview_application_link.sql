-- 006: Bewerbung → Interview Verknüpfung
-- Erlaubt es, ein Interview einer Bewerbung zuzuordnen (Button „Interview starten" im Review-Embed).
alter table public.eghr_interviews
  add column if not exists application_id bigint references public.eghr_applications(id) on delete set null;

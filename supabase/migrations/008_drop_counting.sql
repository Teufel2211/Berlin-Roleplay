-- 008: Counting-Modul entfernen (Phase J)
-- Das Counting-Modul wurde nie implementiert. Tabellen und verwaiste Settings-Keys entfernen.
drop table if exists public.eghr_counting_stats;
drop table if exists public.eghr_counting_state;
delete from public.eghr_settings where key like 'counting_%';

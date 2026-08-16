alter table public.eghr_giveaway_participants add column if not exists tickets integer not null default 1;

alter table public.eghr_giveaways add column if not exists ticket_count integer not null default 0;
alter table public.eghr_giveaways add column if not exists marker text not null default '';
alter table public.eghr_giveaways add column if not exists warned boolean not null default false;

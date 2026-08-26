-- 009: Ticket-Embed-Nachricht merken (Claim/Close-Farbe)
alter table public.eghr_tickets add column if not exists panel_message_id text;

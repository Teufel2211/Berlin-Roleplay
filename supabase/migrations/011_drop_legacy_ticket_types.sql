-- 011: Legacy-Ticket-System entfernt – eghr_ticket_types + type_id-Spalte droppen
alter table if exists public.eghr_tickets
  drop column if exists type_id;

drop table if exists public.eghr_ticket_types;

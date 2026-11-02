-- Telefono del dipendente, usato dall'admin per il promemoria WhatsApp "inserisci le ore".
-- Le policy esistenti su profiles bastano: lo vede/modifica solo il dipendente stesso o l'admin.
alter table public.profiles add column if not exists phone text;
